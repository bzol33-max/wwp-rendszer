import "server-only";

// Fuvarozás 2 · Kocsi lapja (/fuvarozas2/kocsi/[kod]) — docs/fuvarozas-2-kor-terv.md,
// „Kocsi lapja (Dev B)”. Egy kocsi mindene egy helyen: fej, Ma, a hét,
// kihasználtság, telemetria. Csak olvas, a meglévő betöltőket hívja (nem
// duplikál lekérdezést). Minden blokk külön hibatűrő: ha a forrása hibázik vagy
// 2,5 mp-nél tovább tart, a blokk `null` („most nem elérhető”), a lap többi
// része megjelenik.

import { query } from "@/lib/db";
import { requireViewPermission } from "@/lib/auth/require-permission";
import { getMaVaszon, type MaKocsi } from "@/lib/fuvarozas2/ma-vaszon";
import { getTervezesHet } from "@/lib/fuvarozas2/tervezes-het";
import { getKihasznaltsag, type KihasznaltsagKocsi } from "@/lib/fuvarozas2/kihasznaltsag";
import type { NapCella } from "@/lib/fuvarozas2/tervezes-het-alap";
import { canNapok, type CanNapSor } from "@/lib/jarmu-telemetria/repo";
import { budapestNapISO } from "@/lib/fuvarozas/idozona";

export const BLOKK_IDOKORLAT_MS = 2500;
// A Ma és a Hét a lap fő tartalma: a Ma lap sem ad fel rájuk 2,5 mp után, itt is tovább várunk.
const MA_IDOKORLAT_MS = 20_000;
const HET_IDOKORLAT_MS = 10_000;

/** Lejár vagy hibázik → null (soha nem dob). Az elengedett ígéret hibáját elnyeli. */
async function korlattal<T>(fn: () => Promise<T>, ms = BLOKK_IDOKORLAT_MS, nev = "blokk"): Promise<T | null> {
  let idozito: ReturnType<typeof setTimeout> | undefined;
  try {
    const igeret = fn();
    igeret.catch(() => {});
    const korlat = new Promise<null>((resolve) => {
      idozito = setTimeout(() => {
        console.warn(`[kocsi-lap] ${nev}: időtúllépés (${ms} ms)`);
        resolve(null);
      }, ms);
    });
    return await Promise.race([igeret, korlat]);
  } catch (err) {
    console.warn(`[kocsi-lap] ${nev}:`, err instanceof Error ? err.message : err);
    return null;
  } finally {
    if (idozito) clearTimeout(idozito);
  }
}

function napEltol(nap: string, delta: number): string {
  const d = new Date(`${nap}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export type KocsiLapJarmu = { id: string; kod: string; cimke: string; vontato: string | null; potkocsi: string | null };

export type KocsiLap = {
  ma: string;
  jarmu: KocsiLapJarmu;
  /** A Ma lap kocsi-eleme (fej + Ma kártya); null: nem elérhető. */
  maBlokk: { kocsi: MaKocsi | null; holnapCimke: string } | null;
  /** A kocsi sora a Tervezés · Hétből; null: nem elérhető. */
  het: { napok: string[]; ma: string; sofor: string | null; cellak: NapCella[] | null; tacho: string | null } | null;
  kihasznaltsag: { het: { cim: string }; honap: { cim: string }; kocsi: KihasznaltsagKocsi | null } | null;
  /** jarmu_can_nap, ma−7..ma; null: nem elérhető. */
  telemetria: CanNapSor[] | null;
};

/**
 * A kocsi lapjának adata. `null`, ha a kód ismeretlen (→ 404). Ha maga a
 * járműtábla nem olvasható, dob (a lap hibája — enélkül semmit sem mutatunk).
 */
export async function getKocsiLap(kod: string): Promise<KocsiLap | null> {
  await requireViewPermission("fuvarozas");
  const [j] = await query<{ id: string; kod: string; cimke: string; vontato_rendszam: string | null; potkocsi_rendszam: string | null }>(
    `select id::text, kod, cimke, vontato_rendszam, potkocsi_rendszam from fuvar_jarmuvek where kod = $1`,
    [kod]
  );
  if (!j) return null;
  const ma = budapestNapISO();

  const [maV, hetV, kihV, telV] = await Promise.all([
    korlattal(() => getMaVaszon(), MA_IDOKORLAT_MS, "ma"),
    korlattal(() => getTervezesHet(), HET_IDOKORLAT_MS, "het"),
    korlattal(() => getKihasznaltsag(ma), BLOKK_IDOKORLAT_MS, "kihasznaltsag"),
    korlattal(() => canNapok(j.id, napEltol(ma, -7), ma), BLOKK_IDOKORLAT_MS, "telemetria"),
  ]);

  const hetKocsi = hetV?.kocsik.find((k) => k.kod === j.kod) ?? null;
  return {
    ma,
    jarmu: { id: j.id, kod: j.kod, cimke: j.cimke, vontato: j.vontato_rendszam, potkocsi: j.potkocsi_rendszam },
    maBlokk: maV ? { kocsi: maV.kocsik.find((k) => k.kod === j.kod) ?? null, holnapCimke: maV.holnapCimke } : null,
    het: hetV
      ? { napok: hetV.napok, ma: hetV.ma, sofor: hetKocsi?.sofor ?? null, cellak: hetKocsi?.cellak ?? null, tacho: hetKocsi?.tacho?.chip ?? null }
      : null,
    kihasznaltsag: kihV
      ? { het: { cim: kihV.het.cim }, honap: { cim: kihV.honap.cim }, kocsi: kihV.kocsik.find((k) => k.kod === j.kod) ?? null }
      : null,
    telemetria: telV,
  };
}
