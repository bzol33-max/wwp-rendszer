import "server-only";
import { query, withTransaction, type Querier } from "@/lib/db";
import { calculateToll } from "@/lib/fuvarozas/utdijkalkulacio";
import { geokodolCachelve } from "@/lib/fuvarozas/erintes-felismeres";
import { getJarmuIndulasiTelephely } from "@/lib/fuvarozas/telephelyek-db";
import { getJarmuvek } from "@/lib/fuvarozas/jarmuvek-db";
import { getFuvarBeallitasok } from "@/lib/beallitasok/fuvar";
import { budapestNapISO } from "@/lib/fuvarozas/idozona";
import { cimKulcs } from "@/lib/fuvarozas/varos";
import { idobelyegMs, tervIdoMegbizasbol } from "@/lib/fuvarozas2/napi-sorrend";
import {
  KOZUTI_SZORZO,
  epitMenetJavaslat,
  feladatUjjlenyomat,
  legvonalKm,
  raklapMennyisegbol,
  type MenetJavaslatBemenet,
} from "@/lib/menet/menet-alap";
import { menetFeladatai } from "@/lib/menet/repo";
import type { FeladatJavaslat, Hely, MenetFeladat, MenetMunka, Pont, PotkocsiKapacitas, TavFn, TelephelyPontAdat } from "@/lib/menet/tipusok";

// Menetterv — a javaslat kiszámolása és mentése (szerver). A tiszta rész a
// menet-alap.ts; ez gyűjti az adatot (megbízások, megállók koordinátái,
// pótkocsi-kapacitás, telephely-pontok, beállítások) és írja a
// fuvar_menet / menet_feladat táblát. JÓVÁHAGYOTT menetet SOHA nem ír
// felül — azt csak az átrendezés (akciok.ts) módosítja.

/** Átlagsebesség a tervezett időkhöz (km/h) — nyerges szerelvény, vegyes út. */
const ATLAG_SEBESSEG_KMH = 60;
/** Ennyi napnál régebbi lerakó már nem indulási hely: a kocsi akkor a telephelyéről indul. */
const INDULAS_NAPOK = 3;
const LEZART_ALLAPOTOK = ["teljesitve", "szamlazhato", "szamlazva", "email_elment", "postazva", "lezart"];

/**
 * Szerveroldali távolság: HU-GO útvonal (J5, EURO6, 40 t; a kulso-hivas
 * gyorsítótárával), ha az nem érhető el, légvonal × 1,3 — 'becsles'
 * jelöléssel. A cím koordinátája a megállóból, különben a helyszín-szótár
 * / geokód-gyorsítótár (geokodolCachelve). Egy körön belül memoizált.
 */
export function szerverTav(): TavFn {
  const pontCache = new Map<string, Pont | null>();
  const tavCache = new Map<string, { km: number; forras: "hugo" | "becsles" } | null>();
  async function pont(h: Hely): Promise<Pont | null> {
    if (h.pont) return h.pont;
    const cim = h.cim?.trim();
    if (!cim) return null;
    if (!pontCache.has(cim)) {
      const g = await geokodolCachelve(cim).catch(() => null);
      pontCache.set(cim, g ? { lat: g.lat, lon: g.lon } : null);
    }
    return pontCache.get(cim) ?? null;
  }
  return async (a, b) => {
    const [p, q] = await Promise.all([pont(a), pont(b)]);
    if (!p || !q) return null;
    const kulcs = `${p.lat.toFixed(4)},${p.lon.toFixed(4)}→${q.lat.toFixed(4)},${q.lon.toFixed(4)}`;
    if (tavCache.has(kulcs)) return tavCache.get(kulcs)!;
    let ki: { km: number; forras: "hugo" | "becsles" };
    if (legvonalKm(p, q) < 0.5) ki = { km: 0, forras: "hugo" };
    else {
      try {
        const r = await calculateToll({ points: [p, q], vehicleCategory: "J5", euroCategory: "EURO6", weight: 40 });
        ki = { km: r.distanceKm, forras: "hugo" };
      } catch {
        ki = { km: Math.round(legvonalKm(p, q) * KOZUTI_SZORZO), forras: "becsles" };
      }
    }
    tavCache.set(kulcs, ki);
    return ki;
  };
}

type MunkaSor = {
  id: string; jelleg: "ber" | "sajat"; allapot: string; felrakas_nap: string | null; lerakas_nap: string | null;
  felrako: string | null; fel_lat: number | null; fel_lon: number | null;
  lerako: string | null; le_lat: number | null; le_lon: number | null;
  felrakas_ablak_tol: string | null; felrakas_ablak_ig: string | null; lerakas_ablak_tol: string | null; lerakas_ablak_ig: string | null;
  idopont: string | null; rakott_km: number | null; mennyiseg: string | null; teny: string | null;
};

const pontVagyNull = (lat: number | null, lon: number | null): Pont | null => (lat != null && lon != null ? { lat: Number(lat), lon: Number(lon) } : null);

/** Egy kocsi egy napjának megbízásai (a nap a felrakás és a lerakás napja közé esik). */
async function napiMunkak(jarmuId: string, nap: string): Promise<MenetMunka[]> {
  const sorok = await query<MunkaSor>(
    `select m.id::text, m.jelleg, m.allapot,
       to_char(m.datum, 'YYYY-MM-DD') as felrakas_nap, to_char(coalesce(m.lerakas_datum, m.datum), 'YYYY-MM-DD') as lerakas_nap,
       coalesce(fel.cim_nyers, m.felrako) as felrako, fel.lat as fel_lat, fel.lon as fel_lon,
       coalesce(le.cim_nyers, m.lerako) as lerako, le.lat as le_lat, le.lon as le_lon,
       m.felrakas_ablak_tol::text, m.felrakas_ablak_ig::text, m.lerakas_ablak_tol::text, m.lerakas_ablak_ig::text,
       m.idopont, m.rakott_km::float8 as rakott_km, m.mennyiseg,
       (select min(x)::text from fuvar_megallok g, lateral (values (g.gps_erkezes), (g.sofor_megerkezett_at), (g.sofor_kesz_at)) v(x)
         where g.megbizas_id = m.id) as teny
     from fuvar_megbizasok m
     left join lateral (select g.cim_nyers, g.lat, g.lon from fuvar_megallok g where g.megbizas_id = m.id and g.tipus = 'felrako' order by g.sorszam limit 1) fel on true
     left join lateral (select g.cim_nyers, g.lat, g.lon from fuvar_megallok g where g.megbizas_id = m.id and g.tipus = 'lerako' order by g.sorszam desc limit 1) le on true
     where m.jarmu_id = $1 and m.torolt_at is null and m.allapot is not null and m.allapot <> 'ellenorzesre_var'
       and not coalesce(m.elokeszites, false)
       and m.datum <= $2::date and coalesce(m.lerakas_datum, m.datum) >= $2::date
     order by m.datum, m.id`,
    [jarmuId, nap]
  );
  return sorok.map((s) => {
    const r = raklapMennyisegbol(s.mennyiseg);
    return {
      id: s.id,
      jelleg: s.jelleg,
      felrakasNap: s.felrakas_nap,
      lerakasNap: s.lerakas_nap,
      felrako: { cim: s.felrako, pont: pontVagyNull(s.fel_lat, s.fel_lon) },
      lerako: { cim: s.lerako, pont: pontVagyNull(s.le_lat, s.le_lon) },
      tervIdo: tervIdoMegbizasbol(s.felrakas_nap, s.felrakas_ablak_tol, s.idopont),
      felrakasAblakIg: idobelyegMs(s.felrakas_ablak_ig),
      lerakasAblakTol: idobelyegMs(s.lerakas_ablak_tol),
      lerakasAblakIg: idobelyegMs(s.lerakas_ablak_ig),
      tenyIdo: idobelyegMs(s.teny),
      lezart: LEZART_ALLAPOTOK.includes(s.allapot),
      rakottKm: s.rakott_km != null ? Number(s.rakott_km) : null,
      raklapDb: r.raklapDb,
      raklaphely: r.raklaphely,
    };
  });
}

async function telephelyPontok(): Promise<TelephelyPontAdat[]> {
  try {
    const sorok = await query<{ id: string; nev: string; cim: string; lat: number | null; lon: number | null }>(
      `select id::text, nev, cim, lat, lon from telephely_pont where aktiv order by indulasi_pont desc, sorrend, id`
    );
    return sorok.map((s) => ({ id: s.id, nev: s.nev, cim: s.cim, pont: pontVagyNull(s.lat, s.lon) }));
  } catch {
    return [];
  }
}

/** Ahonnan a kocsi a napot kezdi: az utolsó (legfeljebb 3 napos) lerakója, különben a saját telephelye. */
async function indulasiHely(jarmuId: string, jarmuKod: string, nap: string, telephelyek: TelephelyPontAdat[]): Promise<Hely> {
  const [elozo] = await query<{ cim: string | null; lat: number | null; lon: number | null }>(
    `select coalesce(le.cim_nyers, m.lerako) as cim, le.lat, le.lon
     from fuvar_megbizasok m
     left join lateral (select g.cim_nyers, g.lat, g.lon from fuvar_megallok g where g.megbizas_id = m.id and g.tipus = 'lerako' order by g.sorszam desc limit 1) le on true
     where m.jarmu_id = $1 and m.torolt_at is null and m.allapot is not null and m.allapot <> 'ellenorzesre_var'
       and not coalesce(m.elokeszites, false)
       and coalesce(m.lerakas_datum, m.datum) < $2::date and coalesce(m.lerakas_datum, m.datum) >= $2::date - $3::int
     order by coalesce(m.lerakas_datum, m.datum) desc, m.lerakas_ablak_tol desc nulls last, m.id desc
     limit 1`,
    [jarmuId, nap, INDULAS_NAPOK]
  );
  if (elozo?.cim?.trim()) return { cim: elozo.cim, pont: pontVagyNull(elozo.lat, elozo.lon) };
  const t = await getJarmuIndulasiTelephely(jarmuKod);
  const tp = telephelyek.find((x) => x.nev === t.nev) ?? telephelyek.find((x) => cimKulcs(x.cim) === cimKulcs(t.cim));
  return { cim: t.cim, pont: pontVagyNull(t.lat ?? null, t.lon ?? null) ?? tp?.pont ?? null, telephelyPontId: tp?.id ?? null };
}

export type MenetAdat = Omit<MenetJavaslatBemenet, "tav" | "sorrend" | "elsoIndulas" | "sorszamKezdet"> & { jarmuKod: string };

/** A javaslat bemenete egy kocsi egy napjára (adatbázisból). */
export async function menetAdat(jarmuId: string, nap: string): Promise<MenetAdat | null> {
  const [j] = await query<{ kod: string; rhn: number | null; rhf: number | null; rdn: number | null; rdf: number | null; van: boolean }>(
    `select j.kod, p.raklaphely_normal as rhn, p.raklaphely_forgatott as rhf, p.raklap_db_normal as rdn, p.raklap_db_forgatott as rdf,
       p.id is not null as van
     from fuvar_jarmuvek j left join fuvar_potkocsik p on p.id = j.potkocsi_id where j.id = $1`,
    [jarmuId]
  );
  if (!j) return null;
  const kapacitas: PotkocsiKapacitas | null = j.van
    ? { raklaphelyNormal: j.rhn, raklaphelyForgatott: j.rhf, raklapDbNormal: j.rdn, raklapDbForgatott: j.rdf }
    : null;
  const [telephelyek, munkak, b] = await Promise.all([telephelyPontok(), napiMunkak(jarmuId, nap), getFuvarBeallitasok()]);
  return {
    jarmuKod: j.kod,
    nap,
    munkak,
    indulas: await indulasiHely(jarmuId, j.kod, nap, telephelyek),
    telephelyek,
    kapacitas,
    beallitas: {
      uresIndulasFigyelmeztetesKm: b.ures_indulas_figyelmeztetes_km,
      felrakasRahagyasPerc: b.felrakas_rahagyas_perc,
      lerakasRahagyasPerc: b.lerakas_rahagyas_perc,
      atlagSebessegKmh: ATLAG_SEBESSEG_KMH,
    },
  };
}

/** A mentett feladat a javaslat alakjára (az ujjlenyomat-összevetéshez). */
export function mentettJavaslatkent(f: MenetFeladat): FeladatJavaslat {
  return {
    sorszam: f.sorszam,
    feladatTipus: f.feladatTipus,
    megbizasId: f.megbizasId,
    kiinduloCim: f.kiinduloCim,
    celCim: f.celCim,
    kiinduloTelephelyPontId: f.kiinduloTelephelyPontId,
    celTelephelyPontId: f.celTelephelyPontId,
    tervezettIndulas: idobelyegMs(f.tervezettIndulas),
    tervezettErkezes: idobelyegMs(f.tervezettErkezes),
    uresKm: f.uresKm,
    rakottKm: f.rakottKm,
    kmForras: f.kmForras,
    raklapDb: f.raklapDb,
    figyelmeztetesek: f.figyelmeztetesek,
  };
}

const isoVagyNull = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString());

/** Feladatok beszúrása egy menethez (tranzakción belül). */
export async function beszurFeladatokat(tx: Querier, menetId: string, feladatok: FeladatJavaslat[]): Promise<void> {
  for (const f of feladatok) {
    await tx(
      `insert into menet_feladat (menet_id, sorszam, feladat_tipus, megbizas_id, kiindulo_cim, cel_cim,
         kiindulo_telephely_pont_id, cel_telephely_pont_id, tervezett_indulas, tervezett_erkezes,
         ures_km, rakott_km, km_forras, raklap_db, figyelmeztetesek)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb)`,
      [
        menetId, f.sorszam, f.feladatTipus, f.megbizasId, f.kiinduloCim, f.celCim,
        f.kiinduloTelephelyPontId, f.celTelephelyPontId, isoVagyNull(f.tervezettIndulas), isoVagyNull(f.tervezettErkezes),
        f.uresKm, f.rakottKm, f.kmForras, f.raklapDb, JSON.stringify(f.figyelmeztetesek),
      ]
    );
  }
}

export type JavaslatEredmeny =
  | { eredmeny: "uj" | "frissult" | "valtozatlan"; menetId: string | null; verzio: number }
  | { eredmeny: "jovahagyott"; menetId: string; verzio: number };

/**
 * Egy kocsi egy napjának javaslata: kiszámolja (a tranzakción KÍVÜL — HU-GO
 * hívás lehet benne), aztán zárolva összeveti a mentettel. Jóváhagyott
 * menethez nem nyúl. Csak változás esetén ír, és akkor nő a verzió. Ha
 * nincs munka és menet sincs, nem hoz létre üres menetet.
 */
export async function frissitMenetJavaslatot(jarmuId: string, nap: string, ki: string, tav: TavFn = szerverTav()): Promise<JavaslatEredmeny> {
  const adat = await menetAdat(jarmuId, nap);
  if (!adat) throw new Error("Nincs ilyen kocsi.");
  const feladatok = await epitMenetJavaslat({ ...adat, tav });
  return withTransaction(async (tx) => {
    let [m] = await tx<{ id: string; allapot: string; verzio: number }>(
      `select id::text, allapot, verzio from fuvar_menet where jarmu_id = $1 and nap = $2::date for update`,
      [jarmuId, nap]
    );
    if (m && m.allapot !== "javaslat") return { eredmeny: "jovahagyott", menetId: m.id, verzio: m.verzio };
    if (!m) {
      if (feladatok.length === 0) return { eredmeny: "valtozatlan", menetId: null, verzio: 0 };
      [m] = await tx<{ id: string; allapot: string; verzio: number }>(
        `insert into fuvar_menet (jarmu_id, nap) values ($1, $2::date)
         on conflict (jarmu_id, nap) do nothing returning id::text, allapot, verzio`,
        [jarmuId, nap]
      );
      if (!m) return { eredmeny: "valtozatlan", menetId: null, verzio: 0 }; // párhuzamos kör hozta létre
      await beszurFeladatokat(tx, m.id, feladatok);
      await tx(
        `insert into menet_esemeny (menet_id, esemeny, verzio, ki, reszletek) values ($1, 'javaslat_letrehozva', $2, $3, $4::jsonb)`,
        [m.id, m.verzio, ki, JSON.stringify({ feladat_db: feladatok.length })]
      );
      return { eredmeny: "uj", menetId: m.id, verzio: m.verzio };
    }
    const mentett = ((await menetFeladatai([m.id], tx)).get(m.id) ?? []).map(mentettJavaslatkent);
    if (feladatUjjlenyomat(mentett) === feladatUjjlenyomat(feladatok)) return { eredmeny: "valtozatlan", menetId: m.id, verzio: m.verzio };
    await tx(`delete from menet_feladat where menet_id = $1`, [m.id]);
    await beszurFeladatokat(tx, m.id, feladatok);
    const [u] = await tx<{ verzio: number }>(
      `update fuvar_menet set verzio = verzio + 1, modositva_at = now() where id = $1 returning verzio`,
      [m.id]
    );
    await tx(
      `insert into menet_esemeny (menet_id, esemeny, verzio, ki, reszletek) values ($1, 'javaslat_frissitve', $2, $3, $4::jsonb)`,
      [m.id, u.verzio, ki, JSON.stringify({ feladat_db: feladatok.length, elozo_db: mentett.length })]
    );
    return { eredmeny: "frissult", menetId: m.id, verzio: u.verzio };
  });
}

/**
 * Árnyék-generálás az óránkénti körből: minden aktív kocsira ma és holnap
 * (budapesti napok) a 'javaslat' menet frissítése; a jóváhagyottat kihagyja.
 * SOHA nem dob — kocsinként elkapja és naplózza a hibát.
 */
export async function frissitsMenetJavaslatokat(most: Date = new Date()): Promise<{ frissult: number; valtozatlan: number; jovahagyott: number; hiba: number }> {
  const eredmeny = { frissult: 0, valtozatlan: 0, jovahagyott: 0, hiba: 0 };
  try {
    const ma = budapestNapISO(most);
    const holnap = budapestNapISO(new Date(Date.parse(`${ma}T12:00:00Z`) + 24 * 3600 * 1000));
    const jarmuvek = (await getJarmuvek()).filter((j): j is typeof j & { id: string } => !!j.id);
    const tav = szerverTav();
    for (const j of jarmuvek) {
      for (const nap of [ma, holnap]) {
        try {
          const r = await frissitMenetJavaslatot(j.id, nap, "rendszer:menetterv", tav);
          if (r.eredmeny === "jovahagyott") eredmeny.jovahagyott++;
          else if (r.eredmeny === "valtozatlan") eredmeny.valtozatlan++;
          else eredmeny.frissult++;
        } catch (err) {
          eredmeny.hiba++;
          console.error(`[menetterv] ${j.kod ?? j.id} ${nap} javaslata nem frissült:`, err instanceof Error ? err.message : err);
        }
      }
    }
  } catch (err) {
    eredmeny.hiba++;
    console.error("[menetterv] váratlan hiba:", err instanceof Error ? err.message : err);
  }
  return eredmeny;
}
