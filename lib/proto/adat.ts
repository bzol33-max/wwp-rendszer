import "server-only";
import { requireAdmin } from "@/lib/auth/dal";
import { query } from "@/lib/db";
import { budapestNapISO } from "@/lib/fuvarozas/idozona";
import { koltsegIdoszakra } from "@/lib/fuvarozas2/koltseg-adat";
import { keresEgyezik } from "@/lib/fuvarozas2/munkaasztal";
import { munkanapok } from "@/lib/jelenlet/shared";
import { SOR_SQL } from "@/lib/megbizasok/repo";
import type { MegbizasSor } from "@/lib/fuvarozas2/megbizasok";
import { SOFOR_HAVI_FT, csoportosit, osszesit, protoFuvar, type ProtoFuvar, type ProtoOsszeg } from "@/lib/proto/penz-alap";

// Prototípus: minden lekérdezés csak olvas, és csak admin láthatja.

export function napEltol(nap: string, delta: number): string {
  const d = new Date(`${nap}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function hetfo(nap: string): string {
  const d = new Date(`${nap}T12:00:00Z`);
  return napEltol(nap, -((d.getUTCDay() + 6) % 7));
}

function honapVege(nap: string): string {
  const d = new Date(`${nap.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

export type ProtoPenz = {
  kezdet: string;
  veg: string;
  fuvarok: ProtoFuvar[];
  ossz: ProtoOsszeg;
  kocsik: (ProtoOsszeg & { alloSoforFt: number })[];
  partnerek: ProtoOsszeg[];
  gazolajAr: number | null;
  gazolajCimke: string | null;
  gpsHiba: string | null;
  kocsiNelkul: number;
};

/** A jövőbeli tervezett fuvarokat a mai nappal levágjuk: csak ami már megtörténhetett, az számít. */
export async function getProtoPenz(kezdet: string, vegKert: string): Promise<ProtoPenz> {
  await requireAdmin();
  const ma = budapestNapISO();
  const veg = vegKert > ma ? ma : vegKert;
  const k = await koltsegIdoszakra(kezdet, veg);
  const honapok = new Map<string, number>();
  const honapMunkanapja = (nap: string) => {
    const h = nap.slice(0, 7);
    if (!honapok.has(h)) honapok.set(h, munkanapok(`${h}-01`, honapVege(nap)).length);
    return honapok.get(h)!;
  };
  const param = {
    napiKoltsegFt: k.beallitas.napi_koltseg_ft,
    fogyasztasL100: k.beallitas.fogyasztas_alap_l_100km,
    gazolajAr: k.gazolajAr,
    honapMunkanapja,
  };
  const fuvarok = k.jarmuvek
    .flatMap((j) => j.megbizasok.map((m) => protoFuvar(m, param)))
    .sort((a, b) => b.nap.localeCompare(a.nap));

  // Az álló munkanapok sofőrköltsége egyik fuvarra sem kerül rá, kocsiszinten látszik.
  const idoszakNapok = munkanapok(kezdet, veg);
  const kocsik = k.jarmuvek.map((j) => {
    const sajat = fuvarok.filter((f) => f.kocsi === j.kod);
    const o = osszesit(j.kod, sajat);
    const teljes = j.aktivNap > 0 || sajat.length > 0
      ? idoszakNapok.reduce((s, n) => s + SOFOR_HAVI_FT / honapMunkanapja(n), 0)
      : 0;
    const kiosztott = sajat.reduce((s, f) => s + (f.kimarad ? 0 : f.soforFt), 0);
    return { ...o, alloSoforFt: Math.max(0, Math.round(teljes - kiosztott)) };
  }).sort((a, b) => a.kulcs.localeCompare(b.kulcs));

  return {
    kezdet,
    veg,
    fuvarok,
    ossz: osszesit("Összesen", fuvarok),
    kocsik,
    partnerek: csoportosit(fuvarok.filter((f) => f.jelleg === "ber"), (f) => f.partner),
    gazolajAr: k.gazolajAr,
    gazolajCimke: k.gazolajCimke,
    gpsHiba: k.gpsHiba,
    kocsiNelkul: k.kocsiNelkul,
  };
}

/** Teljes múlt, sorlimit nélkül: minden keresés az összes fuvaron fut. */
export async function protoKeres(kereses: string, szuro: string): Promise<{ sorok: MegbizasSor[]; talalat: number; osszes: number }> {
  await requireAdmin();
  const mind = await query<MegbizasSor>(
    `${SOR_SQL} where m.allapot is not null and m.torolt_at is null order by coalesce(m.lerakas_datum, m.datum) desc, m.id desc`
  );
  const szurt = mind.filter((s) => {
    if (szuro === "ber" && s.jelleg !== "ber") return false;
    if (szuro === "sajat" && s.jelleg !== "sajat") return false;
    if (szuro === "nyitott" && (s.allapot === "lezart" || s.allapot === "postazva")) return false;
    if (szuro === "papir" && (s.papirok_beerkeztek_at || !["teljesitve", "szamlazhato", "szamlazva", "email_elment"].includes(s.allapot))) return false;
    return keresEgyezik(s, kereses);
  });
  return { sorok: szurt.slice(0, 100), talalat: szurt.length, osszes: mind.length };
}

export async function protoFutoFuvarok(): Promise<MegbizasSor[]> {
  await requireAdmin();
  return query<MegbizasSor>(
    `${SOR_SQL}
     where m.allapot is not null and m.torolt_at is null and m.allapot <> 'ellenorzesre_var'
       and (m.allapot = 'folyamatban'
            or (m.datum <= (now() at time zone 'Europe/Budapest')::date and coalesce(m.lerakas_datum, m.datum) >= (now() at time zone 'Europe/Budapest')::date))
     order by m.datum, m.id`
  );
}

export async function protoHetFuvarok(hetKezdet: string): Promise<MegbizasSor[]> {
  await requireAdmin();
  return query<MegbizasSor>(
    `${SOR_SQL}
     where m.allapot is not null and m.torolt_at is null
       and (m.datum between $1::date and $2::date
            or (m.jarmu_id is null and m.allapot in ('ellenorzesre_var', 'tervezett') and m.datum >= $1::date - 14))
     order by m.datum, m.id`,
    [hetKezdet, napEltol(hetKezdet, 6)]
  );
}

export async function protoEllenorzendo(): Promise<MegbizasSor[]> {
  await requireAdmin();
  return query<MegbizasSor>(
    `${SOR_SQL} where m.allapot = 'ellenorzesre_var' and m.torolt_at is null order by m.datum desc nulls last, m.id desc limit 50`
  );
}
