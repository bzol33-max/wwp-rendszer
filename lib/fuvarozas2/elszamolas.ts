"use server";

// Fuvarozás 2 — Elszámolás a tervvászon (D5) szerint: a bér fuvar útja a
// teljesítéstől a lezárásig, szakaszonként, a soron következő gombbal.
//
//   Fotóra vár → Számlázható → Számlázva (e-mail) → E-mail elment (posta) → Lezárt
//
// A számla e-mail PISZKOZATA itt készül el szövegként (címzett, tárgy,
// törzs) — a Gmail-vázlat automatikus létrehozása a Gmail-figyelő Apps
// Scripthez tartozik (S17), addig a szöveg kimásolható. Automatikus küldés
// nincs és nem is lesz: minden kimenő levél vázlat marad.

import { query } from "@/lib/db";
import { requireAnyViewPermission } from "@/lib/auth/require-permission";
import { getMegbizasok, type MegbizasSor } from "@/lib/fuvarozas2/megbizasok";
import { getSzamlaLista } from "@/lib/szamlak/actions";
import { varosNev } from "@/lib/fuvarozas/varos";
import { papirHatraNap } from "@/lib/fuvarozas2/megbizas-szuro";

export type ElszamolasSor = MegbizasSor & {
  /** Hány nap van a partner papír-határidejéből (negatív: lejárt). */
  papirHatra: number | null;
  szamlazasiEmail: string | null;
  szamlanKertSzam: string | null;
};

export type Piszkozat = { cimzett: string | null; targy: string; szoveg: string; csatolmanyok: string[] };

export type ElszamolasVaszon = {
  fejlec: { lejartDb: number; lejartFt: number; piszkozatDb: number };
  fotoraVar: ElszamolasSor[];
  szamlazhato: ElszamolasSor[];
  emailre: (ElszamolasSor & { piszkozat: Piszkozat })[];
  postazando: ElszamolasSor[];
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
  const fotoraVar = bovitett.filter((s) => s.allapot === "teljesitve");
  const szamlazhato = bovitett.filter((s) => s.allapot === "szamlazhato");
  const szamlazva = bovitett.filter((s) => s.allapot === "szamlazva");
  const postazando = bovitett.filter((s) => s.allapot === "email_elment");

  const emailre = szamlazva.map((s) => ({ ...s, piszkozat: piszkozatSzoveg(s) }));

  let kintlevoseg: ElszamolasVaszon["kintlevoseg"] = [];
  try {
    const nyitott = await getSzamlaLista({ csakNyitott: true });
    kintlevoseg = nyitott
      .map((sz) => {
        const m = /^(\d{4})\.(\d{2})\.(\d{2})/.exec(sz.fizetesi_hatarido ?? "");
        const iso = m ? `${m[1]}-${m[2]}-${m[3]}` : null;
        return { szamlaszam: sz.szamlaszam, vevo: sz.vevo_nev, esedekes: sz.fizetesi_hatarido, brutto: sz.brutto, penznem: sz.penznem, lejart: iso != null && iso < ma };
      })
      .sort((a, b) => Number(b.lejart) - Number(a.lejart));
  } catch {
    kintlevoseg = [];
  }

  const lejartak = kintlevoseg.filter((k) => k.lejart);
  return {
    fejlec: {
      lejartDb: lejartak.length,
      lejartFt: lejartak.filter((k) => k.penznem === "Ft").reduce((a, k) => a + k.brutto, 0),
      piszkozatDb: emailre.length,
    },
    fotoraVar, szamlazhato, emailre, postazando, kintlevoseg: kintlevoseg.slice(0, 12),
    osszegek: {
      szamlazhatoFt: szamlazhato.filter((s) => s.fuvardij_penznem === "Ft").reduce((a, s) => a + (s.fuvardij ?? 0), 0),
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
