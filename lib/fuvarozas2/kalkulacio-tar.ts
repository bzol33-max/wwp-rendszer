import "server-only";
import { createHash } from "node:crypto";
import { query } from "@/lib/db";
import { kozosKalkulacio, type KozosEredmeny } from "@/lib/fuvarozas2/kalkulator-szamitas";
import { NAPI_KOLTSEG_FT } from "@/lib/fuvarozas2/kalkulator-alap";

// A bérmegbízások kalkulációja tárolva (fuvar_kalkulacio, 2026-09-30):
// Budaházi Zoltán kérése, hogy ami egyszer ki van számolva, rögzüljön, és ne
// lassítsa az oldalt. Az oldal csak OLVAS; számolni a háttér (óránként, a
// modell-szinkron körében) és — egyetlen, épp megnyitott megbízásra — az
// oldal számol, ha még nincs tárolt eredmény.
//
// Elavulás: a bemenet_kulcs a számítás bemenetének ujjlenyomata (megállók,
// díj, kocsi, a hónap — a NAV-ár havonta változik —, a napi költség, a
// verzió). Ha a megbízás változik, a kulcs eltér; 7 napnál régebbi eredmény
// is elavult (a mért fogyasztás 14 napos ablakból jön). Elavult eredmény is
// látszik („frissítés alatt”), amíg az új el nem készül.

const VERZIO = 1;
const ELAVUL_NAP = 7;

export type TaroltKalkulacio = {
  eredmeny: KozosEredmeny | null;
  hiba: string | null;
  szamolvaAt: string;
  elavult: boolean;
};

type Bemenet = { id: string; megallok: string[]; ajanlatFt: number | null; jarmuKod: string | null; honap: string };

async function bemenetek(ids: string[]): Promise<Bemenet[]> {
  if (ids.length === 0) return [];
  const sorok = await query<{ id: string; megallok: string[] | null; felrako: string | null; lerako: string | null; fuvardij: number | null; penznem: string; jarmu_kod: string | null; honap: string }>(
    `select m.id::text,
       (select array_agg(g.cim_nyers order by g.sorszam) from fuvar_megallok g where g.megbizas_id = m.id and coalesce(g.cim_nyers, '') <> '') as megallok,
       m.felrako, m.lerako, m.fuvardij, coalesce(m.fuvardij_penznem, 'Ft') as penznem, j.kod as jarmu_kod,
       to_char((now() at time zone 'Europe/Budapest')::date, 'YYYY-MM') as honap
     from fuvar_megbizasok m left join fuvar_jarmuvek j on j.id = m.jarmu_id
     where m.id = any($1::bigint[])`,
    [ids]
  );
  return sorok.map((s) => ({
    id: s.id,
    megallok: s.megallok && s.megallok.length >= 2 ? s.megallok : [s.felrako, s.lerako].filter((x): x is string => !!x?.trim()),
    ajanlatFt: s.penznem === "Ft" && s.fuvardij ? Number(s.fuvardij) : null,
    jarmuKod: s.jarmu_kod,
    honap: s.honap,
  }));
}

function kulcs(b: Bemenet): string {
  return createHash("sha1")
    .update(JSON.stringify({ v: VERZIO, m: b.megallok, a: b.ajanlatFt, j: b.jarmuKod, h: b.honap, n: NAPI_KOLTSEG_FT }))
    .digest("hex");
}

/** A tárolt kalkulációk (az elavultak is, jelölve). */
export async function getTaroltKalkulaciok(ids: string[]): Promise<Map<string, TaroltKalkulacio>> {
  const ki = new Map<string, TaroltKalkulacio>();
  if (ids.length === 0) return ki;
  const [be, tar] = await Promise.all([
    bemenetek(ids),
    query<{ id: string; bemenet_kulcs: string; eredmeny: KozosEredmeny | null; hiba: string | null; szamolva_at: string; regi: boolean }>(
      `select megbizas_id::text as id, bemenet_kulcs, eredmeny, hiba, szamolva_at::text,
         szamolva_at < now() - make_interval(days => $2) as regi
       from fuvar_kalkulacio where megbizas_id = any($1::bigint[])`,
      [ids, ELAVUL_NAP]
    ),
  ]);
  const kulcsok = new Map(be.map((b) => [b.id, kulcs(b)]));
  for (const t of tar) {
    ki.set(t.id, { eredmeny: t.eredmeny, hiba: t.hiba, szamolvaAt: t.szamolva_at, elavult: t.regi || kulcsok.get(t.id) !== t.bemenet_kulcs });
  }
  return ki;
}

const folyamatban = new Set<string>();

/** Kiszámolja és eltárolja egy megbízás kalkulációját (a térkép-geometria nélkül). */
export async function szamoldEsTarold(id: string): Promise<TaroltKalkulacio | null> {
  if (folyamatban.has(id)) return null;
  folyamatban.add(id);
  try {
    const [b] = await bemenetek([id]);
    if (!b) return null;
    let eredmeny: KozosEredmeny | null = null;
    let hiba: string | null = null;
    if (b.megallok.length < 2) {
      hiba = "Nincs felrakó és lerakó cím.";
    } else {
      const r = await kozosKalkulacio({ megallok: b.megallok, jarmuKod: b.jarmuKod ?? undefined, ajanlatFt: b.ajanlatFt ?? undefined, vanVisszfuvar: false });
      if (r.ok) eredmeny = { ...r.eredmeny, route: { ...r.eredmeny.route, geometryLonLat: null } };
      else hiba = r.hiba;
    }
    const [sor] = await query<{ szamolva_at: string }>(
      `insert into fuvar_kalkulacio (megbizas_id, bemenet_kulcs, eredmeny, hiba, szamolva_at) values ($1, $2, $3, $4, now())
       on conflict (megbizas_id) do update set bemenet_kulcs = excluded.bemenet_kulcs, eredmeny = excluded.eredmeny, hiba = excluded.hiba, szamolva_at = now()
       returning szamolva_at::text`,
      [id, kulcs(b), eredmeny ? JSON.stringify(eredmeny) : null, hiba]
    );
    return { eredmeny, hiba, szamolvaAt: sor.szamolva_at, elavult: false };
  } finally {
    folyamatban.delete(id);
  }
}

/** Az adott megbízások közül a hiányzókat és elavultakat egymás után újraszámolja (háttérben hívandó). */
export async function frissitsKalkulaciokat(ids: string[], korlat = 25): Promise<{ szamolt: number; hibas: number }> {
  const tar = await getTaroltKalkulaciok(ids);
  const kell = ids.filter((id) => !tar.has(id) || tar.get(id)!.elavult).slice(0, korlat);
  let szamolt = 0, hibas = 0;
  for (const id of kell) {
    try {
      const r = await szamoldEsTarold(id);
      if (r?.eredmeny) szamolt++; else if (r) hibas++;
    } catch (err) {
      hibas++;
      console.error(`[kalkulacio-tar] #${id} nem számolható:`, err);
    }
  }
  return { szamolt, hibas };
}

/** A Tervezés által mutatott bérmegbízások: a nyitottak az elmúlt 2 héttől előre. */
export async function tervezettBerMegbizasok(): Promise<string[]> {
  const sorok = await query<{ id: string }>(
    `select id::text from fuvar_megbizasok
     where torolt_at is null and jelleg = 'ber' and allapot in ('ellenorzesre_var', 'tervezett', 'folyamatban')
       and coalesce(lerakas_datum, datum) >= (now() at time zone 'Europe/Budapest')::date - 14
     order by datum`
  );
  return sorok.map((s) => s.id);
}
