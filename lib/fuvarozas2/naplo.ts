"use server";

// Fuvarozás 2 — Napló: ki mit tett az utóbbi időben, egy listában.
//
// A vezetői mobil „Fuvar → Napló" szegmense ebből dolgozik. Minden „tesz" egy
// esemény (fuvar_megbizas_esemeny), ezért utólag látszik, ki nyomta meg a
// gombot és mikor — a terv 2. fejezetének kikötése. Csak olvas.

import { query } from "@/lib/db";
import { requireAnyViewPermission } from "@/lib/auth/require-permission";

export type NaploSor = {
  id: string;
  megbizas_id: string;
  esemeny: string;
  allapot_elott: string | null;
  allapot_utan: string | null;
  forras: string;
  ki: string | null;
  mikor: string;
  partner_nev: string | null;
  hivatkozas: string | null;
  jarmu_kod: string | null;
};

export async function getNaplo(limit = 60): Promise<NaploSor[]> {
  await requireAnyViewPermission(["fuvarozas", "elszamolas"]);
  return query<NaploSor>(
    `select e.id::text, e.megbizas_id::text, e.esemeny, e.allapot_elott, e.allapot_utan,
       e.forras, e.ki, e.mikor::text,
       coalesce(p.nev, m.megrendelo) as partner_nev,
       coalesce(m.hivatkozas_kanonikus, m.pozicioszam, m.reise_id) as hivatkozas,
       j.kod as jarmu_kod
     from fuvar_megbizas_esemeny e
     join fuvar_megbizasok m on m.id = e.megbizas_id
     left join fuvar_partnerek p on p.id = m.partner_id
     left join fuvar_jarmuvek j on j.id = m.jarmu_id
     order by e.mikor desc, e.id desc
     limit ${Math.min(Math.max(limit, 1), 200)}`
  );
}
