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
  | "attekintes"
  | "fuvarozas_sajat";

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
  { key: "attekintes", label: "Áttekintés (vezetői csempés nézet — önálló, korlátozott nézet)" },
  {
    key: "fuvarozas_sajat",
    label: "Saját fuvarok (sofőr — dolgozói mobil nézet, az /erkezes Fuvarok csempéje)",
  },
];

/** Modulok, amik utólag, opt-in jelleggel lettek bevezetve — ld. resolvePermission. */
const OPT_IN_MODULES: ModuleKey[] = [
  "mobil",
  "posta",
  "attekintes",
  "fuvarozas_sajat",
];

// Hatókör: a jog MEKKORA részére a modulnak érvényes. A hiányzó scope a
// teljes hatókört jelenti — így minden korábbi, csak {view, edit} alakú
// bejegyzés érvényes marad, nem kellett egyszerre mindent átírni.
//
//   "sajat"              — csak a bejelentkezett felhasználóhoz tartozó
//                          alkalmazott sorai (pl. a saját jelenléte)
//   { sites: [...] }     — csak a felsorolt telephelyek
//
// Az eszköz (mobil / asztali) NEM hatókör: ugyanaz a jog jelenik meg
// máshogy elrendezve. Korábban ez össze volt keverve — a "keszlet_sajat",
// "felvasarlas_mobil", "elolegek_sajat" és "erkezes" kulcsok valójában
// hatókörrel szűkített modul-jogok voltak, külön kulcsnak álcázva.
export type ModuleScope = "sajat" | { sites: string[] };

export type ModulePermission = {
  view: boolean;
  edit: boolean;
  /** Hiányzó scope = teljes hatókör. */
  scope?: ModuleScope;
};

/** Teljes hatókörű-e a jog (nincs szűkítés). */
export function teljesHatokor(p: ModulePermission): boolean {
  return p.scope === undefined;
}

/** Csak a saját alkalmazott-sorokra érvényes-e. */
export function sajatHatokor(p: ModulePermission): boolean {
  return p.scope === "sajat";
}

/** Engedi-e a hatókör ezt a telephelyet. */
export function hatokorEngedTelephelyet(p: ModulePermission, site: string): boolean {
  if (p.scope === undefined) return true;
  if (p.scope === "sajat") return false;
  return p.scope.sites.includes(site);
}

/** A hatókör által engedett telephelyek, vagy null, ha nincs szűkítés. */
export function hatokorTelephelyei(p: ModulePermission): string[] | null {
  if (p.scope === undefined || p.scope === "sajat") return null;
  return p.scope.sites;
}
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
    return { view: p?.view ?? false, edit: p?.edit ?? false, scope: p?.scope };
  }
  return { view: p?.view ?? true, edit: p?.edit ?? true, scope: p?.scope };
}

export function isAdmin(role: string | undefined | null): boolean {
  return role === "admin";
}
