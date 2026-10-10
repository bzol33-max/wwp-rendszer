// A bejelentkezett dolgozó és a saját kocsija/fuvarja összerendelése.
// Külön modul, mert a sofőr-nézet szerver-akciói (lib/fuvarozas/sofor.ts,
// "use server" — ott minden export távolról hívható akció lenne) és a
// route handler-ek jogosultság-ellenőrzése (lib/fuvarozas/irat-jog.ts) is
// használja.

//
// Tiszta függvények: a járműlistát a hívó adja át (a szerveren a
// getJarmuvek() DB-ből töltött listáját); elhagyva a legutóbb betöltött
// lista (vehicles.ts jarmuLista()) vagy a beépített tartalék érvényes.

import { jarmuLista, resolveJarmu, type SajatJarmu } from "@/lib/fuvarozas/vehicles";

/** Egy fuvarsor azon két mezője, amiből a kocsi/sofőr azonosítható. */
export type JarmuEgyeztetesSor = { jarmu: string | null; sofor: string | null };

export function jarmuMatch(jarmu: SajatJarmu, row: JarmuEgyeztetesSor, lista: SajatJarmu[] = jarmuLista()): boolean {
  if (row.jarmu && resolveJarmu(row.jarmu, lista) === jarmu) return true;
  if (row.sofor && row.sofor.trim().toLowerCase() === jarmu.sofor.toLowerCase()) return true;
  return false;
}

/**
 * A SAJAT_JARMUVEK "sofor" mezője a rövid, keresztnévi alak ("Gergő",
 * "Micó") — a dolgozói bejelentkezés (users.employee_id -> alkalmazottak)
 * viszont a törzsadat TELJES nevét adja ("Vadon Gergő", "Takács Micó").
 * Ezért itt tartalmazás-egyezés kell a rövid alakra, nem pontos egyezés.
 */
export function findJarmuByEmployeeName(employeeName: string, lista: SajatJarmu[] = jarmuLista()): SajatJarmu | null {
  const norm = employeeName.trim().toLowerCase();
  // 1. Explicit összerendelés a teljes név alapján (vehicles.ts
  //    alkalmazottNevek) — ez a mérvadó, mert a becenév ("Micó") és a
  //    törzsadat hivatalos neve ("Takács Miklós") eltérhet.
  const explicit = lista.find((j) => (j.alkalmazottNevek ?? []).some((n) => n.trim().toLowerCase() === norm));
  if (explicit) return explicit;
  // 2. Tartalék: a keresztnév szó szerinti egyezése, nem puszta tartalmazás
  //    (a "Gergő" ne illeszkedjen egy "Gergőkúti" vezetéknévre). Ha több
  //    jármű is illeszkedne, inkább egyiket sem adjuk vissza — a rossz kocsi
  //    idővonala rosszabb, mint az üres képernyő.
  const szavak = new Set(norm.split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  const talalatok = lista.filter((j) => szavak.has(j.sofor.toLowerCase()));
  return talalatok.length === 1 ? talalatok[0] : null;
}

/**
 * A bejelentkezett dolgozó kocsija: elsőként a törzsadat szerinti pontos
 * hozzárendelés (fuvar_jarmuvek.sofor_id = alkalmazott id), ha az nincs,
 * a név szerinti összerendelés (findJarmuByEmployeeName). Ha az azonosító
 * több járműhöz is hozzá van rendelve, nem választunk közülük (null) — a
 * rossz kocsi rosszabb, mint a semmi.
 */
export function findJarmuForEmployee(
  employee: { id: string | null; name: string },
  lista: SajatJarmu[] = jarmuLista()
): SajatJarmu | null {
  if (employee.id) {
    const idSzerint = lista.filter((j) => j.soforAlkalmazottId != null && j.soforAlkalmazottId === String(employee.id));
    if (idSzerint.length === 1) return idSzerint[0];
    if (idSzerint.length > 1) return null;
  }
  const nevSzerint = findJarmuByEmployeeName(employee.name, lista);
  // Ha a név szerinti találat kocsijához a törzsadat MÁS dolgozót rendelt,
  // nem adjuk oda: a hozzárendelés felülírja a névegyezést.
  if (nevSzerint && nevSzerint.soforAlkalmazottId != null && employee.id && nevSzerint.soforAlkalmazottId !== String(employee.id)) return null;
  return nevSzerint;
}
