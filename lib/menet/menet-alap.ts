// Menetterv — a tiszta (adatbázis és hálózat nélküli) számítások.
// Teszt: scripts/teszt-menetterv.ts.
//
// Egy menet = egy kocsi egy napja, sorszámozott feladatokkal: a megbízások
// (bérfuvar / saját áru / telephelyi rakodás) és köztük az ÜRES
// POZICIONÁLÁS külön feladatként, ha az előző utolsó lerakója nem az
// következő első felrakója (és a kocsi indulási helyéről az első munkáig).
//
// A sorrend javaslata a közös napi szabály (lib/fuvarozas2/napi-sorrend.ts);
// ha egy menetet jóváhagytak, ATTÓL kezdve az a sorrend forrása minden
// nézetben — lásd alkalmazMenetSorrendet.
//
// A km forrása: a hívó adja a távolság-függvényt (szerveren HU-GO, légvonal
// × 1,3 tartalékkal — 'becsles' jelöléssel), így itt minden tesztelhető.

import { cimKulcs, varosNev } from "@/lib/fuvarozas/varos";
import { budapestFalioraToInstant, budapestNapISO } from "@/lib/fuvarozas/idozona";
import { napiSorrend } from "@/lib/fuvarozas2/napi-sorrend";
import type {
  FeladatJavaslat,
  FeladatTipus,
  Figyelmeztetes,
  Hely,
  KmForras,
  MenetBeallitas,
  MenetFigyelmeztetes,
  MenetMunka,
  Pont,
  PotkocsiKapacitas,
  TavFn,
  TelephelyPontAdat,
} from "@/lib/menet/tipusok";

// ---------------------------------------------------------------- helyek

/** Légvonalbeli távolság km-ben (haversine). */
export function legvonalKm(a: Pont, b: Pont): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** A közúti becslés szorzója légvonalra (mint ures-km.ts / tervezes.ts). */
export const KOZUTI_SZORZO = 1.3;

const varosKulcs = (cim: string | null | undefined) => cimKulcs(varosNev(cim ?? "") || "");

/** Csak településnév (irányítószámmal, országkóddal) — utca nélkül. */
function csakVaros(cim: string): boolean {
  const v = varosKulcs(cim);
  if (!v) return false;
  const maradek = cimKulcs(cim).replace(/\b\d{4}\b/g, " ").replace(/\bhu\b/g, " ").replace(/\s+/g, " ").trim();
  return maradek === v;
}

/** A telephely címéből az utca első szava ("rakoczi", "bocskai", "tunde", "letai"). */
function utcaSzo(cim: string): string | null {
  const v = varosKulcs(cim);
  const szavak = cimKulcs(cim).split(" ").filter((s) => s && !/^\d/.test(s) && s !== "hu" && !(v && v.split(" ").includes(s)));
  return szavak[0] ?? null;
}

/**
 * Saját telephely-pont-e egy hely: koordináta szerint 1 km-en belül; vagy
 * ugyanaz a település ÉS a telephely utcája szerepel a címben; vagy — csak
 * ha `csakVarosElfogad` (saját fuvarnál) — csupasz településnév, ahol van
 * saját pontunk ("Szakoly"). Bérfuvar „Nyíregyháza” lerakója így nem lesz
 * telephely.
 */
export function sajatTelephelyPontja(hely: Hely, telephelyek: TelephelyPontAdat[], csakVarosElfogad = false): TelephelyPontAdat | null {
  if (hely.telephelyPontId) return telephelyek.find((t) => t.id === hely.telephelyPontId) ?? null;
  if (hely.pont) {
    const kozeli = telephelyek.find((t) => t.pont && legvonalKm(hely.pont!, t.pont) <= 1);
    if (kozeli) return kozeli;
  }
  const cim = hely.cim?.trim();
  if (!cim) return null;
  const v = varosKulcs(cim);
  if (!v) return null;
  const kulcs = ` ${cimKulcs(cim)} `;
  const azonosVaros = telephelyek.filter((t) => varosKulcs(t.cim) === v);
  const utcaval = azonosVaros.find((t) => {
    const szo = utcaSzo(t.cim);
    return szo != null && kulcs.includes(` ${szo} `);
  });
  if (utcaval) return utcaval;
  if (csakVarosElfogad && azonosVaros.length > 0 && csakVaros(cim)) return azonosVaros[0];
  return null;
}

/** Ugyanaz a hely-e (távolság-hívás nélkül): 1 km-en belül, vagy azonos cím-kulcs. */
export function ugyanazAHely(a: Hely, b: Hely): boolean {
  if (a.telephelyPontId && b.telephelyPontId) return a.telephelyPontId === b.telephelyPontId;
  if (a.pont && b.pont) return legvonalKm(a.pont, b.pont) <= 1;
  const ka = a.cim ? cimKulcs(a.cim) : "";
  const kb = b.cim ? cimKulcs(b.cim) : "";
  return ka !== "" && ka === kb;
}

// ---------------------------------------------------------------- típus, kapacitás

/**
 * A feladat típusa egy megbízásból: jelleg 'ber' → bérfuvar; 'sajat' →
 * saját áru, kivéve ha mindkét vége saját telephely-pont → telephelyi rakodás.
 */
export function feladatTipusMunkabol(m: Pick<MenetMunka, "jelleg" | "felrako" | "lerako">, telephelyek: TelephelyPontAdat[]): FeladatTipus {
  if (m.jelleg === "ber") return "berfuvar";
  const fel = sajatTelephelyPontja(m.felrako, telephelyek, true);
  const le = sajatTelephelyPontja(m.lerako, telephelyek, true);
  return fel && le ? "telephelyi_rakodas" : "sajat_aru";
}

/**
 * Raklap-darab és raklaphely a szabad szöveges mennyiségből: „660 db”,
 * „33 raklap”, „812 db EUR raklap”, „34 raklaphely”. Ha nem olvasható: null.
 */
export function raklapMennyisegbol(szoveg: string | null | undefined): { raklapDb: number | null; raklaphely: number | null } {
  const s = (szoveg ?? "").toLowerCase();
  const hely = /(\d{1,3})\s*(?:raklap\s*hely|raklaphely|rakl\.?\s*hely|hely)/.exec(s);
  const db = /(\d{1,5})\s*(?:db|darab|raklap(?!\s*hely|hely)|rakl\b|pal)/.exec(s);
  return { raklapDb: db ? Number(db[1]) : null, raklaphely: hely ? Number(hely[1]) : null };
}

const max = (a: number | null, b: number | null) => (a == null ? b : b == null ? a : Math.max(a, b));

/**
 * Kapacitás-figyelmeztetés: több raklap / raklaphely, mint amennyi a
 * pótkocsira fér — a forgatott rakás (812 db / 28 hely) is elfogadott, a
 * nagyobbik határ számít. Ismeretlen kapacitásnál nincs jelzés.
 */
export function kapacitasFigyelmeztetes(m: Pick<MenetMunka, "raklapDb" | "raklaphely">, k: PotkocsiKapacitas | null): Figyelmeztetes | null {
  if (!k) return null;
  const dbHatar = max(k.raklapDbNormal, k.raklapDbForgatott);
  if (m.raklapDb != null && dbHatar != null && m.raklapDb > dbHatar) {
    return { kod: "kapacitas", szoveg: `${m.raklapDb} raklap nem fér a pótkocsira (legfeljebb ${dbHatar} db, forgatva is).` };
  }
  const helyHatar = max(k.raklaphelyNormal, k.raklaphelyForgatott);
  if (m.raklaphely != null && helyHatar != null && m.raklaphely > helyHatar) {
    return { kod: "kapacitas", szoveg: `${m.raklaphely} raklaphely nem fér a pótkocsira (legfeljebb ${helyHatar}).` };
  }
  return null;
}

// ---------------------------------------------------------------- javaslat

const PERC = 60_000;
const ORA_FMT = (ms: number) =>
  new Date(ms).toLocaleTimeString("hu-HU", { timeZone: "Europe/Budapest", hour: "2-digit", minute: "2-digit" });

export type MenetJavaslatBemenet = {
  /** A nap (YYYY-MM-DD, Budapest). */
  nap: string;
  /** A kocsi megbízásai erre a napra (bármilyen sorrendben). */
  munkak: MenetMunka[];
  /** Ahonnan a kocsi indul (előző lerakó, különben a saját telephelye). */
  indulas: Hely;
  telephelyek: TelephelyPontAdat[];
  kapacitas: PotkocsiKapacitas | null;
  beallitas: MenetBeallitas;
  tav: TavFn;
  /** Kötött munka-sorrend (megbízás-id-k) — átrendezésnél; különben a közös napi szabály. */
  sorrend?: readonly string[] | null;
  /** A nap első indulása-e (az üres-indulás figyelmeztetéshez). Alapból igen. */
  elsoIndulas?: boolean;
  /** Ahonnan a sorszámozás indul (a lezárt előtag után). Alapból 1. */
  sorszamKezdet?: number;
  /** Ennél korábban nem indulhat (ms) — a lezárt előtag vége átrendezéskor. */
  legkorabbiIndulas?: number | null;
};

/** A munkák sorrendje: kötött sorrend, különben a közös napi szabály. */
export function munkakSorrendben(munkak: MenetMunka[], sorrend?: readonly string[] | null): MenetMunka[] {
  const alap = napiSorrend(munkak, (m) => ({
    id: m.id,
    felrakasNap: m.felrakasNap,
    lerakasNap: m.lerakasNap,
    felrako: m.felrako.cim,
    lerako: m.lerako.cim,
    tenyIdo: m.tenyIdo ?? null,
    lezart: !!m.lezart,
    tervIdo: m.tervIdo,
  }));
  if (!sorrend || sorrend.length === 0) return alap;
  const rang = new Map(sorrend.map((id, i) => [id, i]));
  // A kötött sorrendben nem szereplő (közben kocsira tett) munka a napi szabály szerinti helyén, a végén.
  const benne = alap.filter((m) => rang.has(m.id)).sort((a, b) => rang.get(a.id)! - rang.get(b.id)!);
  return [...benne, ...alap.filter((m) => !rang.has(m.id))];
}

/** A nap kezdete, ha a beállítás nem mondja meg (06:00). */
export const NAP_KEZDES_ALAP_PERC = 360;

/** „06:00” / „6:30” (vagy {"ertek": "06:00"}) → perc éjféltől; érvénytelen értékre null. */
export function napKezdesPercbol(ertek: unknown): number | null {
  const nyers = ertek !== null && typeof ertek === "object" && "ertek" in (ertek as Record<string, unknown>) ? (ertek as Record<string, unknown>).ertek : ertek;
  const s = typeof nyers === "string" ? nyers.trim() : "";
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const ora = Number(m[1]), perc = Number(m[2]);
  return ora < 24 && perc < 60 ? ora * 60 + perc : null;
}

/** A nap (YYYY-MM-DD) budapesti `perc` (éjféltől) időpontja, ms. */
export function budapestNapIdo(nap: string, perc: number): number {
  const [ev, ho, n] = nap.split("-").map(Number);
  return budapestFalioraToInstant(ev, ho, n, Math.floor(perc / 60), perc % 60).getTime();
}

/** Egy munka lépése a láncban — a helyek és km-ek (időtől független rész). */
type Lepes = {
  m: MenetMunka;
  hozott: boolean;
  /** Az üres pozicionálás feladata (idők nélkül), és a menetideje (perc; null: nem helyezhető el). */
  ures: { feladat: FeladatJavaslat; perc: number | null } | null;
  /** A felrakóhoz érkezés ugyanott / 1 km-en belül (nincs külön üres szakasz). */
  helyben: boolean;
  /** A rakott út menetideje (perc; null: nincs km). */
  rakottPerc: number | null;
  /** A munka feladata (idők és idő-függő figyelmeztetések nélkül). */
  feladat: FeladatJavaslat;
};

/** Egy megálló időablaka a horgonyhoz — csak a menet napjára eső ablak számít. */
function ablakANapon(nap: string, tol: number | null | undefined, ig: number | null | undefined): { tol: number | null; ig: number | null } | null {
  const t = tol ?? null, i = ig ?? null;
  const egyik = i ?? t;
  if (egyik == null || budapestNapISO(new Date(egyik)) !== nap) return null;
  return { tol: t, ig: i };
}

/**
 * A nap indulási ideje a lánchoz (tiszta). Az első időzített megálló (tény,
 * vagy a menet napjára eső ablak) a horgony: a tulajdonos elve szerint az
 * ablak VÉGÉRE érkezik (`horgony` = 'ablak_eleje' esetén az elejére). Ha a
 * horgony előtt más megálló is van, a kocsi a nap kezdeténél (alapból 06:00)
 * korábban nem indul — így egy elé tett munka miatt az ablak lekésése
 * figyelmeztetést ad, nem éjszakai indulást. Ablak nélkül: a nap kezdete.
 */
function indulasiIdo(nap: string, lepesek: Lepes[], be: { felrakasPerc: number; lerakasPerc: number; napKezdes: number }, horgony: "ablak_vege" | "ablak_eleje"): number {
  let eltolas = 0;
  let megalloElotte = false;
  for (const l of lepesek) {
    if (l.ures) {
      if (l.ures.perc == null) break; // ismeretlen szakasz után nem horgonyzunk
      eltolas += l.ures.perc;
    }
    if (!l.hozott) {
      if (l.m.tenyIdo != null) return l.m.tenyIdo - eltolas * PERC;
      const a = ablakANapon(nap, l.m.tervIdo, l.m.felrakasAblakIg ?? l.m.tervIdo);
      if (a) {
        const cel = horgony === "ablak_vege" ? (a.ig ?? a.tol)! : (a.tol ?? a.ig)!;
        const ido = cel - eltolas * PERC;
        return megalloElotte ? Math.max(ido, be.napKezdes) : ido;
      }
      megalloElotte = true;
      eltolas += be.felrakasPerc;
    }
    if (l.rakottPerc == null) break;
    eltolas += l.rakottPerc;
    const a = ablakANapon(nap, l.m.lerakasAblakTol, l.m.lerakasAblakIg);
    if (a) {
      const cel = horgony === "ablak_vege" ? (a.ig ?? a.tol)! : (a.tol ?? a.ig)!;
      const ido = cel - eltolas * PERC;
      return megalloElotte ? Math.max(ido, be.napKezdes) : ido;
    }
    megalloElotte = true;
    eltolas += be.lerakasPerc;
  }
  return be.napKezdes;
}

/**
 * Az idő-lánc egy indulási időből (tiszta, szinkron): minden feladat
 * tervezett indulása és érkezése a sorrendben, a menetidőkkel és a
 * ráhagyásokkal; ablak előtt várakozik, az ablak vége után ütközés-
 * figyelmeztetést ír. Visszaadja a késő megállók számát is.
 */
function idoLanc(lepesek: Lepes[], indulas: number, be: { felrakasPerc: number; lerakasPerc: number }): { feladatok: FeladatJavaslat[]; kesoDb: number } {
  const ki: FeladatJavaslat[] = [];
  let ido: number | null = indulas;
  let kesoDb = 0;
  let elozoAblakVeg: number | null = null;
  let elozoNev: string | null = null;
  for (const l of lepesek) {
    const { m } = l;
    let erkezesFelrakora: number | null = null;
    if (l.ures) {
      const erk = ido != null && l.ures.perc != null ? ido + l.ures.perc * PERC : null;
      ki.push({ ...l.ures.feladat, tervezettIndulas: ido, tervezettErkezes: erk });
      erkezesFelrakora = erk;
    } else if (l.helyben) {
      erkezesFelrakora = ido;
    }

    const figy = [...l.feladat.figyelmeztetesek];
    const ablakHatar = m.felrakasAblakIg ?? m.tervIdo;
    if (!m.tenyIdo && !m.lezart) {
      if (erkezesFelrakora != null && ablakHatar != null && erkezesFelrakora > ablakHatar) {
        figy.push({ kod: "utkozes", szoveg: `Az előző feladat után legkorábban ${ORA_FMT(erkezesFelrakora)}-kor ér a felrakóra — az ablak ${ORA_FMT(ablakHatar)}.` });
        kesoDb++;
      } else if (elozoAblakVeg != null && m.tervIdo != null && m.tervIdo < elozoAblakVeg) {
        figy.push({ kod: "utkozes", szoveg: `Az ablaka (${ORA_FMT(m.tervIdo)}) belelóg az előző munka ablakába (${elozoNev ?? "előző"} vége ${ORA_FMT(elozoAblakVeg)}).` });
      }
    }

    // Kezdés: a hozott rakomány azonnal indul; különben a tény, vagy az érkezés
    // (az ablak elejéig várva), ismeretlen érkezésnél az ablak eleje.
    const kezdes: number | null = l.hozott
      ? ido
      : m.tenyIdo != null
        ? m.tenyIdo
        : erkezesFelrakora != null
          ? (m.tervIdo != null ? Math.max(m.tervIdo, erkezesFelrakora) : erkezesFelrakora)
          : m.tervIdo;
    let erkezes: number | null = null;
    if (kezdes != null && l.rakottPerc != null) {
      let e: number = kezdes + ((l.hozott ? 0 : be.felrakasPerc) + l.rakottPerc) * PERC;
      if (m.lerakasAblakTol != null && e < m.lerakasAblakTol) e = m.lerakasAblakTol;
      if (!m.lezart && !m.tenyIdo && m.lerakasAblakIg != null && e > m.lerakasAblakIg) {
        figy.push({ kod: "utkozes", szoveg: `A lerakási ablak végéig (${ORA_FMT(m.lerakasAblakIg)}) nem ér oda — várható ${ORA_FMT(e)}.` });
        kesoDb++;
      }
      erkezes = e;
    }
    ki.push({ ...l.feladat, tervezettIndulas: kezdes ?? null, tervezettErkezes: erkezes, figyelmeztetesek: figy });
    ido = erkezes != null ? erkezes + be.lerakasPerc * PERC : null;
    elozoAblakVeg = m.lerakasAblakIg ?? m.lerakasAblakTol ?? null;
    elozoNev = varosNev(m.lerako.cim ?? "") || null;
  }
  return { feladatok: ki, kesoDb };
}

/**
 * Egy kocsi egy napjának javasolt feladatlistája. Tiszta (a távolság-függvény
 * a bemenet része). Minden hívás a TELJES idő-láncot számolja újra az adott
 * sorrendre (javaslat, átrendezés, optimalizáló elfogadása): indulási hely →
 * menetidők (átlagsebesség) → fel-/lerakási ráhagyás (beállítás), az ablakok
 * szerint (lásd indulasiIdo: az első időzített megálló ablakának végére,
 * ha az több késést okozna, az elejére; ablak nélkül a nap kezdetétől).
 * Figyelmeztetések — soha nem blokkol:
 *   • ures_indulas: a nap első üres indulása, és az első felrakó a
 *     legközelebbi saját telephelytől is messzebb van a beállított km-nél (30);
 *   • kapacitas: több raklap/raklaphely, mint a pótkocsi (forgatva is);
 *   • utkozes: a tervezett érkezés a fel-/lerakási ablak vége után van, vagy a
 *     két megbízás ablaka egymásba lóg;
 *   • hianyzo_cim: hiányzó cím, vagy nem helyezhető el (nincs km).
 */
export async function epitMenetJavaslat(be: MenetJavaslatBemenet): Promise<FeladatJavaslat[]> {
  const { nap, telephelyek, kapacitas, beallitas, tav } = be;
  const sebesseg = beallitas.atlagSebessegKmh > 0 ? beallitas.atlagSebessegKmh : 60;
  const menetPerc = (km: number) => Math.round((km / sebesseg) * 60);
  const lepesek: Lepes[] = [];
  let sorszam = be.sorszamKezdet ?? 1;
  let hol: Hely = be.indulas;
  let elsoUres = be.elsoIndulas ?? true;
  const telephelyId = (h: Hely, csakVaros: boolean) => h.telephelyPontId ?? sajatTelephelyPontja(h, telephelyek, csakVaros)?.id ?? null;

  // 1. A helyek és a km-ek (HU-GO / becslés) — az időtől független rész.
  for (const m of munkakSorrendben(be.munkak, be.sorrend)) {
    const sajat = m.jelleg === "sajat";
    const munkaFigy: Figyelmeztetes[] = [];
    if (!m.felrako.cim?.trim() || !m.lerako.cim?.trim()) {
      munkaFigy.push({ kod: "hianyzo_cim", szoveg: `Hiányzik a ${!m.felrako.cim?.trim() ? "felrakó" : "lerakó"} címe.` });
    }

    // Üres pozicionálás a felrakóhoz — ha a munka nem korábbi napról hozott
    // rakomány (az már a kocsin van), és nem ugyanott vagyunk.
    const hozott = (m.felrakasNap ?? nap) < nap;
    let ures: Lepes["ures"] = null;
    let helyben = false;
    if (!hozott && m.felrako.cim?.trim() && !ugyanazAHely(hol, m.felrako)) {
      const t = hol.cim || hol.pont ? await tav(hol, m.felrako) : null;
      if (t != null && t.km <= 1) helyben = true;
      else {
        const figy: Figyelmeztetes[] = [];
        if (t == null) figy.push({ kod: "hianyzo_cim", szoveg: `Nem helyezhető el: ${hol.cim ?? "?"} → ${m.felrako.cim}.` });
        if (elsoUres && t != null) {
          // A legközelebbi saját telephelytől is messze van-e a felrakó.
          // (Ismert koordinátáknál légvonal × 1,3 — ez csak küszöb-összevetés, nem kell rá útvonal.)
          let legkozelebbi = Infinity;
          for (const tp of telephelyek) {
            const x = tp.pont && m.felrako.pont
              ? { km: legvonalKm(tp.pont, m.felrako.pont) * KOZUTI_SZORZO }
              : await tav({ cim: tp.cim, pont: tp.pont, telephelyPontId: tp.id }, m.felrako);
            if (x != null) legkozelebbi = Math.min(legkozelebbi, x.km);
          }
          const hatar = beallitas.uresIndulasFigyelmeztetesKm;
          if (Math.min(t.km, legkozelebbi) > hatar) {
            figy.push({ kod: "ures_indulas", szoveg: `Üres indulás ${Math.round(t.km)} km — a felrakó a legközelebbi telephelytől is ${Number.isFinite(legkozelebbi) ? Math.round(legkozelebbi) : "?"} km (határ ${hatar} km).` });
          }
        }
        ures = {
          perc: t ? menetPerc(t.km) : null,
          feladat: {
            sorszam: sorszam++,
            feladatTipus: "ures_pozicionalas",
            megbizasId: null,
            kiinduloCim: hol.cim,
            celCim: m.felrako.cim,
            kiinduloTelephelyPontId: telephelyId(hol, true),
            celTelephelyPontId: telephelyId(m.felrako, sajat),
            tervezettIndulas: null,
            tervezettErkezes: null,
            uresKm: t ? Math.round(t.km) : null,
            rakottKm: null,
            kmForras: t?.forras ?? null,
            raklapDb: null,
            figyelmeztetesek: figy,
          },
        };
      }
      elsoUres = false;
    } else if (!hozott) {
      helyben = true;
      elsoUres = false;
    }

    // A munka maga: rakott km (tárolt HU-GO, különben a távolság-függvény).
    let rakott: { km: number; forras: KmForras } | null = m.rakottKm != null ? { km: m.rakottKm, forras: "hugo" } : null;
    if (!rakott && m.felrako.cim?.trim() && m.lerako.cim?.trim()) {
      rakott = ugyanazAHely(m.felrako, m.lerako) ? { km: 0, forras: "hugo" } : await tav(m.felrako, m.lerako);
      if (!rakott) munkaFigy.push({ kod: "hianyzo_cim", szoveg: `Nem helyezhető el: ${m.felrako.cim} → ${m.lerako.cim}.` });
    }
    const kap = kapacitasFigyelmeztetes(m, kapacitas);
    if (kap) munkaFigy.push(kap);

    lepesek.push({
      m,
      hozott,
      ures,
      helyben,
      rakottPerc: rakott ? menetPerc(rakott.km) : null,
      feladat: {
        sorszam: sorszam++,
        feladatTipus: feladatTipusMunkabol(m, telephelyek),
        megbizasId: m.id,
        kiinduloCim: m.felrako.cim,
        celCim: m.lerako.cim,
        kiinduloTelephelyPontId: telephelyId(m.felrako, sajat),
        celTelephelyPontId: telephelyId(m.lerako, sajat),
        tervezettIndulas: null,
        tervezettErkezes: null,
        uresKm: null,
        rakottKm: rakott ? Math.round(rakott.km) : null,
        kmForras: rakott?.forras ?? null,
        raklapDb: m.raklapDb,
        figyelmeztetesek: munkaFigy,
      },
    });
    if (m.lerako.cim?.trim() || m.lerako.pont) hol = m.lerako;
  }

  // 2. Az idő-lánc: az ablak végére érkezés elve; ha az elejére érkezve
  // kevesebb megálló késne, az elejére (mint az optimalizálóban).
  const ido = {
    felrakasPerc: beallitas.felrakasRahagyasPerc,
    lerakasPerc: beallitas.lerakasRahagyasPerc,
    napKezdes: budapestNapIdo(nap, beallitas.napKezdesPerc ?? NAP_KEZDES_ALAP_PERC),
  };
  const indul = (h: "ablak_vege" | "ablak_eleje") => Math.max(indulasiIdo(nap, lepesek, ido, h), be.legkorabbiIndulas ?? -Infinity);
  const vege = idoLanc(lepesek, indul("ablak_vege"), ido);
  if (vege.kesoDb === 0) return vege.feladatok;
  const eleje = idoLanc(lepesek, indul("ablak_eleje"), ido);
  return eleje.kesoDb < vege.kesoDb ? eleje.feladatok : vege.feladatok;
}

/**
 * A menet becsült napi vezetési ideje (perc) a feladatok km-éből az
 * átlagsebességgel — kártya-szintű 'vezetesi_ido' figyelmeztetés, ha a napi
 * keret (beállítás: 540 perc) fölött van. BECSLÉS, nem tachográf-adat.
 */
export function menetVezetes(
  feladatok: Pick<FeladatJavaslat, "feladatTipus" | "uresKm" | "rakottKm">[],
  p: { atlagSebessegKmh: number; vezetesMaxPerc: number }
): { perc: number; figyelmeztetes: MenetFigyelmeztetes | null } {
  const sebesseg = p.atlagSebessegKmh > 0 ? p.atlagSebessegKmh : 60;
  const km = feladatok.reduce((a, f) => a + ((f.feladatTipus === "ures_pozicionalas" ? f.uresKm : f.rakottKm) ?? 0), 0);
  const perc = Math.round((km / sebesseg) * 60);
  const oraPerc = (x: number) => `${Math.floor(x / 60)} ó ${x % 60} p`;
  return {
    perc,
    figyelmeztetes: p.vezetesMaxPerc > 0 && perc > p.vezetesMaxPerc
      ? { kod: "vezetesi_ido", szoveg: `Vezetési idő ~${oraPerc(perc)} (${perc} perc) — a napi ${p.vezetesMaxPerc} perces keret felett (becslés ${sebesseg} km/h átlaggal, nem tachográf-adat). Ez a terv egy sofőrrel nem vezethető le.` }
      : null,
  };
}

// ---------------------------------------------------------------- egyetlen sorrend-forrás

/**
 * A jóváhagyott menet sorrendje egy nézet listáján. `lista` a nézet saját
 * (a közös napi szabály szerint rendezett) listája; `sorrend` a jóváhagyott
 * menet megbízás-id-i sorrendben, vagy null (nincs jóváhagyott menet → a
 * lista változatlan). A menetben szereplő elemek a SAJÁT helyeiken belül
 * cserélnek helyet a menet sorrendjére; a menetben nem szereplők (korábbi
 * napról csúszó, közben kocsira tett) maradnak, ahol voltak.
 */
export function alkalmazMenetSorrendet<T>(lista: T[], sorrend: readonly string[] | null | undefined, id: (t: T) => string): T[] {
  if (!sorrend || sorrend.length < 2) return lista;
  const rang = new Map(sorrend.map((x, i) => [x, i]));
  const helyek: number[] = [];
  const elemek: T[] = [];
  lista.forEach((t, i) => {
    if (rang.has(id(t))) {
      helyek.push(i);
      elemek.push(t);
    }
  });
  if (elemek.length < 2) return lista;
  elemek.sort((a, b) => rang.get(id(a))! - rang.get(id(b))!);
  const ki = [...lista];
  helyek.forEach((h, i) => {
    ki[h] = elemek[i];
  });
  return ki;
}

/** Több nap jóváhagyott sorrendje egymás után (a napok sorrendjében) — többnapos listához (GPS-figyelő). */
export function alkalmazMenetSorrendeket<T>(lista: T[], sorrendek: readonly (readonly string[])[], id: (t: T) => string): T[] {
  return sorrendek.reduce<T[]>((l, s) => alkalmazMenetSorrendet(l, s, id), lista);
}

/** Egy menet feladataiból a megbízások sorrendje. */
export function megbizasSorrend(feladatok: { sorszam: number; megbizasId: string | null }[]): string[] {
  return [...feladatok].sort((a, b) => a.sorszam - b.sorszam).flatMap((f) => (f.megbizasId ? [f.megbizasId] : []));
}

// ---------------------------------------------------------------- akció-ellenőrzések

export type Ellenorzes = { ok: true } | { ok: false; hiba: string };

/** Optimista zár: a felület által látott verzió egyezik-e a mentettel. */
export function ellenorizVerziot(mentett: number, kuldott: number): Ellenorzes {
  if (!Number.isInteger(kuldott) || kuldott !== mentett) {
    return { ok: false, hiba: `A menetet közben valaki módosította (a te verziód: ${kuldott}, a mentett: ${mentett}). Frissítsd az oldalt, és nézd át újra.` };
  }
  return { ok: true };
}

/**
 * Átrendezés ellenőrzése: az új sorrend a meglévő feladatok permutációja,
 * és a lezárt feladatok a helyükön maradnak (ami kész, az nem kerülhet
 * máshová, és elé sem kerülhet semmi).
 */
export function ellenorizAtrendezest(feladatok: { id: string; sorszam: number; lezarvaAt: string | null }[], ujSorrend: readonly string[]): Ellenorzes {
  const regi = [...feladatok].sort((a, b) => a.sorszam - b.sorszam);
  const ids = new Set(regi.map((f) => f.id));
  if (ujSorrend.length !== regi.length || new Set(ujSorrend).size !== ujSorrend.length || ujSorrend.some((x) => !ids.has(x))) {
    return { ok: false, hiba: "Az új sorrend nem egyezik a menet feladataival — frissítsd az oldalt." };
  }
  for (let i = 0; i < regi.length; i++) {
    if (regi[i].lezarvaAt && ujSorrend[i] !== regi[i].id) {
      return { ok: false, hiba: "Lezárt feladat nem mozdítható, és elé sem kerülhet másik." };
    }
  }
  return { ok: true };
}

/** Az átrendezés indoka kötelező. */
export function ellenorizIndokot(ok: string | null | undefined): Ellenorzes {
  return ok && ok.trim().length >= 3 ? { ok: true } : { ok: false, hiba: "Az átrendezéshez indok kell (legalább néhány szó)." };
}

type LezarasSor = { id: string; sorszam: number; feladatTipus: string; megbizasId: string | null; lezarvaAt: string | null };

/** Egy feladat lezárása: CSAK az adott sor lezarva_at-ja változik. */
export function lezarFeladatot<T extends LezarasSor>(feladatok: T[], feladatId: string, most: string): T[] {
  return feladatok.map((f) => (f.id === feladatId && !f.lezarvaAt ? { ...f, lezarvaAt: most } : f));
}

/**
 * A lezárás invariánsa: a lezárt soron kívül semmi nem változott — főleg a
 * KÖVETKEZŐ sor sorszáma és típusa nem. Hibaszöveg, vagy null, ha rendben.
 */
export function ellenorizLezarasInvarianst(elotte: LezarasSor[], utana: LezarasSor[], feladatId: string): string | null {
  if (elotte.length !== utana.length) return "A lezárás után megváltozott a feladatok száma.";
  const ut = new Map(utana.map((f) => [f.id, f]));
  for (const f of elotte) {
    const u = ut.get(f.id);
    if (!u) return `A(z) ${f.id} feladat eltűnt a lezárás után.`;
    if (u.sorszam !== f.sorszam || u.feladatTipus !== f.feladatTipus || u.megbizasId !== f.megbizasId) {
      return `A lezárás megváltoztatta a(z) ${f.sorszam}. feladatot — visszavonva.`;
    }
    if (f.id !== feladatId && u.lezarvaAt !== f.lezarvaAt) return `A lezárás egy másik feladatot is érintett (${f.sorszam}.) — visszavonva.`;
  }
  return null;
}

// ---------------------------------------------------------------- indulási hely, újragenerálás

/** Az előző napi menet egy feladata (a lerakó koordinátájával, ha ismert). */
export type ElozoMenetFeladat = {
  nap: string;
  allapot: string;
  sorszam: number;
  celCim: string | null;
  celTelephelyPontId: string | null;
  pont: Pont | null;
  /** A feladat megbízása a vizsgált napon vagy később rakódik le (még úton van) — nem nap végi hely. */
  atnyulo: boolean;
};

/**
 * Ahol a kocsi az előző (legfeljebb néhány napos) menete szerint a napot
 * zárta: a legkésőbbi nap menetének utolsó feladata (sorszám szerint) — a
 * jóváhagyott menet az elsődleges, ha ugyanarra a napra javaslat is van.
 * Az átnyúló (még úton lévő) munka nem nap végi hely. null: nincs ilyen menet.
 */
export function elozoMenetVege(sorok: ElozoMenetFeladat[]): Hely | null {
  const jo = sorok.filter((s) => !s.atnyulo && (s.celCim?.trim() || s.pont));
  if (jo.length === 0) return null;
  const rang = (s: ElozoMenetFeladat) => (s.allapot === "javaslat" ? 0 : 1);
  const legjobb = [...jo].sort((a, b) => b.nap.localeCompare(a.nap) || rang(b) - rang(a) || b.sorszam - a.sorszam)[0];
  return { cim: legjobb.celCim, pont: legjobb.pont, telephelyPontId: legjobb.celTelephelyPontId };
}

export type JavaslatOsszevetes = "azonos" | "csak_km" | "becsles_romlas" | "valtozott";

/**
 * Az újraszámolt javaslat a mentetthez képest (a verzió-ugrás döntéséhez):
 *   • 'azonos' — semmi nem változott;
 *   • 'becsles_romlas' — csak km / idő változott, és ahol eddig HU-GO-érték
 *     volt, most légvonal-becslés jönne (a HU-GO épp nem érhető el): a
 *     mentett (jobb) érték marad, nem írunk;
 *   • 'csak_km' — ugyanazok a feladatok, ugyanazokkal a figyelmeztetés-
 *     kódokkal, és a km-ek legfeljebb 2 km-rel (vagy csak a forrásukban)
 *     változtak, az idők pedig legfeljebb annyival, amennyit a km-eltérés
 *     indokol (+2 perc): az új számok VERZIÓ-UGRÁS NÉLKÜL íródnak — így a
 *     HU-GO ingadozása nem teszi elavulttá a nyitott jóváhagyást;
 *   • 'valtozott' — minden más: újraírás, verzió + 1.
 */
export function osszevetJavaslatot(mentett: FeladatJavaslat[], uj: FeladatJavaslat[], percPerKm: number): JavaslatOsszevetes {
  if (feladatUjjlenyomat(mentett) === feladatUjjlenyomat(uj)) return "azonos";
  if (mentett.length !== uj.length) return "valtozott";
  const szerkezet = (f: FeladatJavaslat) => JSON.stringify([
    f.sorszam, f.feladatTipus, f.megbizasId, f.kiinduloCim, f.celCim, f.kiinduloTelephelyPontId, f.celTelephelyPontId, f.raklapDb,
  ]);
  const kodok = (f: FeladatJavaslat) => f.figyelmeztetesek.map((x) => x.kod).join(",");
  const km = (f: FeladatJavaslat) => (f.feladatTipus === "ures_pozicionalas" ? f.uresKm : f.rakottKm);
  let kmElteres = 0;
  let romlas = false;
  let valodiKm = false;
  let kodValt = false;
  for (let i = 0; i < uj.length; i++) {
    const a = mentett[i], b = uj[i];
    if (szerkezet(a) !== szerkezet(b)) return "valtozott";
    const ka = km(a), kb = km(b);
    if ((ka == null) !== (kb == null)) return "valtozott";
    const d = ka != null && kb != null ? Math.abs(ka - kb) : 0;
    if (d >= 2 && a.kmForras === b.kmForras) valodiKm = true;
    kmElteres += d;
    if (a.kmForras === "hugo" && b.kmForras === "becsles") romlas = true;
    if (kodok(a) !== kodok(b)) kodValt = true;
  }
  const turesMs = (kmElteres * Math.max(percPerKm, 0) + 2) * PERC;
  const idoRendben = (x: number | null, y: number | null) => (x == null) === (y == null) && (x == null || Math.abs(x - y!) <= turesMs);
  for (let i = 0; i < uj.length; i++) {
    if (!idoRendben(mentett[i].tervezettIndulas, uj[i].tervezettIndulas) || !idoRendben(mentett[i].tervezettErkezes, uj[i].tervezettErkezes)) return "valtozott";
  }
  // Csak a km-forrás romlott (HU-GO → becslés): a mentett marad, akkor is, ha a
  // becsült km miatt egy figyelmeztetés megjelenne / eltűnne.
  if (romlas && !valodiKm) return "becsles_romlas";
  if (valodiKm || kodValt) return "valtozott";
  return "csak_km";
}

/** A feladatlista ujjlenyomata — a javaslat csak akkor íródik újra (és nő a verzió), ha változott. */
export function feladatUjjlenyomat(feladatok: Omit<FeladatJavaslat, "sorszam">[] | FeladatJavaslat[]): string {
  return JSON.stringify(
    feladatok.map((f) => [
      f.feladatTipus, f.megbizasId, f.kiinduloCim, f.celCim, f.kiinduloTelephelyPontId, f.celTelephelyPontId,
      f.tervezettIndulas, f.tervezettErkezes, f.uresKm, f.rakottKm, f.kmForras, f.raklapDb,
      f.figyelmeztetesek.map((x) => x.kod + x.szoveg),
    ])
  );
}
