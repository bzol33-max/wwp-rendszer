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
  | "posta"
  | "erkezes"
  | "keszlet_sajat"
  | "attekintes"
  | "felvasarlas_mobil"
  | "fuvarozas_sajat"
  | "elolegek_sajat"
  | "elszamolas"
  | "rendszer";

export const MODULES: { key: ModuleKey; label: string }[] = [
  { key: "info", label: "Info (kezdőlap)" },
  { key: "fuvarozas", label: "Fuvarozás" },
  { key: "keszlet", label: "Készlet" },
  { key: "szamlak", label: "Számlák" },
  { key: "dolgozok", label: "Dolgozók" },
  { key: "jelenlet", label: "Jelenléti/üzenőfal" },
  { key: "jarmuvek", label: "Járművek" },
  { key: "beallitasok", label: "Beállítások (típusok és árak)" },
  { key: "posta", label: "Posta (bér fuvarok postázása — önálló, korlátozott nézet)" },
  { key: "erkezes", label: "Saját érkezés (dolgozói mobil nézet)" },
  {
    key: "keszlet_sajat",
    label: "Saját készlet (Szakoly/Balkány — dolgozói mobil nézet, az /erkezes Készlet csempéje)",
  },
  { key: "attekintes", label: "Áttekintés (vezetői csempés nézet — önálló, korlátozott nézet)" },
  {
    key: "felvasarlas_mobil",
    label: "Felvásárlás mobil rögzítés (önálló, korlátozott nézet — /felvasarlas)",
  },
  {
    key: "fuvarozas_sajat",
    label: "Saját fuvarok (sofőr — dolgozói mobil nézet, az /erkezes Fuvarok csempéje)",
  },
  {
    key: "elolegek_sajat",
    label: "Saját előlegek megtekintése/elfogadása (dolgozói mobil nézet, az /erkezes Profil csempéje)",
  },
  // Fuvarozás 2 (2026-09-19, átállás-ellenőrzés B8/E3): hatókör-kulcsok.
  // A "fuvarozas" a teljes modul (díj + GPS-részlet + minden fül); az
  // "elszamolas" csak az Elszámolás fül (díj IGEN, GPS-részlet NEM — S16);
  // a "rendszer" a Rendszer-egészség csempe (figyelők, keretek, hibák).
  {
    key: "elszamolas",
    label: "Elszámolás (Fuvarozás — számlázható/számlázva/e-mail/posta; díjjal, GPS-részlet nélkül)",
  },
  { key: "rendszer", label: "Rendszer-egészség (Fuvarozás — figyelők, keretek, hibák)" },
];

export type ModulePermission = { view: boolean; edit: boolean };
export type Permissions = Partial<Record<ModuleKey, ModulePermission>>;

// Az admin felhasználó mindig mindent lát/szerkeszthet. Mindenki más csak
// azt, amit a permissions JSON-ja kifejezetten megad.
export function resolvePermission(
  role: string,
  permissions: Permissions | null | undefined,
  module: ModuleKey
): ModulePermission {
  if (role === "admin") return { view: true, edit: true };
  const p = permissions?.[module];
  // 2026-10-04-től MINDEN modulnál hiányzó bejegyzés = nincs hozzáférés
  // (audit SEC-12) — a meglévő felhasználók jogait a 021-es migráció
  // kifejezetten beírta, így ez senkinek nem vett el semmit; egy jövőbeli
  // modul viszont már nem nyílik meg magától mindenkinek.
  return { view: p?.view ?? false, edit: p?.edit ?? false };
}

export function isAdmin(role: string | undefined | null): boolean {
  return role === "admin";
}
