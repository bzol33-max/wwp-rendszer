import "server-only";
import { query, type Querier } from "@/lib/db";
import { JOVAHAGYOTT_ALLAPOTOK, type Figyelmeztetes, type Menet, type MenetAllapot, type MenetFeladat } from "@/lib/menet/tipusok";

// Menetterv — olvasás (fuvar_menet, menet_feladat, menet_esemeny; 032-es
// migráció). A nézetek a `menetSorrendek`-et hívják oldalbetöltésenként
// EGYSZER (nem fuvaronként); ha a tábla még nincs meg vagy a DB hibázik,
// üres eredményt adnak — a nézet ilyenkor a közös napi szabállyal megy.

type MenetSor = {
  id: string; jarmu_id: string; jarmu_kod: string; nap: string; allapot: MenetAllapot; verzio: number;
  jovahagyta: string | null; jovahagyva_at: string | null; modositva_at: string | null;
};
type FeladatSor = {
  id: string; menet_id: string; sorszam: number; feladat_tipus: MenetFeladat["feladatTipus"]; megbizas_id: string | null;
  kiindulo_cim: string | null; cel_cim: string | null; kiindulo_telephely_pont_id: string | null; cel_telephely_pont_id: string | null;
  tervezett_indulas: string | null; tervezett_erkezes: string | null; ures_km: string | null; rakott_km: string | null;
  km_forras: MenetFeladat["kmForras"]; raklap_db: number | null; figyelmeztetesek: Figyelmeztetes[] | null; lezarva_at: string | null;
  partner: string | null; hivatkozas: string | null;
};

const MENET_OSZLOPOK = `m.id::text, m.jarmu_id::text, j.kod as jarmu_kod, m.nap::text, m.allapot, m.verzio,
  m.jovahagyta, m.jovahagyva_at::text, m.modositva_at::text`;

const szamVagyNull = (x: string | null) => (x == null ? null : Number(x));

function feladatSorbol(f: FeladatSor): MenetFeladat {
  return {
    id: f.id,
    sorszam: f.sorszam,
    feladatTipus: f.feladat_tipus,
    megbizasId: f.megbizas_id,
    kiinduloCim: f.kiindulo_cim,
    celCim: f.cel_cim,
    kiinduloTelephelyPontId: f.kiindulo_telephely_pont_id,
    celTelephelyPontId: f.cel_telephely_pont_id,
    tervezettIndulas: f.tervezett_indulas,
    tervezettErkezes: f.tervezett_erkezes,
    uresKm: szamVagyNull(f.ures_km),
    rakottKm: szamVagyNull(f.rakott_km),
    kmForras: f.km_forras,
    raklapDb: f.raklap_db,
    figyelmeztetesek: Array.isArray(f.figyelmeztetesek) ? f.figyelmeztetesek : [],
    lezarvaAt: f.lezarva_at,
    partner: f.partner,
    hivatkozas: f.hivatkozas,
  };
}

/** A menetek feladatai egy lekérdezéssel. */
export async function menetFeladatai(menetIds: string[], q: Querier = query): Promise<Map<string, MenetFeladat[]>> {
  const ki = new Map<string, MenetFeladat[]>();
  if (menetIds.length === 0) return ki;
  const sorok = await q<FeladatSor>(
    `select f.id::text, f.menet_id::text, f.sorszam, f.feladat_tipus, f.megbizas_id::text,
       f.kiindulo_cim, f.cel_cim, f.kiindulo_telephely_pont_id::text, f.cel_telephely_pont_id::text,
       f.tervezett_indulas::text, f.tervezett_erkezes::text, f.ures_km::text, f.rakott_km::text,
       f.km_forras, f.raklap_db, f.figyelmeztetesek, f.lezarva_at::text,
       coalesce(p.nev, mb.megrendelo) as partner,
       coalesce(mb.hivatkozas_kanonikus, mb.pozicioszam, mb.reise_id) as hivatkozas
     from menet_feladat f
     left join fuvar_megbizasok mb on mb.id = f.megbizas_id
     left join fuvar_partnerek p on p.id = mb.partner_id
     where f.menet_id = any($1::bigint[])
     order by f.menet_id, f.sorszam`,
    [menetIds]
  );
  for (const s of sorok) ki.set(s.menet_id, [...(ki.get(s.menet_id) ?? []), feladatSorbol(s)]);
  return ki;
}

function menetSorbol(m: MenetSor, feladatok: MenetFeladat[]): Menet {
  return {
    id: m.id, jarmuId: m.jarmu_id, jarmuKod: m.jarmu_kod, nap: m.nap, allapot: m.allapot, verzio: m.verzio,
    jovahagyta: m.jovahagyta, jovahagyvaAt: m.jovahagyva_at, modositvaAt: m.modositva_at, feladatok,
  };
}

/** Egy kocsi egy napjának menete (feladatokkal), vagy null. */
export async function getMenet(jarmuId: string, nap: string, q: Querier = query): Promise<Menet | null> {
  const [m] = await q<MenetSor>(
    `select ${MENET_OSZLOPOK} from fuvar_menet m join fuvar_jarmuvek j on j.id = m.jarmu_id
     where m.jarmu_id = $1 and m.nap = $2::date`,
    [jarmuId, nap]
  );
  if (!m) return null;
  return menetSorbol(m, (await menetFeladatai([m.id], q)).get(m.id) ?? []);
}

/** Egy menet azonosító szerint (feladatokkal), vagy null. */
export async function getMenetById(menetId: string, q: Querier = query): Promise<Menet | null> {
  const [m] = await q<MenetSor>(
    `select ${MENET_OSZLOPOK} from fuvar_menet m join fuvar_jarmuvek j on j.id = m.jarmu_id where m.id = $1`,
    [menetId]
  );
  if (!m) return null;
  return menetSorbol(m, (await menetFeladatai([m.id], q)).get(m.id) ?? []);
}

/**
 * Egy kocsi egy napjának JÓVÁHAGYOTT (jovahagyott / folyamatban / lezart)
 * menete szerinti megbízás-sorrend, vagy null, ha nincs ilyen menet.
 */
export async function menetSorrend(jarmuId: string, nap: string): Promise<string[] | null> {
  try {
    const [s] = await query<{ idk: string[] | null }>(
      `select array_agg(f.megbizas_id::text order by f.sorszam) filter (where f.megbizas_id is not null) as idk
       from fuvar_menet m join menet_feladat f on f.menet_id = m.id
       where m.jarmu_id = $1 and m.nap = $2::date and m.allapot = any($3::text[])`,
      [jarmuId, nap, [...JOVAHAGYOTT_ALLAPOTOK]]
    );
    return s?.idk?.length ? s.idk : null;
  } catch {
    return null;
  }
}

/** Kocsi-kód → nap → a jóváhagyott menet megbízás-sorrendje. */
export type MenetSorrendTerkep = Map<string, Map<string, string[]>>;

/**
 * Az összes jóváhagyott menet sorrendje egy napközben, EGY lekérdezéssel,
 * kocsi-kód (fuvar_jarmuvek.kod) és nap szerint. Hiba (pl. még nincs tábla)
 * esetén üres — a hívó ilyenkor a közös napi szabállyal megy.
 */
export async function menetSorrendek(napTol: string, napIg: string): Promise<MenetSorrendTerkep> {
  const ki: MenetSorrendTerkep = new Map();
  try {
    const sorok = await query<{ kod: string; nap: string; idk: string[] | null }>(
      `select j.kod, m.nap::text as nap,
         array_agg(f.megbizas_id::text order by f.sorszam) filter (where f.megbizas_id is not null) as idk
       from fuvar_menet m
       join fuvar_jarmuvek j on j.id = m.jarmu_id
       join menet_feladat f on f.menet_id = m.id
       where m.nap between $1::date and $2::date and m.allapot = any($3::text[])
       group by j.kod, m.nap`,
      [napTol, napIg, [...JOVAHAGYOTT_ALLAPOTOK]]
    );
    for (const s of sorok) {
      if (!s.idk?.length) continue;
      if (!ki.has(s.kod)) ki.set(s.kod, new Map());
      ki.get(s.kod)!.set(s.nap, s.idk);
    }
  } catch (err) {
    console.warn("[menet] a jóváhagyott sorrend nem olvasható, a közös napi szabály marad:", err instanceof Error ? err.message : err);
  }
  return ki;
}

/** Egy kocsi napjainak sorrendjei növekvő nap szerint (többnapos listához). */
export function kocsiSorrendjei(terkep: MenetSorrendTerkep, kod: string | null | undefined): string[][] {
  const napok = kod ? terkep.get(kod) : undefined;
  if (!napok) return [];
  return [...napok.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, s]) => s);
}
