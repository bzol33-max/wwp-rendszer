import "server-only";
import { query, withTransaction, type Querier } from "@/lib/db";
import { calculateToll, TollCalcError } from "@/lib/fuvarozas/utdijkalkulacio";
import { geokodolCachelve } from "@/lib/fuvarozas/erintes-felismeres";
import { getJarmuIndulasiTelephely } from "@/lib/fuvarozas/telephelyek-db";
import { getJarmuvek } from "@/lib/fuvarozas/jarmuvek-db";
import { getFuvarBeallitasok } from "@/lib/beallitasok/fuvar";
import { budapestNapISO } from "@/lib/fuvarozas/idozona";
import { cimKulcs } from "@/lib/fuvarozas/varos";
import { idobelyegMs, tervIdoMegbizasbol } from "@/lib/fuvarozas2/napi-sorrend";
import {
  KOZUTI_SZORZO,
  NAP_KEZDES_ALAP_PERC,
  elozoMenetVege,
  epitMenetJavaslat,
  legvonalKm,
  napKezdesPercbol,
  osszevetJavaslatot,
  raklapMennyisegbol,
  type ElozoMenetFeladat,
  type MenetJavaslatBemenet,
} from "@/lib/menet/menet-alap";
import { hugoVagyBecsles, ujHugoKor, type HugoKor } from "@/lib/menet/hugo-megszakito";
import { menetFeladatai } from "@/lib/menet/repo";
import type { FeladatJavaslat, Hely, MenetFeladat, MenetMunka, Pont, PotkocsiKapacitas, TavFn, TelephelyPontAdat } from "@/lib/menet/tipusok";

// Menetterv — a javaslat kiszámolása és mentése (szerver). A tiszta rész a
// menet-alap.ts; ez gyűjti az adatot (megbízások, megállók koordinátái,
// pótkocsi-kapacitás, telephely-pontok, beállítások) és írja a
// fuvar_menet / menet_feladat táblát. JÓVÁHAGYOTT menetet SOHA nem ír
// felül — azt csak az átrendezés (akciok.ts) módosítja.

/** Átlagsebesség a tervezett időkhöz (km/h) — nyerges szerelvény, vegyes út. */
export const ATLAG_SEBESSEG_KMH = 60;
/** Ennyi napnál régebbi lerakó már nem indulási hely: a kocsi akkor a telephelyéről indul. */
const INDULAS_NAPOK = 3;
const LEZART_ALLAPOTOK = ["teljesitve", "szamlazhato", "szamlazva", "email_elment", "postazva", "lezart"];

/** A HU-GO „nincs útvonal / rossz címpár” hibája — ez nem állítja le a kört (lásd hugo-megszakito.ts). */
export const cimparHiba = (err: unknown) => err instanceof TollCalcError;

/**
 * Szerveroldali távolság: HU-GO útvonal (J5, EURO6, 40 t; a kulso-hivas
 * gyorsítótárával), ha az nem érhető el, légvonal × 1,3 — 'becsles'
 * jelöléssel. A cím koordinátája a megállóból, különben a helyszín-szótár
 * / geokód-gyorsítótár (geokodolCachelve). Egy körön belül memoizált; a
 * `kor` megszakítója az első HU-GO időtúllépés / hálózati hiba után a kör
 * hátralévő részére becslésre vált (hugo-megszakito.ts).
 */
export function szerverTav(kor: HugoKor = ujHugoKor()): TavFn {
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
      const r = await hugoVagyBecsles<{ km: number; forras: "hugo" | "becsles" }>(
        kor,
        async () => ({ km: (await calculateToll({ points: [p, q], vehicleCategory: "J5", euroCategory: "EURO6", weight: 40 })).distanceKm, forras: "hugo" as const }),
        () => ({ km: Math.round(legvonalKm(p, q) * KOZUTI_SZORZO), forras: "becsles" as const }),
        { cimparHiba }
      );
      ki = r.ertek;
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

// A munka-sor oszlopai (a napi lista és az egyetlen megbízás — optimalizáló — közös lekérdezése).
const MUNKA_OSZLOPOK = `select m.id::text, m.jelleg, m.allapot,
       to_char(m.datum, 'YYYY-MM-DD') as felrakas_nap, to_char(coalesce(m.lerakas_datum, m.datum), 'YYYY-MM-DD') as lerakas_nap,
       coalesce(fel.cim_nyers, m.felrako) as felrako, fel.lat as fel_lat, fel.lon as fel_lon,
       coalesce(le.cim_nyers, m.lerako) as lerako, le.lat as le_lat, le.lon as le_lon,
       m.felrakas_ablak_tol::text, m.felrakas_ablak_ig::text, m.lerakas_ablak_tol::text, m.lerakas_ablak_ig::text,
       m.idopont, m.rakott_km::float8 as rakott_km, m.mennyiseg,
       (select min(x)::text from fuvar_megallok g, lateral (values (g.gps_erkezes), (g.sofor_megerkezett_at), (g.sofor_kesz_at)) v(x)
         where g.megbizas_id = m.id) as teny
     from fuvar_megbizasok m
     left join lateral (select g.cim_nyers, g.lat, g.lon from fuvar_megallok g where g.megbizas_id = m.id and g.tipus = 'felrako' order by g.sorszam limit 1) fel on true
     left join lateral (select g.cim_nyers, g.lat, g.lon from fuvar_megallok g where g.megbizas_id = m.id and g.tipus = 'lerako' order by g.sorszam desc limit 1) le on true`;

/** Egy kocsi egy napjának megbízásai (a nap a felrakás és a lerakás napja közé esik). */
async function napiMunkak(jarmuId: string, nap: string): Promise<MenetMunka[]> {
  const sorok = await query<MunkaSor>(
    `${MUNKA_OSZLOPOK}
     where m.jarmu_id = $1 and m.torolt_at is null and m.allapot is not null and m.allapot <> 'ellenorzesre_var'
       and not coalesce(m.elokeszites, false)
       and m.datum <= $2::date and coalesce(m.lerakas_datum, m.datum) >= $2::date
     order by m.datum, m.id`,
    [jarmuId, nap]
  );
  return sorok.map(munkaSorbol);
}

/** Egy (akár kocsi nélküli, ellenőrzésre váró) megbízás munkaként — az optimalizáló hozzárendelés-javaslatához. */
export async function megbizasMunka(megbizasId: string): Promise<MenetMunka | null> {
  const [s] = await query<MunkaSor>(`${MUNKA_OSZLOPOK} where m.id = $1 and m.torolt_at is null`, [megbizasId]);
  return s ? munkaSorbol(s) : null;
}

function munkaSorbol(s: MunkaSor): MenetMunka {
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

/**
 * Ahonnan a kocsi a napot kezdi: az előző (legfeljebb 3 napos) MENET utolsó
 * feladatának célja (a jóváhagyott menet sorrendje szerint, különben a
 * javaslaté) — ez követi az átrendezést és az optimalizáló elfogadását;
 * ha nincs ilyen menet, a legutóbbi lerakó a megbízásokból; különben a kocsi
 * saját telephelye.
 */
async function indulasiHely(jarmuId: string, jarmuKod: string, nap: string, telephelyek: TelephelyPontAdat[]): Promise<Hely> {
  try {
    const sorok = await query<{ nap: string; allapot: string; sorszam: number; cel_cim: string | null; cel_tp: string | null; lat: number | null; lon: number | null; atnyulo: boolean }>(
      `select m.nap::text as nap, m.allapot, f.sorszam, f.cel_cim, f.cel_telephely_pont_id::text as cel_tp, le.lat, le.lon,
         coalesce(coalesce(mb.lerakas_datum, mb.datum) >= $2::date, false) as atnyulo
       from fuvar_menet m
       join menet_feladat f on f.menet_id = m.id
       left join fuvar_megbizasok mb on mb.id = f.megbizas_id
       left join lateral (select g.lat, g.lon from fuvar_megallok g where g.megbizas_id = f.megbizas_id and g.tipus = 'lerako' order by g.sorszam desc limit 1) le on true
       where m.jarmu_id = $1 and m.nap < $2::date and m.nap >= $2::date - $3::int`,
      [jarmuId, nap, INDULAS_NAPOK]
    );
    const tp = (id: string | null) => (id ? telephelyek.find((t) => t.id === id) ?? null : null);
    const vege = elozoMenetVege(sorok.map((s): ElozoMenetFeladat => ({
      nap: s.nap, allapot: s.allapot, sorszam: s.sorszam, celCim: s.cel_cim, celTelephelyPontId: s.cel_tp,
      pont: pontVagyNull(s.lat, s.lon) ?? tp(s.cel_tp)?.pont ?? null, atnyulo: s.atnyulo,
    })));
    if (vege) return vege;
  } catch (err) {
    console.warn("[menetterv] az előző menet nem olvasható, a megbízásokból indulunk:", err instanceof Error ? err.message : err);
  }
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

/** A nap kezdete (perc) a fuvar_beallitas 'nap_kezdes_ido' sorából („06:00”, 035-ös migráció); hiba / hiány: 06:00. */
async function napKezdesBeallitas(): Promise<number> {
  try {
    const [s] = await query<{ ertek: unknown }>(
      `select ertek from fuvar_beallitas where kulcs = 'nap_kezdes_ido' and ervenyes_tol <= now() order by ervenyes_tol desc, id desc limit 1`
    );
    return napKezdesPercbol(s?.ertek) ?? NAP_KEZDES_ALAP_PERC;
  } catch {
    return NAP_KEZDES_ALAP_PERC;
  }
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
  const [telephelyek, munkak, b, napKezdesPerc] = await Promise.all([telephelyPontok(), napiMunkak(jarmuId, nap), getFuvarBeallitasok(), napKezdesBeallitas()]);
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
      napKezdesPerc,
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

/**
 * A kocsi napjára legutóbb elfogadott optimalizáló-sorrend (033-as migráció),
 * vagy null. Hiba (pl. még nincs tábla) esetén null — a közös napi szabály marad.
 */
export async function elfogadottOptimalizaloSorrend(jarmuId: string, nap: string): Promise<string[] | null> {
  try {
    const [s] = await query<{ sorrend: unknown }>(
      `select javasolt->'sorrend' as sorrend from optimalizalo_javaslat
        where jarmu_id = $1 and nap = $2::date and tipus = 'sorrend' and allapot = 'elfogadva'
        order by dontes_at desc nulls last, id desc limit 1`,
      [jarmuId, nap]
    );
    return Array.isArray(s?.sorrend) && s.sorrend.every((x) => typeof x === "string") ? (s.sorrend as string[]) : null;
  } catch {
    return null;
  }
}

export type JavaslatEredmeny =
  | { eredmeny: "uj" | "frissult" | "km_frissult" | "valtozatlan"; menetId: string | null; verzio: number }
  | { eredmeny: "jovahagyott"; menetId: string; verzio: number };

/** A feladatok km-, idő- és figyelmeztetés-oszlopai helyben (sorszám szerint) — verzió-ugrás nélkül. */
async function frissitKmOszlopokat(tx: Querier, menetId: string, feladatok: FeladatJavaslat[]): Promise<void> {
  for (const f of feladatok) {
    await tx(
      `update menet_feladat set tervezett_indulas = $3, tervezett_erkezes = $4, ures_km = $5, rakott_km = $6, km_forras = $7, figyelmeztetesek = $8::jsonb
       where menet_id = $1 and sorszam = $2`,
      [menetId, f.sorszam, isoVagyNull(f.tervezettIndulas), isoVagyNull(f.tervezettErkezes), f.uresKm, f.rakottKm, f.kmForras, JSON.stringify(f.figyelmeztetesek)]
    );
  }
}

/**
 * Egy kocsi egy napjának javaslata: kiszámolja (a tranzakción KÍVÜL — HU-GO
 * hívás lehet benne), aztán zárolva összeveti a mentettel. Jóváhagyott
 * menethez nem nyúl — ezt MÁR A SZÁMOLÁS ELŐTT megnézi, hogy jóváhagyott
 * menetre ne menjen ki HU-GO hívás. Csak valódi változás esetén ír új
 * feladatlistát és nő a verzió; ha csak a km-ek ingadoznak (HU-GO ↔ becslés,
 * < 2 km), az új számok verzió-ugrás nélkül íródnak, a HU-GO → becslés
 * romlás pedig nem íródik (osszevetJavaslatot). Ha nincs munka és menet sincs,
 * nem hoz létre üres menetet.
 */
export async function frissitMenetJavaslatot(
  jarmuId: string,
  nap: string,
  ki: string,
  tav: TavFn = szerverTav(),
  sorrend?: readonly string[] | null
): Promise<JavaslatEredmeny> {
  const [elotte] = await query<{ id: string; allapot: string; verzio: number }>(
    `select id::text, allapot, verzio from fuvar_menet where jarmu_id = $1 and nap = $2::date`,
    [jarmuId, nap]
  );
  if (elotte && elotte.allapot !== "javaslat") return { eredmeny: "jovahagyott", menetId: elotte.id, verzio: elotte.verzio };
  const adat = await menetAdat(jarmuId, nap);
  if (!adat) throw new Error("Nincs ilyen kocsi.");
  // Kötött sorrend: a hívóé (optimalizáló elfogadása), különben a legutóbb
  // elfogadott optimalizáló-javaslaté — hogy az óránkénti kör ne írja vissza
  // a közös napi szabályra. Ha nincs ilyen: a közös napi szabály.
  const kotott = sorrend !== undefined ? sorrend : await elfogadottOptimalizaloSorrend(jarmuId, nap);
  const feladatok = await epitMenetJavaslat({ ...adat, tav, sorrend: kotott });
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
    const percPerKm = 60 / (adat.beallitas.atlagSebessegKmh > 0 ? adat.beallitas.atlagSebessegKmh : 60);
    const osszevetes = osszevetJavaslatot(mentett, feladatok, percPerKm);
    if (osszevetes === "azonos" || osszevetes === "becsles_romlas") return { eredmeny: "valtozatlan", menetId: m.id, verzio: m.verzio };
    if (osszevetes === "csak_km") {
      await frissitKmOszlopokat(tx, m.id, feladatok);
      return { eredmeny: "km_frissult", menetId: m.id, verzio: m.verzio };
    }
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
export async function frissitsMenetJavaslatokat(most: Date = new Date(), kor: HugoKor = ujHugoKor()): Promise<{ frissult: number; valtozatlan: number; jovahagyott: number; hiba: number }> {
  const eredmeny = { frissult: 0, valtozatlan: 0, jovahagyott: 0, hiba: 0 };
  try {
    const ma = budapestNapISO(most);
    const holnap = budapestNapISO(new Date(Date.parse(`${ma}T12:00:00Z`) + 24 * 3600 * 1000));
    const jarmuvek = (await getJarmuvek()).filter((j): j is typeof j & { id: string } => !!j.id);
    const tav = szerverTav(kor);
    for (const j of jarmuvek) {
      for (const nap of [ma, holnap]) {
        try {
          const r = await frissitMenetJavaslatot(j.id, nap, "rendszer:menetterv", tav);
          if (r.eredmeny === "jovahagyott") eredmeny.jovahagyott++;
          else if (r.eredmeny === "valtozatlan" || r.eredmeny === "km_frissult") eredmeny.valtozatlan++;
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
  if (kor.leallt) console.warn(`[menetterv] a HU-GO ebben a körben leállt (${kor.ok}) — a további szakaszok légvonal × 1,3 becslések.`);
  return eredmeny;
}
