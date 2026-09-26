// A Megbízások munkaasztal (2026-09-25) tiszta logikája: melyik oldalsáv-
// szakaszba esik egy megbízás, és illeszkedik-e a keresésre. Nincs
// adatbázis, nincs "use server" — scripts/teszt-munkaasztal.ts teszteli.
//
// Budaházi Zoltán döntései: az oldalsáv részei Beérkezett · Folyamatban
// (kocsinként) · Számlázásra vár · Postára vár · Archív; az archívumnak
// nincs bontása, a felső kereső váltja ki; a postázás után a fuvar az
// archívba megy; a saját fuvar a lerakás után szintén.

import type { Allapot } from "@/lib/fuvarozas/allapot";

export type Szakasz = "elokeszites" | "beerkezett" | "folyamatban" | "szamlazasra" | "postara" | "archiv";

export const SZAKASZOK: readonly { kulcs: Szakasz; cimke: string; csoport: "Előkészítés" | "Úton" | "Pénz" | "Kész" }[] = [
  { kulcs: "beerkezett", cimke: "Beérkezett (e-mail)", csoport: "Előkészítés" },
  { kulcs: "elokeszites", cimke: "Előre beírt saját fuvar", csoport: "Előkészítés" },
  { kulcs: "folyamatban", cimke: "Folyamatban", csoport: "Úton" },
  { kulcs: "szamlazasra", cimke: "Számlázásra vár", csoport: "Pénz" },
  { kulcs: "postara", cimke: "Postára vár", csoport: "Pénz" },
  { kulcs: "archiv", cimke: "Archív", csoport: "Kész" },
];

export function szakaszSorbol(s: { jelleg: "ber" | "sajat"; allapot: Allapot; elokeszites?: boolean }): Szakasz {
  // Az előkészítés alatti saját fuvar az állapotától függetlenül ott marad,
  // amíg „kocsira nem adják”.
  if (s.elokeszites) return "elokeszites";
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
  return jelleg === "sajat" ? ["elokeszites", "folyamatban", "archiv"] : ["beerkezett", "folyamatban", "szamlazasra", "postara", "archiv"];
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
  kitol?: string | null;
  hivatkozas: string | null;
  felrako: string | null;
  lerako: string | null;
  jarmu_kod: string | null;
  jarmu_cimke: string | null;
  sofor: string | null;
  szamla_szam: string | null;
  kieg_szamla_szamok?: string[];
  szallitolevel?: string | null;
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
  return keresSzovegEgyezik(keresSzoveg(s), keresNapok(s), kereses);
}

/** A sor kereshető szövege (normalizálva) — a böngészős javaslatokhoz egyszer számoljuk ki. */
export function keresSzoveg(s: KeresettSor): string {
  return normal(
    [s.partner_nev, s.kitol, s.hivatkozas, s.felrako, s.lerako, s.jarmu_kod, s.jarmu_cimke, s.sofor, s.szamla_szam, ...(s.kieg_szamla_szamok ?? []), s.szallitolevel, s.aru]
      .filter(Boolean)
      .join(" ")
  );
}

export function keresNapok(s: Pick<KeresettSor, "felrakas_nap" | "lerakas_nap">): string[] {
  return [s.felrakas_nap, s.lerakas_nap].filter((x): x is string => !!x);
}

export function keresSzovegEgyezik(szoveg: string, napok: string[], kereses: string): boolean {
  const szavak = kereses.split(/\s+/).map((x) => x.trim()).filter(Boolean);
  if (szavak.length === 0) return true;
  const tomor = szoveg.replace(/[^a-z0-9]/g, "");
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

// --- Javaslatok gépelés közben (Budaházi Zoltán, 2026-09-25: „ahogy írok,
// adja a javaslatokat”). A szerver egyszer összerakja az indexet, a böngésző
// minden leütésre ebből válogat — hálózati kérés nélkül.

export type KeresoFuvar = { id: string; cim: string; ut: string; nap: string | null; szakasz: Szakasz; szoveg: string; napok: string[] };
export type KeresoIndex = {
  fuvarok: KeresoFuvar[];
  cegek: string[];
  varosok: string[];
  kocsik: { kod: string; cimke: string }[];
  /** Számla-, kiegészítő számla-, szállítólevél- és hivatkozási számok. */
  szamok: string[];
};
export type JavaslatCsoport = { cim: string; elemek: { cimke: string; q: string }[] };

const HONAP_CIMKE = ["január", "február", "március", "április", "május", "június", "július", "augusztus", "szeptember", "október", "november", "december"];

export function javaslatok(index: KeresoIndex, kereses: string): { fuvarok: KeresoFuvar[]; csoportok: JavaslatCsoport[] } {
  const q = kereses.trim();
  if (q.length < 2) return { fuvarok: [], csoportok: [] };
  const n = normal(q);
  const t = n.replace(/[^a-z0-9]/g, "");
  const tartalmaz = (x: string) => normal(x).includes(n) || (t.length >= 3 && normal(x).replace(/[^a-z0-9]/g, "").includes(t));
  // Elöl az, ami a beírttal kezdődik.
  const rendez = (xs: string[]) => [...xs].sort((a, b) => Number(!normal(a).startsWith(n)) - Number(!normal(b).startsWith(n)) || a.localeCompare(b, "hu"));
  const csoportok: JavaslatCsoport[] = [];
  const cegek = rendez(index.cegek.filter(tartalmaz)).slice(0, 4);
  if (cegek.length) csoportok.push({ cim: "Cég", elemek: cegek.map((c) => ({ cimke: c, q: c })) });
  const varosok = rendez(index.varosok.filter(tartalmaz)).slice(0, 4);
  if (varosok.length) csoportok.push({ cim: "Város", elemek: varosok.map((v) => ({ cimke: v, q: v })) });
  const kocsik = index.kocsik.filter((k) => tartalmaz(`${k.cimke} ${k.kod}`)).slice(0, 3);
  if (kocsik.length) csoportok.push({ cim: "Kocsi", elemek: kocsik.map((k) => ({ cimke: k.cimke, q: k.kod })) });
  const szamok = t.length >= 2 ? rendez(index.szamok.filter(tartalmaz)).slice(0, 4) : [];
  if (szamok.length) csoportok.push({ cim: "Szám", elemek: szamok.map((x) => ({ cimke: x, q: x })) });
  const utolso = q.split(/\s+/).pop() ?? "";
  const honap = honapKeresoszo(utolso);
  if (honap !== null) {
    const elotte = q.slice(0, q.length - utolso.length).trim();
    csoportok.push({ cim: "Hónap", elemek: [{ cimke: HONAP_CIMKE[honap - 1], q: [elotte, HONAPOK[honap - 1].slice(0, 4)].filter(Boolean).join(" ") }] });
  }
  const fuvarok = index.fuvarok.filter((f) => keresSzovegEgyezik(f.szoveg, f.napok, q)).slice(0, 6);
  return { fuvarok, csoportok };
}
