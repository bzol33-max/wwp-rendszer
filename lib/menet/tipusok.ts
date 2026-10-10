// Menetterv — közös típusok (tiszta, kliens és szerver is importálhatja).
// Lásd db/migrations/032_menetterv.sql és lib/menet/menet-alap.ts.

export type MenetAllapot = "javaslat" | "jovahagyott" | "folyamatban" | "lezart";

export type FeladatTipus = "sajat_aru" | "berfuvar" | "ures_pozicionalas" | "telephelyi_rakodas" | "varakozas";

export type KmForras = "hugo" | "becsles";

export type FigyelmeztetesKod = "ures_indulas" | "kapacitas" | "utkozes" | "hianyzo_cim";

export type Figyelmeztetes = { kod: FigyelmeztetesKod; szoveg: string };

/** A sorrendet a nézetek ennél az állapotnál követik (a 'javaslat' csak terv). */
export const JOVAHAGYOTT_ALLAPOTOK: readonly MenetAllapot[] = ["jovahagyott", "folyamatban", "lezart"];

export const FELADAT_TIPUS_CIMKE: Record<FeladatTipus, string> = {
  berfuvar: "bérfuvar",
  sajat_aru: "saját áru",
  ures_pozicionalas: "üres pozicionálás",
  telephelyi_rakodas: "telephelyi rakodás",
  varakozas: "várakozás",
};

export const MENET_ALLAPOT_CIMKE: Record<MenetAllapot, string> = {
  javaslat: "Javaslat",
  jovahagyott: "Jóváhagyva",
  folyamatban: "Folyamatban",
  lezart: "Lezárva",
};

export type Pont = { lat: number; lon: number };

/** Egy hely: cím (ahogy a megbízáson áll), ha ismert, koordináta és saját telephely-pont. */
export type Hely = { cim: string | null; pont: Pont | null; telephelyPontId?: string | null };

/** Egy saját telephely-pont (telephely_pont). */
export type TelephelyPontAdat = { id: string; nev: string; cim: string; pont: Pont | null };

/** Két hely közti közúti km, és honnan tudjuk (HU-GO vagy légvonal × 1,3). null: nem helyezhető el. */
export type TavEredmeny = { km: number; forras: KmForras };
export type TavFn = (honnan: Hely, hova: Hely) => Promise<TavEredmeny | null>;

/** Egy megbízás a menet-számításhoz (egy kocsi, egy nap). */
export type MenetMunka = {
  id: string;
  /** 'ber' = bérfuvar, 'sajat' = saját (a `tipus` oszlop fordított — azt NE használd). */
  jelleg: "ber" | "sajat";
  felrakasNap: string | null;
  lerakasNap: string | null;
  felrako: Hely;
  lerako: Hely;
  /** Kiírt terv-idő (ms): a felrakási ablak kezdete vagy az időpont-mező (tervIdoMegbizasbol). */
  tervIdo: number | null;
  /** A felrakási ablak vége (ms), ha van. */
  felrakasAblakIg?: number | null;
  /** A lerakási ablak (ms), ha van. */
  lerakasAblakTol?: number | null;
  lerakasAblakIg?: number | null;
  /** Tény (ms): a legkorábbi GPS-érkezés / sofőr-jelölés. */
  tenyIdo?: number | null;
  lezart?: boolean;
  /** A tárolt HU-GO rakott km (rakott-km.ts), ha van. */
  rakottKm: number | null;
  /** Raklap darab és raklaphely a mennyiség-mezőből (ha kiolvasható). */
  raklapDb: number | null;
  raklaphely?: number | null;
};

export type PotkocsiKapacitas = {
  raklaphelyNormal: number | null;
  raklaphelyForgatott: number | null;
  raklapDbNormal: number | null;
  raklapDbForgatott: number | null;
};

export type MenetBeallitas = {
  uresIndulasFigyelmeztetesKm: number;
  felrakasRahagyasPerc: number;
  lerakasRahagyasPerc: number;
  /** Átlagsebesség a tervezett időkhöz (km/h). */
  atlagSebessegKmh: number;
  /**
   * A nap kezdete (perc éjféltől, budapesti idő) — innen indul az idő-lánc,
   * ha egyik megállónak sincs időablaka, és ennél korábban nem indul a kocsi,
   * ha az első időzített megálló előtt más feladat is van. Alapból 360 (06:00,
   * fuvar_beallitas 'nap_kezdes_ido').
   */
  napKezdesPerc?: number;
};

/** A menet egészére szóló (kártya-szintű) figyelmeztetés — nem egy feladaté. */
export type MenetFigyelmeztetes = { kod: "vezetesi_ido"; szoveg: string };

/** Egy kiszámolt (még nem mentett) feladat. */
export type FeladatJavaslat = {
  sorszam: number;
  feladatTipus: FeladatTipus;
  megbizasId: string | null;
  kiinduloCim: string | null;
  celCim: string | null;
  kiinduloTelephelyPontId: string | null;
  celTelephelyPontId: string | null;
  tervezettIndulas: number | null;
  tervezettErkezes: number | null;
  uresKm: number | null;
  rakottKm: number | null;
  kmForras: KmForras | null;
  raklapDb: number | null;
  figyelmeztetesek: Figyelmeztetes[];
};

/** Egy mentett feladat (menet_feladat sor) — a felületnek és a tiszta ellenőrzéseknek. */
export type MenetFeladat = Omit<FeladatJavaslat, "tervezettIndulas" | "tervezettErkezes"> & {
  id: string;
  tervezettIndulas: string | null;
  tervezettErkezes: string | null;
  lezarvaAt: string | null;
  /** A megbízás megjelenítéshez (partner, hivatkozás) — csak olvasáskor. */
  partner?: string | null;
  hivatkozas?: string | null;
};

export type MenetEsemeny = { id: string; esemeny: string; verzio: number | null; ki: string | null; mikor: string; ok: string | null; reszletek: Record<string, unknown> };

export type Menet = {
  id: string;
  jarmuId: string;
  jarmuKod: string;
  nap: string;
  allapot: MenetAllapot;
  verzio: number;
  jovahagyta: string | null;
  jovahagyvaAt: string | null;
  modositvaAt: string | null;
  feladatok: MenetFeladat[];
};
