// Elvinni való kocsihét olvasó (2026-10-07, Budaházi Zoltán).
import "server-only";
import { query } from "@/lib/db";
import { requireAnyViewPermission } from "@/lib/auth/require-permission";
import { geokodolCachelve } from "@/lib/fuvarozas/erintes-felismeres";
import { varosNev } from "@/lib/fuvarozas/varos";
import { SAJAT_TELEPHELYEK } from "@/lib/fuvarozas/telephelyek";
import { napiSorrend } from "@/lib/fuvarozas2/napi-sorrend";
import { findJarmuByPlate } from "@/lib/fuvarozas/vehicles";
import { elvinniCellaKm, hetKezdeteElvinni } from "@/lib/megbizasok/elvinni-szabalyok";

type HetiMegbizas = {
  id: string;
  jarmu: string;
  jelleg: "ber" | "sajat";
  partner: string | null;
  kitol: string | null;
  kinek: string | null;
  felrako: string | null;
  lerako: string | null;
  kezdet: string;
  veg: string;
  utemezett: boolean;
};

type Pont = { lat: number; lon: number };

export type ElvinniHetCella = {
  nap: string;
  megbizasok: {
    id: string;
    jelleg: "ber" | "sajat";
    partner: string | null;
    kitol: string | null;
    kinek: string | null;
    felrako: string | null;
    lerako: string | null;
    utemezett: boolean;
  }[];
  hol: string | null;
  km: number | null;
  megNemViheto: boolean;
};

export type ElvinniHetSor = {
  kod: string;
  cimke: string;
  napok: ElvinniHetCella[];
};

export type ElvinniHet = {
  hetKezdet: string;
  napok: string[];
  sorok: ElvinniHetSor[];
  legkorabban: string | null;
};

function hetNapjai(hetKezdete: string) {
  const napok: string[] = [];
  const datum = new Date(`${hetKezdete}T12:00:00Z`);
  for (let i = 0; i < 7; i++) {
    napok.push(datum.toISOString().slice(0, 10));
    datum.setUTCDate(datum.getUTCDate() + 1);
  }
  return napok;
}

export async function getElvinniHet(
  id: string,
  hetKezdete?: string
): Promise<ElvinniHet> {
  await requireAnyViewPermission(["fuvarozas", "elszamolas"]);

  const [elvinni] = await query<{ legkorabban: string | null }>(
    `select to_char(legkorabban, 'YYYY-MM-DD') as legkorabban
     from fuvar_megbizasok
     where id = $1 and idopont_nyitott and torolt_at is null`,
    [id]
  );
  if (!elvinni) throw new Error("Ez a saját fuvar már nem elérhető.");

  const [ma] = await query<{ ma: string }>(
    `select (now() at time zone 'Europe/Budapest')::date::text as ma`
  );
  let hetKezdet = hetKezdeteElvinni(elvinni.legkorabban, ma.ma);
  if (hetKezdete) {
    const [kivalasztott] = await query<{ het: string }>(
      `select date_trunc('week', $1::date)::date::text as het`,
      [hetKezdete]
    );
    hetKezdet = kivalasztott.het;
  }

  const napok = hetNapjai(hetKezdet);
  const hetVege = napok[6];
  const jarmuvek = await query<{ kod: string; cimke: string }>(
    `select kod, cimke from fuvar_jarmuvek where aktiv order by id`
  );
  const munkak = await query<HetiMegbizas>(
    `select m.id::text,
       coalesce(j.kod, m.elokeszites_jarmu) as jarmu,
       m.jelleg,
       coalesce(p.nev, m.megrendelo) as partner,
       m.kitol,
       m.megrendelo as kinek,
       m.felrako,
       m.lerako,
       to_char(m.datum, 'YYYY-MM-DD') as kezdet,
       to_char(coalesce(m.lerakas_datum, m.datum), 'YYYY-MM-DD') as veg,
       (m.elokeszites and m.elokeszites_jarmu is not null) as utemezett
     from fuvar_megbizasok m
     left join fuvar_jarmuvek j on j.id = m.jarmu_id
     left join fuvar_partnerek p on p.id = m.partner_id
     where m.torolt_at is null
       and m.allapot is not null
       and coalesce(j.kod, m.elokeszites_jarmu) is not null
       and coalesce(m.lerakas_datum, m.datum) >= $1::date - 30
       and m.datum <= $2::date
     order by m.datum, m.id`,
    [hetKezdet, hetVege]
  );

  const [felrako] = await query<{ cim: string }>(
    `select felrako as cim from fuvar_megbizasok where id = $1`,
    [id]
  );
  const pontCache = new Map<string, Promise<Pont | null>>();
  async function pont(cim: string | null): Promise<Pont | null> {
    const kulcs = cim?.trim() ?? "";
    if (!kulcs) return null;
    if (!pontCache.has(kulcs)) {
      pontCache.set(
        kulcs,
        geokodolCachelve(kulcs)
          .then((eredmeny) => eredmeny ? { lat: eredmeny.lat, lon: eredmeny.lon } : null)
          .catch(() => null)
      );
    }
    return (await pontCache.get(kulcs)) ?? null;
  }

  const celPont = await pont(felrako?.cim ?? null);
  const telephely = SAJAT_TELEPHELYEK[0].cim;
  const sorok = await Promise.all(jarmuvek.map(async (jarmu) => {
    const kocsiMunkai = napiSorrend(
      munkak.filter((munka) => munka.jarmu === jarmu.kod),
      (munka) => ({
        id: munka.id,
        felrakasNap: munka.kezdet,
        lerakasNap: munka.veg,
        felrako: munka.felrako,
        lerako: munka.lerako,
      })
    );
    let allohely = kocsiMunkai.filter((munka) => munka.veg < hetKezdet).at(-1)?.lerako ?? telephely;
    const cellak: ElvinniHetCella[] = [];

    for (const nap of napok) {
      const aznapiMunkak = napiSorrend(
        kocsiMunkai.filter((munka) => munka.kezdet <= nap && munka.veg >= nap),
        (munka) => ({
          id: munka.id,
          felrakasNap: munka.kezdet,
          lerakasNap: munka.veg,
          felrako: munka.felrako,
          lerako: munka.lerako,
        })
      );
      if (aznapiMunkak.length > 0) {
        allohely = aznapiMunkak[aznapiMunkak.length - 1].lerako ?? allohely;
      } else {
        const utolsoKorabbi = kocsiMunkai.filter((munka) => munka.veg < nap).at(-1);
        if (utolsoKorabbi?.lerako) allohely = utolsoKorabbi.lerako;
      }

      const napiUtolsoLerako = aznapiMunkak.length
        ? aznapiMunkak[aznapiMunkak.length - 1].lerako
        : null;
      const [utolsoLerakoPont, allohelyPont] = await Promise.all([
        pont(napiUtolsoLerako),
        pont(allohely),
      ]);
      const km = elvinniCellaKm({
        foglalt: aznapiMunkak.length > 0,
        utolsoLerakoPont,
        allohelyPont,
        felrakoPont: celPont,
      });

      cellak.push({
        nap,
        megbizasok: aznapiMunkak.map((munka) => ({
          id: munka.id,
          jelleg: munka.jelleg,
          partner: munka.partner,
          kitol: munka.kitol,
          kinek: munka.kinek,
          felrako: munka.felrako,
          lerako: munka.lerako,
          utemezett: munka.utemezett,
        })),
        hol: aznapiMunkak.length ? null : varosNev(allohely) ?? allohely,
        km,
        megNemViheto: !!elvinni.legkorabban && nap < elvinni.legkorabban,
      });
    }

    // „Micó (NMZ-492)“ — a sofőr beceneve és az első rendszám, hogy elsőre látsszon, kié a kocsi.
    const sofor = findJarmuByPlate(jarmu.kod)?.sofor;
    return { kod: jarmu.kod, cimke: sofor ? `${sofor} (${jarmu.kod})` : jarmu.cimke, napok: cellak };
  }));

  return { hetKezdet, napok, sorok, legkorabban: elvinni.legkorabban };
}
