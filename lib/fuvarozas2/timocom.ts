"use server";

// Timocom ajánlat rögzítése (fuvarszervező pult, B út: böngésző-gomb; A út:
// beillesztés). A feldolgozás: lib/fuvarozas2/timocom-ajanlat.ts. A sor a
// radar_kiiras táblába kerül (forras = 'timocom'), ugyanaz az ajánlat
// másodszor küldve frissül, nem duplikál.

import { requireEditPermission, requireViewPermission } from "@/lib/auth/require-permission";
import { requireSession } from "@/lib/auth/dal";
import { query, withTransaction } from "@/lib/db";
import { parseTimocomAjanlat, timocomKulcs, type TimocomAjanlat, type TimocomBemenet } from "@/lib/fuvarozas2/timocom-ajanlat";
import { megbizasAjanlatbol, raRe, type AjanlatAdat, type AjanlatDontes } from "@/lib/fuvarozas2/ajanlat-megbizas-alap";
import { setFuvarJarmu, ujBerFuvar } from "@/lib/fuvarozas2/megbizasok";
import { arLetra } from "@/lib/fuvarozas2/ar-letra";
import { ATLAG_KMH } from "@/lib/fuvarozas2/tervezes-het-alap";
import { getFuvarBeallitasok } from "@/lib/beallitasok/fuvar";
import { getEurArfolyamok } from "@/lib/fuvarozas/arfolyam";
import { getJarmuvek } from "@/lib/fuvarozas/jarmuvek-db";
import { findJarmuByPlate } from "@/lib/fuvarozas/vehicles";
import { budapestNapISO } from "@/lib/fuvarozas/idozona";
import { torlesSet } from "@/lib/megbizasok/torles";

export type TimocomSor = {
  id: string;
  allapot: string;
  letrehozvaAt: string;
  frissitveAt: string;
  rogzitette: string | null;
  ajanlat: TimocomAjanlat;
  /** Megnyert / elvesztett ajánlatnál: a díj, amennyiért elvittük (vagy amit ajánlottunk), és mikor dőlt el (044). */
  ajanlottAr: number | null;
  ajanlottPenznem: "HUF" | "EUR" | null;
  eredmenyAt: string | null;
  /** A megnyert ajánlatból létrehozott megbízás (ha még nincs törölve). */
  megbizasId: string | null;
};

export async function rogzitTimocomAjanlatot(be: TimocomBemenet): Promise<{ ok: true; id: string; uj: boolean; ut: string } | { ok: false; hiba: string }> {
  await requireEditPermission("fuvarozas");
  const session = await requireSession();
  const szoveg = String(be?.szoveg ?? "").slice(0, 20_000);
  if (szoveg.trim().length < 20) return { ok: false, hiba: "Üres vagy túl rövid ajánlat-szöveg." };
  const a = parseTimocomAjanlat({ ...be, szoveg });
  const kulcs = timocomKulcs(a);
  if (!kulcs || a.helyek.length < 2) {
    return { ok: false, hiba: "Nem találtam legalább egy fel- és egy lerakóhelyet — a Timocom részletpaneljét másold ki (Létrehozva … Külső megjegyzések)." };
  }
  const fel = a.helyek.find((h) => h.tipus === "fel") ?? a.helyek[0];
  const le = [...a.helyek].reverse().find((h) => h.tipus === "le") ?? a.helyek[a.helyek.length - 1];
  const hely = (h: typeof fel) => [h.orszag !== "HU" ? h.orszag : null, h.irsz, h.varos].filter(Boolean).join(" ");
  const arFt = a.ar && a.ar.penznem === "HUF" ? Math.round(a.ar.osszeg) : null;
  const rows = await query<{ id: string; uj: boolean }>(
    `insert into radar_kiiras (forras, kulso_azonosito, megbizo_jelolt, honnan, hova, felrakas_nap, lerakas_nap, suly_t, ar_ft, ar_penznem, tav_km,
                               reszletek, nyers_szoveg, url, rogzitette)
     values ('timocom', $1, $2, $3, $4, $5::date, $6::date, $7, $8, $9, $10, $11::jsonb, $12, $13, $14)
     on conflict (forras, kulso_azonosito) where kulso_azonosito is not null do update set
       megbizo_jelolt = excluded.megbizo_jelolt, honnan = excluded.honnan, hova = excluded.hova,
       felrakas_nap = excluded.felrakas_nap, lerakas_nap = excluded.lerakas_nap, suly_t = excluded.suly_t,
       ar_ft = excluded.ar_ft, ar_penznem = excluded.ar_penznem, tav_km = excluded.tav_km,
       reszletek = excluded.reszletek, nyers_szoveg = excluded.nyers_szoveg, url = coalesce(excluded.url, radar_kiiras.url),
       frissitve_at = now()
     returning id::text, (xmax = 0) as uj`,
    [
      kulcs, a.megbizo, hely(fel), hely(le), fel.datumTol, le.datumIg ?? le.datumTol, a.sulyT, arFt,
      a.ar?.penznem ?? null, a.tavKm, JSON.stringify(a), szoveg, a.url, session.name ?? session.username,
    ]
  );
  return { ok: true, id: rows[0].id, uj: rows[0].uj, ut: `${a.megbizo ?? "?"}: ${fel.varos} → ${le.varos}${fel.datumTol ? ` (${fel.datumTol.slice(5).replace("-", ".")}.)` : ""}` };
}

type Nyers = {
  id: string; allapot: string; letrehozva_at: string; frissitve_at: string; rogzitette: string | null; reszletek: TimocomAjanlat | null; nyers_szoveg: string | null; url: string | null;
  ajanlott_ar: string | null; ajanlott_penznem: string | null; eredmeny_at: string | null; megbizas_id: string | null;
};

const NYERS_OSZLOPOK = `r.id::text, r.allapot, r.letrehozva_at::text, r.frissitve_at::text, r.rogzitette, r.reszletek, r.nyers_szoveg, r.url,
  r.ajanlott_ar::text, r.ajanlott_penznem, r.eredmeny_at::text,
  (select m.id::text from fuvar_megbizasok m where m.id = r.megbizas_id and m.torolt_at is null) as megbizas_id`;

function sorbol(r: Nyers): TimocomSor {
  // A régebbi (feldolgozó-változás előtti) sort a nyers szövegből újra lehet olvasni.
  const ajanlat = r.reszletek ?? parseTimocomAjanlat({ szoveg: r.nyers_szoveg ?? "", url: r.url });
  return {
    id: r.id, allapot: r.allapot, letrehozvaAt: r.letrehozva_at, frissitveAt: r.frissitve_at, rogzitette: r.rogzitette, ajanlat,
    ajanlottAr: r.ajanlott_ar != null ? Number(r.ajanlott_ar) : null,
    ajanlottPenznem: r.ajanlott_penznem === "HUF" || r.ajanlott_penznem === "EUR" ? r.ajanlott_penznem : null,
    eredmenyAt: r.eredmeny_at, megbizasId: r.megbizas_id,
  };
}

export async function getTimocomAjanlat(id: string): Promise<TimocomSor | null> {
  await requireViewPermission("fuvarozas");
  if (!/^\d+$/.test(String(id))) return null;
  const rows = await query<Nyers>(
    `select ${NYERS_OSZLOPOK} from radar_kiiras r where r.id = $1 and r.forras = 'timocom'`,
    [id]
  );
  return rows[0] ? sorbol(rows[0]) : null;
}

/** `allapotok`: csak ezek (pl. a Tervezés hete a nyitott és a kiment ajánlatokat kéri) — a limit így nem vágja le őket. */
export async function getTimocomAjanlatok(limit = 30, allapotok?: string[]): Promise<TimocomSor[]> {
  await requireViewPermission("fuvarozas");
  const rows = await query<Nyers>(
    `select ${NYERS_OSZLOPOK}
       from radar_kiiras r where r.forras = 'timocom' and ($2::text[] is null or r.allapot = any($2::text[]))
      order by r.frissitve_at desc limit $1`,
    [Math.min(Math.max(limit, 1), 100), allapotok ?? null]
  );
  return rows.map(sorbol);
}

export async function allitTimocomAllapotot(id: string, allapot: "nyitott" | "ajanlva" | "elvetve"): Promise<{ ok: boolean }> {
  await requireEditPermission("fuvarozas");
  if (!/^\d+$/.test(String(id)) || !["nyitott", "ajanlva", "elvetve"].includes(allapot)) return { ok: false };
  // A megnyert (megbízássá vált) ajánlat állapota innen nem írható át — a megbízás él.
  const sorok = await query<{ id: string }>(
    `update radar_kiiras r set allapot = $2, frissitve_at = now()
      where r.id = $1 and r.forras = 'timocom'
        and not (r.allapot = 'nyert' and exists (select 1 from fuvar_megbizasok m where m.id = r.megbizas_id and m.torolt_at is null))
      returning r.id::text`,
    [id, allapot]
  );
  return { ok: sorok.length > 0 };
}

// ---------------------------------------------------------------------------
// „Megnyertük → megbízás” (1. hullám C, 2026-10-16, docs/fuvarozas-1-hullam-terv.md).
// A megnyert ajánlatból bérfuvar lesz a meglévő ujBerFuvar úton, a kocsira a
// meglévő setFuvarJarmu úton kerül (jarmu_id azonnal), az ajánlat → 'nyert'.
// Az ujBerFuvar saját tranzakcióban fut (és utána szinkronizál), ezért nem
// lehet egy tranzakcióba fogni: az ajánlatot előbb lefoglaljuk ('nyert',
// megbizas_id nélkül), és bármely későbbi hibánál visszaállítjuk (a már
// létrejött megbízást soft-delete-tel visszavonjuk).

export type MegnyeresElotoltes = {
  felrakasNap: string | null;
  dij: number | null;
  penznem: "HUF" | "EUR";
  /** Honnan jön a javasolt díj — a mező alatt kiírjuk. */
  dijForras: string | null;
  kocsik: { kod: string; sofor: string }[];
};

type AjanlatNyers = {
  id: string; allapot: string; megbizo_jelolt: string | null; honnan: string | null; hova: string | null;
  felrakas_nap: string | null; lerakas_nap: string | null; tav_km: string | null; reszletek: TimocomAjanlat | null;
  nyers_szoveg: string | null; url: string | null; ajanlott_ar: string | null; ajanlott_penznem: string | null;
  megbizas_id: string | null;
};

const ID_MINTA = /^\d+$/;
const ISO_NAP = /^\d{4}-\d{2}-\d{2}$/;
/** Ennyi másodpercig „folyamatban” egy megbízás nélküli 'nyert' foglalás (dupla kattintás ellen;
 * lassú megbízás-létrehozásnál se járjon le közben — QA 1. hullám #1). */
const FOGLALAS_MP = 300;

/** A megbízás tényleges kocsija (sofőrnév, ha ismert) — az idempotens válaszhoz. */
async function megbizasKocsija(megbizasId: string, tartalek: string): Promise<string> {
  const [m] = await query<{ jarmu: string | null }>(`select jarmu from fuvar_megbizasok where id = $1`, [megbizasId]).catch(() => []);
  if (!m?.jarmu) return tartalek;
  return findJarmuByPlate(m.jarmu, await getJarmuvek())?.sofor ?? m.jarmu;
}

/**
 * Élő megbízás, ami már ebből az ajánlatból készült (a megjegyzése
 * „Timocom-ajánlat #<id>” kezdetű) — ha egy korábbi kör a megbízást
 * létrehozta, de az ajánlathoz kötés elmaradt, ne legyen belőle második.
 */
async function meglevoAjanlatMegbizas(ajanlatId: string): Promise<string | null> {
  const [m] = await query<{ id: string }>(
    `select id::text from fuvar_megbizasok
      where torolt_at is null and (megjegyzes = $1 or megjegyzes like $1 || ' ·%')
      order by id desc limit 1`,
    [`Timocom-ajánlat #${ajanlatId}`]
  );
  return m?.id ?? null;
}

async function ajanlatSor(id: string): Promise<AjanlatNyers | null> {
  const [r] = await query<AjanlatNyers>(
    `select r.id::text, r.allapot, r.megbizo_jelolt, r.honnan, r.hova,
            to_char(r.felrakas_nap, 'YYYY-MM-DD') as felrakas_nap, to_char(r.lerakas_nap, 'YYYY-MM-DD') as lerakas_nap,
            r.tav_km::text, r.reszletek, r.nyers_szoveg, r.url, r.ajanlott_ar::text, r.ajanlott_penznem,
            (select m.id::text from fuvar_megbizasok m where m.id = r.megbizas_id and m.torolt_at is null) as megbizas_id
       from radar_kiiras r where r.id = $1 and r.forras = 'timocom'`,
    [id]
  );
  return r ?? null;
}

function ajanlatAdatbol(r: AjanlatNyers): AjanlatAdat {
  const t = r.reszletek ?? parseTimocomAjanlat({ szoveg: r.nyers_szoveg ?? "", url: r.url });
  return {
    id: r.id, timocomId: t.ajanlatId, tcId: t.tcId, megbizo: r.megbizo_jelolt ?? t.megbizo,
    honnan: r.honnan ?? "", hova: r.hova ?? "", felrakasNap: r.felrakas_nap, lerakasNap: r.lerakas_nap,
    tavKm: r.tav_km != null ? Number(r.tav_km) : t.tavKm, aru: t.aru, sulyT: t.sulyT,
  };
}

async function aktivKocsik(): Promise<{ kod: string; sofor: string }[]> {
  const lista = await getJarmuvek();
  const sorok = await query<{ kod: string }>(`select kod from fuvar_jarmuvek where aktiv order by id`);
  return sorok.map((s) => ({ kod: s.kod, sofor: lista.find((j) => j.kod === s.kod)?.sofor ?? s.kod }));
}

/**
 * A „Megnyertük” űrlap előtöltése (csak olvas). Díj: amit már rögzítettünk
 * (ajanlott_ar), különben a Timocomban kiírt ár (ha van pénzneme), különben
 * az árlétra +20%-os foka („Mennyit kérj”) a rakott útra, a Tervezés hetének
 * becslésével (km-költség × km + az idő a napi fix arányában), ráállás nélkül —
 * résből nyitva a felület a rés-sor pontosabb (ráállással számolt) árát adja.
 */
export async function ajanlatMegnyeresElotoltes(ajanlatId: string): Promise<MegnyeresElotoltes | null> {
  await requireViewPermission("fuvarozas");
  if (!ID_MINTA.test(String(ajanlatId))) return null;
  const r = await ajanlatSor(ajanlatId);
  if (!r) return null;
  const a = ajanlatAdatbol(r);
  const t = r.reszletek;
  const kocsik = await aktivKocsik();
  const alap = { felrakasNap: a.felrakasNap, kocsik };
  if (r.ajanlott_ar != null && (r.ajanlott_penznem === "HUF" || r.ajanlott_penznem === "EUR")) {
    return { ...alap, dij: Number(r.ajanlott_ar), penznem: r.ajanlott_penznem, dijForras: "a rögzített ajánlati árunk" };
  }
  if (t?.ar && (t.ar.penznem === "HUF" || t.ar.penznem === "EUR")) {
    return { ...alap, dij: t.ar.osszeg, penznem: t.ar.penznem, dijForras: "a Timocomban kiírt ár" };
  }
  if (a.tavKm && a.tavKm > 0) {
    const b = await getFuvarBeallitasok();
    const kmKoltseg = (b.fogyasztas_alap_l_100km / 100) * (b.gazolaj_ar_tartalek_ft - b.tankolasi_kedvezmeny_ft_l) + 120;
    const perc = Math.round((a.tavKm / ATLAG_KMH) * 60) + 60;
    const onkoltseg = Math.round(a.tavKm * kmKoltseg + (perc / 60) * (b.napi_koltseg_ft / 9));
    const ma = budapestNapISO();
    const arf = (await getEurArfolyamok([ma]).catch(() => new Map<string, never>())).get(ma)?.ft ?? null;
    const fok = arLetra(onkoltseg, arf).fokok[1];
    return { ...alap, dij: fok.ft, penznem: "HUF", dijForras: `árlétra +${fok.szazalek}% (${a.tavKm} km, ráállás nélkül)` };
  }
  return { ...alap, dij: null, penznem: "HUF", dijForras: null };
}

export async function ajanlatMegnyerve(
  ajanlatId: string,
  d: AjanlatDontes
): Promise<{ ok: true; megbizasId: string; kocsi: string; uzenet: string; marMegvolt: boolean } | { ok: false; hiba: string }> {
  await requireEditPermission("fuvarozas");
  const session = await requireSession();
  const ki = session.name ?? session.username;
  if (!ID_MINTA.test(String(ajanlatId))) return { ok: false, hiba: "Hibás ajánlat-azonosító." };
  const dij = Number(d?.dij);
  const penznem = d?.penznem === "EUR" ? "EUR" : d?.penznem === "HUF" ? "HUF" : null;
  const felrakasNap = String(d?.felrakasNap ?? "").trim();
  if (!ISO_NAP.test(felrakasNap)) return { ok: false, hiba: "Add meg a felrakás napját." };
  if (!(Number.isFinite(dij) && dij > 0)) return { ok: false, hiba: "Add meg a díjat (nagyobb, mint 0)." };
  if (!penznem) return { ok: false, hiba: "A pénznem HUF vagy EUR lehet." };
  const jarmu = findJarmuByPlate(String(d?.jarmuKod ?? "").trim(), await getJarmuvek());
  if (!jarmu?.kod) return { ok: false, hiba: "Válassz kocsit." };

  const r = await ajanlatSor(ajanlatId);
  if (!r) return { ok: false, hiba: "Nincs ilyen Timocom-ajánlat." };
  // Idempotens: már megnyert, élő megbízással → a meglévő megbízás.
  if (r.allapot === "nyert" && r.megbizas_id) {
    return { ok: true, megbizasId: r.megbizas_id, kocsi: await megbizasKocsija(r.megbizas_id, jarmu.sofor), uzenet: `Már megnyert — megbízás #${r.megbizas_id}`, marMegvolt: true };
  }
  // Árva megbízás (létrejött, de a kötés elmaradt) → kötjük, nem hozunk létre másodikat.
  const arva = await meglevoAjanlatMegbizas(ajanlatId);
  if (arva) {
    await query(
      `update radar_kiiras set allapot = 'nyert', megbizas_id = $2, eredmeny_at = coalesce(eredmeny_at, now()), frissitve_at = now()
        where id = $1 and forras = 'timocom' and (megbizas_id is null or megbizas_id = $2)`,
      [ajanlatId, arva]
    );
    return { ok: true, megbizasId: arva, kocsi: await megbizasKocsija(arva, jarmu.sofor), uzenet: `Már megnyert — megbízás #${arva}`, marMegvolt: true };
  }
  const a = ajanlatAdatbol(r);
  if (!a.honnan.trim() || !a.hova.trim()) return { ok: false, hiba: "Az ajánlatból hiányzik a fel- vagy a lerakóhely." };

  // 1. Foglalás: 'nyert' megbízás nélkül; a régi értékek a visszaállításhoz.
  const [fogl] = await query<{ regi_allapot: string; regi_ar: string | null; regi_penznem: string | null; regi_at: string | null }>(
    `update radar_kiiras r set allapot = 'nyert', ajanlott_ar = $2, ajanlott_penznem = $3, eredmeny_at = now(), megbizas_id = null, frissitve_at = now()
       from (select id, allapot, ajanlott_ar, ajanlott_penznem, eredmeny_at, megbizas_id from radar_kiiras where id = $1 for update) e
      where r.id = e.id and r.forras = 'timocom'
        and not (e.allapot = 'nyert' and (
              exists (select 1 from fuvar_megbizasok m where m.id = e.megbizas_id and m.torolt_at is null)
              or (e.megbizas_id is null and e.eredmeny_at > now() - make_interval(secs => $4))))
      returning e.allapot as regi_allapot, e.ajanlott_ar::text as regi_ar, e.ajanlott_penznem as regi_penznem, e.eredmeny_at::text as regi_at`,
    [ajanlatId, dij, penznem, FOGLALAS_MP]
  );
  if (!fogl) {
    const most = await ajanlatSor(ajanlatId);
    if (most?.allapot === "nyert" && most.megbizas_id) {
      return { ok: true, megbizasId: most.megbizas_id, kocsi: await megbizasKocsija(most.megbizas_id, jarmu.sofor), uzenet: `Már megnyert — megbízás #${most.megbizas_id}`, marMegvolt: true };
    }
    return { ok: false, hiba: "Ezt az ajánlatot épp most rögzíti valaki — frissítsd az oldalt egy perc múlva." };
  }
  const visszaallit = () =>
    query(
      `update radar_kiiras set allapot = $2, ajanlott_ar = $3, ajanlott_penznem = $4, eredmeny_at = $5::timestamptz, megbizas_id = null, frissitve_at = now()
        where id = $1 and allapot = 'nyert' and megbizas_id is null`,
      [ajanlatId, fogl.regi_allapot === "nyert" ? "ajanlva" : fogl.regi_allapot, fogl.regi_ar, fogl.regi_penznem, fogl.regi_at]
    ).catch((err) => console.error("[timocom] az ajánlat visszaállítása nem sikerült:", err));
  const visszavon = (megbizasId: string) =>
    query(`update fuvar_megbizasok set ${torlesSet("$2")} where id = $1 and torolt_at is null`, [megbizasId, ki])
      .catch((err) => console.error(`[timocom] a #${megbizasId} megbízás visszavonása nem sikerült:`, err));

  // 2. Bérfuvar a meglévő úton (ujBerFuvar → letrehoz → modell-szinkron).
  const adat = megbizasAjanlatbol(a, { jarmuKod: jarmu.kod, felrakasNap, dij, penznem });
  let megbizasId: string;
  try {
    const uj = await ujBerFuvar(adat);
    if (!uj.ok) { await visszaallit(); return { ok: false, hiba: uj.hiba }; }
    megbizasId = uj.id;
  } catch (err) {
    await visszaallit();
    return { ok: false, hiba: err instanceof Error ? err.message : "Nem jött létre a megbízás." };
  }

  try {
    // 3. Kocsira adás a meglévő úton: jarmu-címke + jarmu_id azonnal, menet.
    const k = await setFuvarJarmu(megbizasId, jarmu.kod);
    if (!k.ok) throw new Error(k.hiba);
    // 4. Forrás + rakott km (az ujBerFuvar 'kezi'-t ír), és az ajánlat → megbízás, egy tranzakcióban.
    await withTransaction(async (tx) => {
      await tx(
        `update fuvar_megbizasok set forras = 'timocom', rakott_km = coalesce(rakott_km, $2) where id = $1`,
        [megbizasId, adat.rakottKm]
      );
      const kesz = await tx<{ id: string }>(
        `update radar_kiiras set megbizas_id = $2, frissitve_at = now() where id = $1 and allapot = 'nyert' and megbizas_id is null returning id::text`,
        [ajanlatId, megbizasId]
      );
      if (!kesz.length) throw new Error("Az ajánlat állapota közben megváltozott.");
      await tx(
        `insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, forras, ki, reszletek) values ($1, 'modositva', 'ember', $2, $3)`,
        [megbizasId, ki, JSON.stringify({ honnan: "timocom", ajanlat_id: ajanlatId, dij, penznem, kocsi: jarmu.kod })]
      );
    });
  } catch (err) {
    await visszavon(megbizasId);
    await visszaallit();
    return { ok: false, hiba: `Nem sikerült befejezni (a megbízást visszavontam): ${err instanceof Error ? err.message : String(err)}` };
  }
  return { ok: true, megbizasId, kocsi: jarmu.sofor, uzenet: `Megbízás #${megbizasId} létrehozva, ${raRe(jarmu.sofor)} adva`, marMegvolt: false };
}

/** „Nem nyertük”: az ajánlat → 'vesztett'; `ar`: amit ajánlottunk (opcionális, az ár-memóriához). */
export async function ajanlatElvesztve(
  ajanlatId: string,
  ar?: { osszeg: number; penznem: "HUF" | "EUR" } | null
): Promise<{ ok: true } | { ok: false; hiba: string }> {
  await requireEditPermission("fuvarozas");
  if (!ID_MINTA.test(String(ajanlatId))) return { ok: false, hiba: "Hibás ajánlat-azonosító." };
  const osszeg = ar && Number.isFinite(Number(ar.osszeg)) && Number(ar.osszeg) > 0 ? Number(ar.osszeg) : null;
  const penznem = osszeg != null ? (ar?.penznem === "EUR" ? "EUR" : "HUF") : null;
  const sorok = await query<{ id: string }>(
    `update radar_kiiras r set allapot = 'vesztett', eredmeny_at = now(), frissitve_at = now(),
            ajanlott_ar = coalesce($2, r.ajanlott_ar), ajanlott_penznem = case when $2::numeric is null then r.ajanlott_penznem else $3 end
      where r.id = $1 and r.forras = 'timocom'
        and not (r.allapot = 'nyert' and exists (select 1 from fuvar_megbizasok m where m.id = r.megbizas_id and m.torolt_at is null))
      returning r.id::text`,
    [ajanlatId, osszeg, penznem]
  );
  if (!sorok.length) return { ok: false, hiba: "Megnyert ajánlat (élő megbízással) nem jelölhető elvesztettnek — előbb töröld a megbízást." };
  return { ok: true };
}
