// Típusok/konstansok a Számlák modulhoz — külön fájlban, mert a "use server"
// fájlok (lib/szamlak/actions.ts) kizárólag async függvényeket exportálhatnak.

export type SzamlaKategoria = "fuvar" | "raklap";
export type SzamlaAlkategoria = "fabrika" | "keter" | "egyeb";

export const KATEGORIA_LABEL: Record<SzamlaKategoria, string> = {
  fuvar: "Fuvar",
  raklap: "Raklap",
};

export const ALKATEGORIA_LABEL: Record<SzamlaAlkategoria, string> = {
  fabrika: "Fabrika",
  keter: "Keter",
  egyeb: "Egyéb",
};

export type SzamlaRow = {
  id: string;
  szamlaszam: string;
  vevo_nev: string;
  rendelesszam: string | null;
  fizmod: string | null;
  penznem: string;
  /** formázva: "2026.09.03." */
  teljesites_datum: string | null;
  kiallitas_datum: string;
  fizetesi_hatarido: string | null;
  netto: number | null;
  afa: number | null;
  brutto: number;
  kategoria: SzamlaKategoria;
  alkategoria: SzamlaAlkategoria | null;
  tetelek_szoveg: string | null;
  fizetve: boolean;
  fizetve_datum: string | null;
  lekerdezve_at: string;
};

export type SzamlaOsszesitoSor = {
  kategoria: SzamlaKategoria;
  alkategoria: SzamlaAlkategoria | null;
  penznem: string;
  nyitott_osszeg: number;
  lejart_osszeg: number;
  nyitott_darab: number;
  lejart_darab: number;
};

/** Egy hónap Fuvar/Raklap bontású bevétele (kiállítás dátuma szerint, csak HUF) a fejléc-diagramhoz. */
export type SzamlaHaviBevetelSor = {
  /** 1-12. */
  honap: number;
  fuvar: number;
  raklap: number;
  osszes: number;
};

/** A fejléc-diagram alatti 6 statisztika-csempéhez — csak HUF, a folyó évre. */
export type SzamlaKiemeltStatisztika = {
  lejartOsszegHuf: number;
  lejartDarabHuf: number;
  evesYtdHuf: number;
  /** A lezárt (a folyó hónap nélküli) hónapok átlaga. */
  haviAtlagHuf: number;
  /** null, ha még nincs egyetlen teljes hónap sem az évben. */
  csucsHonap: number | null;
  csucsHonapOsszegHuf: number;
  /** Az utolsó lezárt hónap változása az azt megelőzőhöz képest, %-ban; null, ha nincs két lezárt hónap. */
  novekedesSzazalek: number | null;
  legnagyobbNyitottVevo: string | null;
  legnagyobbNyitottVevoOsszegHuf: number;
};
