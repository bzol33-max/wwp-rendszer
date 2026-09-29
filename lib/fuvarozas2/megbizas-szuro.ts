// A munkaasztal-lista „Következő teendő” szövege (tervvászon D2).
//
// Tiszta függvények — nincs adatbázis, nincs "use server": így tesztelhető
// (scripts/teszt-megbizas-szuro.ts), és a szerver- és kliens-oldal
// ugyanazt a logikát látja.

import type { Allapot } from "@/lib/fuvarozas/allapot";

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
    // Visszaért: számlázni kell — a fotó csak jelzés, nem feltétel (2026-09-25).
    case "teljesitve":
    case "szamlazhato":
      if (!s.hivatkozas && !s.hivatkozas_nincs) return { szoveg: "hivatkozási szám a számlához", surgos: true };
      return { szoveg: s.foto_van || s.allapot === "szamlazhato" ? "számlázás a Számlázz.hu-ban" : "számlázás · fotó még nincs", surgos: false };
    // Számlázva: postára kell adni (külön e-mail-lépés nincs).
    case "szamlazva":
    case "email_elment": {
      // A megadott "ma" napjához mérve (nem a gép órájához), hogy a lista és a teszt ugyanazt számolja.
      const napok = papirHatraNap(s.lerakas_nap, s.papir_hatarido_nap, new Date(`${ma}T12:00:00Z`));
      if (!s.postazasi_cim) return { szoveg: "postázási cím hiányzik", surgos: true };
      return { szoveg: napok == null ? "postázás" : `postázás · határidő ${napok} nap`, surgos: napok != null && napok <= 2 };
    }
    case "postazva":
      return { szoveg: "—", surgos: false };
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
