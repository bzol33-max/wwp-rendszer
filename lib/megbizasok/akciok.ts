"use server";

import { query, withTransaction } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { frissitMegbizasMenetet } from "@/lib/menet/generalas";
import { szkennelj } from "@/lib/fuvarozas/doksi-kivagas";
import { requireSession } from "@/lib/auth/dal";
import { requireAnyEditPermission, requireEditPermission } from "@/lib/auth/require-permission";
import { type Allapot } from "@/lib/megbizasok/allapotgep";
import { valtAllapotTx } from "@/lib/megbizasok/allapot-akcio";
import { ujKodTranzakcio, irEsemenyt, elszamolasUpsert, BER_SQL, letrehozTx } from "@/lib/megbizasok/repo";
import { findJarmuByPlate, findJarmuInSzoveg, jarmuLabel, resolveJarmu } from "@/lib/fuvarozas/vehicles";
import { getJarmuvek } from "@/lib/fuvarozas/jarmuvek-db";
import { frissitsdFuvarozas2Modellt } from "@/lib/fuvarozas2/modell-szinkron";
import { kanonikusMegrendeloNev } from "@/lib/fuvarozas/megrendelo-nev";
import { berFuvarHiba, berSzam, valtozottMezok, type BerFuvarAdat } from "@/lib/fuvarozas2/berfuvar";
import type { AddFuvarInput, FuvardijPenznem } from "@/lib/fuvarozas/fuvar-constants";
import { toroljIdovonalCachet } from "@/lib/fuvarozas/idovonal-cache";
import { fuvarSzamlaTukor } from "@/lib/fuvarozas/szamla-parositas";
import { normalizaltCegKulcs } from "@/lib/fuvarozas/fuvar-constants";
import type { SajatFuvarAdat, Eredmeny } from "@/lib/fuvarozas2/sajat-fuvar";
import { ALLAPOT_CIMKE } from "@/lib/megbizasok/allapotgep";
import { duplikatumSor, keresDuplikatumot, type DuplikatumJelolt } from "@/lib/fuvarozas2/sajat-duplikatum";
import { utemezhetoNap } from "@/lib/megbizasok/elvinni-szabalyok";
import { budapestNapISO } from "@/lib/fuvarozas/idozona";
import { irValtozasokat, naplozandoValtozasok } from "@/lib/menet/valtozas";
import { papirValtasHiba } from "@/lib/megbizasok/papir-alap";
import { ujJarmuId } from "@/lib/megbizasok/jarmu-dontes";
import { torlesSet } from "@/lib/megbizasok/torles";


function egesz(s: string): number | null {
  const n = berSzam(s);
  return typeof n === "number" ? Math.round(n * 100) / 100 : null;
}
const ISO_NAP = /^\d{4}-\d{2}-\d{2}$/;
// Múltbeli napra tett saját fuvart a követő trigger azonnal teljesítettnek
// (lezártnak) vette — ezért se kocsira, se ütemezésre nem mehet (2026-10-10).
const MULT_NAP_HIBA = "Saját fuvar nem tehető múltbeli napra — válassz mai vagy későbbi napot.";
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
  const eredmeny = await withTransaction((tx) => valtAllapotTx(tx, id, hova, opciok, session.name ?? session.username));
  toroljIdovonalCachet();
  return eredmeny;
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

/**
 * „Papír megjött ✓” / visszavonás (2026-10-11): Szabina nyugtázza az eredeti
 * papírt (CMR / fuvarlevél). Nem állapotváltás, csak jelzés — a számlázást
 * nem tiltja. Jog: aki postázhat / elszámolhat (valtAllapot-tal azonos).
 * Kettős írás (új elszámolás-tábla + régi oszlop), naplózva; a 040-es
 * migráció óta a régi oszlop írása nem számolja újra az állapotot.
 */
export async function setPapirMegjott(id: string, megjott: boolean): Promise<{ ok: true } | { ok: false; hiba: string }> {
  await requireAnyEditPermission(["fuvarozas", "elszamolas"]);
  const session = await requireSession();
  const ki = session.name ?? session.username;
  return withTransaction(async (tx) => {
    const [sor] = await tx<{ jelleg: string | null; torolt: boolean; megvan: boolean }>(
      `select m.jelleg, m.torolt_at is not null as torolt,
              coalesce(e.papirok_beerkeztek_at, m.papirok_beerkeztek_at) is not null as megvan
         from fuvar_megbizasok m left join fuvar_elszamolas e on e.megbizas_id = m.id
        where m.id = $1 for update of m`,
      [id]
    );
    if (!sor) return { ok: false, hiba: "Nincs ilyen megbízás." };
    const hiba = papirValtasHiba({ jelleg: sor.jelleg, torolt: sor.torolt, megvan: sor.megvan, megjott });
    if (hiba) return { ok: false, hiba };
    await tx(`select set_config('fuvarozas2.uj_kod', '1', true)`);
    await tx(`insert into fuvar_elszamolas (megbizas_id) values ($1) on conflict (megbizas_id) do nothing`, [id]);
    if (megjott) {
      await tx(`update fuvar_elszamolas set papirok_beerkeztek_at = now(), papirok_beerkeztek_by = $2, frissitve_at = now() where megbizas_id = $1`, [id, ki]);
      await tx(`update fuvar_megbizasok set papirok_beerkeztek_at = now() where id = $1`, [id]);
    } else {
      await tx(`update fuvar_elszamolas set papirok_beerkeztek_at = null, papirok_beerkeztek_by = null, frissitve_at = now() where megbizas_id = $1`, [id]);
      await tx(`update fuvar_megbizasok set papirok_beerkeztek_at = null where id = $1`, [id]);
    }
    await irEsemenyt(tx, {
      megbizasId: id, esemeny: megjott ? "papir_beerkezett" : "visszaallitas",
      forras: "ember", ki, reszletek: megjott ? { mezo: "papir" } : { mezo: "papir", indok: "papír-nyugtázás visszavonva" },
    });
    return { ok: true };
  });
}

export async function setMegjegyzes(id: string, megjegyzes: string | null): Promise<void> {
  await requireAnyEditPermission(["fuvarozas"]);
  const session = await requireSession();
  await query(`update fuvar_megbizasok set megjegyzes = $2 where id = $1`, [id, megjegyzes?.trim() || null]);
  await query(`insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, forras, ki, reszletek) values ($1, 'modositva', 'ember', $2, $3)`, [
    id, session.name ?? session.username, JSON.stringify({ mezo: "megjegyzes" }),
  ]);
}

/** Fuvarlevél oldal megjelenítési forgatása; a tárolt képfájl változatlan marad. */
export async function forgatFuvarlevelOldalt(dokId: string, irany: 90 | -90): Promise<void> {
  await requireAnyEditPermission(["fuvarozas", "elszamolas"]);
  if (!/^\d+$/.test(dokId) || (irany !== 90 && irany !== -90)) throw new Error("Érvénytelen forgatási kérés.");
  const session = await requireSession();
  const [dok] = await query<{ fuvar_id: string }>(
    `select fuvar_id::text from fuvar_dokumentumok where id = $1 and tipus = 'fuvarlevel'`, [dokId]
  );
  if (!dok) throw new Error("Nincs ilyen fuvarlevél-oldal.");
  await withTransaction(async (tx) => {
    await tx(`update fuvar_dokumentumok set forgatas = ((forgatas + $2 + 360) % 360)::smallint where id = $1`, [dokId, irany]);
    // Az esemény-típus zárt lista (001-es séma): a forgatás „modositva”-ként naplózódik.
    await tx(`insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, forras, ki, reszletek) values ($1, 'modositva', 'ember', $2, $3)`,
      [dok.fuvar_id, session.name ?? session.username, JSON.stringify({ mezo: "fuvarlevel_forgatas", dok_id: dokId, irany })]);
  });
}

/**
 * Fuvarlevél-oldal újra-feldolgozása az eltárolt eredeti fotóból (2026-10-07,
 * Micó #300: a forgatott telefonfotók csíkosan, dupla képpel kerültek be —
 * a szkennelés javítása után a már feltöltött oldalak így hozhatók helyre).
 * A forgatás nullázódik, mert az új oldal már helyes állásban készül.
 */
export async function ujraszkenneldFuvarlevelOldalt(dokId: string): Promise<{ ok: true } | { ok: false; hiba: string }> {
  await requireAnyEditPermission(["fuvarozas", "elszamolas"]);
  if (!/^\d+$/.test(dokId)) return { ok: false, hiba: "Érvénytelen oldal." };
  const session = await requireSession();
  const [dok] = await query<{ fuvar_id: string; eredeti: Buffer | null }>(
    `select fuvar_id::text, eredeti from fuvar_dokumentumok where id = $1 and tipus = 'fuvarlevel'`, [dokId]
  );
  if (!dok) return { ok: false, hiba: "Nincs ilyen fuvarlevél-oldal." };
  if (!dok.eredeti) return { ok: false, hiba: "Ehhez az oldalhoz nincs eltárolt eredeti fotó (2026-10-06 előtti feltöltés) — a sofőrnek újra kell fotóznia." };
  const szken = await szkennelj(dok.eredeti);
  await withTransaction(async (tx) => {
    await tx(`update fuvar_dokumentumok set tartalom = $2, mime_type = $3, meret_byte = $4, forgatas = 0 where id = $1`,
      [dokId, szken.tartalom, szken.mimeType, szken.tartalom.length]);
    await tx(`insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, forras, ki, reszletek) values ($1, 'modositva', 'ember', $2, $3)`,
      [dok.fuvar_id, session.name ?? session.username, JSON.stringify({ mezo: "fuvarlevel_ujraszkenneles", dok_id: dokId, kivagva: szken.kivagva })]);
  });
  return { ok: true };
}

export async function setFuvarJarmu(id: string, jarmuKod: string | null): Promise<{ ok: true; cimke: string | null } | { ok: false; hiba: string }> {
  await requireAnyEditPermission(["fuvarozas"]);
  const session = await requireSession();
  const jarmu = jarmuKod?.trim() ? findJarmuByPlate(jarmuKod.trim(), await getJarmuvek()) : null;
  if (jarmuKod?.trim() && !jarmu) return { ok: false, hiba: "Ismeretlen kocsi." };
  const [sor] = await query<{ elokeszites: boolean; jarmu: string | null }>(
    `select elokeszites, jarmu from fuvar_megbizasok where id = $1 and torolt_at is null`,
    [id]
  );
  if (!sor) return { ok: false, hiba: "Nincs ilyen fuvar." };
  if (sor.elokeszites) return { ok: false, hiba: "Ez a fuvar előkészítésben van — ott az űrlapon állítsd a kocsit, aztán „Kocsira adom”." };
  const cimke = jarmu ? jarmuLabel(jarmu) : null;
  // A kocsi azonosítóját rögtön beírjuk (2026-10-14): eddig null lett, és a
  // háttér-szinkronra várt — addig a Tervezés hete nem tudta, melyik kocsi.
  await query(
    `update fuvar_megbizasok set jarmu = $2, jarmu_id = (select id from fuvar_jarmuvek where kod = $3) where id = $1`,
    [id, cimke, jarmu?.kod ?? null]
  );
  await frissitsdFuvarozas2Modellt(id);
  await query(
    `insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, forras, ki, reszletek) values ($1, 'hozzarendeles', 'ember', $2, $3)`,
    [id, session.name ?? session.username, JSON.stringify({ kocsi: cimke, elozo: sor.jarmu })]
  );
  // Mező-szintű napló (fuvar_valtozas) — a hiánya nem buktathatja a hozzárendelést.
  await irValtozasokat(query, "fuvar_megbizasok", id, naplozandoValtozasok({ jarmu: sor.jarmu }, { jarmu: cimke }), session.name ?? session.username)
    .catch((err) => console.error("[fuvar_valtozas] nem íródott:", err));
  // A kocsi menete azonnal (a jóváhagyott menetbe is bekerül a fuvar a helyére) — nem az óránkénti körben.
  if (cimke) after(() => frissitMegbizasMenetet(id, session.name ?? session.username));
  return { ok: true, cimke };
}

/**
 * A „Kocsi” (üresnél a „Sofőr”) szövegből a saját jármű fuvar_jarmuvek.id-ja —
 * ugyanaz a feloldási lánc, mint a háttér-szinkronban (resolveJarmu, majd
 * findJarmuInSzoveg; lib/fuvarozas2/modell-szinkron.ts), a kód alapján.
 */
async function feloldJarmuId(szoveg: string): Promise<number | null> {
  if (!szoveg.trim()) return null;
  const lista = await getJarmuvek();
  const jarmu = resolveJarmu(szoveg, lista) ?? findJarmuInSzoveg(szoveg, lista);
  if (!jarmu?.kod) return null;
  const [j] = await query<{ id: string }>(`select id::text from fuvar_jarmuvek where kod = $1`, [jarmu.kod]);
  return j ? Number(j.id) : null;
}

export async function modositBerFuvart(
  id: string,
  a: BerFuvarAdat
): Promise<{ ok: true; figyelmeztetes?: string } | { ok: false; hiba: string }> {
  await requireEditPermission("fuvarozas");
  const session = await requireSession();
  const hiba = berFuvarHiba(a);
  if (hiba) return { ok: false, hiba };
  const megrendelo = await kanonikusMegrendeloNev(a.megrendelo);
  // 2026-10-16 (ecofleet-telemetria-terv 4.): a jarmu_id-t nem nullázzuk a
  // háttér-szinkronra bízva, hanem a kocsi-szövegből azonnal feloldjuk.
  const ujKocsiSzoveg = a.jarmu.trim() || a.sofor.trim();
  const feloldott = await feloldJarmuId(ujKocsiSzoveg);
  let valtozott: string[] = [];
  let figyelmeztetes: string | null = null;
  const eredmeny = await ujKodTranzakcio(async (tx) => {
    const [regi] = await tx<BerFuvarAdat & { allapot: string; jarmuId: string | null }>(
      BER_SQL.replace("select ", "select m.allapot, m.jarmu_id::text as \"jarmuId\", ") + " for update of m",
      [id]
    );
    if (!regi) return { hiba: "Nincs ilyen bérfuvar." };
    valtozott = valtozottMezok(regi, a);
    if (valtozott.length === 0) return { nincsValtozas: true };
    const dontes = ujJarmuId(
      regi.jarmuId === null ? null : Number(regi.jarmuId),
      regi.jarmu.trim() || regi.sofor.trim(),
      ujKocsiSzoveg,
      feloldott
    );
    figyelmeztetes = dontes.figyelmeztetes;
    await tx(
      `update fuvar_megbizasok set
         datum = $2, lerakas_datum = $3, idopont = $4, felrako = $5, lerako = $6, megrendelo = $7,
         pozicioszam = $8, pozicioszam_nincs = $9, aru = $10, mennyiseg = $11, suly = $12,
         jarmu = $13, sofor = $14, fuvardij = $15, fuvardij_penznem = $16, koltseg = $17,
         megjegyzes = $18, postazasi_cim = $19,
         -- mint az approveFuvar: más megrendelőnél/kocsinál a Fuvarozás 2 kulcsát a szinkron újraépíti
         partner_id = case when megrendelo is distinct from $7 then null else partner_id end,
         jarmu_id = $20
       where id = $1`,
      [
        id, a.datum, a.lerakasDatum || null, a.idopont.trim() || null, a.felrako.trim(), a.lerako.trim(), megrendelo,
        a.pozicioszamNincs ? null : a.pozicioszam.trim() || null, a.pozicioszamNincs, a.aru.trim() || null, a.mennyiseg.trim() || null, a.suly.trim() || null,
        a.jarmu.trim() || null, a.sofor.trim() || null, egesz(a.fuvardij), a.fuvardijPenznem === "EUR" ? "EUR" : "Ft", egesz(a.koltseg),
        a.megjegyzes.trim() || null, a.postazasiCim.trim() || null, dontes.jarmuId,
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
    // Mező-szintű napló (fuvar_valtozas): kocsi, napok, felrakó/lerakó, fuvardíj — csak a ténylegesen változottak.
    const csak = (o: Record<string, unknown>) => Object.fromEntries(valtozott.map((k) => [k, o[k]]));
    await irValtozasokat(
      tx, "fuvar_megbizasok", id,
      naplozandoValtozasok(csak(regi), csak({ ...a, fuvardij: egesz(a.fuvardij) ?? "" })),
      session.name ?? session.username
    );
    return { nincsValtozas: false };
  });
  if ("hiba" in eredmeny && eredmeny.hiba) return { ok: false, hiba: eredmeny.hiba };
  if (eredmeny.nincsValtozas) return { ok: true };
  await frissitsdFuvarozas2Modellt(id);
  return figyelmeztetes ? { ok: true, figyelmeztetes } : { ok: true };
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
  await query(`update fuvar_megbizasok set ${torlesSet("$2")} where id = $1`, [id, ki]);
  // A törölt fuvarhoz párosított szállítólevél újra szabad: a 15 percenkénti
  // párosítás (lib/fuvarozas2/szallitolevel.ts) a valódi fuvarra teheti
  // (#274 duplikátum, 2026-10-06: az S-WLLWR-2026-165 a törölt soron ragadt
  // volna, a #295 papír nélkül maradt volna).
  await query(
    `update szallitolevel_import set megbizas_id = null, parositas_allapot = 'nyitott'
      where megbizas_id = $1 and parositas_allapot = 'parositva'`,
    [id]
  );
  await query(`update fuvar_megbizasok set kulso_azonosito = null where id = $1 and kulso_azonosito like 'S-%'`, [id]);
  await query(`insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, forras, ki, reszletek) values ($1, 'torolve', 'ember', $2, $3)`, [
    id, ki, JSON.stringify({ honnan: "munkaasztal" }),
  ]);
  return { ok: true };
}

/**
 * Törölt fuvar visszaállítása (2026-10-06: a #274 duplikátum helyett
 * tévedésből a valódi #295 lett törölve, és nem volt visszaút). A régi
 * `statusz` az új állapotból jön vissza — a 001-es trigger ettől üríti a
 * `torolt_at`-ot; az `allapot`-hoz nem nyúlunk (a törlés sem írta).
 */
export async function visszaallitTorolt(id: string): Promise<{ ok: true } | { ok: false; hiba: string }> {
  await requireAnyEditPermission(["fuvarozas"]);
  const session = await requireSession();
  const ki = session.name ?? session.username;
  const sorok = await query<{ id: string }>(
    `update fuvar_megbizasok
        set statusz = case allapot
              when 'lezart' then 'lezarva'
              when 'szamlazva' then 'szamlazva' when 'email_elment' then 'szamlazva' when 'postazva' then 'szamlazva'
              when 'folyamatban' then 'uton' when 'tervezett' then 'tervezett'
              else 'uj' end,
            torolt_by = null
      where id = $1 and torolt_at is not null
      returning id::text`,
    [id]
  );
  if (sorok.length === 0) return { ok: false, hiba: "Ez a fuvar nincs törölve." };
  // Újraolvasásra felszabadított sor (2026-10-14, #312): a Drive-irat
  // kapcsolatát is visszaadjuk, különben a következő Drive-kör új, üres
  // sorként húzná be ugyanazt az iratot. Ha közben már be is húzta (élő sor
  // fogja az iratot), a kapcsolatot nem vesszük el tőle.
  const JEL = "Újraolvasásra felszabadítva, eredeti dokumentum: ";
  const [m] = await query<{ megjegyzes: string | null }>(`select megjegyzes from fuvar_megbizasok where id = $1`, [id]);
  const url = m?.megjegyzes?.split(JEL)[1]?.split(" | ")[0]?.trim() ?? null;
  let driveVissza = false;
  if (url && url !== "-") {
    const fileId = url.match(/\/file\/d\/([^/]+)\//)?.[1] ?? null;
    const [foglalt] = await query<{ id: string }>(
      `select id::text from fuvar_megbizasok where torolt_at is null and id <> $1 and (dokumentum_url = $2 or ($3::text is not null and drive_file_id = $3))`,
      [id, url, fileId]
    );
    if (!foglalt) {
      await query(
        `update fuvar_megbizasok
            set dokumentum_url = $2, drive_file_id = coalesce(drive_file_id, $3),
                megjegyzes = nullif(trim(both ' |' from replace(megjegyzes, $4, '')), '')
          where id = $1`,
        [id, url, fileId, `${JEL}${url}`]
      );
      if (fileId) await query(`update fuvar_import_naplo set fuvar_id = $2 where drive_file_id = $1 and fuvar_id is null`, [fileId, id]);
      driveVissza = true;
    }
  }
  await query(`insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, forras, ki, reszletek) values ($1, 'visszaallitva_torlesbol', 'ember', $2, $3)`, [id, ki, JSON.stringify({ drive_vissza: driveVissza })]);
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

export async function felszabaditFuvarDokumentumot(id: string): Promise<{ ok: true } | { ok: false; hiba: string }> {
  await requireEditPermission("fuvarozas");
  const [sor] = await query<{ drive_file_id: string | null; dokumentum_url: string | null; allapot: string | null; szamla_szam: string | null; elindult: boolean }>(
    `select drive_file_id, dokumentum_url, allapot, szamla_szam,
            exists (select 1 from fuvar_megallok g where g.megbizas_id = f.id
                     and (g.gps_erkezes is not null or g.sofor_megerkezett_at is not null or g.sofor_kesz_at is not null)) as elindult
       from fuvar_megbizasok f where id = $1 and torolt_at is null`,
    [id]
  );
  if (!sor) return { ok: false, hiba: "Nincs ilyen fuvar." };
  // 2026-10-14 (#312 Gászler): az újraolvasás TÖRLI a sort — egy elindult,
  // teljesített vagy számlázott fuvarnál ezzel a sofőr lezárásai, a fotók
  // kapcsolata és a számlaszám kerülne egy új, üres sor mögé. Ott nem engedjük.
  if (sor.szamla_szam) return { ok: false, hiba: `Számlázott fuvar (${sor.szamla_szam}) — nem olvasható újra. Javítsd a mezőket a „Szerkesztés” gombbal.` };
  if (sor.elindult || (sor.allapot && !["ellenorzesre_var", "tervezett"].includes(sor.allapot))) {
    return { ok: false, hiba: "A fuvar már elindult — nem olvasható újra (a sofőr lezárásai elvesznének). Javítsd a mezőket a „Szerkesztés” gombbal." };
  }
  const fileId = sor.drive_file_id ?? sor.dokumentum_url?.match(/\/file\/d\/([^/]+)\//)?.[1] ?? null;
  await query(
    `update fuvar_megbizasok
     set ${torlesSet()},
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
  return { ok: true };
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

/**
 * Ugyanannak látszó, nem törölt saját fuvarok (ugyanaz a kocsi vagy kocsi
 * nélkül, ±1 nap, ugyanaz a felrakó- és lerakó-város) — a szabály:
 * lib/fuvarozas2/sajat-duplikatum.ts. Itt csak a ±1 napos jelöltek jönnek.
 */
async function sajatDuplikatumok(id: string | null, a: SajatFuvarAdat): Promise<DuplikatumJelolt[]> {
  const sorok = await query<{ id: string; datum: string | null; jarmu: string | null; felrako: string | null; lerako: string | null; partner: string | null; allapot: string | null; elokeszites: boolean }>(
    `select m.id::text, to_char(m.datum, 'YYYY-MM-DD') as datum,
       coalesce(nullif(m.jarmu, ''), nullif(m.elokeszites_jarmu, ''), j.kod) as jarmu,
       m.felrako, m.lerako, coalesce(p.nev, m.megrendelo) as partner, m.allapot, coalesce(m.elokeszites, false) as elokeszites
     from fuvar_megbizasok m
     left join fuvar_jarmuvek j on j.id = m.jarmu_id
     left join fuvar_partnerek p on p.id = m.partner_id
     where m.jelleg = 'sajat' and m.torolt_at is null
       and m.datum between $1::date - 1 and $1::date + 1
       and ($2::bigint is null or m.id <> $2::bigint)`,
    [a.datum, id]
  );
  return keresDuplikatumot(
    { datum: a.datum, jarmuKod: a.jarmuKod, honnan: a.honnan, hova: a.hova },
    sorok.map((s) => ({
      id: s.id, datum: s.datum, jarmu: s.jarmu, felrako: s.felrako, lerako: s.lerako, partner: s.partner,
      allapot: s.elokeszites ? "Előkészítés" : (s.allapot && ALLAPOT_CIMKE[s.allapot as Allapot]) || s.allapot || "—",
    }))
  );
}

export async function mentSajatFuvart(id: string | null, nyers: SajatFuvarAdat, opciok: { duplikatumOk?: boolean } = {}): Promise<Eredmeny> {
  await requireEditPermission("fuvarozas");
  const a = tisztit(nyers);
  if (!ISO_NAP.test(a.datum)) return { ok: false, hiba: "A dátum kötelező." };
  if (a.datum < budapestNapISO()) return { ok: false, hiba: MULT_NAP_HIBA };
  if (a.jarmuKod && !findJarmuByPlate(a.jarmuKod, await getJarmuvek())) return { ok: false, hiba: "Ismeretlen kocsi." };
  if (opciok.duplikatumOk !== true) {
    const dupl = await sajatDuplikatumok(id, a);
    if (dupl.length > 0) {
      return { ok: false, hiba: `Már van ilyen fuvar: ${dupl.map(duplikatumSor).join("; ")}`, duplikatumok: dupl };
    }
  }
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
    `update fuvar_megbizasok set datum = $2, felrako = $3, lerako = $4, megrendelo = $5, megjegyzes = $6, elokeszites_jarmu = $7,
       idopont_nyitott = case when $7::text is not null then false else idopont_nyitott end,
       kitol = $9,
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

// Elvinni való saját fuvar műveletek (2026-10-07, Budaházi Zoltán).
export type ElvinniAdat = {
  honnan: string;
  hova: string;
  legkorabban?: string | null;
  kitol?: string | null;
  kinek?: string | null;
  megjegyzes?: string | null;
};

function tisztaElvinni(adat: ElvinniAdat) {
  return {
    honnan: adat.honnan.trim(),
    hova: adat.hova.trim(),
    legkorabban: adat.legkorabban?.trim() || null,
    kitol: adat.kitol?.trim() || null,
    kinek: adat.kinek?.trim() || null,
    megjegyzes: adat.megjegyzes?.trim() || null,
  };
}

export async function rogzitElvinnivalot(nyers: ElvinniAdat): Promise<Eredmeny> {
  await requireEditPermission("fuvarozas");
  const adat = tisztaElvinni(nyers);
  if (!adat.honnan || !adat.hova) {
    return { ok: false, hiba: "A honnan és a hová mező kötelező." };
  }
  if (adat.legkorabban && !ISO_NAP.test(adat.legkorabban)) {
    return { ok: false, hiba: "Érvénytelen legkorábbi dátum." };
  }

  const session = await requireSession();
  const id = await ujKodTranzakcio(async (tx) => {
    const [maiNap] = await tx<{ ma: string }>(
      `select (now() at time zone 'Europe/Budapest')::date::text as ma`
    );
    const ujId = await letrehozTx(tx, {
      tipus: "ber",
      datum: adat.legkorabban ?? maiNap.ma,
      felrako: adat.honnan,
      lerako: adat.hova,
      megrendelo: adat.kinek ?? undefined,
      megjegyzes: adat.megjegyzes ?? undefined,
      forras: "kezi",
      ellenorzott: true,
      createdBy: session.name ?? session.username,
      elokeszites: true,
      elokeszitesJarmu: null,
      allapot: "tervezett",
      kitol: adat.kitol,
      statusz: "uj",
      letrehozasUt: "sajat-elokeszites",
      idopontNyitott: true,
      legkorabban: adat.legkorabban,
      kanonikusNev: false,
    });

    if (ujId) {
      await irEsemenyt(tx, {
        megbizasId: ujId,
        esemeny: "letrehozva",
        forras: "ember",
        ki: session.name ?? session.username,
        reszletek: { elvinni_valo: true },
      });
    }
    return ujId;
  });

  if (!id) return { ok: false, hiba: "Nem jött létre a fuvar." };
  revalidatePath("/fuvarozas2/megbizasok");
  return { ok: true, id };
}

export async function modositElvinnivalot(id: string, nyers: ElvinniAdat): Promise<Eredmeny> {
  await requireEditPermission("fuvarozas");
  const adat = tisztaElvinni(nyers);
  if (!adat.honnan || !adat.hova) {
    return { ok: false, hiba: "A honnan és a hová mező kötelező." };
  }
  if (adat.legkorabban && !ISO_NAP.test(adat.legkorabban)) {
    return { ok: false, hiba: "Érvénytelen legkorábbi dátum." };
  }

  const session = await requireSession();
  const sikeres = await withTransaction(async (tx) => {
    const sorok = await tx<{ id: string }>(
      `update fuvar_megbizasok
       set felrako = $2, lerako = $3, legkorabban = $4,
           datum = coalesce($4::date, (now() at time zone 'Europe/Budapest')::date),
           kitol = $5, megrendelo = $6, partner_id = null, megjegyzes = $7
       where id = $1 and jelleg = 'sajat' and elokeszites
         and idopont_nyitott and torolt_at is null
       returning id::text`,
      [id, adat.honnan, adat.hova, adat.legkorabban, adat.kitol, adat.kinek, adat.megjegyzes]
    );
    if (sorok.length === 0) return false;

    await irEsemenyt(tx, {
      megbizasId: id,
      esemeny: "modositva",
      forras: "ember",
      ki: session.name ?? session.username,
      reszletek: { elvinni_valo: true },
    });
    return true;
  });

  if (!sikeres) {
    return { ok: false, hiba: "Ez a fuvar már nincs a Saját fuvar oszlopban (időpont nélkül)." };
  }
  await frissitsdFuvarozas2Modellt(id);
  revalidatePath("/fuvarozas2/megbizasok");
  return { ok: true, id };
}

export async function utemezElvinnivalot(
  id: string,
  adat: { jarmuKod: string; nap: string }
): Promise<Eredmeny> {
  await requireEditPermission("fuvarozas");
  if (!ISO_NAP.test(adat.nap) || !findJarmuByPlate(adat.jarmuKod, await getJarmuvek())) {
    return { ok: false, hiba: "Érvénytelen dátum vagy kocsi." };
  }

  const [aktivJarmu] = await query<{ kod: string }>(
    `select kod from fuvar_jarmuvek where kod = $1 and aktiv`,
    [adat.jarmuKod]
  );
  if (!aktivJarmu) return { ok: false, hiba: "Ez a kocsi már nem aktív." };

  const session = await requireSession();
  const eredmeny = await withTransaction(async (tx) => {
    const [sor] = await tx<{ legkorabban: string | null }>(
      `select to_char(legkorabban, 'YYYY-MM-DD') as legkorabban
       from fuvar_megbizasok
       where id = $1 and jelleg = 'sajat' and elokeszites
         and idopont_nyitott and torolt_at is null
       for update`,
      [id]
    );
    if (!sor) return { hiba: "Ez a fuvar már nincs a Saját fuvar oszlopban (időpont nélkül)." };
    if (!utemezhetoNap(adat.nap, sor.legkorabban, budapestNapISO())) {
      return { hiba: sor.legkorabban && adat.nap < sor.legkorabban ? `A legkorábbi nap: ${sor.legkorabban}.` : MULT_NAP_HIBA };
    }

    await tx(
      `update fuvar_megbizasok
       set datum = $2, elokeszites_jarmu = $3, idopont_nyitott = false
       where id = $1`,
      [id, adat.nap, adat.jarmuKod]
    );
    await irEsemenyt(tx, {
      megbizasId: id,
      esemeny: "modositva",
      forras: "ember",
      ki: session.name ?? session.username,
      reszletek: { mezo: "utemezes", jarmu: adat.jarmuKod, nap: adat.nap },
    });
    return { hiba: null };
  });

  if (eredmeny.hiba) return { ok: false, hiba: eredmeny.hiba };
  revalidatePath("/fuvarozas2/megbizasok");
  return { ok: true, id };
}

export async function visszaElvinnivalokba(id: string): Promise<Eredmeny> {
  await requireEditPermission("fuvarozas");
  const session = await requireSession();
  const sikeres = await withTransaction(async (tx) => {
    const sorok = await tx<{ id: string }>(
      `update fuvar_megbizasok
       set idopont_nyitott = true, elokeszites_jarmu = null,
           datum = coalesce(legkorabban, (now() at time zone 'Europe/Budapest')::date)
       where id = $1 and jelleg = 'sajat' and elokeszites
         and not idopont_nyitott and torolt_at is null
       returning id::text`,
      [id]
    );
    if (sorok.length === 0) return false;

    await irEsemenyt(tx, {
      megbizasId: id,
      esemeny: "modositva",
      forras: "ember",
      ki: session.name ?? session.username,
      reszletek: { mezo: "elvinni_valo", vissza: true },
    });
    return true;
  });

  if (!sikeres) return { ok: false, hiba: "Ez a fuvar nem ütemezett előkészítés." };
  revalidatePath("/fuvarozas2/megbizasok");
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
  if (sor.datum! < budapestNapISO()) return { ok: false, hiba: MULT_NAP_HIBA };
  const jarmu = findJarmuByPlate(sor.elokeszites_jarmu!, await getJarmuvek());
  if (!jarmu) return { ok: false, hiba: "Ismeretlen kocsi." };
  await query(
    `update fuvar_megbizasok set jarmu = $2, jarmu_id = (select id from fuvar_jarmuvek where kod = $3), elokeszites = false, idopont_nyitott = false, kocsira_adva_at = now(), ellenorzott = true
     where id = $1`,
    [id, jarmuLabel(jarmu), jarmu.kod]
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
       (select count(*) from fuvar_megallok g where g.megbizas_id = $1 and
         (g.sofor_kesz_at is not null or g.sofor_megerkezett_at is not null or g.gps_erkezes is not null))
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
    `update fuvar_megbizasok set ${torlesSet("$2")}
     where id = $1 and elokeszites and torolt_at is null returning id::text`,
    [id, session.name ?? session.username]
  );
  if (!sor) return { ok: false, hiba: "Csak előkészítés alatti fuvar törölhető itt." };
  await naplo(id, "torolve", { elokeszites: true });
  return { ok: true, id };
}

// Egy lépésben kocsira (2026-10-07, Budaházi Zoltán: „nem tudom kocsihoz
// adni, egyszerűsítsd”): az időpont nélküli saját fuvar kártyáján kocsi +
// nap, és megy a sofőrnek — az ütemezés és a „Kocsira adom” együtt.
export async function kocsihozAdom(id: string, a: { jarmuKod: string; nap: string }): Promise<Eredmeny> {
  await requireEditPermission("fuvarozas");
  const utemezve = await utemezElvinnivalot(id, a);
  if (!utemezve.ok) return utemezve;
  const kocsin = await kocsiraAdom(id);
  revalidatePath("/fuvarozas2/megbizasok");
  if (!kocsin.ok) {
    return { ok: false, hiba: `Ütemezve, de nem került kocsira: ${kocsin.hiba} (a Beérkezett / Előkészítés oszlopban folytatható)` };
  }
  return kocsin;
}
