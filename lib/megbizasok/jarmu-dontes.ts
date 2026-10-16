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
  // Változatlan kocsi-szöveg mellett a meglévő (kézzel / „Kocsira adom”-mal
  // beállított) jarmu_id marad — más mező szerkesztése nem tehet át csendben
  // másik kocsira (QA #1, 2026-10-16).
  if (uj === norm(regiKocsi) && regiJarmuId !== null) return { jarmuId: regiJarmuId, figyelmeztetes: null };
  if (uj === "") return { jarmuId: null, figyelmeztetes: null };
  if (feloldott !== null) return { jarmuId: feloldott, figyelmeztetes: null };
  if (uj === norm(regiKocsi)) return { jarmuId: regiJarmuId, figyelmeztetes: null };
  return {
    jarmuId: null,
    figyelmeztetes: `A „${uj}” kocsi nem azonosítható a járművek között — a fuvar jármű nélkül maradt (rendszám ellenőrzése javasolt).`,
  };
}
