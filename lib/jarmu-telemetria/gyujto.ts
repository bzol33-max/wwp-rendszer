// Ecofleet telemetria gyűjtő — az ütemező (gyujto-scheduler.ts) hívja.
// Szabályok (docs/ecofleet-telemetria-terv.md 3. pont):
// - jármű-azonosítás KIZÁRÓLAG fuvar_jarmuvek.ecofleet_object_id alapján;
//   ismeretlen objectId → kihagyva + console.warn (folyamatonként egyszer);
// - Ecofleet-hiba: maszkolt console.error, a kör megy tovább a következő kocsival;
// - sikertelen lekérés SOHA nem kerül 0-ként mentésre.

import { ecofleetJson, getLastDataCachelve, maszkoltUzenet } from "@/lib/ecofleet/kliens";
import { canNapNyersbol, tachoAllapotLastDatabol } from "@/lib/ecofleet/szamitas";
import { budapestNapISO } from "@/lib/fuvarozas/idozona";
import {
  ecofleetJarmuvek,
  mentCanNap,
  mentTachoPillanatok,
  torolRegiTachoPillanatok,
  type TachoPillanatBemenet,
} from "./repo";

const NAPLO = "[telemetria]";
const figyelmeztetettObjektumok = new Set<string>();

function hibaSzoveg(e: unknown): string {
  return maszkoltUzenet(e instanceof Error ? e.message : String(e));
}

export type TachoKorEredmeny = { tachoSor: number; uj: number; ismeretlen: number; idopontNelkul: number };

/** getLastData (30 s-os közös gyorsítótárból) → tachó-pillanatok mentése. Ecofleet-hiba esetén dob. */
export async function gyujtTacho(): Promise<TachoKorEredmeny> {
  const { sorok } = await getLastDataCachelve();
  const jarmuvek = await ecofleetJarmuvek();
  const objektumSzerint = new Map(jarmuvek.map((j) => [j.objectId, j]));

  const mentendo: TachoPillanatBemenet[] = [];
  let tachoSor = 0, ismeretlen = 0, idopontNelkul = 0;
  for (const sor of sorok) {
    const tacho = tachoAllapotLastDatabol(sor);
    if (!tacho) continue; // nincs tcoData → nincs mit menteni
    tachoSor++;
    const jarmu = objektumSzerint.get(tacho.objectId);
    if (!jarmu) {
      ismeretlen++;
      if (!figyelmeztetettObjektumok.has(tacho.objectId)) {
        figyelmeztetettObjektumok.add(tacho.objectId);
        console.warn(`${NAPLO} ismeretlen Ecofleet objectId (${tacho.objectId}) — nincs ilyen fuvar_jarmuvek.ecofleet_object_id, kihagyva.`);
      }
      continue;
    }
    if (!tacho.adatIdopont) {
      // Időpont nélkül nem dönthető el sem a frissesség, sem az ismétlődés.
      idopontNelkul++;
      continue;
    }
    mentendo.push({ jarmuId: jarmu.id, tacho, nyers: sor });
  }
  const uj = mentendo.length ? await mentTachoPillanatok(mentendo) : 0;
  return { tachoSor, uj, ismeretlen, idopontNelkul };
}

/** "YYYY-MM-DD" ± n nap (naptári, időzóna-független). */
function napEltol(napISO: string, n: number): string {
  const d = new Date(`${napISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export type CanKorEredmeny = { mentve: number; uresNap: number; hibak: string[] };

/**
 * Minden aktív, objectId-s kocsira a tegnapi és a mai budapesti nap
 * `Vehicles/getRawData`-ja → `canNapNyersbol` → upsert. Egy kocsi/nap hibája
 * nem állítja meg a kört; hibás vagy üres lekérés nem ír felül semmit.
 */
export async function gyujtCanNapok(most: Date = new Date()): Promise<CanKorEredmeny> {
  const ma = budapestNapISO(most);
  const napok = [napEltol(ma, -1), ma];
  const jarmuvek = (await ecofleetJarmuvek()).filter((j) => j.aktiv);

  let mentve = 0, uresNap = 0;
  const hibak: string[] = [];
  for (const j of jarmuvek) {
    for (const nap of napok) {
      try {
        const sorok = await ecofleetJson<unknown>("Vehicles/getRawData", {
          objectId: j.objectId,
          begTimestamp: `${nap} 00:00:00`,
          endTimestamp: `${nap} 23:59:59`,
        });
        if (!Array.isArray(sorok)) throw new Error("a getRawData válasza nem lista");
        const canNap = canNapNyersbol(sorok);
        if (canNap.mintaDb === 0) {
          uresNap++;
          continue;
        }
        await mentCanNap(j.id, nap, canNap);
        mentve++;
      } catch (e) {
        const uzenet = `${j.kod} ${nap}: ${hibaSzoveg(e)}`;
        hibak.push(uzenet);
        console.error(`${NAPLO} CAN-nap lekérés/mentés sikertelen — ${uzenet}`);
      }
    }
  }
  return { mentve, uresNap, hibak };
}

/** 30 napnál régebbi tachó-pillanatok törlése. */
export async function takaritTacho(napok = 30): Promise<number> {
  return torolRegiTachoPillanatok(napok);
}
