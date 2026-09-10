"use server";

// Az Áttekintés (/attekintes) vezetői, alsó fülekkel navigálható mobil
// nézetének lekérdezései (Nyíregyháza / Fuvar / Számlák / Készlet fülek).
// Szándékosan nem hoz létre új adatforrást — mindenhol a meglévő modulok
// (Készlet/Nyíregyháza, Számlák, Fuvarozás) már meglévő tábláira és
// akcióira épít, hogy ugyanazt az adatot mutassa, mint a teljes modulok,
// csak tömörebben, mobilra optimalizálva.

import { query } from "@/lib/db";
import { getFleetPositions } from "@/lib/fuvarozas/actions";
import { getFuvarok } from "@/lib/fuvarozas/megbizasok";
import { SAJAT_JARMUVEK, resolveJarmu, findJarmuByPlate, jarmuLabel, type SajatJarmu } from "@/lib/fuvarozas/vehicles";
import { getOsszesLejartSzamla } from "@/lib/szamlak/actions";
import type { SzamlaRow } from "@/lib/szamlak/szamla-constants";
import type { FuvarRow } from "@/lib/fuvarozas/fuvar-constants";

// ---------------------------------------------------------------------------
// Nyíregyháza fül
// ---------------------------------------------------------------------------

// A Railway-konténer (és a hozzá tartozó Postgres session) alapértelmezett
// időzónája UTC, nem Europe/Budapest — lásd lib/jelenlet/actions.ts hasonló
// megjegyzését. A sima `current_date`/`::date` ezért a szerver (UTC)
// faliórája szerinti naptári napot adná vissza, ami éjfél körül (a
// Budapest-UTC eltolás miatt) eltérő/hiányos "mai" adatot eredményezne —
// ezért itt is explicit `at time zone 'Europe/Budapest'` konverzióval
// számolunk.
const BUDAPEST_MA = `(now() at time zone 'Europe/Budapest')::date`;

export type FelvasarlasTipusSor = { tipus: string; qty: number };

export type FelvasarlasOsszefoglalo = {
  /** A mai napon ténylegesen vásárolt típusok mennyisége, típusonként — csak azok, amikben ma volt forgalom. */
  tipusok: FelvasarlasTipusSor[];
  kassza: number;
};

/** A "Nyíregyháza" fül fő adatai: a mai felvásárlás típusonként (csempénként) és a kassza egyenleg. */
export async function getFelvasarlasOsszefoglalo(): Promise<FelvasarlasOsszefoglalo> {
  const [typeRows, kasszaRows] = await Promise.all([
    query<{ type: string; qty: string }>(
      `select t.name as type, sum(p.qty) as qty
       from nyiregyhaza_purchases p
       join pallet_types t on t.id = p.type_id
       where (p.created_at at time zone 'Europe/Budapest')::date = ${BUDAPEST_MA}
       group by t.name, t.sort_order
       order by t.sort_order nulls last, t.name`
    ),
    query<{ total: string }>(`select coalesce(sum(amount), 0) as total from kassza_movements`),
  ]);

  return {
    tipusok: typeRows.map((r) => ({ tipus: r.type, qty: Number(r.qty) })),
    kassza: Number(kasszaRows[0]?.total ?? 0),
  };
}

/** A fejlécben (a kijelentkezés alatt, minden fülön) megjelenő havi összesítő: a folyó hónap felvásárlása típusonként. */
export async function getHaviFelvasarlasOsszefoglalo(): Promise<FelvasarlasTipusSor[]> {
  const rows = await query<{ type: string; qty: string }>(
    `select t.name as type, sum(p.qty) as qty
     from nyiregyhaza_purchases p
     join pallet_types t on t.id = p.type_id
     where date_trunc('month', p.created_at at time zone 'Europe/Budapest')
         = date_trunc('month', now() at time zone 'Europe/Budapest')
     group by t.name, t.sort_order
     order by t.sort_order nulls last, t.name`
  );
  return rows.map((r) => ({ tipus: r.type, qty: Number(r.qty) }));
}

export type HaviKasszaOsszesito = {
  /** A folyó hónapban a kasszába befolyt összeg (pozitív tételek összege). */
  bevetel: number;
  /** A folyó hónapban a kasszából kifizetett összeg — negatív előjellel. */
  kiadas: number;
};

/** A Kassza egyenlegre kattintva megnyíló havi összesítő: folyó havi be- és kifizetés. */
export async function getHaviKasszaOsszesito(): Promise<HaviKasszaOsszesito> {
  const rows = await query<{ bevetel: string; kiadas: string }>(
    `select
       coalesce(sum(amount) filter (where amount > 0), 0) as bevetel,
       coalesce(sum(amount) filter (where amount < 0), 0) as kiadas
     from kassza_movements
     where date_trunc('month', created_at at time zone 'Europe/Budapest')
         = date_trunc('month', now() at time zone 'Europe/Budapest')`
  );
  return {
    bevetel: Number(rows[0]?.bevetel ?? 0),
    kiadas: Number(rows[0]?.kiadas ?? 0),
  };
}

export type KasszaKiadasTetel = {
  id: string;
  description: string;
  amount: number;
  createdAt: string;
};

/**
 * A "Nyíregyháza" fülön: minden pénz, ami ma ténylegesen kiment a kasszából —
 * felvásárlás/csere/kifizetés (category='felvasarlas') ÉS egyéb kézzel
 * felvitt kiadás (category='egyeb') egyaránt, kategóriától függetlenül.
 * A felvásárláshoz kötött tételek külön (típusonkénti) mennyiségét a fenti
 * csempék már mutatják — ez a lista a teljes mai kassza-kiáramlást adja Ft-ban.
 */
export async function getMaiKiadasok(): Promise<KasszaKiadasTetel[]> {
  const rows = await query<{ id: string; description: string; amount: number; created_at: string }>(
    `select id::text, description, amount, created_at::text
     from kassza_movements
     where (created_at at time zone 'Europe/Budapest')::date = ${BUDAPEST_MA}
       and amount < 0
     order by created_at desc
     limit 100`
  );
  return rows.map((r) => ({
    id: r.id,
    description: r.description,
    amount: r.amount,
    createdAt: r.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Számlák fül
// ---------------------------------------------------------------------------

/** A "Számlák" fülön: az összes lejárt számla listája, pipálható. */
export async function getLejartSzamlak(): Promise<SzamlaRow[]> {
  return getOsszesLejartSzamla();
}

// ---------------------------------------------------------------------------
// Fuvar fül
// ---------------------------------------------------------------------------

export type JarmuPoziciSor = {
  jarmu: SajatJarmu;
  /** null, ha a jármű nincs Ecofleet-be kötve, vagy nem sikerült lekérni a pozícióját. */
  cim: string | null;
  sebesseg: number | null;
  frissitve: string | null;
};

/** A "Fuvar" fülön: saját járművenként az utolsó ismert hely (cím) és sebesség. */
export async function getJarmuPoziciok(): Promise<JarmuPoziciSor[]> {
  const result = await getFleetPositions();
  const positions = result.ok ? result.positions : [];

  return SAJAT_JARMUVEK.map((jarmu) => {
    const pos = positions.find((p) => findJarmuByPlate(p.plate) === jarmu);
    return {
      jarmu,
      cim: pos?.cim ?? null,
      sebesseg: pos?.speed ?? null,
      frissitve: pos?.timestamp ?? null,
    };
  });
}

function jarmuMatch(jarmu: SajatJarmu, row: FuvarRow): boolean {
  if (row.jarmu && resolveJarmu(row.jarmu) === jarmu) return true;
  if (row.sofor && row.sofor.trim().toLowerCase() === jarmu.sofor.toLowerCase()) return true;
  return false;
}

export type JarmuMegbizasSor = {
  id: string;
  // A UI-n megszokott (a DB "tipus" mezőjéhez képest fordított) címkézés —
  // lásd lib/dashboard/actions.ts megjegyzését: DB tipus='ber' -> "Saját",
  // DB tipus='sajat' -> "Bér".
  cimke: "Saját" | "Bér";
  date: string;
  megrendelo: string | null;
  felrako: string | null;
  lerako: string;
  statusz: string;
};

export type JarmuMegbizasCsoport = {
  jarmu: SajatJarmu;
  label: string;
  megbizasok: JarmuMegbizasSor[];
};

/** A "Fuvar" fülön: saját járművenként a még nem lezárt megbízások, a legközelebbi elöl. */
export async function getJarmuMegbizasok(): Promise<JarmuMegbizasCsoport[]> {
  const [berTabRows, sajatTabRows] = await Promise.all([
    getFuvarok("sajat"), // DB tipus='sajat' — UI-n "Bér fuvarok" fül
    getFuvarok("ber"), // DB tipus='ber' — UI-n "Saját fuvarok" fül
  ]);

  const aktivBer = berTabRows.filter((r) => r.statusz !== "lezarva");
  const aktivSajat = sajatTabRows.filter((r) => r.statusz !== "lezarva");

  return SAJAT_JARMUVEK.map((jarmu) => {
    const sajat: JarmuMegbizasSor[] = aktivSajat
      .filter((row) => jarmuMatch(jarmu, row))
      .map((row) => ({
        id: row.id,
        cimke: "Saját" as const,
        date: row.date,
        megrendelo: row.megrendelo,
        felrako: row.felrako,
        lerako: row.lerako,
        statusz: row.statusz,
      }));
    const ber: JarmuMegbizasSor[] = aktivBer
      .filter((row) => jarmuMatch(jarmu, row))
      .map((row) => ({
        id: row.id,
        cimke: "Bér" as const,
        date: row.date,
        megrendelo: row.megrendelo,
        felrako: row.felrako,
        lerako: row.lerako,
        statusz: row.statusz,
      }));

    // A getFuvarok() a legutóbb rögzített dátum szerint csökkenőben rendez —
    // itt a "következő teendők" olvashatóbb, ha a régebbi (korábbi
    // dátumú, tehát sürgősebb) tétel van elöl.
    return {
      jarmu,
      label: jarmuLabel(jarmu),
      megbizasok: [...sajat, ...ber].reverse(),
    };
  });
}
