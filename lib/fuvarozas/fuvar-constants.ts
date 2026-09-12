// Fuvar-típusú konstansok és típusok — NEM "use server" fájl.
//
// A lib/fuvarozas/megbizasok.ts egy "use server" fájl, ami Next.js-ben
// KIZÁRÓLAG async függvényeket exportálhat. A FUVAR_STATUSZ_LABEL objektum
// és a FUVAR_STATUSZOK tömb (nem-függvény érték) ezért ide került ki — ezek
// hiánya futásidőben "A "use server" file can only export async functions,
// found object." hibát okozott, ami az egész Fuvarozás oldalt eldöntötte.

export type FuvarTipus = "sajat" | "ber";

/** A fuvardíj pénzneme — a legtöbb megbízás HUF-ban van, de van (pl. külföldi megbízó) EUR-os is. */
export type FuvardijPenznem = "Ft" | "EUR";

export type FuvarStatusz =
  | "uj"
  | "tervezett"
  | "uton"
  | "lezarva"
  | "szamlazva"
  | "problemas"
  | "torolt";

export const FUVAR_STATUSZ_LABEL: Record<FuvarStatusz, string> = {
  uj: "Új",
  tervezett: "Tervezett",
  uton: "Úton",
  lezarva: "Lezárva",
  szamlazva: "Számlázva",
  problemas: "Problémás",
  torolt: "Törölt",
};

export const FUVAR_STATUSZOK = Object.keys(FUVAR_STATUSZ_LABEL) as FuvarStatusz[];

/**
 * Egy nap saját fuvarjai az idővonal-becsléshez — nyers (nem szövegre
 * formázott) dátumokkal, hogy Date objektumot lehessen belőlük építeni.
 */
export type MaiFuvarSor = {
  id: string;
  megrendelo: string | null;
  felrako: string | null;
  lerako: string;
  /** Szabad szöveg (pl. "06:00") — nincs garantált formátum. */
  idopont: string | null;
  /** ISO dátum (YYYY-MM-DD) — a felrakás napja. */
  datum: string;
  /** ISO dátum (YYYY-MM-DD), ha a lerakás más napra esik. */
  lerakas_datum: string | null;
  jarmu: string | null;
  sofor: string | null;
  pozicioszam: string | null;
};

export type FuvarRow = {
  id: string;
  tipus: FuvarTipus;
  date: string;
  /** A "date" mező nyers (YYYY-MM-DD) alakja — szerkesztő űrlap dátum-inputjának előtöltéséhez, ahol a "mon. DD" formátum nem használható. */
  datum_iso: string;
  idopont: string | null;
  felrako: string | null;
  lerako: string;
  megrendelo: string | null;
  aru: string | null;
  mennyiseg: string | null;
  suly: string | null;
  jarmu: string | null;
  sofor: string | null;
  alvallalkozo: string | null;
  fuvardij: number | null;
  /** A "fuvardij" mező pénzneme — alapból "Ft", de EUR-os megbízásoknál (pl. Duvenbeck) "EUR". A rendszer nem vált át HUF-ra, ezért az összeg-jellegű számítások (pl. "Eredmény") csak Ft esetén futnak. */
  fuvardij_penznem: FuvardijPenznem;
  koltseg: number | null;
  statusz: FuvarStatusz;
  megjegyzes: string | null;
  dokumentum_url: string | null;
  forras: "kezi" | "pdf_import";
  ellenorzott: boolean;
  created_by: string | null;
  /** A megbízás beérkezésének dátuma (bér fuvaroknál) — formázva, mint a "date" mező. */
  erkezett_datum: string | null;
  /** A lerakás dátuma, ha eltér a felrakás dátumától ("date" mezőtől) — formázva. */
  lerakas_datum: string | null;
  /** A "lerakas_datum" mező nyers (YYYY-MM-DD) alakja — szerkesztő űrlap dátum-inputjának előtöltéséhez. */
  lerakas_datum_iso: string | null;
  /** A megbízásban szereplő fizetési határidő, napokban (pl. 30/45/60). */
  fizetesi_hatarido_nap: number | null;
  /**
   * A megbízó által adott hivatkozási szám (fuvarszám / pozíciószám /
   * megbízási szám — mind ugyanaz). A megbízó hivatkozik erre a saját
   * rendszerében, és sok esetben megköveteli, hogy a számlán is szerepeljen.
   */
  pozicioszam: string | null;
  /** Igaz, ha megerősítve rögzítve lett, hogy ennél a megbízónál nincs ilyen szám. */
  pozicioszam_nincs: boolean;
  /** A Számla/Posta nézethez: hová kell postázni a kiállított számlát ennél a megbízásnál. */
  postazasi_cim: string | null;
  /** A Számla/Posta nézethez: igaz, ha a fuvar dokumentációja (számla + megbízás) ténylegesen postára lett adva. */
  postazva: boolean;
  /** A Számla/Posta nézethez: a fuvarhoz kiállított saját számla sorszáma. */
  szamla_szam: string | null;
  /** Mikor lett a "Postázva" jelölő bepipálva — ebből számít az 5 perces visszavonási ablak. */
  postazva_at: string | null;
  /**
   * Kézi "Teljesítve" jelölő (Bér fuvarok — folyamatban fül): igaz, ha a
   * fuvar a rögzített (tervezett) lerakás dátum előtt lett kézzel lezárva,
   * és emiatt már a Számla/Posta fülön szerepel a dátum-alapú automatikus
   * mozgástól függetlenül.
   */
  teljesitve: boolean;
  /** Mikor lett a "Teljesítve" jelölő bepipálva. */
  teljesitve_at: string | null;
};

export type AddFuvarInput = {
  tipus: FuvarTipus;
  datum: string;
  idopont?: string;
  felrako?: string;
  lerako: string;
  megrendelo?: string;
  aru?: string;
  mennyiseg?: string;
  suly?: string;
  jarmu?: string;
  sofor?: string;
  alvallalkozo?: string;
  fuvardij?: number;
  fuvardijPenznem?: FuvardijPenznem;
  koltseg?: number;
  megjegyzes?: string;
  dokumentumUrl?: string;
  driveFileId?: string;
  forras?: "kezi" | "pdf_import";
  ellenorzott?: boolean;
  createdBy?: string;
  erkezettDatum?: string;
  lerakasDatum?: string;
  fizetesiHataridoNap?: number;
  pozicioszam?: string;
  pozicioszamNincs?: boolean;
  postazasiCim?: string;
};

/**
 * Egy "folyamatban" saját fuvar a GPS-alapú automatikus "Teljesítve"
 * figyeléshez (lásd lib/fuvarozas/teljesites-figyeles.ts) — nyers (nem
 * szövegre formázott) dátumokkal, hogy Date objektumot lehessen belőlük
 * építeni az Ecofleet trip-lekérdezéshez.
 */
export type TeljesitesJelolt = {
  id: string;
  /** "Sofőr — rendszám" formátumú szöveg (lásd lib/fuvarozas/vehicles.ts) — sosem üres, a lekérdezés ezt szűri. */
  jarmu: string;
  felrako: string | null;
  lerako: string;
  /** ISO dátum (YYYY-MM-DD) — a felrakás napja. */
  datum: string;
  /** ISO dátum (YYYY-MM-DD), ha a lerakás más napra esik. */
  lerakas_datum: string | null;
};

export type ApproveFuvarInput = {
  id: string;
  tipus: FuvarTipus;
  datum: string;
  /** ISO dátum (YYYY-MM-DD) — csak akkor add meg, ha a lerakás más napra esik, mint a felrakás. */
  lerakasDatum?: string;
  idopont?: string;
  felrako: string;
  lerako: string;
  megrendelo?: string;
  aru?: string;
  mennyiseg?: string;
  suly?: string;
  jarmu?: string;
  sofor?: string;
  alvallalkozo?: string;
  fuvardij?: number;
  fuvardijPenznem?: FuvardijPenznem;
  koltseg?: number;
  megjegyzes?: string;
  pozicioszam?: string;
  pozicioszamNincs?: boolean;
  postazasiCim?: string;
};

/**
 * Egy fuvar a Megbízások "Kimutatás" füléhez — jármű/hét/hónap szerinti
 * csoportosításhoz a kliensen (ezért nyers, YYYY-MM-DD dátummal, nem a
 * FuvarRow "mon. DD" formázott mezőjével), csak a kimutatáshoz szükséges
 * mezőkkel.
 */
export type KimutatasJarmuSor = {
  id: string;
  tipus: FuvarTipus;
  /** ISO dátum (YYYY-MM-DD). */
  datum: string;
  jarmu: string | null;
  megrendelo: string | null;
  felrako: string | null;
  lerako: string;
  fuvardij: number | null;
  fuvardij_penznem: FuvardijPenznem;
};

/**
 * Egy fuvar a jármű-ütközés (kettős beosztás) kereséshez — csak a
 * jármű-hozzárendeléshez és a dátumtartományhoz szükséges mezőkkel. Két
 * fuvar akkor "ütközik", ha ugyanahhoz a járműhöz tartoznak, és a
 * [datum, lerakas_datum] dátumtartományuk átfedi egymást — egy kocsi
 * fizikailag nem lehet egyszerre két helyen.
 */
export type UtkozesJelolt = {
  id: string;
  jarmu: string | null;
  sofor: string | null;
  /** ISO dátum (YYYY-MM-DD) — a felrakás napja. */
  datum: string;
  /** ISO dátum (YYYY-MM-DD), ha a lerakás más napra esik. */
  lerakas_datum: string | null;
  felrako: string | null;
  lerako: string;
  megrendelo: string | null;
};
