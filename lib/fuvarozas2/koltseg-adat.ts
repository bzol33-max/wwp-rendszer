import "server-only";
import { query } from "@/lib/db";
import { becsultTavolsag, lancKm, type LancKm } from "@/lib/fuvarozas2/ures-km";
import { getJarmuIndulasiTelephely } from "@/lib/fuvarozas/telephelyek-db";
import { getUtvonalJelentes, rendszamKulcs } from "@/lib/fuvarozas/ecofleet";
import { gazolajArKedvezmennyel } from "@/lib/fuvarozas/gazolaj";
import { getFuvarBeallitasok, type FuvarBeallitasok } from "@/lib/beallitasok/fuvar";
import { getEurArfolyamok, type ArfolyamInfo } from "@/lib/fuvarozas/arfolyam";
import {
  jarmuEredmeny, jarmuOsszkoltseg, megbizasKoltseg, napiFixFelosztas, napokKozott, utdijNapiFelosztas,
  type GpsUt, type JarmuEredmeny, type JarmuKontextus, type JarmuOsszkoltseg, type MegbizasEredmeny, type Parameterek,
} from "@/lib/fuvarozas2/koltseg-szamitas";

// Egy időszak (nap/hét/hó) költség- és eredmény-számítása kocsinként és
// megbízásonként — a Kimutatás (lib/fuvarozas2/kimutatas.ts) és az óránkénti
// költségsor-mentés (taroldMegbizasKoltsegeket) közös adatbetöltője. A
// számolás maga tiszta: lib/fuvarozas2/koltseg-szamitas.ts. NEM "use server"
// fájl — a jogosultságot a hívó ellenőrzi.

export type IdoszakMegbizas = MegbizasEredmeny & {
  jarmuKod: string;
  felrako: string | null;
  lerako: string | null;
  partner: string | null;
  hivatkozas: string | null;
};

export type IdoszakJarmu = {
  id: string;
  kod: string;
  cimke: string;
  sofor: string | null;
  vanGps: boolean;
  /** A megtett km és liter (GPS, tény), csak az időszakon belül. */
  km: number;
  liter: number;
  /** Napi GPS-km (tény) és a fuvarlánc (becslés) — a napi grafikonhoz. */
  napiKm: Map<string, { km: number; liter: number }>;
  lanc: LancKm[];
  aktivNap: number;
  ossz: JarmuOsszkoltseg;
  eredmeny: JarmuEredmeny;
  megbizasok: IdoszakMegbizas[];
};

export type IdoszakKoltseg = {
  kezdet: string;
  veg: string;
  jarmuvek: IdoszakJarmu[];
  gazolajAr: number | null;
  gazolajCimke: string | null;
  gpsHiba: string | null;
  kocsiNelkul: number;
  /** Van-e HU-GO import az időszakra (bármely kocsira). */
  vanUtdijImport: boolean;
  tankolasDb: number;
  /** A használt EUR-árfolyamok (napi bontás nélkül, a felület egyszer írja ki). */
  arfolyamok: ArfolyamInfo[];
  beallitas: FuvarBeallitasok;
};

function napEltol(nap: string, delta: number): string {
  const d = new Date(`${nap}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Az Ecofleet "YYYY-MM-DD HH:MM:SS" ideje (lehet "YYYY.MM.DD" is) egységesen. */
function egysegesIdo(s: string): string {
  return s.trim().replace(/^(\d{4})[./](\d{2})[./](\d{2})\.?/, "$1-$2-$3");
}

/** Egy időszak költsége — kocsinként, megbízásonként; a jogosultságot a hívó ellenőrzi. */
export async function koltsegIdoszakra(kezdet: string, veg: string): Promise<IdoszakKoltseg> {
  const beallitas = await getFuvarBeallitasok();
  // A tény-ablak egy megbízásnál átlóghat az időszak határán — a GPS-t, a
  // tankolást és az útdíjat ezért pár nappal tágabban kérjük le; a kocsi
  // összesítője csak az időszakon belüli részt veszi.
  const tagKezdet = napEltol(kezdet, -3);
  const tagVeg = napEltol(veg, 1);

  const jarmuvek = await query<{ id: string; kod: string; cimke: string; sofor: string | null; ecofleet_object_id: string | null; vontato_rendszam: string | null }>(
    `select j.id::text, j.kod, j.cimke, a.name as sofor, j.ecofleet_object_id, j.vontato_rendszam
     from fuvar_jarmuvek j left join alkalmazottak a on a.id = j.sofor_id
     where j.aktiv order by j.id`
  );

  const megbizasok = await query<{
    id: string; jarmu_id: string | null; nap: string; felrakas_nap: string; jelleg: "ber" | "sajat"; fuvardij: number | null; penznem: string;
    felrako: string | null; lerako: string | null; rakott_km: number | null; partner: string | null; hivatkozas: string | null;
    teny_tol: string | null; teny_ig: string | null; raklap_db: number | null; utdij_becsles: number | null;
  }>(
    `select m.id::text, m.jarmu_id::text, to_char(coalesce(m.lerakas_datum, m.datum), 'YYYY-MM-DD') as nap,
       to_char(m.datum, 'YYYY-MM-DD') as felrakas_nap, m.jelleg,
       m.fuvardij::float8 as fuvardij, coalesce(m.fuvardij_penznem, 'Ft') as penznem, m.felrako, m.lerako, m.rakott_km::float8 as rakott_km,
       m.megrendelo as partner, coalesce(m.hivatkozas_kanonikus, m.hivatkozas_nyers) as hivatkozas,
       (select to_char(coalesce(g.gps_erkezes, g.sofor_megerkezett_at, g.gps_tavozas, g.sofor_kesz_at) at time zone 'Europe/Budapest', 'YYYY-MM-DD HH24:MI:SS')
          from fuvar_megallok g where g.megbizas_id = m.id order by g.sorszam asc limit 1) as teny_tol,
       (select to_char(coalesce(g.gps_tavozas, g.sofor_kesz_at, g.gps_erkezes, g.sofor_megerkezett_at) at time zone 'Europe/Budapest', 'YYYY-MM-DD HH24:MI:SS')
          from fuvar_megallok g where g.megbizas_id = m.id order by g.sorszam desc limit 1) as teny_ig,
       (select sum(s.raklap_db)::int from szallitolevel_import s where s.megbizas_id = m.id) as raklap_db,
       (select (k.eredmeny->>'rakottUtdijFt')::float8 from fuvar_kalkulacio k where k.megbizas_id = m.id and k.eredmeny is not null) as utdij_becsles
     from fuvar_megbizasok m
     where m.torolt_at is null and m.allapot is not null
       and coalesce(m.lerakas_datum, m.datum) between $1::date and $2::date`,
    [kezdet, veg]
  );
  const kocsiNelkul = megbizasok.filter((m) => !m.jarmu_id).length;

  const elozoLerako = await query<{ jarmu_id: string; lerako: string | null }>(
    `select distinct on (m.jarmu_id) m.jarmu_id::text, m.lerako
     from fuvar_megbizasok m
     where m.torolt_at is null and m.allapot is not null and m.jarmu_id is not null
       and coalesce(m.lerakas_datum, m.datum) < $1::date and coalesce(m.lerakas_datum, m.datum) >= $1::date - 30
     order by m.jarmu_id, coalesce(m.lerakas_datum, m.datum) desc, m.id desc`,
    [kezdet]
  );

  // GPS — tény.
  let utak: (GpsUt & { rendszamKulcs: string })[] = [];
  let gpsHiba: string | null = null;
  const objektumok = jarmuvek.map((j) => j.ecofleet_object_id).filter((x): x is string => !!x);
  if (objektumok.length > 0) {
    try {
      const sorok = await getUtvonalJelentes(objektumok, tagKezdet, tagVeg);
      utak = sorok.map((s) => ({ rendszamKulcs: s.rendszamKulcs, indulas: egysegesIdo(s.indulas), erkezes: egysegesIdo(s.erkezes), km: s.tavKm, liter: s.uzemanyagL }));
    } catch (err) {
      gpsHiba = err instanceof Error ? err.message : "Ecofleet hiba";
    }
  }

  let gazolajAr: number | null = null;
  let gazolajCimke: string | null = null;
  try {
    const ar = await gazolajArKedvezmennyel();
    gazolajAr = ar.ar;
    gazolajCimke = `${ar.cimke} · NAV − ${ar.kedvezmeny} Ft`;
  } catch {
    gazolajAr = null;
  }

  const utdijSorok = await query<{ jarmu_id: string | null; idopont: string; brutto_ft: number }>(
    `select jarmu_id::text, to_char(idopont at time zone 'Europe/Budapest', 'YYYY-MM-DD HH24:MI:SS') as idopont, brutto_ft
     from utdij_tranzakcio
     where (idopont at time zone 'Europe/Budapest')::date between $1::date and $2::date`,
    [tagKezdet, tagVeg]
  );
  const tankolasSorok = await query<{ jarmu_id: string | null; idopont: string; liter: number | null; osszeg_ft: number }>(
    `select jarmu_id::text, to_char(idopont at time zone 'Europe/Budapest', 'YYYY-MM-DD HH24:MI:SS') as idopont,
       liter::float8 as liter, osszeg_ft::float8 as osszeg_ft
     from tankolas
     where (idopont at time zone 'Europe/Budapest')::date between $1::date and $2::date`,
    [tagKezdet, tagVeg]
  );
  const [atlag] = await query<{ ft_km: number | null }>(
    `select sum((eredmeny->>'rakottUtdijFt')::float8) / nullif(sum((eredmeny->>'rakottKm')::float8), 0) as ft_km
     from fuvar_kalkulacio where eredmeny is not null and szamolva_at > now() - interval '180 days'`
  );

  const eurNapok = megbizasok.filter((m) => m.jelleg === "ber" && m.penznem === "EUR").map((m) => m.nap);
  const arfolyamok = await getEurArfolyamok(eurNapok);

  const param: Parameterek = {
    napiKoltsegFt: beallitas.napi_koltseg_ft,
    fogyasztasL100: beallitas.fogyasztas_alap_l_100km,
    sajatKmDijFt: beallitas.sajat_fuvar_km_dij_ft,
    gazolajAr,
    gazolajCimke,
    atlagUtdijFtKm: atlag?.ft_km != null ? Number(atlag.ft_km) : null,
  };

  const bentVan = (ido: string) => ido.slice(0, 10) >= kezdet && ido.slice(0, 10) <= veg;
  const tav = becsultTavolsag();
  const ki: IdoszakJarmu[] = [];

  for (const j of jarmuvek) {
    const kulcs = j.vontato_rendszam ? rendszamKulcs(j.vontato_rendszam) : rendszamKulcs(j.kod);
    const vanGps = !!j.ecofleet_object_id && !gpsHiba;
    const sajatUtak = vanGps ? utak.filter((u) => u.rendszamKulcs === kulcs) : [];
    const sajatMegb = megbizasok.filter((m) => m.jarmu_id === j.id);

    const napiKm = new Map<string, { km: number; liter: number }>();
    for (const u of sajatUtak) {
      if (!bentVan(u.indulas)) continue;
      const nap = u.indulas.slice(0, 10);
      const x = napiKm.get(nap) ?? { km: 0, liter: 0 };
      x.km += u.km;
      x.liter += u.liter;
      napiKm.set(nap, x);
    }

    const lanc = await lancKm(
      sajatMegb.map((m) => ({
        id: m.id, jelleg: m.jelleg, felrakasNap: m.felrakas_nap, lerakasNap: m.nap,
        felrako: m.felrako, lerako: m.lerako, rakottKm: m.rakott_km != null ? Number(m.rakott_km) : null,
      })),
      elozoLerako.find((e) => e.jarmu_id === j.id)?.lerako ?? (await getJarmuIndulasiTelephely(j.kod)).cim,
      tav
    );

    const kontextus: JarmuKontextus = {
      vanGps,
      utak: sajatUtak,
      tankolasok: tankolasSorok.filter((t) => t.jarmu_id === j.id).map((t) => ({ idopont: t.idopont, liter: t.liter, osszegFt: Number(t.osszeg_ft) })),
      utdijak: utdijSorok.filter((u) => u.jarmu_id === j.id).map((u) => ({ idopont: u.idopont, bruttoFt: Number(u.brutto_ft) })),
    };

    // Napi fix felosztása: a megbízás napjai (tény-ablak vagy felrakás–lerakás), az időszakon belül.
    const napokMegb = sajatMegb.map((m) => ({
      id: m.id,
      napok: (m.teny_tol && m.teny_ig && m.teny_ig > m.teny_tol ? napokKozott(m.teny_tol, m.teny_ig) : napokKozott(m.felrakas_nap, m.nap))
        .filter((n) => n >= kezdet && n <= veg),
      tenyTol: m.teny_tol, tenyIg: m.teny_ig,
    }));
    const napiFix = napiFixFelosztas(napokMegb, beallitas.napi_koltseg_ft);
    // Tény-ablak nélküli megbízás: a napjainak HU-GO tranzakciói (ha az import lefedi).
    const utdijNapbol = utdijNapiFelosztas(
      sajatMegb.map((m) => ({
        id: m.id,
        napok: napokKozott(m.felrakas_nap, m.nap),
        tenyTol: m.teny_tol && m.teny_ig && m.teny_ig > m.teny_tol ? m.teny_tol : null,
        tenyIg: m.teny_tol && m.teny_ig && m.teny_ig > m.teny_tol ? m.teny_ig : null,
      })),
      kontextus.utdijak
    );

    const eredmenyek: IdoszakMegbizas[] = sajatMegb.map((m) => {
      const l = lanc.find((x) => x.id === m.id);
      const e = megbizasKoltseg(
        {
          id: m.id, jelleg: m.jelleg, nap: m.nap, felrakasNap: m.felrakas_nap,
          fuvardij: m.fuvardij, penznem: m.penznem,
          rakottKmBecsles: l?.rakott ?? Number(m.rakott_km ?? 0),
          uresKmBecsles: l?.ures ?? 0,
          tenyTol: m.teny_tol, tenyIg: m.teny_ig && m.teny_tol && m.teny_ig > m.teny_tol ? m.teny_ig : null,
          utdijBecslesFt: m.utdij_becsles != null ? Number(m.utdij_becsles) : null,
          utdijNapbol: utdijNapbol.get(m.id) ?? null,
          raklapDb: m.raklap_db,
        },
        kontextus, param, napiFix.get(m.id) ?? 0, arfolyamok.get(m.nap) ?? null
      );
      return { ...e, jarmuKod: j.kod, felrako: m.felrako, lerako: m.lerako, partner: m.partner, hivatkozas: m.hivatkozas };
    });

    // Aktív nap: GPS-mozgás VAGY megbízás az adott napon (a GPS nélküli kocsi is kap napi költséget).
    const aktivNapok = new Set<string>([...napiKm.keys(), ...napokMegb.flatMap((m) => m.napok)]);
    const idoszakKontextus: JarmuKontextus = {
      ...kontextus,
      utak: sajatUtak.filter((u) => bentVan(u.indulas)),
      utdijak: kontextus.utdijak.filter((u) => bentVan(u.idopont)),
    };
    const ossz = jarmuOsszkoltseg(idoszakKontextus, eredmenyek, param, aktivNapok.size);
    ki.push({
      id: j.id, kod: j.kod, cimke: j.cimke, sofor: j.sofor, vanGps,
      km: Math.round([...napiKm.values()].reduce((a, x) => a + x.km, 0)),
      liter: Math.round([...napiKm.values()].reduce((a, x) => a + x.liter, 0)),
      napiKm, lanc, aktivNap: aktivNapok.size, ossz,
      eredmeny: jarmuEredmeny(eredmenyek, ossz),
      megbizasok: eredmenyek,
    });
  }

  const hasznaltArf = new Map<string, ArfolyamInfo>();
  for (const a of arfolyamok.values()) hasznaltArf.set(`${a.nap}|${a.ft}`, a);

  return {
    kezdet, veg, jarmuvek: ki, gazolajAr, gazolajCimke, gpsHiba, kocsiNelkul,
    vanUtdijImport: utdijSorok.some((u) => bentVan(u.idopont)),
    tankolasDb: tankolasSorok.filter((t) => bentVan(t.idopont)).length,
    arfolyamok: [...hasznaltArf.values()].sort((a, b) => a.nap.localeCompare(b.nap)),
    beallitas,
  };
}

/**
 * Az óránkénti kör: az utolsó 14 nap megbízásainak költségsorai a
 * fuvar_megbizas_koltseg táblába (forrás: tény/becslés), idempotensen — a
 * (megbizas_id, tipus, forras) kulcsra frissít, és törli a megbízás azon
 * gépi sorait, amelyek már nem érvényesek (pl. a becslésből tény lett).
 */
export async function taroldMegbizasKoltsegeket(napVissza = 14): Promise<{ megbizas: number; sor: number }> {
  const [h] = await query<{ kezdet: string; veg: string }>(
    `select to_char((now() at time zone 'Europe/Budapest')::date - $1::int, 'YYYY-MM-DD') as kezdet,
            to_char((now() at time zone 'Europe/Budapest')::date, 'YYYY-MM-DD') as veg`,
    [napVissza]
  );
  const adat = await koltsegIdoszakra(h.kezdet, h.veg);
  let megbizas = 0;
  let sor = 0;
  for (const j of adat.jarmuvek) {
    for (const m of j.megbizasok) {
      const tetelek: { tipus: string; forras: string; osszeg: number; mennyiseg: number | null; reszletek: Record<string, unknown> }[] = [];
      if (m.uzemanyag) {
        tetelek.push({ tipus: "uzemanyag", forras: m.uzemanyag.forras, osszeg: m.uzemanyag.ft, mennyiseg: m.liter?.ertek ?? null,
          reszletek: { megjegyzes: m.uzemanyag.megjegyzes, km: m.km.ertek, kmForras: m.km.forras } });
      }
      if (m.utdij) {
        tetelek.push({ tipus: "utdij", forras: m.utdij.forras, osszeg: m.utdij.ft, mennyiseg: null, reszletek: { megjegyzes: m.utdij.megjegyzes } });
      }
      tetelek.push({ tipus: "napi_fix", forras: m.napiFix.forras, osszeg: m.napiFix.ft, mennyiseg: m.napok.length, reszletek: { megjegyzes: m.napiFix.megjegyzes, napok: m.napok } });
      for (const t of tetelek) {
        await query(
          `insert into fuvar_megbizas_koltseg (megbizas_id, tipus, osszeg, penznem, forras, szamitott, mennyiseg, reszletek, megjegyzes)
           values ($1::bigint, $2, $3, 'Ft', $4, true, $5, $6::jsonb, $7)
           on conflict (megbizas_id, tipus, forras) where szamitott
           do update set osszeg = excluded.osszeg, mennyiseg = excluded.mennyiseg, reszletek = excluded.reszletek,
             megjegyzes = excluded.megjegyzes, letrehozva_at = now()`,
          [m.id, t.tipus, t.osszeg, t.forras, t.mennyiseg, JSON.stringify(t.reszletek), String(t.reszletek.megjegyzes ?? "")]
        );
        sor++;
      }
      await query(
        `delete from fuvar_megbizas_koltseg
         where megbizas_id = $1::bigint and szamitott
           and not ((tipus || ':' || forras) = any($2::text[]))`,
        [m.id, tetelek.map((t) => `${t.tipus}:${t.forras}`)]
      );
      megbizas++;
    }
  }
  return { megbizas, sor };
}
