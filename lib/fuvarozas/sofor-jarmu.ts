// A bejelentkezett dolgozó és a saját kocsija/fuvarja összerendelése.
// Külön modul, mert a sofőr-nézet szerver-akciói (lib/fuvarozas/sofor.ts,
// "use server" — ott minden export távolról hívható akció lenne) és a
// route handler-ek jogosultság-ellenőrzése (lib/fuvarozas/irat-jog.ts) is
// használja.

import { resolveJarmu, SAJAT_JARMUVEK, type SajatJarmu } from "@/lib/fuvarozas/vehicles";

/** Egy fuvarsor azon két mezője, amiből a kocsi/sofőr azonosítható. */
export type JarmuEgyeztetesSor = { jarmu: string | null; sofor: string | null };

export function jarmuMatch(jarmu: SajatJarmu, row: JarmuEgyeztetesSor): boolean {
  if (row.jarmu && resolveJarmu(row.jarmu) === jarmu) return true;
  if (row.sofor && row.sofor.trim().toLowerCase() === jarmu.sofor.toLowerCase()) return true;
  return false;
}

/**
 * A SAJAT_JARMUVEK "sofor" mezője a rövid, keresztnévi alak ("Gergő",
 * "Micó") — a dolgozói bejelentkezés (users.employee_id -> alkalmazottak)
 * viszont a törzsadat TELJES nevét adja ("Vadon Gergő", "Takács Micó").
 * Ezért itt tartalmazás-egyezés kell a rövid alakra, nem pontos egyezés.
 */
export function findJarmuByEmployeeName(employeeName: string): SajatJarmu | null {
  const norm = employeeName.trim().toLowerCase();
  // 1. Explicit összerendelés a teljes név alapján (vehicles.ts
  //    alkalmazottNevek) — ez a mérvadó, mert a becenév ("Micó") és a
  //    törzsadat hivatalos neve ("Takács Miklós") eltérhet.
  const explicit = SAJAT_JARMUVEK.find((j) => (j.alkalmazottNevek ?? []).some((n) => n.trim().toLowerCase() === norm));
  if (explicit) return explicit;
  // 2. Tartalék: a keresztnév szó szerinti egyezése, nem puszta tartalmazás
  //    (a "Gergő" ne illeszkedjen egy "Gergőkúti" vezetéknévre). Ha több
  //    jármű is illeszkedne, inkább egyiket sem adjuk vissza — a rossz kocsi
  //    idővonala rosszabb, mint az üres képernyő.
  const szavak = new Set(norm.split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  const talalatok = SAJAT_JARMUVEK.filter((j) => szavak.has(j.sofor.toLowerCase()));
  return talalatok.length === 1 ? talalatok[0] : null;
}
