"use server";

// A mobil összefoglaló nézet (/mobil) egyetlen kombinált lekérdezése —
// szándékosan csak azt gyűjti össze, amit a nézet ténylegesen mutat (mai
// EUR világos/szürke felvásárlás + kassza a Készletből, kocsinkénti mai
// megbízások a Fuvarozásból), NEM a teljes napi/GPS-idővonalat (az
// getIdovonalak() drága Ecofleet-hívásokat is végez, ide nem kell).

import { query } from "@/lib/db";
import { budapestNapISO } from "@/lib/fuvarozas/idozona";
import { getMaiSajatFuvarok, getMaiValodiSajatFuvarok } from "@/lib/fuvarozas/megbizasok";
import { SAJAT_JARMUVEK, resolveJarmu, jarmuLabel, type SajatJarmu } from "@/lib/fuvarozas/vehicles";
import type { MaiFuvarSor } from "@/lib/fuvarozas/fuvar-constants";

export type MobilFuvarTetel = {
  id: string;
  // A UI-ban megszokott (történelmi okokból fordított DB-elnevezésű)
  // címkézést követi — lásd lib/fuvarozas/megbizasok.ts megjegyzését.
  cimke: "Saját" | "Bér";
  megrendelo: string | null;
  felrako: string | null;
  lerako: string;
  idopont: string | null;
};

export type MobilJarmuSor = {
  sofor: string;
  label: string;
  szin: SajatJarmu["szin"];
  fuvarok: MobilFuvarTetel[];
};

export type MobilOsszefoglalo = {
  keszlet: {
    eurVilagosMa: number;
    eurSzurkeMa: number;
    kassza: number;
  } | null;
  fuvarozas: MobilJarmuSor[] | null;
  frissitve: string;
};

function jarmuMatch(jarmu: SajatJarmu, row: MaiFuvarSor): boolean {
  if (row.jarmu && resolveJarmu(row.jarmu) === jarmu) return true;
  if (row.sofor && row.sofor.trim().toLowerCase() === jarmu.sofor.toLowerCase()) return true;
  return false;
}

async function getKeszletOsszefoglalo() {
  const typeCounterRows = await query<{ type: string; daily_qty: string }>(
    `select t.name as type,
       coalesce(sum(p.qty) filter (where p.created_at::date = current_date), 0) as daily_qty
     from pallet_types t
     join site_active_types sat on sat.type_id = t.id
     join sites s on s.id = sat.site_id
     left join nyiregyhaza_purchases p on p.type_id = t.id
     where s.name = 'Nyíregyháza' and t.name in ('EUR világos', 'EUR szürke')
     group by t.name, t.id`
  );
  const kasszaRows = await query<{ total: string }>(
    `select coalesce(sum(amount), 0) as total from kassza_movements`
  );

  const byType = Object.fromEntries(typeCounterRows.map((r) => [r.type, Number(r.daily_qty)]));

  return {
    eurVilagosMa: byType["EUR világos"] ?? 0,
    eurSzurkeMa: byType["EUR szürke"] ?? 0,
    kassza: Number(kasszaRows[0]?.total ?? 0),
  };
}

async function getFuvarozasOsszefoglalo(): Promise<MobilJarmuSor[]> {
  const nap = budapestNapISO();
  const [sajatTabRows, berTabRows] = await Promise.all([
    getMaiSajatFuvarok(nap), // tipus='sajat' — UI-n "Bér fuvarok"
    getMaiValodiSajatFuvarok(nap), // tipus='ber' — UI-n "Saját fuvarok"
  ]);

  return SAJAT_JARMUVEK.map((jarmu) => {
    const sajat: MobilFuvarTetel[] = berTabRows
      .filter((row) => jarmuMatch(jarmu, row))
      .map((row) => ({
        id: row.id,
        cimke: "Saját" as const,
        megrendelo: row.megrendelo,
        felrako: row.felrako,
        lerako: row.lerako,
        idopont: row.idopont,
      }));
    const ber: MobilFuvarTetel[] = sajatTabRows
      .filter((row) => jarmuMatch(jarmu, row))
      .map((row) => ({
        id: row.id,
        cimke: "Bér" as const,
        megrendelo: row.megrendelo,
        felrako: row.felrako,
        lerako: row.lerako,
        idopont: row.idopont,
      }));

    return {
      sofor: jarmu.sofor,
      label: jarmuLabel(jarmu),
      szin: jarmu.szin,
      fuvarok: [...sajat, ...ber],
    };
  });
}

export async function getMobilOsszefoglalo(input: {
  showKeszlet: boolean;
  showFuvarozas: boolean;
}): Promise<MobilOsszefoglalo> {
  const [keszlet, fuvarozas] = await Promise.all([
    input.showKeszlet ? getKeszletOsszefoglalo() : Promise.resolve(null),
    input.showFuvarozas ? getFuvarozasOsszefoglalo() : Promise.resolve(null),
  ]);

  return {
    keszlet,
    fuvarozas,
    frissitve: new Date().toISOString(),
  };
}
