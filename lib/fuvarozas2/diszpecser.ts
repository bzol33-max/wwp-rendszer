import "server-only";
import { query } from "@/lib/db";
import { requireSession } from "@/lib/auth/dal";
import { requireViewPermission } from "@/lib/auth/require-permission";
import { getFuvarBeallitasok } from "@/lib/beallitasok/fuvar";
import { getJarmuvek } from "@/lib/fuvarozas/jarmuvek-db";
import { getSajatTelephelyek } from "@/lib/fuvarozas/telephelyek-db";
import { getIdovonalak, type IdovonalNap, type JarmuIdovonalEredmeny, type FuvarBlokk } from "@/lib/fuvarozas/actions";
import { budapestNapISO } from "@/lib/fuvarozas/idozona";
import { varosNev } from "@/lib/fuvarozas/varos";
import { tervIdoMegbizasbol } from "@/lib/fuvarozas2/napi-sorrend";
import { getMenettervNap } from "@/lib/menet/akciok";
import { getMenetek } from "@/lib/menet/repo";
import { raklapMennyisegbol, sajatTelephelyPontja } from "@/lib/menet/menet-alap";
import type { FeladatTipus, Menet, MenetFeladat, TelephelyPontAdat } from "@/lib/menet/tipusok";
import { getSzabadsagIgenyek, getSzabadsagTavolletek } from "@/lib/jelenlet/actions";
import { OKMANY_TIPUS_CIMKE, type OkmanyTipus } from "@/lib/jarmuvek/tipusok";
import {
  etaMutathato, gpsFrissesseg, hetHetfoje, isoVagyNull, napEltolva, okmanyJelzes, pgIdo,
  type DiszFeladat, type DiszFeladatAllapot, type DiszHetSor, type DiszKocsi, type DiszKocsiNelkul, type DiszOkmany, type DiszTavollet, type Diszpecser,
} from "@/lib/fuvarozas2/diszpecser-alap";

// Diszpécser nézet (6. fázis) — az EGY szerver-betöltő. Meglévő függvényeket
// fűz össze, nem számol újra semmit:
//   • a nap menete kocsinként (getMenettervNap — jóváhagyott vagy javaslat);
//   • élő GPS, ETA, kocsi nélküli fuvarok (getIdovonalak — ugyanaz a
//     gyorsítótárazott GPS-lánc, amit a Ma oldal és az Élő GPS használ;
//     Ecofleet-hívást ez a modul magától NEM indít);
//   • beállítások (GPS-küszöbök), járművek, saját telephelyek (gyorsítótárból);
//   • költség: a költségmodul óránként tárolt sorai (fuvar_megbizas_koltseg) —
//     itt nincs Ecofleet-/HU-GO-hívás;
//   • heti beosztás: getMenetek a hétre, szabadság a Jelenlét modulból (ha a
//     nézőnek van rá joga), okmány-lejáratok a jarmu_okmany táblából.
// A megbízás-adatok (ablakok, tények, dokumentum-szám) egyetlen lekérdezéssel
// jönnek a nap összes feladatához — nincs N+1. Ha az Ecofleet hibázik, az
// oldal akkor is megjelenik, „GPS nem elérhető” jelzéssel.

const ISO_NAP = /^\d{4}-\d{2}-\d{2}$/;
const LEZART = new Set(["teljesitve", "szamlazhato", "szamlazva", "email_elment", "postazva", "lezart"]);

type MegbizasSor = {
  id: string; jarmu_id: string | null; jelleg: "ber" | "sajat"; allapot: string | null; partner: string | null; hivatkozas: string | null;
  mennyiseg: string | null; felrakas_nap: string | null; lerakas_nap: string | null; idopont: string | null;
  felrakas_ablak_tol: string | null; felrakas_ablak_ig: string | null; lerakas_ablak_tol: string | null; lerakas_ablak_ig: string | null;
  felrako: string | null; fel_lat: number | null; fel_lon: number | null; fel_kesz: boolean | null;
  lerako: string | null; le_lat: number | null; le_lon: number | null;
  teny_tol: string | null; teny_le: string | null; le_kesz: boolean | null; dok_db: number; rakott_km: number | null;
};

/** A nap összes érintett megbízása egy lekérdezéssel: a menetekben szereplők + az aktív kocsik aznapi megbízásai. */
async function megbizasAdatok(idk: string[], jarmuIdk: string[], nap: string): Promise<Map<string, MegbizasSor>> {
  const sorok = await query<MegbizasSor>(
    `select m.id::text, m.jarmu_id::text, m.jelleg, m.allapot, coalesce(p.nev, m.megrendelo) as partner,
       coalesce(m.hivatkozas_kanonikus, m.pozicioszam, m.reise_id) as hivatkozas, m.mennyiseg,
       to_char(m.datum, 'YYYY-MM-DD') as felrakas_nap, to_char(coalesce(m.lerakas_datum, m.datum), 'YYYY-MM-DD') as lerakas_nap, m.idopont,
       m.felrakas_ablak_tol::text, m.felrakas_ablak_ig::text, m.lerakas_ablak_tol::text, m.lerakas_ablak_ig::text,
       coalesce(fel.cim_nyers, m.felrako) as felrako, fel.lat as fel_lat, fel.lon as fel_lon, fel.kesz as fel_kesz,
       coalesce(le.cim_nyers, m.lerako) as lerako, le.lat as le_lat, le.lon as le_lon, le.kesz as le_kesz,
       (select min(x)::text from fuvar_megallok g, lateral (values (g.gps_erkezes), (g.sofor_megerkezett_at)) v(x) where g.megbizas_id = m.id) as teny_tol,
       le.erkezes as teny_le,
       (select count(*)::int from fuvar_dokumentumok d where d.fuvar_id = m.id) as dok_db,
       m.rakott_km::float8 as rakott_km
     from fuvar_megbizasok m
     left join fuvar_partnerek p on p.id = m.partner_id
     left join lateral (select g.cim_nyers, g.lat, g.lon, coalesce(g.gps_tavozas, g.sofor_kesz_at) is not null as kesz
       from fuvar_megallok g where g.megbizas_id = m.id and g.tipus = 'felrako' order by g.sorszam limit 1) fel on true
     left join lateral (select g.cim_nyers, g.lat, g.lon, coalesce(g.gps_tavozas, g.sofor_kesz_at) is not null as kesz,
         coalesce(g.gps_erkezes, g.sofor_megerkezett_at)::text as erkezes
       from fuvar_megallok g where g.megbizas_id = m.id and g.tipus = 'lerako' order by g.sorszam desc limit 1) le on true
     where m.torolt_at is null and (
       m.id = any($1::bigint[])
       or (m.jarmu_id = any($2::bigint[]) and m.allapot is not null and m.allapot <> 'ellenorzesre_var'
           and not coalesce(m.elokeszites, false)
           and m.datum <= $3::date and coalesce(m.lerakas_datum, m.datum) >= $3::date))
     order by m.datum, m.id`,
    [idk, jarmuIdk, nap]
  );
  return new Map(sorok.map((s) => [s.id, s]));
}

/** A költségmodul tárolt sorai megbízásonként (bevétel-pótdíj nélkül, csak Ft). */
async function koltsegek(idk: string[]): Promise<Map<string, { ft: number; forras: "teny" | "becsles" }>> {
  if (idk.length === 0) return new Map();
  try {
    const sorok = await query<{ megbizas_id: string; ft: number; teny: boolean }>(
      `select megbizas_id::text, sum(osszeg)::float8 as ft, bool_and(forras = 'teny') as teny
       from fuvar_megbizas_koltseg
       where megbizas_id = any($1::bigint[]) and tipus <> 'bevetel_potdij' and coalesce(penznem, 'Ft') = 'Ft'
       group by megbizas_id`,
      [idk]
    );
    return new Map(sorok.map((s) => [s.megbizas_id, { ft: Math.round(Number(s.ft)), forras: s.teny ? "teny" : "becsles" }]));
  } catch (err) {
    console.warn("[diszpecser] költségsorok nem olvashatók:", err instanceof Error ? err.message : err);
    return new Map();
  }
}

/** Pótkocsi-kapacitás kocsinként (raklap darab — a nagyobbik a normál és a forgatott rakásból, mint a menet kapacitás-figyelmeztetésében). */
async function kapacitasok(): Promise<Map<string, { potkocsi: string | null; raklap: number | null }>> {
  try {
    const sorok = await query<{ id: string; rendszam: string | null; raklap: number | null }>(
      `select j.id::text, coalesce(p.rendszam, j.potkocsi_rendszam) as rendszam,
         greatest(p.raklap_db_normal, p.raklap_db_forgatott) as raklap
       from fuvar_jarmuvek j left join fuvar_potkocsik p on p.id = j.potkocsi_id where j.aktiv`
    );
    return new Map(sorok.map((s) => [s.id, { potkocsi: s.rendszam, raklap: s.raklap }]));
  } catch {
    return new Map();
  }
}

/** A kocsik és pótkocsijaik 30 napon belül lejáró / lejárt okmányai. */
async function okmanyok(ma: string): Promise<Map<string, DiszOkmany[]>> {
  const ki = new Map<string, DiszOkmany[]>();
  try {
    const sorok = await query<{ jarmu_id: string; tipus: OkmanyTipus; targy: string; lejarat: string }>(
      `select j.id::text as jarmu_id, o.tipus, case when o.potkocsi_id is not null then coalesce(p.rendszam, 'pótkocsi') else j.cimke end as targy,
         to_char(o.lejarat, 'YYYY-MM-DD') as lejarat
       from fuvar_jarmuvek j
       join jarmu_okmany o on o.jarmu_id = j.id or (o.potkocsi_id is not null and o.potkocsi_id = j.potkocsi_id)
       left join fuvar_potkocsik p on p.id = o.potkocsi_id
       where j.aktiv and o.lejarat is not null and o.lejarat <= $1::date + 30
       order by o.lejarat`,
      [ma]
    );
    for (const s of sorok) {
      const j = okmanyJelzes(s.lejarat, ma);
      if (!j) continue;
      ki.set(s.jarmu_id, [...(ki.get(s.jarmu_id) ?? []), { cimke: OKMANY_TIPUS_CIMKE[s.tipus] ?? s.tipus, targy: s.targy, lejarat: s.lejarat, ...j }]);
    }
  } catch (err) {
    console.warn("[diszpecser] okmányok nem olvashatók:", err instanceof Error ? err.message : err);
  }
  return ki;
}

/** A menet nélküli napokra: kocsinként és naponként a megbízások száma és jellege (egy lekérdezés). */
async function hetiMegbizasok(hetfo: string, vasarnap: string): Promise<Map<string, { ber: number; sajat: number }>> {
  try {
    const sorok = await query<{ jarmu_id: string; nap: string; ber: number; sajat: number }>(
      `select m.jarmu_id::text, to_char(d, 'YYYY-MM-DD') as nap,
         count(*) filter (where m.jelleg = 'ber')::int as ber, count(*) filter (where m.jelleg = 'sajat')::int as sajat
       from generate_series($1::date, $2::date, interval '1 day') d
       join fuvar_megbizasok m on m.datum <= d::date and coalesce(m.lerakas_datum, m.datum) >= d::date
       where m.torolt_at is null and m.jarmu_id is not null and m.allapot is not null and m.allapot <> 'ellenorzesre_var'
         and not coalesce(m.elokeszites, false)
       group by m.jarmu_id, d`,
      [hetfo, vasarnap]
    );
    return new Map(sorok.map((s) => [`${s.jarmu_id}|${s.nap}`, { ber: s.ber, sajat: s.sajat }]));
  } catch {
    return new Map();
  }
}

/** Szabadság / betegség a hét napjaira, alkalmazottanként — csak Jelenlét-megtekintési joggal (a meglévő függvényekből). */
async function tavolletek(hetNapok: string[]): Promise<Map<string, DiszTavollet>> {
  const ki = new Map<string, DiszTavollet>();
  const evek = [...new Set(hetNapok.map((n) => Number(n.slice(0, 4))))];
  for (const ev of evek) {
    const [igenyek, egyeb] = await Promise.all([getSzabadsagIgenyek(ev), getSzabadsagTavolletek(ev)]);
    for (const i of igenyek) {
      if (i.allapot !== "jovahagyva") continue;
      for (const n of hetNapok) if (n >= i.tol.slice(0, 10) && n <= i.ig.slice(0, 10)) ki.set(`${i.employee_id}|${n}`, i.tipus);
    }
    for (const t of egyeb) if (hetNapok.includes(t.work_date)) ki.set(`${t.employee_id}|${t.work_date}`, t.day_type);
  }
  return ki;
}

const varos = (c: string | null | undefined) => (c ? varosNev(c) || c : null);

export async function getDiszpecser(napParam?: string | null): Promise<Diszpecser> {
  await requireViewPermission("fuvarozas");
  const session = await requireSession();
  const most = new Date();
  const ma = budapestNapISO(most);
  const nap = napParam && ISO_NAP.test(napParam) ? napParam : ma;
  const hetfo = hetHetfoje(nap);
  const hetNapok = Array.from({ length: 7 }, (_, i) => napEltolva(hetfo, i));

  const [beallitas, menetterv, jarmuLista, telephelyLista, gpsEredmeny, kapacitas, okmany, hetMenetek, hetMegbizas] = await Promise.all([
    getFuvarBeallitasok(),
    getMenettervNap(nap),
    getJarmuvek(),
    getSajatTelephelyek(),
    getIdovonalak().then((x): { ok: true; nap: IdovonalNap } => ({ ok: true, nap: x })).catch((err): { ok: false } => {
      console.warn("[diszpecser] GPS-lánc nem érhető el:", err instanceof Error ? err.message : err);
      return { ok: false };
    }),
    kapacitasok(),
    okmanyok(ma),
    getMenetek(hetNapok[0], hetNapok[6]).catch(() => [] as Menet[]),
    hetiMegbizasok(hetNapok[0], hetNapok[6]),
  ]);
  const tavollet = session.can("jelenlet").view ? await tavolletek(hetNapok).catch(() => new Map<string, DiszTavollet>()) : null;

  // Saját telephelyek a menet-alap egyező-hely segédjéhez (id helyett név).
  const telephelyek: TelephelyPontAdat[] = telephelyLista.map((t) => ({ id: t.nev, nev: t.nev, cim: t.cim, pont: t.lat != null && t.lon != null ? { lat: Number(t.lat), lon: Number(t.lon) } : null }));
  const telephelyNevei = (...cimek: (string | null)[]) => [...new Set(cimek.flatMap((c) => {
    const t = c ? sajatTelephelyPontja({ cim: c, pont: null }, telephelyek, true) : null;
    return t ? [t.nev] : [];
  }))];

  const jarmuIdk = menetterv.kocsik.map((k) => k.jarmuId);
  const menetMegbizasIdk = menetterv.kocsik.flatMap((k) => (k.menet?.feladatok ?? []).flatMap((f) => (f.megbizasId ? [f.megbizasId] : [])));
  const megbizasok = await megbizasAdatok(menetMegbizasIdk, jarmuIdk, nap).catch((err) => {
    console.error("[diszpecser] megbízás-adatok:", err instanceof Error ? err.message : err);
    return new Map<string, MegbizasSor>();
  });
  const koltseg = await koltsegek([...megbizasok.keys()]);

  const gpsNap = gpsEredmeny.ok ? gpsEredmeny.nap : null;
  const maNap = nap === ma;

  const kocsik: DiszKocsi[] = menetterv.kocsik.map((mk) => {
    const sj = jarmuLista.find((j) => j.id === mk.jarmuId);
    const elo: JarmuIdovonalEredmeny | undefined = sj ? gpsNap?.jarmuvek.find((x) => x.sofor === sj.sofor) : undefined;
    const blokkok = new Map<string, FuvarBlokk>((maNap ? elo?.fuvarok ?? [] : []).map((b) => [b.fuvarId, b]));
    const kap = kapacitas.get(mk.jarmuId);
    // Élő ETA csak friss / késői GPS-jellel (lásd etaMutathato) — a GPS nélküli
    // kocsira a GPS-lánc csak a terv láncolását adja, az nem „élő becslés”.
    const eloP = elo?.eloPozicio ?? null;
    const frissesseg = gpsFrissesseg(eloP && pgIdo(eloP.utolsoAdat) ? eloP.utolsoAdat.toISOString() : null, most.getTime(), beallitas.gps_kesei_perc, beallitas.gps_elavult_perc);

    // A feladatok: a menetből (jóváhagyott vagy javaslat), különben a kocsi aznapi megbízásai terv-idő szerint.
    let alap: (Omit<MenetFeladat, "tervezettIndulas" | "tervezettErkezes"> & { tervezettIndulas: string | null; tervezettErkezes: string | null; menetbol: boolean })[];
    const menetbol = !!mk.menet && mk.menet.feladatok.length > 0;
    if (menetbol) {
      alap = [...mk.menet!.feladatok].sort((a, b) => a.sorszam - b.sorszam).map((f) => ({ ...f, menetbol: true }));
    } else {
      alap = [...megbizasok.values()]
        .filter((m) => m.jarmu_id === mk.jarmuId && (m.felrakas_nap ?? "") <= nap && (m.lerakas_nap ?? m.felrakas_nap ?? "") >= nap)
        .map((m) => ({ m, t: tervIdoMegbizasbol(m.felrakas_nap, m.felrakas_ablak_tol, m.idopont) }))
        .sort((a, b) => (a.t ?? Infinity) - (b.t ?? Infinity) || Number(a.m.id) - Number(b.m.id))
        .map(({ m, t }) => {
          const r = raklapMennyisegbol(m.mennyiseg);
          return {
            id: `m${m.id}`, sorszam: 0, feladatTipus: (m.jelleg === "ber" ? "berfuvar" : "sajat_aru") as FeladatTipus, megbizasId: m.id,
            kiinduloCim: m.felrako, celCim: m.lerako, kiinduloTelephelyPontId: null, celTelephelyPontId: null,
            tervezettIndulas: t != null ? new Date(t).toISOString() : null, tervezettErkezes: null,
            uresKm: null, rakottKm: m.rakott_km != null ? Math.round(Number(m.rakott_km)) : null, kmForras: m.rakott_km != null ? "hugo" : null,
            raklapDb: r.raklapDb, figyelmeztetesek: [], lezarvaAt: null, partner: m.partner, hivatkozas: m.hivatkozas, menetbol: false,
          };
        });
    }

    const feladatok: DiszFeladat[] = alap.map((f, i) => {
      const m = f.megbizasId ? megbizasok.get(f.megbizasId) : undefined;
      // Üres pozicionálás: a következő munka felrakójára megy — az ő tényei/ETA-ja számít.
      const kovMunka = !f.megbizasId ? alap.slice(i + 1).find((x) => x.megbizasId) : undefined;
      const kovM = kovMunka?.megbizasId ? megbizasok.get(kovMunka.megbizasId) : undefined;

      let allapot: DiszFeladatAllapot = "tervezett";
      let tenyIndulas: string | null = null;
      let tenyErkezes: string | null = null;
      if (m) {
        tenyIndulas = isoVagyNull(m.teny_tol);
        tenyErkezes = isoVagyNull(m.teny_le);
        if (f.lezarvaAt || (m.allapot && LEZART.has(m.allapot)) || m.le_kesz) allapot = "kesz";
        else if (tenyIndulas) allapot = "folyamatban";
      } else if (f.lezarvaAt || (kovM && (isoVagyNull(kovM.teny_tol) || (kovM.allapot && LEZART.has(kovM.allapot))))) {
        allapot = "kesz";
      }

      // Élő ETA — csak ma, csak friss/késői GPS-jellel, csak ugyanarra a megbízásra, és csak ha a
      // GPS-lánc tudott élő becslést adni (különben „nem számolható”, és a terv látszik).
      let eta: string | null = null;
      let etaCel: string | null = null;
      if (allapot !== "kesz") {
        if (m) {
          const blokk = blokkok.get(m.id);
          const utolso = blokk?.megallok.filter((g) => g.tipus === "lerako").at(-1);
          if (utolso && etaMutathato(frissesseg, blokk?.fuvarId, m.id) && !utolso.elhagyva && !utolso.eppenItt && !utolso.becslesElavult) { eta = utolso.idopont.toISOString(); etaCel = varos(utolso.cim); }
        } else if (kovM) {
          const blokk = blokkok.get(kovM.id);
          const fel = blokk?.megallok.find((g) => g.tipus === "felrako");
          if (fel && etaMutathato(frissesseg, blokk?.fuvarId, kovM.id) && !fel.elhagyva && !fel.eppenItt && !fel.becslesElavult) { eta = fel.idopont.toISOString(); etaCel = varos(fel.cim); }
        }
      }

      return {
        kulcs: f.id,
        feladatId: f.menetbol ? f.id : null,
        jarmuKod: mk.kod,
        sorszam: f.menetbol ? f.sorszam : null,
        tipus: f.feladatTipus,
        megbizasId: f.megbizasId,
        partner: f.partner ?? m?.partner ?? null,
        hivatkozas: f.hivatkozas ?? m?.hivatkozas ?? null,
        honnan: f.kiinduloCim,
        hova: f.celCim,
        telephelyek: telephelyNevei(f.kiinduloCim, f.celCim),
        felrakasAblak: { tol: isoVagyNull(m?.felrakas_ablak_tol ?? (f.megbizasId ? null : kovM?.felrakas_ablak_tol)), ig: isoVagyNull(m?.felrakas_ablak_ig ?? (f.megbizasId ? null : kovM?.felrakas_ablak_ig)) },
        lerakasAblak: { tol: isoVagyNull(m?.lerakas_ablak_tol), ig: isoVagyNull(m?.lerakas_ablak_ig) },
        tervIndulas: isoVagyNull(f.tervezettIndulas),
        tervErkezes: isoVagyNull(f.tervezettErkezes),
        tenyIndulas,
        tenyErkezes,
        eta,
        etaCel,
        allapot,
        uresKm: f.uresKm,
        rakottKm: f.rakottKm,
        kmForras: f.kmForras,
        raklapDb: f.raklapDb,
        kapacitasRaklap: kap?.raklap ?? null,
        koltseg: f.megbizasId ? koltseg.get(f.megbizasId) ?? null : null,
        dokDb: m?.dok_db ?? 0,
        figyelmeztetesek: f.figyelmeztetesek,
      };
    });

    // A következő megálló koordinátája — csak ismert pontra (különben nincs vonal).
    let kovetkezoCel: DiszKocsi["kovetkezoCel"] = null;
    const elsoNyitott = feladatok.find((f) => f.allapot !== "kesz");
    if (elsoNyitott) {
      const m = elsoNyitott.megbizasId ? megbizasok.get(elsoNyitott.megbizasId) : undefined;
      const kovMunka = elsoNyitott.megbizasId ? undefined : feladatok.slice(feladatok.indexOf(elsoNyitott) + 1).find((f) => f.megbizasId);
      const km = kovMunka?.megbizasId ? megbizasok.get(kovMunka.megbizasId) : undefined;
      if (m && !m.fel_kesz && m.fel_lat != null && m.fel_lon != null) kovetkezoCel = { lat: Number(m.fel_lat), lon: Number(m.fel_lon), cim: m.felrako ?? "" };
      else if (m && m.le_lat != null && m.le_lon != null) kovetkezoCel = { lat: Number(m.le_lat), lon: Number(m.le_lon), cim: m.lerako ?? "" };
      else if (km && km.fel_lat != null && km.fel_lon != null) kovetkezoCel = { lat: Number(km.fel_lat), lon: Number(km.fel_lon), cim: km.felrako ?? "" };
      else if (!m && !km && elsoNyitott.hova) {
        const t = sajatTelephelyPontja({ cim: elsoNyitott.hova, pont: null }, telephelyek, true);
        if (t?.pont) kovetkezoCel = { lat: t.pont.lat, lon: t.pont.lon, cim: t.cim };
      }
    }

    const p = elo?.eloPozicio ?? null;
    return {
      jarmuId: mk.jarmuId,
      kod: mk.kod,
      cimke: mk.cimke,
      vontato: sj?.rendszamok[0] ?? null,
      potkocsi: kap?.potkocsi ?? sj?.rendszamok[1] ?? null,
      sofor: mk.sofor,
      vanGpsEszkoz: !!sj?.ecofleetObjectId,
      gps: p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && pgIdo(p.utolsoAdat)
        ? { lat: p.lat, lon: p.lon, utolsoAdat: p.utolsoAdat.toISOString(), cim: p.cim, sebesseg: p.sebesseg }
        : null,
      gpsHiba: elo?.hiba ?? null,
      menetForras: !menetbol ? "nincs" : mk.menet!.allapot === "javaslat" ? "javaslat" : "jovahagyott",
      menetAllapot: mk.menet?.allapot ?? null,
      menetId: mk.menet?.id ?? null,
      feladatok,
      kovetkezoCel,
    };
  });

  const gpsesKocsik = kocsik.filter((k) => k.vanGpsEszkoz);
  const gpsHiba = !gpsEredmeny.ok
    ? "GPS nem elérhető — az Ecofleet most nem válaszol; a menet és a terv látszik, élő pozíció és ETA nélkül."
    : gpsesKocsik.length > 0 && gpsesKocsik.every((k) => !k.gps)
      ? "GPS nem elérhető — egyik kocsiról sincs élő jel (Ecofleet)."
      : null;

  // A ma be nem osztott fuvarok (a GPS-lánc listája, ugyanaz, mint a Ma oldalon).
  const kocsiNelkul: DiszKocsiNelkul[] = maNap
    ? (gpsNap?.elakadtak ?? []).map((e) => ({ id: e.fuvarId, partner: e.megrendelo, honnan: e.honnan, hova: e.hova }))
    : [];

  // Heti beosztás.
  const sorok: DiszHetSor[] = menetterv.kocsik.map((mk) => {
    const sj = jarmuLista.find((j) => j.id === mk.jarmuId);
    return {
      kod: mk.kod,
      cimke: mk.cimke,
      sofor: mk.sofor,
      okmanyok: okmany.get(mk.jarmuId) ?? [],
      napok: hetNapok.map((n) => {
        const menet = hetMenetek.find((m) => m.jarmuId === mk.jarmuId && m.nap === n);
        const tav = sj?.soforAlkalmazottId && tavollet ? tavollet.get(`${sj.soforAlkalmazottId}|${n}`) ?? null : null;
        if (menet && menet.feladatok.length > 0) {
          const tipusok: Partial<Record<FeladatTipus, number>> = {};
          for (const f of menet.feladatok) tipusok[f.feladatTipus] = (tipusok[f.feladatTipus] ?? 0) + 1;
          return { nap: n, feladatDb: menet.feladatok.length, tipusok, forras: menet.allapot === "javaslat" ? "javaslat" : "jovahagyott", tavollet: tav };
        }
        const mb = hetMegbizas.get(`${mk.jarmuId}|${n}`);
        if (mb && mb.ber + mb.sajat > 0) {
          const tipusok: Partial<Record<FeladatTipus, number>> = {};
          if (mb.ber) tipusok.berfuvar = mb.ber;
          if (mb.sajat) tipusok.sajat_aru = mb.sajat;
          return { nap: n, feladatDb: mb.ber + mb.sajat, tipusok, forras: "megbizas", tavollet: tav };
        }
        return { nap: n, feladatDb: 0, tipusok: {}, forras: "nincs", tavollet: tav };
      }),
    };
  });

  return {
    nap,
    ma,
    most: most.toISOString(),
    beallitas: {
      gpsKesoiPerc: beallitas.gps_kesei_perc,
      gpsElavultPerc: beallitas.gps_elavult_perc,
      uresIndulasKm: beallitas.ures_indulas_figyelmeztetes_km,
    },
    kocsik,
    kocsiNelkul,
    gpsHiba,
    menetHiba: menetterv.hiba,
    het: { napok: hetNapok, sorok, tavolletLathato: tavollet != null },
    telephelyNevek: telephelyLista.map((t) => t.nev),
    szerkeszthet: session.can("fuvarozas").edit,
  };
}
