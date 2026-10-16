// Tiszta döntőfüggvény (DB/Next-import nélkül, tsx-ből tesztelhető):
// mi legyen a fuvar jarmu_id-ja a "Kocsi" szöveg szerkesztése után?
// docs/ecofleet-telemetria-terv.md 4. pont.

function norm(s: string | null): string {
  return (s ?? "").trim();
}

export function ujJarmuId(
  regiJarmuId: number | null,
  regiKocsi: string | null,
  ujKocsi: string | null,
  feloldott: number | null
): { jarmuId: number | null; figyelmeztetes: string | null } {
  const uj = norm(ujKocsi);
  if (uj === "") return { jarmuId: null, figyelmeztetes: null };
  if (feloldott !== null) return { jarmuId: feloldott, figyelmeztetes: null };
  if (uj === norm(regiKocsi)) return { jarmuId: regiJarmuId, figyelmeztetes: null };
  return {
    jarmuId: null,
    figyelmeztetes: `A „${uj}” kocsi nem azonosítható a járművek között — a fuvar jármű nélkül maradt (rendszám ellenőrzése javasolt).`,
  };
}
