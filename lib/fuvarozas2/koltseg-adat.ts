import "server-only";
import { megbizoMegjelenites, sajatCegunkE } from "@/lib/fuvarozas/fuvar-constants";
import { query } from "@/lib/db";
import { becsultTavolsag, lancKm, type LancKm } from "@/lib/fuvarozas2/ures-km";
import { getJarmuIndulasiTelephely } from "@/lib/fuvarozas/telephelyek-db";
import { getUtvonalJelentes, rendszamKulcs } from "@/lib/fuvarozas/ecofleet";
import { gazolajArKedvezmennyel } from "@/lib/fuvarozas/gazolaj";
import { getFuvarBeallitasok, type FuvarBeallitasok } from "@/lib/beallitasok/fuvar";
import { getEurArfolyamok, type ArfolyamInfo } from "@/lib/fuvarozas/arfolyam";
import {
  jarmuEredmeny, jarmuOsszkoltseg, megbizasKoltseg, napiFixFelosztas, napokKozott, utdijNapiFelosztas,
  type GpsUt, type JarmuEredmeny, type JarmuKontextus, type JarmuOsszkoltseg, type KeziKoltseg, type MegbizasEredmeny, type Parameterek,
} from "@/lib/fuvarozas2/koltseg-szamitas";

// Egy időszak (nap/hét/hó) költség- és eredmény-számítása kocsinként és
// megbízásonként — a Kimutatás (lib/fuvarozas2/kimutatas.ts) adatbetöltője
// (az óránkénti gépi költségsor-mentés 2026-10-16-án megszűnt, D5). A
// számolás maga tiszta: lib/fuvarozas2/koltseg-szamitas.ts. NEM "use server"
// fájl — a jogosultságot a hívó ellenőrzi.

export type IdoszakMegbizas = MegbizasEredmeny & {
  jarmuKod: string;
  felrako: string | null;
  lerako: string | null;
  partner: string | null;
  hivatkozas: string | null;
  /** Saját fuvarnál: „kitől → kinek” (a WWP „Well-Worn” néven), bérnél null. */
  kitolKinek: string | null;
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
  /** A saját fuvar „díja lett volna” Ft/km-e: a bérfuvarok 90 napos átlaga, vagy a beállítás. */
  sajatKmDijFt: number;
  sajatKmDijForras: "berfuvar_atlag" | "beallitas";
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
  /** Kézi költségsorok, amik átválthatatlanok (EUR árfolyam nélkül, vagy ismeretlen pénznem) — a költségben NINCSENEK benne, a felület jelzi. */
  atvaltatlanKezi: { db: number; eur: number; masPenznemDb: number };
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
    felrako: string | null; lerako: string | null; rakott_km: number | null; partner: string | null; hivatkozas: string | null; kitol: string | null; kitol_kinek?: string | null;
    teny_tol: string | null; teny_ig: string | null; raklap_db: number | null; utdij_becsles: number | null;
  }>(
    `select m.id::text, m.jarmu_id::text, to_char(coalesce(m.lerakas_datum, m.datum), 'YYYY-MM-DD') as nap,
       to_char(m.datum, 'YYYY-MM-DD') as felrakas_nap, m.jelleg,
       m.fuvardij::float8 as fuvardij, coalesce(m.fuvardij_penznem, 'Ft') as penznem, m.felrako, m.lerako, m.rakott_km::float8 as rakott_km,
       m.megrendelo as partner, m.kitol, coalesce(m.hivatkozas_kanonikus, m.hivatkozas_nyers) as hivatkozas,
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
  // Saját árunál a megbízó mindig a Well-Worn Pallet (Zoltán, 2026-10-11).
  // A kitől → kinek az útnaplóhoz (2026-10-19): befelé jövő útnál a feladó az érdekes.
  const nev = (x: string | null) => (!x?.trim() || sajatCegunkE(x) ? "Well-Worn" : x.trim());
  for (const m of megbizasok) if (m.jelleg === "sajat") m.kitol_kinek = `${nev(m.kitol)} → ${nev(m.partner)}`;
  for (const m of megbizasok) if (m.jelleg === "sajat") m.partner = megbizoMegjelenites(m.jelleg, m.partner);
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

  // Kézi költségsorok (nem gépi): a Kimutatás eddig figyelmen kívül hagyta őket.
  // Az azonos típusú számított tételt felülírják (lásd megbizasKoltseg).
  let keziSorok: { megbizas_id: string; tipus: string; osszeg: number; penznem: string; megjegyzes: string | null; forras: "teny" | "becsles"; arfolyam_nap: string | null }[] = [];
  if (megbizasok.length > 0) {
    try {
      keziSorok = await query(
        `select megbizas_id::text, tipus, osszeg::float8 as osszeg, coalesce(penznem, 'Ft') as penznem, megjegyzes, forras,
           to_char(arfolyam_nap, 'YYYY-MM-DD') as arfolyam_nap
         from fuvar_megbizas_koltseg
         where not szamitott and megbizas_id = any($1::bigint[])
         order by id`,
        [megbizasok.map((m) => m.id)]
      );
    } catch (err) {
      console.warn("[koltseg] kézi költségsorok nem olvashatók:", err instanceof Error ? err.message : err);
    }
  }
  const megbNap = new Map(megbizasok.map((m) => [m.id, m.nap]));

  const eurNapok = [
    ...megbizasok.filter((m) => m.jelleg === "ber" && m.penznem === "EUR").map((m) => m.nap),
    ...keziSorok.filter((r) => r.penznem === "EUR").map((r) => r.arfolyam_nap ?? megbNap.get(r.megbizas_id) ?? ""),
  ];
  const arfolyamok = await getEurArfolyamok(eurNapok);
  const keziMegbizasonkent = new Map<string, KeziKoltseg[]>();
  const atvaltatlanKezi = { db: 0, eur: 0, masPenznemDb: 0 };
  for (const r of keziSorok) {
    let ft: number | null = Number(r.osszeg);
    let megj = r.megjegyzes;
    if (r.penznem === "EUR") {
      const a = arfolyamok.get(r.arfolyam_nap ?? megbNap.get(r.megbizas_id) ?? "");
      ft = a ? Number(r.osszeg) * a.ft : null;
      megj = `${Number(r.osszeg).toLocaleString("hu-HU")} EUR${a ? ` × ${a.ft}` : ""}${megj ? ` · ${megj}` : ""}`;
    } else if (r.penznem !== "Ft" && r.penznem !== "HUF") {
      ft = null;
    }
    if (ft == null) {
      // Átválthatatlan (EUR árfolyam nélkül / ismeretlen pénznem): nem számolható Ft-ba,
      // de nem tűnik el csendben — megszámoljuk, és a Kimutatás/Eredmény kiírja.
      atvaltatlanKezi.db += 1;
      if (r.penznem === "EUR") atvaltatlanKezi.eur += Number(r.osszeg);
      else atvaltatlanKezi.masPenznemDb += 1;
      console.warn(`[koltseg] kézi költségsor átváltás nélkül kimaradt: megbízás ${r.megbizas_id}, ${r.osszeg} ${r.penznem}`);
      continue;
    }
    const lista = keziMegbizasonkent.get(r.megbizas_id) ?? [];
    lista.push({ tipus: r.tipus, ft, megjegyzes: megj, forras: r.forras === "becsles" ? "becsles" : "teny" });
    keziMegbizasonkent.set(r.megbizas_id, lista);
  }

  // A saját fuvar „díja lett volna” alapja (Budaházi Zoltán, 2026-10-19): a
  // bérfuvarjaink tényleges átlagos Ft/rakott km-e, az időszak végéig 90 nap
  // (forintos fuvarok — ugyanaz, mint a kocsi-kihasználtság belső díja).
  // Ha nincs elég adat, a beállítás (sajat_fuvar_km_dij_ft) marad.
  const [berFtKm] = await query<{ ft_km: number | null }>(
    `select sum(m.fuvardij)::float8 / nullif(sum(m.rakott_km), 0)::float8 as ft_km
     from fuvar_megbizasok m
     where m.torolt_at is null and m.jelleg = 'ber' and m.fuvardij > 0 and m.rakott_km > 0
       and coalesce(m.fuvardij_penznem, 'Ft') in ('Ft', 'HUF')
       and m.datum >= $1::date - 90 and m.datum <= $1::date`,
    [veg]
  ).catch(() => [] as { ft_km: number | null }[]);
  const sajatKmDijFt = berFtKm?.ft_km != null && Number(berFtKm.ft_km) > 0 ? Math.round(Number(berFtKm.ft_km)) : beallitas.sajat_fuvar_km_dij_ft;

  const param: Parameterek = {
    napiKoltsegFt: beallitas.napi_koltseg_ft,
    fogyasztasL100: beallitas.fogyasztas_alap_l_100km,
    sajatKmDijFt,
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
        tenyTol: m.teny_tol, tenyIg: m.teny_ig,
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
          kezi: keziMegbizasonkent.get(m.id) ?? [],
        },
        kontextus, param, napiFix.get(m.id) ?? 0, arfolyamok.get(m.nap) ?? null
      );
      return { ...e, jarmuKod: j.kod, felrako: m.felrako, lerako: m.lerako, partner: m.partner, hivatkozas: m.hivatkozas, kitolKinek: m.kitol_kinek ?? null };
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
    atvaltatlanKezi,
    beallitas,
    sajatKmDijFt,
    sajatKmDijForras: berFtKm?.ft_km != null && Number(berFtKm.ft_km) > 0 ? "berfuvar_atlag" : "beallitas",
  };
}
