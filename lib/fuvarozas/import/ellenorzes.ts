// A kiolvasott fuvaradat hitelesség-vizsgálata.
//
// A rendszer alapbaja eddig az volt, hogy EGY ROSSZ SOR PONTOSAN ÚGY NÉZ KI,
// MINT EGY JÓ. Ha a nyelvi modell a kötbér-táblázatból szedte ki a
// "fuvardíjat", vagy a hasábos fejlécből minket írt megrendelőnek, az
// eredmény ugyanolyan magabiztos sor lett a listában, mint a helyesen
// beolvasott. Ember csak akkor vette észre, amikor számlázni kellett.
//
// Ez a modul minden kiolvasott rekordot átvizsgál, és KIFOGÁSOKAT ad vissza.
// A kifogások a sorral együtt eltárolódnak, tehát a felületen látszik, hogy
// MIT nem tudott a gép — nem csak az, hogy "ellenőrizendő".
//
// NEM "use server" fájl — sima segédmodul, tesztből is hívható.

import { sajatCegunkE } from "@/lib/fuvarozas/fuvar-constants";

/** Egy dokumentumból kiolvasott fuvar — a determinisztikus olvasók és a nyelvi modell KÖZÖS kimeneti alakja. */
export type KivontFuvar = {
  megrendelo: string | null;
  felrako: string | null;
  felrakasDatum: string | null;
  lerako: string | null;
  lerakasDatum: string | null;
  aru: string | null;
  mennyiseg: string | null;
  rendszamVagySofor: string | null;
  fuvardij: number | null;
  fuvardijPenznem: "Ft" | "EUR" | null;
  fizetesiHataridoNap: number | null;
  postazasiCim: string | null;
  pozicioszam: string | null;
  megjegyzes: string | null;
};

export type Verdikt =
  /** Minden lényeges mező megvan és hihető — mehet a listába. */
  | "biztos"
  /** Sor létrejöhet, de ember nézze át: a `kifogasok` mondja meg, miért. */
  | "ellenorizendo"
  /** Ennyire hiányos, hogy sort sem csinálunk belőle — inkább ne legyen, mint rossz legyen. */
  | "elutasitva";

export type Ellenorzes = {
  verdikt: Verdikt;
  kifogasok: string[];
};

/**
 * Hihető fuvardíj-sávok. A megbízások kisbetűs része tele van CSALI
 * összegekkel (kötbér 100/300/400 EUR, állásdíj, raklap 7.000 Ft/db,
 * 10.000 Ft/óra késedelem), és a nyelvi modell rendszeresen ezek közül
 * választott. A sávon kívüli érték nem hiba önmagában — de kifogás.
 */
const FUVARDIJ_SAV = {
  Ft: { min: 30_000, max: 3_000_000 },
  EUR: { min: 200, max: 10_000 },
} as const;

/** Meddig tekintünk hihetőnek egy felrakási dátumot (nap, mához képest). */
const LEGREGEBBI_NAP = 400;
const LEGKESOBBI_NAP = 180;

function datumot(iso: string | null): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function napEltres(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

/**
 * Átvizsgálja a kiolvasott fuvart.
 *
 * @param kivont      a dokumentumból kiolvasott adatok
 * @param partnerBol  igaz, ha a megrendelőt ISMERT PARTNER ujjlenyomata adta
 *                    (nem a nyelvi modell tippelte) — lásd partnerek.ts
 * @param most        a "ma" referenciapontja (tesztelhetőség miatt paraméter)
 */
export function ellenorizKivontFuvart(
  kivont: KivontFuvar,
  partnerBol: boolean,
  most: Date = new Date()
): Ellenorzes {
  const kifogasok: string[] = [];
  let elutasit = false;

  // --- Amitől használhatatlan a sor ---
  if (!kivont.lerako?.trim()) {
    kifogasok.push("Nincs lerakóhely.");
    elutasit = true;
  }
  const felrakas = datumot(kivont.felrakasDatum);
  if (!felrakas) {
    kifogasok.push("Nincs értelmezhető felrakási dátum.");
    elutasit = true;
  }

  // --- Megrendelő ---
  if (sajatCegunkE(kivont.megrendelo)) {
    // A Drive-mappába érkező megbízásokon MI vagyunk a megbízott. Ha a
    // kiolvasás minket adott megrendelőnek, a hasábos fejlécet olvasta
    // félre — ilyet inkább üresen hagyunk.
    kifogasok.push("A kiolvasás a saját cégünket adta megrendelőnek — a mezőt üresen hagytuk.");
    kivont.megrendelo = null;
  }
  if (!kivont.megrendelo?.trim()) {
    kifogasok.push("Nincs megrendelő.");
  } else if (!partnerBol) {
    kifogasok.push("A megrendelőt nem ismert partner-sablon adta, hanem a szövegből olvastuk ki.");
  }

  // --- Fuvardíj ---
  if (kivont.fuvardij == null) {
    kifogasok.push("Nincs fuvardíj.");
  } else if (!Number.isFinite(kivont.fuvardij) || kivont.fuvardij <= 0) {
    kifogasok.push(`Értelmezhetetlen fuvardíj: ${kivont.fuvardij}.`);
  } else {
    const penznem = kivont.fuvardijPenznem ?? "Ft";
    // Védekezés: a típus szerint csak "Ft"/"EUR" jöhet, de a kivonatoló
    // nyers szöveget adhat ("HUF") — ilyenkor a sáv-ellenőrzés kimarad, és
    // kifogás lesz belőle, nem kivétel.
    const sav = (FUVARDIJ_SAV as Record<string, { min: number; max: number } | undefined>)[penznem];
    if (!sav) {
      kifogasok.push(`Ismeretlen pénznem a fuvardíjnál: "${penznem}".`);
    } else if (kivont.fuvardij < sav.min || kivont.fuvardij > sav.max) {
      kifogasok.push(
        `A fuvardíj (${kivont.fuvardij} ${penznem}) kívül esik a szokásos ${sav.min}–${sav.max} ${penznem} sávon — lehet, hogy egy kötbér- vagy állásdíj-összeget olvasott ki.`
      );
    }
  }
  if (kivont.fuvardij != null && !kivont.fuvardijPenznem) {
    kifogasok.push("A fuvardíj pénzneme nem derült ki.");
  }

  // --- Dátumok hihetősége ---
  if (felrakas) {
    const eltres = napEltres(felrakas, most);
    if (eltres < -LEGREGEBBI_NAP) {
      kifogasok.push(`A felrakás dátuma (${kivont.felrakasDatum}) több mint ${LEGREGEBBI_NAP} napja volt.`);
    } else if (eltres > LEGKESOBBI_NAP) {
      kifogasok.push(`A felrakás dátuma (${kivont.felrakasDatum}) több mint ${LEGKESOBBI_NAP} nappal a jövőben van.`);
    }
    const lerakas = datumot(kivont.lerakasDatum);
    if (lerakas && lerakas < felrakas) {
      kifogasok.push(
        `A lerakás dátuma (${kivont.lerakasDatum}) korábbi, mint a felrakásé (${kivont.felrakasDatum}).`
      );
    }
  }

  // --- Hivatkozási szám: enélkül nem tudunk számlázni ---
  if (!kivont.pozicioszam?.trim()) {
    kifogasok.push("Nincs hivatkozási/pozíciószám — a partner ezt általában kéri a számlán.");
  }

  if (elutasit) return { verdikt: "elutasitva", kifogasok };
  return { verdikt: kifogasok.length === 0 ? "biztos" : "ellenorizendo", kifogasok };
}
