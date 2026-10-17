import "server-only";

// Fuvarozás 2. kör · Kocsi-sávok betöltője a Kocsik / Ma laphoz
// (docs/fuvarozas-2-kor-terv.md, „Kocsi-sáv betöltő és felület (Dev A)”).
// A már betöltött Ma-vászonból dolgozik; ami új: a Tervezés hete (szabad nap,
// rés — 2,5 mp időkorláttal) és a döntésre váró bérmegbízások száma.
// SOHA NEM DOB: hiba vagy időtúllépés esetén a sáv szabad nap nélkül jelenik meg.

import { query } from "@/lib/db";
import type { MaVaszon } from "@/lib/fuvarozas2/ma-vaszon";
import { getTervezesHet, type TervezesHet } from "@/lib/fuvarozas2/tervezes-het";
import { tervHetNapjai } from "@/lib/fuvarozas2/tervezes-het-alap";
import { kocsiSav, type KocsiSav } from "@/lib/fuvarozas2/kocsi-sav-alap";

const IDOKORLAT_MS = 2_500;

export type KocsiSavok = { savok: KocsiSav[]; dontesreVar: { bejovo: number; kocsiraVar: number } };

/** A Tervezés hete legfeljebb 2,5 mp-ig; hiba/időtúllépés → null. A számítás a háttérben lefuthat. */
async function hetIdokorlattal(): Promise<TervezesHet | null> {
  let idozito: ReturnType<typeof setTimeout> | undefined;
  try {
    const szamitas = getTervezesHet().catch((err: unknown) => {
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

export type KocsiSavElotoltes = Promise<[TervezesHet | null, number]>;

/**
 * A hét és a bejövő-szám betöltésének elindítása (soha nem utasít el) — a lap a
 * getMaVaszon()-nal PÁRHUZAMOSAN indíthatja, így a 2,5 mp-es korlát nem adódik
 * hozzá a Ma-vászon idejéhez.
 */
export async function elotoltKocsiSavok(): KocsiSavElotoltes {
  return Promise.all([hetIdokorlattal(), bejovoDb()]);
}

export async function getKocsiSavok(vaszon: MaVaszon, elotoltes?: KocsiSavElotoltes): Promise<KocsiSavok> {
  const [het, bejovo] = await (elotoltes ?? elotoltKocsiSavok());
  const hetKezdet = het?.hetKezdet ?? tervHetNapjai(vaszon.ma)[0];
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
  return { savok, dontesreVar: { bejovo, kocsiraVar: vaszon.kocsiNelkul.length } };
}
