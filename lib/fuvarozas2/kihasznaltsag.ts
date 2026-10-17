import "server-only";
import { query } from "@/lib/db";
import { getFuvarBeallitasok } from "@/lib/beallitasok/fuvar";
import { gazolajArKedvezmennyel } from "@/lib/fuvarozas/gazolaj";
import { getEurArfolyamok } from "@/lib/fuvarozas/arfolyam";
import { getJarmuIndulasiTelephely } from "@/lib/fuvarozas/telephelyek-db";
import { getJarmuvek } from "@/lib/fuvarozas/jarmuvek-db";
import { findJarmuByKod, type JarmuSzin } from "@/lib/fuvarozas/vehicles";
import { dijFtban } from "@/lib/fuvarozas2/kalkulacio-tar";
import { becsultTavolsag, lancKm } from "@/lib/fuvarozas2/ures-km";
import {
  hetkoznapE, kihasznaltsag, munkanapokSzama, napokListaja, sajatBelsoDij,
  type KocsiIdoszak, type Kihasznaltsag,
} from "@/lib/fuvarozas2/kihasznaltsag-alap";

// Kocsi-kihasználtság a Ma lapra (1. hullám B, docs/fuvarozas-1-hullam-terv.md):
// kocsinként a mostani hét (hétfő–ma) és a hónap eleje óta (1.–ma).
// A számolás tiszta: kihasznaltsag-alap.ts. NEM "use server" — a jogosultságot
// a hívó (getMaVaszon) ellenőrzi.
//
// HONNAN JÖN:
//   • időszakhoz tartozó fuvar: az első felrakása (m.datum) az időszakban van
//     és legkésőbb ma — ugyanaz a szabály, mint a régi bérfuvar-csempéé;
//     törölt és „ellenőrzésre vár” nem számít;
//   • bérbevétel: nettó fuvardíj; az EUR a felrakás napjának MNB-árfolyamán
//     (dijFtban, kalkulacio-tar.ts — getEurArfolyamok). Árfolyam nélkül az EUR
//     kimarad a bevételből, és külön jelezzük (atvaltatlanEur);
//   • rakott és üres km: a kocsi fuvarláncából (ures-km.ts lancKm — a
//     Kimutatás/Eredmény koltsegIdoszakra-ja is ezt használja). Rakott: a
//     HU-GO-s m.rakott_km (rakott-km.ts, fuvar_utvonal_km tár), ha nincs,
//     légvonal × 1,3; üres: előző lerakó → következő felrakó, a lánc elején
//     a kocsi időszak előtti utolsó lerakójától (30 napon belül), különben a
//     telephelytől. A saját fuvar km-e is költség (a kocsi azt is futja);
//   • munkanap: hétköznap az időszak elejétől máig (ünnepnapot nem ismer);
//   • fizetős nap: hétköznap, amelyre (felrakás → lerakás) bérfuvar esik;
//     saját nap: hétköznap csak saját fuvarral;
//   • paraméterek: fogyasztás és napi fix a fuvar_beallitas-ból
//     (lib/beallitasok/fuvar-alap.ts), üzemanyagár: NAV − tankolási kedvezmény
//     (gazolaj.ts; tartalék: gazolaj_ar_tartalek_ft), útdíj Ft/km: a tárolt
//     kalkulációk flotta-átlaga (ugyanaz, mint koltseg-adat.ts), ha nincs: 120.
// A teljes eredmény 10 percig gyorsítótárazva (a lánc geokódol).

export type KihasznaltsagSor = Kihasznaltsag & {
  munkanapok: number;
  fizetosNapok: number;
  sajatNapok: number;
  berBevetelFt: number;
  /** Saját fuvarok belső díja (rakott km × belső Ft/km) — a bevétel/nap és a fedezet tartalmazza. */
  sajatBevetelFt: number;
  /** A saját fuvarok rakott km-e (a belső díj alapja). */
  sajatRakottKm: number;
  /** EUR-os bérdíj, amihez nem volt árfolyam — a bevételben NINCS benne. */
  atvaltatlanEur: number;
  rakottKm: number;
  uresKm: number;
  berDb: number;
  sajatDb: number;
};

export type KihasznaltsagKocsi = {
  kod: string;
  nev: string;
  szin: JarmuSzin | null;
  het: KihasznaltsagSor;
  honap: KihasznaltsagSor;
};

export type KihasznaltsagAdat = {
  het: { cim: string; kezdet: string; veg: string };
  honap: { cim: string; kezdet: string; veg: string };
  kocsik: KihasznaltsagKocsi[];
  /** A számításhoz használt paraméterek, a felület kiírja (title). */
  param: { fogyasztasL100: number; uzemanyagFtL: number; utdijFtKm: number; napiFixFt: number; belsoFtKm: number | null };
};

const HONAPOK = ["január", "február", "március", "április", "május", "június", "július", "augusztus", "szeptember", "október", "november", "december"];
const UTDIJ_TARTALEK_FT_KM = 120;
// A Ma lap ne várjon rá sokáig (QA #2): ha 2,5 mp alatt nincs kész, a sáv
// most kimarad, a számítás a háttérben fut tovább és a következő betöltés a
// saját tárból kapja. Saját tár, mert az idővonal-cache-t a megbízás-mentések
// ürítik — a kihasználtságnak elég a 10 perces frissesség.
const IDOKORLAT_MS = 2_500;
const TAR_ERVENYES_MS = 10 * 60 * 1000;
const tar = new Map<string, { lejar: number; ertek: Promise<KihasznaltsagAdat> }>();

function sajatCachelve(kulcs: string, fn: () => Promise<KihasznaltsagAdat>): Promise<KihasznaltsagAdat> {
  const most = Date.now();
  const van = tar.get(kulcs);
  if (van && van.lejar > most) return van.ertek;
  for (const [k, v] of tar) if (v.lejar <= most) tar.delete(k);
  const ertek = fn();
  tar.set(kulcs, { lejar: most + TAR_ERVENYES_MS, ertek });
  ertek.catch(() => { if (tar.get(kulcs)?.ertek === ertek) tar.delete(kulcs); });
  return ertek;
}

function napEltol(nap: string, delta: number): string {
  const d = new Date(`${nap}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function hetfoje(nap: string): string {
  const d = new Date(`${nap}T12:00:00Z`);
  return napEltol(nap, -((d.getUTCDay() + 6) % 7));
}

function isoHetSzam(nap: string): number {
  const t = new Date(`${nap}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 3 - ((t.getUTCDay() + 6) % 7));
  const elsoCsut = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t.getTime() - elsoCsut.getTime()) / 86400000 - 3 + ((elsoCsut.getUTCDay() + 6) % 7)) / 7);
}

type FuvarSor = {
  id: string; jarmu_id: string; jelleg: "ber" | "sajat"; felrakas_nap: string; lerakas_nap: string;
  fuvardij: number | null; penznem: string; felrako: string | null; lerako: string | null; rakott_km: number | null;
};

/** Az adat kiszámítása (gyorsítótár és időkorlát nélkül). Dobhat — a hívó kezeli. */
export async function szamoldKihasznaltsagot(ma: string): Promise<KihasznaltsagAdat> {
  const hetKezdet = hetfoje(ma);
  const honapKezdet = `${ma.slice(0, 7)}-01`;
  const kezdet = hetKezdet < honapKezdet ? hetKezdet : honapKezdet;

  const [beallitas, jarmuvek, fuvarok, elozoLerako, utdijAtlag, gazolaj, jarmuLista, belsoDij] = await Promise.all([
    getFuvarBeallitasok(),
    query<{ id: string; kod: string; cimke: string; sofor: string | null }>(
      `select j.id::text, j.kod, j.cimke, a.name as sofor
       from fuvar_jarmuvek j left join alkalmazottak a on a.id = j.sofor_id
       where j.aktiv order by j.id`
    ),
    query<FuvarSor>(
      `select m.id::text, m.jarmu_id::text, m.jelleg,
         to_char(m.datum, 'YYYY-MM-DD') as felrakas_nap,
         to_char(greatest(coalesce(m.lerakas_datum, m.datum), m.datum), 'YYYY-MM-DD') as lerakas_nap,
         m.fuvardij::float8 as fuvardij, coalesce(m.fuvardij_penznem, 'Ft') as penznem,
         m.felrako, m.lerako, m.rakott_km::float8 as rakott_km
       from fuvar_megbizasok m
       where m.torolt_at is null and m.jarmu_id is not null
         and m.allapot is not null and m.allapot <> 'ellenorzesre_var'
         and m.datum >= $1::date and m.datum <= $2::date`,
      [kezdet, ma]
    ),
    query<{ jarmu_id: string; lerako: string | null }>(
      `select distinct on (m.jarmu_id) m.jarmu_id::text, m.lerako
       from fuvar_megbizasok m
       where m.torolt_at is null and m.jarmu_id is not null
         and m.allapot is not null and m.allapot <> 'ellenorzesre_var'
         and m.datum < $1::date and m.datum >= $1::date - 30
       order by m.jarmu_id, coalesce(m.lerakas_datum, m.datum) desc, m.datum desc, m.id desc`,
      [kezdet]
    ),
    query<{ ft_km: number | null }>(
      `select sum((eredmeny->>'rakottUtdijFt')::float8) / nullif(sum((eredmeny->>'rakottKm')::float8), 0) as ft_km
       from fuvar_kalkulacio where eredmeny is not null and szamolva_at > now() - interval '180 days'`
    ).catch(() => [] as { ft_km: number | null }[]),
    gazolajArKedvezmennyel(),
    getJarmuvek().catch(() => undefined),
    // A saját fuvar belső díja: a forintos bérfuvarok átlagos Ft/rakott km-e, 90 nap.
    query<{ ft_km: number | null }>(
      `select sum(m.fuvardij)::float8 / nullif(sum(m.rakott_km), 0)::float8 as ft_km
       from fuvar_megbizasok m
       where m.torolt_at is null and m.jelleg = 'ber' and m.fuvardij > 0 and m.rakott_km > 0
         and coalesce(m.fuvardij_penznem, 'Ft') in ('Ft', 'HUF')
         and m.datum >= $1::date - 90 and m.datum <= $1::date`,
      [ma]
    ).catch(() => [] as { ft_km: number | null }[]),
  ]);

  const param = {
    fogyasztasL100: beallitas.fogyasztas_alap_l_100km,
    uzemanyagFtL: Math.round(gazolaj.ar),
    utdijFtKm: utdijAtlag[0]?.ft_km != null && Number(utdijAtlag[0].ft_km) > 0 ? Math.round(Number(utdijAtlag[0].ft_km)) : UTDIJ_TARTALEK_FT_KM,
    napiFixFt: beallitas.napi_koltseg_ft,
    belsoFtKm: belsoDij[0]?.ft_km != null && Number(belsoDij[0].ft_km) > 0 ? Math.round(Number(belsoDij[0].ft_km)) : null,
  };

  const eurNapok = fuvarok.filter((f) => f.jelleg === "ber" && f.penznem === "EUR" && f.fuvardij).map((f) => f.felrakas_nap);
  const arfolyamok = eurNapok.length > 0 ? await getEurArfolyamok(eurNapok) : new Map();

  const tav = becsultTavolsag();
  const kocsik: KihasznaltsagKocsi[] = [];

  for (const j of jarmuvek) {
    const sajat = fuvarok.filter((f) => f.jarmu_id === j.id);
    // JANI és a többi fuvar nélküli kocsi kimarad.
    if (sajat.length === 0) continue;

    const kezdoHely = elozoLerako.find((e) => e.jarmu_id === j.id)?.lerako ?? (await getJarmuIndulasiTelephely(j.kod)).cim;
    const lanc = await lancKm(
      sajat.map((f) => ({
        id: f.id, jelleg: f.jelleg, felrakasNap: f.felrakas_nap, lerakasNap: f.lerakas_nap,
        felrako: f.felrako, lerako: f.lerako, rakottKm: f.rakott_km != null ? Number(f.rakott_km) : null,
      })),
      kezdoHely,
      tav
    );
    const lancMap = new Map(lanc.map((l) => [l.id, l]));

    const idoszak = (tol: string): KihasznaltsagSor => {
      const benne = sajat.filter((f) => f.felrakas_nap >= tol && f.felrakas_nap <= ma);
      let berBevetelFt = 0, atvaltatlanEur = 0, rakottKm = 0, uresKm = 0, sajatRakottKm = 0;
      const berNapok = new Set<string>();
      const sajatFuvarNapok = new Set<string>();
      for (const f of benne) {
        const l = lancMap.get(f.id);
        rakottKm += l?.rakott ?? 0;
        uresKm += l?.ures ?? 0;
        // A fuvar napjai (felrakás → lerakás, legfeljebb 14 nap), az időszakra vágva, hétköznapok.
        const vegNap = f.lerakas_nap > napEltol(f.felrakas_nap, 13) ? napEltol(f.felrakas_nap, 13) : f.lerakas_nap;
        const napok = napokListaja(f.felrakas_nap, vegNap).filter((n) => n >= tol && n <= ma && hetkoznapE(n));
        if (f.jelleg === "ber") {
          const ft = dijFtban(f.fuvardij, f.penznem, arfolyamok.get(f.felrakas_nap) ?? null);
          if (ft != null) berBevetelFt += ft;
          else if (f.penznem === "EUR" && f.fuvardij) atvaltatlanEur += Number(f.fuvardij);
          for (const n of napok) berNapok.add(n);
        } else {
          sajatRakottKm += l?.rakott ?? 0;
          for (const n of napok) sajatFuvarNapok.add(n);
        }
      }
      const sajatNapok = [...sajatFuvarNapok].filter((n) => !berNapok.has(n)).length;
      const bemenet: KocsiIdoszak = {
        munkanapok: munkanapokSzama(tol, ma),
        berBevetelFt: Math.round(berBevetelFt),
        rakottKm: Math.round(rakottKm),
        uresKm: Math.round(uresKm),
        fizetosNapok: berNapok.size,
        sajatNapok,
        fogyasztasL100: param.fogyasztasL100,
        uzemanyagFtL: param.uzemanyagFtL,
        utdijFtKm: param.utdijFtKm,
        napiFixFt: param.napiFixFt,
        sajatBevetelFt: sajatBelsoDij(Math.round(sajatRakottKm), param.belsoFtKm),
      };
      return {
        ...kihasznaltsag(bemenet),
        munkanapok: bemenet.munkanapok,
        fizetosNapok: bemenet.fizetosNapok,
        sajatNapok,
        berBevetelFt: bemenet.berBevetelFt,
        sajatBevetelFt: bemenet.sajatBevetelFt ?? 0,
        sajatRakottKm: Math.round(sajatRakottKm),
        atvaltatlanEur,
        rakottKm: bemenet.rakottKm,
        uresKm: bemenet.uresKm,
        berDb: benne.filter((f) => f.jelleg === "ber").length,
        sajatDb: benne.filter((f) => f.jelleg === "sajat").length,
      };
    };

    const torzs = jarmuLista ? findJarmuByKod(j.kod, jarmuLista) : null;
    kocsik.push({
      kod: j.kod,
      nev: torzs?.sofor ?? j.sofor ?? j.cimke,
      szin: torzs?.szin ?? null,
      het: idoszak(hetKezdet),
      honap: idoszak(honapKezdet),
    });
  }

  const honapNev = HONAPOK[Number(ma.slice(5, 7)) - 1] ?? "hónap";
  return {
    het: { cim: `${isoHetSzam(hetKezdet)}. hét`, kezdet: hetKezdet, veg: ma },
    honap: { cim: `${honapNev} 1–${Number(ma.slice(8))}.`, kezdet: honapKezdet, veg: ma },
    kocsik,
    param,
  };
}

/**
 * A Ma lap belépési pontja: 10 perces saját gyorsítótár, 2,5 mp időkorlát. SOHA NEM
 * DOB — hiba vagy időtúllépés esetén null (a sáv ilyenkor egyszerűen elmarad).
 */
export async function getKihasznaltsag(ma: string): Promise<KihasznaltsagAdat | null> {
  let idozito: ReturnType<typeof setTimeout> | undefined;
  try {
    const szamitas = sajatCachelve(`kihasznaltsag:${ma}`, () => szamoldKihasznaltsagot(ma));
    const korlat = new Promise<null>((resolve) => {
      idozito = setTimeout(() => resolve(null), IDOKORLAT_MS);
    });
    const ered = await Promise.race([szamitas, korlat]);
    if (ered === null) console.warn("[kihasznaltsag] időtúllépés — a sáv most kimarad");
    return ered;
  } catch (err) {
    console.warn("[kihasznaltsag] nem számolható:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    if (idozito) clearTimeout(idozito);
  }
}
