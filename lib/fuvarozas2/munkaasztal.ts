// A Megbízások munkaasztal (2026-09-25) tiszta logikája: melyik oldalsáv-
// szakaszba esik egy megbízás, és illeszkedik-e a keresésre. Nincs
// adatbázis, nincs "use server" — scripts/teszt-munkaasztal.ts teszteli.
//
// Budaházi Zoltán döntései: az oldalsáv részei Beérkezett · Folyamatban
// (kocsinként) · Számlázásra vár · Postára vár · Archív; az archívumnak
// nincs bontása, a felső kereső váltja ki; a postázás után a fuvar az
// archívba megy; a saját fuvar a lerakás után szintén.

import type { Allapot } from "@/lib/fuvarozas/allapot";

export type Szakasz = "beerkezett" | "folyamatban" | "szamlazasra" | "postara" | "archiv";

export const SZAKASZOK: readonly { kulcs: Szakasz; cimke: string; csoport: "Előkészítés" | "Úton" | "Pénz" | "Kész" }[] = [
  { kulcs: "beerkezett", cimke: "Beérkezett", csoport: "Előkészítés" },
  { kulcs: "folyamatban", cimke: "Folyamatban", csoport: "Úton" },
  { kulcs: "szamlazasra", cimke: "Számlázásra vár", csoport: "Pénz" },
  { kulcs: "postara", cimke: "Postára vár", csoport: "Pénz" },
  { kulcs: "archiv", cimke: "Archív", csoport: "Kész" },
];

export function szakaszSorbol(s: { jelleg: "ber" | "sajat"; allapot: Allapot }): Szakasz {
  switch (s.allapot) {
    case "ellenorzesre_var":
      return "beerkezett";
    case "tervezett":
    case "folyamatban":
      return "folyamatban";
    case "teljesitve":
      // A saját fuvarnak nincs számlája: lerakás után kész.
      return s.jelleg === "sajat" ? "archiv" : "szamlazasra";
    case "szamlazhato":
      return "szamlazasra";
    case "szamlazva":
    case "email_elment":
      return "postara";
    case "postazva":
    case "lezart":
      return "archiv";
  }
}

/** A fuvar útja szakaszokra bontva (a sorok alatti csíkhoz): bérnél 5, sajátnál 3. */
export function utSzakaszai(jelleg: "ber" | "sajat"): Szakasz[] {
  return jelleg === "sajat" ? ["beerkezett", "folyamatban", "archiv"] : ["beerkezett", "folyamatban", "szamlazasra", "postara", "archiv"];
}

function normal(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

const HONAPOK = ["januar", "februar", "marcius", "aprilis", "majus", "junius", "julius", "augusztus", "szeptember", "oktober", "november", "december"];

/** A keresőszó hónapnév-e („szept”, „okt.”): a hónap sorszáma (1–12), különben null. */
export function honapKeresoszo(szo: string): number | null {
  const n = normal(szo).replace(/\.$/, "");
  if (n.length < 3) return null;
  const i = HONAPOK.findIndex((h) => h.startsWith(n));
  return i === -1 ? null : i + 1;
}

export type KeresettSor = {
  partner_nev: string | null;
  hivatkozas: string | null;
  felrako: string | null;
  lerako: string | null;
  jarmu_kod: string | null;
  jarmu_cimke: string | null;
  sofor: string | null;
  szamla_szam: string | null;
  aru: string | null;
  felrakas_nap: string | null;
  lerakas_nap: string | null;
};

/**
 * Minden keresőszónak illeszkednie kell (ÉS): cég, város/útvonal,
 * rendszám, sofőr, hivatkozás, számlaszám, áru — ékezet, kis-nagybetű és
 * írásjel nélkül is („nmz492” = „NMZ-492”). Hónapnév („szept”) és évszám
 * („2026”) a fuvar napjára szűr.
 */
export function keresEgyezik(s: KeresettSor, kereses: string): boolean {
  const szavak = kereses.split(/\s+/).map((x) => x.trim()).filter(Boolean);
  if (szavak.length === 0) return true;
  const mezok = [s.partner_nev, s.hivatkozas, s.felrako, s.lerako, s.jarmu_kod, s.jarmu_cimke, s.sofor, s.szamla_szam, s.aru]
    .filter(Boolean)
    .join(" ");
  const szoveg = normal(mezok);
  const tomor = szoveg.replace(/[^a-z0-9]/g, "");
  const napok = [s.felrakas_nap, s.lerakas_nap].filter((x): x is string => !!x);
  return szavak.every((szo) => {
    const honap = honapKeresoszo(szo);
    if (honap !== null && napok.some((n) => Number(n.slice(5, 7)) === honap)) return true;
    if (/^\d{4}$/.test(szo) && napok.some((n) => n.startsWith(szo))) return true;
    const n = normal(szo);
    if (szoveg.includes(n)) return true;
    const t = n.replace(/[^a-z0-9]/g, "");
    return t.length >= 3 && tomor.includes(t);
  });
}
