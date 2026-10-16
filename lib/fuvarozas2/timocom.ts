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
