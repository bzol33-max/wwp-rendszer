import "server-only";
import { requireAdmin } from "@/lib/auth/dal";
import { query } from "@/lib/db";
import { getEurArfolyamok } from "@/lib/fuvarozas/arfolyam";
import { budapestNapISO } from "@/lib/fuvarozas/idozona";
import { findJarmuInSzoveg } from "@/lib/fuvarozas/vehicles";
import { varosNev } from "@/lib/fuvarozas/varos";
import { getKeresesJavaslatok, type KeresesJavaslatAdat } from "@/lib/fuvarozas2/kereses-javaslat";
import { getTervezesHet } from "@/lib/fuvarozas2/tervezes-het";
import { getTervezo, type BejovoSor } from "@/lib/fuvarozas2/tervezo";
import type { MegbizasSor } from "@/lib/fuvarozas2/megbizasok";
import { SOR_SQL } from "@/lib/megbizasok/repo";
import { arCsekk, duplikatumok, median, szamlaSzerintEgyedi, type ArCsekk, type ArMinta, type Duplikatum } from "@/lib/proto/artar-alap";

export type Kintlevoseg = {
  vevo: string;
  nyitottFt: number;
  nyitottEur: number;
  lejartFt: number;
  lejartEur: number;
  lejartDb: number;
  legregebbiLejart: string | null;
  /** A kiállítástól a fizetésig eltelt napok mediánja az utolsó 12 hónapból. */
  fizetesNap: number | null;
};

export type ElvinniTetel = {
  id: string;
  utvonal: string;
  legkesobb: string | null;
  surgosseg: "rendben" | "sarga" | "piros";
  hely: { kocsi: string; nap: string; utbaEso: boolean } | null;
};

export type Dontes = {
  ma: string;
  eurArfolyam: number | null;
  bejovo: (BejovoSor & { csekk: ArCsekk; dijFt: number | null; kocsiKod: string | null })[];
  javaslat: KeresesJavaslatAdat | null;
  elvinni: ElvinniTetel[];
  kintlevoseg: Kintlevoseg[];
  duplak: Duplikatum[];
  mintaDb: number;
};

async function arMintak(eurArfolyam: number | null): Promise<ArMinta[]> {
  const sorok = await query<MegbizasSor>(
    `${SOR_SQL} where m.allapot is not null and m.torolt_at is null and m.jelleg = 'ber' and m.fuvardij is not null and m.allapot <> 'ellenorzesre_var'`
  );
  return sorok.flatMap((s) => {
    const dij = Number(s.fuvardij);
    const dijFt = s.fuvardij_penznem === "EUR" ? (eurArfolyam ? dij * eurArfolyam : null) : dij;
    if (dijFt == null || !(dijFt > 0)) return [];
    return [{
      id: s.id,
      partner: s.partner_nev ?? "Ismeretlen",
      fel: varosNev(s.felrako) || "?",
      le: varosNev(s.lerako) || "?",
      nap: s.felrakas_nap ?? "",
      dijFt,
      km: s.rakott_km != null ? Number(s.rakott_km) : null,
      szamla: s.szamla_szam,
    }];
  });
}

export async function getArMintak(eurArfolyam: number | null): Promise<ArMinta[]> {
  await requireAdmin();
  return szamlaSzerintEgyedi(await arMintak(eurArfolyam));
}

async function kintlevosegek(ma: string): Promise<Kintlevoseg[]> {
  const nyitott = await query<{ vevo: string; penznem: string; hatralek: string; hatarido: string | null }>(
    `select vevo_nev as vevo, penznem, (brutto + helyesbites_osszeg - fizetett_osszeg)::text as hatralek, fizetesi_hatarido::text as hatarido
     from szamla
     where kategoria = 'fuvar' and not fizetve and not sztorno and not sztornozva`
  );
  const fizetett = await query<{ vevo: string; nap: number }>(
    `select vevo_nev as vevo, (fizetve_datum at time zone 'Europe/Budapest')::date - kiallitas_datum as nap
     from szamla
     where kategoria = 'fuvar' and fizetve and not sztorno and not sztornozva
       and fizetve_datum >= now() - interval '12 months'`
  );
  const m = new Map<string, Kintlevoseg>();
  for (const s of nyitott) {
    const x = m.get(s.vevo) ?? { vevo: s.vevo, nyitottFt: 0, nyitottEur: 0, lejartFt: 0, lejartEur: 0, lejartDb: 0, legregebbiLejart: null, fizetesNap: null };
    const osszeg = Number(s.hatralek);
    const eur = s.penznem === "EUR";
    if (eur) x.nyitottEur += osszeg; else x.nyitottFt += osszeg;
    if (s.hatarido && s.hatarido < ma) {
      if (eur) x.lejartEur += osszeg; else x.lejartFt += osszeg;
      x.lejartDb++;
      if (!x.legregebbiLejart || s.hatarido < x.legregebbiLejart) x.legregebbiLejart = s.hatarido;
    }
    m.set(s.vevo, x);
  }
  for (const x of m.values()) {
    x.fizetesNap = median(fizetett.filter((f) => f.vevo === x.vevo).map((f) => Number(f.nap)));
  }
  return [...m.values()].sort((a, b) => (b.lejartFt + b.lejartEur * 400) - (a.lejartFt + a.lejartEur * 400) || b.nyitottFt - a.nyitottFt);
}

function hibatur<T>(p: Promise<T>, tartalek: T): Promise<T> {
  return p.catch((e) => { console.warn("[proto] részadat nem töltött be:", e); return tartalek; });
}

export async function getDontes(): Promise<Dontes> {
  await requireAdmin();
  const ma = budapestNapISO();
  const arfolyam = await hibatur(getEurArfolyamok([ma]), new Map());
  const eurArfolyam = arfolyam.get(ma)?.ft ?? null;
  const [nyers, tervezo, javaslat, het, kintlevoseg] = await Promise.all([
    arMintak(eurArfolyam),
    hibatur(getTervezo({}), null),
    hibatur(getKeresesJavaslatok(), null),
    hibatur(getTervezesHet(), null),
    hibatur(kintlevosegek(ma), [] as Kintlevoseg[]),
  ]);
  const minta = szamlaSzerintEgyedi(nyers);

  const bejovo = (tervezo?.bejovo ?? []).map((b) => {
    const dijFt = b.fuvardij == null ? null : b.penznem === "EUR" ? (eurArfolyam ? b.fuvardij * eurArfolyam : null) : b.fuvardij;
    const fel = varosNev(b.felrako) || "?";
    const le = varosNev(b.lerako) || "?";
    const azonosKm = minta.find((m) => m.fel === fel && m.le === le && m.km)?.km ?? null;
    // A bér megbízás rendszáma kötött: a kocsi a megbízásból jön, ajánlás nincs.
    const kocsiKod = b.jarmuKod ?? findJarmuInSzoveg(b.kocsiSzoveg)?.kod ?? null;
    return { ...b, dijFt, kocsiKod, csekk: arCsekk(minta, { partner: b.partner, fel, le, dijFt, km: azonosKm }) };
  });

  const elvinniMap = new Map<string, ElvinniTetel>();
  for (const nap of het?.elvinni ?? []) {
    for (const e of nap) {
      const elozo = elvinniMap.get(e.id);
      const hely = e.legjobb ? { kocsi: e.legjobb.jarmuKod, nap: e.legjobb.nap, utbaEso: e.legjobb.utbaEso } : null;
      if (!elozo) elvinniMap.set(e.id, { id: e.id, utvonal: e.utvonal, legkesobb: e.legkesobb, surgosseg: e.surgosseg, hely });
      else if (hely && (!elozo.hely || (hely.utbaEso && !elozo.hely.utbaEso))) elozo.hely = hely;
    }
  }

  return {
    ma,
    eurArfolyam,
    bejovo,
    javaslat,
    elvinni: [...elvinniMap.values()].sort((a, b) => (a.legkesobb ?? "9").localeCompare(b.legkesobb ?? "9")),
    kintlevoseg,
    duplak: duplikatumok(nyers),
    mintaDb: minta.length,
  };
}
