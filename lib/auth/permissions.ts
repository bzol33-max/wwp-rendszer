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
  | "attekintes";

export const MODULES: { key: ModuleKey; label: string }[] = [
  { key: "info", label: "Info (kezdőlap)" },
  { key: "fuvarozas", label: "Fuvarozás" },
  { key: "keszlet", label: "Készlet" },
  { key: "szamlak", label: "Számlák" },
  { key: "dolgozok", label: "Dolgozók" },
  { key: "jelenlet", label: "Jelenléti/üzenőfal" },
  { key: "jarmuvek", label: "Járművek" },
  { key: "beallitasok", label: "Beállítások (típusok és árak)" },
  { key: "mobil", label: "Mobil összefoglaló (önálló, korlátozott nézet)" },
  { key: "posta", label: "Posta (bér fuvarok postázása — önálló, korlátozott nézet)" },
  { key: "erkezes", label: "Saját érkezés (dolgozói mobil nézet)" },
  {
    key: "keszlet_sajat",
    label: "Saját készlet (Szakoly/Balkány — dolgozói mobil nézet, az /erkezes Készlet csempéje)",
  },
  { key: "attekintes", label: "Áttekintés (vezetői csempés nézet — önálló, korlátozott nézet)" },
];

/** Modulok, amik utólag, opt-in jelleggel lettek bevezetve — ld. resolvePermission. */
const OPT_IN_MODULES: ModuleKey[] = ["mobil", "posta", "erkezes", "keszlet_sajat", "attekintes"];

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
