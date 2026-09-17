// Típusok a Kontókivonat-párosításhoz — külön fájlban, mert a "use server"
// fájlok (lib/szamlak/kontokivonat.ts) kizárólag async függvényeket
// exportálhatnak. Lásd szamla-constants.ts mintáját.

export type KivonatTranzakcio = {
  /**
   * Egyedi kulcs a bankszámla + értéknap + összeg + partner-számlaszám +
   * közlemény alapján (egy fájlon belüli teljes egyezésnél sorszámmal
   * kiegészítve) — ez alapján ismerjük fel az újrafeltöltött, már
   * lekönyvelt utalást (kontokivonat_konyvelt tábla).
   */
  kulcs: string;
  /** Értéknap, "YYYY-MM-DD" formátumban. */
  datum: string;
  partnerNev: string;
  partnerSzamla: string;
  penznem: string;
  osszeg: number;
  /** A "Közlemény" oszlop tartalma, ha van. */
  memo: string | null;
  /** A "Tranzakció típusa" oszlop (a 2026 május előtti exportokban üres). */
  tipus: string;
};

export type KivonatMatchMod = "memo" | "osszeg" | "legregebbi";

/** A beolvasott fájl fajtája. */
export type KivonatForras = "unicredit-xlsx" | "cib-pdf";

/**
 * - auto: a közleményben szereplő nyitott számlák összege pontosan kiadja az
 *   utalást (vagy egyetlen, egyértelmű összeg-egyezés) — egy kattintással könyvelhető.
 * - review: van javaslat, de kézzel kell jóváhagyni (pl. összeg-eltérés).
 * - datum: a hozzá tartozó számla már fizetettként szerepel, de banki utalással
 *   még nem volt igazolva (pl. régi tömeges importból) — a fizetés dátuma az
 *   utalás értéknapjára pontosítható, és az utalás felíródik a könyveltek közé.
 * - konyvelt: ez az utalás (vagy a közleményben szereplő számla) már le van könyvelve.
 * - egyeb: nem vevői befizetésnek tűnik (nincs hozzá illő vevő / számla).
 */
export type KivonatAllapot = "auto" | "review" | "datum" | "konyvelt" | "egyeb";

export type KivonatSzamlaJelolt = {
  id: string;
  szamlaszam: string;
  brutto: number;
  fizetesiHatarido: string | null;
  /** Ha már fizetett: a jelenlegi fizetési dátum ("YYYY-MM-DD"). */
  fizetveDatum: string | null;
};

export type KivonatParositas = {
  tranzakcio: KivonatTranzakcio;
  allapot: KivonatAllapot;
  mod: KivonatMatchMod | null;
  /** A kártyán megjelenő számlák (javaslatok és egyéb lehetőségek). */
  szamlak: KivonatSzamlaJelolt[];
  /** Az előre bejelölt számlák (auto esetén ezek könyvelődnek). */
  kivalasztottIdk: string[];
  megjegyzes: string | null;
};

/** Egy beolvasott kivonatfájl összesítője. */
export type KivonatFajl = {
  fajlNev: string;
  forras: KivonatForras;
  /** Az összes adatsor a fájlban (bevétel + kiadás + kártya együtt). */
  tranzakcioSzam: number;
  bevetelSzam: number;
  datumtol: string | null;
  datumig: string | null;
  kihagyottKiadas: number;
  kihagyottKartya: number;
  kihagyottSajat: number;
};

/** Egy fájl beolvasásának eredménye (a párosítás külön lépés, több fájlra együtt). */
export type KivonatBeolvasottFajl = KivonatFajl & { tranzakciok: KivonatTranzakcio[] };

/** A könyveléshez a kliens által visszaküldött tétel. */
export type KivonatKonyvelesTetel = {
  tranzakcio: KivonatTranzakcio;
  szamlaIdk: string[];
};
