import "server-only";
import { query } from "@/lib/db";
import { requireAnyViewPermission } from "@/lib/auth/require-permission";
import { SOR_SQL } from "@/lib/megbizasok/repo";
import { getJarmuvek } from "@/lib/fuvarozas/jarmuvek-db";
import type { MegbizasSor, MunkaasztalSor } from "@/lib/fuvarozas2/megbizasok";
import { arfolyamNapokra } from "@/lib/fuvarozas2/arfolyam";
import {
  elozoHonapUgyanezNap, haviOsszesites, honapEleje, jegySzin, lepesbenNap, pecsetek,
  type HaviFuvar, type HaviOsszesites, type Pecset, type PecsetKulcs,
} from "@/lib/fuvarozas2/kocsi-sinek-alap";

// Megbízások „Kocsi-sínek” nézet adatai (2026-11-18, Q5b-F terv). A nyitott
// sorok a meglévő getKetOszlop-ból jönnek (page.tsx); itt a pecsétek forrása
// (megállók, számla kelte), a havi sáv és a kocsinkénti számok készülnek.

export type Jegy = {
  sor: MunkaasztalSor;
  pecsetek: Pecset[];
  lepesbenNap: number;
  kovetkezo: PecsetKulcs | null;
  szin: ReturnType<typeof jegySzin>;
  /** EUR-os díjnál: Ft-érték a számla keltének (vagy ma, előzetes) árfolyamán. */
  dijFt: number | null;
  arfolyam: number | null;
  arfolyamNap: string | null;
  arfolyamElozetes: boolean;
};

export type Sin = {
  kod: string;
  cimke: string;
  sofor: string;
  jegyek: Jegy[];
  havi: HaviOsszesites["kocsik"][string] | null;
};

export type KocsiSinekAdat = {
  ma: string;
  talca: Jegy[];
  sinek: Sin[];
  /** Nyitott sorok kocsi nélkül, ami nem a tálcába való (pl. kocsi kód ismeretlen). */
  kocsiNelkul: Jegy[];
  havi: HaviOsszesites;
  beallitas: { kiadasFt: number | null; celFt: number | null };
};

type MegalloIdo = { megbizas_id: string; tipus: string; sorszam: number; gps_erkezes: string | null; sofor_kesz_at: string | null };
type SzamlaKelte = { szamla_szam: string; kelte: string };

async function pecsetForrasok(ids: string[], szamlaSzamok: string[]) {
  const [megallok, szamlak] = await Promise.all([
    ids.length
      ? query<MegalloIdo>(
          `select megbizas_id::text, tipus, sorszam, gps_erkezes::text, sofor_kesz_at::text
             from fuvar_megallok where megbizas_id = any($1::bigint[]) order by megbizas_id, sorszam`,
          [ids]
        )
      : Promise.resolve([]),
    szamlaSzamok.length
      ? query<SzamlaKelte>(
          `select szamlaszam as szamla_szam, to_char(kiallitas_datum, 'YYYY-MM-DD') as kelte
             from szamla where szamlaszam = any($1::text[]) and not sztorno`,
          [szamlaSzamok]
        )
      : Promise.resolve([]),
  ]);
  const felvetel = new Map<string, string>();
  const lerakas = new Map<string, string>();
  for (const m of megallok) {
    const t = m.sofor_kesz_at ?? m.gps_erkezes;
    if (!t) continue;
    if (m.tipus === "felrako" && !felvetel.has(m.megbizas_id)) felvetel.set(m.megbizas_id, t);
    if (m.tipus === "lerako") lerakas.set(m.megbizas_id, t); // sorszám szerint az utolsó marad
  }
  const kelte = new Map(szamlak.map((s) => [s.szamla_szam, s.kelte]));
  return { felvetel, lerakas, kelte };
}

function haviFuvar(s: MegbizasSor, kelte: Map<string, string>): HaviFuvar {
  return {
    id: s.id, jelleg: s.jelleg, jarmu_kod: s.jarmu_kod, lerakas_nap: s.lerakas_nap,
    fuvardij: s.fuvardij == null ? null : Number(s.fuvardij), fuvardij_penznem: s.fuvardij_penznem || "Ft",
    rakott_km: s.rakott_km, szamla_kelte: s.szamla_szam ? kelte.get(s.szamla_szam) ?? null : null,
  };
}

export async function getHaviBeallitas(ev: number, ho: number): Promise<{ kiadasFt: number | null; celFt: number | null }> {
  const r = await query<{ kiadas_ft: string | null; cel_ft: string | null }>(
    `select kiadas_ft::text, cel_ft::text from fuvar_havi_beallitas where ev = $1 and ho = $2`, [ev, ho]
  );
  return { kiadasFt: r[0]?.kiadas_ft ? Number(r[0].kiadas_ft) : null, celFt: r[0]?.cel_ft ? Number(r[0].cel_ft) : null };
}

/** `keszIs`: keresésnél a kész (számlázott / lerakott saját) találat is látszik; különben a jegy a utolsó pecsét után lekerül a sínről. */
export async function getKocsiSinekAdat(nyitott: MunkaasztalSor[], ma: string, keszIs = false): Promise<KocsiSinekAdat> {
  await requireAnyViewPermission(["fuvarozas", "elszamolas"]);
  const [ev, ho] = ma.split("-").map(Number);
  const tol = honapEleje(ma);
  const elozo = elozoHonapUgyanezNap(ma);

  // A hónap és az előző hónap (ugyanezen napig) fuvarjai a lerakás napja szerint — a lezártak is.
  const [honap, elozoHo, jarmuvek, beallitas] = await Promise.all([
    query<MegbizasSor>(
      `${SOR_SQL} where m.allapot is not null and m.allapot <> 'ellenorzesre_var' and m.torolt_at is null
         and coalesce(m.lerakas_datum, m.datum) between $1::date and $2::date`, [tol, ma]),
    query<MegbizasSor>(
      `${SOR_SQL} where m.allapot is not null and m.allapot <> 'ellenorzesre_var' and m.torolt_at is null
         and coalesce(m.lerakas_datum, m.datum) between $1::date and $2::date`, [elozo.tol, elozo.ig]),
    getJarmuvek(),
    getHaviBeallitas(ev, ho),
  ]);

  const mind = [...nyitott, ...honap, ...elozoHo];
  const ids = [...new Set(nyitott.map((s) => s.id))];
  const szamlaSzamok = [...new Set(mind.map((s) => s.szamla_szam).filter((x): x is string => !!x))];
  const { felvetel, lerakas, kelte } = await pecsetForrasok(ids, szamlaSzamok);

  // Árfolyam: minden EUR-os fuvar számla-keltére (vagy ma), egy kéréssel.
  const eurNapok = mind.filter((s) => (s.fuvardij_penznem || "").toUpperCase() === "EUR")
    .map((s) => (s.szamla_szam ? kelte.get(s.szamla_szam) : null) ?? ma);
  const arf = await arfolyamNapokra([...eurNapok, ma]);
  const arfolyam = (nap: string) => arf.get(nap) ?? null;

  const havi = haviOsszesites(ma, honap.map((s) => haviFuvar(s, kelte)), elozoHo.map((s) => haviFuvar(s, kelte)), arfolyam, beallitas);

  const jegy = (sor: MunkaasztalSor): Jegy => {
    const p = pecsetek({
      jelleg: sor.jelleg, letrehozva_at: sor.letrehozva_at,
      felvetel_at: felvetel.get(sor.id) ?? null, lerakas_at: lerakas.get(sor.id) ?? null,
      allapot: sor.allapot, allapot_at: sor.allapot_at,
      szamla_kelte: sor.szamla_szam ? kelte.get(sor.szamla_szam) ?? null : null,
      felrakas_nap: sor.felrakas_nap, lerakas_nap: sor.lerakas_nap,
    }, ma);
    const l = lepesbenNap(p, ma);
    const eur = (sor.fuvardij_penznem || "").toUpperCase() === "EUR";
    const kelteNap = sor.szamla_szam ? kelte.get(sor.szamla_szam) ?? null : null;
    const arfNap = eur ? kelteNap ?? ma : null;
    const a = arfNap ? arfolyam(arfNap) : null;
    return {
      sor, pecsetek: p, lepesbenNap: l.nap, kovetkezo: l.kovetkezo, szin: jegySzin(p),
      dijFt: eur ? (a && sor.fuvardij != null ? Number(sor.fuvardij) * a : null) : sor.fuvardij == null ? null : Number(sor.fuvardij),
      arfolyam: a, arfolyamNap: arfNap, arfolyamElozetes: eur && !kelteNap,
    };
  };

  // Tálca: ami még nincs kocsin (saját előkészítés / rugalmas, bér jóváhagyásra vár kocsi nélkül).
  const talca: Jegy[] = [];
  const kocsiNelkul: Jegy[] = [];
  const perKocsi = new Map<string, Jegy[]>();
  for (const sor of nyitott) {
    const j = jegy(sor);
    if (!keszIs && j.szin === "kesz") continue;
    const kod = sor.jarmu_kod ?? sor.elokeszites_jarmu;
    if (!kod) { (sor.jelleg === "sajat" || sor.allapot === "ellenorzesre_var" ? talca : kocsiNelkul).push(j); continue; }
    (perKocsi.get(kod) ?? perKocsi.set(kod, []).get(kod)!).push(j);
  }
  // Rendezés: legrégebb óta a lépésben elöl, azon belül felrakás nap.
  const rendez = (a: Jegy, b: Jegy) => b.lepesbenNap - a.lepesbenNap || (a.sor.felrakas_nap ?? "").localeCompare(b.sor.felrakas_nap ?? "");
  talca.sort(rendez);
  const sinek: Sin[] = jarmuvek.filter((j) => j.kod).map((j) => ({
    kod: j.kod!, cimke: j.label, sofor: j.sofor,
    jegyek: (perKocsi.get(j.kod!) ?? []).sort(rendez),
    havi: havi.kocsik[j.kod!] ?? null,
  }));
  // Olyan kocsi kódja, ami nincs a járműtörzsben (régi sor): külön sín, hogy ne vesszen el.
  for (const [kod, jegyek] of perKocsi) if (!sinek.some((s) => s.kod === kod)) sinek.push({ kod, cimke: kod, sofor: "—", jegyek: jegyek.sort(rendez), havi: havi.kocsik[kod] ?? null });

  return { ma, talca, sinek, kocsiNelkul, havi, beallitas };
}
