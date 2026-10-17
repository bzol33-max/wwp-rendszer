import "server-only";

// Fuvarozás 2. kör · Kocsi-sávok betöltője a Kocsik / Ma laphoz
// (docs/fuvarozas-2-kor-terv.md, „Kocsi-sáv betöltő és felület (Dev A)”).
// A már betöltött Ma-vászonból dolgozik; ami új: a Tervezés hete (szabad nap,
// rés — 2,5 mp időkorláttal) és a döntésre váró bérmegbízások száma.
// SOHA NEM DOB: hiba vagy időtúllépés esetén a sáv szabad nap nélkül jelenik meg.

import { query } from "@/lib/db";
import { requireSession } from "@/lib/auth/dal";
import type { MaVaszon } from "@/lib/fuvarozas2/ma-vaszon";
import { getTervezesHet, type TervezesHet } from "@/lib/fuvarozas2/tervezes-het";
import { ablakKezdet, type VisszfuvarRiasztas } from "@/lib/fuvarozas2/tervezes-het-alap";
import { kocsiSav, type KocsiSav } from "@/lib/fuvarozas2/kocsi-sav-alap";

const IDOKORLAT_MS = 2_500;

/** Visszfuvar-riasztás a hét hétfőjével (a Tervezés-link `het` paraméteréhez). */
export type Riasztas = VisszfuvarRiasztas & { hetKezdet: string };
export type KocsiSavok = { savok: KocsiSav[]; dontesreVar: { bejovo: number; kocsiraVar: number }; riasztasok: Riasztas[] };

/** A Tervezés hete legfeljebb 2,5 mp-ig; hiba/időtúllépés → null. A számítás a háttérben lefuthat. */
// 90 mp-es tár a hét-számításra (QA #1): a Ma lap 5 percenként frissül, péntek–szombat
// két hetet is betölt — ne számoljon újra minden betöltésnél. Hiba nem kerül a tárba.
const HET_TAR_MS = 90_000;
const hetTar = new Map<string, { lejar: number; ertek: Promise<TervezesHet | null> }>();

function hetTarbol(het: string | undefined): Promise<TervezesHet | null> {
  const kulcs = het ?? "ma";
  const most = Date.now();
  const van = hetTar.get(kulcs);
  if (van && van.lejar > most) return van.ertek;
  const ertek = getTervezesHet(undefined, het);
  hetTar.set(kulcs, { lejar: most + HET_TAR_MS, ertek });
  ertek.catch(() => { if (hetTar.get(kulcs)?.ertek === ertek) hetTar.delete(kulcs); });
  return ertek;
}

async function hetIdokorlattal(het?: string): Promise<TervezesHet | null> {
  let idozito: ReturnType<typeof setTimeout> | undefined;
  try {
    const szamitas = hetTarbol(het).catch((err: unknown) => {
      console.warn("[kocsi-sav] a hét nem tölthető:", err instanceof Error ? err.message : err);
      return null;
    });
    const korlat = new Promise<null>((resolve) => {
      idozito = setTimeout(() => resolve(null), IDOKORLAT_MS);
    });
    const ered = await Promise.race([szamitas, korlat]);
    if (ered === null) console.warn("[kocsi-sav] a hét nincs meg 2,5 mp alatt — a sávok szabad nap nélkül");
    return ered;
  } catch (err) {
    console.warn("[kocsi-sav] a hét nem tölthető:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    if (idozito) clearTimeout(idozito);
  }
}

/**
 * Döntésre váró bérmegbízások — ugyanaz a feltétel, mint a Tervezés
 * „Bejövő megbízások — döntés” listájában (lib/fuvarozas2/tervezo.ts,
 * getTervezo: `fuvarok` lekérdezés + `bejovoFuvarok` szűrő), egy count(*)-ként.
 * Hiba → 0 (a sor egyszerűen elmarad).
 */
async function bejovoDb(): Promise<number> {
  try {
    const [sor] = await query<{ db: string }>(
      `select count(*)::text as db
       from fuvar_megbizasok m
       left join fuvar_jarmuvek j on j.id = m.jarmu_id
       where m.torolt_at is null and m.allapot is not null and m.datum is not null
         and m.jelleg = 'ber'
         and coalesce(m.lerakas_datum, m.datum) >= (now() at time zone 'Europe/Budapest')::date - 14
         and (m.allapot = 'ellenorzesre_var' or (m.allapot = 'tervezett' and j.kod is null))`
    );
    return Number(sor?.db ?? 0) || 0;
  } catch (err) {
    console.warn("[kocsi-sav] bejövő megbízások nem számolhatók:", err instanceof Error ? err.message : err);
    return 0;
  }
}

export type KocsiSavElotoltes = Promise<[TervezesHet | null, number, TervezesHet | null]>;

/**
 * A hét és a bejövő-szám betöltésének elindítása (soha nem utasít el) — a lap a
 * getMaVaszon()-nal PÁRHUZAMOSAN indíthatja, így a 2,5 mp-es korlát nem adódik
 * hozzá a Ma-vászon idejéhez.
 */
/** Csak aki a Fuvarozást látja (nem az Elszámolás-hatókör), annak számolunk — a link a Tervezésre visz (QA #2). */
async function latjaFuvarozast(): Promise<boolean> {
  try { return (await requireSession()).can("fuvarozas").view; } catch { return false; }
}

/** A bejövő-szám 2,5 mp korláttal (QA #3) — a Ma lap nem várhat rá. */
async function bejovoKorlattal(): Promise<number> {
  if (!(await latjaFuvarozast())) return -1;
  let idozito: ReturnType<typeof setTimeout> | undefined;
  const korlat = new Promise<number>((resolve) => { idozito = setTimeout(() => resolve(0), IDOKORLAT_MS); });
  try { return await Promise.race([bejovoDb(), korlat]); } finally { if (idozito) clearTimeout(idozito); }
}

export async function elotoltKocsiSavok(): KocsiSavElotoltes {
  // Pénteken / hétvégén a következő munkanap (hétfő) a jövő héten van — a riasztáshoz azt is betöltjük.
  // A hét-tár felhasználók közt közös → csak Fuvarozás-joggal töltjük (a getTervezesHet jogellenőrzése a tár miatt nem futna le mindenkinél).
  if (!(await latjaFuvarozast())) return [null, -1, null];
  // Az alapablak (egy munkanap vissza + előre) mindig tartalmazza a következő munkanapot — elég egy betöltés.
  return Promise.all([hetIdokorlattal(), bejovoKorlattal(), Promise.resolve(null)]);
}

function riasztasokBol(...hetek: (TervezesHet | null)[]): Riasztas[] {
  const ki: Riasztas[] = [];
  const latott = new Set<string>();
  for (const h of hetek) {
    for (const r of h?.riasztasok ?? []) {
      const kulcs = `${r.res.kocsi}|${r.res.nap}|${r.res.honnan}|${r.res.hova}`;
      if (latott.has(kulcs)) continue;
      latott.add(kulcs);
      ki.push({ ...r, hetKezdet: h!.hetKezdet });
    }
  }
  return ki.sort((a, b) => a.res.nap.localeCompare(b.res.nap) || b.res.km - a.res.km);
}

export async function getKocsiSavok(vaszon: MaVaszon, elotoltes?: KocsiSavElotoltes): Promise<KocsiSavok> {
  const [het, bejovo, kovHet] = await (elotoltes ?? elotoltKocsiSavok());
  const riasztasok = bejovo < 0 ? [] : riasztasokBol(het, kovHet);
  const hetKezdet = het?.hetKezdet ?? ablakKezdet(vaszon.ma);
  let savok: KocsiSav[] = [];
  try {
    savok = vaszon.kocsik.map((k) => {
      const kod = k.kod ?? k.cimke;
      return kocsiSav({
        kod,
        sofor: k.sofor ?? k.cimke,
        helykitolto: k.helykitolto,
        allapot: k.allapot,
        hetiSor: k.hetiSor,
        sorok: k.sorok,
        holnap: k.holnap.map((b) => ({ partner: b.partner, utvonal: b.utvonal })),
        het: vaszon.kihasznaltsag?.kocsik.find((x) => x.kod === kod)?.het ?? null,
        ma: vaszon.ma,
        hetKezdet,
        cellak: het?.kocsik.find((x) => x.kod === kod)?.cellak ?? [],
        resek: het?.resek.filter((r) => r.kocsi === kod) ?? [],
      });
    });
  } catch (err) {
    console.warn("[kocsi-sav] a sávok nem állíthatók össze:", err instanceof Error ? err.message : err);
    savok = [];
  }
  // -1: nincs Fuvarozás-joga → a „Döntésre vár” sor nem jelenik meg.
  if (bejovo < 0) return { savok, dontesreVar: { bejovo: 0, kocsiraVar: 0 }, riasztasok };
  return { savok, dontesreVar: { bejovo, kocsiraVar: vaszon.kocsiNelkul.length }, riasztasok };
}
