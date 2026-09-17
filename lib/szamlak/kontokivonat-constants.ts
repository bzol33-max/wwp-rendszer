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

/**
 * - auto: a közleményben szereplő nyitott számlák összege pontosan kiadja az
 *   utalást (vagy egyetlen, egyértelmű összeg-egyezés) — egy kattintással könyvelhető.
 * - review: van javaslat, de kézzel kell jóváhagyni (pl. összeg-eltérés).
 * - konyvelt: ez az utalás (vagy a közleményben szereplő számla) már le van könyvelve.
 * - egyeb: nem vevői befizetésnek tűnik (nincs hozzá illő vevő / számla).
 */
export type KivonatAllapot = "auto" | "review" | "konyvelt" | "egyeb";

export type KivonatSzamlaJelolt = {
  id: string;
  szamlaszam: string;
  brutto: number;
  fizetesiHatarido: string | null;
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

export type KivonatEredmeny = {
  fajlNev: string;
  /** Az összes adatsor a feltöltött fájlban (bevétel + kiadás + kártya együtt). */
  tranzakcioSzam: number;
  datumtol: string | null;
  datumig: string | null;
  /** Csak a bevételi (pozitív, nem kártyás) tételek. */
  parositasok: KivonatParositas[];
  kihagyottKiadas: number;
  kihagyottKartya: number;
};

/** A könyveléshez a kliens által visszaküldött tétel. */
export type KivonatKonyvelesTetel = {
  tranzakcio: KivonatTranzakcio;
  szamlaIdk: string[];
};
