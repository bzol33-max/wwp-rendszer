// Fuvarozás 2 — feature flag (átállás-ellenőrzés B1).
//   FUVAROZAS_UJ=on    → a „Fuvarozás 2” megjelenik a menüben (E8 próba)
//   FUVAROZAS_REGI=off → a régi Fuvarozás eltűnik a menüből, a /fuvarozas
//                        az újra irányít (cutover). Visszakapcsolás: törlés.
// A /fuvarozas2 útvonal a flagtől függetlenül elérhető a jogosultaknak.
export function ujFuvarozasMenu(): boolean {
  return process.env.FUVAROZAS_UJ === "on" || process.env.FUVAROZAS_REGI === "off";
}
export function regiFuvarozasAktiv(): boolean {
  return process.env.FUVAROZAS_REGI !== "off";
}
