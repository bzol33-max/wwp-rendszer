// Hét nézet B1 (docs/het-b1-terv.md): nem-fuvar bejegyzések (szerviz, gumis,
// mosás …) és a Jelenlétből jövő távollétek — tiszta logika, DB nélkül.

export type BejegyzesTipus = "szerviz" | "gumis" | "mosas" | "muszaki" | "tacho" | "egyeb";

export const BEJEGYZES_TIPUSOK: { kod: BejegyzesTipus; nev: string }[] = [
  { kod: "szerviz", nev: "Szerviz" },
  { kod: "gumis", nev: "Gumis" },
  { kod: "mosas", nev: "Mosás" },
  { kod: "muszaki", nev: "Műszaki vizsga" },
  { kod: "tacho", nev: "Tachó-kalibrálás" },
  { kod: "egyeb", nev: "Egyéb" },
];

export const tipusNev = (t: string) => BEJEGYZES_TIPUSOK.find((x) => x.kod === t)?.nev ?? t;

export type BejegyzesSor = {
  id: string;
  jarmuKod: string;
  tipus: BejegyzesTipus;
  /** Az első (vagy egyetlen) alkalom napja, "YYYY-MM-DD". */
  nap: string;
  /** "HH:MM" — mindkettő null: egész nap. */
  tol: string | null;
  ig: string | null;
  hely: string | null;
  megjegyzes: string | null;
  ismetles: "nincs" | "heti";
  /** Heti ismétlésnél az utolsó lehetséges nap (null: nyitott). */
  ismetlesIg: string | null;
  /** Ismétlődő sorozat egyenként törölt alkalmai ("YYYY-MM-DD"). */
  kihagyott?: string[];
};

/** Egy alkalom egy konkrét napon (ismétlődőnél a sorozat egy előfordulása). */
export type Bejegyzes = BejegyzesSor & { alkalom: string };

export type TavolletTipus = "szabadsag" | "beteg";
export type Tavollet = { jarmuKod: string; nap: string; tipus: TavolletTipus };
export const TAVOLLET_NEV: Record<TavolletTipus, string> = { szabadsag: "Szabadság", beteg: "Betegszabadság" };

export type BejegyzesBemenet = {
  jarmuKod: string;
  tipus: string;
  nap: string;
  egeszNap: boolean;
  tol?: string | null;
  ig?: string | null;
  hely?: string | null;
  megjegyzes?: string | null;
  ismetles?: string | null;
  ismetlesIg?: string | null;
};

export type BejegyzesAdat = Omit<BejegyzesSor, "id" | "kihagyott">;

const NAP_RE = /^\d{4}-\d{2}-\d{2}$/;
const IDO_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const HELY_MAX = 120;
export const MEGJEGYZES_MAX = 500;

function valosNap(s: string): boolean {
  if (!NAP_RE.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const ures = (s: string | null | undefined) => {
  const t = (s ?? "").trim();
  return t ? t : null;
};

/** A felviteli ablak adatának ellenőrzése és normalizálása. `aktivKodok`: ha megadva, csak ezek a kocsik. */
export function ellenorizBejegyzes(
  b: BejegyzesBemenet,
  aktivKodok?: readonly string[]
): { ok: true; ertek: BejegyzesAdat } | { ok: false; hiba: string } {
  const jarmuKod = ures(b.jarmuKod);
  if (!jarmuKod) return { ok: false, hiba: "Válassz kocsit." };
  if (aktivKodok && !aktivKodok.includes(jarmuKod)) return { ok: false, hiba: "Ismeretlen vagy nem aktív kocsi." };
  const tipus = BEJEGYZES_TIPUSOK.find((t) => t.kod === b.tipus)?.kod;
  if (!tipus) return { ok: false, hiba: "Válaszd ki, mi lesz (szerviz, gumis …)." };
  if (!valosNap(b.nap ?? "")) return { ok: false, hiba: "Hibás nap." };

  let tol: string | null = null, ig: string | null = null;
  if (!b.egeszNap) {
    tol = ures(b.tol); ig = ures(b.ig);
    if (!tol || !ig) return { ok: false, hiba: "Add meg, mettől meddig tart — vagy jelöld egész naposnak." };
    if (!IDO_RE.test(tol) || !IDO_RE.test(ig)) return { ok: false, hiba: "Az időt ÓÓ:PP alakban add meg." };
    if (ig <= tol) return { ok: false, hiba: "A vége legyen később, mint a kezdete." };
  }

  const hely = ures(b.hely), megjegyzes = ures(b.megjegyzes);
  if (hely && hely.length > HELY_MAX) return { ok: false, hiba: `A hely legfeljebb ${HELY_MAX} karakter.` };
  if (megjegyzes && megjegyzes.length > MEGJEGYZES_MAX) return { ok: false, hiba: `A megjegyzés legfeljebb ${MEGJEGYZES_MAX} karakter.` };
  if (tipus === "egyeb" && !hely && !megjegyzes) return { ok: false, hiba: "Egyéb bejegyzésnél írd le, mi lesz (hely vagy megjegyzés)." };

  const ismetles: "nincs" | "heti" = b.ismetles === "heti" ? "heti" : "nincs";
  let ismetlesIg: string | null = null;
  if (ismetles === "heti") {
    ismetlesIg = ures(b.ismetlesIg);
    if (ismetlesIg && !valosNap(ismetlesIg)) return { ok: false, hiba: "Hibás ismétlés-vége dátum." };
    if (ismetlesIg && ismetlesIg < b.nap) return { ok: false, hiba: "Az ismétlés vége nem lehet az első alkalom előtt." };
  }

  return { ok: true, ertek: { jarmuKod, tipus, nap: b.nap, tol, ig, hely, megjegyzes, ismetles, ismetlesIg } };
}

function napKulonbseg(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/** Előfordul-e a bejegyzés az adott napon (heti ismétlést is számolva). */
export function elofordulNapon(s: BejegyzesSor, nap: string): boolean {
  if (s.kihagyott?.includes(nap)) return false;
  if (nap === s.nap) return true;
  if (s.ismetles !== "heti" || nap < s.nap) return false;
  if (s.ismetlesIg && nap > s.ismetlesIg) return false;
  return napKulonbseg(s.nap, nap) % 7 === 0;
}

/** Rendezés egy napon belül: egész napos elöl, aztán kezdés szerint, végül azonosító szerint. */
export function bejegyzesRendezo(a: BejegyzesSor, b: BejegyzesSor): number {
  const ka = a.tol ?? "", kb = b.tol ?? "";
  return ka.localeCompare(kb) || Number(a.id) - Number(b.id) || a.id.localeCompare(b.id);
}

/** Kocsinként és naponként az ablak napjain előforduló alkalmak: `eredmeny[kod][nap]`. */
export function bejegyzesekNapokra(sorok: readonly BejegyzesSor[], napok: readonly string[]): Record<string, Record<string, Bejegyzes[]>> {
  const ki: Record<string, Record<string, Bejegyzes[]>> = {};
  for (const s of sorok) {
    for (const nap of napok) {
      if (!elofordulNapon(s, nap)) continue;
      ((ki[s.jarmuKod] ??= {})[nap] ??= []).push({ ...s, alkalom: nap });
    }
  }
  for (const k of Object.values(ki)) for (const l of Object.values(k)) l.sort(bejegyzesRendezo);
  return ki;
}

/** Távollétek kocsinként és naponként (egy napra egy — a betegség erősebb a szabadságnál). */
export function tavolletekNapokra(sorok: readonly Tavollet[]): Record<string, Record<string, TavolletTipus>> {
  const ki: Record<string, Record<string, TavolletTipus>> = {};
  for (const t of sorok) {
    const k = (ki[t.jarmuKod] ??= {});
    if (k[t.nap] !== "beteg") k[t.nap] = t.tipus;
  }
  return ki;
}

export const DELUTAN_TOL = "12:00";

/**
 * Elveszi-e a nap szabad kapacitását: távollét, egész napos bejegyzés, vagy
 * olyan bejegyzés, ami 12:00 után is tart → a „szabad” és a „délután szabad” nem jelenik meg.
 */
export function napFoglalt(bejegyzesek: readonly BejegyzesSor[], tavollet: TavolletTipus | null | undefined): boolean {
  if (tavollet) return true;
  return bejegyzesek.some((b) => b.tol == null || b.ig == null || b.ig > DELUTAN_TOL);
}

/** A kártya idő-felirata: „egész nap” vagy „13:00–16:00”. */
export const bejegyzesIdo = (b: Pick<BejegyzesSor, "tol" | "ig">) => (b.tol && b.ig ? `${b.tol}–${b.ig}` : "egész nap");

// --- Törlés (egy alkalom / ettől kezdve / az egész) ---

export type TorlesMod = "egesz" | "alkalom" | "ettol";
export type TorlesTerv =
  | { muvelet: "torol" }
  | { muvelet: "kihagy"; nap: string }
  | { muvelet: "vege"; ig: string }
  | { muvelet: "hiba"; hiba: string };

export function napEltolas(nap: string, n: number): string {
  const d = new Date(`${nap}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Mi történjen a törléskor. Nem ismétlődő bejegyzés, vagy a sorozat első alkalma „ettől kezdve”:
 * a sor törlődik. „Csak ezt”: az alkalom a kihagyottak közé kerül (ha ez volt az utolsó élő
 * alkalom egy véges sorozatban, a sor törlődik). „Ettől kezdve”: a sorozat az előző napon véget ér.
 */
export function torlesTerv(s: BejegyzesSor, mod: TorlesMod, alkalom: string | null | undefined): TorlesTerv {
  if (mod === "egesz" || s.ismetles !== "heti") return { muvelet: "torol" };
  if (!alkalom || !valosNap(alkalom)) return { muvelet: "hiba", hiba: "Hibás alkalom." };
  if (!elofordulNapon(s, alkalom)) return { muvelet: "hiba", hiba: "Ezen a napon nincs ilyen alkalom." };
  if (mod === "ettol") {
    if (alkalom <= s.nap) return { muvelet: "torol" };
    // Ha előtte sincs már élő alkalom, a sor törlődik (QA2 #6).
    const kihagy = new Set(s.kihagyott ?? []);
    let van = false;
    for (let d = s.nap; d < alkalom; d = napEltolas(d, 7)) if (!kihagy.has(d)) { van = true; break; }
    return van ? { muvelet: "vege", ig: napEltolas(alkalom, -1) } : { muvelet: "torol" };
  }
  if (s.ismetlesIg) {
    const kihagy = new Set([...(s.kihagyott ?? []), alkalom]);
    let van = false;
    for (let d = s.nap; d <= s.ismetlesIg; d = napEltolas(d, 7)) if (!kihagy.has(d)) { van = true; break; }
    if (!van) return { muvelet: "torol" };
  }
  return { muvelet: "kihagy", nap: alkalom };
}

// --- Becslő (ETA) bemenet ---

/** A becslőben a bejegyzés-megálló azonosítója (nem megbízás). */
export const bejegyzesFuvarId = (b: Pick<Bejegyzes, "id" | "alkalom">) => `bej:${b.id}:${b.alkalom}`;

const perc = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
/** A bejegyzés hossza percben (egész napos: null). */
export const bejegyzesPerc = (b: Pick<BejegyzesSor, "tol" | "ig">) => (b.tol && b.ig ? Math.max(0, perc(b.ig) - perc(b.tol)) : null);

/**
 * Megállóként kerül-e a kocsi útvonalába (odamegy, ott tölti az időt): időponthoz kötött és van
 * helye. Különben (egész nap, hely nélkül, vagy nem található hely) foglalt időszak.
 */
export const bejegyzesMegallo = (b: Pick<BejegyzesSor, "tol" | "ig" | "hely">) => !!(b.tol && b.ig && b.hely);

/**
 * Foglalt időszak a becslőnek, helyi "YYYY-MM-DDTHH:MM": időponthoz kötött → tol–ig;
 * egész napos → a nap elejétől a másnapi napkezdésig.
 */
export function bejegyzesFoglalas(b: Pick<Bejegyzes, "tol" | "ig" | "alkalom">, napKezdes: string): { tol: string; ig: string } {
  return b.tol && b.ig
    ? { tol: `${b.alkalom}T${b.tol}`, ig: `${b.alkalom}T${b.ig}` }
    : { tol: `${b.alkalom}T00:00`, ig: `${napEltolas(b.alkalom, 1)}T${napKezdes}` };
}

/** Sofőr-távollét napja → foglalt időszak (a nap elejétől a másnapi napkezdésig). */
export const tavolletFoglalas = (nap: string, napKezdes: string) => ({ tol: `${nap}T00:00`, ig: `${napEltolas(nap, 1)}T${napKezdes}` });

/**
 * A bejegyzés-megállók beszúrása a kocsi fuvar-sorrendjébe idő szerint: mindegyik az első olyan
 * fuvar elé kerül, amelynek a kezdő kulcsa ("YYYY-MM-DDTHH:MM") későbbi; a fuvarok sorrendje marad.
 */
export function idoSzerintBeszur<T>(lista: readonly T[], kulcs: (x: T) => string, uj: readonly { elem: T; kulcs: string }[]): T[] {
  const ki: T[] = [];
  const sor = [...uj].sort((a, b) => a.kulcs.localeCompare(b.kulcs));
  let j = 0;
  for (const x of lista) {
    const k = kulcs(x);
    while (j < sor.length && sor[j].kulcs < k) ki.push(sor[j++].elem);
    ki.push(x);
  }
  while (j < sor.length) ki.push(sor[j++].elem);
  return ki;
}
