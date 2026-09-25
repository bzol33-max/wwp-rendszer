"use server";

// Fuvarozás 2 — a „Ma” képernyő adatai: kocsinként a mai/holnapi
// megbízások az új modellből, és a jelzések (mi vár döntésre).

import { query } from "@/lib/db";
import { requireAnyViewPermission } from "@/lib/auth/require-permission";
import { getMegbizasok, type MegbizasSor } from "@/lib/fuvarozas2/megbizasok";

export type Jelzes = { kulcs: string; szoveg: string; darab: number; sulyossag: "info" | "figyelmeztetes" | "sulyos"; href: string };

export type MaAdat = {
  ma: string;
  holnap: string;
  kocsik: { kod: string; cimke: string; sofor: string | null; ma: MegbizasSor[]; holnap: MegbizasSor[] }[];
  kocsiNelkul: MegbizasSor[];
  jelzesek: Jelzes[];
  allapotSzamok: { allapot: string; n: number }[];
};

export async function getMaAdat(): Promise<MaAdat> {
  await requireAnyViewPermission(["fuvarozas", "elszamolas"]);
  const [{ ma, holnap }] = await query<{ ma: string; holnap: string }>(
    `select ((now() at time zone 'Europe/Budapest')::date)::text as ma, ((now() at time zone 'Europe/Budapest')::date + 1)::text as holnap`
  );
  const nyitott = await getMegbizasok({ allapotok: ["ellenorzesre_var", "tervezett", "folyamatban"], limit: 500 });
  const kocsikRaw = await query<{ kod: string; cimke: string; sofor: string | null }>(
    `select j.kod, j.cimke, a.name as sofor from fuvar_jarmuvek j left join alkalmazottak a on a.id = j.sofor_id where j.aktiv and j.ecofleet_object_id is not null order by j.id`
  );
  const aznap = (s: MegbizasSor, nap: string) => (s.felrakas_nap ?? "") <= nap && (s.lerakas_nap ?? s.felrakas_nap ?? "") >= nap;
  const kocsik = kocsikRaw.map((k) => ({
    ...k,
    ma: nyitott.filter((s) => s.jarmu_kod === k.kod && aznap(s, ma)),
    holnap: nyitott.filter((s) => s.jarmu_kod === k.kod && aznap(s, holnap)),
  }));
  const kocsiNelkul = nyitott.filter((s) => !s.jarmu_kod && (s.felrakas_nap ?? "") <= holnap);

  const allapotSzamok = await query<{ allapot: string; n: number }>(
    `select allapot, count(*)::int as n from fuvar_megbizasok where torolt_at is null and allapot is not null and allapot <> 'lezart' group by allapot`
  );
  const n = (a: string) => allapotSzamok.find((x) => x.allapot === a)?.n ?? 0;
  const [{ lejart }] = await query<{ lejart: number }>(
    `select count(*)::int as lejart from fuvar_megbizasok where torolt_at is null and allapot in ('tervezett','folyamatban')
       and coalesce(lerakas_datum, datum) < (now() at time zone 'Europe/Budapest')::date`
  );
  const [{ fotora_var }] = await query<{ fotora_var: number }>(
    `select count(*)::int as fotora_var from fuvar_megbizasok m where m.torolt_at is null and m.jelleg = 'ber' and m.allapot = 'teljesitve' and m.allapot_at < now() - interval '2 hours'`
  );
  const [{ postazando }] = await query<{ postazando: number }>(
    `select count(*)::int as postazando from fuvar_megbizasok m
     where m.torolt_at is null and m.jelleg = 'ber' and m.allapot in ('szamlazva','email_elment')`
  );
  const jelzesek: Jelzes[] = ([
    { kulcs: "ellenorzes", szoveg: "ellenőrzésre vár", darab: n("ellenorzesre_var"), sulyossag: "figyelmeztetes", href: "/fuvarozas2/megbizasok?csoport=ellenorzes" },
    { kulcs: "lejart", szoveg: "lejárt, nincs teljesítve", darab: lejart, sulyossag: "sulyos", href: "/fuvarozas2/megbizasok?csoport=folyamatban" },
    { kulcs: "kocsi_nelkul", szoveg: "kocsi nélkül (ma/holnap)", darab: kocsiNelkul.length, sulyossag: "sulyos", href: "/fuvarozas2/megbizasok?csoport=folyamatban" },
    { kulcs: "fotora_var", szoveg: "fotóra vár 2 óránál régebben", darab: fotora_var, sulyossag: "figyelmeztetes", href: "/fuvarozas2/elszamolas" },
    { kulcs: "szamlazhato", szoveg: "számlázni (visszaért)", darab: n("szamlazhato") + n("teljesitve"), sulyossag: "info", href: "/fuvarozas2/elszamolas" },
    { kulcs: "postazando", szoveg: "számlázva, postára vár", darab: postazando, sulyossag: "info", href: "/fuvarozas2/elszamolas" },
  ] as Jelzes[]).filter((j) => j.darab > 0);

  return { ma, holnap, kocsik, kocsiNelkul, jelzesek, allapotSzamok };
}
