// A megbízásból kiolvasott, KIFEJEZETTEN A SOFŐRNEK szóló adatok
// (Budaházi Zoltán, 2026-09-23: "eddig átküldtem a komplett megbízást
// emailben, át kell állni csak az appra").
//
// 8 megbízó 8 megbízásának átnézése után ő választotta ki, mi kell a
// sofőrnek a telefonon: időpont/időablak, az ÖSSZES lerakó, a rakodóhely
// cégneve, dátum, pozíciószám, referencia/rakodási szám, helyszíni kontakt,
// áru, jármű-előírás, és a megbízás PDF. Ami NEM kell: az ügyintéző, a
// raklapcsere, a papír-teendők, az értesítési kötelezettségek és a
// megbízók szabad szöveges utasításai.
//
// MIÉRT NEM A CÍMBE KERÜL A CÉGNÉV: a felrako/lerako szövegből geokódolunk
// (utdijkalkulacio.ts fuzzySearch), és a helyszín-szótár kulcsa is a
// címből képződik (varos.ts cimKulcs). Egy cégnév-előtag a keresőt
// elbizonytalanítaná, a szótár kulcsát pedig megváltoztatná. Ezért a
// megállónkénti részletek külön, a `megallo_reszletek` JSON oszlopba
// kerülnek, a cím pedig marad tiszta cím.
//
// Ez a fájl NEM "use server" — tiszta függvények, a teszt
// (scripts/teszt-sofor-adatok.mts) közvetlenül hívja.

import { varosNev } from "./varos";

export type MegalloReszlet = {
  tipus: "felrako" | "lerako";
  /** Tiszta cím, cégnév nélkül ("9400 Sopron, Szappanfőző krt. 14."). */
  cim: string | null;
  /** A rakodóhely cége ("Huncargo Raktár") — NEM a megbízó. */
  ceg: string | null;
  /** ISO nap (ÉÉÉÉ-HH-NN), ha a megbízás megállónként megadja. */
  nap: string | null;
  /** Időpont / időablak szó szerint, röviden ("8:00–20:00", "15:00-ig"). */
  ido: string | null;
  /** A helyszínen hívható személy neve és telefonszáma. */
  kontakt: string | null;
};

export type SoforAdatok = {
  /** Minden fel- és lerakó, útvonal-sorrendben. */
  megallok: MegalloReszlet[];
  /** A felrakón / kapuban kért szám, ha más, mint a pozíciószám. */
  referencia: string | null;
  /** A járműre vonatkozó előírás ("Mega autó", "13,6 m ponyvás", "spanifer"). */
  jarmuEloiras: string | null;
};

function szoveg(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  if (!t || /^(null|nincs|-|n\/a)$/i.test(t)) return null;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function isoNap(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null;
}

/**
 * A nyelvi modell válaszának sofőr-mezői, megtisztítva. A modell tévedhet
 * a formában (szám helyett szöveg, "null" szövegként, hiányzó tömb) — ami
 * nem értelmezhető, az null, nem kivétel: a sofőr-adat kiegészítés, a
 * megbízás felvitelét soha nem akaszthatja meg.
 */
export function soforAdatokKivonatbol(nyers: unknown): SoforAdatok {
  const o = (nyers && typeof nyers === "object" ? nyers : {}) as Record<string, unknown>;
  const megallok = (Array.isArray(o.megallok) ? o.megallok : [])
    .map((m): MegalloReszlet | null => {
      if (!m || typeof m !== "object") return null;
      const r = m as Record<string, unknown>;
      const tipus = r.tipus === "felrako" || r.tipus === "lerako" ? r.tipus : null;
      if (!tipus) return null;
      return {
        tipus,
        cim: szoveg(r.cim, 160),
        ceg: szoveg(r.ceg, 80),
        nap: isoNap(r.nap),
        ido: szoveg(r.ido, 60),
        kontakt: szoveg(r.kontakt, 80),
      };
    })
    .filter((m): m is MegalloReszlet => m !== null)
    .slice(0, 12);
  return {
    megallok,
    referencia: szoveg(o.referencia, 60),
    jarmuEloiras: szoveg(o.jarmuEloiras, 60),
  };
}

/** Igaz, ha van mit elmenteni — üres kivonatot nem írunk az adatbázisba. */
export function vanSoforAdat(a: SoforAdatok): boolean {
  return (
    a.referencia !== null ||
    a.jarmuEloiras !== null ||
    a.megallok.some((m) => m.ceg || m.ido || m.kontakt || m.nap)
  );
}

/**
 * Az ÖSSZES lerakó címe egy mezőben, a megállók elválasztójával ("; ",
 * lásd varos.ts ELSODLEGES_ELVALASZTO) — de csak ha legalább kettő van, és
 * mindnek van címe. Egy lerakónál null: ott a modell `lerako` mezője a jó.
 *
 * Eddig a modell több lerakónál csak az UTOLSÓT adta vissza, így az ÁB
 * Speed Sopron → Miskolc → Debrecen fuvarjából Sopron → Debrecen lett, a
 * miskolci megálló eltűnt a sofőr és a GPS elől is.
 */
export function osszesLerakoCime(a: SoforAdatok): string | null {
  const lerakok = a.megallok.filter((m) => m.tipus === "lerako");
  if (lerakok.length < 2 || lerakok.some((m) => !m.cim)) return null;
  // A pontosvessző a megállók elválasztója — címen belül nem maradhat.
  return lerakok.map((m) => m.cim!.replace(/;/g, ",")).join("; ");
}

function varosKulcs(cim: string | null | undefined): string {
  return varosNev(cim).trim().toLowerCase();
}

/**
 * Egy megálló részletei a mentett listából. A megállókat a GPS lap a
 * felrako/lerako szövegből bontja (bontsMegallokra), a részleteket a modell
 * adta — a kettőt a típuson belül VÁROS szerint párosítjuk, és csak ha
 * ez nem dönt, sorszám szerint (azonos darabszámnál). Így egy régi,
 * egylerakós sorhoz is a helyes (a városával egyező) lerakó részlete jön,
 * akkor is, ha a modell közben három lerakót talált.
 */
export function megalloReszlete(
  reszletek: readonly MegalloReszlet[] | null | undefined,
  tipus: "felrako" | "lerako",
  tipusonBeluliIndex: number,
  tipusonBeluliDarab: number,
  cim: string
): MegalloReszlet | null {
  const jeloltek = (reszletek ?? []).filter((r) => r.tipus === tipus);
  if (jeloltek.length === 0) return null;
  const v = varosKulcs(cim);
  const azonosVarosuak = v ? jeloltek.filter((r) => varosKulcs(r.cim) === v) : [];
  if (azonosVarosuak.length === 1) return azonosVarosuak[0];
  if (jeloltek.length === tipusonBeluliDarab) return jeloltek[tipusonBeluliIndex] ?? null;
  // Több azonos városú jelölt (pl. két debreceni lerakó): a sorrend dönt
  // közöttük, ha a darabszám ott is egyezik.
  if (azonosVarosuak.length > 1) return azonosVarosuak[Math.min(tipusonBeluliIndex, azonosVarosuak.length - 1)];
  return null;
}

/** A kontakt szövegből a hívható szám ("06 20 935 3201" → "06209353201"), ha van. */
export function kontaktTelefon(kontakt: string | null | undefined): string | null {
  const m = kontakt?.match(/\+?\d[\d\s/().-]{6,}\d/);
  if (!m) return null;
  const szam = m[0].replace(/[^\d+]/g, "");
  return szam.length >= 8 ? szam : null;
}

/** A kontakt szövegből a név — a telefonszám nélkül. */
export function kontaktNev(kontakt: string | null | undefined): string | null {
  if (!kontakt) return null;
  const nev = kontakt.replace(/\+?\d[\d\s/().-]{6,}\d/, "").replace(/[,;:·()\s-]+$/g, "").replace(/^[,;:·()\s-]+/g, "").trim();
  return nev || null;
}
