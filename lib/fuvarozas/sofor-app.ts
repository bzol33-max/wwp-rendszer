"use server";

// A sofőr app (2026-10-21, „a 9-es terv”) szerveroldali lekérdezései — azok,
// amik a napi nézeten (getSoforNap) túlmutatnak:
//
//  - Papír vár: a kocsi lezárt, de még fuvarlevél-/szállítólevél-fotó nélküli
//    fuvarjai az utolsó 14 napból. A régi nézet csak a MAI lezártakat kérte,
//    így a hétfői papír kedden eltűnt; Budaházi Zoltán kérése, hogy a sofőr
//    lerakás után induljon tovább, és pihenőkor / este fotózzon — ehhez a
//    listának napokon át meg kell maradnia.
//  - Kész fuvarok: az utolsó 10 lezárt fuvar, papír-állapottal.
//  - Átlagfogyasztás: a kocsi CAN-adatából (jarmu_can_nap), csak liter és km.
//    Budaházi Zoltán (2026-10-21): „átlagfogyasztást láthatják”. Pénz nincs.
//
// A jog ugyanaz, mint a getSoforNap-nál: a saját adat a fuvarozas_sajat
// joggal, bárkié a teljes Fuvarozás joggal.

import { query } from "@/lib/db";
import { requireSajatVagyModulJog } from "@/lib/auth/require-permission";
import { getJarmuvek } from "@/lib/fuvarozas/jarmuvek-db";
import { findJarmuForEmployee, jarmuMatch } from "@/lib/fuvarozas/sofor-jarmu";
import { bontsMegallokra, varosNev } from "@/lib/fuvarozas/varos";
import { budapestNapISO } from "@/lib/fuvarozas/idozona";
import { canNapok } from "@/lib/jarmu-telemetria/repo";
import { fogyasztasKep, type SoforFogyasztasKep } from "@/lib/fuvarozas/sofor-app-alap";
import type { SajatJarmu } from "@/lib/fuvarozas/vehicles";

export type SoforLezartTetel = {
  fuvarId: string;
  megrendelo: string | null;
  honnan: string | null;
  hova: string | null;
  /** A lerakás (vagy a felrakás) napja, ISO. */
  nap: string | null;
  lezarvaAt: string | null;
  sajatFuvar: boolean;
  /** Van-e már feltöltött fuvarlevél-/szállítólevél-fotó. */
  papirMegvan: boolean;
};

export type SoforFogyasztas = {
  rendszam: string;
  /** Hamis, ha a kocsiról nincs CAN-adat az időszakban (a nyomkövető nem méri). */
  merve: boolean;
  kep: SoforFogyasztasKep;
};

/** A papírra váró fuvarokat ennyi napig tartjuk a listán. */
const PAPIR_VAR_NAPOK = 14;
const KESZ_DARAB = 10;

async function sajatJarmu(employeeId: string): Promise<{ jarmu: SajatJarmu; lista: SajatJarmu[] } | null> {
  await requireSajatVagyModulJog({ employeeId, sajatModule: "fuvarozas_sajat", modul: "fuvarozas", kind: "view" });
  const emp = await query<{ name: string }>(`select name from alkalmazottak where id = $1`, [employeeId]);
  if (!emp[0]?.name) return null;
  const lista = await getJarmuvek();
  const jarmu = findJarmuForEmployee({ id: employeeId, name: emp[0].name }, lista);
  return jarmu ? { jarmu, lista } : null;
}

type LezartSor = {
  id: string;
  megrendelo: string | null;
  felrako: string | null;
  lerako: string | null;
  jarmu: string | null;
  jarmu_id: string | null;
  sofor: string | null;
  tipus: string | null;
  nap: string | null;
  teljesitve_at: Date | null;
  foto_van: boolean;
};

function tetelbe(s: LezartSor): SoforLezartTetel {
  return {
    fuvarId: s.id,
    megrendelo: s.megrendelo,
    honnan: s.felrako ? varosNev(bontsMegallokra(s.felrako)[0] ?? s.felrako) : null,
    hova: s.lerako ? varosNev(bontsMegallokra(s.lerako).at(-1) ?? s.lerako) : null,
    nap: s.nap,
    lezarvaAt: s.teljesitve_at ? new Date(s.teljesitve_at).toISOString() : null,
    // tipus='ber' = "Saját fuvar" a felületen (fordított oszlopnév, lásd sofor.ts SoforFuvarBlokk.sajatFuvar).
    sajatFuvar: s.tipus === "ber",
    papirMegvan: s.foto_van,
  };
}

async function lezartFuvarok(
  employeeId: string,
  feltetel: "papir_var" | "kesz",
  limit: number
): Promise<SoforLezartTetel[]> {
  const sj = await sajatJarmu(employeeId);
  if (!sj) return [];
  const sorok = await query<LezartSor>(
    `select f.id::text, f.megrendelo, f.felrako, f.lerako, f.jarmu, f.jarmu_id::text, f.sofor, f.tipus,
            to_char(coalesce(f.lerakas_datum, f.datum), 'YYYY-MM-DD') as nap, f.teljesitve_at,
            exists (select 1 from fuvar_dokumentumok d where d.fuvar_id = f.id and d.tipus = 'fuvarlevel') as foto_van
       from fuvar_megbizasok f
      where f.torolt_at is null and f.statusz is distinct from 'torolt'
        and f.teljesitve
        and f.teljesitve_at > now() - make_interval(days => $1)
        and (
          $2 = 'kesz'
          or (coalesce(f.szamla_szam, '') = ''
              and not exists (select 1 from fuvar_dokumentumok d where d.fuvar_id = f.id and d.tipus = 'fuvarlevel'))
        )
      order by f.teljesitve_at desc
      limit 400`,
    [feltetel === "kesz" ? 60 : PAPIR_VAR_NAPOK, feltetel]
  );
  return sorok
    .filter((s) => (sj.jarmu.id != null && s.jarmu_id === sj.jarmu.id) || jarmuMatch(sj.jarmu, s, sj.lista))
    .slice(0, limit)
    .map(tetelbe);
}

/** A kocsi lezárt, de még papír-fotó nélküli fuvarjai az utolsó 14 napból, a legfrissebb elöl. */
export async function getSoforPapirVaro(employeeId: string): Promise<SoforLezartTetel[]> {
  return lezartFuvarok(employeeId, "papir_var", 30);
}

/** A kocsi utolsó 10 lezárt fuvarja, papír-állapottal. */
export async function getSoforKesz(employeeId: string): Promise<SoforLezartTetel[]> {
  return lezartFuvarok(employeeId, "kesz", KESZ_DARAB);
}

/** A kocsi átlagfogyasztása a CAN-adatból: ma, 7 nap (az előzővel összevetve), 14 nap, napi oszlopok. */
export async function getSoforFogyasztas(employeeId: string): Promise<SoforFogyasztas | null> {
  const sj = await sajatJarmu(employeeId);
  if (!sj?.jarmu.id) return null;
  const ma = budapestNapISO();
  const tol = (() => {
    const d = new Date(`${ma}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 13);
    return d.toISOString().slice(0, 10);
  })();
  const napok = await canNapok(sj.jarmu.id, tol, ma).catch((err) => {
    console.error("[sofor-app] CAN-napok:", err);
    return [];
  });
  const kep = fogyasztasKep(
    napok.map((n) => ({ nap: n.nap.slice(0, 10), liter: n.literCan, km: n.kmCan })),
    ma
  );
  return {
    rendszam: sj.jarmu.label,
    merve: kep.ketHet.km > 0,
    kep,
  };
}
