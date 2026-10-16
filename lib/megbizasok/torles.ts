// Egységes soft-delete a fuvar_megbizasok táblán (docs/ecofleet-telemetria-terv.md 4.):
// minden „törölt” állapotba tevés ugyanezt a SET-részt használja, ami a
// statusz='torolt' mellett a torolt_at-ot is kitölti (a 001-es
// fuvar_megbizasok_kettos_iras trigger is pótolná, de nem bízzuk rá).
// Tiszta (DB/Next-import nélküli) modul: a hívó a saját query/tx függvényével futtatja.
//
// Fizikai DELETE helyett ezt kell használni — a számlázott fuvar fizikai
// törlését a 042_szamlazott_fuvar_vedelem.sql trigger amúgy is tiltja.

/**
 * Az `update fuvar_megbizasok set …` SET-része a soft-delete-hez.
 * @param toroltByParam ha meg van adva (pl. "$2"), a torolt_by is ebből töltődik.
 * @param tovabbi további SET-elemek (pl. megjegyzés, dokumentum_url = null).
 */
export function torlesSet(toroltByParam?: string, tovabbi: string[] = []): string {
  return [
    "statusz = 'torolt'",
    "torolt_at = coalesce(torolt_at, now())",
    ...(toroltByParam ? [`torolt_by = ${toroltByParam}`] : []),
    ...tovabbi,
  ].join(", ");
}
