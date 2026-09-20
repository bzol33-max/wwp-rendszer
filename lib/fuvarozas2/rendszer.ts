"use server";

// Fuvarozás 2 — Rendszer-egészség (terv: mobil 11. képernyő, „Rendszer").
//
// Egy kérdésre felel: MEGY-E MINDEN MAGÁTÓL? Minden sor egy figyelő vagy egy
// adatminőségi kapu, „rendben / figyelmeztetés / gond" állapottal és azzal,
// mikor volt utoljára életjel. Ami elromlik, itt látszik — nem a hiányzó
// fuvarból derül ki két nap múlva.
//
// Csak olvas, és minden kérdése olcsó (count/max) — a csempe percenként is
// frissíthető.

import { query } from "@/lib/db";
import { requireAnyViewPermission } from "@/lib/auth/require-permission";

export type EgeszsegAllapot = "rendben" | "figyelmeztetes" | "gond" | "nincs_adat";

export type EgeszsegSor = {
  kulcs: string;
  cim: string;
  allapot: EgeszsegAllapot;
  ertek: string;
  reszlet: string | null;
  /** Mikor volt utoljára életjel (ISO), ha értelmezhető. */
  utoljara: string | null;
};

export type RendszerEgeszseg = { sorok: EgeszsegSor[]; frissitve: string };

function korPerc(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.round((Date.now() - t) / 60000);
}
function kor(perc: number | null): string {
  if (perc === null) return "nincs adat";
  if (perc < 60) return `${perc} perce`;
  if (perc < 60 * 48) return `${Math.round(perc / 60)} órája`;
  return `${Math.round(perc / 1440)} napja`;
}

export async function getRendszerEgeszseg(): Promise<RendszerEgeszseg> {
  await requireAnyViewPermission(["rendszer", "fuvarozas"]);
  const sorok: EgeszsegSor[] = [];

  // 1. Drive-import: mikor dolgozott fel utoljára iratot, és van-e nyitott hiba.
  const [drive] = await query<{ utolso: string | null; hibas: number; ellenorizendo: number }>(
    `select max(frissitve_at)::text as utolso,
       count(*) filter (where verdikt = 'hiba')::int as hibas,
       count(*) filter (where verdikt = 'ellenorizendo')::int as ellenorizendo
     from fuvar_import_naplo where frissitve_at > now() - interval '7 days'`
  );
  const drivePerc = korPerc(drive?.utolso);
  sorok.push({
    kulcs: "drive",
    cim: "Drive-import (fuvarmegbízások)",
    allapot: drivePerc === null ? "nincs_adat" : drivePerc > 60 * 24 ? "figyelmeztetes" : "rendben",
    ertek: kor(drivePerc),
    reszlet: drive ? `7 napban: ${drive.hibas} hibás, ${drive.ellenorizendo} ellenőrizendő irat` : null,
    utoljara: drive?.utolso ?? null,
  });

  // 2. Gmail-figyelő (Apps Script a felhasználó fiókjában).
  const [gmail] = await query<{ ertek: { utolso_eletjel?: string; utolso_bevetel?: string } | null }>(
    `select ertek from gmail_figyelo_allapot where kulcs = 'figyelo'`
  );
  const gmailPerc = korPerc(gmail?.ertek?.utolso_eletjel);
  const [levelDb] = await query<{ mai: number; teendo: number }>(
    `select count(*) filter (where erkezett >= (now() at time zone 'Europe/Budapest')::date)::int as mai,
       count(*) filter (where allapot = 'uj' and coalesce(kezi_osztaly, osztaly) in ('megbizas','modositas','adatkeres','okmanykeres','papirok'))::int as teendo
     from fuvar_level`
  );
  sorok.push({
    kulcs: "gmail",
    cim: "Gmail-figyelő",
    allapot: gmailPerc === null ? "nincs_adat" : gmailPerc > 20 ? "gond" : "rendben",
    ertek: gmailPerc === null ? "nincs beállítva" : kor(gmailPerc),
    reszlet: `ma ${levelDb?.mai ?? 0} levél · ${levelDb?.teendo ?? 0} teendő`,
    utoljara: gmail?.ertek?.utolso_eletjel ?? null,
  });

  // 3. GPS (Ecofleet) — a megállókra írt utolsó érintés.
  const [gps] = await query<{ utolso: string | null }>(
    `select greatest(max(gps_erkezes), max(gps_tavozas))::text as utolso from fuvar_megallok`
  );
  const gpsPerc = korPerc(gps?.utolso);
  sorok.push({
    kulcs: "gps",
    cim: "GPS-érintések (Ecofleet)",
    allapot: gpsPerc === null ? "nincs_adat" : gpsPerc > 60 * 12 ? "figyelmeztetes" : "rendben",
    ertek: kor(gpsPerc),
    reszlet: "a megállókra írt utolsó érkezés/távozás",
    utoljara: gps?.utolso ?? null,
  });

  // 4. Számlázz.hu szinkron.
  const [szamla] = await query<{ utolso: string | null }>(
    `select max(utolso_futas_at)::text as utolso from szamlak_poll_allapot`
  );
  const szamlaPerc = korPerc(szamla?.utolso);
  sorok.push({
    kulcs: "szamlazz",
    cim: "Számlázz.hu szinkron",
    allapot: szamlaPerc === null ? "nincs_adat" : szamlaPerc > 60 * 6 ? "figyelmeztetes" : "rendben",
    ertek: kor(szamlaPerc),
    reszlet: null,
    utoljara: szamla?.utolso ?? null,
  });

  // 5. Átállási adatminőség: állapot nélküli sor, nyitott migrációs hiba.
  const [adat] = await query<{ allapot_nelkul: number; migracio_hiba: number; elszamolas_nelkul: number; megallo_nelkul: number }>(
    `select
      (select count(*) from fuvar_megbizasok where torolt_at is null and allapot is null)::int as allapot_nelkul,
      (select count(*) from fuvar_migracio_hiba where rendezve_at is null)::int as migracio_hiba,
      (select count(*) from fuvar_megbizasok m where m.jelleg = 'ber' and m.allapot in ('teljesitve','szamlazhato','szamlazva','email_elment','postazva','lezart')
         and not exists (select 1 from fuvar_elszamolas e where e.megbizas_id = m.id))::int as elszamolas_nelkul,
      (select count(*) from fuvar_megbizasok m where m.torolt_at is null and m.allapot is not null
         and not exists (select 1 from fuvar_megallok g where g.megbizas_id = m.id))::int as megallo_nelkul`
  );
  const hibaOssz = (adat?.allapot_nelkul ?? 0) + (adat?.migracio_hiba ?? 0) + (adat?.elszamolas_nelkul ?? 0);
  sorok.push({
    kulcs: "atallas",
    cim: "Átállási kapuk (E6)",
    allapot: hibaOssz === 0 ? "rendben" : "gond",
    ertek: hibaOssz === 0 ? "minden 0" : `${hibaOssz} nyitott`,
    reszlet: `állapot nélkül ${adat?.allapot_nelkul ?? 0} · migrációs hiba ${adat?.migracio_hiba ?? 0} · elszámolás nélkül ${adat?.elszamolas_nelkul ?? 0} · megálló nélkül ${adat?.megallo_nelkul ?? 0}`,
    utoljara: null,
  });

  // 6. Lejárt, de nem teljesített fuvarok (a dátum-heurisztika kivezetésének következménye, S7).
  const [lejart] = await query<{ db: number }>(
    `select count(*)::int as db from fuvar_megbizasok
     where torolt_at is null and allapot in ('tervezett','folyamatban')
       and coalesce(lerakas_datum, datum) < (now() at time zone 'Europe/Budapest')::date`
  );
  sorok.push({
    kulcs: "lejart",
    cim: "Lejárt, nincs teljesítve",
    allapot: (lejart?.db ?? 0) === 0 ? "rendben" : (lejart?.db ?? 0) > 5 ? "gond" : "figyelmeztetes",
    ertek: `${lejart?.db ?? 0} fuvar`,
    reszlet: "a lerakás napja elmúlt, de nincs teljesítve jelölve",
    utoljara: null,
  });

  // 7. Elszámolási szűk keresztmetszetek.
  const [elsz] = await query<{ fotora: number; szamlazhato: number; emailre: number; postara: number }>(
    `select
      count(*) filter (where allapot = 'teljesitve')::int as fotora,
      count(*) filter (where allapot = 'szamlazhato')::int as szamlazhato,
      count(*) filter (where allapot = 'szamlazva')::int as emailre,
      count(*) filter (where allapot = 'email_elment')::int as postara
     from fuvar_megbizasok where torolt_at is null and jelleg = 'ber'`
  );
  sorok.push({
    kulcs: "elszamolas",
    cim: "Elszámolás sora",
    allapot: (elsz?.fotora ?? 0) + (elsz?.szamlazhato ?? 0) > 10 ? "figyelmeztetes" : "rendben",
    ertek: `${(elsz?.fotora ?? 0) + (elsz?.szamlazhato ?? 0) + (elsz?.emailre ?? 0) + (elsz?.postara ?? 0)} nyitott`,
    reszlet: `fotóra vár ${elsz?.fotora ?? 0} · számlázható ${elsz?.szamlazhato ?? 0} · e-mailre ${elsz?.emailre ?? 0} · postára ${elsz?.postara ?? 0}`,
    utoljara: null,
  });

  // 8. Migrációk.
  const [migr] = await query<{ db: number; utolso: string | null }>(
    `select count(*)::int as db, max(alkalmazva_at)::text as utolso from alkalmazott_javitasok where kod like 'sql:%'`
  );
  sorok.push({
    kulcs: "migracio",
    cim: "Adatbázis-migrációk",
    allapot: "rendben",
    ertek: `${migr?.db ?? 0} lefutott`,
    reszlet: migr?.utolso ? `utolsó: ${kor(korPerc(migr.utolso))}` : null,
    utoljara: migr?.utolso ?? null,
  });

  return { sorok, frissitve: new Date().toISOString() };
}
