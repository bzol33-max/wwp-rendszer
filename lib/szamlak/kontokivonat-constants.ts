// Típusok a Kontókivonat-párosításhoz — külön fájlban, mert a "use server"
// fájlok (lib/szamlak/kontokivonat.ts) kizárólag async függvényeket
// exportálhatnak. Lásd szamla-constants.ts mintáját.

export type KivonatTranzakcio = {
  /** Értéknap, "YYYY-MM-DD" formátumban. */
  datum: string;
  partnerNev: string;
  penznem: string;
  osszeg: number;
  /** A "Közlemény" oszlop tartalma, ha van (gyakran üres). */
  memo: string | null;
  /** A "Partner neve" cella első sora (pl. "+IZV 00761432762") — a UI-nak egyedi kulcsként hasznos. */
  azonosito: string;
};

export type KivonatMatchMod = "memo" | "osszeg";
export type KivonatAllapot = "auto" | "review";

export type KivonatSzamlaJelolt = {
  id: string;
  szamlaszam: string;
  brutto: number;
};

export type KivonatParositas = {
  tranzakcio: KivonatTranzakcio;
  allapot: KivonatAllapot;
  mod: KivonatMatchMod | null;
  szamlak: KivonatSzamlaJelolt[];
  megjegyzes: string | null;
};

export type KivonatEredmeny = {
  fajlNev: string;
  /** Az összes adatsor a feltöltött fájlban (bevétel + kiadás + kártya együtt). */
  tranzakcioSzam: number;
  datumtol: string | null;
  datumig: string | null;
  /** Csak a vevői befizetésnek tűnő (bevétel, nem kártyás) tételek — auto vagy review. */
  parositasok: KivonatParositas[];
  kihagyottKiadas: number;
  kihagyottKartya: number;
};
