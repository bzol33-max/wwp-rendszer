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
  | "jarmuvek"
  | "beallitasok"
  | "mobil";

export const MODULES: { key: ModuleKey; label: string }[] = [
  { key: "info", label: "Info (kezdőlap)" },
  { key: "fuvarozas", label: "Fuvarozás" },
  { key: "keszlet", label: "Készlet" },
  { key: "szamlak", label: "Számlák" },
  { key: "dolgozok", label: "Dolgozók" },
  { key: "jarmuvek", label: "Járművek" },
  { key: "beallitasok", label: "Beállítások (típusok és árak)" },
  { key: "mobil", label: "Mobil összefoglaló (önálló, korlátozott nézet)" },
];

export type ModulePermission = { view: boolean; edit: boolean };
export type Permissions = Partial<Record<ModuleKey, ModulePermission>>;

// Hiányzó modulbejegyzés = alapértelmezetten teljes hozzáférés. Az admin
// felhasználó ettől függetlenül mindig mindent lát/szerkeszthet.
//
// A "mobil" modul kivétel: ez egy utólag bevezetett, szándékosan opt-in
// jog (ld. app/mobil/page.tsx), nem egy a többi modullal egyenrangú,
// eredettől fogva létező jogosultság. Ha a default-true szabályt rá is
// alkalmaznánk, minden, a modul bevezetése ELŐTT létrehozott felhasználó
// (akinek a permissions JSON-ja még nem tartalmaz "mobil" kulcsot)
// visszamenőleg megkapná ezt a jogot — a mobil nézeten keresztül pedig ez
// felülírná a Készlet/Fuvarozás modulra szándékosan beállított tiltásukat
// is. Ezért itt hiányzó bejegyzésnél false az alapértelmezés.
export function resolvePermission(
  role: string,
  permissions: Permissions | null | undefined,
  module: ModuleKey
): ModulePermission {
  if (role === "admin") return { view: true, edit: true };
  const p = permissions?.[module];
  if (module === "mobil") return { view: p?.view ?? false, edit: p?.edit ?? false };
  return { view: p?.view ?? true, edit: p?.edit ?? true };
}

export function isAdmin(role: string | undefined | null): boolean {
  return role === "admin";
}
