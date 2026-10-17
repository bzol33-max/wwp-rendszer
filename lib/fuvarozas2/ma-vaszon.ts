"use server";

// Fuvarozás 2 — a „Ma" képernyő a tervvászon (D1) szerint.
//
// Elrendezés (Budaházi Zoltán, 2026-09-28): négy kocsi-oszlop egymás
// mellett, mindegyik ugyanabban a sorrendben — hol van most (GPS), vezetési
// idő, a mostani megálló, a mai hátralévő megállók, a következő munkanap
// fuvarja, és ha hiányzik, a papír/számla. Fölötte csak akkor sáv, ha van
// eltérés; alatta a kocsi nélküli fuvarok és az iroda számai egy sorban.
//
// Honnan jön az adat:
//   • állapot, megbízás, megálló, ablak, várakozás → az ÚJ modell
//     (fuvar_megbizasok / fuvar_megallok) — egyetlen lekérdezés megállókra;
//   • élő ETA, vezetési idő, tervezetlen állás, sofőr gondjelzése →
//     getIdovonalak() (a meglévő GPS-lánc, nem duplikáljuk);
//   • kintlévőség → a Számlák modul nyitott számlái (ha a nézőnek van rá
//     joga; enélkül a csempe egyszerűen kimarad);
//   • heti vezetési idő → Ecofleet heti útjelentés (10 percig gyorsítótárazva).
//
// Minden becsült érték jelölve van a felületen (ETA, vezetési idő) — a
// tachográf a sofőrnél van, ez előrejelzés.

import { megbizoMegjelenites } from "@/lib/fuvarozas/fuvar-constants";
import { query } from "@/lib/db";
import { requireSession } from "@/lib/auth/dal";
import { revalidatePath } from "next/cache";
import { requireAnyViewPermission, requireEditPermission, requireViewPermission } from "@/lib/auth/require-permission";
import { getIdovonalak } from "@/lib/fuvarozas/actions";
import { getSzamlaLista } from "@/lib/szamlak/actions";
import { szamlaHatralek } from "@/lib/szamlak/szamla-constants";
import { cimKulcs, varosNev } from "@/lib/fuvarozas/varos";
import { toroljGeokodCachet } from "@/lib/fuvarozas/erintes-felismeres";
import { toroljIdovonalCachet } from "@/lib/fuvarozas/idovonal-cache";
import { getUtvonalJelentes, rendszamKulcs } from "@/lib/fuvarozas/ecofleet";
import { cachelve } from "@/lib/fuvarozas/idovonal-cache";
import { kovetkezoMunkanapISO } from "@/lib/fuvarozas/idozona";
import { findJarmuByKod, type JarmuSzin } from "@/lib/fuvarozas/vehicles";
import { getJarmuvek } from "@/lib/fuvarozas/jarmuvek-db";
import type { MegalloReszlet } from "@/lib/fuvarozas/sofor-adatok";
import type { Allapot } from "@/lib/fuvarozas/allapot";
import { tukorSorok, type TukorSor } from "@/lib/fuvarozas2/ma-tukor";
import { berUtkozes, napiSorrend, tervIdoMegbizasbol } from "@/lib/fuvarozas2/napi-sorrend";
import { menetSorrendek } from "@/lib/menet/repo";
import { alkalmazMenetSorrendet } from "@/lib/menet/menet-alap";
import { hetNapjai, jarmuNev, kocsiHelykitolto, type HetFuvar } from "@/lib/fuvarozas2/ma-het";
import { legutobbiTacho } from "@/lib/jarmu-telemetria/repo";
import { tachoKijelzes } from "@/lib/fuvarozas2/tervezes-het-tacho";
import { getKihasznaltsag, type KihasznaltsagAdat } from "@/lib/fuvarozas2/kihasznaltsag";
import { getBejegyzesSorok, getTavolletek } from "@/lib/fuvarozas2/bejegyzesek";
import { bejegyzesekNapokra, tavolletekNapokra, type Bejegyzes, type TavolletTipus } from "@/lib/fuvarozas2/bejegyzes-alap";
import { kocsiJelzesek, type KartyaJelzes } from "@/lib/fuvarozas2/ma-kartya-alap";
import { pihenoNapE } from "@/lib/fuvarozas2/ma-het";
import { munkanap } from "@/lib/jelenlet/shared";

export type CsempeSzin = "normal" | "amber" | "red" | "mint";
export type Csempe = { kulcs: string; cimke: string; ertek: string; also: string | null; szin: CsempeSzin; href: string | null };

export type Elteres = {
  /** Naponta egyedi azonosító — a nyugtázás (fuvar_elteres_nyugta) ehhez kötődik. */
  kulcs: string;
  cim: string;
  badge: string;
  szin: "red" | "amber";
  sorok: string[];
  href: string | null;
  /** N1: melyik kocsié (a kártya szalagjához) és rövid hely („Debrecen lerakó”). */
  kocsiKod?: string | null;
  hely?: string | null;
  /** Sofőr-gondjelzésnél: a sofőr (beceneve) — ebből kerül a kocsi kártyájára. */
  soforNev?: string | null;
};

export type MaMegalloSor = {
  tipus: "felrako" | "lerako" | "ejszaka";
  varos: string;
  allapot: string;
  ido: string;
  kiemelt: "kesik" | "varakozik" | null;
  kesz: boolean;
};

export type MaBlokk = {
  id: string;
  partner: string;
  hivatkozas: string | null;
  jelleg: "ber" | "sajat";
  utvonal: string;
  felrakasNap: string | null;
  lerakasNap: string | null;
  megallok: MaMegalloSor[];
};

/** A kocsi pillanatnyi helyzete a GPS-ből. */
export type MaKocsiAllapot = { szoveg: string; szin: "mint" | "amber" | "red" | "normal"; hely: string | null };

export type { TukorSor, TukorAllas } from "@/lib/fuvarozas2/ma-tukor";

export type MaKocsi = {
  kod: string | null;
  cimke: string;
  sofor: string | null;
  /** Ha a kocsi még nem üzemel („gyártás alatt”, „még nincs beállítva”). */
  helykitolto: string | null;
  allapot: MaKocsiAllapot | null;
  /** „Vezetés ma 3:20 · szünet 1:10 múlva · szolgálat 05:41 óta" — becslés a GPS-ből. */
  vezetesSor: string | null;
  /** „Tachó: ma még 2 ó 40 p · hét 31/56 ó" (friss tachó), különben „Hét: 31 / 56 óra" GPS-becslés. */
  hetiSor: string | null;
  /** A hetiSor forrása: "tacho" (Ecofleet tcoData, friss) vagy "gps" (útjelentésből becsült). */
  hetiForras?: "tacho" | "gps" | null;
  /** Friss tachónál a részletek (súgó): műszak, csökkentett pihenők, adat kora. */
  tacho?: { reszletek: string } | null;
  napiKm: number | null;
  etaSor: string | null;
  /** A mai megbízások megállói és a GPS-állások, tükörben (lásd TukorSor). */
  sorok: TukorSor[];
  /** A következő munkanap új fuvarjai (ami a maiból folytatódik, az a „ma” alatt van). */
  holnap: MaBlokk[];
  /** Igaz, ha egy mai fuvar a következő munkanapon is tart. */
  holnapFolytatodik: boolean;
  /** Hiányzó papír/számla ennél a kocsinál, pl. „2 fotó hiányzik”. */
  papir: { szoveg: string; href: string }[];
  /** N1 (docs/ma-n1-terv.md): törzsadat-szín, tachó-csík, figyelmeztető szalag, bejegyzések és távollét. */
  szin?: JarmuSzin | null;
  tachoNapiHatraPerc?: number | null;
  jelzesek?: KartyaJelzes[];
  bejegyzesekMa?: Bejegyzes[];
  bejegyzesekHolnap?: Bejegyzes[];
  tavolletMa?: TavolletTipus | null;
  tavolletHolnap?: TavolletTipus | null;
};

export type MaVaszon = {
  ma: string;
  holnap: string;
  /** „Holnap”, vagy pénteken/szombaton „Hétfő” (a következő munkanap). */
  holnapCimke: string;
  /** Ma hétvége / ünnep (nem munkanap) — nincs „üres nap” jelzés. */
  maPihenonap?: boolean;
  csempek: Csempe[];
  /** A még nem nyugtázott eltérések (a sáv). */
  elteresek: Elteres[];
  /** Ma nyugtázott, azóta nem súlyosbodott eltérések (összecsukva a sáv alján). */
  nyugtazott: (Elteres & { nyugtazta: string | null; mikor: string })[];
  /** Nyugtázhat-e a néző (fuvarozás szerkesztési jog). */
  nyugtazhat: boolean;
  /** Az adat előállításának ideje, „10:42” — a felület kiírja, mikor frissült. */
  frissitve: string;
  kocsik: MaKocsi[];
  kocsiNelkul: { id: string; partner: string; utvonal: string; nap: string | null; allapot: Allapot }[];
  teendok: { cimke: string; ertek: string; also: string | null; href: string }[];
  holnapDoboz: { cimke: string; ertek: string; szin: CsempeSzin }[];
  /** Kocsi-kihasználtság (hét és hónap eleje óta) — null, ha nem számolható (a sáv elmarad). */
  kihasznaltsag: KihasznaltsagAdat | null;
};

/**
 * Az 1-es (havi) és 2-es (heti) csempe bérfuvarjai (Budaházi Zoltán,
 * 2026-09-29). Az időszakhoz az a fuvar tartozik, amelyiknek az első
 * felrakása (m.datum) az időszakban van és már elkezdődött (legkésőbb ma) —
 * egy előző időszaki megbízás mostani lerakása nem. Nettó fuvardíj; az euró
 * külön, átváltás nélkül.
 */
export type BerOsszesito = {
  /** „szeptember”, „40. hét”. */
  cim: string;
  ft: number;
  eur: number;
  kocsik: { nev: string; szin: JarmuSzin | null; ft: number; eur: number; km: KmDij }[];
  /** A km-díjhoz (3. csempe): csak a díjas ÉS rakott km-es fuvarok. */
  km: KmDij;
  /** Díjas fuvar, aminek még nincs rakott km-e (számolás alatt vagy nem számolható). */
  kmNelkul: number;
};

/** Km-díj alapja: Ft és km a forintos, € és km az eurós fuvarokból (lib/fuvarozas2/rakott-km.ts). */
export type KmDij = { kmFt: number; kmFtKm: number; kmEur: number; kmEurKm: number };
const kmDij = (sorok: KmDij[]): KmDij => ({
  kmFt: sorok.reduce((x, r) => x + r.kmFt, 0),
  kmFtKm: sorok.reduce((x, r) => x + r.kmFtKm, 0),
  kmEur: sorok.reduce((x, r) => x + r.kmEur, 0),
  kmEurKm: sorok.reduce((x, r) => x + r.kmEurKm, 0),
});

/** Ennyi oszlop van mindig (a még nem üzemelő kocsik helye is látszik). */
const KOCSI_OSZLOP = 4;

/** A Postgres „2026-09-20 07:00:00+00" alakját is érti (az órás offszetet kiegészíti percekkel). */
function idobelyeg(d: Date | string | null | undefined): Date | null {
  if (!d) return null;
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : d;
  let s = d.trim().replace(" ", "T");
  if (/[+-]\d{2}$/.test(s)) s += ":00";
  const t = new Date(s);
  return Number.isNaN(t.getTime()) ? null : t;
}
const ORA = (d: Date | string | null | undefined) => {
  const t = idobelyeg(d);
  return t ? t.toLocaleTimeString("hu-HU", { timeZone: "Europe/Budapest", hour: "2-digit", minute: "2-digit" }) : "—";
};
const percKulonbseg = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 60000);
const oraPerc = (perc: number) => `${Math.floor(perc / 60)}:${String(perc % 60).padStart(2, "0")}`;
const HONAPOK = ["január", "február", "március", "április", "május", "június", "július", "augusztus", "szeptember", "október", "november", "december"];
/** ISO hét sorszáma (hétfő a hét első napja). */
function isoHetSzam(d: Date): number {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 3 - ((t.getUTCDay() + 6) % 7));
  const elsoCsut = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t.getTime() - elsoCsut.getTime()) / 86400000 - 3 + ((elsoCsut.getUTCDay() + 6) % 7)) / 7);
}
const ft = (n: number) => `${new Intl.NumberFormat("hu-HU").format(Math.round(n))} Ft`;

type MegalloSor = {
  megbizas_id: string;
  sorszam: number;
  tipus: "felrako" | "lerako";
  cim_nyers: string;
  telepules: string | null;
  ablak_tol: string | null;
  ablak_ig: string | null;
  gps_erkezes: string | null;
  gps_tavozas: string | null;
  sofor_megerkezett_at: string | null;
  sofor_kesz_at: string | null;
  varakozas_kezdete: string | null;
  varakozas_vege: string | null;
  tervezett_nap: string | null;
};

type BerJarmu = { id: string; kod: string; cimke: string; sofor: string | null };

/**
 * A havi, a heti és a hónap heteire bontott bérfuvar-összesítő (a getMaVaszon
 * és a getBerOsszesitok közös számítása). Jogosultságot NEM ellenőriz — csak
 * ellenőrzött belépési pontból hívható.
 */
async function berOsszesitokSzamol(
  ma: string,
  osszesJarmu: BerJarmu[],
  jarmuLista: Awaited<ReturnType<typeof getJarmuvek>>,
): Promise<{ berHavi: BerOsszesito; berHeti: BerOsszesito; berHonapHetei: BerOsszesito[] }> {
  const berOsszesit = async (kezdet: string, veg: string, cim: string): Promise<BerOsszesito> => {
    const zaras = veg < ma ? veg : ma;
    const berSorok = kezdet > zaras ? [] : await query<{ jarmu_id: string | null; ft: number; eur: number } & KmDij & { km_nelkul: number }>(
      `select m.jarmu_id::text,
         coalesce(sum(m.fuvardij) filter (where m.fuvardij_penznem = 'Ft'), 0)::float8 as ft,
         coalesce(sum(m.fuvardij) filter (where m.fuvardij_penznem = 'EUR'), 0)::float8 as eur,
         coalesce(sum(m.fuvardij) filter (where m.fuvardij_penznem = 'Ft' and m.fuvardij > 0 and m.rakott_km > 0), 0)::float8 as "kmFt",
         coalesce(sum(m.rakott_km) filter (where m.fuvardij_penznem = 'Ft' and m.fuvardij > 0 and m.rakott_km > 0), 0)::float8 as "kmFtKm",
         coalesce(sum(m.fuvardij) filter (where m.fuvardij_penznem = 'EUR' and m.fuvardij > 0 and m.rakott_km > 0), 0)::float8 as "kmEur",
         coalesce(sum(m.rakott_km) filter (where m.fuvardij_penznem = 'EUR' and m.fuvardij > 0 and m.rakott_km > 0), 0)::float8 as "kmEurKm",
         count(*) filter (where m.fuvardij > 0 and m.rakott_km is null)::int as km_nelkul
       from fuvar_megbizasok m
       where m.torolt_at is null and m.jelleg = 'ber'
         and m.allapot is not null and m.allapot <> 'ellenorzesre_var'
         and m.datum >= $1::date and m.datum <= $2::date
       group by m.jarmu_id`,
      [kezdet, zaras]
    );
    const kocsik = osszesJarmu.map((j) => {
      const torzs = findJarmuByKod(j.kod, jarmuLista);
      const r = berSorok.find((x) => x.jarmu_id === j.id);
      return { nev: torzs?.sofor ?? j.sofor ?? j.cimke, szin: torzs?.szin ?? null, ft: r?.ft ?? 0, eur: r?.eur ?? 0, km: kmDij(r ? [r] : []) };
    });
    while (kocsik.length < KOCSI_OSZLOP) kocsik.push({ nev: `${kocsik.length + 1}. kocsi`, szin: null, ft: 0, eur: 0, km: kmDij([]) });
    return {
      cim, ft: berSorok.reduce((x, r) => x + r.ft, 0), eur: berSorok.reduce((x, r) => x + r.eur, 0), kocsik,
      km: kmDij(berSorok), kmNelkul: berSorok.reduce((x, r) => x + r.km_nelkul, 0),
    };
  };
  const napISO = (d: Date) => d.toISOString().slice(0, 10);
  const hetfoje = (iso: string) => {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d;
  };
  const honapElso = `${ma.slice(0, 7)}-01`;
  const honapUtolso = new Date(`${honapElso}T12:00:00Z`);
  honapUtolso.setUTCMonth(honapUtolso.getUTCMonth() + 1, 0);
  const hetfo = hetfoje(ma);
  const vasarnap = new Date(hetfo.getTime() + 6 * 86400000);
  const berHavi = await berOsszesit(honapElso, napISO(honapUtolso), HONAPOK[Number(ma.slice(5, 7)) - 1] ?? "hónap");
  const berHeti = await berOsszesit(napISO(hetfo), napISO(vasarnap), `${isoHetSzam(hetfo)}. hét`);
  // A havi csempére kattintva: a hónap hetei, a hónapba eső napokra vágva
  // (így a hetek összege kiadja a havit).
  const berHonapHetei: BerOsszesito[] = [];
  for (let h = hetfoje(honapElso); napISO(h) <= napISO(honapUtolso); h = new Date(h.getTime() + 7 * 86400000)) {
    const tol = napISO(h) < honapElso ? honapElso : napISO(h);
    const vas = napISO(new Date(h.getTime() + 6 * 86400000));
    const ig = vas > napISO(honapUtolso) ? napISO(honapUtolso) : vas;
    berHonapHetei.push(await berOsszesit(tol, ig, `${isoHetSzam(h)}. hét · ${Number(tol.slice(8))}–${Number(ig.slice(8))}.`));
  }
  return { berHavi, berHeti, berHonapHetei };
}

/**
 * A bérfuvar-csempék adata (havi, heti, a hónap hetei) önállóan — a Pénz →
 * Áttekintés lap teteje (2026-10-17, 2. kör). Ugyanaz a számítás, mint a
 * getMaVaszon-ban; a lap csak a „fuvarozas" nézési joggal érhető el.
 */
export async function getBerOsszesitok(): Promise<{ berHavi: BerOsszesito; berHeti: BerOsszesito; berHonapHetei: BerOsszesito[] }> {
  await requireViewPermission("fuvarozas");
  const [{ ma }] = await query<{ ma: string }>(`select ((now() at time zone 'Europe/Budapest')::date)::text as ma`);
  const jarmuLista = await getJarmuvek();
  const osszesJarmu = await query<BerJarmu>(
    `select j.id::text, j.kod, j.cimke, a.name as sofor from fuvar_jarmuvek j
     left join alkalmazottak a on a.id = j.sofor_id
     where j.aktiv order by j.id`
  );
  return berOsszesitokSzamol(ma, osszesJarmu, jarmuLista);
}

export async function getMaVaszon(): Promise<MaVaszon> {
  await requireAnyViewPermission(["fuvarozas", "elszamolas"]);
  const session = await requireSession();
  const most = new Date();

  const [{ ma, naptariHolnap }] = await query<{ ma: string; naptariHolnap: string }>(
    `select ((now() at time zone 'Europe/Budapest')::date)::text as ma, ((now() at time zone 'Europe/Budapest')::date + 1)::text as "naptariHolnap"`
  );
  // A „holnap” a következő munkanap: pénteken és szombaton a hétfő; ünnep előtt az ünnep utáni
  // munkanap (N1 QA #2 — eddig az ünnepet „holnapnak” vette).
  let holnap = kovetkezoMunkanapISO(ma);
  for (let i = 0; i < 10 && !munkanap(holnap); i++) holnap = kovetkezoMunkanapISO(holnap);
  const NAPNEVEK = ["Vasárnap", "Hétfő", "Kedd", "Szerda", "Csütörtök", "Péntek", "Szombat"];
  const holnapCimke = holnap === naptariHolnap ? "Holnap" : NAPNEVEK[new Date(`${holnap}T12:00:00Z`).getUTCDay()];
  // Kocsi-kihasználtság (1. hullám B): párhuzamosan indul, soha nem dob.
  const kihasznaltsagIgeret = getKihasznaltsag(ma);
  // N1: a mai és a holnapi bejegyzések és távollétek — párhuzamosan (hiba esetén üres; a lap nem törhet el).
  const bejTavIgeret = Promise.all([
    getBejegyzesSorok(ma, holnap).catch(() => []),
    getTavolletek(ma, holnap).catch(() => []),
  ]);

  // 1. A nyitott megbízások (ma és holnap) kocsival, partnerrel.
  type MegbizasSor = {
    id: string; allapot: Allapot; jelleg: "ber" | "sajat"; partner: string | null; hivatkozas: string | null;
    jarmu_kod: string | null; jarmu_cimke: string | null; sofor: string | null;
    felrakas_nap: string | null; lerakas_nap: string | null; hianylista: unknown[]; felrako: string | null; lerako: string | null;
    megallo_reszletek: MegalloReszlet[] | null;
    felrakas_ablak_tol: string | null; idopont: string | null;
  };
  const MEGBIZAS_OSZLOPOK = `m.id::text, m.allapot, m.jelleg, coalesce(p.nev, m.megrendelo) as partner,
       coalesce(m.hivatkozas_kanonikus, m.pozicioszam, m.reise_id) as hivatkozas,
       j.kod as jarmu_kod, coalesce(j.cimke, m.jarmu) as jarmu_cimke, coalesce(a.name, m.sofor) as sofor,
       to_char(m.datum, 'YYYY-MM-DD') as felrakas_nap,
       to_char(coalesce(m.lerakas_datum, m.datum), 'YYYY-MM-DD') as lerakas_nap,
       m.hianylista, m.felrako, m.lerako, m.megallo_reszletek,
       m.felrakas_ablak_tol::text as felrakas_ablak_tol, m.idopont
     from fuvar_megbizasok m
     left join fuvar_partnerek p on p.id = m.partner_id
     left join fuvar_jarmuvek j on j.id = m.jarmu_id
     left join alkalmazottak a on a.id = m.sofor_id`;
  const sorok = await query<MegbizasSor>(
    `select ${MEGBIZAS_OSZLOPOK}
     where m.torolt_at is null and m.allapot in ('ellenorzesre_var','tervezett','folyamatban')
       and coalesce(m.lerakas_datum, m.datum) >= $1::date - 3 and m.datum <= $2::date
     order by m.datum, m.id`,
    [ma, holnap]
  );

  // 1b. A ma már lezárult (teljesítve vagy későbbi állapotú) fuvarok — CSAK a
  // kocsi tükréhez (a nap munkája), az eltérések, csempék, holnap és az
  // ütközés továbbra is csak a nyitottakból számol. Gergő #293 (Lösung,
  // lerakó Debrecen, 2026-10-06): 12:01–12:39 lerakva, 18:50-re fotóval és
  // számlával „számlázva” lett — onnantól a mai megállói eltűntek a tükörből,
  // és a debreceni GPS-állás „nem tervezett” lett. Ma: a felrakás vagy a
  // lerakás napja ma, egy megálló tervezett napja ma, vagy ma érintette.
  // Saját árunál a megbízó mindig a Well-Worn Pallet (Zoltán, 2026-10-11).
  for (const s of sorok) s.partner = megbizoMegjelenites(s.jelleg, s.partner);
  const lezartMaiak = await query<MegbizasSor>(
    `select ${MEGBIZAS_OSZLOPOK}
     where m.torolt_at is null and m.jarmu_id is not null
       and m.allapot in ('teljesitve','szamlazhato','szamlazva','email_elment','postazva','lezart')
       and m.datum <= $1::date and coalesce(m.lerakas_datum, m.datum) >= $1::date - 7
       and (m.datum = $1::date or coalesce(m.lerakas_datum, m.datum) = $1::date
         or exists (select 1 from fuvar_megallok g where g.megbizas_id = m.id and (
           g.tervezett_nap = $1::date
           or (g.gps_erkezes at time zone 'Europe/Budapest')::date = $1::date
           or (g.gps_tavozas at time zone 'Europe/Budapest')::date = $1::date
           or (g.sofor_megerkezett_at at time zone 'Europe/Budapest')::date = $1::date
           or (g.sofor_kesz_at at time zone 'Europe/Budapest')::date = $1::date)))
     order by m.datum, m.id`,
    [ma]
  ).catch(() => [] as MegbizasSor[]);
  for (const s of lezartMaiak) s.partner = megbizoMegjelenites(s.jelleg, s.partner);

  const megbizasIdk = [...sorok, ...lezartMaiak].map((s) => s.id);
  const megallok = megbizasIdk.length
    ? await query<MegalloSor>(
        `select megbizas_id::text, sorszam, tipus, cim_nyers, telepules,
           ablak_tol::text, ablak_ig::text, gps_erkezes::text, gps_tavozas::text,
           sofor_megerkezett_at::text, sofor_kesz_at::text, varakozas_kezdete::text, varakozas_vege::text, tervezett_nap::text
         from fuvar_megallok where megbizas_id = any($1::bigint[]) order by megbizas_id, sorszam`,
        [megbizasIdk]
      )
    : [];
  const megalloMap = new Map<string, MegalloSor[]>();
  for (const g of megallok) {
    const lista = megalloMap.get(g.megbizas_id) ?? [];
    lista.push(g);
    megalloMap.set(g.megbizas_id, lista);
  }

  // 2. Élő réteg: ETA, vezetési idő, tervezetlen állás, sofőr gondjelzése.
  const idovonal = await getIdovonalak().catch(() => null);

  // 3. Kocsik az új törzsből.
  const jarmuLista = await getJarmuvek();
  const osszesJarmu = await query<{ id: string; kod: string; cimke: string; sofor: string | null; ecofleet_object_id: string | null; vontato_rendszam: string | null }>(
    `select j.id::text, j.kod, j.cimke, a.name as sofor, j.ecofleet_object_id, j.vontato_rendszam from fuvar_jarmuvek j
     left join alkalmazottak a on a.id = j.sofor_id
     where j.aktiv order by j.id`
  );
  // Csak a GPS-es kocsik (Ecofleet heti vezetési idő). Az úton lévők és a holnapi
  // ütközés MINDEN aktív kocsiból számol — a GPS nélküli (JANI) is fuvarozik.
  const gpsJarmuvek = osszesJarmu.filter((j) => j.ecofleet_object_id);
  // A jóváhagyott menetek sorrendje (lib/menet) a mai, a holnapi és a heti
  // rács napjaira — EGY lekérdezés; ahol nincs, a közös napi szabály marad.
  // A heti rács lehetséges napjai: a hét munkanapjai, plusz a hétvége (hétvégén
  // a mai naptól, hétköznap a péntek utáni két nap) — hogy melyik hétvégi nap
  // kerül be, azt a fuvarok döntik el (hetNapjaiHetvegevel).
  const munkanapok = hetNapjai(ma);
  const eltol = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const hetTol = [ma, munkanapok[0].nap].sort()[0];
  const hetIg = eltol(munkanapok[munkanapok.length - 1].nap, 2);
  const menetek = await menetSorrendek(
    [ma, hetTol].sort()[0],
    [holnap, hetIg].sort().at(-1)!
  );
  const hetFuvarok = await query<HetFuvar>(
    `select m.id::text, m.allapot, m.jelleg, coalesce(p.nev, m.megrendelo) as partner,
       coalesce(m.hivatkozas_kanonikus, m.pozicioszam, m.reise_id) as hivatkozas, j.kod as jarmu_kod,
       to_char(m.datum, 'YYYY-MM-DD') as felrakas_nap,
       to_char(coalesce(m.lerakas_datum, m.datum), 'YYYY-MM-DD') as lerakas_nap,
       m.felrako, m.lerako, m.felrakas_ablak_tol::text as felrakas_ablak_tol, m.idopont
     from fuvar_megbizasok m
     left join fuvar_partnerek p on p.id = m.partner_id
     left join fuvar_jarmuvek j on j.id = m.jarmu_id
     where m.torolt_at is null and m.allapot is not null
       and m.datum <= $2::date and coalesce(m.lerakas_datum, m.datum) >= $1::date
     order by m.datum, m.id`,
    [hetTol, hetIg]
  );
  for (const f of hetFuvarok) f.partner = megbizoMegjelenites(f.jelleg, f.partner);
  const menetSorrendje = (kod: string | null, nap: string) => (kod ? menetek.get(kod)?.get(nap) ?? null : null);

  const aznap = (s: { felrakas_nap: string | null; lerakas_nap: string | null }, nap: string) =>
    (s.felrakas_nap ?? "") <= nap && (s.lerakas_nap ?? s.felrakas_nap ?? "") >= nap;

  // ---------------------------------------------------------------- eltérések
  const elteresek: Elteres[] = [];

  for (const s of sorok) {
    const gs = megalloMap.get(s.id) ?? [];
    const kocsiCimke = s.jarmu_kod ? jarmuNev({ kod: s.jarmu_kod, cimke: s.jarmu_cimke }) : s.jarmu_cimke ?? "kocsi nélkül";
    const ki = [kocsiCimke, s.sofor].filter(Boolean).join(" · ");

    // 2a. Nyitott várakozás — 45 perc felett a legtöbb megbízónál pótdíjas.
    for (const g of gs) {
      if (!g.varakozas_kezdete || g.varakozas_vege) continue;
      const perc = percKulonbseg(most, idobelyeg(g.varakozas_kezdete)!);
      if (perc < 15) continue;
      elteresek.push({
        kulcs: `var-${s.id}-${g.sorszam}`,
        cim: `${ki} · ${varosNev(g.cim_nyers) ?? g.cim_nyers} ${g.tipus === "felrako" ? "felrakó" : "lerakó"}`,
        badge: `várakozik ${perc} p`,
        kocsiKod: s.jarmu_kod, hely: `${varosNev(g.cim_nyers) ?? g.cim_nyers} ${g.tipus === "felrako" ? "felrakó" : "lerakó"}`,
        szin: perc >= 45 ? "red" : "amber",
        sorok: [
          `${s.partner ?? "(nincs megbízó)"}${s.hivatkozas ? ` · ${s.hivatkozas}` : ""} · rakodás ${ORA(g.varakozas_kezdete)} óta`,
          perc >= 45 ? "Pótdíjas várakozás 45 perc felett — jelezd a megbízónak." : "A sofőr várakozást jelölt.",
        ],
        href: `/fuvarozas2/megbizasok/${s.id}`,
      });
    }

    // 2b. Késés az időablakhoz képest: a még nyitott megálló ablaka lejárt,
    // és a kocsi még nem ért oda. Ha már ott van, az ablakon belül érkezett
    // kocsi nem késik (csak a rakodás tart tovább); az ablak után érkezett
    // késése egy rögzített szám, nem nő tovább.
    for (const g of gs) {
      const kesz = !!(g.gps_tavozas || g.sofor_kesz_at);
      if (kesz || !g.ablak_ig) continue;
      const ig = idobelyeg(g.ablak_ig);
      if (!ig) continue;
      if (ig >= most) continue;
      const erk = idobelyeg(g.gps_erkezes ?? g.sofor_megerkezett_at);
      if (erk && erk <= ig) continue;
      const perc = percKulonbseg(erk ?? most, ig);
      const ido = perc >= 60 ? `${oraPerc(perc)} ó` : `${perc} p`;
      elteresek.push({
        kulcs: `kes-${s.id}-${g.sorszam}`,
        cim: `${ki} · ${varosNev(g.cim_nyers) ?? g.cim_nyers} ${g.tipus === "felrako" ? "felrakó" : "lerakó"}`,
        badge: erk ? `késve ért oda ${ido}` : `késés ${ido}`,
        kocsiKod: s.jarmu_kod, hely: `${varosNev(g.cim_nyers) ?? g.cim_nyers} ${g.tipus === "felrako" ? "felrakó" : "lerakó"}`,
        szin: perc >= 60 ? "red" : "amber",
        sorok: [
          `${s.partner ?? "(nincs megbízó)"}${s.hivatkozas ? ` · ${s.hivatkozas}` : ""}`,
          erk
            ? `Ablak ${ORA(g.ablak_tol)}–${ORA(g.ablak_ig)} — a kocsi ${ORA(erk)}-kor ért oda.`
            : `Ablak ${ORA(g.ablak_tol)}–${ORA(g.ablak_ig)} — a kocsi még nem ért oda.`,
        ],
        href: `/fuvarozas2/megbizasok/${s.id}`,
      });
    }

    // 2c. Ellenőrzésre váró import hiányzó adatokkal.
    if (s.allapot === "ellenorzesre_var") {
      const hiany = (s.hianylista ?? []).map((h) => String(h));
      elteresek.push({
        kulcs: `ell-${s.id}`,
        cim: `${s.partner ?? "(nincs megbízó)"}${s.hivatkozas ? ` · ${s.hivatkozas}` : ""}`,
        badge: hiany.length > 0 ? "hiányos import" : "jóváhagyásra vár",
        kocsiKod: s.jarmu_kod, hely: s.partner ?? null,
        szin: "amber",
        sorok: [
          hiany.length > 0 ? `Hiányzik: ${hiany.join(", ")}` : "Az import beolvasta, de még senki nem hagyta jóvá.",
          `${s.felrako ?? "—"} → ${s.lerako ?? "—"}${s.jarmu_kod ? "" : " · nincs kocsi"}`,
        ],
        href: `/fuvarozas2/megbizasok/${s.id}`,
      });
    }

    // 2d. Csúszó fuvar: a lerakás napja elmúlt, de még nyitott.
    if ((s.allapot === "folyamatban" || s.allapot === "tervezett") && (s.lerakas_nap ?? "") < ma) {
      elteresek.push({
        kulcs: `csu-${s.id}`,
        cim: `${ki} · ${s.partner ?? "(nincs megbízó)"}`,
        badge: "csúszik",
        kocsiKod: s.jarmu_kod, hely: s.partner ?? null,
        szin: "red",
        sorok: [`Lerakás napja: ${s.lerakas_nap ?? "—"} — a fuvar még nyitott.`, `${s.felrako ?? "—"} → ${s.lerako ?? "—"}`],
        href: `/fuvarozas2/megbizasok/${s.id}`,
      });
    }
  }

  // 2e. Sofőr gondjelzései az élő rétegből. (A nem tervezett GPS-állás nem
  // ide kerül, hanem a kocsi oszlopába, időrendben a helyére — lásd tukorSorok.)
  for (const j of idovonal?.jarmuvek ?? []) {
    for (const blokk of j.fuvarok) {
      for (const gond of blokk.gondok ?? []) {
        if (!gond.nyitott) continue;
        elteresek.push({
          kulcs: `gond-${blokk.fuvarId}-${gond.mikor.getTime()}`,
          cim: `${gond.nev} · gondot jelzett`,
          soforNev: j.sofor ?? null, hely: gond.szoveg,
          badge: "gond van",
          szin: "red",
          sorok: [gond.szoveg, `${blokk.megrendelo ?? ""}${blokk.pozicioszam ? ` · ${blokk.pozicioszam}` : ""}`.trim() || "—"],
          href: `/fuvarozas2/megbizasok/${blokk.fuvarId}`,
        });
      }
    }
  }

  // 2f. Nyugtázás: a ma nyugtázott eltérés kimarad a sávból, amíg nem lesz
  // súlyosabb (sárgán nyugtázott, azóta piros → újra látszik). Éjfélkor lejár.
  const nyugtak = await query<{ kulcs: string; szin: string; nyugtazta: string | null; mikor: string }>(
    `select kulcs, szin, nyugtazta, to_char(nyugtazva_at at time zone 'Europe/Budapest', 'HH24:MI') as mikor
     from fuvar_elteres_nyugta where nap = $1::date`,
    [ma]
  ).catch(() => []);
  const nyugtaMap = new Map(nyugtak.map((n) => [n.kulcs, n]));
  const nyugtazott: MaVaszon["nyugtazott"] = [];
  const aktivElteresek: Elteres[] = [];
  for (const e of elteresek) {
    const n = nyugtaMap.get(e.kulcs);
    if (n && !(n.szin === "amber" && e.szin === "red")) nyugtazott.push({ ...e, nyugtazta: n.nyugtazta, mikor: n.mikor });
    else aktivElteresek.push(e);
  }
  elteresek.length = 0;
  elteresek.push(...aktivElteresek);

  // ---------------------------------------------------------------- csempék
  const [elsz] = await query<{ fotora: number; szamlazhato: number; szamlazhato_ft: number; postazando: number }>(
    `select
       count(*) filter (where m.allapot = 'teljesitve')::int as fotora,
       count(*) filter (where m.allapot in ('teljesitve','szamlazhato'))::int as szamlazhato,
       coalesce(sum(m.fuvardij) filter (where m.allapot in ('teljesitve','szamlazhato') and m.fuvardij_penznem = 'Ft'), 0)::int as szamlazhato_ft,
       count(*) filter (where m.allapot in ('szamlazva','email_elment'))::int as postazando
     from fuvar_megbizasok m where m.torolt_at is null and m.jelleg = 'ber'`
  );

  const papir = await query<{ id: string; partner: string | null; hivatkozas: string | null; hatarido_nap: number | null; lerakas: string | null }>(
    `select m.id::text, coalesce(p.nev, m.megrendelo) as partner,
       coalesce(m.hivatkozas_kanonikus, m.pozicioszam, m.reise_id) as hivatkozas,
       coalesce(p.papir_bekuldesi_hatarido_nap, 7) as hatarido_nap,
       to_char(coalesce(m.lerakas_datum, m.datum), 'YYYY-MM-DD') as lerakas
     from fuvar_megbizasok m
     left join fuvar_partnerek p on p.id = m.partner_id
     left join fuvar_elszamolas e on e.megbizas_id = m.id
     where m.torolt_at is null and m.jelleg = 'ber'
       and m.allapot in ('szamlazva','email_elment')
     order by coalesce(m.lerakas_datum, m.datum)`
  );
  const papirHatra = (r: { hatarido_nap: number | null; lerakas: string | null }) => {
    if (!r.lerakas) return null;
    const hatar = new Date(`${r.lerakas}T12:00:00Z`);
    hatar.setUTCDate(hatar.getUTCDate() + (r.hatarido_nap ?? 7));
    return Math.round((hatar.getTime() - most.getTime()) / 86400000);
  };
  const papirSurgos = papir.filter((r) => (papirHatra(r) ?? 99) <= 2);

  const utonKocsik = osszesJarmu.filter((j) => sorok.some((s) => s.jarmu_kod === j.kod && s.allapot === "folyamatban"));
  const maiMegbizas = sorok.filter((s) => aznap(s, ma) && s.allapot !== "ellenorzesre_var").length;
  const ellenorzesre = sorok.filter((s) => s.allapot === "ellenorzesre_var");

  const csempek: Csempe[] = [
    {
      kulcs: "uton", cimke: "Úton", ertek: `${utonKocsik.length} kocsi`,
      also: `${maiMegbizas} megbízás ma`, szin: "normal", href: null,
    },
    {
      kulcs: "elteres", cimke: "Eltérés", ertek: String(elteresek.length),
      also: elteresek.length === 0 ? "minden terv szerint" : elteresekOsszefoglalo(elteresek),
      szin: elteresek.some((e) => e.szin === "red") ? "red" : elteresek.length > 0 ? "amber" : "mint", href: null,
    },
    {
      kulcs: "ellenorzes", cimke: "Ellenőrzésre vár", ertek: String(ellenorzesre.length),
      also: ellenorzesre.length > 0 ? (ellenorzesre[0].partner ?? "import") : "nincs nyitott import",
      szin: ellenorzesre.length > 0 ? "amber" : "normal", href: "/fuvarozas2/megbizasok?szakasz=beerkezett",
    },
    {
      kulcs: "papir", cimke: "Postára vár", ertek: String(papir.length),
      also: papirSurgos.length > 0 ? `${papirSurgos.length} sürgős (${papirSurgos[0].partner ?? "—"})` : "nincs sürgős",
      szin: papirSurgos.length > 0 ? "red" : "normal", href: "/fuvarozas2/megbizasok?szakasz=postara",
    },
    {
      kulcs: "szamlazando", cimke: "Számlázandó", ertek: String(elsz?.szamlazhato ?? 0),
      also: ft(elsz?.szamlazhato_ft ?? 0), szin: (elsz?.szamlazhato ?? 0) > 0 ? "mint" : "normal", href: "/fuvarozas2/megbizasok?szakasz=szamlazasra",
    },
    {
      kulcs: "foto", cimke: "Fotó még nincs", ertek: String(elsz?.fotora ?? 0),
      also: null, szin: (elsz?.fotora ?? 0) > 0 ? "amber" : "normal", href: "/fuvarozas2/megbizasok?szakasz=szamlazasra",
    },
  ];

  // Kintlévőség — csak annak, aki a Számlák modult is látja.
  if (session.can("szamlak").view || session.can("attekintes").view) {
    try {
      const nyitott = await getSzamlaLista({ csakNyitott: true });
      const maISO = ma;
      const lejart = nyitott.filter((sz) => {
        const m = /^(\d{4})\.(\d{2})\.(\d{2})/.exec(sz.fizetesi_hatarido ?? "");
        return m ? `${m[1]}-${m[2]}-${m[3]}` < maISO : false;
      });
      const osszeg = nyitott.filter((sz) => sz.penznem === "Ft").reduce((a, sz) => a + szamlaHatralek(sz), 0);
      csempek.push({
        kulcs: "kintlevoseg", cimke: "Kintlévőség", ertek: ft(osszeg),
        also: lejart.length > 0 ? `${lejart.length} lejárt` : `${nyitott.length} nyitott számla`,
        szin: lejart.length > 0 ? "red" : "normal", href: "/szamlak",
      });
    } catch {
      // nincs jog vagy nincs szinkron — a csempe kimarad
    }
  }

  // A havi és heti bérfuvar-csempék 2026-10-17 óta a Pénz → Áttekintés lapon vannak
  // (getBerOsszesitok) — a Ma lap nem számolja (QA 2. kör #4).

  // ---------------------------------------------------------------- kocsik
  // Kocsinként a hiányzó papír/számla (az elmúlt 30 nap lerakásai).
  const papirKocsinkent = await query<{ jarmu_id: string; fotora: number; szamlazando: number }>(
    `select m.jarmu_id::text,
       count(*) filter (where m.allapot = 'teljesitve')::int as fotora,
       count(*) filter (where m.allapot = 'szamlazhato' and m.jelleg = 'ber')::int as szamlazando
     from fuvar_megbizasok m
     where m.torolt_at is null and m.jarmu_id is not null
       and coalesce(m.lerakas_datum, m.datum) >= $1::date - 30
     group by m.jarmu_id`,
    [ma]
  );
  const hetiPerc = await hetiVezetesPercek(gpsJarmuvek, ma).catch(() => new Map<string, number>());
  // Tachó (Ecofleet tcoData, jarmu_telemetria): ha a tábla még nincs vagy üres, a GPS-becslés marad.
  const tachok = await legutobbiTacho().catch(() => new Map<string, never>());

  const blokkKesz = (s: (typeof sorok)[number]): MaBlokk => {
    const gs = megalloMap.get(s.id) ?? [];
    const megalloSorok: MaMegalloSor[] = gs.map((g) => {
      const kesz = !!(g.gps_tavozas || g.sofor_kesz_at);
      const varakozik = !!(g.varakozas_kezdete && !g.varakozas_vege);
      const ablakIg = idobelyeg(g.ablak_ig);
      const lejartAblak = !kesz && !(g.gps_erkezes || g.sofor_megerkezett_at) && ablakIg != null && ablakIg < most;
      return {
        tipus: g.tipus,
        varos: varosNev(g.cim_nyers) ?? g.cim_nyers,
        allapot: kesz
          ? `kész ${ORA(g.sofor_kesz_at ?? g.gps_tavozas)}`
          : g.gps_erkezes
            ? varakozik ? `várakozik ${percKulonbseg(most, idobelyeg(g.varakozas_kezdete)!)} p` : `megérkezett ${ORA(g.gps_erkezes)}`
            : "",
        ido: g.ablak_tol || g.ablak_ig ? `${ORA(g.ablak_tol)}–${ORA(g.ablak_ig)}` : "",
        kiemelt: varakozik ? "varakozik" : lejartAblak ? "kesik" : null,
        kesz,
      };
    });
    const f = varosNev(s.felrako ?? "") ?? s.felrako ?? "—";
    const l = varosNev(s.lerako ?? "") ?? s.lerako ?? "—";
    return {
      id: s.id,
      partner: s.partner ?? "(nincs megbízó)",
      hivatkozas: s.hivatkozas,
      jelleg: s.jelleg,
      utvonal: megalloSorok.length > 1 ? `${megalloSorok[0].varos} → ${megalloSorok[megalloSorok.length - 1].varos}` : `${f} → ${l}`,
      felrakasNap: s.felrakas_nap,
      lerakasNap: s.lerakas_nap,
      megallok: megalloSorok.length > 0
        ? megalloSorok
        : [
            { tipus: "felrako" as const, varos: f, allapot: "", ido: "", kiemelt: null, kesz: false },
            { tipus: "lerako" as const, varos: l, allapot: "", ido: "", kiemelt: null, kesz: false },
          ],
    };
  };

  const kocsiAllapot = (elo: NonNullable<typeof idovonal>["jarmuvek"][number] | undefined): MaKocsiAllapot | null => {
    if (!elo) return null;
    const p = elo.eloPozicio;
    if (!p) return { szoveg: elo.hiba ?? "nincs élő GPS-adat", szin: "amber", hely: null };
    const regi = percKulonbseg(most, p.utolsoAdat);
    if (regi > 30) return { szoveg: `GPS ${ORA(p.utolsoAdat)} óta nem jelez`, szin: "amber", hely: p.cim };
    if (p.sebesseg >= 5) return { szoveg: `megy · ${Math.round(p.sebesseg)} km/h`, szin: "mint", hely: p.cim };
    const allas = [...elo.szakaszok].reverse().find((x) => x.tipus === "allas");
    const allPerc = allas && allas.tipus === "allas" && allas.elo ? percKulonbseg(most, allas.kezdet) : null;
    const tervezetlen = elo.nemTervezettAllasok.some((a) => percKulonbseg(most, a.veg) <= 5 && a.percek >= 30);
    return {
      szoveg: [allPerc != null ? `áll ${allPerc >= 60 ? `${oraPerc(allPerc)} ó` : `${allPerc} p`}` : "áll", p.motorJar ? "motor jár" : null].filter(Boolean).join(" · "),
      szin: tervezetlen ? "amber" : "normal",
      hely: p.cim,
    };
  };

  const [bejSorok, tavSorok] = await bejTavIgeret;
  const bejTerkep = bejegyzesekNapokra(bejSorok, [ma, holnap]);
  const tavTerkep = tavolletekNapokra(tavSorok);
  // Hétvégén / ünnepen nincs „ma nincs fuvar” szalag (szombaton ritkán, vasárnap soha nem megyünk).
  const maPihenonap = pihenoNapE(ma) || !munkanap(ma);

  const kocsik: MaKocsi[] = osszesJarmu.map((j) => {
    const torzs = findJarmuByKod(j.kod, jarmuLista);
    const becenev = torzs?.sofor ?? null;
    const sajat = sorok.filter((s) => s.jarmu_kod === j.kod && s.allapot !== "ellenorzesre_var");
    // Ma: a mai napra eső, és a korábbról csúszó, még nyitott fuvarok — a
    // folyamatban lévők ÉS a még el sem kezdett tervezettek is (eddig a
    // tegnapról maradt, el nem kezdett fuvar a kocsi oszlopából eltűnt, csak
    // a „csúszik” eltérés jelezte). A közös sorrendben a korábbi nap elöl
    // áll, a még el nem ért megállóik „csúszik” jelölést kapnak (tukorSorok).
    const csuszik = (s: MegbizasSor) => (s.lerakas_nap ?? "") < ma && (s.allapot === "folyamatban" || s.allapot === "tervezett");
    const maiak = sajat.filter((s) => aznap(s, ma) || csuszik(s));
    // A tükörbe a ma lezárultak is (készként) — a holnapi folytatást nem jelzik.
    const maiLezartak = lezartMaiak.filter((s) => s.jarmu_kod === j.kod);
    // A holnapi fuvarok a menet sorrendjében, nem a rögzítésében (napi-sorrend.ts).
    const holnapiak = alkalmazMenetSorrendet(
      napiSorrend(
        sajat.filter((s) => aznap(s, holnap) && !maiak.includes(s)),
        (s) => ({
          id: s.id, felrakasNap: s.felrakas_nap, lerakasNap: s.lerakas_nap, felrako: s.felrako, lerako: s.lerako,
          tervIdo: tervIdoMegbizasbol(s.felrakas_nap, s.felrakas_ablak_tol, s.idopont),
        })
      ),
      menetSorrendje(j.kod, holnap),
      (s) => s.id
    );
    const elo = becenev ? idovonal?.jarmuvek.find((x) => x.sofor === becenev) : undefined;
    // „még nem üzemel” csak fuvar nélkül (és GPS / rendszám nélkül) — a hozzárendelt fuvar mindig látszik.
    const helykitolto = kocsiHelykitolto({
      vanGps: !!j.ecofleet_object_id,
      vanRendszam: !!j.vontato_rendszam,
      vanFuvar: sajat.length > 0 || maiLezartak.length > 0 || hetFuvarok.some((f) => f.jarmu_kod === j.kod),
    });

    // Vezetési idő becslés: 4,5 óra vezetés után kötelező 45 perc szünet.
    let vezetesSor: string | null = null;
    if (elo?.vezetesSec != null) {
      const vezetesPerc = Math.round(elo.vezetesSec / 60);
      const utolsoSzunetOta = elo.utolsoSzunetVege ? percKulonbseg(most, elo.utolsoSzunetVege) : vezetesPerc;
      const szunetigPerc = Math.max(0, 270 - Math.min(utolsoSzunetOta, vezetesPerc));
      vezetesSor = [
        `Vezetés ma ${oraPerc(vezetesPerc)} / 9:00`,
        szunetigPerc === 0 ? "szünet esedékes" : `szünet ${oraPerc(szunetigPerc)} múlva`,
        elo.szolgalatKezdet ? `szolgálat ${ORA(elo.szolgalatKezdet)} óta` : null,
      ].filter(Boolean).join(" · ");
    }
    const hp = hetiPerc.get(j.kod);
    const tk = tachoKijelzes(tachok.get(j.kod)?.tacho, most);
    const etaSor = elo?.eloEta && !elo.eloEta.bizonytalan ? `ETA ${elo.eloEta.cel}: ${ORA(elo.eloEta.erkezes)}` : null;
    const pk = papirKocsinkent.find((x) => x.jarmu_id === j.id);
    const papirSorok: { szoveg: string; href: string }[] = [];
    if (pk?.fotora) papirSorok.push({ szoveg: `${pk.fotora} fuvarnál nincs még fotó/papír`, href: "/fuvarozas2/megbizasok?szakasz=szamlazasra" });
    if (pk?.szamlazando) papirSorok.push({ szoveg: `${pk.szamlazando} számlázandó`, href: "/fuvarozas2/megbizasok?szakasz=szamlazasra" });

    const bejMa = bejTerkep[j.kod]?.[ma] ?? [];
    const bejHolnap = bejTerkep[j.kod]?.[holnap] ?? [];
    const tavMa = tavTerkep[j.kod]?.[ma] ?? null;
    const tavHolnap = tavTerkep[j.kod]?.[holnap] ?? null;
    const holnapFolytatodik = maiak.some((s) => (s.lerakas_nap ?? "") >= holnap);
    const jelzesek = helykitolto ? [] : kocsiJelzesek({
      elteresek: elteresek.filter((e) => e.kocsiKod === j.kod || (!e.kocsiKod && !!becenev && e.soforNev === becenev)).map((e) => ({ szin: e.szin, badge: e.badge, hely: e.hely ?? null })),
      vanMaiFuvar: maiak.length > 0 || maiLezartak.length > 0,
      vanHolnapiFuvar: holnapiak.length > 0,
      holnapFolytatodik,
      tavolletMa: tavMa, tavolletHolnap: tavHolnap,
      egeszNaposMa: bejMa.some((b) => b.tol == null || b.ig == null), egeszNaposHolnap: bejHolnap.some((b) => b.tol == null || b.ig == null),
      maPihenonap, holnapCimke,
    });
    return {
      kod: j.kod,
      cimke: jarmuNev(j),
      sofor: becenev ?? j.sofor,
      helykitolto,
      szin: torzs?.szin ?? null,
      tachoNapiHatraPerc: tk ? tachok.get(j.kod)?.tacho?.napiVezetesHatraPerc ?? null : null,
      jelzesek, bejegyzesekMa: bejMa, bejegyzesekHolnap: bejHolnap, tavolletMa: tavMa, tavolletHolnap: tavHolnap,
      allapot: j.ecofleet_object_id ? kocsiAllapot(elo) : helykitolto ? null : { szoveg: "nincs GPS", szin: "amber", hely: null },
      vezetesSor,
      hetiSor: tk ? tk.hetiSor : hp != null ? `Hét: ${Math.round(hp / 60)} / 56 óra` : null,
      hetiForras: tk ? "tacho" : hp != null ? "gps" : null,
      tacho: tk ? { reszletek: tk.reszletek } : null,
      napiKm: elo?.napiKm ?? null,
      etaSor,
      sorok: tukorSorok({
        fuvarok: [...maiak, ...maiLezartak].map((s) => ({
          id: s.id, partner: s.partner, hivatkozas: s.hivatkozas, jelleg: s.jelleg,
          megallo_reszletek: s.megallo_reszletek, megallok: megalloMap.get(s.id) ?? [],
          lezart: maiLezartak.includes(s),
          felrakasNap: s.felrakas_nap,
          lerakasNap: s.lerakas_nap,
          felrakasAblakTol: s.felrakas_ablak_tol,
          idopont: s.idopont,
          csuszik: !maiLezartak.includes(s) && csuszik(s),
        })),
        // A GPS nem tervezett állásai, a koordinátájukkal (az idővonal állás-szakaszából).
        allasok: (elo?.nemTervezettAllasok ?? []).map((a) => {
          const sz = elo?.szakaszok.find((x) => x.tipus === "allas" && x.kezdet.getTime() === a.kezdet.getTime());
          return { ...a, lat: sz && sz.tipus === "allas" ? sz.lat : null, lon: sz && sz.tipus === "allas" ? sz.lon : null };
        }),
        eta: elo?.eloEta && !elo.eloEta.bizonytalan ? elo.eloEta.erkezes : null,
        etaCel: elo?.eloEta?.cel ?? null,
        most,
        ma,
        menetSorrend: menetSorrendje(j.kod, ma),
      }),
      holnap: holnapiak.map(blokkKesz),
      holnapFolytatodik,
      papir: papirSorok,
    };
  });
  while (kocsik.length < KOCSI_OSZLOP) {
    kocsik.push({
      kod: null, cimke: `${kocsik.length + 1}. kocsi`, sofor: null, helykitolto: "még nincs beállítva",
      allapot: null, vezetesSor: null, hetiSor: null, napiKm: null, etaSor: null,
      sorok: [], holnap: [], holnapFolytatodik: false, papir: [],
    });
  }

  // ---------------------------------------------------------------- teendők, holnap, rendszer
  const teendok = [
    {
      cimke: "Postára vár", ertek: `${papir.length}`,
      also: papirSurgos.length > 0 ? `${papirSurgos[0].partner ?? ""} ${papirSurgos[0].hivatkozas ?? ""} · ${papirHatra(papirSurgos[0])} nap`.trim() : null,
      href: "/fuvarozas2/megbizasok?penz=papir",
    },
    { cimke: "Számlázandó", ertek: `${elsz?.szamlazhato ?? 0}`, also: ft(elsz?.szamlazhato_ft ?? 0), href: "/fuvarozas2/megbizasok?penz=szamlazatlan" },
    { cimke: "Fotó még nincs", ertek: `${elsz?.fotora ?? 0}`, also: null, href: "/fuvarozas2/megbizasok?penz=papir" },
  ];

  const holnapiak = sorok.filter((s) => aznap(s, holnap));
  const holnapKocsiNelkul = holnapiak.filter((s) => !s.jarmu_kod);
  // Csak két bérfuvar ugyanarra a kocsira és napra ütközés; a köré tervezett saját fuvar nem.
  const utkozes = osszesJarmu.filter((j) => berUtkozes(holnapiak.filter((s) => s.jarmu_kod === j.kod))).length;
  const holnapDoboz: { cimke: string; ertek: string; szin: CsempeSzin }[] = [
    { cimke: `${holnapCimke}i megbízás`, ertek: String(holnapiak.length), szin: "normal" },
    { cimke: `${holnapCimke} kocsi nélkül`, ertek: String(holnapKocsiNelkul.length), szin: holnapKocsiNelkul.length > 0 ? "red" : "normal" },
    { cimke: "Ütközés", ertek: utkozes === 0 ? "nincs" : `${utkozes} kocsi`, szin: utkozes > 0 ? "amber" : "normal" },
  ];

  return {
    ma, holnap, holnapCimke, csempek, nyugtazott,
    kihasznaltsag: await kihasznaltsagIgeret,
    nyugtazhat: session.can("fuvarozas").edit,
    frissitve: ORA(most),
    elteresek: elteresek.sort((a, b) => (a.szin === b.szin ? 0 : a.szin === "red" ? -1 : 1)),
    kocsik,
    kocsiNelkul: sorok.filter((s) => !s.jarmu_kod && (aznap(s, ma) || aznap(s, holnap))).map((s) => ({
      id: s.id, partner: s.partner ?? "(nincs megbízó)",
      utvonal: `${varosNev(s.felrako ?? "") ?? s.felrako ?? "—"} → ${varosNev(s.lerako ?? "") ?? s.lerako ?? "—"}`,
      nap: s.felrakas_nap, allapot: s.allapot,
    })),
    teendok, holnapDoboz, maPihenonap,
  };
}

function elteresekOsszefoglalo(e: Elteres[]): string {
  const csoport = new Map<string, number>();
  for (const x of e) {
    const kulcs = x.badge.split(" ")[0];
    csoport.set(kulcs, (csoport.get(kulcs) ?? 0) + 1);
  }
  return [...csoport.entries()].map(([k, n]) => `${n} ${k}`).join(" · ");
}

/**
 * A hét (hétfőtől máig) GPS szerinti vezetési perce kocsinként — az 56 órás
 * heti kerethez. Az Ecofleet heti útjelentéséből, 10 percig gyorsítótárazva,
 * hogy a Ma oldal ne kérdezze minden megnyitáskor.
 */
async function hetiVezetesPercek(
  jarmuvek: { kod: string; ecofleet_object_id: string | null; vontato_rendszam: string | null }[],
  ma: string
): Promise<Map<string, number>> {
  const d = new Date(`${ma}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const hetfo = d.toISOString().slice(0, 10);
  const ids = jarmuvek.map((j) => j.ecofleet_object_id).filter((x): x is string => !!x);
  if (ids.length === 0) return new Map();
  return cachelve(`ma-heti-vezetes:${hetfo}:${ma}`, 10 * 60 * 1000, async () => {
    const utak = await getUtvonalJelentes(ids, hetfo, ma);
    const eredmeny = new Map<string, number>();
    for (const j of jarmuvek) {
      const kulcs = rendszamKulcs(j.vontato_rendszam ?? j.kod);
      let percek = 0;
      for (const u of utak.filter((x) => x.rendszamKulcs === kulcs)) {
        const i = new Date(u.indulas.replace(" ", "T"));
        const e = new Date(u.erkezes.replace(" ", "T"));
        if (!Number.isNaN(i.getTime()) && !Number.isNaN(e.getTime()) && e > i) percek += (e.getTime() - i.getTime()) / 60000;
      }
      eredmeny.set(j.kod, Math.round(percek));
    }
    return eredmeny;
  });
}

/**
 * „Ez a hely”: a GPS szerinti állás koordinátáját a megálló címéhez rögzíti
 * (fuvar_helyszin_koordinata — ugyanaz a szótár, amit a sofőr „Rossz a cím?
 * Itt vagyok” gombja ír). Onnantól a GPS-felismerés ide várja ezt a címet, és
 * a kocsi itt állása nem „nem tervezett”. A diszpécser a Ma oldalon teszi,
 * amikor a GPS-állás egy fel nem ismert megállóra esett (Polgár, Pap tanya;
 * Budapest, Sörgyár u. — 2026-09-28).
 */
export async function rogzitAllasMegalloHelyekent(
  megbizasId: string,
  sorszam: number,
  lat: number,
  lon: number
): Promise<{ ok: true; cim: string } | { ok: false; hiba: string }> {
  await requireEditPermission("fuvarozas");
  const session = await requireSession();
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 44 || lat > 50 || lon < 13 || lon > 26) {
    return { ok: false, hiba: "Érvénytelen koordináta." };
  }
  const [g] = await query<{ cim_nyers: string }>(
    `select cim_nyers from fuvar_megallok where megbizas_id = $1 and sorszam = $2`,
    [megbizasId, sorszam]
  );
  if (!g) return { ok: false, hiba: "Nincs ilyen megálló." };
  const kulcs = cimKulcs(g.cim_nyers);
  if (!kulcs) return { ok: false, hiba: "A megállónak nincs címe." };
  await query(
    `insert into fuvar_helyszin_koordinata (cim_kulcs, cim_minta, lat, lon, forras, rogzitve_by)
     values ($1, $2, $3, $4, 'diszpecser', $5)
     on conflict (cim_kulcs)
     do update set cim_minta = excluded.cim_minta, lat = excluded.lat, lon = excluded.lon,
                   forras = excluded.forras, rogzitve_by = excluded.rogzitve_by, rogzitve_at = now()`,
    [kulcs, g.cim_nyers, lat, lon, session.name ?? session.username]
  );
  toroljGeokodCachet();
  toroljIdovonalCachet();
  revalidatePath("/fuvarozas2");
  console.log(`[ma] megálló helye rögzítve a GPS-állásból: "${g.cim_nyers}" → ${lat.toFixed(5)}, ${lon.toFixed(5)} (${session.name})`);
  return { ok: true, cim: g.cim_nyers };
}

/**
 * Eltérés nyugtázása a Ma oldalon („OK”): aznap nem látszik a sávban, amíg
 * nem lesz súlyosabb (sárgából piros). A kulcs a getMaVaszon eltérés-kulcsa.
 */
export async function nyugtazElterest(
  kulcs: string,
  szin: "red" | "amber"
): Promise<{ ok: true } | { ok: false; hiba: string }> {
  await requireEditPermission("fuvarozas");
  const session = await requireSession();
  if (typeof kulcs !== "string" || kulcs.length === 0 || kulcs.length > 200) return { ok: false, hiba: "Érvénytelen eltérés." };
  if (szin !== "red" && szin !== "amber") return { ok: false, hiba: "Érvénytelen szín." };
  await query(
    `insert into fuvar_elteres_nyugta (nap, kulcs, szin, nyugtazta)
     values ((now() at time zone 'Europe/Budapest')::date, $1, $2, $3)
     on conflict (nap, kulcs) do update set szin = excluded.szin, nyugtazta = excluded.nyugtazta, nyugtazva_at = now()`,
    [kulcs, szin, session.name ?? session.username]
  );
  revalidatePath("/fuvarozas2");
  return { ok: true };
}

/** A nyugtázás visszavonása — az eltérés újra a sávba kerül. */
export async function visszavonNyugtat(kulcs: string): Promise<{ ok: true } | { ok: false; hiba: string }> {
  await requireEditPermission("fuvarozas");
  if (typeof kulcs !== "string" || kulcs.length === 0 || kulcs.length > 200) return { ok: false, hiba: "Érvénytelen eltérés." };
  await query(
    `delete from fuvar_elteres_nyugta where nap = (now() at time zone 'Europe/Budapest')::date and kulcs = $1`,
    [kulcs]
  );
  revalidatePath("/fuvarozas2");
  return { ok: true };
}
