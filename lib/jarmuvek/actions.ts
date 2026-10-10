"use server";

// Járművek modul (/jarmuvek) — szerver-akciók: járművek, pótkocsik, okmányok
// lejárattal, sofőr-profil dátumok. Törzsadat-táblák: 031-es migráció.
// Minden export jogosultságot ellenőriz ("jarmuvek" megtekintés/szerkesztés),
// lásd scripts/teszt-akcio-jogok.ts.
//
// Egy jármű módosítása után a jármű-gyorsítótár (jarmuvek-db.ts) ürül, így a
// GPS, a Ma, a Tervezés és a sofőr-nézet a következő kéréstől az új adatot
// látja — egy 4. kamion itt felvéve mindenhol megjelenik.

import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { requireEditPermission, requireViewPermission } from "@/lib/auth/require-permission";
import { jarmuCacheTorles } from "@/lib/fuvarozas/jarmuvek-db";
import { jarmuSzinE } from "@/lib/fuvarozas/vehicles";
import {
  normalRendszam,
  tisztitJarmu,
  tisztitOkmany,
  tisztitPotkocsi,
  tisztitSoforProfil,
  type JarmuAdat,
  type JarmuBemenet,
  type JarmuvekOldal,
  type OkmanyAdat,
  type OkmanyBemenet,
  type OkmanyTipus,
  type PotkocsiAdat,
  type PotkocsiBemenet,
  type SoforProfilAdat,
  type SoforProfilBemenet,
} from "@/lib/jarmuvek/tipusok";

type Eredmeny = { ok: true } | { ok: false; hiba: string };

function hibaUzenet(err: unknown): string {
  const e = err as { code?: string; constraint?: string; message?: string };
  if (e?.code === "23505") return "Ilyen kód vagy rendszám már van.";
  if (e?.code === "23503") return "A kiválasztott tétel (sofőr, pótkocsi, telephely) nem létezik.";
  if (e?.code === "42P01" || e?.code === "42703") return "A törzsadat-táblák még nincsenek meg (031-es migráció) — indítsd újra az alkalmazást.";
  return e?.message && !e.code ? e.message : "Nem sikerült menteni.";
}

function frissit() {
  jarmuCacheTorles();
  revalidatePath("/jarmuvek");
}

async function budapestMa(): Promise<string> {
  const [{ ma }] = await query<{ ma: string }>(`select ((now() at time zone 'Europe/Budapest')::date)::text as ma`);
  return ma;
}

/** Az oldal összes adata. Ha a 031-es migráció még nem futott, a járművek alapadatai akkor is látszanak. */
export async function getJarmuvekOldal(): Promise<JarmuvekOldal> {
  await requireViewPermission("jarmuvek");
  const ma = await budapestMa();
  const alkalmazottak = await query<{ id: string; nev: string }>(
    `select id::text, name as nev from alkalmazottak where active order by position, name`
  );
  try {
    const [jarmuvek, potkocsik, okmanyok, soforok, telephelyek] = await Promise.all([
      query<{
        id: string; kod: string; cimke: string; sofor_becenev: string | null; vontato_rendszam: string | null;
        potkocsi_id: string | null; potkocsi_rendszam: string | null; irasvaltozatok: string[] | null; szin: string | null;
        ecofleet_object_id: string | null; sofor_id: string | null; sofor_nev: string | null; fogyasztas_l_100km: number | null;
        euro_osztaly: string | null; hugo_kategoria: string | null; ossztomeg_t: number | null;
        alap_telephely_pont_id: string | null; alap_telephely_nev: string | null; megjegyzes: string | null; aktiv: boolean;
      }>(
        `select j.id::text, j.kod, j.cimke, j.sofor_becenev, j.vontato_rendszam,
                j.potkocsi_id::text, coalesce(p.rendszam, j.potkocsi_rendszam) as potkocsi_rendszam,
                j.irasvaltozatok, j.szin, j.ecofleet_object_id, j.sofor_id::text, a.name as sofor_nev,
                j.fogyasztas_l_100km, j.euro_osztaly, j.hugo_kategoria, j.ossztomeg_t,
                j.alap_telephely_pont_id::text, t.nev as alap_telephely_nev, j.megjegyzes, j.aktiv
           from fuvar_jarmuvek j
           left join fuvar_potkocsik p on p.id = j.potkocsi_id
           left join alkalmazottak a on a.id = j.sofor_id
           left join telephely_pont t on t.id = j.alap_telephely_pont_id
          order by j.aktiv desc, j.id`
      ),
      query<{
        id: string; rendszam: string; tipus: string | null; raklaphely_normal: number | null; raklaphely_forgatott: number | null;
        raklap_db_normal: number | null; raklap_db_forgatott: number | null; megjegyzes: string | null; aktiv: boolean;
      }>(`select id::text, rendszam, tipus, raklaphely_normal, raklaphely_forgatott, raklap_db_normal, raklap_db_forgatott, megjegyzes, aktiv
            from fuvar_potkocsik order by aktiv desc, id`),
      query<{
        id: string; jarmu_id: string | null; potkocsi_id: string | null; targy: string; tipus: OkmanyTipus;
        szam: string | null; partner: string | null; lejarat: string | null; megjegyzes: string | null;
      }>(
        `select o.id::text, o.jarmu_id::text, o.potkocsi_id::text,
                coalesce(j.cimke || coalesce(' (' || j.sofor_becenev || ')', ''), p.rendszam, '?') as targy,
                o.tipus, o.szam, o.partner, to_char(o.lejarat, 'YYYY-MM-DD') as lejarat, o.megjegyzes
           from jarmu_okmany o
           left join fuvar_jarmuvek j on j.id = o.jarmu_id
           left join fuvar_potkocsik p on p.id = o.potkocsi_id
          order by o.lejarat nulls last, o.id`
      ),
      query<{
        alkalmazott_id: string; nev: string; jogositvany_lejar: string | null; gki_lejar: string | null;
        tachokartya_szam: string | null; tachokartya_lejar: string | null; adr_lejar: string | null; megjegyzes: string | null;
      }>(
        // A sofőrök: akik járműhöz vannak rendelve, vagy akiknek már van profiljuk.
        `select a.id::text as alkalmazott_id, a.name as nev,
                to_char(s.jogositvany_lejar, 'YYYY-MM-DD') as jogositvany_lejar, to_char(s.gki_lejar, 'YYYY-MM-DD') as gki_lejar,
                s.tachokartya_szam, to_char(s.tachokartya_lejar, 'YYYY-MM-DD') as tachokartya_lejar,
                to_char(s.adr_lejar, 'YYYY-MM-DD') as adr_lejar, s.megjegyzes
           from alkalmazottak a
           left join sofor_profil s on s.alkalmazott_id = a.id
          where a.active and (s.alkalmazott_id is not null or exists (select 1 from fuvar_jarmuvek j where j.sofor_id = a.id))
          order by a.name`
      ),
      query<{ id: string; nev: string; tipus: string }>(`select id::text, nev, tipus from telephely_pont where aktiv order by sorrend, id`),
    ]);
    return {
      torzsKesz: true,
      ma,
      jarmuvek: jarmuvek.map((j): JarmuAdat => ({
        id: j.id, kod: j.kod, cimke: j.cimke, soforBecenev: j.sofor_becenev, vontatoRendszam: j.vontato_rendszam,
        potkocsiId: j.potkocsi_id, potkocsiRendszam: j.potkocsi_rendszam, irasvaltozatok: j.irasvaltozatok ?? [],
        szin: jarmuSzinE(j.szin) ? j.szin : "blue", ecofleetObjectId: j.ecofleet_object_id, soforId: j.sofor_id, soforNev: j.sofor_nev,
        fogyasztasL100: j.fogyasztas_l_100km != null ? Number(j.fogyasztas_l_100km) : null, euroOsztaly: j.euro_osztaly,
        hugoKategoria: j.hugo_kategoria, ossztomegT: j.ossztomeg_t != null ? Number(j.ossztomeg_t) : null,
        alapTelephelyPontId: j.alap_telephely_pont_id, alapTelephelyNev: j.alap_telephely_nev, megjegyzes: j.megjegyzes, aktiv: j.aktiv,
      })),
      potkocsik: potkocsik.map((p): PotkocsiAdat => ({
        id: p.id, rendszam: p.rendszam, tipus: p.tipus, raklaphelyNormal: p.raklaphely_normal, raklaphelyForgatott: p.raklaphely_forgatott,
        raklapDbNormal: p.raklap_db_normal, raklapDbForgatott: p.raklap_db_forgatott, megjegyzes: p.megjegyzes, aktiv: p.aktiv,
      })),
      okmanyok: okmanyok.map((o): OkmanyAdat => ({
        id: o.id, jarmuId: o.jarmu_id, potkocsiId: o.potkocsi_id, targy: o.targy, tipus: o.tipus, szam: o.szam,
        partner: o.partner, lejarat: o.lejarat, megjegyzes: o.megjegyzes,
      })),
      soforok: soforok.map((s): SoforProfilAdat => ({
        alkalmazottId: s.alkalmazott_id, nev: s.nev, jogositvanyLejar: s.jogositvany_lejar, gkiLejar: s.gki_lejar,
        tachokartyaSzam: s.tachokartya_szam, tachokartyaLejar: s.tachokartya_lejar, adrLejar: s.adr_lejar, megjegyzes: s.megjegyzes,
      })),
      alkalmazottak,
      telephelyek,
    };
  } catch (err) {
    console.warn("[jarmuvek] törzsadat-táblák nem olvashatók (031-es migráció?):", err instanceof Error ? err.message : err);
    const regi = await query<{ id: string; kod: string; cimke: string; vontato_rendszam: string | null; potkocsi_rendszam: string | null; szin: string | null; ecofleet_object_id: string | null; sofor_id: string | null; sofor_nev: string | null; fogyasztas_l_100km: number | null; aktiv: boolean; irasvaltozatok: string[] | null }>(
      `select j.id::text, j.kod, j.cimke, j.vontato_rendszam, j.potkocsi_rendszam, j.szin, j.ecofleet_object_id,
              j.sofor_id::text, a.name as sofor_nev, j.fogyasztas_l_100km, j.aktiv, j.irasvaltozatok
         from fuvar_jarmuvek j left join alkalmazottak a on a.id = j.sofor_id order by j.aktiv desc, j.id`
    ).catch(() => []);
    return {
      torzsKesz: false,
      ma,
      jarmuvek: regi.map((j): JarmuAdat => ({
        id: j.id, kod: j.kod, cimke: j.cimke, soforBecenev: null, vontatoRendszam: j.vontato_rendszam, potkocsiId: null,
        potkocsiRendszam: j.potkocsi_rendszam, irasvaltozatok: j.irasvaltozatok ?? [], szin: jarmuSzinE(j.szin) ? j.szin : "blue",
        ecofleetObjectId: j.ecofleet_object_id, soforId: j.sofor_id, soforNev: j.sofor_nev,
        fogyasztasL100: j.fogyasztas_l_100km != null ? Number(j.fogyasztas_l_100km) : null, euroOsztaly: null, hugoKategoria: null,
        ossztomegT: null, alapTelephelyPontId: null, alapTelephelyNev: null, megjegyzes: null, aktiv: j.aktiv,
      })),
      potkocsik: [],
      okmanyok: [],
      soforok: [],
      alkalmazottak,
      telephelyek: [],
    };
  }
}

/**
 * Jármű felvétele (id = null) vagy módosítása. A kód felvétel után nem
 * változtatható: a megbízások (elokeszites_jarmu) és a GPS-tükör kód szerint
 * hivatkoznak rá.
 */
export async function mentJarmu(id: string | null, bemenet: JarmuBemenet): Promise<Eredmeny> {
  await requireEditPermission("jarmuvek");
  try {
    if (id !== null && !/^\d+$/.test(id)) return { ok: false, hiba: "Érvénytelen jármű." };
    const j = tisztitJarmu(bemenet);

    // Ugyanaz a rendszám / sofőr-név / Ecofleet-azonosító ne legyen két
    // aktív járművön: a rendszám-felismerés és a sofőr ↔ kocsi összerendelés
    // (iratjog!) csak egyértelmű egyezést fogad el.
    const masok = await query<{ id: string; kod: string; vontato_rendszam: string | null; sofor_becenev: string | null; ecofleet_object_id: string | null; sofor_id: string | null; potkocsi_id: string | null }>(
      `select id::text, kod, vontato_rendszam, sofor_becenev, ecofleet_object_id, sofor_id::text, potkocsi_id::text
         from fuvar_jarmuvek where aktiv and ($1::bigint is null or id <> $1::bigint)`,
      [id]
    );
    if (j.aktiv) {
      if (j.vontatoRendszam && masok.some((m) => m.vontato_rendszam && normalRendszam(m.vontato_rendszam) === normalRendszam(j.vontatoRendszam!))) {
        return { ok: false, hiba: `A ${j.vontatoRendszam} rendszám már egy másik aktív járművön van.` };
      }
      if (masok.some((m) => (m.sofor_becenev ?? "").trim().toLowerCase() === j.soforBecenev.toLowerCase())) {
        return { ok: false, hiba: `„${j.soforBecenev}” rövid név már egy másik aktív járművön van.` };
      }
      if (j.ecofleetObjectId && masok.some((m) => m.ecofleet_object_id === j.ecofleetObjectId)) {
        return { ok: false, hiba: "Ez az Ecofleet azonosító már egy másik aktív járművön van." };
      }
      if (j.soforId && masok.some((m) => m.sofor_id === j.soforId)) {
        return { ok: false, hiba: "Ez a sofőr már egy másik aktív járműhöz van rendelve." };
      }
      if (j.potkocsiId && masok.some((m) => m.potkocsi_id === j.potkocsiId)) {
        return { ok: false, hiba: "Ez a pótkocsi már egy másik aktív járműhöz van kötve." };
      }
    }

    // A régi szöveges pótkocsi-mező (potkocsi_rendszam) is kövesse a
    // kiválasztott pótkocsit — a régi olvasók még abból dolgoznak.
    const [pot] = j.potkocsiId ? await query<{ rendszam: string }>(`select rendszam from fuvar_potkocsik where id = $1`, [j.potkocsiId]) : [];
    if (j.potkocsiId && !pot) return { ok: false, hiba: "A kiválasztott pótkocsi nem létezik." };
    const potkocsiRendszam = pot?.rendszam ?? null;
    const ertekek = [
      j.cimke, j.soforBecenev, j.vontatoRendszam, j.potkocsiId, potkocsiRendszam, j.irasvaltozatok, j.szin, j.ecofleetObjectId,
      j.soforId, j.fogyasztasL100, j.euroOsztaly, j.hugoKategoria, j.ossztomegT, j.alapTelephelyPontId, j.megjegyzes, j.aktiv,
    ];

    if (id === null) {
      await query(
        `insert into fuvar_jarmuvek (kod, cimke, sofor_becenev, vontato_rendszam, potkocsi_id, potkocsi_rendszam, irasvaltozatok, szin,
            ecofleet_object_id, sofor_id, fogyasztas_l_100km, euro_osztaly, hugo_kategoria, ossztomeg_t, alap_telephely_pont_id, megjegyzes, aktiv)
         values ($17, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, coalesce($12, 'J5'), $13, $14, $15, $16)`,
        [...ertekek, j.kod]
      );
    } else {
      const sorok = await query(
        `update fuvar_jarmuvek set cimke = $1, sofor_becenev = $2, vontato_rendszam = $3, potkocsi_id = $4, potkocsi_rendszam = $5,
            irasvaltozatok = $6, szin = $7, ecofleet_object_id = $8, sofor_id = $9, fogyasztas_l_100km = $10, euro_osztaly = $11,
            hugo_kategoria = $12, ossztomeg_t = $13, alap_telephely_pont_id = $14, megjegyzes = $15, aktiv = $16
          where id = $17 returning id`,
        [...ertekek, id]
      );
      if (sorok.length === 0) return { ok: false, hiba: "Nincs ilyen jármű." };
    }
    frissit();
    return { ok: true };
  } catch (err) {
    return { ok: false, hiba: hibaUzenet(err) };
  }
}

export async function mentPotkocsi(id: string | null, bemenet: PotkocsiBemenet): Promise<Eredmeny> {
  await requireEditPermission("jarmuvek");
  try {
    if (id !== null && !/^\d+$/.test(id)) return { ok: false, hiba: "Érvénytelen pótkocsi." };
    const p = tisztitPotkocsi(bemenet);
    const ertekek = [p.rendszam, p.tipus, p.raklaphelyNormal, p.raklaphelyForgatott, p.raklapDbNormal, p.raklapDbForgatott, p.megjegyzes, p.aktiv];
    if (id === null) {
      await query(
        `insert into fuvar_potkocsik (rendszam, tipus, raklaphely_normal, raklaphely_forgatott, raklap_db_normal, raklap_db_forgatott, megjegyzes, aktiv)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        ertekek
      );
    } else {
      const sorok = await query(
        `update fuvar_potkocsik set rendszam = $1, tipus = $2, raklaphely_normal = $3, raklaphely_forgatott = $4, raklap_db_normal = $5,
            raklap_db_forgatott = $6, megjegyzes = $7, aktiv = $8 where id = $9 returning id`,
        [...ertekek, id]
      );
      if (sorok.length === 0) return { ok: false, hiba: "Nincs ilyen pótkocsi." };
      // A hozzá kötött járművek szöveges pótkocsi-mezője kövesse az átírt rendszámot.
      await query(`update fuvar_jarmuvek set potkocsi_rendszam = $1 where potkocsi_id = $2`, [p.rendszam, id]);
    }
    frissit();
    return { ok: true };
  } catch (err) {
    return { ok: false, hiba: hibaUzenet(err) };
  }
}

export async function mentOkmany(id: string | null, bemenet: OkmanyBemenet): Promise<Eredmeny> {
  await requireEditPermission("jarmuvek");
  try {
    if (id !== null && !/^\d+$/.test(id)) return { ok: false, hiba: "Érvénytelen okmány." };
    const o = tisztitOkmany(bemenet);
    const ertekek = [o.jarmuId, o.potkocsiId, o.tipus, o.szam, o.partner, o.lejarat, o.megjegyzes];
    if (id === null) {
      await query(
        `insert into jarmu_okmany (jarmu_id, potkocsi_id, tipus, szam, partner, lejarat, megjegyzes) values ($1, $2, $3, $4, $5, $6, $7)`,
        ertekek
      );
    } else {
      const sorok = await query(
        `update jarmu_okmany set jarmu_id = $1, potkocsi_id = $2, tipus = $3, szam = $4, partner = $5, lejarat = $6, megjegyzes = $7
          where id = $8 returning id`,
        [...ertekek, id]
      );
      if (sorok.length === 0) return { ok: false, hiba: "Nincs ilyen okmány." };
    }
    revalidatePath("/jarmuvek");
    return { ok: true };
  } catch (err) {
    return { ok: false, hiba: hibaUzenet(err) };
  }
}

/** Egy tévesen felvitt okmány-sor törlése (a jármű és a pótkocsi nem törölhető, csak inaktiválható). */
export async function torolOkmany(id: string): Promise<Eredmeny> {
  await requireEditPermission("jarmuvek");
  if (!/^\d+$/.test(id)) return { ok: false, hiba: "Érvénytelen okmány." };
  try {
    await query(`delete from jarmu_okmany where id = $1`, [id]);
    revalidatePath("/jarmuvek");
    return { ok: true };
  } catch (err) {
    return { ok: false, hiba: hibaUzenet(err) };
  }
}

export async function mentSoforProfil(alkalmazottId: string, bemenet: SoforProfilBemenet): Promise<Eredmeny> {
  await requireEditPermission("jarmuvek");
  if (!/^\d+$/.test(alkalmazottId)) return { ok: false, hiba: "Érvénytelen dolgozó." };
  try {
    const s = tisztitSoforProfil(bemenet);
    await query(
      `insert into sofor_profil (alkalmazott_id, jogositvany_lejar, gki_lejar, tachokartya_szam, tachokartya_lejar, adr_lejar, megjegyzes, frissitve_at)
       values ($1, $2, $3, $4, $5, $6, $7, now())
       on conflict (alkalmazott_id) do update set jogositvany_lejar = excluded.jogositvany_lejar, gki_lejar = excluded.gki_lejar,
         tachokartya_szam = excluded.tachokartya_szam, tachokartya_lejar = excluded.tachokartya_lejar, adr_lejar = excluded.adr_lejar,
         megjegyzes = excluded.megjegyzes, frissitve_at = now()`,
      [alkalmazottId, s.jogositvanyLejar, s.gkiLejar, s.tachokartyaSzam, s.tachokartyaLejar, s.adrLejar, s.megjegyzes]
    );
    revalidatePath("/jarmuvek");
    return { ok: true };
  } catch (err) {
    return { ok: false, hiba: hibaUzenet(err) };
  }
}
