// Tiszta döntőfüggvény (DB/Next-import nélkül, tsx-ből tesztelhető):
// mehet-e a kalibrációs szorzó a 24 órás gyorsítótárba?
// Csak akkor, ha jött legalább egy minta ÉS egyik Ecofleet-hívás sem hibázott —
// különben egy átmeneti hiba egy napra "beégetné" a tartalék-szorzót.
// docs/ecofleet-telemetria-terv.md 4. pont.

export function kalibracioGyorsitotarazhato(mintaDb: number, voltHiba: boolean): boolean {
  return mintaDb > 0 && !voltHiba;
}
