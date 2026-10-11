"use server";

// Megbízások · pénz-nézet adatai (az új terv 3. oldala, 2026-10-11): a
// lezárult (teljesített és későbbi) megbízások az elmúlt évből, a hozzájuk
// párosított Számlázz.hu-számlával (szamla tábla: határidő, fizetve).

import { query } from "@/lib/db";
import { requireAnyViewPermission } from "@/lib/auth/require-permission";
import { SOR_SQL } from "@/lib/megbizasok/repo";
import { varosNev } from "@/lib/fuvarozas/varos";
import { megbizoMegjelenites } from "@/lib/fuvarozas/fuvar-constants";
import type { MegbizasSor } from "@/lib/fuvarozas2/megbizasok";
import { osszesit, penzAllapot, szurobeEsik, type PenzAllapot, type PenzBemenet, type PenzOsszesito, type PenzSzuro } from "@/lib/fuvarozas2/penz-lista-alap";

export type PenzSor = PenzBemenet & {
  a: PenzAllapot;
  megbizo: string;
  relacio: string;
  km: number | null;
  ftKm: number | null;
};

export type PenzLista = { ma: string; sorok: PenzSor[]; osszes: number; ossz: PenzOsszesito; folyamatbanDb: number };

type SzamlaSor = { szamlaszam: string; brutto: string; fizetett_osszeg: string; penznem: string; kiallitas: string; hatarido: string | null; fizetve: boolean; fizetve_nap: string | null };

export async function getPenzLista(szuro: PenzSzuro, sajatIs: boolean): Promise<PenzLista> {
  await requireAnyViewPermission(["fuvarozas", "elszamolas"]);
  const [{ ma }] = await query<{ ma: string }>(`select ((now() at time zone 'Europe/Budapest')::date)::text as ma`);
  const nyers = await query<MegbizasSor>(
    `${SOR_SQL} where m.allapot is not null and m.torolt_at is null
       and coalesce(m.lerakas_datum, m.datum) >= ($1::date - 365)
     order by coalesce(m.lerakas_datum, m.datum) desc, m.id desc limit 3000`,
    [ma]
  );
  const szamok = [...new Set(nyers.map((s) => s.szamla_szam).filter((x): x is string => !!x))];
  const szamlak = szamok.length
    ? await query<SzamlaSor>(
        `select szamlaszam, brutto::text, fizetett_osszeg::text, penznem, kiallitas_datum::text as kiallitas,
                fizetesi_hatarido::text as hatarido, fizetve, to_char(fizetve_datum at time zone 'Europe/Budapest', 'YYYY-MM-DD') as fizetve_nap
           from szamla where szamlaszam = any($1::text[]) and not sztorno`,
        [szamok]
      )
    : [];
  const szMap = new Map(szamlak.map((s) => [s.szamlaszam, s]));

  const folyamatbanDb = nyers.filter((s) => s.allapot === "tervezett" || s.allapot === "folyamatban").length;
  const mind: PenzSor[] = nyers
    .filter((s) => sajatIs || s.jelleg === "ber")
    .map((s) => {
      const sz = s.szamla_szam ? szMap.get(s.szamla_szam) : undefined;
      const be: PenzBemenet = {
        id: s.id, jelleg: s.jelleg, allapot: s.allapot,
        nap: s.lerakas_nap ?? s.felrakas_nap ?? ma,
        fuvardij: s.fuvardij != null ? Number(s.fuvardij) : null,
        penznem: s.fuvardij_penznem || "Ft",
        szamlaSzam: s.szamla_szam,
        vanPapir: s.foto_van || !!s.papirok_beerkeztek_at,
        szamla: sz ? {
          brutto: Number(sz.brutto), fizetett: Number(sz.fizetett_osszeg), penznem: sz.penznem,
          kiallitas: sz.kiallitas, hatarido: sz.hatarido, fizetve: sz.fizetve, fizetveNap: sz.fizetve_nap,
        } : null,
      };
      const km = s.rakott_km != null ? Math.round(Number(s.rakott_km)) : null;
      return {
        ...be,
        a: penzAllapot(be, ma),
        megbizo: megbizoMegjelenites(s.jelleg, s.partner_nev),
        relacio: `${varosNev(s.felrako ?? "") || "?"} → ${varosNev(s.lerako ?? "") || "?"}`,
        km,
        ftKm: km && be.fuvardij && be.penznem === "Ft" && s.jelleg === "ber" ? Math.round(be.fuvardij / km) : null,
      };
    })
    .filter((s) => s.a.kesz);

  const szurt = mind.filter((s) => szurobeEsik(s.a, szuro));
  // Teendőnél a legrégebbi elöl (az a legsürgősebb), máshol a legújabb.
  if (szuro === "teendo" || szuro === "lejart") szurt.sort((x, y) => x.nap.localeCompare(y.nap));
  return { ma, sorok: szurt.slice(0, 300), osszes: szurt.length, ossz: osszesit(mind, ma), folyamatbanDb };
}
