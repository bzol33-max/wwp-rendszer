"use server";

// Saját fuvar előkészítése és „kocsira adása” (Budaházi Zoltán,
// 2026-09-25): a saját fuvarokat előre beírja, módosítja, és ha minden
// biztos, egy gombbal kocsira adja — onnantól olyan, mint egy megbízás,
// megy a sofőrnek.
//
// Kötelező a „Kocsira adom” előtt: honnan, hová, dátum, kocsi. A dátum az,
// amit ő állít be (a szállítólevélé nem számít). Amíg a fuvar előkészítésben
// van, a kocsi az `elokeszites_jarmu`-ban vár és a `jarmu` üres — a sofőr
// appja és a GPS-figyelő a `jarmu` szerint válogat, ezért egyik sem látja.
//
// Elnevezés: a `tipus = 'ber'` a felületen „Saját fuvar” (jelleg = 'sajat').

import { query } from "@/lib/db";
import { requireSession } from "@/lib/auth/dal";
import { requireEditPermission, requireViewPermission } from "@/lib/auth/require-permission";
import { SAJAT_JARMUVEK, findJarmuByPlate, jarmuLabel } from "@/lib/fuvarozas/vehicles";
import { SAJAT_TELEPHELYEK } from "@/lib/fuvarozas/telephelyek";
import { frissitsdFuvarozas2Modellt } from "@/lib/fuvarozas2/modell-szinkron";

export type SajatFuvarAdat = {
  datum: string;
  jarmuKod: string | null;
  honnan: string;
  hova: string;
  kinek: string | null;
  megjegyzes: string | null;
};

export type Eredmeny = { ok: true; id: string } | { ok: false; hiba: string };

const ISO_NAP = /^\d{4}-\d{2}-\d{2}$/;

/** Mi hiányzik még a „Kocsira adom”-hoz (üres lista = kocsira adható). */
export async function hianyzoMezok(a: { datum: string | null; jarmuKod: string | null; honnan: string | null; hova: string | null }): Promise<string[]> {
  const h: string[] = [];
  if (!a.datum || !ISO_NAP.test(a.datum)) h.push("dátum");
  if (!a.jarmuKod) h.push("kocsi");
  if (!a.honnan?.trim()) h.push("honnan");
  if (!a.hova?.trim()) h.push("hová");
  return h;
}

function tisztit(a: SajatFuvarAdat): SajatFuvarAdat {
  return {
    datum: a.datum.trim(),
    jarmuKod: a.jarmuKod?.trim() || null,
    honnan: a.honnan.trim(),
    hova: a.hova.trim(),
    kinek: a.kinek?.trim() || null,
    megjegyzes: a.megjegyzes?.trim() || null,
  };
}

async function naplo(id: string, esemeny: string, reszletek: Record<string, unknown>) {
  const session = await requireSession();
  await query(
    `insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, forras, ki, reszletek) values ($1, $2, 'ember', $3, $4)`,
    [id, esemeny, session.name ?? session.username, JSON.stringify(reszletek)]
  );
}

/** Új előkészített saját fuvar, vagy egy előkészítés alatti módosítása. */
export async function mentSajatFuvart(id: string | null, nyers: SajatFuvarAdat): Promise<Eredmeny> {
  await requireEditPermission("fuvarozas");
  const a = tisztit(nyers);
  if (!ISO_NAP.test(a.datum)) return { ok: false, hiba: "A dátum kötelező." };
  if (a.jarmuKod && !findJarmuByPlate(a.jarmuKod)) return { ok: false, hiba: "Ismeretlen kocsi." };
  const session = await requireSession();
  if (!id) {
    // A set_config a 002-es napló-trigger kettőzését fojtja el: a saját,
    // részletesebb „letrehozva” eseményünket lent írjuk.
    const [sor] = await query<{ id: string }>(
      `insert into fuvar_megbizasok (tipus, datum, felrako, lerako, megrendelo, megjegyzes, statusz, forras, ellenorzott,
         elokeszites, elokeszites_jarmu, allapot, allapot_at, created_by)
       select 'ber', $1, $2, $3, $4, $5, 'uj', 'kezi', true, true, $6, 'tervezett', now(), $7
       from (select set_config('fuvarozas2.uj_kod', '1', true)) _elnyomas
       returning id::text`,
      [a.datum, a.honnan, a.hova, a.kinek, a.megjegyzes, a.jarmuKod, session.name ?? session.username]
    );
    await naplo(sor.id, "letrehozva", { elokeszites: true });
    return { ok: true, id: sor.id };
  }
  const frissitve = await query<{ id: string }>(
    `update fuvar_megbizasok set datum = $2, felrako = $3, lerako = $4, megrendelo = $5, megjegyzes = $6, elokeszites_jarmu = $7
     where id = $1 and elokeszites and tipus = 'ber' and torolt_at is null returning id::text`,
    [id, a.datum, a.honnan, a.hova, a.kinek, a.megjegyzes, a.jarmuKod]
  );
  if (frissitve.length === 0) return { ok: false, hiba: "Ez a fuvar már nincs előkészítésben — előbb vedd vissza." };
  await naplo(id, "modositva", { elokeszites: true });
  return { ok: true, id };
}

/**
 * „Kocsira adom”: a kocsi a `jarmu` mezőbe kerül (a sofőr appja innen
 * látja), az előkészítés véget ér, a Fuvarozás 2 megállói felépülnek.
 */
export async function kocsiraAdom(id: string): Promise<Eredmeny> {
  await requireEditPermission("fuvarozas");
  const [sor] = await query<{ datum: string | null; elokeszites_jarmu: string | null; felrako: string; lerako: string; elokeszites: boolean }>(
    `select to_char(datum, 'YYYY-MM-DD') as datum, elokeszites_jarmu, felrako, lerako, elokeszites
     from fuvar_megbizasok where id = $1 and tipus = 'ber' and torolt_at is null`,
    [id]
  );
  if (!sor) return { ok: false, hiba: "Nincs ilyen saját fuvar." };
  if (!sor.elokeszites) return { ok: false, hiba: "Ez a fuvar már kocsin van." };
  const hiany = await hianyzoMezok({ datum: sor.datum, jarmuKod: sor.elokeszites_jarmu, honnan: sor.felrako, hova: sor.lerako });
  if (hiany.length > 0) return { ok: false, hiba: `Hiányzik: ${hiany.join(", ")}.` };
  const jarmu = findJarmuByPlate(sor.elokeszites_jarmu!);
  if (!jarmu) return { ok: false, hiba: "Ismeretlen kocsi." };
  await query(
    `update fuvar_megbizasok set jarmu = $2, jarmu_id = null, elokeszites = false, kocsira_adva_at = now(), ellenorzott = true
     where id = $1`,
    [id, jarmuLabel(jarmu)]
  );
  // Az előkészítés alatt a háttér-szinkron már felépíthette a megállókat a
  // korábbi címekből; a sofőr még nem látta őket, ezért a mostaniakból újra.
  await query(`delete from fuvar_megallok where megbizas_id = $1`, [id]);
  await frissitsdFuvarozas2Modellt(id);
  await naplo(id, "hozzarendeles", { kocsira_adva: jarmuLabel(jarmu) });
  return { ok: true, id };
}

/**
 * „Visszaveszem”: a kocsira adott saját fuvar vissza előkészítésbe, amíg a
 * sofőr el nem indult vele (egyik megállóját sem érintette sofőr vagy GPS).
 */
export async function visszaveszem(id: string): Promise<Eredmeny> {
  await requireEditPermission("fuvarozas");
  const [erintett] = await query<{ n: number }>(
    `select (
       (select count(*) from fuvar_megallo_allapot a where a.fuvar_id = $1 and (a.kesz or a.kezi_erkezes is not null)) +
       (select count(*) from fuvar_megallok g where g.megbizas_id = $1 and (g.gps_erkezes is not null or g.sofor_kesz_at is not null))
     )::int as n`,
    [id]
  );
  if ((erintett?.n ?? 0) > 0) return { ok: false, hiba: "A sofőr már elindult ezzel a fuvarral — nem vehető vissza." };
  const [sor] = await query<{ id: string }>(
    `update fuvar_megbizasok m set elokeszites = true,
       elokeszites_jarmu = coalesce(elokeszites_jarmu, (select j.kod from fuvar_jarmuvek j where j.id = m.jarmu_id)),
       jarmu = null, jarmu_id = null, kocsira_adva_at = null
     where id = $1 and tipus = 'ber' and not elokeszites and torolt_at is null and not coalesce(teljesitve, false)
     returning id::text`,
    [id]
  );
  if (!sor) return { ok: false, hiba: "Ez a fuvar nem vehető vissza." };
  // A megállók a „Kocsira adom”-nál újra felépülnek a (módosított) címekből.
  await query(`delete from fuvar_megallok where megbizas_id = $1`, [id]);
  await naplo(id, "visszaallitas", { elokeszitesbe: true });
  return { ok: true, id };
}

/** Előkészítés alatti saját fuvar törlése (a kocsira adottat előbb vissza kell venni). */
export async function torolElokeszitettet(id: string): Promise<Eredmeny> {
  await requireEditPermission("fuvarozas");
  const session = await requireSession();
  const [sor] = await query<{ id: string }>(
    `update fuvar_megbizasok set statusz = 'torolt', torolt_at = now(), torolt_by = $2
     where id = $1 and elokeszites and torolt_at is null returning id::text`,
    [id, session.name ?? session.username]
  );
  if (!sor) return { ok: false, hiba: "Csak előkészítés alatti fuvar törölhető itt." };
  await naplo(id, "torolve", { elokeszites: true });
  return { ok: true, id };
}

export type SajatFuvarSegedlet = {
  jarmuvek: { kod: string; cimke: string }[];
  /** Választható helyek: a cím kerül a mezőbe (a geokódolás a címből dolgozik), a név csak segít választani. */
  helyek: { cim: string; nev: string | null }[];
  partnerek: string[];
};

/** A rögzítő űrlap választólistái: kocsik, telephelyek + korábbi címek, partnerek. */
export async function getSajatFuvarSegedlet(): Promise<SajatFuvarSegedlet> {
  await requireViewPermission("fuvarozas");
  const [cimek, partnerek] = await Promise.all([
    query<{ cim: string }>(
      `select cim from (
         select felrako as cim, max(datum) as utolso from fuvar_megbizasok where tipus = 'ber' and felrako <> '' group by felrako
         union all
         select lerako, max(datum) from fuvar_megbizasok where tipus = 'ber' and lerako <> '' group by lerako
       ) x group by cim order by max(utolso) desc limit 40`
    ),
    query<{ nev: string }>(`select nev from fuvar_partnerek order by nev limit 300`),
  ]);
  const telephelyek = SAJAT_TELEPHELYEK.map((t) => ({ cim: t.cim, nev: t.nev }));
  const ismert = new Set(telephelyek.map((t) => t.cim));
  return {
    jarmuvek: SAJAT_JARMUVEK.filter((j) => j.rendszamok.length > 0).map((j) => ({ kod: j.rendszamok[0], cimke: `${j.sofor} · ${j.rendszamok[0]}` })),
    helyek: [...telephelyek, ...cimek.filter((c) => !ismert.has(c.cim)).map((c) => ({ cim: c.cim, nev: null }))],
    partnerek: partnerek.map((p) => p.nev),
  };
}
