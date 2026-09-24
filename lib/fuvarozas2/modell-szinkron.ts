// Fuvarozás 2 — az új adatmodell utántöltése EGY megbízásra.
//
// MIÉRT KELL: 2026-09-20-ig a `fuvar_megallok`, `partner_id`, `jarmu_id` és a
// `hivatkozas_*` oszlopokat KIZÁRÓLAG a kézzel futtatott
// `scripts/fuvarozas2-backfill.ts` írta, a deploy-lánc pedig nem hívta. Az
// `allapot`-ot viszont a 002-es trigger minden új soron kitölti, ezért minden
// listában rendben látszott — közben az E6 backfill óta létrejött fuvarokon
// (#133-tól) egyetlen megálló sem volt. Ez csendben kilőtte:
//   • a Ma-képernyő megálló-sorait,
//   • az „ablakhoz képest késik" eltérést,
//   • a várakozás/pótdíj-figyelést (≥45 perc),
//   • a sofőr megállónkénti „kész" gombját,
//   • a partner szintű kintlévőséget és a hivatkozás-keresést.
//
// EZ A MODUL a backfill soronkénti, ÚJ fuvarra vonatkozó részét végzi el, az
// import végén meghívva. Szándékosan szűkebb a backfillnél: az `allapot`-ot
// nem állítja (azt a trigger és az új kód dönti), régi indexes állapot-sorral
// nem foglalkozik (új fuvaron nincs), és SEMMIT nem ír felül — csak a hiányzót
// tölti ki (`coalesce`), hogy a kézi javítást ne bántsa.
//
// NEM "use server" fájl: import-oldali segéd, a hívói szerver-modulok.

import { query } from "@/lib/db";
import { megalloTerv } from "@/lib/fuvarozas2/megallo-terv";
import { normalizaltCegKulcs } from "@/lib/fuvarozas/fuvar-constants";
import { resolveJarmu } from "@/lib/fuvarozas/vehicles";

type Sor = {
  id: string;
  megrendelo: string | null;
  jarmu: string | null;
  sofor: string | null;
  felrako: string | null;
  lerako: string | null;
  datum_iso: string | null;
  lerakas_datum_iso: string | null;
  felrakas_ablak_tol: string | null;
  felrakas_ablak_ig: string | null;
  lerakas_ablak_tol: string | null;
  lerakas_ablak_ig: string | null;
  pozicioszam: string | null;
  pozicioszam_nincs: boolean;
  reise_id: string | null;
  partner_id: string | null;
  jarmu_id: string | null;
  megallo_db: number;
};

export type ModellSzinkronEredmeny = {
  megallo: number;
  partner: boolean;
  jarmu: boolean;
  hivatkozas: boolean;
};

/**
 * Egy megbízás Fuvarozás 2 oszlopainak és megállóinak utántöltése.
 * Idempotens: ami már megvan, marad. Hibát nem dob a hívóra — az import
 * nem bukhat el azon, hogy a partner-kulcs nem áll össze.
 */
export async function frissitsdFuvarozas2Modellt(fuvarId: string): Promise<ModellSzinkronEredmeny> {
  const ures: ModellSzinkronEredmeny = { megallo: 0, partner: false, jarmu: false, hivatkozas: false };
  try {
    const [sor] = await query<Sor>(
      `select f.id::text, f.megrendelo, f.jarmu, f.sofor, f.felrako, f.lerako,
         to_char(f.datum, 'YYYY-MM-DD') as datum_iso,
         to_char(f.lerakas_datum, 'YYYY-MM-DD') as lerakas_datum_iso,
         f.felrakas_ablak_tol::text, f.felrakas_ablak_ig::text,
         f.lerakas_ablak_tol::text, f.lerakas_ablak_ig::text,
         f.pozicioszam, coalesce(f.pozicioszam_nincs, false) as pozicioszam_nincs, f.reise_id,
         f.partner_id::text, f.jarmu_id::text,
         (select count(*) from fuvar_megallok m where m.megbizas_id = f.id)::int as megallo_db
       from fuvar_megbizasok f where f.id = $1`,
      [fuvarId]
    );
    if (!sor) return ures;
    const eredmeny: ModellSzinkronEredmeny = { ...ures };

    // 1. Partner (pontos, normalizált kulcs — a fuzzy összevonás kézi, S13).
    let partnerId: string | null = sor.partner_id;
    if (!partnerId && sor.megrendelo?.trim()) {
      const kulcs = normalizaltCegKulcs(sor.megrendelo);
      await query(
        `insert into fuvar_partnerek (nev, nev_kulcs) values ($1, $2) on conflict (nev_kulcs) do nothing`,
        [sor.megrendelo.trim(), kulcs]
      );
      const [p] = await query<{ id: string }>(`select id::text from fuvar_partnerek where nev_kulcs = $1`, [kulcs]);
      partnerId = p?.id ?? null;
      eredmeny.partner = !!partnerId;
    }

    // 2. Jármű a szövegből (pontos/ismert alak). A "Kocsi" mező a hiteles
    // jelölő; a "Sofőr" csak ha az üres — ugyanaz a szabály, mint a GPS
    // idővonalon (lib/fuvarozas/actions.ts driverMatchesRow).
    let jarmuId: string | null = sor.jarmu_id;
    const jarmuSzoveg = sor.jarmu?.trim() || sor.sofor?.trim();
    if (!jarmuId && jarmuSzoveg) {
      const jarmu = resolveJarmu(jarmuSzoveg);
      const kod = jarmu?.rendszamok[0] ?? null;
      if (kod) {
        const [j] = await query<{ id: string }>(`select id::text from fuvar_jarmuvek where kod = $1`, [kod]);
        jarmuId = j?.id ?? null;
        eredmeny.jarmu = !!jarmuId;
      }
    }

    // 3. Hivatkozás (kanonikus = pozíciószám, különben Reise-azonosító).
    const kanon = sor.pozicioszam?.trim() || sor.reise_id?.trim() || null;
    const masod = kanon && sor.pozicioszam?.trim() && sor.reise_id?.trim() ? sor.reise_id.trim() : null;
    eredmeny.hivatkozas = !!kanon;

    await query(
      `update fuvar_megbizasok set
         partner_id = coalesce(partner_id, $2),
         jarmu_id = coalesce(jarmu_id, $3),
         hivatkozas_kanonikus = coalesce(hivatkozas_kanonikus, $4),
         hivatkozas_nyers = coalesce(hivatkozas_nyers, $5),
         hivatkozas_masodlagos = coalesce(hivatkozas_masodlagos, $6),
         -- A hivatkozas_nincs NOT NULL DEFAULT false, tehát coalesce nem véd:
         -- csak akkor állítjuk igazra, ha a megbízáson is az van.
         hivatkozas_nincs = (hivatkozas_nincs or $7)
       where id = $1`,
      [sor.id, partnerId, jarmuId, kanon, sor.pozicioszam ?? sor.reise_id, masod, sor.pozicioszam_nincs]
    );

    // 4. Megállók. Ha még egy sincs, felvesszük (felrakók, aztán lerakók — a
    // sofor.ts sorrendje). Ha már van, csak a HIÁNYZÓ tervet töltjük ki:
    // a GPS-tényt és a sofőr jelölését nem bántjuk.
    const terv = megalloTerv(sor);
    if (sor.megallo_db === 0) {
      for (let i = 0; i < terv.length; i++) {
        const m = terv[i];
        await query(
          `insert into fuvar_megallok (megbizas_id, sorszam, tipus, cim_nyers, tervezett_nap, ablak_tol, ablak_ig)
           values ($1, $2, $3, $4, $5, $6, $7)`,
          [sor.id, i + 1, m.tipus, m.cim, m.nap, m.tol, m.ig]
        );
      }
      eredmeny.megallo = terv.length;
    } else if (sor.megallo_db === terv.length) {
      // Ugyanannyi megálló: az utólag megjött ablakot/napot pótoljuk.
      for (let i = 0; i < terv.length; i++) {
        const m = terv[i];
        await query(
          `update fuvar_megallok set
             tervezett_nap = coalesce(tervezett_nap, $3),
             ablak_tol = coalesce(ablak_tol, $4),
             ablak_ig = coalesce(ablak_ig, $5)
           where megbizas_id = $1 and sorszam = $2`,
          [sor.id, i + 1, m.nap, m.tol, m.ig]
        );
      }
    }
    return eredmeny;
  } catch (err) {
    // Az import nem bukhat el ezen — naplózzuk és megyünk tovább.
    console.error(`[modell-szinkron] a(z) ${fuvarId} megbízás Fuvarozás 2 modellje nem frissült:`, err);
    return ures;
  }
}

/**
 * Utánpótlás: minden olyan NEM törölt megbízás, amelynek nincs megállója,
 * valamint a friss (2 hétnél nem régebbi) sorok, amelyeknél a megrendelő
 * vagy a kocsi szövege megvan, de a Fuvarozás 2 kulcsa (partner_id /
 * jarmu_id) nincs — pl. a kocsit utólag, jóváhagyáskor kapta a fuvar. A
 * deploy-lánc és az óránkénti kör hívja, hogy a lemaradt sorok is
 * beérjenek (a fenti függvény csak az importáltakat fogja meg). Egy fel nem
 * oldható kocsi-szöveg (alvállalkozó neve) óránként egy olcsó próbát jelent.
 */
export async function potoldAHianyzoModelleket(korlat = 200): Promise<{ erintett: number; megallo: number }> {
  const sorok = await query<{ id: string }>(
    `select f.id::text from fuvar_megbizasok f
     where f.torolt_at is null
       and (not exists (select 1 from fuvar_megallok m where m.megbizas_id = f.id)
            or (coalesce(f.lerakas_datum, f.datum) >= current_date - 14
                and ((f.partner_id is null and coalesce(trim(f.megrendelo), '') <> '')
                     or (f.jarmu_id is null and coalesce(nullif(trim(f.jarmu), ''), nullif(trim(f.sofor), '')) is not null))))
     order by f.datum desc nulls last
     limit $1`,
    [korlat]
  );
  let megallo = 0;
  for (const s of sorok) {
    const e = await frissitsdFuvarozas2Modellt(s.id);
    megallo += e.megallo;
  }
  return { erintett: sorok.length, megallo };
}
