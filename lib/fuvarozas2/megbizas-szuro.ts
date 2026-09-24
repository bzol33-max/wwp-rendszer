// Megbízás-lista szűrők és a „Következő teendő" oszlop (tervvászon D2).
//
// Tiszta függvények — nincs adatbázis, nincs "use server": így tesztelhető
// (scripts/teszt-megbizas-szuro.ts), és a szerver- és kliens-oldal
// ugyanazt a logikát látja.

import type { Allapot } from "@/lib/fuvarozas/allapot";

export type Idoszak = "ez_a_het" | "mult_het" | "regebbi" | "mind";

export type SzuroAllapot = {
  jelleg?: "ber" | "sajat";
  allapot?: Allapot;
  jarmu?: string;          // jármű kód, vagy "nincs"
  idoszak?: Idoszak;
};

/** A „Következő teendő" oszlop: mi az EGY dolog, ami ezen a soron most hátravan. */
export function kovetkezoTeendo(s: {
  allapot: Allapot;
  jarmu_kod: string | null;
  hianylista: unknown[];
  hivatkozas: string | null;
  hivatkozas_nincs: boolean;
  foto_van: boolean;
  szamla_szam: string | null;
  papirok_beerkeztek_at: string | null;
  postazasi_cim: string | null;
  jelleg: "ber" | "sajat";
  lerakas_nap: string | null;
  papir_hatarido_nap?: number | null;
}, ma: string): { szoveg: string; surgos: boolean } {
  const hiany = (s.hianylista ?? []).map((h) => String(h)).filter(Boolean);
  switch (s.allapot) {
    case "ellenorzesre_var":
      if (hiany.length > 0) return { szoveg: `${hiany.join(", ")} pótlása`, surgos: true };
      return { szoveg: "jóváhagyás", surgos: false };
    case "tervezett":
      if (!s.jarmu_kod) return { szoveg: "kocsi hozzárendelése", surgos: true };
      return { szoveg: "felrakás", surgos: false };
    case "folyamatban": {
      const lejart = (s.lerakas_nap ?? "") < ma;
      if (!s.jarmu_kod) return { szoveg: "kocsi hozzárendelése", surgos: true };
      return { szoveg: lejart ? "lejárt — teljesítés jelölése" : "lerakás", surgos: lejart };
    }
    case "teljesitve":
      return { szoveg: s.foto_van ? "fotó ellenőrzése" : "sofőr fuvarlevél-fotója", surgos: false };
    case "szamlazhato":
      if (!s.hivatkozas && !s.hivatkozas_nincs) return { szoveg: "hivatkozási szám a számlához", surgos: true };
      return { szoveg: "számlázás a Számlázz.hu-ban", surgos: false };
    case "szamlazva":
      return { szoveg: s.szamla_szam ? "számla e-mail a partnernek" : "számla párosítása", surgos: false };
    case "email_elment": {
      // A megadott "ma" napjához mérve (nem a gép órájához), hogy a lista és a teszt ugyanazt számolja.
      const napok = papirHatraNap(s.lerakas_nap, s.papir_hatarido_nap, new Date(`${ma}T12:00:00Z`));
      if (!s.postazasi_cim) return { szoveg: "postázási cím hiányzik", surgos: true };
      return { szoveg: napok == null ? "postázás" : `postázás · határidő ${napok} nap`, surgos: napok != null && napok <= 2 };
    }
    case "postazva":
      return { szoveg: "lezárás", surgos: false };
    case "lezart":
      return { szoveg: "—", surgos: false };
  }
}

/** Hány nap van a partner papír-beküldési határidejéből (lerakás + N nap). */
export function papirHatraNap(lerakasNap: string | null, hataridoNap: number | null | undefined, most = new Date()): number | null {
  if (!lerakasNap) return null;
  const hatar = new Date(`${lerakasNap}T12:00:00Z`);
  hatar.setUTCDate(hatar.getUTCDate() + (hataridoNap ?? 7));
  return Math.round((hatar.getTime() - most.getTime()) / 86400000);
}

/** Melyik időszak-vödörbe esik egy nap a mai naphoz képest (hétfői hétkezdettel). */
export function idoszakVodor(nap: string | null, ma: string): Idoszak {
  if (!nap) return "regebbi";
  const hetKezdet = (iso: string) => {
    const d = new Date(`${iso}T12:00:00Z`);
    const nd = (d.getUTCDay() + 6) % 7; // hétfő = 0
    d.setUTCDate(d.getUTCDate() - nd);
    return d.toISOString().slice(0, 10);
  };
  const ezAHet = hetKezdet(ma);
  const multHet = (() => {
    const d = new Date(`${ezAHet}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 7);
    return d.toISOString().slice(0, 10);
  })();
  if (nap >= ezAHet) return "ez_a_het";
  if (nap >= multHet) return "mult_het";
  return "regebbi";
}
