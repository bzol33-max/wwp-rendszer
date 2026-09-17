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
import { bontsMegallokra, cimKulcs, cimPontossaga, varosNev } from "@/lib/fuvarozas/varos";
import { toroljIdovonalCachet } from "@/lib/fuvarozas/idovonal-cache";
import { getFleetLastPositions, parseEcofleetTimestamp } from "@/lib/fuvarozas/ecofleet";
import { mozogE, toroljGeokodCachet } from "@/lib/fuvarozas/erintes-felismeres";
import { feltoltFuvarlevelFotot } from "@/lib/fuvarozas/drive-sync-core";
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
  // 1. Explicit összerendelés a teljes név alapján (vehicles.ts
  //    alkalmazottNevek) — ez a mérvadó, mert a becenév ("Micó") és a
  //    törzsadat hivatalos neve ("Takács Miklós") eltérhet.
  const explicit = SAJAT_JARMUVEK.find((j) => (j.alkalmazottNevek ?? []).some((n) => n.trim().toLowerCase() === norm));
  if (explicit) return explicit;
  // 2. Tartalék: a keresztnév szó szerinti egyezése, nem puszta tartalmazás
  //    (a "Gergő" ne illeszkedjen egy "Gergőkúti" vezetéknévre). Ha több
  //    jármű is illeszkedne, inkább egyiket sem adjuk vissza — a rossz kocsi
  //    idővonala rosszabb, mint az üres képernyő.
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
  /** A sofőr "Megérkeztem" koppintásának ideje, ha volt. */
  keziErkezes: Date | null;
  /**
   * Igaz, ha a cím geokódolása bizonytalan (csak városnév szintjén ismert
   * vagy egyáltalán nem), és a helyszín-szótárban sincs rögzítve — ilyenkor
   * a GPS-felismerés nem tud ide érkezést jelölni, a sofőr a helyszínről
   * rögzítheti a valódi koordinátát (rogzitMegalloHelyet).
   */
  helyBizonytalan: boolean;
  /** Igaz, ha ehhez a címhez már van helyszínről rögzített koordináta. */
  helyRogzitve: boolean;
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

  const megallokKulcsai = [...new Set(blokkok.flatMap((b) => b.megallok.map((m) => cimKulcs(m.nyersCim))).filter(Boolean))];
  const [erkezesSorok, helyszinSorok] = fuvarIds.length
    ? await Promise.all([
        query<{ fuvar_id: string; megallo_index: number; kezi_erkezes: Date | null }>(
          `select fuvar_id::text, megallo_index, kezi_erkezes
             from fuvar_megallo_allapot
            where fuvar_id = any($1::bigint[]) and kezi_erkezes is not null`,
          [fuvarIds]
        ),
        megallokKulcsai.length
          ? query<{ cim_kulcs: string }>(`select cim_kulcs from fuvar_helyszin_koordinata where cim_kulcs = any($1::text[])`, [megallokKulcsai])
          : Promise.resolve([]),
      ])
    : [[], []];
  const erkezesByMegallo = new Map(erkezesSorok.map((e) => [`${e.fuvar_id}/${e.megallo_index}`, e.kezi_erkezes]));
  const rogzitettHelyek = new Set(helyszinSorok.map((h) => h.cim_kulcs));

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
        keziErkezes: erkezesByMegallo.get(`${m.fuvarId}/${m.megalloIndex}`) ?? null,
        helyRogzitve: rogzitettHelyek.has(cimKulcs(m.nyersCim)),
        helyBizonytalan:
          !rogzitettHelyek.has(cimKulcs(m.nyersCim)) && (m.bizonytalanFelismeres || cimPontossaga(m.nyersCim) !== "pontos"),
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

/**
 * A sofőr "Megérkeztem" koppintása — a tényleges érkezés ideje, a
 * GPS-becsléstől függetlenül. Csak az első koppintás számít (a második nem
 * írja felül), mert az érkezés egy pillanat, nem állapot.
 */
export async function jelolMegerkeztem(fuvarId: string, megalloIndex: number): Promise<void> {
  await requireAnyEditPermission(["fuvarozas", "fuvarozas_sajat"]);
  const soforNev = (await requireSession()).name;
  await query(
    `insert into fuvar_megallo_allapot (fuvar_id, megallo_index, kesz, kezi_erkezes, kesz_by)
     values ($1, $2, false, now(), $3)
     on conflict (fuvar_id, megallo_index)
     do update set kezi_erkezes = coalesce(fuvar_megallo_allapot.kezi_erkezes, now())`,
    [fuvarId, megalloIndex, soforNev]
  );
  toroljIdovonalCachet();
  revalidatePath("/erkezes");
}

/** Ennél régebbi élő pozícióval nem rögzítünk helyszínt — nem tudjuk, hol áll a kocsi. */
const HELYSZIN_MAX_JEL_KOR_PERC = 15;

/**
 * A sofőr a megállóban rögzíti, hogy a megbízáson szereplő cím TÉNYLEGESEN
 * itt van — a kocsi aktuális Ecofleet-pozícióját írjuk a helyszín-szótárba
 * (fuvar_helyszin_koordinata), a cím normalizált kulcsával. Onnantól
 * minden ugyanerre a címre szóló fuvart a GPS-felismerés ide vár.
 *
 * A kocsi pozícióját használjuk, nem a telefonét: a nyomkövető megbízhatóbb,
 * és a sofőr a kocsi mellett áll. Két feltétel: a kocsi álljon (mozgás
 * közben a "hely" értelmetlen), és a jel legyen friss.
 */
export async function rogzitMegalloHelyet(
  fuvarId: string,
  megalloIndex: number
): Promise<{ cim: string; lat: number; lon: number }> {
  await requireAnyEditPermission(["fuvarozas", "fuvarozas_sajat"]);
  const session = await requireSession();

  const sorok = await query<{ felrako: string | null; lerako: string; jarmu: string | null; sofor: string | null }>(
    `select felrako, lerako, jarmu, sofor from fuvar_megbizasok where id = $1`,
    [fuvarId]
  );
  const fuvar = sorok[0];
  if (!fuvar) throw new Error("Nincs ilyen fuvar.");
  const cimek = [...bontsMegallokra(fuvar.felrako), ...bontsMegallokra(fuvar.lerako)];
  const cim = cimek[megalloIndex];
  if (!cim) throw new Error("Nincs ilyen megálló.");

  // Melyik kocsi: a fuvaré. (A sofőr csak a saját kocsijára ütemezett fuvart
  // látja, de a hely a fuvar kocsijához tartozik, nem a bejelentkezett
  // személyhez.)
  const jarmu =
    (fuvar.jarmu ? resolveJarmu(fuvar.jarmu) : null) ??
    (fuvar.sofor ? findJarmuByEmployeeName(fuvar.sofor) : null);
  if (!jarmu?.ecofleetObjectId) throw new Error("A fuvarhoz nem tartozik GPS-es kocsi.");

  const poziciok = await getFleetLastPositions();
  const pos = poziciok.find((p) => p.objectId === jarmu.ecofleetObjectId);
  if (!pos) throw new Error("Nincs élő pozíció a kocsihoz.");
  const jelIdeje = parseEcofleetTimestamp(pos.timestamp);
  if (!jelIdeje || Date.now() - jelIdeje.getTime() > HELYSZIN_MAX_JEL_KOR_PERC * 60000) {
    throw new Error("A kocsi GPS-jele régi, várj egy percet és próbáld újra.");
  }
  if (mozogE(pos)) throw new Error("A kocsi mozog — állj meg a rakodóhelyen, és akkor rögzítsd.");

  const kulcs = cimKulcs(cim);
  if (!kulcs) throw new Error("Üres cím.");
  await query(
    `insert into fuvar_helyszin_koordinata (cim_kulcs, cim_minta, lat, lon, forras, rogzitve_by)
     values ($1, $2, $3, $4, 'sofor', $5)
     on conflict (cim_kulcs)
     do update set cim_minta = excluded.cim_minta, lat = excluded.lat, lon = excluded.lon,
                   forras = excluded.forras, rogzitve_by = excluded.rogzitve_by, rogzitve_at = now()`,
    [kulcs, cim, pos.latitude, pos.longitude, session.name]
  );
  // A felismerés és a GPS lap a következő számításnál már az új helyet lássa.
  toroljGeokodCachet();
  toroljIdovonalCachet();
  revalidatePath("/erkezes");
  console.log(`[sofor] helyszín rögzítve: "${cim}" → ${pos.latitude.toFixed(5)}, ${pos.longitude.toFixed(5)} (${session.name})`);
  return { cim, lat: pos.latitude, lon: pos.longitude };
}

/** Ennél nagyobb fotót nem fogadunk el — a telefon oldalán amúgy is kicsinyítünk (lásd sofor-fuvar-nap.tsx). */
const FOTO_MAX_BAJT = 8 * 1024 * 1024;

/**
 * A sofőr lefotózza a fuvarlevelet/CMR-t a lerakásnál. A kép a Drive
 * Fuvarmegbizások/Fuvarlevelek mappájába kerül, és "fuvarlevel" típusú
 * dokumentumként a fuvarhoz kötődik (fuvar_dokumentumok) — így a Számla/
 * Posta oldal aznap látja, hogy a papír létezik és mi van rajta. A fizikai
 * beérkezést (papirok_beerkeztek_at) NEM váltja ki: papír nélkül nem
 * számlázunk, de az elveszett fuvarlevél nem két hét múlva derül ki.
 */
export async function feltoltFuvarlevelFoto(fuvarId: string, form: FormData): Promise<{ dokId: string }> {
  await requireAnyEditPermission(["fuvarozas", "fuvarozas_sajat"]);
  const session = await requireSession();
  const fajl = form.get("foto");
  if (!(fajl instanceof File) || fajl.size === 0) throw new Error("Nincs kép.");
  if (fajl.size > FOTO_MAX_BAJT) throw new Error("A kép túl nagy.");
  if (!fajl.type.startsWith("image/")) throw new Error("Csak kép tölthető fel.");

  const sorok = await query<{ datum: string; jarmu: string | null; reise_id: string | null; pozicioszam: string | null }>(
    `select to_char(datum, 'YYYY-MM-DD') as datum, jarmu, reise_id, pozicioszam from fuvar_megbizasok where id = $1`,
    [fuvarId]
  );
  const fuvar = sorok[0];
  if (!fuvar) throw new Error("Nincs ilyen fuvar.");

  const hivatkozas = (fuvar.reise_id ?? fuvar.pozicioszam ?? `fuvar${fuvarId}`).replace(/[^A-Za-z0-9_-]+/g, "_");
  const rendszam = (fuvar.jarmu ?? "").replace(/[^A-Za-z0-9]+/g, "").toUpperCase() || "kocsi";
  const kiterjesztes = fajl.type === "image/png" ? "png" : "jpg";
  const nev = `${fuvar.datum}_${rendszam}_${hivatkozas}_${Date.now()}.${kiterjesztes}`;
  const tartalom = Buffer.from(await fajl.arrayBuffer());

  const feltoltve = await feltoltFuvarlevelFotot(nev, fajl.type, tartalom);
  const beszurt = await query<{ id: string }>(
    `insert into fuvar_dokumentumok (fuvar_id, drive_file_id, dokumentum_url, tipus, fajlnev)
     values ($1, $2, $3, 'fuvarlevel', $4)
     returning id::text`,
    [fuvarId, feltoltve.id, feltoltve.url, nev]
  );
  console.log(`[sofor] fuvarlevél-fotó feltöltve: fuvar #${fuvarId}, ${nev}, ${Math.round(tartalom.length / 1024)} KB (${session.name})`);
  revalidatePath("/erkezes");
  revalidatePath("/fuvarozas");
  return { dokId: beszurt[0].id };
}

/**
 * A sofőr gondot jelez egy fuvarhoz (rossz cím, nem fogadják, hiányzó
 * papír…). A jelzés a feladatok táblába kerül, amit a diszpécser a
 * Jelenlét/üzenőfal oldalon és a Feladatok csempén lát — nincs új felület,
 * a meglévő csatornán érkezik.
 */
export async function jelezGondot(fuvarId: string, szoveg: string): Promise<void> {
  await requireAnyEditPermission(["fuvarozas", "fuvarozas_sajat"]);
  const session = await requireSession();
  const tiszta = szoveg.trim();
  if (!tiszta) throw new Error("Írd le röviden, mi a gond.");
  const sorok = await query<{ megrendelo: string | null; pozicioszam: string | null; reise_id: string | null; lerako: string }>(
    `select megrendelo, pozicioszam, reise_id, lerako from fuvar_megbizasok where id = $1`,
    [fuvarId]
  );
  const fuvar = sorok[0];
  if (!fuvar) throw new Error("Nincs ilyen fuvar.");
  // A feladat telephelyhez kötött; a sofőr jelzése a központhoz (Szakoly)
  // szól. Ha nincs ilyen nevű telephely, az első felvitt telephelyre megy.
  const site = await query<{ id: number }>(
    `select id from sites order by (name ilike 'szakoly%') desc, id asc limit 1`
  );
  if (!site[0]) throw new Error("Nincs telephely a feladathoz.");
  const hiv = fuvar.reise_id ?? fuvar.pozicioszam;
  const leiras = `Sofőr jelzés (${session.name}) — fuvar #${fuvarId}${fuvar.megrendelo ? `, ${fuvar.megrendelo}` : ""}${hiv ? `, ${hiv}` : ""}, ${varosNev(fuvar.lerako)}: ${tiszta}`;
  await query(
    `insert into feladatok (task_date, site_id, description, urgency, repeat_freq, created_by)
     values (($1::timestamptz at time zone 'Europe/Budapest')::date, $2, $3, 4, 'egyszeri', $4)`,
    [new Date().toISOString(), site[0].id, leiras, session.name]
  );
  console.log(`[sofor] gondjelzés: ${leiras}`);
  revalidatePath("/jelenlet");
  revalidatePath("/erkezes");
}

/**
 * A kapuban kapott pozíciószám / hivatkozási szám beírása, ha a
 * megbízásról nem sikerült kiolvasni. Csak ÜRES mezőt tölt ki — meglévő
 * számot a sofőr nem ír felül, az a diszpécser dolga.
 */
export async function rogzitPozicioszamot(fuvarId: string, szam: string): Promise<void> {
  await requireAnyEditPermission(["fuvarozas", "fuvarozas_sajat"]);
  const session = await requireSession();
  const tiszta = szam.trim();
  if (!tiszta) throw new Error("Üres a szám.");
  const eredmeny = await query<{ id: string }>(
    `update fuvar_megbizasok
        set pozicioszam = $2, pozicioszam_nincs = false
      where id = $1 and coalesce(pozicioszam, '') = ''
      returning id::text`,
    [fuvarId, tiszta]
  );
  if (eredmeny.length === 0) throw new Error("Ehhez a fuvarhoz már van pozíciószám.");
  console.log(`[sofor] pozíciószám rögzítve: fuvar #${fuvarId} → ${tiszta} (${session.name})`);
  toroljIdovonalCachet();
  revalidatePath("/erkezes");
  revalidatePath("/fuvarozas");
}
