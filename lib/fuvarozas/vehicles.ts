// Saját járművek — sofőr <-> rendszám(ok) <-> szín. NEM "use server" fájl,
// bárhonnan importálható (kliens- és szerveroldalon is).
//
// Ez az egységes forrás arra, hogy a jármű megjelenítése ("Gergő —
// AOPU-427/AOTY-474") és a hozzá tartozó szín mindenhol egységes legyen
// az appban (Megbízások kocsiválasztó és lista, GPS-pozíció kártyák, stb.).

export type JarmuSzin = "blue" | "yellow" | "green";

export type SajatJarmu = {
  sofor: string;
  /** Megjelenítendő azonosító — rendszám(ok) vagy egy még gyártás alatt álló jármű neve. */
  label: string;
  /** GPS/rendszám-egyeztetéshez használt rendszámok — üres tömb, ha még nincs rendszáma a járműnek. */
  rendszamok: string[];
  /**
   * Rendszám-írásváltozatok, amiket egy-egy MEGBÍZÓ következetesen rosszul
   * ír a saját törzsadatában. Csak felismerésre szolgálnak — a jármű
   * megjelenített `label`-je mindig a VALÓDI rendszám marad, nehogy a partner
   * hibája bekerüljön a mi papírjainkba.
   */
  irasvaltozatok?: string[];
  szin: JarmuSzin;
  /** Ecofleet Vehicles/get szerinti objectId (getTrips/idővonal hívásokhoz) — null, ha a jármű nincs Ecofleet-be kötve. */
  ecofleetObjectId: string | null;
  /**
   * A sofőr TELJES neve(i) a Dolgozók törzsadatban (alkalmazottak.name) —
   * a dolgozói mobil nézet ezzel köti a bejelentkezett alkalmazottat a
   * kocsihoz (lib/fuvarozas/sofor.ts findJarmuByEmployeeName). Több alak is
   * megadható, ha a becenév és a hivatalos név eltér ("Takács Micó" /
   * "Takács Miklós"). Ha egyik sem egyezik, tartalék a keresztnév szó
   * szerinti egyezése a `sofor` mezővel.
   */
  alkalmazottNevek?: string[];
};

export const SAJAT_JARMUVEK: SajatJarmu[] = [
  { sofor: "Gergő", label: "AOPU-427/AOTY-474", rendszamok: ["AOPU-427", "AOTY-474"], szin: "blue", ecofleetObjectId: "1144376", alkalmazottNevek: ["Vadon Gergő"] },
  // A Duvenbeck törzsadatában Micó rendszáma felcserélt betűkkel szerepel
  // ("NZM492" az "NMZ-492" helyett), minden megbízásukon és rakománylistájukon
  // egyformán. A hibát jeleztük nekik; amíg nem javítják, enélkül minden
  // Duvenbeck-fuvaruk "ismeretlen kocsi" maradna. Ha javítják, ez a sor
  // ártalmatlanul itt maradhat.
  { sofor: "Micó", label: "NMZ-492/XZV-926", rendszamok: ["NMZ-492", "XZV-926"], irasvaltozatok: ["NZM-492"], szin: "yellow", ecofleetObjectId: "369485", alkalmazottNevek: ["Takács Micó", "Takács Miklós"] },
  { sofor: "Jani", label: "DAF XG (Gyártás alatt)", rendszamok: [], szin: "green", ecofleetObjectId: null },
];

/** Szín -> Tailwind badge osztályok (a projektben már használt "bg-x-100 text-x-700" mintát követve). */
export const JARMU_SZIN_CLASS: Record<JarmuSzin, string> = {
  blue: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  yellow: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100",
  green: "bg-green-100 text-green-700 hover:bg-green-100",
};

/** Szín -> tömör pötty osztály (pl. legördülő listákban, ahol nincs hely egy teljes Badge-nek). */
export const JARMU_SZIN_DOT_CLASS: Record<JarmuSzin, string> = {
  blue: "bg-blue-500",
  yellow: "bg-yellow-500",
  green: "bg-green-500",
};

export function jarmuLabel(j: SajatJarmu): string {
  return `${j.sofor} — ${j.label}`;
}

function normalizePlate(p: string): string {
  return p.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

/**
 * Rendszám (bármilyen írásmóddal: kötőjellel, anélkül) alapján visszaadja a
 * hozzá tartozó saját járművet, ha van. A valódi rendszámok után a partnerek
 * ismert elírásait (`irasvaltozatok`) is megnézi — lásd ott.
 */
export function findJarmuByPlate(plate: string): SajatJarmu | null {
  const norm = normalizePlate(plate);
  if (!norm) return null;
  return (
    SAJAT_JARMUVEK.find((j) => j.rendszamok.some((r) => normalizePlate(r) === norm)) ??
    SAJAT_JARMUVEK.find((j) => (j.irasvaltozatok ?? []).some((r) => normalizePlate(r) === norm)) ??
    null
  );
}

/**
 * Rendszám-szerű darabok egy szabad szövegben ("AOPU-427 AOTY-474",
 * "NMZ492/XZV926", "AOPU427,/AOTY474"). Ugyanaz a szűk alak, mint a
 * Duvenbeck-olvasóban: 3–4 betű + 3 számjegy, kötőjellel vagy anélkül — a
 * hosszabb azonosítók (HU13500287, UH748629) nem illeszkednek.
 */
const RENDSZAM_ALAK = /\b([A-Z]{3,4})-?(\d{3})\b/g;

/** Két normalizált rendszám Levenshtein-távolsága — az elgépelt rendszámok felismeréséhez. */
function szerkesztesiTavolsag(a: string, b: string): number {
  const sor = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let elozo = sor[0];
    sor[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = sor[j];
      sor[j] = Math.min(sor[j] + 1, sor[j - 1] + 1, elozo + (a[i - 1] === b[j - 1] ? 0 : 1));
      elozo = temp;
    }
  }
  return sor[b.length];
}

/** Legfeljebb ennyi karakternyi eltérést tekintünk elgépelésnek egy rendszámban ("AODU427" → AOPU-427). */
const RENDSZAM_ELTERES_HATAR = 1;

/**
 * Egy megbízásból kiolvasott szabad szöveghez ("Rendszám: AOPU-427 AOTY-474",
 * "NMZ492/XZV926", "Vadon Gergő") megkeresi a saját járművet.
 *
 * A megbízók szinte mindig a VONTATÓ ÉS A PÓTKOCSI rendszámát EGYÜTT írják
 * a megbízásra, ezért a szöveg egésze soha nem egyezett egyetlen rendszámmal
 * sem (findJarmuByPlate), és a Drive-importból a Kocsi mező üresen jött —
 * minden ilyen fuvarnál kézzel kellett kocsit választani (Hajdúspedíció
 * "NMZ492/XZV926", BB-Logistic "AOPU-427 AOTY-474", Ghibli "AOPU427/AOTY474",
 * 2026-09-17/18). Itt a szöveg MINDEN rendszám-szerű darabját külön nézzük:
 *
 *   1. pontos egyezés (a valódi rendszámok és az ismert írásváltozatok);
 *   2. ha nincs pontos, egyetlen karakternyi elgépelés (RBT: "AODU427");
 *   3. ha rendszám nincs a szövegben, a sofőr neve (resolveJarmu).
 *
 * Ha a darabok KÜLÖNBÖZŐ járművekre mutatnak (két kocsi egy megbízáson,
 * vagy egy elgépelés véletlenül máshoz áll közel), nem tippelünk: null —
 * a Kocsi mezőt ilyenkor ember tölti ki, ahogy eddig.
 */
export function findJarmuInSzoveg(szoveg: string | null | undefined): SajatJarmu | null {
  if (!szoveg) return null;
  const jeloltek = [...new Set([...szoveg.toUpperCase().matchAll(RENDSZAM_ALAK)].map((m) => m[1] + m[2]))];
  if (jeloltek.length === 0) return findJarmuBySoforNev(szoveg);

  const talalatok = new Set<SajatJarmu>();
  for (const jelolt of jeloltek) {
    const pontos = findJarmuByPlate(jelolt);
    if (pontos) {
      talalatok.add(pontos);
      continue;
    }
    const kozeliek = SAJAT_JARMUVEK.filter((j) =>
      j.rendszamok.some((r) => szerkesztesiTavolsag(jelolt, normalizePlate(r)) <= RENDSZAM_ELTERES_HATAR)
    );
    if (kozeliek.length === 1) talalatok.add(kozeliek[0]);
  }
  if (talalatok.size === 1) return [...talalatok][0];
  // Egy idegen rendszám mellett a sofőr neve még dönthet; két saját jármű
  // egy szövegben viszont kétértelmű — azt nem döntjük el gép által.
  return talalatok.size === 0 ? findJarmuBySoforNev(szoveg) : null;
}

/** Ékezet- és írásjel-független összehasonlító alak ("Vadon Gergő" → "vadon gergo"). */
function normalizeNev(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Sofőrnév szabad szövegben: a "Sofőr — címke" alak és a keresztnév
 * (resolveJarmu) mellett a teljes nevet ("Vadon Gergő", "Takács Miklós") és
 * a keresztnevet bárhol a szövegben ("sofőr: Gergő") is elfogadja — szóhatáron,
 * hogy egy másik név része ne egyezzen. Csak egyértelmű találatot ad vissza.
 */
function findJarmuBySoforNev(szoveg: string): SajatJarmu | null {
  const gyors = resolveJarmu(szoveg);
  if (gyors) return gyors;
  const norm = normalizeNev(szoveg);
  if (!norm) return null;
  const szavak = new Set(norm.split(" "));
  const talalatok = SAJAT_JARMUVEK.filter(
    (j) =>
      (j.alkalmazottNevek ?? []).some((n) => norm.includes(normalizeNev(n))) ||
      szavak.has(normalizeNev(j.sofor))
  );
  return talalatok.length === 1 ? talalatok[0] : null;
}

/** Egy elmentett "Sofőr — címke" szöveg alapján visszaadja a hozzá tartozó saját járművet, ha van. */
export function findJarmuByLabel(value: string): SajatJarmu | null {
  return SAJAT_JARMUVEK.find((j) => jarmuLabel(j) === value) ?? null;
}

/**
 * Egy jármű-mezőben elmentett bármilyen szöveghez (a mai "Sofőr — címke"
 * formátumtól a régebbi, csak sofőrnevet vagy csak rendszámot tartalmazó
 * bejegyzésekig) megkeresi a hozzá tartozó saját járművet, hogy a színes
 * jelölés mindenhol megjelenjen, függetlenül attól, mikor/hogyan lett a
 * mező kitöltve. Sorrend: pontos "Sofőr — címke" egyezés, majd rendszám,
 * majd sofőrnév (a szöveg eleje vagy egésze).
 */
export function resolveJarmu(value: string): SajatJarmu | null {
  const exact = findJarmuByLabel(value);
  if (exact) return exact;

  const byPlate = findJarmuByPlate(value);
  if (byPlate) return byPlate;

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  return (
    SAJAT_JARMUVEK.find(
      (j) =>
        j.sofor.toLowerCase() === trimmed ||
        trimmed.startsWith(j.sofor.toLowerCase() + " ") ||
        trimmed.startsWith(j.sofor.toLowerCase() + "—") ||
        trimmed.startsWith(j.sofor.toLowerCase() + "-")
    ) ?? null
  );
}

/** Egy rendszámhoz (vagy már elmentett "Sofőr — rendszám/rendszám" szöveghez) a megjelenítendő címke. */
export function labelForPlateOrText(value: string): string {
  const match = findJarmuByPlate(value);
  return match ? jarmuLabel(match) : value;
}
