// Modulonkénti jogosultság-modell. Nem "use server" / nem "server-only" —
// ezt a fájlt kliens komponensek is importálják (pl. az oldalsáv-szűréshez
// és a szerkesztés-tiltó UI-hoz), ezért csak sima típusokat és tiszta
// függvényeket tartalmazhat, adatbázis-hívást soha.

export type ModuleKey =
  | "info"
  | "fuvarozas"
  | "keszlet"
  | "szamlak"
  | "dolgozok"
  | "jelenlet"
  | "jarmuvek"
  | "beallitasok"
  | "mobil"
  | "posta"
  | "erkezes"
  | "keszlet_sajat"
  | "attekintes"
  | "felvasarlas_mobil"
  | "fuvarozas_sajat"
  | "elolegek_sajat";

// A jogosultság-admin felület (Beállítások → Felhasználók) két csoportban
// jeleníti meg a modulokat: a teljes értékű asztali modulok, illetve az
// önálló, korlátozott mobil nézetek. A mobil nézeteknél a `hint` mondja
// meg, melyik URL-t / felületet kapcsolja be az adott jog.
export type ModuleGroup = "asztali" | "mobil";

export const MODULE_GROUPS: { key: ModuleGroup; label: string; description?: string }[] = [
  {
    key: "asztali",
    label: "Asztali modulok",
    description: "A bal oldali menüből elérhető, teljes értékű modulok.",
  },
  {
    key: "mobil",
    label: "Mobil nézetek (önálló, korlátozott felületek)",
    description:
      "Külön URL-en élő, szűkített felületek. Alapértelmezetten tiltottak — csak akkor kapcsolódnak be, ha itt kipipálod.",
  },
];

export type ModuleInfo = {
  key: ModuleKey;
  label: string;
  group: ModuleGroup;
  /** Rövid magyarázat: melyik URL-t / felületet kapcsolja be ez a jog. */
  hint?: string;
};

export const MODULES: ModuleInfo[] = [
  { key: "info", label: "Info (kezdőlap)", group: "asztali" },
  { key: "fuvarozas", label: "Fuvarozás", group: "asztali" },
  { key: "keszlet", label: "Készlet", group: "asztali" },
  { key: "szamlak", label: "Számlák", group: "asztali" },
  { key: "dolgozok", label: "Dolgozók", group: "asztali" },
  { key: "jelenlet", label: "Jelenléti/üzenőfal", group: "asztali" },
  { key: "jarmuvek", label: "Járművek", group: "asztali" },
  { key: "beallitasok", label: "Beállítások (típusok és árak)", group: "asztali" },
  {
    key: "mobil",
    label: "Mobil összefoglaló",
    group: "mobil",
    hint: "/mobil — összefoglaló csempés nézet",
  },
  {
    key: "posta",
    label: "Posta",
    group: "mobil",
    hint: "/posta — bér fuvarok postázása",
  },
  {
    key: "erkezes",
    label: "Saját érkezés",
    group: "mobil",
    hint: "/erkezes — dolgozói napi érkezés/távozás és feladatok",
  },
  {
    key: "keszlet_sajat",
    label: "Saját készlet",
    group: "mobil",
    hint: "/erkezes → Készlet csempe (Szakoly/Balkány)",
  },
  {
    key: "attekintes",
    label: "Áttekintés",
    group: "mobil",
    hint: "/attekintes — vezetői csempés nézet",
  },
  {
    key: "felvasarlas_mobil",
    label: "Felvásárlás mobil rögzítés",
    group: "mobil",
    hint: "/felvasarlas — felvásárlás rögzítése telefonról",
  },
  {
    key: "fuvarozas_sajat",
    label: "Saját fuvarok",
    group: "mobil",
    hint: "/erkezes → Fuvarok csempe (sofőr saját fuvarjai)",
  },
  {
    key: "elolegek_sajat",
    label: "Saját előlegek",
    group: "mobil",
    hint: "/erkezes → Profil csempe (előlegek megtekintése/elfogadása)",
  },
];

/**
 * Modulok, amik utólag, opt-in jelleggel lettek bevezetve — ld. resolvePermission.
 * Pontosan a "mobil" csoport tagjai, ezért a listát onnan származtatjuk, hogy a
 * kettő ne tudjon szétcsúszni egymástól.
 */
const OPT_IN_MODULES: ModuleKey[] = MODULES.filter((m) => m.group === "mobil").map(
  (m) => m.key
);

export type ModulePermission = { view: boolean; edit: boolean };
export type Permissions = Partial<Record<ModuleKey, ModulePermission>>;

// Hiányzó modulbejegyzés = alapértelmezetten teljes hozzáférés. Az admin
// felhasználó ettől függetlenül mindig mindent lát/szerkeszthet.
//
// Az OPT_IN_MODULES tagjai (pl. "mobil", "posta", "erkezes") kivételek:
// ezek utólag bevezetett, szándékosan opt-in jogok (ld. app/mobil/page.tsx,
// app/posta/page.tsx, app/erkezes/page.tsx), nem a többi modullal
// egyenrangú, eredettől fogva létező jogosultságok. Ha a default-true
// szabályt rájuk is alkalmaznánk, minden, a modul bevezetése ELŐTT
// létrehozott felhasználó (akinek a permissions JSON-ja még nem
// tartalmazza az adott kulcsot) visszamenőleg megkapná ezt a jogot — az
// önálló nézeteken keresztül pedig ez felülírná a teljes modulra
// szándékosan beállított tiltásukat is. Ezért itt hiányzó bejegyzésnél
// false az alapértelmezés.
export function resolvePermission(
  role: string,
  permissions: Permissions | null | undefined,
  module: ModuleKey
): ModulePermission {
  if (role === "admin") return { view: true, edit: true };
  const p = permissions?.[module];
  if (OPT_IN_MODULES.includes(module)) {
    return { view: p?.view ?? false, edit: p?.edit ?? false };
  }
  return { view: p?.view ?? true, edit: p?.edit ?? true };
}

export function isAdmin(role: string | undefined | null): boolean {
  return role === "admin";
}
