// Kalkulátor — önköltség és ajánlat-sávok (tervvászon D6).
//
// Tiszta számtan, adatbázis és hálózat nélkül: így tesztelhető, és ugyanazt
// számolja a szerver és a felület.
//
// A NAPI KÖLTSÉG egyetlen szám: a sofőr és a kocsi együttes napi költsége
// (bér + járulék + lízing + biztosítás + amortizáció). Zoltán döntése
// (2026-09-20): **50 000 Ft/nap/kocsi**. Ha ez később bomlik sofőrre és
// kocsira, csak ez a konstans változik.
export const NAPI_KOLTSEG_FT = 50_000;

/** Ha nincs mért fogyasztás (nincs Ecofleet-adat), ezzel számolunk. */
export const ALAP_FOGYASZTAS_L100 = 30;

export type OnkoltsegBemenet = {
  rakottKm: number;
  uresKm: number;
  /** l/100 km — mért (Ecofleet 14 napos) vagy alapérték. */
  fogyasztasL100: number;
  /** Ft/liter — NAV havi gázolajár vagy kézi. */
  gazolajFt: number;
  /** HU-GO útdíj a teljes (rakott + üres) útra, Ft. Ha nincs, 0. */
  utdijFt: number;
  /** Hány napot köt le a fuvar (menetidőből, min. 1). */
  napok: number;
};

export type Onkoltseg = {
  uzemanyagFt: number;
  utdijFt: number;
  napiFt: number;
  osszesenFt: number;
  /** Önköltség egy rakott km-re — ez az a szám, amihez az ajánlatot mérni kell. */
  ftPerRakottKm: number | null;
  osszesKm: number;
};

export function szamoljOnkoltseget(b: OnkoltsegBemenet): Onkoltseg {
  const osszesKm = Math.max(0, b.rakottKm) + Math.max(0, b.uresKm);
  const uzemanyagFt = Math.round((osszesKm * b.fogyasztasL100 / 100) * b.gazolajFt);
  const napiFt = Math.round(Math.max(1, b.napok) * NAPI_KOLTSEG_FT);
  const utdijFt = Math.round(Math.max(0, b.utdijFt));
  const osszesenFt = uzemanyagFt + utdijFt + napiFt;
  return {
    uzemanyagFt, utdijFt, napiFt, osszesenFt, osszesKm,
    ftPerRakottKm: b.rakottKm > 0 ? Math.round(osszesenFt / b.rakottKm) : null,
  };
}

export type AjanlatMinosites = "veszteseges" | "hatareset" | "ajanlott";

export type Ajanlat = {
  ftKm: number;
  dijFt: number;
  /** Eredmény a díjból az önköltség levonása után. */
  eredmenyFt: number;
  /** Árrés a díjhoz viszonyítva, százalék (negatív = veszteség). */
  marginSzazalek: number;
  minosites: AjanlatMinosites;
};

export function minositsAjanlatot(dijFt: number, onkoltsegFt: number): { eredmenyFt: number; marginSzazalek: number; minosites: AjanlatMinosites } {
  const eredmenyFt = Math.round(dijFt - onkoltsegFt);
  const marginSzazalek = dijFt > 0 ? Math.round((eredmenyFt / dijFt) * 100) : -100;
  const minosites: AjanlatMinosites = marginSzazalek < 0 ? "veszteseges" : marginSzazalek < 8 ? "hatareset" : "ajanlott";
  return { eredmenyFt, marginSzazalek, minosites };
}

/** A vászon három sávja: 500 / 600 / 700 Ft rakott km-enként. */
export function ajanlatSavok(rakottKm: number, onkoltsegFt: number, ftKmLista = [500, 600, 700]): Ajanlat[] {
  return ftKmLista.map((ftKm) => {
    const dijFt = Math.round(ftKm * rakottKm);
    return { ftKm, dijFt, ...minositsAjanlatot(dijFt, onkoltsegFt) };
  });
}

/** Hány napot köt le a fuvar: 9 óra vezetés / nap, felfelé kerekítve. */
export function napokMenetidobol(percek: number): number {
  return Math.max(1, Math.ceil(percek / (9 * 60)));
}
