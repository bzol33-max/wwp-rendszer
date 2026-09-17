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
import { requireAnyEditPermission, requireSajatVagyModulJog } from "@/lib/auth/require-permission";
import { requireSession } from "@/lib/auth/dal";
import { getIdovonalak } from "@/lib/fuvarozas/actions";
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
  // Szó szerinti egyezés, nem puszta tartalmazás: a "Gergő" ne illeszkedjen
  // egy "Gergőkúti" vezetéknévre. Ha több jármű is illeszkedne (két azonos
  // keresztnevű sofőr), inkább egyiket sem adjuk vissza — a rossz kocsi
  // idővonala rosszabb, mint az üres képernyő.
  const szavak = new Set(norm.split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  const talalatok = SAJAT_JARMUVEK.filter((j) => szavak.has(j.sofor.toLowerCase()));
  return talalatok.length === 1 ? talalatok[0] : null;
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
  // Az employeeId a kliensről érkezik, ezért nem elég a modul-jog: azt is meg
  // kell követelni, hogy a SAJÁT sorát kérje (lásd requireSajatVagyModulJog).
  await requireSajatVagyModulJog({
    employeeId,
    sajatModule: "fuvarozas_sajat",
    modul: "fuvarozas",
    kind: "view",
  });
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

/**
 * A sofőr megjelöli, hogy egy adott állomáson (felrakó/lerakó) végzett —
 * kézi, időbélyeges megerősítés. A jelölő nevét a MUNKAMENETBŐL vesszük, nem
 * a kliens által küldött szövegből, hogy a napló ne legyen hamisítható.
 */
export async function markMegalloKesz(fuvarId: string, megalloIndex: number) {
  await requireAnyEditPermission(["fuvarozas", "fuvarozas_sajat"]);
  const soforNev = (await requireSession()).name;
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

// ---------------------------------------------------------------------------
// A sofőr TELJES napja (2026-09-17) — a getSoforAktualisTura egyetlen fuvart
// mutat, ami a Duvenbeck-napokon kevés: egy kocsin 2-3 fuvar van (Pápa ↔
// Debrecen ingázás), a másodikat a sofőr nem látta.
//
// FONTOS: ez a nézet NEM külön logikából számol, hanem a GPS lap
// idővonalából (lib/fuvarozas/actions.ts getIdovonalak) veszi a fuvaronkénti
// blokkokat, és csak a sofőrnek szóló mezőkkel bővíti (időablak,
// Reise ID, súly, iratok). Így a sofőr ugyanazt a sorrendet és ugyanazt a
// kész/nem kész állapotot látja, mint a diszpécser — két külön számítás
// előbb-utóbb elcsúszna egymástól. A getIdovonalak gyorsítótárazott, tehát
// ez nem jelent plusz külső hívást.
//
// Ami szándékosan NEM megy ki a telefonra: fuvardíj, költség, eredmény,
// számla. A rakodáshoz nem kell, a telefon viszont elveszhet. Ugyanezért nem
// látja a sofőr a kocsi nélküli (elakadt) megbízásokat sem — azok a
// diszpécser GPS-oldalán maradnak.
// ---------------------------------------------------------------------------

export type SoforMegalloSor = {
  fuvarId: string;
  megalloIndex: number;
  tipus: "felrako" | "lerako";
  varos: string;
  /** A megálló teljes címe — két azonos városú megállót csak ez különböztet meg. */
  cim: string;
  /** Tényleges (GPS szerinti) megérkezés, ha volt, egyébként a becsült időpont. */
  idopont: Date;
  /** Igaz, ha az `idopont` csak a statikus menetrend és már a múltba esik — a felület ilyenkor nem mutat órát. */
  becslesElavult: boolean;
  /** A megbízás időablaka erre a megállóra (Duvenbeck PV/PB) — ez a valódi határidő. */
  ablakTol: Date | null;
  ablakIg: Date | null;
  kesz: boolean;
  /** Honnan tudjuk, hogy kész: "gps" megfigyelés vagy "kezi" megerősítés. */
  keszForras: "gps" | "kezi" | null;
  keszBy: string | null;
  /** A kamion a GPS szerint MOST itt áll. */
  eppenItt: boolean;
  /** Hány nappal esik a megjelenített naptól (0 = aznap, -1 = tegnap, +1 = holnap). */
  napElteres: number;
};

export type SoforDokumentum = {
  id: string;
  /** "megbizas" | "rakomanylista" | "egyeb" | null */
  tipus: string | null;
  verzio: number | null;
  fajlnev: string | null;
};

export type SoforFuvarBlokk = {
  fuvarId: string;
  megrendelo: string | null;
  pozicioszam: string | null;
  /** Duvenbeck Út ID (Reise ID) — a kapuban ezt kérik, és ez a számlázási kulcs. */
  reiseId: string | null;
  aru: string | null;
  mennyiseg: string | null;
  suly: string | null;
  megjegyzes: string | null;
  /** Igaz, ha a fuvar korábbról csúszik át erre a napra. */
  csuszo: boolean;
  /**
   * A megbízáson szereplő nyers Kocsi-szöveg, ha az NEM a sofőr kocsijára
   * oldódik fel (a fuvar a Sofőr mező alapján került ide). A Duvenbeck
   * következetesen felcserélt betűkkel írja Micó rendszámát, ezért ez csak
   * halk figyelmeztetés — a fuvart sosem rejtjük el miatta.
   */
  masRendszam: string | null;
  megallok: SoforMegalloSor[];
  dokumentumok: SoforDokumentum[];
};

export type SoforNap = {
  napISO: string;
  sofor: string;
  jarmuLabel: string;
  fuvarok: SoforFuvarBlokk[];
  /** A soron következő megálló — az első, ami még nincs kész. */
  kovetkezo: { fuvarId: string; megalloIndex: number } | null;
  /** Hibaszöveg, ha az élő GPS-lekérdezés nem sikerült (a megbízások ettől függetlenül látszanak). */
  hiba: string | null;
};

type FuvarExtraSor = {
  id: string;
  reise_id: string | null;
  aru: string | null;
  mennyiseg: string | null;
  suly: string | null;
  megjegyzes: string | null;
  jarmu: string | null;
  felrakas_ablak_tol: Date | null;
  felrakas_ablak_ig: Date | null;
  lerakas_ablak_tol: Date | null;
  lerakas_ablak_ig: Date | null;
};

/**
 * A bejelentkezett sofőr egy napjának teljes képe: a kocsijára ütemezett
 * fuvarok fuvaronkénti blokkban, a GPS lappal egyező sorrendben.
 *
 * Null, ha az alkalmazotthoz nem tartozik saját jármű.
 */
export async function getSoforNap(employeeId: string, napISO?: string): Promise<SoforNap | null> {
  await requireSajatVagyModulJog({
    employeeId,
    sajatModule: "fuvarozas_sajat",
    modul: "fuvarozas",
    kind: "view",
  });

  const empRows = await query<{ name: string }>(`select name from alkalmazottak where id = $1`, [employeeId]);
  const employeeName = empRows[0]?.name;
  if (!employeeName) return null;
  const jarmu = findJarmuByEmployeeName(employeeName);
  if (!jarmu) return null;

  const nap = napISO ?? budapestMaIso();
  const idovonal = await getIdovonalak(nap);
  const sajat = idovonal.jarmuvek.find((j) => j.sofor === jarmu.sofor);
  const blokkok = sajat?.fuvarok ?? [];

  const fuvarIds = blokkok.map((b) => b.fuvarId);
  const [extraSorok, dokSorok] = fuvarIds.length
    ? await Promise.all([
        query<FuvarExtraSor>(
          `select id::text, reise_id, aru, mennyiseg, suly, megjegyzes, jarmu,
                  felrakas_ablak_tol, felrakas_ablak_ig, lerakas_ablak_tol, lerakas_ablak_ig
             from fuvar_megbizasok
            where id = any($1::bigint[])`,
          [fuvarIds]
        ),
        query<{ id: string; fuvar_id: string; tipus: string | null; verzio: number | null; fajlnev: string | null }>(
          `select id::text, fuvar_id::text, tipus, verzio, fajlnev
             from fuvar_dokumentumok
            where fuvar_id = any($1::bigint[])
            order by tipus, verzio desc nulls last, id`,
          [fuvarIds]
        ),
      ])
    : [[], []];

  const extraById = new Map(extraSorok.map((e) => [e.id, e]));
  const dokByFuvar = new Map<string, SoforDokumentum[]>();
  for (const d of dokSorok) {
    const lista = dokByFuvar.get(d.fuvar_id) ?? [];
    lista.push({ id: d.id, tipus: d.tipus, verzio: d.verzio, fajlnev: d.fajlnev });
    dokByFuvar.set(d.fuvar_id, lista);
  }

  const fuvarok: SoforFuvarBlokk[] = blokkok.map((b) => {
    const extra = extraById.get(b.fuvarId);
    const masRendszam =
      extra?.jarmu && resolveJarmu(extra.jarmu) !== jarmu ? extra.jarmu : null;
    return {
      fuvarId: b.fuvarId,
      megrendelo: b.megrendelo,
      pozicioszam: b.pozicioszam,
      reiseId: extra?.reise_id ?? null,
      aru: extra?.aru ?? null,
      mennyiseg: extra?.mennyiseg ?? null,
      suly: extra?.suly ?? null,
      megjegyzes: extra?.megjegyzes ?? null,
      csuszo: b.csuszo,
      masRendszam,
      dokumentumok: dokByFuvar.get(b.fuvarId) ?? [],
      megallok: b.megallok.map((m) => ({
        fuvarId: m.fuvarId,
        megalloIndex: m.megalloIndex,
        tipus: m.tipus,
        varos: m.cim,
        cim: m.nyersCim,
        idopont: m.idopont,
        becslesElavult: m.becslesElavult,
        ablakTol: (m.tipus === "felrako" ? extra?.felrakas_ablak_tol : extra?.lerakas_ablak_tol) ?? null,
        ablakIg: (m.tipus === "felrako" ? extra?.felrakas_ablak_ig : extra?.lerakas_ablak_ig) ?? null,
        kesz: m.keszForras !== null,
        keszForras: m.keszForras,
        keszBy: m.keszBy,
        eppenItt: m.eppenItt,
        napElteres: m.napElteres,
      })),
    };
  });

  const kovetkezoMegallo = fuvarok.flatMap((f) => f.megallok).find((m) => !m.kesz);

  return {
    napISO: nap,
    sofor: jarmu.sofor,
    jarmuLabel: jarmu.label,
    fuvarok,
    kovetkezo: kovetkezoMegallo
      ? { fuvarId: kovetkezoMegallo.fuvarId, megalloIndex: kovetkezoMegallo.megalloIndex }
      : null,
    hiba: sajat?.hiba ?? null,
  };
}
