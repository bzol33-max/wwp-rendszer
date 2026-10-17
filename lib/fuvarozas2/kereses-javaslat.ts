import "server-only";

// Ajánlat oldal · Q2 betöltő (docs/ajanlat-q2-terv.md): a Hét-ütemtervből a
// kocsik felszabadulása, a saját bérfuvarok (365 nap) és a nyitott Timocom-
// ajánlatok — a számítás a kereses-javaslat-alap.ts-ben. SOHA NEM DOB: hiba vagy
// időtúllépés esetén null, és a lap a kártyák nélkül (a kalkulátorral) jelenik meg.

import { query } from "@/lib/db";
import { requireViewPermission } from "@/lib/auth/require-permission";
import { megbizoMegjelenites } from "@/lib/fuvarozas/fuvar-constants";
import { varosNev } from "@/lib/fuvarozas/varos";
import { geokodolCachelve } from "@/lib/fuvarozas/erintes-felismeres";
import { getIndulasiTelephely } from "@/lib/fuvarozas/telephelyek-db";
import { getTervezesHet, type TervezesHet } from "@/lib/fuvarozas2/tervezes-het";
import { getTimocomAjanlatok } from "@/lib/fuvarozas2/timocom";
import { kovetkezoMunkanap } from "@/lib/fuvarozas2/tervezes-het-alap";
import { munkanap } from "@/lib/jelenlet/shared";
import type { Pont } from "@/lib/fuvarozas2/tervezo-alap";
import type { JarmuSzin } from "@/lib/fuvarozas/vehicles";
import {
  keresesiJavaslatok, type KeresAjanlat, type KeresKocsi, type KeresMult, type KeresSzabad, type KocsiJavaslat,
} from "@/lib/fuvarozas2/kereses-javaslat-alap";

export type KeresesJavaslatAdat = {
  ma: string;
  frissitve: string;
  kocsik: (KocsiJavaslat & { szin: JarmuSzin | null })[];
  /** Hány saját fuvar / Timocom-ajánlat helyét ismerjük (a többi még geokódolásra vár). */
  multIsmert: number;
  multOssz: number;
  timocomDb: number;
};

const HET_KORLAT_MS = 7_000;
const GEO_MAX = 80;
const GEO_KORLAT_MS = 4_000;

async function korlattal<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p.catch(() => null), new Promise<null>((r) => { t = setTimeout(() => r(null), ms); })]);
  } finally {
    clearTimeout(t);
  }
}

/** Címek koordinátája: legfeljebb GEO_MAX cím (a fontosak elöl), párhuzamosan, összesen GEO_KORLAT_MS alatt. A gyorsítótár a következő betöltéseknél gyorsít. */
async function pontok(cimek: string[]): Promise<Map<string, Pont | null>> {
  const ki = new Map<string, Pont | null>();
  const egyedi = [...new Set(cimek.filter(Boolean))].slice(0, GEO_MAX);
  const hatar = Date.now() + GEO_KORLAT_MS;
  await Promise.all(egyedi.map(async (c) => {
    const g = await korlattal(geokodolCachelve(c), Math.max(0, hatar - Date.now()));
    ki.set(c, g ? { lat: g.lat, lon: g.lon } : null);
  }));
  return ki;
}

const hhmm = (iso: string) => iso.slice(11, 16);

/** A kocsi felszabadulása az ütemterv utolsó valódi fuvarjából. */
function szabadBol(k: TervezesHet["kocsik"][number], ma: string, most: string, telephely: { varos: string; pont: Pont | null }): KeresSzabad | null {
  const fuvarok = (k.utemterv?.fuvarok ?? []).filter((f) => !f.id.startsWith("bej:") && f.megallok.length > 0);
  const vege = (f: (typeof fuvarok)[number]) => f.megallok[f.megallok.length - 1].tavozas;
  const utolso = [...fuvarok].sort((a, b) => vege(a).localeCompare(vege(b))).pop();
  const hetiFuvar = utolso ? k.cellak.flatMap((c) => c.fuvarok).find((f) => f.id === utolso.id) : null;
  const hely = utolso && hetiFuvar ? { varos: hetiFuvar.leVaros, pont: hetiFuvar.le } : { varos: telephely.varos, pont: telephely.pont };
  const becsult = !utolso || !hetiFuvar;
  const vezetesAznap = (nap: string) => k.utemterv?.napok.find((n) => n.nap === nap)?.vezetesPerc ?? 0;
  if (utolso && vege(utolso) > most) {
    const nap = vege(utolso).slice(0, 10);
    return { nap, ido: hhmm(vege(utolso)), hely, vezetesHatraPerc: Math.max(0, 540 - vezetesAznap(nap)), becsult };
  }
  // Már végzett (vagy nincs fuvara): ma, ha még munkaidő van, különben a következő munkanap reggel.
  const ora = hhmm(most);
  if (munkanap(ma) && ora < "17:00") return { nap: ma, ido: ora, hely, vezetesHatraPerc: Math.max(0, 540 - vezetesAznap(ma)), becsult };
  return { nap: kovetkezoMunkanap(ma), ido: "06:00", hely, vezetesHatraPerc: null, becsult };
}

type MultSor = { partner: string | null; felrako: string | null; lerako: string | null; nap: string; fuvardij: number | null; penznem: string };

export async function getKeresesJavaslatok(): Promise<KeresesJavaslatAdat | null> {
  try {
    await requireViewPermission("fuvarozas");
    const [het, multSorok, timocom, indulas] = await Promise.all([
      korlattal(getTervezesHet(), HET_KORLAT_MS),
      query<MultSor>(
        `select coalesce(p.nev, m.megrendelo) as partner,
            coalesce((select g.cim_nyers from fuvar_megallok g where g.megbizas_id = m.id and g.tipus = 'felrako' order by g.sorszam limit 1), m.felrako) as felrako,
            coalesce((select g.cim_nyers from fuvar_megallok g where g.megbizas_id = m.id and g.tipus = 'lerako' order by g.sorszam desc limit 1), m.lerako) as lerako,
            to_char(m.datum, 'YYYY-MM-DD') as nap, m.fuvardij, coalesce(m.fuvardij_penznem, 'Ft') as penznem
           from fuvar_megbizasok m left join fuvar_partnerek p on p.id = m.partner_id
          where m.torolt_at is null and m.allapot is not null and m.jelleg = 'ber' and m.datum is not null
            and m.datum >= (now() at time zone 'Europe/Budapest')::date - 365
            and m.datum < (now() at time zone 'Europe/Budapest')::date
          order by m.datum desc limit 600`
      ).catch(() => [] as MultSor[]),
      getTimocomAjanlatok(40, ["nyitott"]).catch(() => []),
      getIndulasiTelephely().catch(() => null),
    ]);
    if (!het) return null;

    // Város-szintű pontok a múlthoz (kevesebb geokódolás); a gyakoriak elöl.
    const varosa = (c: string | null) => varosNev(c ?? "") || "";
    const gyakorisag = new Map<string, number>();
    for (const s of multSorok) for (const v of [varosa(s.felrako), varosa(s.lerako)]) if (v) gyakorisag.set(v, (gyakorisag.get(v) ?? 0) + 1);
    const tcCim = (h: { irsz?: string | null; varos?: string | null; orszag?: string | null }) => [h.irsz, h.varos].filter(Boolean).join(" ") + (h.orszag ? `, ${h.orszag}` : "");
    const tcHelyek = timocom.map((t) => {
      const hs = t.ajanlat.helyek;
      const f = hs.find((h) => h.tipus === "fel") ?? hs[0];
      const l = [...hs].reverse().find((h) => h.tipus === "le") ?? hs[hs.length - 1];
      return { t, f, l };
    });
    const telephelyCim = indulas?.cim ?? "Szakoly";
    const cimek = [
      telephelyCim,
      ...tcHelyek.flatMap(({ f, l }) => [f ? tcCim(f) : "", l ? tcCim(l) : ""]),
      ...[...gyakorisag].sort((a, b) => b[1] - a[1]).map(([v]) => v),
    ];
    const pt = await pontok(cimek);

    const tPont = indulas?.lat != null && indulas?.lon != null ? { lat: Number(indulas.lat), lon: Number(indulas.lon) } : pt.get(telephelyCim) ?? { lat: 47.77, lon: 21.91 };
    const telephely = { varos: varosNev(telephelyCim) || "Szakoly", pont: tPont };

    const mult: KeresMult[] = multSorok.map((s) => ({
      partner: megbizoMegjelenites("ber", s.partner),
      fel: { varos: varosa(s.felrako) || "?", pont: pt.get(varosa(s.felrako)) ?? null },
      le: { varos: varosa(s.lerako) || "?", pont: pt.get(varosa(s.lerako)) ?? null },
      nap: s.nap,
      dijFt: s.fuvardij && (s.penznem === "Ft" || s.penznem === "HUF") ? Number(s.fuvardij) : s.fuvardij && s.penznem === "EUR" && het.eurArfolyam ? Math.round(Number(s.fuvardij) * het.eurArfolyam) : null,
    }));
    const ajanlatok: KeresAjanlat[] = tcHelyek.filter(({ f, l }) => f && l).map(({ t, f, l }) => {
      const ar = t.ajanlat.ar;
      const penz = (ar?.penznem ?? "").toUpperCase();
      return {
        id: t.id, megbizo: t.ajanlat.megbizo,
        fel: { varos: f!.varos ?? "?", pont: pt.get(tcCim(f!)) ?? null },
        le: { varos: l!.varos ?? "?", pont: pt.get(tcCim(l!)) ?? null },
        felNap: f!.datumTol ?? null,
        arFt: !ar ? null : penz === "EUR" ? (het.eurArfolyam ? Math.round(ar.osszeg * het.eurArfolyam) : null) : penz === "" || penz === "FT" || penz === "HUF" ? ar.osszeg : null,
      };
    });

    const most = `${het.ma}T${het.frissitve}`;
    const kocsik: KeresKocsi[] = het.kocsik.map((k) => ({
      kod: k.kod, sofor: k.sofor,
      szabad: szabadBol(k, het.ma, most, telephely),
      tavolletNapok: Object.keys(k.tavollet ?? {}),
    }));
    const szinek = new Map(het.kocsik.map((k) => [k.kod, k.szin]));
    const javaslatok = keresesiJavaslatok(kocsik, mult, ajanlatok, { telephely, kmKoltseg: het.kmKoltseg });
    return {
      ma: het.ma, frissitve: het.frissitve,
      kocsik: javaslatok.map((j) => ({ ...j, szin: szinek.get(j.kod) ?? null })),
      multIsmert: mult.filter((m) => m.fel.pont && m.le.pont).length,
      multOssz: mult.length,
      timocomDb: ajanlatok.length,
    };
  } catch (err) {
    console.warn("[kereses-javaslat] nem készült el:", err instanceof Error ? err.message : err);
    return null;
  }
}
