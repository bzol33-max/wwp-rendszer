// Fuvarozás 2 — a bérfuvarok rakott km-e (Budaházi Zoltán, 2026-09-29).
//
// A Ma oldal 3. csempéje (havi átlag km-díj) = fuvardíj ÷ rakott km. A rakott
// km a felrakótól a megállókon át az utolsó lerakóig tartó útvonal hossza a
// HU-GO útvonaltervező szerint (ugyanaz, amit a Kalkulátor is használ: J5,
// EURO6, 40 t). A megállók sorrendje a megbízás szövege (felrako, majd
// lerako, „+”/„;” bontással) — ugyanaz, mint a GPS-felismerésé.
//
// Háttérben számoljuk és a sorra írjuk (rakott_km), mert külső szolgáltatás;
// a rakott_km_kulcs az útvonal szövege, amire számoltuk: ha a megbízás
// felrakója/lerakója változik, újraszámoljuk. Ha egy cím nem geokódolható
// vagy az útvonaltervező hibázik, a rakott_km_hiba-ba kerül az ok, és addig
// nem próbáljuk újra, amíg az útvonal szövege nem változik.

import { query } from "@/lib/db";
import { calculateToll, geocodeAddress, TollCalcError } from "@/lib/fuvarozas/utdijkalkulacio";
import { bontsMegallokra, cimKulcs } from "@/lib/fuvarozas/varos";

type Pont = { lat: number; lon: number };
export type RakottKmSzolgaltatas = {
  /** null = a cím nem található (végleges); dobás = átmeneti hiba. */
  geokod: (cim: string) => Promise<Pont | null>;
  utvonalKm: (pontok: Pont[]) => Promise<number>;
};

/**
 * A helyszín-szótár (a sofőr által rögzített pont) előbb, aztán geokódolás.
 * Szándékosan NEM a geokodolCachelve: az a hálózati hibát is „nincs találat”-
 * nak veszi, itt viszont az végleges jelölés lenne — az átmeneti hiba dobjon.
 */
async function geokod(cim: string): Promise<Pont | null> {
  const kulcs = cimKulcs(cim);
  if (kulcs) {
    const [sz] = await query<{ lat: number; lon: number }>(`select lat, lon from fuvar_helyszin_koordinata where cim_kulcs = $1`, [kulcs]);
    if (sz) return { lat: Number(sz.lat), lon: Number(sz.lon) };
  }
  try {
    const t = await geocodeAddress(cim);
    return { lat: t.lat, lon: t.lon };
  } catch (err) {
    if (err instanceof TollCalcError) return null;
    throw err;
  }
}

const ALAP: RakottKmSzolgaltatas = {
  geokod,
  utvonalKm: async (pontok) => (await calculateToll({ points: pontok, vehicleCategory: "J5", euroCategory: "EURO6", weight: 40 })).distanceKm,
};

/** Az útvonal szövege, amire a km-t számoljuk — ha ez változik, újra kell. */
export function rakottKmKulcs(felrako: string | null, lerako: string | null): string {
  return [...bontsMegallokra(felrako), "→", ...bontsMegallokra(lerako)].join(" | ");
}

/** Egy fuvar rakott km-e; végleges hiba esetén az ok szövegesen, átmenetinél dob. */
async function szamoljRakottKmet(felrako: string | null, lerako: string | null, sz: RakottKmSzolgaltatas): Promise<{ km: number } | { hiba: string }> {
  const cimek = [...bontsMegallokra(felrako), ...bontsMegallokra(lerako)];
  if (cimek.length < 2) return { hiba: "kevesebb mint két megálló" };
  const pontok: (Pont | null)[] = [];
  for (const c of cimek) pontok.push(await sz.geokod(c));
  const hianyzo = cimek.filter((_, i) => !pontok[i]);
  if (hianyzo.length > 0) return { hiba: `nem található cím: ${hianyzo.join("; ")}` };
  try {
    const km = await sz.utvonalKm(pontok as Pont[]);
    return km > 0 ? { km } : { hiba: "az útvonaltervező 0 km-t adott" };
  } catch (err) {
    if (err instanceof TollCalcError) return { hiba: err.message };
    throw err;
  }
}

/**
 * A bérfuvarok hiányzó (vagy elavult útvonalú) rakott km-e, az előző hónap
 * elejétől, legfeljebb `korlat` fuvar egy körben. Átmeneti (hálózati) hibánál
 * a kör megáll, a következő újra próbálja.
 */
export async function potoldRakottKmet(korlat = 30, sz: RakottKmSzolgaltatas = ALAP): Promise<{ szamolt: number; hibas: number }> {
  const sorok = await query<{ id: string; felrako: string | null; lerako: string | null; rakott_km_kulcs: string | null }>(
    `select m.id::text, m.felrako, m.lerako, m.rakott_km_kulcs
     from fuvar_megbizasok m
     where m.torolt_at is null and m.jelleg = 'ber'
       and m.datum >= date_trunc('month', (now() at time zone 'Europe/Budapest')::date) - interval '1 month'
     order by m.datum desc, m.id desc`
  );
  let szamolt = 0, hibas = 0;
  for (const s of sorok) {
    if (szamolt + hibas >= korlat) break;
    const kulcs = rakottKmKulcs(s.felrako, s.lerako);
    if (s.rakott_km_kulcs === kulcs) continue;
    let eredmeny: Awaited<ReturnType<typeof szamoljRakottKmet>>;
    try {
      eredmeny = await szamoljRakottKmet(s.felrako, s.lerako, sz);
    } catch (err) {
      // Átmeneti (hálózati) hiba: valószínűleg a többinél is az lenne — a kör itt megáll, a következő újrapróbálja.
      console.error(`[rakott-km] #${s.id} átmeneti hiba, a következő kör újrapróbálja:`, err instanceof Error ? err.message : err);
      break;
    }
    if ("km" in eredmeny) {
      await query(`update fuvar_megbizasok set rakott_km = $2, rakott_km_kulcs = $3, rakott_km_hiba = null where id = $1`, [s.id, eredmeny.km, kulcs]);
      szamolt++;
    } else {
      await query(`update fuvar_megbizasok set rakott_km = null, rakott_km_kulcs = $3, rakott_km_hiba = $2 where id = $1`, [s.id, eredmeny.hiba, kulcs]);
      console.log(`[rakott-km] #${s.id} nem számolható: ${eredmeny.hiba}`);
      hibas++;
    }
  }
  return { szamolt, hibas };
}
