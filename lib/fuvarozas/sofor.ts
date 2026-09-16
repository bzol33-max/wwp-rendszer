"use server";

// Sofőr saját (dolgozói mobil) nézete — az /erkezes "Fuvarok" csempéje.
// Szándékosan NEM a flottaszintű Áttekintés Fuvar fület (lib/attekintes/
// actions.ts) használja: az minden saját járművet mutat egy vezetőnek,
// itt viszont EGY sofőr EGY aktuális fuvarjának állomásait kell
// megjeleníteni, kézzel jelölhető fel-/lerakási állapottal (lásd
// db/schema.sql fuvar_megallo_allapot) — ez a GPS-alapú, csak becslésre
// szolgáló "elhagyva" jelzéstől (lib/fuvarozas/idovonal.ts) független,
// explicit sofőri megerősítés.

import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { getFuvarok } from "@/lib/fuvarozas/megbizasok";
import { resolveJarmu, SAJAT_JARMUVEK, type SajatJarmu } from "@/lib/fuvarozas/vehicles";
import { bontsMegallokra, varosNev } from "@/lib/fuvarozas/varos";
import { toroljIdovonalCachet } from "@/lib/fuvarozas/idovonal-cache";
import type { FuvarRow } from "@/lib/fuvarozas/fuvar-constants";

function jarmuMatch(jarmu: SajatJarmu, row: FuvarRow): boolean {
  if (row.jarmu && resolveJarmu(row.jarmu) === jarmu) return true;
  if (row.sofor && row.sofor.trim().toLowerCase() === jarmu.sofor.toLowerCase()) return true;
  return false;
}

function budapestMaIso(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Budapest" });
}

/**
 * A SAJAT_JARMUVEK "sofor" mezője a rövid, keresztnévi alak ("Gergő",
 * "Micó") — a dolgozói bejelentkezés (users.employee_id -> alkalmazottak)
 * viszont a törzsadat TELJES nevét adja ("Vadon Gergő", "Takács Micó").
 * Ezért itt tartalmazás-egyezés kell a rövid alakra, nem pontos egyezés.
 */
function findJarmuByEmployeeName(employeeName: string): SajatJarmu | null {
  const norm = employeeName.trim().toLowerCase();
  return SAJAT_JARMUVEK.find((j) => norm.includes(j.sofor.toLowerCase())) ?? null;
}

export type SoforMegallo = {
  index: number;
  tipus: "felrako" | "lerako";
  varos: string;
  cim: string;
  datumIso: string | null;
  kesz: boolean;
  keszAt: string | null;
  keszBy: string | null;
};

export type SoforTura = {
  fuvarId: string;
  megrendelo: string | null;
  pozicioszam: string | null;
  aru: string | null;
  mennyiseg: string | null;
  dokumentumUrl: string | null;
  /** A fuvar teljes állomás-sorrendje — a felrakó + az összes lerakó állomás (lásd bontsMegallokra). */
  megallok: SoforMegallo[];
  /** Az első még nem kész megálló indexe a megallok tömbben — ez a képernyőn kiemelt "jelenlegi" megálló. Null, ha minden állomás kész. */
  aktualisIndex: number | null;
};

/**
 * A bejelentkezett sofőr aktuális fuvarja — a mai vagy legközelebbi
 * jövőbeli dátumú, még nyitott (nem "lezárva") fuvar, ha van ilyen,
 * egyébként a legkorábbi nyitott fuvar (ugyanaz a today-or-future-first
 * elv, mint az Áttekintés Fuvar kártyáján, lásd components/attekintes/
 * jarmu-kartya.tsx). Null, ha az alkalmazotthoz nincs saját jármű (lásd
 * findJarmuByEmployeeName), vagy nincs aktív fuvarja.
 */
export async function getSoforAktualisTura(employeeId: string): Promise<SoforTura | null> {
  const empRows = await query<{ name: string }>(`select name from alkalmazottak where id = $1`, [employeeId]);
  const employeeName = empRows[0]?.name;
  if (!employeeName) return null;
  const jarmu = findJarmuByEmployeeName(employeeName);
  if (!jarmu) return null;

  const [berTabRows, sajatTabRows] = await Promise.all([getFuvarok("sajat"), getFuvarok("ber")]);
  const aktiv = [...berTabRows, ...sajatTabRows]
    .filter((r) => r.statusz !== "lezarva")
    .filter((r) => jarmuMatch(jarmu, r))
    .sort((a, b) => a.datum_iso.localeCompare(b.datum_iso));

  if (aktiv.length === 0) return null;

  const ma = budapestMaIso();
  const aktualisak = aktiv.filter((r) => (r.lerakas_datum_iso ?? r.datum_iso) >= ma);
  const fuvar = aktualisak[0] ?? aktiv[0];

  const megallokRaw: { tipus: "felrako" | "lerako"; cim: string; datumIso: string | null }[] = [
    ...bontsMegallokra(fuvar.felrako).map((cim) => ({
      tipus: "felrako" as const,
      cim,
      datumIso: fuvar.datum_iso,
    })),
    ...bontsMegallokra(fuvar.lerako).map((cim) => ({
      tipus: "lerako" as const,
      cim,
      datumIso: fuvar.lerakas_datum_iso ?? fuvar.datum_iso,
    })),
  ];

  const allapotok = await query<{
    megallo_index: number;
    kesz: boolean;
    kesz_at: string | null;
    kesz_by: string | null;
  }>(`select megallo_index, kesz, kesz_at::text, kesz_by from fuvar_megallo_allapot where fuvar_id = $1`, [
    fuvar.id,
  ]);
  const allapotByIndex = new Map(allapotok.map((a) => [a.megallo_index, a]));

  const megallok: SoforMegallo[] = megallokRaw.map((m, index) => {
    const allapot = allapotByIndex.get(index);
    return {
      index,
      tipus: m.tipus,
      varos: varosNev(m.cim),
      cim: m.cim,
      datumIso: m.datumIso,
      kesz: allapot?.kesz ?? false,
      keszAt: allapot?.kesz_at ?? null,
      keszBy: allapot?.kesz_by ?? null,
    };
  });

  const aktualisIndex = megallok.find((m) => !m.kesz)?.index ?? null;

  return {
    fuvarId: fuvar.id,
    megrendelo: fuvar.megrendelo,
    pozicioszam: fuvar.pozicioszam,
    aru: fuvar.aru,
    mennyiseg: fuvar.mennyiseg,
    dokumentumUrl: fuvar.dokumentum_url,
    megallok,
    aktualisIndex,
  };
}

/** A sofőr megjelöli, hogy egy adott állomáson (felrakó/lerakó) végzett — kézi, időbélyeges megerősítés. */
export async function markMegalloKesz(fuvarId: string, megalloIndex: number, soforNev: string) {
  await query(
    `insert into fuvar_megallo_allapot (fuvar_id, megallo_index, kesz, kesz_at, kesz_by)
     values ($1, $2, true, now(), $3)
     on conflict (fuvar_id, megallo_index) do update set kesz = true, kesz_at = now(), kesz_by = $3`,
    [fuvarId, megalloIndex, soforNev]
  );
  // A GPS lap is ezt a jelölést mutatja (kézi kész) — a gyorsítótárazott idővonal frissüljön.
  toroljIdovonalCachet();
  revalidatePath("/erkezes");
}
