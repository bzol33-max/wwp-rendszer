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
  szin: JarmuSzin;
};

export const SAJAT_JARMUVEK: SajatJarmu[] = [
  { sofor: "Gergő", label: "AOPU-427/AOTY-474", rendszamok: ["AOPU-427", "AOTY-474"], szin: "blue" },
  { sofor: "Micó", label: "NMZ-492/XZV-926", rendszamok: ["NMZ-492", "XZV-926"], szin: "yellow" },
  { sofor: "Jani", label: "DAF XG (Gyártás alatt)", rendszamok: [], szin: "green" },
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

/** Rendszám (bármilyen írásmóddal: kötőjellel, anélkül) alapján visszaadja a hozzá tartozó saját járművet, ha van. */
export function findJarmuByPlate(plate: string): SajatJarmu | null {
  const norm = normalizePlate(plate);
  if (!norm) return null;
  return SAJAT_JARMUVEK.find((j) => j.rendszamok.some((r) => normalizePlate(r) === norm)) ?? null;
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
