"use server";

// Fuvarozás 2 — Élő GPS a tervvászon (D4) szerint: kocsinként EGY 24 órás
// sáv (vezetés / rakodás–várakozás / szünet / becsült), mellette a napi
// mutatók, alul a tanult rakodási idők.
//
// A sáv a meglévő GPS-idővonal szakaszaiból épül (lib/fuvarozas/idovonal.ts
// kategorizálása: rövid állás / rakodás / pihenő) — nem új adatforrás.
// A vezetési idő és a szünet-esedékesség 561/2006/EK szerinti BECSLÉS a
// GPS-ből: a tachográf a sofőrnél van, a felület ezt minden soron kiírja.

import { query } from "@/lib/db";
import { requireViewPermission } from "@/lib/auth/require-permission";
import { getIdovonalak } from "@/lib/fuvarozas/actions";
import { getUtvonalJelentes, rendszamKulcs } from "@/lib/fuvarozas/ecofleet";
import { budapestNapISO } from "@/lib/fuvarozas/idozona";

export type SavTipus = "vezetes" | "rakodas" | "szunet" | "allas";

export type GpsSav = {
  tipus: SavTipus;
  /** Perc a nap kezdetétől (Europe/Budapest). */
  kezdet: number;
  hossz: number;
  becsult: boolean;
  cimke: string;
};

export type GpsMutato = { cimke: string; ertek: string; also: string | null; kiemelt?: boolean };

export type GpsKocsi = {
  kod: string;
  cimke: string;
  sofor: string | null;
  fej: string | null;
  savok: GpsSav[];
  mutatok: GpsMutato[];
  hiba: string | null;
};

export type TanultRakodas = { hely: string; perc: number; minta: number };

export type GpsVaszon = {
  ido: string;
  kocsik: GpsKocsi[];
  tanult: TanultRakodas[];
  /** Amit még nem tudunk megmérni, és miért — a vászon „Előrejelzés pontossága" doboza. */
  pontossagMegjegyzes: string;
};

const NAPI_VEZETES_KERET_PERC = 9 * 60;
const SZUNETIG_PERC = 4.5 * 60;
const SZOLGALAT_PLAFON_PERC = 13 * 60;

function percANapban(d: Date): number {
  const h = Number(d.toLocaleString("en-GB", { timeZone: "Europe/Budapest", hour: "2-digit", hour12: false }));
  const m = Number(d.toLocaleString("en-GB", { timeZone: "Europe/Budapest", minute: "2-digit" }));
  return h * 60 + m;
}
const ora = (d: Date | null | undefined) =>
  d ? d.toLocaleTimeString("hu-HU", { timeZone: "Europe/Budapest", hour: "2-digit", minute: "2-digit" }) : "—";
const oraPerc = (perc: number) => `${Math.floor(perc / 60)}:${String(Math.max(0, Math.round(perc % 60))).padStart(2, "0")}`;

export async function getGpsVaszon(): Promise<GpsVaszon> {
  await requireViewPermission("fuvarozas");
  const most = new Date();
  const ma = budapestNapISO();

  const jarmuvek = await query<{ kod: string; cimke: string; sofor: string | null; ecofleet_object_id: string | null; vontato_rendszam: string | null }>(
    `select j.kod, j.cimke, a.name as sofor, j.ecofleet_object_id, j.vontato_rendszam
     from fuvar_jarmuvek j left join alkalmazottak a on a.id = j.sofor_id
     where j.aktiv and j.ecofleet_object_id is not null order by j.id`
  );

  const idovonal = await getIdovonalak().catch(() => null);

  // Fogyasztás: mai és 14 napos átlag egy lekérdezésből (Ecofleet útvonal-jelentés).
  let utak: { rendszamKulcs: string; nap: string; km: number; liter: number }[] = [];
  try {
    const tizennegyNapja = new Date(most.getTime() - 13 * 86400000).toISOString().slice(0, 10);
    const sorok = await getUtvonalJelentes(jarmuvek.map((j) => j.ecofleet_object_id!).filter(Boolean), tizennegyNapja, ma);
    utak = sorok.map((s) => ({ rendszamKulcs: s.rendszamKulcs, nap: s.indulas.slice(0, 10), km: s.tavKm, liter: s.uzemanyagL }));
  } catch {
    utak = [];
  }

  const kocsik: GpsKocsi[] = jarmuvek.map((j) => {
    const elo = idovonal?.jarmuvek.find((x) => j.cimke.includes(x.sofor) || x.sofor === j.sofor || (j.sofor ?? "").includes(x.sofor));
    const savok: GpsSav[] = [];
    for (const sz of elo?.szakaszok ?? []) {
      if (sz.tipus === "indulas") continue;
      const kezdet = percANapban(sz.kezdet);
      const veg = percANapban(sz.veg);
      const hossz = Math.max(2, veg - kezdet);
      if (sz.tipus === "vezetes") {
        savok.push({
          tipus: "vezetes", kezdet, hossz, becsult: !!sz.elo,
          cimke: `${ora(sz.kezdet)}–${ora(sz.veg)} · ${Math.round(sz.tavKm)} km${sz.hova ? ` → ${sz.hova}` : ""}`,
        });
      } else {
        const tipus: SavTipus = sz.kategoria === "piheno" ? "szunet" : sz.kategoria === "rakodas" ? "rakodas" : "allas";
        savok.push({
          tipus, kezdet, hossz, becsult: !!sz.elo,
          cimke: `${ora(sz.kezdet)}–${ora(sz.veg)} · ${Math.round(sz.idotartamSec / 60)} p${sz.cim ? ` · ${sz.cim}` : ""}`,
        });
      }
    }

    const mutatok: GpsMutato[] = [];
    if (elo?.vezetesSec != null) {
      const vezetesPerc = Math.round(elo.vezetesSec / 60);
      const szunetOta = elo.utolsoSzunetVege ? Math.round((most.getTime() - elo.utolsoSzunetVege.getTime()) / 60000) : vezetesPerc;
      const szunetig = Math.max(0, SZUNETIG_PERC - Math.min(szunetOta, vezetesPerc));
      mutatok.push({
        cimke: "Vezetés ma", ertek: oraPerc(vezetesPerc),
        also: szunetig === 0 ? "szünet esedékes" : `4,5 óráig ${oraPerc(szunetig)}`,
        kiemelt: szunetig === 0,
      });
      mutatok.push({
        cimke: "Napi keret", ertek: "9 ó",
        also: `marad ${oraPerc(Math.max(0, NAPI_VEZETES_KERET_PERC - vezetesPerc))}`,
        kiemelt: vezetesPerc > NAPI_VEZETES_KERET_PERC - 30,
      });
    }
    const utolsoSzunet = (elo?.szakaszok ?? []).filter((sz) => sz.tipus === "allas" && sz.idotartamSec >= 45 * 60).slice(-1)[0];
    mutatok.push({
      cimke: "Szünet",
      ertek: utolsoSzunet && utolsoSzunet.tipus === "allas" ? `${ora(utolsoSzunet.kezdet)}–${ora(utolsoSzunet.veg)}` : "nincs",
      also: utolsoSzunet && utolsoSzunet.tipus === "allas" ? `${Math.round(utolsoSzunet.idotartamSec / 60)} p ✓` : "ma még nem volt 45 perces állás",
    });
    if (elo?.szolgalatKezdet) {
      const plafon = new Date(elo.szolgalatKezdet.getTime() + SZOLGALAT_PLAFON_PERC * 60000);
      mutatok.push({ cimke: "Szolgálat", ertek: `${ora(elo.szolgalatKezdet)} óta`, also: `plafon ${ora(plafon)}` });
    }

    const kulcs = j.vontato_rendszam ? rendszamKulcs(j.vontato_rendszam) : rendszamKulcs(j.kod);
    const sajat = utak.filter((u) => u.rendszamKulcs === kulcs);
    const maiUt = sajat.filter((u) => u.nap === ma);
    const maiKm = maiUt.reduce((a, u) => a + u.km, 0);
    const maiL = maiUt.reduce((a, u) => a + u.liter, 0);
    const osszKm = sajat.reduce((a, u) => a + u.km, 0);
    const osszL = sajat.reduce((a, u) => a + u.liter, 0);
    if (sajat.length > 0) {
      mutatok.push({
        cimke: "Fogyasztás ma",
        ertek: maiKm > 0 ? `${(maiL / maiKm * 100).toFixed(1)} l/100` : "—",
        also: osszKm > 0 ? `14 napos ${(osszL / osszKm * 100).toFixed(1)}` : null,
      });
    }
    mutatok.push({ cimke: "Megtett km ma", ertek: elo?.napiKm != null ? `${elo.napiKm} km` : maiKm > 0 ? `${Math.round(maiKm)} km` : "—", also: null });

    const fej = elo?.eloEta && !elo.eloEta.bizonytalan ? `ETA ${elo.eloEta.cel} ${ora(elo.eloEta.erkezes)}` : null;
    return { kod: j.kod, cimke: j.cimke, sofor: j.sofor, fej, savok, mutatok, hiba: elo?.hiba ?? null };
  });

  // Tanult rakodási idő: a megállókon mért érkezés→távozás medián, helyenként.
  const tanultSorok = await query<{ hely: string; percek: number[] }>(
    `select coalesce(telepules, cim_nyers) as hely,
       array_agg(extract(epoch from (gps_tavozas - gps_erkezes)) / 60 order by gps_erkezes desc) as percek
     from fuvar_megallok
     where gps_erkezes is not null and gps_tavozas is not null and gps_tavozas > gps_erkezes
     group by 1 having count(*) >= 3`
  );
  const tanult: TanultRakodas[] = tanultSorok
    .map((r) => {
      const ertekek = (r.percek ?? []).map(Number).filter((n) => Number.isFinite(n) && n > 0 && n < 600).sort((a, b) => a - b);
      const median = ertekek.length ? ertekek[Math.floor(ertekek.length / 2)] : 0;
      return { hely: r.hely, perc: Math.round(median), minta: ertekek.length };
    })
    .filter((t) => t.minta >= 3)
    .sort((a, b) => b.minta - a.minta)
    .slice(0, 8);

  return {
    ido: most.toLocaleString("hu-HU", { timeZone: "Europe/Budapest", weekday: "long", hour: "2-digit", minute: "2-digit" }),
    kocsik,
    tanult,
    pontossagMegjegyzes:
      "Az ETA-hiba (P50/P90) méréséhez a becsléseket rögzíteni kell az érkezés pillanatában — ez még nem gyűlik, ezért itt most a mért rakodási idők állnak.",
  };
}
