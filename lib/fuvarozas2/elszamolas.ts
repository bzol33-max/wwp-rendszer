"use server";

// Fuvarozás 2 — Elszámolás a tervvászon (D5) szerint: a bér fuvar útja a
// teljesítéstől a lezárásig, szakaszonként, a soron következő gombbal.
//
//   Számlázni (teljesítve, fotóval vagy anélkül) → Postára (számlázva) → Kész
//
// Két lépés, két gomb (Budaházi Zoltán, 2026-09-25): számlaszám, majd
// „Postázva ✓”. Külön „E-mail elment” lépés nincs — a számlát a Számlázz.hu
// küldi ki. A kísérő e-mail PISZKOZATA (címzett, tárgy, törzs) a posta-
// kártyán kibontható marad, ha egy partnernek mégis kell.

import { query } from "@/lib/db";
import { requireAnyViewPermission } from "@/lib/auth/require-permission";
import { getMegbizasok, type MegbizasSor } from "@/lib/fuvarozas2/megbizasok";
import { getSzamlaLista } from "@/lib/szamlak/actions";
import { szamlaHatralek } from "@/lib/szamlak/szamla-constants";
import { varosNev } from "@/lib/fuvarozas/varos";
import { papirHatraNap } from "@/lib/fuvarozas2/megbizas-szuro";
import { getParositatlanFuvarszamlak } from "@/lib/fuvarozas/megbizasok";

export type ElszamolasSor = MegbizasSor & {
  /** Hány nap van a partner papír-határidejéből (negatív: lejárt). */
  papirHatra: number | null;
  szamlazasiEmail: string | null;
  szamlanKertSzam: string | null;
};

export type Piszkozat = { cimzett: string | null; targy: string; szoveg: string; csatolmanyok: string[] };

export type ElszamolasVaszon = {
  fejlec: { lejartDb: number; lejartFt: number };
  szamlazando: ElszamolasSor[];
  postazando: (ElszamolasSor & { piszkozat: Piszkozat })[];
  /** Fuvarszámlák, amiket a rendszer egyik fuvarhoz sem tudott párosítani (60 nap). */
  parositatlan: { szamlaszam: string; vevo_nev: string; rendelesszam: string | null; netto: number | null; kiallitas_nap: string }[];
  kintlevoseg: { szamlaszam: string; vevo: string; esedekes: string | null; brutto: number; penznem: string; lejart: boolean }[];
  osszegek: { szamlazhatoFt: number; postazandoDb: number };
};

export async function getElszamolasVaszon(): Promise<ElszamolasVaszon> {
  await requireAnyViewPermission(["fuvarozas", "elszamolas"]);
  const [{ ma }] = await query<{ ma: string }>(`select ((now() at time zone 'Europe/Budapest')::date)::text as ma`);

  const sorok = await getMegbizasok({
    jelleg: "ber",
    allapotok: ["teljesitve", "szamlazhato", "szamlazva", "email_elment"],
    limit: 300,
  });

  const partnerek = await query<{ id: string; szamlazasi_email: string | null; szamlan_kert_szam: string | null; papir_nap: number | null }>(
    `select id::text, szamlazasi_email, szamlan_kert_szam, papir_bekuldesi_hatarido_nap as papir_nap from fuvar_partnerek`
  );
  const pMap = new Map(partnerek.map((p) => [p.id, p]));

  const bovit = (s: MegbizasSor): ElszamolasSor => {
    const p = s.partner_id ? pMap.get(s.partner_id) : undefined;
    return {
      ...s,
      papirHatra: papirHatraNap(s.lerakas_nap, p?.papir_nap ?? s.papir_hatarido_nap),
      szamlazasiEmail: p?.szamlazasi_email ?? null,
      szamlanKertSzam: p?.szamlan_kert_szam ?? null,
    };
  };

  const bovitett = sorok.map(bovit);
  const szamlazando = bovitett.filter((s) => s.allapot === "teljesitve" || s.allapot === "szamlazhato");
  const postazando = bovitett
    .filter((s) => s.allapot === "szamlazva" || s.allapot === "email_elment")
    .map((s) => ({ ...s, piszkozat: piszkozatSzoveg(s) }));

  let kintlevoseg: ElszamolasVaszon["kintlevoseg"] = [];
  try {
    const nyitott = await getSzamlaLista({ csakNyitott: true });
    kintlevoseg = nyitott
      .map((sz) => {
        const m = /^(\d{4})\.(\d{2})\.(\d{2})/.exec(sz.fizetesi_hatarido ?? "");
        const iso = m ? `${m[1]}-${m[2]}-${m[3]}` : null;
        return { szamlaszam: sz.szamlaszam, vevo: sz.vevo_nev, esedekes: sz.fizetesi_hatarido, brutto: szamlaHatralek(sz), penznem: sz.penznem, lejart: iso != null && iso < ma };
      })
      .sort((a, b) => Number(b.lejart) - Number(a.lejart));
  } catch {
    kintlevoseg = [];
  }

  const parositatlan = await getParositatlanFuvarszamlak(60).catch(() => []);

  const lejartak = kintlevoseg.filter((k) => k.lejart);
  return {
    fejlec: {
      lejartDb: lejartak.length,
      lejartFt: lejartak.filter((k) => k.penznem === "Ft").reduce((a, k) => a + k.brutto, 0),
    },
    szamlazando, postazando, parositatlan, kintlevoseg: kintlevoseg.slice(0, 12),
    osszegek: {
      szamlazhatoFt: szamlazando.filter((s) => s.fuvardij_penznem === "Ft").reduce((a, s) => a + (s.fuvardij ?? 0), 0),
      postazandoDb: postazando.length,
    },
  };
}

/** A számla e-mail piszkozata (a terv 9. fejezetének sablonja). */
function piszkozatSzoveg(s: ElszamolasSor): Piszkozat {
  const hiv = s.hivatkozas ?? "(hivatkozási szám nélkül)";
  const honnan = varosNev(s.felrako ?? "") ?? s.felrako ?? "—";
  const hova = varosNev(s.lerako ?? "") ?? s.lerako ?? "—";
  const nap = s.lerakas_nap ?? "";
  const kertSzam = s.szamlanKertSzam && s.szamlanKertSzam !== "hivatkozas" ? `${s.szamlanKertSzam} ${hiv}` : hiv;
  return {
    cimzett: s.szamlazasiEmail,
    targy: `Számla és fuvarokmányok — ${kertSzam} · ${honnan} → ${hova} · ${nap}`,
    szoveg:
      `Tisztelt Partnerünk!\n\n` +
      `A ${hiv} számú megbízáshoz (${honnan} → ${hova}, ${nap}${s.jarmu_kod ? `, ${s.jarmu_kod}` : ""}) csatoltan küldöm ` +
      `a ${s.szamla_szam ?? "(számlaszám)"} számú számlát és a fuvarokmányokat. ` +
      `Az eredeti okmányokat a számlával együtt postázzuk.\n\n` +
      `Üdvözlettel:\nBudaházi Zoltán\nWell-Worn Pallet Kft.`,
    csatolmanyok: [
      s.szamla_szam ? `${s.szamla_szam}.pdf (számla)` : "számla PDF",
      s.foto_van ? `Fuvarokmanyok_${(s.hivatkozas ?? s.id).replace(/[^\w-]/g, "-")}.pdf` : "fuvarlevél-fotó — még nincs",
    ],
  };
}
