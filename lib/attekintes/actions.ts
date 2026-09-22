"use server";

// Az Áttekintés (/attekintes) vezetői, alsó fülekkel navigálható mobil
// nézetének lekérdezései (Nyíregyháza / Fuvar / Számlák / Készlet fülek).
// Szándékosan nem hoz létre új adatforrást — mindenhol a meglévő modulok
// (Készlet/Nyíregyháza, Számlák, Fuvarozás) már meglévő tábláira és
// akcióira épít, hogy ugyanazt az adatot mutassa, mint a teljes modulok,
// csak tömörebben, mobilra optimalizálva.

import { query } from "@/lib/db";
import { requireViewPermission } from "@/lib/auth/require-permission";
import { getFleetPositions, getIdovonalak } from "@/lib/fuvarozas/actions";
import { getFuvarHelye } from "@/lib/fuvarozas/fuvar-hely";
import { budapestNapISO } from "@/lib/fuvarozas/idozona";
import { getFuvarok } from "@/lib/fuvarozas/megbizasok";
import { SAJAT_JARMUVEK, resolveJarmu, findJarmuByPlate, jarmuLabel, type SajatJarmu } from "@/lib/fuvarozas/vehicles";
import { getSzamlaLista } from "@/lib/szamlak/actions";
import type { SzamlaRow } from "@/lib/szamlak/szamla-constants";
import type { FuvarRow } from "@/lib/fuvarozas/fuvar-constants";
import { bontsMegallokra, varosNev } from "@/lib/fuvarozas/varos";

// ---------------------------------------------------------------------------
// Nyíregyháza fül
// ---------------------------------------------------------------------------

// A Railway-konténer (és a hozzá tartozó Postgres session) alapértelmezett
// időzónája UTC, nem Europe/Budapest — lásd lib/jelenlet/actions.ts hasonló
// megjegyzését. A sima `current_date`/`::date` ezért a szerver (UTC)
// faliórája szerinti naptári napot adná vissza, ami éjfél körül (a
// Budapest-UTC eltolás miatt) eltérő/hiányos "mai" adatot eredményezne —
// ezért itt is explicit `at time zone 'Europe/Budapest'` konverzióval
// számolunk.
const BUDAPEST_MA = `(now() at time zone 'Europe/Budapest')::date`;

export type FelvasarlasTipusSor = { tipus: string; qty: number };

export type FelvasarlasOsszefoglalo = {
  /** A mai napon ténylegesen vásárolt típusok mennyisége, típusonként — csak azok, amikben ma volt forgalom. */
  tipusok: FelvasarlasTipusSor[];
  kassza: number;
};

/** A "Nyíregyháza" fül fő adatai: a mai felvásárlás típusonként (csempénként) és a kassza egyenleg. */
export async function getFelvasarlasOsszefoglalo(): Promise<FelvasarlasOsszefoglalo> {
  await requireViewPermission("attekintes");
  const [typeRows, kasszaRows] = await Promise.all([
    query<{ type: string; qty: string }>(
      `select t.name as type, sum(p.qty) as qty
       from nyiregyhaza_purchases p
       join pallet_types t on t.id = p.type_id
       where (p.created_at at time zone 'Europe/Budapest')::date = ${BUDAPEST_MA}
       group by t.name, t.sort_order
       order by t.sort_order nulls last, t.name`
    ),
    query<{ total: string }>(`select coalesce(sum(amount), 0) as total from kassza_movements`),
  ]);

  return {
    tipusok: typeRows.map((r) => ({ tipus: r.type, qty: Number(r.qty) })),
    kassza: Number(kasszaRows[0]?.total ?? 0),
  };
}

/** A Nyíregyháza fülön, a "Mai felvásárlás típusonként" sor szélén nyíló havi összesítő: a folyó hónap felvásárlása típusonként. */
export async function getHaviFelvasarlasOsszefoglalo(): Promise<FelvasarlasTipusSor[]> {
  await requireViewPermission("attekintes");
  const rows = await query<{ type: string; qty: string }>(
    `select t.name as type, sum(p.qty) as qty
     from nyiregyhaza_purchases p
     join pallet_types t on t.id = p.type_id
     where date_trunc('month', p.created_at at time zone 'Europe/Budapest')
         = date_trunc('month', now() at time zone 'Europe/Budapest')
     group by t.name, t.sort_order
     order by t.sort_order nulls last, t.name`
  );
  return rows.map((r) => ({ tipus: r.type, qty: Number(r.qty) }));
}

export type HaviKasszaOsszesito = {
  /** A folyó hónapban a kasszába befolyt összeg (pozitív tételek összege). */
  bevetel: number;
  /** A folyó hónapban a kasszából kifizetett összeg — negatív előjellel. */
  kiadas: number;
};

/** A Kassza egyenlegre kattintva megnyíló havi összesítő: folyó havi be- és kifizetés. */
export async function getHaviKasszaOsszesito(): Promise<HaviKasszaOsszesito> {
  await requireViewPermission("attekintes");
  const rows = await query<{ bevetel: string; kiadas: string }>(
    `select
       coalesce(sum(amount) filter (where amount > 0), 0) as bevetel,
       coalesce(sum(amount) filter (where amount < 0), 0) as kiadas
     from kassza_movements
     where date_trunc('month', created_at at time zone 'Europe/Budapest')
         = date_trunc('month', now() at time zone 'Europe/Budapest')`
  );
  return {
    bevetel: Number(rows[0]?.bevetel ?? 0),
    kiadas: Number(rows[0]?.kiadas ?? 0),
  };
}

export type MaiPenzmozgas = {
  /** Ma a kasszából felvásárlásra kifizetett készpénz (pozitív szám). */
  felvasarlasKeszpenz: number;
  /** Ma a kasszából egyéb címen kifizetett készpénz (pozitív szám). */
  egyebKiadas: number;
  /** Ma átutalással vásárolt raklap nettó értéke és darabszáma — ez NEM a kasszából megy ki. */
  atutalasOsszeg: number;
  atutalasDb: number;
  /** Mely típusok adják az átutalásos összeget (típusonként darab és nettó Ft). */
  atutalasTipusok: { tipus: string; qty: number; osszeg: number }[];
};

/**
 * A "Nyíregyháza" fül Mai pénzmozgás kártyája: mi ment ki ma készpénzben
 * (felvásárlás, egyéb), és mennyit vettünk átutalással. Az átutalásos vétel
 * a készletet ugyanúgy növeli, de a kasszát nem érinti, ezért külön sor.
 */
export async function getMaiPenzmozgas(): Promise<MaiPenzmozgas> {
  await requireViewPermission("attekintes");
  const [kassza, atutalas] = await Promise.all([
    query<{ felvasarlas: string; egyeb: string }>(
      `select
         coalesce(-sum(amount) filter (where category = 'felvasarlas' and amount < 0), 0) as felvasarlas,
         coalesce(-sum(amount) filter (where coalesce(category, 'egyeb') <> 'felvasarlas' and amount < 0), 0) as egyeb
       from kassza_movements
       where (created_at at time zone 'Europe/Budapest')::date = ${BUDAPEST_MA}`
    ),
    query<{ type: string; osszeg: string; db: string }>(
      `select t.name as type, sum(p.total) as osszeg, sum(p.qty) as db
       from nyiregyhaza_purchases p
       join pallet_types t on t.id = p.type_id
       where p.payment_method = 'atutalas'
         and (p.created_at at time zone 'Europe/Budapest')::date = ${BUDAPEST_MA}
       group by t.name, t.sort_order
       order by t.sort_order nulls last, t.name`
    ),
  ]);
  return {
    felvasarlasKeszpenz: Number(kassza[0]?.felvasarlas ?? 0),
    egyebKiadas: Number(kassza[0]?.egyeb ?? 0),
    atutalasOsszeg: atutalas.reduce((sum, r) => sum + Number(r.osszeg), 0),
    atutalasDb: atutalas.reduce((sum, r) => sum + Number(r.db), 0),
    atutalasTipusok: atutalas.map((r) => ({
      tipus: r.type,
      qty: Number(r.db),
      osszeg: Number(r.osszeg),
    })),
  };
}

export type KasszaKiadasTetel = {
  id: string;
  description: string;
  amount: number;
  createdAt: string;
};

/**
 * A "Nyíregyháza" fülön: minden pénz, ami ma ténylegesen kiment a kasszából —
 * felvásárlás/csere/kifizetés (category='felvasarlas') ÉS egyéb kézzel
 * felvitt kiadás (category='egyeb') egyaránt, kategóriától függetlenül.
 * A felvásárláshoz kötött tételek külön (típusonkénti) mennyiségét a fenti
 * csempék már mutatják — ez a lista a teljes mai kassza-kiáramlást adja Ft-ban.
 */
export async function getMaiKiadasok(): Promise<KasszaKiadasTetel[]> {
  await requireViewPermission("attekintes");
  const rows = await query<{ id: string; description: string; amount: number; created_at: string }>(
    `select id::text, description, amount, created_at::text
     from kassza_movements
     where (created_at at time zone 'Europe/Budapest')::date = ${BUDAPEST_MA}
       and amount < 0
     order by created_at desc
     limit 100`
  );
  return rows.map((r) => ({
    id: r.id,
    description: r.description,
    amount: r.amount,
    createdAt: r.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Számlák fül
// ---------------------------------------------------------------------------

/**
 * A "Számlák" fülön: az összes nyitott számla, esedékesség szerint — a
 * Lejárt / Következő 10 / Mappák nézetet a kliens ebből bontja szét, így egy
 * "Fizetve" jelölés mindhárom helyen és a felső számokban is azonnal látszik.
 */
export async function getNyitottSzamlak(): Promise<SzamlaRow[]> {
  await requireViewPermission("attekintes");
  return getSzamlaLista({ csakNyitott: true });
}

/** A mobil Számlák mátrix "Fizetve" oszlopához: az idén (január 1. óta) fizetettre jelölt számlák, a legfrissebb elöl. */
export async function getIdeiFizetettSzamlak(): Promise<SzamlaRow[]> {
  await requireViewPermission("attekintes");
  return getSzamlaLista({ csakFizetve: true, fizetveIdei: true, limit: 5000 });
}

// ---------------------------------------------------------------------------
// Fuvar fül
// ---------------------------------------------------------------------------

export type JarmuPoziciSor = {
  jarmu: SajatJarmu;
  /** null, ha a jármű nincs Ecofleet-be kötve, vagy nem sikerült lekérni a pozícióját. */
  cim: string | null;
  sebesseg: number | null;
  frissitve: string | null;
  /** null, ha nincs GPS-adat — nem tudjuk, fut-e a motor. */
  motorFut: boolean | null;
};

/** A "Fuvar" fülön: saját járművenként az utolsó ismert hely, sebesség és motorállapot. */
export async function getJarmuPoziciok(): Promise<JarmuPoziciSor[]> {
  await requireViewPermission("attekintes");
  const result = await getFleetPositions();
  const positions = result.ok ? result.positions : [];

  return SAJAT_JARMUVEK.map((jarmu) => {
    const pos = positions.find((p) => findJarmuByPlate(p.plate) === jarmu);
    return {
      jarmu,
      cim: pos?.cim ?? null,
      sebesseg: pos?.speed ?? null,
      frissitve: pos?.timestamp ?? null,
      motorFut: pos?.engineOn ?? null,
    };
  });
}

function jarmuMatch(jarmu: SajatJarmu, row: FuvarRow): boolean {
  if (row.jarmu && resolveJarmu(row.jarmu) === jarmu) return true;
  if (row.sofor && row.sofor.trim().toLowerCase() === jarmu.sofor.toLowerCase()) return true;
  return false;
}

export type JarmuMegbizasMegallo = { tipus: "felrako" | "lerako"; varos: string };

export type JarmuMegbizasSor = {
  id: string;
  // A UI-n megszokott (a DB "tipus" mezőjéhez képest fordított) címkézés —
  // lásd lib/dashboard/actions.ts megjegyzését: DB tipus='ber' -> "Saját",
  // DB tipus='sajat' -> "Bér".
  cimke: "Saját" | "Bér";
  date: string;
  /** YYYY-MM-DD — a "Ma"/"Holnap" címkéhez a kártyán. */
  datumIso: string;
  idopont: string | null;
  megrendelo: string | null;
  pozicioszam: string | null;
  felrako: string | null;
  lerako: string;
  /** A felrakó + az összes lerakó állomás (több-megállós lerakónál szétbontva), útvonal-sorrendben. */
  megallok: JarmuMegbizasMegallo[];
  statusz: string;
};

function megbizasMegallok(felrako: string | null, lerako: string): JarmuMegbizasMegallo[] {
  return [
    ...bontsMegallokra(felrako).map((cim) => ({ tipus: "felrako" as const, varos: varosNev(cim) })),
    ...bontsMegallokra(lerako).map((cim) => ({ tipus: "lerako" as const, varos: varosNev(cim) })),
  ];
}

function megbizasSor(row: FuvarRow): JarmuMegbizasSor {
  return {
    id: row.id,
    cimke: row.tipus === "ber" ? "Saját" : "Bér",
    date: row.date,
    datumIso: row.datum_iso,
    idopont: row.idopont,
    megrendelo: row.megrendelo,
    pozicioszam: row.pozicioszam,
    felrako: row.felrako,
    lerako: row.lerako,
    megallok: megbizasMegallok(row.felrako, row.lerako),
    statusz: row.statusz,
  };
}

/** Egy mai fuvar egy állomása a kártyán — a GPS lap idővonalával (getIdovonalak) egyező állapottal. */
export type JarmuMaiMegallo = {
  index: number;
  tipus: "felrako" | "lerako";
  varos: string;
  /** A megálló teljes címe — a részletnézetben ez látszik. */
  cim: string;
  /** Kész: GPS-felismerés vagy kézi (sofőr mobil / GPS lap) jelölés. */
  kesz: boolean;
  keszForras: "gps" | "kezi" | null;
  keszBy: string | null;
  /** A kocsi a GPS szerint MOST itt áll. */
  eppenItt: boolean;
  /**
   * "HH:MM" budapesti óra: kész megállónál a tényleges érkezés, egyébként a
   * becsült időpont. Null, ha a becslés csak a statikus menetrend és már a
   * múltba esik — ilyenkor nincs mit mutatni.
   */
  ido: string | null;
  /** Hány nappal esik a mai naptól (-1 = tegnap volt, +1 = holnap lesz). */
  napElteres: number;
  /** A sofőr által jelölt rakodóhelyi várakozás percben (folyamatban lévőnél a mostanáig eltelt idő). */
  varakozasPerc: number | null;
  /** Igaz, amíg a sofőr még nem zárta le a várakozást. */
  varakozik: boolean;
};

export type JarmuMaiFuvar = {
  id: string;
  cimke: "Saját" | "Bér";
  megrendelo: string | null;
  pozicioszam: string | null;
  /** A fuvar korábbi napról csúszik át — a kocsi még viszi. */
  csuszo: boolean;
  megallok: JarmuMaiMegallo[];
  /** A sofőr által feltöltött fuvarlevél-fotók száma és a legfrissebb azonosítója (a /api/fuvarozas/dokumentum/… linkhez). */
  fuvarlevelFotoDb: number;
  fuvarlevelFotoId: string | null;
  /** A sofőr nyitott gondjelzései (feladatok tábla) erre a fuvarra. */
  gondok: string[];
};

export type JarmuFuvarCsoport = {
  jarmu: SajatJarmu;
  label: string;
  /** A mai nap fuvarjai a GPS lap sorrendjében, állomásonkénti állapottal. */
  mai: JarmuMaiFuvar[];
  /** Élő becsült érkezés a következő állomásra — null, ha nincs, vagy a becslés bizonytalan. */
  eloEta: { cel: string; ido: string } | null;
  /** A mai nap utáni, még folyamatban lévő megbízások, a legközelebbi elöl. */
  kovetkezok: JarmuMegbizasSor[];
  /** Az élő GPS-lekérdezés hibaszövege, ha volt — a megbízások ettől függetlenül látszanak. */
  hiba: string | null;
};

export type FuvarFulAdatok = {
  jarmuvek: JarmuFuvarCsoport[];
  /** Folyamatban lévő megbízások, amelyekhez egyik saját kocsi sincs hozzárendelve — ezek döntést várnak. */
  kocsiNelkul: JarmuMegbizasSor[];
  /** Az adatok összeállításának pillanata (ms) — a felület ehhez méri az élő jel korát és a folyó rakodás idejét. */
  betoltve: number;
};

const BUDAPEST_ORA = new Intl.DateTimeFormat("hu-HU", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Europe/Budapest",
});

function budapestOraSzoveg(d: Date): string {
  return BUDAPEST_ORA.format(d);
}

/** Időpont-szöveg rendezéshez: a hiányzó időpont a nap végére kerül. */
function idopontKulcs(idopont: string | null): string {
  return idopont?.trim() ? idopont.trim() : "99:99";
}

function folyamatban(row: FuvarRow, ma: string): boolean {
  const hely = getFuvarHelye(row, ma);
  return hely === "ber_folyamatban" || hely === "sajat_folyamatban";
}

/**
 * A "Fuvar" fül teljes adata egy körben.
 *
 * A MAI kép NEM külön számítás: a GPS lap gyorsítótárazott idővonalából
 * (getIdovonalak) jön, fuvaronkénti blokkokban, ugyanazzal a kész / épp itt
 * / várakozik állapottal, amit a diszpécser a GPS lapon és a sofőr a
 * telefonján lát. A mai nap utáni megbízások és a kocsi nélküliek a
 * Megbízások modul közös "folyamatban" szabályával (getFuvarHelye) szűrve
 * kerülnek ide — a lezárt, számlázott vagy Teljesítve-re tett fuvar itt nem
 * jelenik meg. Korábban a fül a `statusz <> 'lezarva'` feltételt használta,
 * amit a felület sehol nem állít, ezért a kocsi minden régi fuvarja
 * "folyamatban lévőként" látszott.
 */
export async function getFuvarFulAdatok(): Promise<FuvarFulAdatok> {
  await requireViewPermission("attekintes");
  const ma = budapestNapISO();
  const [idovonal, berTabRows, sajatTabRows] = await Promise.all([
    getIdovonalak(ma),
    getFuvarok("sajat"), // DB tipus='sajat' — UI-n "Bér fuvarok" fül
    getFuvarok("ber"), // DB tipus='ber' — UI-n "Saját fuvarok" fül
  ]);
  const osszes = [...berTabRows, ...sajatTabRows];
  const rowById = new Map(osszes.map((r) => [r.id, r]));
  const aktivak = osszes.filter((r) => folyamatban(r, ma));

  const maiFuvarIds = new Set(idovonal.jarmuvek.flatMap((j) => j.fuvarok.map((f) => f.fuvarId)));
  const erintettIds = [...new Set([...maiFuvarIds, ...aktivak.map((r) => r.id)])];
  const gondSorok = erintettIds.length
    ? await query<{ description: string }>(
        `select description from feladatok
          where done = false and forras = 'sofor_gond' and description like 'Sofőr jelzés (%'
          order by id desc limit 50`
      ).catch(() => [])
    : [];
  const gondokByFuvar = new Map<string, string[]>();
  for (const g of gondSorok) {
    // A leírás alakja (lib/fuvarozas/sofor.ts jelezGondot): "Sofőr jelzés (Név) —
    // fuvar #12, Megrendelő, hivatkozás, Lerakó: a sofőr szövege". A kártyán a
    // fuvar blokkjában jelenik meg, ezért csak a név és a szöveg kell belőle.
    const m = /^Sofőr jelzés \(([^)]*)\) — fuvar #(\d+)[^:]*: ([\s\S]*)$/.exec(g.description);
    if (!m) continue;
    const szoveg = `${m[1]}: ${m[3].trim()}`;
    gondokByFuvar.set(m[2], [...(gondokByFuvar.get(m[2]) ?? []), szoveg]);
  }

  // A kézi (sofőr / GPS lap) készre jelölés és a "Megérkeztem" koppintás
  // tényleges ideje — az idővonal a kézzel kész megállónál is csak a becsült
  // időpontot hordozza, a vezetőnek viszont az kell, mikor volt ott a kocsi.
  const maiIds = [...maiFuvarIds];
  const keziSorok = maiIds.length
    ? await query<{ fuvar_id: string; megallo_index: number; kesz_at: Date | null; kezi_erkezes: Date | null }>(
        `select fuvar_id::text, megallo_index, kesz_at, kezi_erkezes
           from fuvar_megallo_allapot
          where fuvar_id = any($1::bigint[]) and (kesz_at is not null or kezi_erkezes is not null)`,
        [maiIds]
      ).catch(() => [])
    : [];
  const keziIdoByMegallo = new Map(
    keziSorok.map((k) => [`${k.fuvar_id}/${k.megallo_index}`, k.kezi_erkezes ?? k.kesz_at])
  );

  const most = Date.now();
  const jarmuvek: JarmuFuvarCsoport[] = SAJAT_JARMUVEK.map((jarmu) => {
    const iv = idovonal.jarmuvek.find((j) => j.sofor === jarmu.sofor);
    const mai: JarmuMaiFuvar[] = (iv?.fuvarok ?? []).map((b) => {
      const row = rowById.get(b.fuvarId);
      return {
        id: b.fuvarId,
        cimke: b.fuvarTipus === "ber" ? "Saját" : "Bér",
        megrendelo: b.megrendelo,
        pozicioszam: b.pozicioszam,
        csuszo: b.csuszo,
        fuvarlevelFotoDb: row?.fuvarlevel_foto_db ?? 0,
        fuvarlevelFotoId: row?.fuvarlevel_foto_id ?? null,
        gondok: gondokByFuvar.get(b.fuvarId) ?? [],
        megallok: b.megallok.map((m) => {
          const kesz = m.keszForras !== null;
          const keziIdo = m.keszForras === "kezi" ? keziIdoByMegallo.get(`${b.fuvarId}/${m.megalloIndex}`) ?? null : null;
          const becsultMs = new Date(m.idopont).getTime();
          // Még hátralévő megállónál a múltba csúszott becslés (nincs élő GPS,
          // vagy nem sikerült útvonalat számolni) nem óra, hanem félrevezetés.
          const becslesHasznalhato = !m.becslesElavult && becsultMs >= most - 5 * 60 * 1000;
          const varakozasKezdete = m.varakozasKezdete ? new Date(m.varakozasKezdete).getTime() : null;
          const varakozasVege = m.varakozasVege ? new Date(m.varakozasVege).getTime() : null;
          return {
            index: m.megalloIndex,
            tipus: m.tipus,
            varos: m.cim,
            cim: m.nyersCim,
            kesz,
            keszForras: m.keszForras,
            keszBy: m.keszBy,
            eppenItt: m.eppenItt,
            ido: kesz
              ? budapestOraSzoveg(keziIdo ? new Date(keziIdo) : new Date(m.idopont))
              : m.eppenItt || becslesHasznalhato
                ? budapestOraSzoveg(new Date(m.idopont))
                : null,
            napElteres: m.napElteres,
            varakozasPerc:
              varakozasKezdete !== null ? Math.max(0, Math.round(((varakozasVege ?? most) - varakozasKezdete) / 60000)) : null,
            varakozik: varakozasKezdete !== null && varakozasVege === null,
          };
        }),
      };
    });

    const kovetkezok = aktivak
      .filter((r) => jarmuMatch(jarmu, r) && !maiFuvarIds.has(r.id) && r.datum_iso > ma)
      .sort(
        (a, b) =>
          a.datum_iso.localeCompare(b.datum_iso) ||
          idopontKulcs(a.idopont).localeCompare(idopontKulcs(b.idopont)) ||
          Number(a.id) - Number(b.id)
      )
      .map(megbizasSor);

    const eta = iv?.eloEta;
    return {
      jarmu,
      label: jarmuLabel(jarmu),
      mai,
      eloEta: eta && !eta.bizonytalan ? { cel: eta.cel, ido: budapestOraSzoveg(new Date(eta.erkezes)) } : null,
      kovetkezok,
      hiba: iv?.hiba ?? null,
    };
  });

  const kocsiNelkul = aktivak
    .filter((r) => !SAJAT_JARMUVEK.some((j) => jarmuMatch(j, r)) && !maiFuvarIds.has(r.id))
    .sort(
      (a, b) =>
        a.datum_iso.localeCompare(b.datum_iso) ||
        idopontKulcs(a.idopont).localeCompare(idopontKulcs(b.idopont)) ||
        Number(a.id) - Number(b.id)
    )
    .map(megbizasSor);

  return { jarmuvek, kocsiNelkul, betoltve: most };
}

// ---------------------------------------------------------------------------
// Készlet fül
// ---------------------------------------------------------------------------

export type KeszletTipusSor = {
  tipus: string;
  osszes: number;
  /** Telephely neve → aktuális darabszám (csak ahol a típus aktív). */
  telepenkent: Record<string, number>;
};

export type KeszletUtonSor = {
  id: string;
  tipus: string;
  qty: number;
  honnan: string | null;
  hova: string;
  mikor: string;
};

export type KeszletFulAdatok = {
  telepek: { nev: string; osszes: number }[];
  tipusok: KeszletTipusSor[];
  uton: KeszletUtonSor[];
};

// A telepek sorrendje a Készlet fülön — ugyanaz, mint a Készlet modulban.
const KESZLET_TELEP_SORREND = ["Nyíregyháza", "Balkány", "Szakoly"];

/**
 * A "Készlet" fül: az összes telephely aktuális készlete típusonként, plusz
 * az úton lévő (a fogadó telepen még át nem vett) mozgatások. Ugyanaz a
 * számítás, mint a Készlet modul Összkészlet nézetében (getOsszkeszlet): a
 * "Csere" nem önálló készlettétel, a mozgatás a cél telepen csak az átvétel
 * után számít — az úton lévő mennyiség így egyik telep számában sincs benne,
 * ezért külön soroljuk fel.
 */
export async function getKeszletFulAdatok(): Promise<KeszletFulAdatok> {
  await requireViewPermission("attekintes");
  const [keszletRows, utonRows] = await Promise.all([
    query<{ type: string; site: string; qty: string }>(
      `select t.name as type, s.name as site,
         coalesce(sum(case
           when m.direction = 'be' then m.qty
           when m.direction = 'mozgatas_be' and m.elfogadva_at is not null then m.qty
           when m.direction in ('ki','mozgatas') then -m.qty
           else 0
         end), 0) as qty
       from pallet_types t
       join site_active_types sat on sat.type_id = t.id
       join sites s on s.id = sat.site_id
       left join keszlet_movements m on m.type_id = t.id and m.site_id = s.id
       where t.name <> 'Csere'
       group by t.name, s.name, t.sort_order, t.id
       order by t.sort_order, t.id`
    ),
    query<{ id: string; type: string; qty: number; from_site: string | null; to_site: string; mikor: string }>(
      `select m.id::text, t.name as type, m.qty, fs.name as from_site, s.name as to_site,
         to_char(m.created_at at time zone 'Europe/Budapest', 'MM.DD. HH24:MI') as mikor
       from keszlet_movements m
       join pallet_types t on t.id = m.type_id
       join sites s on s.id = m.site_id
       left join sites fs on fs.id = m.target_site_id
       where m.direction = 'mozgatas_be' and m.elfogadva_at is null
       order by m.created_at`
    ),
  ]);

  const tipusMap = new Map<string, KeszletTipusSor>();
  const telepOsszes = new Map<string, number>();
  for (const r of keszletRows) {
    const qty = Number(r.qty);
    let sor = tipusMap.get(r.type);
    if (!sor) {
      sor = { tipus: r.type, osszes: 0, telepenkent: {} };
      tipusMap.set(r.type, sor);
    }
    sor.telepenkent[r.site] = qty;
    sor.osszes += qty;
    telepOsszes.set(r.site, (telepOsszes.get(r.site) ?? 0) + qty);
  }

  const rang = (nev: string) => {
    const i = KESZLET_TELEP_SORREND.indexOf(nev);
    return i === -1 ? KESZLET_TELEP_SORREND.length : i;
  };
  const telepek = Array.from(telepOsszes, ([nev, osszes]) => ({ nev, osszes })).sort(
    (a, b) => rang(a.nev) - rang(b.nev) || a.nev.localeCompare(b.nev, "hu")
  );

  return {
    telepek,
    // A sehol sem lévő (és úton sem lévő) típusokat nem soroljuk fel — csak
    // zajt jelentenének.
    tipusok: Array.from(tipusMap.values()).filter(
      (t) =>
        Object.values(t.telepenkent).some((q) => q !== 0) || utonRows.some((u) => u.type === t.tipus)
    ),
    uton: utonRows.map((r) => ({
      id: r.id,
      tipus: r.type,
      qty: Number(r.qty),
      honnan: r.from_site,
      hova: r.to_site,
      mikor: r.mikor,
    })),
  };
}
