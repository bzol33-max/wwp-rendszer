// Ecofleet telemetria tény-réteg — DB-hozzáférés (db/migrations/041_jarmu_telemetria.sql).
// Jármű-azonosítás KIZÁRÓLAG fuvar_jarmuvek.ecofleet_object_id alapján.
// Szerver-oldali modul (lib/db.ts-en át a pg poolt használja) — kliens-komponens ne importálja.

import { query } from "@/lib/db";
import { tachoAllapotLastDatabol, type CanNap, type TachoAllapot } from "@/lib/ecofleet/szamitas";

/** Egy mentendő tachó-pillanat: a már feloldott jármű + a számolt állapot + a nyers getLastData-sor. */
export type TachoPillanatBemenet = {
  jarmuId: number | string;
  tacho: TachoAllapot;
  nyers: unknown;
};

/**
 * Tachó-pillanatok mentése. Ugyanaz a minta (ecofleet_object_id + adat_idopont)
 * kétszer nem kerül be. Visszaad: ténylegesen beszúrt sorok száma.
 */
export async function mentTachoPillanatok(sorok: TachoPillanatBemenet[]): Promise<number> {
  let uj = 0;
  for (const s of sorok) {
    const t = s.tacho;
    const r = await query<{ id: string }>(
      `insert into jarmu_tacho_pillanat
         (jarmu_id, ecofleet_object_id, adat_idopont, allapot, napi_hatra_perc, heti_hatra_perc,
          heti_vezetes_perc, muszak_hatra_perc, munkaido_hatra_perc, csokkentett_pihenok,
          hosszabbitott_vezetesek, nyers)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
       on conflict (ecofleet_object_id, adat_idopont) do nothing
       returning id::text`,
      [
        s.jarmuId,
        t.objectId,
        t.adatIdopont,
        t.allapot,
        t.napiVezetesHatraPerc,
        t.hetiVezetesHatraPerc,
        t.hetiVezetesPerc,
        t.muszakHatraPerc,
        t.munkaidoHatraPerc,
        t.csokkentettPihenok,
        t.hosszabbitottVezetesek,
        JSON.stringify(s.nyers ?? null),
      ]
    );
    uj += r.length;
  }
  return uj;
}

/** Egy jármű egy napjának CAN-összesítése (upsert a (jarmu_id, nap) kulcsra). `nap`: "YYYY-MM-DD". */
export async function mentCanNap(jarmuId: number | string, nap: string, canNap: CanNap): Promise<void> {
  await query(
    `insert into jarmu_can_nap
       (jarmu_id, nap, liter_can, km_can, l100, tankolasok, szerviz_hatra_km, szerviz_megbizhato,
        tengely_terheles, minta_db, frissitve)
     values ($1, $2::date, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb, $10, now())
     on conflict (jarmu_id, nap) do update set
       liter_can = excluded.liter_can,
       km_can = excluded.km_can,
       l100 = excluded.l100,
       tankolasok = excluded.tankolasok,
       szerviz_hatra_km = excluded.szerviz_hatra_km,
       szerviz_megbizhato = excluded.szerviz_megbizhato,
       tengely_terheles = excluded.tengely_terheles,
       minta_db = excluded.minta_db,
       frissitve = now()`,
    [
      jarmuId,
      nap,
      canNap.literCan,
      canNap.kmCan,
      canNap.l100,
      JSON.stringify(canNap.tankolasok ?? []),
      canNap.szervizHatraKm === null ? null : Math.round(canNap.szervizHatraKm),
      canNap.szervizMegbizhato,
      canNap.tengelyTerhelesKg === null ? null : JSON.stringify(canNap.tengelyTerhelesKg),
      canNap.mintaDb,
    ]
  );
}

type TachoDbSor = {
  kod: string;
  ecofleet_object_id: string;
  adat_idopont: Date | null;
  rogzitve: Date;
  allapot: string | null;
  napi_hatra_perc: number | null;
  heti_hatra_perc: number | null;
  heti_vezetes_perc: number | null;
  muszak_hatra_perc: number | null;
  munkaido_hatra_perc: number | null;
  csokkentett_pihenok: number | null;
  hosszabbitott_vezetesek: number | null;
  nyers: unknown;
};

/**
 * Járművenként a legutóbbi tachó-pillanat, `fuvar_jarmuvek.kod` szerint
 * (pl. "NMZ-492"). A frissességet a hívó dönti el (`tachoFriss`).
 */
export async function legutobbiTacho(): Promise<Map<string, { tacho: TachoAllapot; rogzitve: Date }>> {
  const sorok = await query<TachoDbSor>(
    `select j.kod, p.ecofleet_object_id, p.adat_idopont, p.rogzitve, p.allapot, p.napi_hatra_perc,
            p.heti_hatra_perc, p.heti_vezetes_perc, p.muszak_hatra_perc, p.munkaido_hatra_perc,
            p.csokkentett_pihenok, p.hosszabbitott_vezetesek, p.nyers
       from fuvar_jarmuvek j
       cross join lateral (
         select * from jarmu_tacho_pillanat p
          where p.jarmu_id = j.id
          order by p.rogzitve desc, p.id desc
          limit 1
       ) p`
  );
  const ki = new Map<string, { tacho: TachoAllapot; rogzitve: Date }>();
  for (const s of sorok) {
    // A nem oszlopként tárolt mezők (állapot kezdete, következő napi pihenő) a nyers sorból.
    const nyersbol = tachoAllapotLastDatabol(s.nyers);
    ki.set(s.kod, {
      rogzitve: s.rogzitve,
      tacho: {
        objectId: s.ecofleet_object_id,
        allapot: s.allapot,
        allapotKezdete: nyersbol?.allapotKezdete ?? null,
        napiVezetesHatraPerc: s.napi_hatra_perc,
        hetiVezetesHatraPerc: s.heti_hatra_perc,
        hetiVezetesPerc: s.heti_vezetes_perc,
        muszakHatraPerc: s.muszak_hatra_perc,
        munkaidoHatraPerc: s.munkaido_hatra_perc,
        kovetkezoNapiPihenoPerc: nyersbol?.kovetkezoNapiPihenoPerc ?? null,
        csokkentettPihenok: s.csokkentett_pihenok,
        hosszabbitottVezetesek: s.hosszabbitott_vezetesek,
        adatIdopont: s.adat_idopont,
      },
    });
  }
  return ki;
}

/** Egy `jarmu_can_nap` sor, típusosan. `nap`: "YYYY-MM-DD". */
export type CanNapSor = {
  jarmuId: string;
  nap: string;
  literCan: number | null;
  kmCan: number | null;
  l100: number | null;
  tankolasok: CanNap["tankolasok"];
  szervizHatraKm: number | null;
  szervizMegbizhato: boolean;
  tengelyTerhelesKg: Record<string, number> | null;
  mintaDb: number;
  frissitve: Date;
};

/** Egy jármű CAN-napjai `tolNap`..`igNap` között (mindkettő "YYYY-MM-DD", zárt intervallum), nap szerint növekvően. */
export async function canNapok(jarmuId: number | string, tolNap: string, igNap: string): Promise<CanNapSor[]> {
  return (await canNapokTobb([jarmuId], tolNap, igNap)).get(String(jarmuId)) ?? [];
}

/**
 * Több jármű napi CAN-sorai EGY lekérdezéssel (audit P3): a Kocsik és a
 * Járművek lap eddig járművenként külön kérdezett. Minden kért járműnek van
 * bejegyzése (adat nélkül üres tömb), mint a canNapok-nál.
 */
export async function canNapokTobb(jarmuIdk: (number | string)[], tolNap: string, igNap: string): Promise<Map<string, CanNapSor[]>> {
  const ki = new Map<string, CanNapSor[]>(jarmuIdk.map((id) => [String(id), []]));
  if (jarmuIdk.length === 0) return ki;
  const sorok = await query<{
    jarmu_id: string;
    nap: string;
    liter_can: number | null;
    km_can: number | null;
    l100: number | null;
    tankolasok: CanNap["tankolasok"] | null;
    szerviz_hatra_km: number | null;
    szerviz_megbizhato: boolean;
    tengely_terheles: Record<string, number> | null;
    minta_db: number;
    frissitve: Date;
  }>(
    `select jarmu_id::text, nap::text, liter_can, km_can, l100, tankolasok, szerviz_hatra_km,
            szerviz_megbizhato, tengely_terheles, minta_db, frissitve
       from jarmu_can_nap
      where jarmu_id = any($1::bigint[]) and nap between $2::date and $3::date
      order by jarmu_id, nap`,
    [jarmuIdk.map(String), tolNap, igNap]
  );
  for (const s of sorok) {
    ki.get(s.jarmu_id)?.push({
      jarmuId: s.jarmu_id,
      nap: s.nap,
      literCan: s.liter_can,
      kmCan: s.km_can,
      l100: s.l100,
      tankolasok: Array.isArray(s.tankolasok) ? s.tankolasok : [],
      szervizHatraKm: s.szerviz_hatra_km,
      szervizMegbizhato: s.szerviz_megbizhato,
      tengelyTerhelesKg: s.tengely_terheles,
      mintaDb: s.minta_db,
      frissitve: s.frissitve,
    });
  }
  return ki;
}

/** Webhook-esemény mentése idempotensen: "uj", ha most került be; "ismetelt", ha a kulcs már ismert. */
export async function webhookMent(kulcs: string, payload: unknown): Promise<"uj" | "ismetelt"> {
  const r = await query<{ id: string }>(
    `insert into ecofleet_webhook_esemeny (kulcs, payload) values ($1, $2::jsonb)
     on conflict (kulcs) do nothing
     returning id::text`,
    [kulcs, JSON.stringify(payload ?? null).replace(/\\u0000/g, "")] // a jsonb nem fogad \u0000-t (QA #8)
  );
  return r.length > 0 ? "uj" : "ismetelt";
}

// ── A gyűjtő belső segédjei ──────────────────────────────────────────────

export type EcofleetJarmu = { id: string; kod: string; objectId: string; aktiv: boolean };

/** Minden jármű, amelynek van Ecofleet objectId-ja (a gyűjtő ezzel azonosít). */
export async function ecofleetJarmuvek(): Promise<EcofleetJarmu[]> {
  return query<EcofleetJarmu>(
    `select id::text as id, kod, btrim(ecofleet_object_id) as "objectId", aktiv
       from fuvar_jarmuvek
      where coalesce(btrim(ecofleet_object_id), '') <> ''
      order by id`
  );
}

/** A `napok`-nál régebben rögzített tachó-pillanatok törlése; visszaad: törölt sorok száma. */
export async function torolRegiTachoPillanatok(napok = 30): Promise<number> {
  const r = await query<{ id: string }>(
    `delete from jarmu_tacho_pillanat where rogzitve < now() - make_interval(days => $1) returning id::text`,
    [napok]
  );
  return r.length;
}
