// Kalkulátor — önköltség és a megbízói ajánlat minősítése (tervvászon D6).
// Az ár-javaslat az árlétra (lib/fuvarozas2/ar-letra.ts), nem itt.
//
// Tiszta számtan, adatbázis és hálózat nélkül: így tesztelhető, és ugyanazt
// számolja a szerver és a felület.
//
// A paraméterek (napi költség, km-díj, alap fogyasztás, mérési küszöb,
// vezetési keret) 2026-10-10-től a fuvar_beallitas táblából jönnek
// (lib/beallitasok/fuvar.ts) — a szerveroldali hívók olvassák ki és adják
// át ide. Az itt exportált konstansok az ALAPÉRTÉKEK (ugyanazok, mint a
// beállítások tartaléka), ha egy hívó nem ad meg mást.
import { FUVAR_BEALLITAS_ALAP } from "@/lib/beallitasok/fuvar-alap";
import { MIN_ARRES_SZAZALEK } from "@/lib/fuvarozas2/ar-letra";

// A NAPI KÖLTSÉG egyetlen szám: a sofőr és a kocsi együttes napi költsége
// (bér + járulék + lízing + biztosítás + amortizáció). Zoltán döntése
// (2026-09-20): **50 000 Ft/nap/kocsi** (beállítás: napi_koltseg_ft).
export const NAPI_KOLTSEG_FT = FUVAR_BEALLITAS_ALAP.napi_koltseg_ft;

// Saját fuvar „bérben mennyibe került volna”: rakott km × ez a díj. Zoltán
// döntése (2026-10-04): egyelőre fix 550 Ft/km, a régi fuvarokra is; később
// az előző havi átlagos bér km-díj váltja (beállítás: sajat_fuvar_km_dij_ft).
export const SAJAT_FUVAR_KM_DIJ_FT = FUVAR_BEALLITAS_ALAP.sajat_fuvar_km_dij_ft;

/** Ha nincs (elég) mért fogyasztás, ezzel számolunk — 28 l/100 km (2026-10-10). */
export const ALAP_FOGYASZTAS_L100 = FUVAR_BEALLITAS_ALAP.fogyasztas_alap_l_100km;

/** A mért fogyasztás csak ennyi mért km FÖLÖTT írja felül az alapot (2026-10-10: 300 km). */
export const MERES_MIN_KM = FUVAR_BEALLITAS_ALAP.meres_min_km;

/**
 * Egy GPS-nap üzemanyag-mérése csak e sávon belül hihető (l/100 km). Az
 * Ecofleet-útvonaljelentés 2026.09-ben: az AOPU-427 09.22-ig minden során
 * 0 litert adott (nem mért a szonda), az NMZ-492 napi értéke 5 és 93 között
 * szórt (tankolás/tankszint-ugrás). A sávon kívüli vagy 0 literes nap NEM
 * mérés — azt becsüljük, és nem húzhatja le/fel a mért átlagot.
 */
export const GPS_L100_MIN = 10;
export const GPS_L100_MAX = 70;

/** Hihető-e egy nap (vagy út-csoport) mért litere. */
export function ervenyesUzemanyagMeres(km: number, liter: number): boolean {
  if (!(km > 0) || !(liter > 0)) return false;
  const l100 = (liter / km) * 100;
  return l100 >= GPS_L100_MIN && l100 <= GPS_L100_MAX;
}

/** Csak az érvényes mérési napok km-e és litere (a mért átlaghoz). */
export function ervenyesNapokOsszege(napok: Iterable<{ km: number; liter: number }>): { km: number; liter: number; kihagyottNap: number } {
  let km = 0;
  let liter = 0;
  let kihagyottNap = 0;
  for (const n of napok) {
    if (ervenyesUzemanyagMeres(n.km, n.liter)) { km += n.km; liter += n.liter; }
    else if (n.km > 0) kihagyottNap++;
  }
  return { km, liter, kihagyottNap };
}

/** Napi vezetési keret, perc — ebből számoljuk, hány napot köt le egy fuvar. */
export const NAPI_VEZETES_PERC = FUVAR_BEALLITAS_ALAP.sofor_napi_vezetes_max_perc;

/**
 * Mért vagy alap fogyasztás: a mért érték (liter / km) csak akkor számít, ha
 * a mért táv a küszöb FÖLÖTT van és van tankolt/mért liter — rövid mintán a
 * mért átlag félrevisz.
 */
export function valasszFogyasztast(b: { mertKm: number; mertLiter: number; alapL100?: number; minKm?: number }): { l100: number; mert: boolean } {
  const alap = b.alapL100 ?? ALAP_FOGYASZTAS_L100;
  const minKm = b.minKm ?? MERES_MIN_KM;
  if (b.mertKm > minKm && b.mertLiter > 0) return { l100: Math.round((b.mertLiter / b.mertKm) * 1000) / 10, mert: true };
  return { l100: alap, mert: false };
}

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
  /** Ft/nap/kocsi — ha nincs megadva, NAPI_KOLTSEG_FT (a beállítás alapértéke). */
  napiKoltsegFt?: number;
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
  const napiFt = Math.round(Math.max(1, b.napok) * (b.napiKoltsegFt ?? NAPI_KOLTSEG_FT));
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
  /** Felár az ÖNKÖLTSÉGRE vetítve, százalék (negatív = veszteség) — ugyanaz az alap, mint az árlétráé (ar-letra.ts). */
  marginSzazalek: number;
  minosites: AjanlatMinosites;
};

/**
 * A díj minősítése az árlétra szabálya szerint (2026-10-11): 0 alatt
 * veszteséges, az önköltség +10%-a (a létra minimuma) alatt határeset,
 * fölötte ajánlott. A küszöb a kerekítetlen felárra vonatkozik.
 */
export function minositsAjanlatot(dijFt: number, onkoltsegFt: number): { eredmenyFt: number; marginSzazalek: number; minosites: AjanlatMinosites } {
  const eredmenyFt = Math.round(dijFt - onkoltsegFt);
  const felar = onkoltsegFt > 0 ? (eredmenyFt / onkoltsegFt) * 100 : dijFt > 0 ? 100 : 0;
  const minosites: AjanlatMinosites = felar < 0 ? "veszteseges" : felar < MIN_ARRES_SZAZALEK ? "hatareset" : "ajanlott";
  return { eredmenyFt, marginSzazalek: Math.round(felar), minosites };
}

/** Hány napot köt le a fuvar: napi vezetési keret (alap 9 óra) / nap, felfelé kerekítve. */
export function napokMenetidobol(percek: number, napiVezetesPerc: number = NAPI_VEZETES_PERC): number {
  return Math.max(1, Math.ceil(percek / Math.max(1, napiVezetesPerc)));
}
