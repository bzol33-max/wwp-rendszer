"use server";

import { query, withTransaction } from "@/lib/db";
import { requireSession } from "@/lib/auth/dal";
import { requireAnyEditPermission, requireEditPermission } from "@/lib/auth/require-permission";
import { type Allapot } from "@/lib/megbizasok/allapotgep";
import { valtAllapotTx } from "@/lib/megbizasok/allapot-akcio";
import { ujKodTranzakcio, irEsemenyt, elszamolasUpsert, BER_SQL, letrehozTx } from "@/lib/megbizasok/repo";
import { findJarmuByPlate, jarmuLabel } from "@/lib/fuvarozas/vehicles";
import { frissitsdFuvarozas2Modellt } from "@/lib/fuvarozas2/modell-szinkron";
import { kanonikusMegrendeloNev } from "@/lib/fuvarozas/megrendelo-nev";
import { berFuvarHiba, berSzam, valtozottMezok, type BerFuvarAdat } from "@/lib/fuvarozas2/berfuvar";
import type { AddFuvarInput, FuvardijPenznem } from "@/lib/fuvarozas/fuvar-constants";
import { toroljIdovonalCachet } from "@/lib/fuvarozas/idovonal-cache";
import { fuvarSzamlaTukor } from "@/lib/fuvarozas/szamla-parositas";
import { normalizaltCegKulcs } from "@/lib/fuvarozas/fuvar-constants";
import type { SajatFuvarAdat, Eredmeny } from "@/lib/fuvarozas2/sajat-fuvar";


function egesz(s: string): number | null {
  const n = berSzam(s);
  return typeof n === "number" ? Math.round(n * 100) / 100 : null;
}
const ISO_NAP = /^\d{4}-\d{2}-\d{2}$/;
function tisztit(a: SajatFuvarAdat): SajatFuvarAdat { return { datum:a.datum.trim(), jarmuKod:a.jarmuKod?.trim()||null, honnan:a.honnan.trim(), hova:a.hova.trim(), kitol:a.kitol?.trim()||null, kinek:a.kinek?.trim()||null, megjegyzes:a.megjegyzes?.trim()||null }; }
async function hianyzoMezok(a: {datum:string|null;jarmuKod:string|null;honnan:string|null;hova:string|null}) { const h:string[]=[]; if(!a.datum||!ISO_NAP.test(a.datum))h.push("dátum");if(!a.jarmuKod)h.push("kocsi");if(!a.honnan?.trim())h.push("honnan");if(!a.hova?.trim())h.push("hová");return h;}
async function naplo(id:string,esemeny:string,reszletek:Record<string,unknown>){const s=await requireSession();await query(`insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, forras, ki, reszletek) values ($1, $2, 'ember', $3, $4)`,[id,esemeny,s.name??s.username,JSON.stringify(reszletek)]);}

export async function valtAllapot(
  id: string,
  hova: Allapot,
  opciok: { kezi?: boolean; megjegyzes?: string; kliensUuid?: string } = {}
): Promise<{ ok: true; allapot: Allapot } | { ok: false; hiba: string }> {
  await requireAnyEditPermission(["fuvarozas", "elszamolas"]);
  const session = await requireSession();
  return withTransaction((tx) => valtAllapotTx(tx, id, hova, opciok, session.name ?? session.username));
}

export async function setSzamlaSzam(id: string, szamlaSzam: string | null): Promise<{ ok: true } | { ok: false; hiba: string }> {
  await requireAnyEditPermission(["elszamolas", "fuvarozas"]);
  const session = await requireSession();
  const ki = session.name ?? session.username;
  const szam = szamlaSzam?.trim() || null;
  const [sz] = szam ? await query<{ id: string; kelt: string | null }>(`select id::text, to_char(kiallitas_datum, 'YYYY-MM-DD') as kelt from szamla where szamlaszam = $1`, [szam]) : [undefined];
  try {
    return await withTransaction(async (tx) => {
    const [sor] = await tx<{ allapot: Allapot | null }>(`select allapot from fuvar_megbizasok where id = $1 for update`, [id]);
    if (!sor) return { ok: false, hiba: "Nincs ilyen megbízás." };
    await elszamolasUpsert(tx, id, { szamlaSzam: szam, szamlaId: sz?.id ?? null, szamlaKelte: sz?.kelt ?? null });
    await tx(`update fuvar_elszamolas set
      fizetesi_esedekesseg = case when $2::date is not null and fizetesi_hatarido_nap is not null then $2::date + fizetesi_hatarido_nap else fizetesi_esedekesseg end,
      frissitve_at = now() where megbizas_id = $1`, [id, sz?.kelt ?? null]);
    await tx(`update fuvar_megbizasok set szamla_szam = $2 where id = $1`, [id, szam]);
    await tx(`insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, forras, ki, reszletek) values ($1, 'szamla_parositva', 'ember', $2, $3)`, [
      id, ki, JSON.stringify({ szamla_szam: szam, szamla_id: sz?.id ?? null }),
    ]);
    // A régi oszlop írása a 002-es triggeren át maga is állapotot válthat
    // (pl. szamlazhato → szamlazva) — ezért, mint a régi kód, az írás UTÁN
    // olvassuk újra az állapotot, de már ugyanebben a tranzakcióban.
    const [friss] = await tx<{ allapot: Allapot | null }>(`select allapot from fuvar_megbizasok where id = $1`, [id]);
    if (szam && (friss?.allapot === "szamlazhato" || friss?.allapot === "teljesitve")) {
      const atmenet = await valtAllapotTx(tx, id, "szamlazva", {}, ki);
      if (!atmenet.ok) throw new Error(`__ATMENET__A számlaszámhoz tartozó állapotváltás nem engedélyezett: ${atmenet.hiba}`);
    }
    if (!szam && friss?.allapot === "szamlazva") {
      const atmenet = await valtAllapotTx(tx, id, "teljesitve", {}, ki);
      if (!atmenet.ok) throw new Error(`__ATMENET__A számlaszám törlése miatti állapotváltás nem engedélyezett: ${atmenet.hiba}`);
    }
      return { ok: true };
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("__ATMENET__")) return { ok: false, hiba: err.message.slice("__ATMENET__".length) };
    throw err;
  }
}

export async function setMegjegyzes(id: string, megjegyzes: string | null): Promise<void> {
  await requireAnyEditPermission(["fuvarozas"]);
  const session = await requireSession();
  await query(`update fuvar_megbizasok set megjegyzes = $2 where id = $1`, [id, megjegyzes?.trim() || null]);
  await query(`insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, forras, ki, reszletek) values ($1, 'modositva', 'ember', $2, $3)`, [
    id, session.name ?? session.username, JSON.stringify({ mezo: "megjegyzes" }),
  ]);
}

export async function setFuvarJarmu(id: string, jarmuKod: string | null): Promise<{ ok: true; cimke: string | null } | { ok: false; hiba: string }> {
  await requireAnyEditPermission(["fuvarozas"]);
  const session = await requireSession();
  const jarmu = jarmuKod?.trim() ? findJarmuByPlate(jarmuKod.trim()) : null;
  if (jarmuKod?.trim() && !jarmu) return { ok: false, hiba: "Ismeretlen kocsi." };
  const [sor] = await query<{ elokeszites: boolean; jarmu: string | null }>(
    `select elokeszites, jarmu from fuvar_megbizasok where id = $1 and torolt_at is null`,
    [id]
  );
  if (!sor) return { ok: false, hiba: "Nincs ilyen fuvar." };
  if (sor.elokeszites) return { ok: false, hiba: "Ez a fuvar előkészítésben van — ott az űrlapon állítsd a kocsit, aztán „Kocsira adom”." };
  const cimke = jarmu ? jarmuLabel(jarmu) : null;
  await query(`update fuvar_megbizasok set jarmu = $2, jarmu_id = null where id = $1`, [id, cimke]);
  await frissitsdFuvarozas2Modellt(id);
  await query(
    `insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, forras, ki, reszletek) values ($1, 'hozzarendeles', 'ember', $2, $3)`,
    [id, session.name ?? session.username, JSON.stringify({ kocsi: cimke, elozo: sor.jarmu })]
  );
  return { ok: true, cimke };
}

export async function modositBerFuvart(id: string, a: BerFuvarAdat): Promise<{ ok: true } | { ok: false; hiba: string }> {
  await requireEditPermission("fuvarozas");
  const session = await requireSession();
  const hiba = berFuvarHiba(a);
  if (hiba) return { ok: false, hiba };
  const megrendelo = await kanonikusMegrendeloNev(a.megrendelo);
  let valtozott: string[] = [];
  const eredmeny = await ujKodTranzakcio(async (tx) => {
    const [regi] = await tx<BerFuvarAdat & { allapot: string }>(
      BER_SQL.replace("select ", "select m.allapot, ") + " for update of m",
      [id]
    );
    if (!regi) return { hiba: "Nincs ilyen bérfuvar." };
    valtozott = valtozottMezok(regi, a);
    if (valtozott.length === 0) return { nincsValtozas: true };
    await tx(
      `update fuvar_megbizasok set
         datum = $2, lerakas_datum = $3, idopont = $4, felrako = $5, lerako = $6, megrendelo = $7,
         pozicioszam = $8, pozicioszam_nincs = $9, aru = $10, mennyiseg = $11, suly = $12,
         jarmu = $13, sofor = $14, fuvardij = $15, fuvardij_penznem = $16, koltseg = $17,
         megjegyzes = $18, postazasi_cim = $19,
         -- mint az approveFuvar: más megrendelőnél/kocsinál a Fuvarozás 2 kulcsát a szinkron újraépíti
         partner_id = case when megrendelo is distinct from $7 then null else partner_id end,
         jarmu_id = case when jarmu is distinct from $13 or sofor is distinct from $14 then null else jarmu_id end
       where id = $1`,
      [
        id, a.datum, a.lerakasDatum || null, a.idopont.trim() || null, a.felrako.trim(), a.lerako.trim(), megrendelo,
        a.pozicioszamNincs ? null : a.pozicioszam.trim() || null, a.pozicioszamNincs, a.aru.trim() || null, a.mennyiseg.trim() || null, a.suly.trim() || null,
        a.jarmu.trim() || null, a.sofor.trim() || null, egesz(a.fuvardij), a.fuvardijPenznem === "EUR" ? "EUR" : "Ft", egesz(a.koltseg),
        a.megjegyzes.trim() || null, a.postazasiCim.trim() || null,
      ]
    );
    // Az állapot marad, ami volt: ha a 002 trigger a dátumok miatt átírta, visszaállítjuk.
    await tx(`update fuvar_megbizasok set allapot = $2 where id = $1 and allapot is distinct from $2`, [id, regi.allapot]);
    if (valtozott.includes("postazasiCim")) {
      await tx(`update fuvar_elszamolas set postazasi_cim = $2, frissitve_at = now() where megbizas_id = $1`, [id, a.postazasiCim.trim() || null]);
    }
    await tx(
      `insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, forras, ki, reszletek) values ($1, 'modositva', 'ember', $2, $3)`,
      [id, session.name ?? session.username, JSON.stringify({ mezok: valtozott, honnan: "megbizasok" })]
    );
    return { nincsValtozas: false };
  });
  if ("hiba" in eredmeny && eredmeny.hiba) return { ok: false, hiba: eredmeny.hiba };
  if (eredmeny.nincsValtozas) return { ok: true };
  await frissitsdFuvarozas2Modellt(id);
  return { ok: true };
}

export async function ujBerFuvar(a: BerFuvarAdat): Promise<{ ok: true; id: string } | { ok: false; hiba: string }> {
  await requireEditPermission("fuvarozas");
  const session = await requireSession();
  const hiba = berFuvarHiba(a);
  if (hiba) return { ok: false, hiba };
  const dij = egesz(a.fuvardij), koltseg = egesz(a.koltseg);
  const id = await letrehoz({
    tipus: "sajat", // fordított elnevezés: a DB-ben tipus='sajat' = bérfuvar
    datum: a.datum,
    lerakasDatum: a.lerakasDatum || undefined,
    idopont: a.idopont.trim() || undefined,
    felrako: a.felrako.trim(),
    lerako: a.lerako.trim(),
    megrendelo: a.megrendelo.trim() || undefined,
    pozicioszam: a.pozicioszamNincs ? undefined : a.pozicioszam.trim() || undefined,
    pozicioszamNincs: a.pozicioszamNincs,
    aru: a.aru.trim() || undefined,
    mennyiseg: a.mennyiseg.trim() || undefined,
    suly: a.suly.trim() || undefined,
    jarmu: a.jarmu.trim() || undefined,
    sofor: a.sofor.trim() || undefined,
    fuvardij: typeof dij === "number" ? dij : undefined,
    fuvardijPenznem: a.fuvardijPenznem,
    koltseg: typeof koltseg === "number" ? koltseg : undefined,
    megjegyzes: a.megjegyzes.trim() || undefined,
    postazasiCim: a.postazasiCim.trim() || undefined,
    forras: "kezi",
    ellenorzott: true,
    createdBy: session.name ?? session.username,
  });
  if (!id) return { ok: false, hiba: "Nem jött létre a fuvar." };
  return { ok: true, id };
}

export async function torolMegbizast(id: string): Promise<{ ok: true } | { ok: false; hiba: string }> {
  await requireAnyEditPermission(["fuvarozas"]);
  const session = await requireSession();
  const [sor] = await query<{ szamlas: boolean }>(
    `select (coalesce(m.szamla_szam, '') <> '' or cardinality(m.kieg_szamla_szamok) > 0
             or exists (select 1 from fuvar_elszamolas e where e.megbizas_id = m.id and coalesce(e.szamla_szam, '') <> '')) as szamlas
     from fuvar_megbizasok m where m.id = $1 and m.torolt_at is null`,
    [id]
  );
  if (!sor) return { ok: false, hiba: "Ez a fuvar már törölve van." };
  if (sor.szamlas) return { ok: false, hiba: "Számlázott fuvar nem törölhető." };
  const ki = session.name ?? session.username;
  await query(`update fuvar_megbizasok set statusz = 'torolt', torolt_at = now(), torolt_by = $2 where id = $1`, [id, ki]);
  await query(`insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, forras, ki, reszletek) values ($1, 'torolve', 'ember', $2, $3)`, [
    id, ki, JSON.stringify({ honnan: "munkaasztal" }),
  ]);
  return { ok: true };
}

export async function letrehoz(input: AddFuvarInput): Promise<string | null> {
  await requireEditPermission("fuvarozas");
  const id = await withTransaction(async (tx) => letrehozTx(tx, input));
  // A Fuvarozás 2 modell szinkronja és cache-törlése marad az INSERT után,
  // ugyanazzal a feltétellel, mint a korábbi létrehozási út (2026-10-06).
  if (id) {
    await frissitsdFuvarozas2Modellt(id);
  }
  return id;
}

export async function felszabaditFuvarDokumentumot(id: string): Promise<void> {
  await requireEditPermission("fuvarozas");
  const [sor] = await query<{ drive_file_id: string | null; dokumentum_url: string | null }>(
    `select drive_file_id, dokumentum_url from fuvar_megbizasok where id = $1`,
    [id]
  );
  if (!sor) throw new Error("Nincs ilyen fuvar.");
  const fileId = sor.drive_file_id ?? sor.dokumentum_url?.match(/\/file\/d\/([^/]+)\//)?.[1] ?? null;
  await query(
    `update fuvar_megbizasok
     set statusz = 'torolt',
         megjegyzes = coalesce(megjegyzes || ' | ', '') ||
           'Újraolvasásra felszabadítva, eredeti dokumentum: ' || coalesce(dokumentum_url, '-'),
         dokumentum_url = null,
         drive_file_id = null,
         -- A Duvenbeck-olvasó a törölt sor Út ID-jét „már megvan”-nak veszi
         -- (lib/fuvarozas/duvenbeck-import.ts, megvanMar) — itt elengedjük.
         reise_id = null
     where id = $1`,
    [id]
  );
  if (fileId) {
    // A csatolt irat és a napló hivatkozása se fogja tovább a fájlt — a
    // szinkron a napló nyers szövegét megtartja (nem tölti le újra hiába).
    await query(`delete from fuvar_dokumentumok where drive_file_id = $1 and fuvar_id = $2`, [fileId, id]);
    await query(`update fuvar_import_naplo set fuvar_id = null where drive_file_id = $1 and fuvar_id = $2`, [fileId, id]);
  }
  toroljIdovonalCachet();
}

export async function setFuvarPostazasiCim(id: string, postazasiCim: string | null) {
  await requireAnyEditPermission(["fuvarozas", "posta"]);
  await query(`update fuvar_megbizasok set postazasi_cim = $2 where id = $1`, [
    id,
    postazasiCim || null,
  ]);
}

export async function setFuvarFuvardij(
  id: string,
  fuvardij: number | null,
  penznem?: FuvardijPenznem
) {
  await requireEditPermission("fuvarozas");
  if (penznem) {
    await query(`update fuvar_megbizasok set fuvardij = $2, fuvardij_penznem = $3 where id = $1`, [
      id,
      fuvardij,
      penznem,
    ]);
  } else {
    await query(`update fuvar_megbizasok set fuvardij = $2 where id = $1`, [id, fuvardij]);
  }
}

export async function setFuvarFizetesiHatarido(id: string, nap: number | null) {
  await requireEditPermission("fuvarozas");
  await query(`update fuvar_megbizasok set fizetesi_hatarido_nap = $2 where id = $1`, [id, nap]);
}

export async function setFuvarPostazva(id: string, postazva: boolean) {
  // A "posta" jog is elég — ld. setFuvarPostazasiCim. Korábban csak a
  // Fuvarozás szerkesztési jogát fogadta el, ezért a /posta nézetben a
  // "Postázva" pipa hibával ("Nem sikerült menteni") visszapattant annál,
  // akinek csak a Posta modulja van engedélyezve.
  await requireAnyEditPermission(["fuvarozas", "posta"]);
  await query(
    `update fuvar_megbizasok set postazva = $2, postazva_at = case when $2 then now() else null end where id = $1`,
    [id, postazva]
  );
}

/** A párosított számla és elszámolási tükör egy tranzakcióban rögzítése. */
export async function rogzitParositottSzamlat(fuvarId: string, szamla: { szamlaSzam: string | null; szamlaId: string | null; szamlaKelte: string | null }, reszletek: Record<string, unknown>): Promise<{ regi: string | null } | null> {
  await requireEditPermission("fuvarozas");
  return withTransaction(async (tx) => {
    const rows = await tx<{ id: string; regi: string | null }>(
      `update fuvar_megbizasok m set szamla_szam = $2
       from (select szamla_szam as regi from fuvar_megbizasok where id = $1) r
       where m.id = $1 and m.jelleg = 'ber' and (coalesce(m.szamla_szam, '') = '' or exists (select 1 from szamla sz where sz.szamlaszam = m.szamla_szam and sz.sztornozva))
       returning m.id::text, nullif(r.regi, '') as regi`,
      [fuvarId, szamla.szamlaSzam]
    );
    if (!rows.length) return null;
    await elszamolasUpsert(tx, fuvarId, szamla);
    await irEsemenyt(tx, { megbizasId: fuvarId, esemeny: "szamla_parositva", forras: "szamla_szinkron", reszletek: { ...reszletek, ...(rows[0].regi ? { sztornozott_elozo: rows[0].regi } : {}) } });
    return { regi: rows[0].regi };
  });
}

export async function setFuvarSzamlaSzam(id: string, szamlaSzam: string | null) {
  await requireEditPermission("fuvarozas");
  const szam = szamlaSzam?.trim() || null;
  const [sz] = szam ? await query<{ id: string; kelt: string | null }>(
    `select id::text, to_char(kiallitas_datum, 'YYYY-MM-DD') as kelt from szamla where szamlaszam = $1`, [szam]
  ) : [undefined];
  const tukor = fuvarSzamlaTukor(szam, sz);
  await withTransaction(async (tx) => {
    const sor = await tx<{ jelleg: string }>(`update fuvar_megbizasok set szamla_szam = $2 where id = $1 returning jelleg`, [id, szam]);
    if (sor[0]?.jelleg === "ber") await elszamolasUpsert(tx, id, tukor);
  });
}

export async function mentSajatFuvart(id: string | null, nyers: SajatFuvarAdat): Promise<Eredmeny> {
  await requireEditPermission("fuvarozas");
  const a = tisztit(nyers);
  if (!ISO_NAP.test(a.datum)) return { ok: false, hiba: "A dátum kötelező." };
  if (a.jarmuKod && !findJarmuByPlate(a.jarmuKod)) return { ok: false, hiba: "Ismeretlen kocsi." };
  const session = await requireSession();
  if (!id) {
    // A set_config a 002-es napló-trigger kettőzését fojtja el: a saját,
    // részletesebb „letrehozva” eseményünket lent írjuk.
    const ujId = await withTransaction(async (tx) => {
      await tx(`select set_config('fuvarozas2.uj_kod', '1', true)`);
      const uj = await letrehozTx(tx, {
        tipus: "ber", datum: a.datum, felrako: a.honnan, lerako: a.hova, megrendelo: a.kinek ?? undefined,
        megjegyzes: a.megjegyzes ?? undefined, forras: "kezi", ellenorzott: true, createdBy: session.name ?? session.username,
        elokeszites: true, elokeszitesJarmu: a.jarmuKod, allapot: "tervezett", kitol: a.kitol,
        statusz: "uj", letrehozasUt: "sajat-elokeszites",
        kanonikusNev: false,
      });
      if (uj) await tx(`insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, forras, ki, reszletek) values ($1, 'letrehozva', 'ember', $2, $3)`, [uj, session.name ?? session.username, JSON.stringify({ elokeszites: true })]);
      return uj;
    });
    return ujId ? { ok: true, id: ujId } : { ok: false, hiba: "Nem jött létre a fuvar." };
  }
  // A háttér-szinkron a „kinek” szövegéből partnert köt a fuvarhoz, és a
  // felület a partner nevét mutatja. A kötés csak akkor marad, ha a partner
  // kulcsa a beírt névé; különben eldobjuk, és lent a beírtból kötünk újra.
  // Nem elég a régi szöveggel összevetni: a 2026-09-26 előtti mentések a
  // szöveget már átírták („Fabrika 2000 Kft”), a kötés viszont az MTS-en
  // maradt — a szöveg így nem változott, és az MTS mindig visszajött.
  const frissitve = await query<{ id: string }>(
    `update fuvar_megbizasok set datum = $2, felrako = $3, lerako = $4, megrendelo = $5, megjegyzes = $6, elokeszites_jarmu = $7, kitol = $9,
       partner_id = case when exists (select 1 from fuvar_partnerek p where p.id = partner_id and p.nev_kulcs = $8::text)
                         then partner_id end
     where id = $1 and elokeszites and jelleg = 'sajat' and torolt_at is null returning id::text`,
    [id, a.datum, a.honnan, a.hova, a.kinek, a.megjegyzes, a.jarmuKod, a.kinek ? normalizaltCegKulcs(a.kinek) : null, a.kitol]
  );
  if (frissitve.length === 0) return { ok: false, hiba: "Ez a fuvar már nincs előkészítésben — előbb vedd vissza." };
  await frissitsdFuvarozas2Modellt(id);
  await naplo(id, "modositva", { elokeszites: true });
  return { ok: true, id };
}

export async function kocsiraAdom(id: string): Promise<Eredmeny> {
  await requireEditPermission("fuvarozas");
  const [sor] = await query<{ datum: string | null; elokeszites_jarmu: string | null; felrako: string; lerako: string; elokeszites: boolean }>(
    `select to_char(datum, 'YYYY-MM-DD') as datum, elokeszites_jarmu, felrako, lerako, elokeszites
     from fuvar_megbizasok where id = $1 and jelleg = 'sajat' and torolt_at is null`,
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
     where id = $1 and jelleg = 'sajat' and not elokeszites and torolt_at is null and not coalesce(teljesitve, false)
     returning id::text`,
    [id]
  );
  if (!sor) return { ok: false, hiba: "Ez a fuvar nem vehető vissza." };
  // A megállók a „Kocsira adom”-nál újra felépülnek a (módosított) címekből.
  await query(`delete from fuvar_megallok where megbizas_id = $1`, [id]);
  await naplo(id, "visszaallitas", { elokeszitesbe: true });
  return { ok: true, id };
}

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
