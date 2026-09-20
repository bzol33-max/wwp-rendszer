"use server";

// Fuvarozás 2 — Tervezés: heti rács és „hová kell a héten még fuvar" (10.1).
//
// A rács minden (nap × kocsi) mezője vagy megbízás, vagy ÜRES SLOT. Az üres
// slothoz megmondjuk, HOL lesz a kocsi aznap (az utolsó korábbi lerakó, ha
// nincs, a telephely), és mennyi az üres hazaút — ebből látszik, honnan
// kell fuvart keresni.
//
// Távolság: a megállók geokód-snapshotjából (vagy a helyszín-szótárból)
// LÉGVONALBAN, 1,3-as közúti szorzóval — ez becslés, a felület így is
// jelöli. Pontos km/útdíj a Kalkulátorból (HU-GO) jön, ha a slotra
// rákattintva odaviszünk egy ajánlatot. Így a heti nézet nem indít
// tucatnyi külső hívást (T1).

import { query } from "@/lib/db";
import { requireAnyViewPermission } from "@/lib/auth/require-permission";
import { geokodolCachelve } from "@/lib/fuvarozas/erintes-felismeres";
import { SAJAT_TELEPHELYEK } from "@/lib/fuvarozas/telephelyek";
import { varosNev } from "@/lib/fuvarozas/varos";
import type { Allapot } from "@/lib/fuvarozas/allapot";

// A "use server" fájl csak async függvényt exportálhat — ezek belső konstansok.
const KOZUTI_SZORZO = 1.3;

export type TervMegbizas = {
  id: string;
  allapot: Allapot;
  jelleg: "ber" | "sajat";
  partner: string | null;
  hivatkozas: string | null;
  felrako: string | null;
  lerako: string | null;
  felrakasNap: string | null;
  lerakasNap: string | null;
  fuvardij: number | null;
  penznem: string;
};

export type TervCella = {
  nap: string;
  megbizasok: TervMegbizas[];
  /** Üres nap: hol áll a kocsi (az előző fuvar utolsó lerakója vagy a telephely). */
  ures: null | { hol: string; holVaros: string; hazautKm: number | null; napokOtaUres: number };
};

export type TervSor = { kod: string; cimke: string; sofor: string | null; cellak: TervCella[] };

export type UresSlot = {
  jarmuKod: string;
  jarmuCimke: string;
  nap: string;
  hol: string;
  holVaros: string;
  hazautKm: number | null;
  /** Irányítószám-körzet a Timocom-kereséshez (az első két számjegy, ha ismert). */
  korzet: string | null;
};

export type TervHet = {
  napok: string[];
  sorok: TervSor[];
  uresSlotok: UresSlot[];
  kocsiNelkul: TervMegbizas[];
  osszesites: { munkanapok: number; foglalt: number; ures: number; berDb: number; sajatDb: number; bevetel: number };
  hetKezdet: string;
};

function napokHete(hetKezdet: string): string[] {
  const out: string[] = [];
  const d = new Date(`${hetKezdet}T12:00:00Z`);
  for (let i = 0; i < 7; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Hétfő ISO-dátuma az adott naphoz (vagy a mai héthez). */
export async function hetKezdete(nap?: string): Promise<string> {
  const [{ h }] = await query<{ h: string }>(
    `select (date_trunc('week', coalesce($1::date, (now() at time zone 'Europe/Budapest')::date)))::date::text as h`,
    [nap ?? null]
  );
  return h;
}

function tavolsagKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)) * KOZUTI_SZORZO);
}

export async function getTervHet(hetKezdet?: string): Promise<TervHet> {
  await requireAnyViewPermission(["fuvarozas", "elszamolas"]);
  const kezdet = await hetKezdete(hetKezdet);
  const napok = napokHete(kezdet);
  const veg = napok[6];

  const jarmuvek = await query<{ kod: string; cimke: string; sofor: string | null }>(
    `select j.kod, j.cimke, a.name as sofor from fuvar_jarmuvek j
     left join alkalmazottak a on a.id = j.sofor_id
     where j.aktiv and j.ecofleet_object_id is not null order by j.id`
  );

  // A hét megbízásai + az azt megelőző 10 nap (hogy tudjuk, hol áll a kocsi a hét elején).
  const sorok = await query<TervMegbizas & { jarmu_kod: string | null }>(
    `select m.id::text, m.allapot, m.jelleg, coalesce(p.nev, m.megrendelo) as partner,
       coalesce(m.hivatkozas_kanonikus, m.pozicioszam, m.reise_id) as hivatkozas,
       coalesce((select g.cim_nyers from fuvar_megallok g where g.megbizas_id = m.id and g.tipus = 'felrako' order by g.sorszam limit 1), m.felrako) as felrako,
       coalesce((select g.cim_nyers from fuvar_megallok g where g.megbizas_id = m.id and g.tipus = 'lerako' order by g.sorszam desc limit 1), m.lerako) as lerako,
       to_char(m.datum, 'YYYY-MM-DD') as "felrakasNap",
       to_char(coalesce(m.lerakas_datum, m.datum), 'YYYY-MM-DD') as "lerakasNap",
       m.fuvardij, m.fuvardij_penznem as penznem, j.kod as jarmu_kod
     from fuvar_megbizasok m
     left join fuvar_partnerek p on p.id = m.partner_id
     left join fuvar_jarmuvek j on j.id = m.jarmu_id
     where m.torolt_at is null and m.allapot is not null and m.allapot <> 'lezart'
       and coalesce(m.lerakas_datum, m.datum) >= $1::date - 10 and m.datum <= $2::date
     order by m.datum`,
    [kezdet, veg]
  );

  const aznap = (m: TervMegbizas, nap: string) => (m.felrakasNap ?? "") <= nap && (m.lerakasNap ?? m.felrakasNap ?? "") >= nap;
  const telephely = SAJAT_TELEPHELYEK[0].cim;

  // Geokód a hazaút-becsléshez (szótárból, hálózat nélkül is működik).
  const telephelyPont = await geokodolCachelve(telephely).catch(() => null);
  const pontCache = new Map<string, { lat: number; lon: number } | null>();
  async function pont(cim: string) {
    if (!pontCache.has(cim)) {
      const p = await geokodolCachelve(cim).catch(() => null);
      pontCache.set(cim, p ? { lat: p.lat, lon: p.lon } : null);
    }
    return pontCache.get(cim) ?? null;
  }

  const sorokKi: TervSor[] = [];
  const uresSlotok: UresSlot[] = [];
  let foglalt = 0;
  let ures = 0;

  for (const j of jarmuvek) {
    const sajat = sorok.filter((s) => s.jarmu_kod === j.kod);
    const cellak: TervCella[] = [];
    let utolsoHely = telephely;
    let uresOta = 0;
    for (const nap of napok) {
      const aznapiak = sajat.filter((m) => aznap(m, nap));
      if (aznapiak.length > 0) {
        const utolso = aznapiak[aznapiak.length - 1];
        if (utolso.lerako) utolsoHely = utolso.lerako;
        uresOta = 0;
        foglalt++;
        cellak.push({ nap, megbizasok: aznapiak, ures: null });
        continue;
      }
      // Üres nap — hol áll? Az utolsó korábbi (a hét előttit is beleértve) lerakó.
      const korabbi = sajat.filter((m) => (m.lerakasNap ?? m.felrakasNap ?? "") < nap);
      const hely = korabbi.length > 0 ? korabbi[korabbi.length - 1].lerako ?? utolsoHely : utolsoHely;
      uresOta++;
      const hetvege = new Date(`${nap}T12:00:00Z`).getUTCDay();
      if (hetvege !== 0 && hetvege !== 6) ures++;
      const p = await pont(hely);
      const hazaut = p && telephelyPont ? tavolsagKm(p, { lat: telephelyPont.lat, lon: telephelyPont.lon }) : null;
      // Hétvégén nem jelzünk üres slotot — az nem hiányzó fuvar.
      const munkanap = hetvege !== 0 && hetvege !== 6;
      cellak.push({
        nap,
        megbizasok: [],
        ures: munkanap ? { hol: hely, holVaros: varosNev(hely) ?? hely, hazautKm: hazaut, napokOtaUres: uresOta } : null,
      });
      if (munkanap) {
        uresSlotok.push({
          jarmuKod: j.kod, jarmuCimke: j.cimke, nap, hol: hely, holVaros: varosNev(hely) ?? hely,
          hazautKm: hazaut, korzet: /\b(\d{4})\b/.exec(hely)?.[1]?.slice(0, 2) ?? null,
        });
      }
    }
    sorokKi.push({ kod: j.kod, cimke: j.cimke, sofor: j.sofor, cellak });
  }

  const hetiek = sorok.filter((s) => napok.some((n) => aznap(s, n)));
  const osszesites = {
    munkanapok: jarmuvek.length * 5,
    foglalt,
    ures,
    berDb: hetiek.filter((s) => s.jelleg === "ber").length,
    sajatDb: hetiek.filter((s) => s.jelleg === "sajat").length,
    bevetel: hetiek.filter((s) => s.jelleg === "ber" && s.penznem === "Ft").reduce((a, s) => a + (s.fuvardij ?? 0), 0),
  };

  return {
    napok,
    sorok: sorokKi,
    uresSlotok,
    kocsiNelkul: sorok.filter((s) => !s.jarmu_kod && napok.some((n) => aznap(s, n))),
    osszesites,
    hetKezdet: kezdet,
  };
}
