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
  /** A banki utalásokból eddig igazolt, beérkezett rész (részfizetés) — 0, ha nincs ilyen. */
  fizetett_osszeg: number;
  lekerdezve_at: string;
};

/**
 * A számlából még ki nem fizetett rész. Részfizetésnél (egy számlát két-három
 * utalásban rendeznek) a nyitott listák és összesítők ezzel számolnak, nem a
 * teljes bruttóval. A pg a numeric oszlopokat stringként adja — innen a Number().
 */
export function szamlaHatralek(row: Pick<SzamlaRow, "brutto" | "fizetve" | "fizetett_osszeg">): number {
  if (row.fizetve) return 0;
  return Number(row.brutto) - Number(row.fizetett_osszeg ?? 0);
}

/** Részben fizetett: jött rá banki utalás, de még nem futotta a teljes összeget. */
export function reszbenFizetve(row: Pick<SzamlaRow, "fizetve" | "fizetett_osszeg">): boolean {
  return !row.fizetve && Number(row.fizetett_osszeg ?? 0) > 0;
}

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

/** A Bevétel fül mappái: Fuvar, és a Raklap alkategóriái. */
export type SzamlaBevetelMappa = "fuvar" | "fabrika" | "keter" | "egyeb";

export const SZAMLA_BEVETEL_MAPPAK: SzamlaBevetelMappa[] = ["fuvar", "fabrika", "keter", "egyeb"];

export type SzamlaBevetelHonap = {
  /** 1-12. */
  honap: number;
  /** Számlázott HUF mappánként (kiállítás dátuma szerint). */
  mappak: Record<SzamlaBevetelMappa, number>;
  osszes: number;
  /** A hónapban kifizetett (fizetve_datum szerint) HUF számlák összege. */
  befolyt: number;
};

export type SzamlaBevetelEur = {
  mappa: SzamlaBevetelMappa;
  osszeg: number;
  darab: number;
};

export type SzamlaBevetelVevo = {
  vevo_nev: string;
  elso_datum: string;
  utolso_datum: string;
  /** Az eddigi (HUF) számlák összege. */
  osszeg: number;
  /** Az eddigi (HUF) számlák darabszáma. */
  darab: number;
};

/** A Számlák · Bevétel fül adatai — a folyó évre, csak HUF (az EUR külön). */
export type SzamlaBevetelAttekintes = {
  ev: number;
  /** Az 1..folyó hónap sorai. */
  honapok: SzamlaBevetelHonap[];
  ytdOsszes: number;
  ytdFuvar: number;
  ytdRaklap: number;
  ytdMappak: Record<SzamlaBevetelMappa, number>;
  ytdBefolyt: number;
  /** Fabrika+Keter a számlázott YTD %-ában; null, ha nincs számlázott összeg. */
  fabrikaKeterSzazalek: number | null;
  eur: SzamlaBevetelEur[];
  /** Kifizetettnek jelölt, de fizetési dátum nélküli számlák (a befolyt hónapokba nem kerülnek). */
  datumNelkuliKifizetett: number;
  ujVevok: SzamlaBevetelVevo[];
  elmaradoVevok: SzamlaBevetelVevo[];
};

/** A diagram alatti statisztika-sorhoz — csak HUF, a folyó évre. */
export type SzamlaKiemeltStatisztika = {
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

/** Egy találat a kereső javaslatai közül — számla. */
export type SzamlaTalalat = {
  id: string;
  szamlaszam: string;
  vevo_nev: string;
  brutto: number;
  fizetett_osszeg: number;
  penznem: string;
  fizetve: boolean;
  fizetesi_hatarido: string | null;
};

/** Egy találat a kereső javaslatai közül — vevő (a nyitott tételeivel). */
export type VevoTalalat = {
  vevo_nev: string;
  nyitott_darab: number;
  nyitott_osszeg: number;
  penznem: string;
};

/** A kereső legördülőjének tartalma: néhány számla és néhány vevő. */
export type KeresesJavaslatok = {
  szamlak: SzamlaTalalat[];
  vevok: VevoTalalat[];
  /** Összesen ennyi számla illik a keresésre (a legördülő csak az elejét mutatja). */
  szamlaOsszes: number;
};
