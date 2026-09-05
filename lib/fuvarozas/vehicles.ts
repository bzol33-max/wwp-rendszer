// Saját járművek — sofőr + rendszám-párosítás. NEM "use server" fájl,
// bárhonnan importálható (kliens- és szerveroldalon is).
//
// Ez az egységes forrás arra, hogy a jármű megjelenítése ("Gergő —
// AOPU-427/AOTY-474") mindenhol egységes legyen az appban (Megbízások
// kocsiválasztó, GPS-pozíció kártyák, stb.).

export type SajatJarmu = {
  sofor: string;
  /** [vontató rendszáma, pótkocsi rendszáma] */
  rendszamok: [string, string];
};

export const SAJAT_JARMUVEK: SajatJarmu[] = [
  { sofor: "Gergő", rendszamok: ["AOPU-427", "AOTY-474"] },
  { sofor: "Micó", rendszamok: ["NMZ-492", "XZV-926"] },
];

export function jarmuLabel(j: SajatJarmu): string {
  return `${j.sofor} — ${j.rendszamok[0]}/${j.rendszamok[1]}`;
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

/** Egy rendszámhoz (vagy már elmentett "Sofőr — rendszám/rendszám" szöveghez) a megjelenítendő címke. */
export function labelForPlateOrText(value: string): string {
  const match = findJarmuByPlate(value);
  return match ? jarmuLabel(match) : value;
}
