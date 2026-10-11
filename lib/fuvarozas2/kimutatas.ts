"use server";

// Fuvarozás 2 — Kimutatás (terv 8. fejezet): mennyi km ment egy kocsival
// nap/hét/hó alatt, mennyi pénzt hozott, és mibe került.
//
// MIT MÉRÜNK ÉS MIT BECSLÜNK (5. fázis, 2026-10-10) — minden szám mellett
// felirat jelzi, tény-e vagy becslés; a szabályok részletesen a
// lib/fuvarozas2/koltseg-szamitas.ts fejlécében:
//   • km és liter: Ecofleet Útvonal-jelentés — TÉNY. A megbízásra a tény-
//     időablak (első megálló ténye → utolsó megálló ténye) km-e jut.
//   • bevétel: a bérmegbízás díja — TÉNY; az EUR a teljesítés napjának MNB-
//     árfolyamán (lib/fuvarozas/arfolyam.ts), a használt árfolyam kiírva.
//   • rakott/üres bontás: a fuvarláncból (ures-km.ts) — BECSLÉS.
//   • üzemanyag: GPS-liter × aznapi tankolás Ft/l (tankolas tábla) vagy
//     NAV − kedvezmény — TÉNY litereken; ahol nincs mért liter, BECSLÉS.
//   • útdíj: importált HU-GO tranzakciók (utdij_tranzakcio) — TÉNY; ahol
//     nincs, a tárolt kalkuláció — BECSLÉS.
//   • napi fix: napi_koltseg_ft × aktív nap — BECSLÉS (beállítás).
//   • Bérfuvar → EREDMÉNY; saját fuvar → BELSŐ KÖLTSÉG (külön oszlop). A
//     saját fuvar „elkerült költsége" (rakott km × km-díj) csak TÁJÉKOZTATÓ —
//     2026-10-10-ig hozzáadódott a kocsi eredményéhez, ez hibás volt
//     (Budaházi Zoltán): a kocsi eredménye ma bérfuvar-eredmény − nem
//     hozzárendelt költség.

import { requireAnyViewPermission } from "@/lib/auth/require-permission";
import { query } from "@/lib/db";
import { koltsegIdoszakra, type IdoszakMegbizas } from "@/lib/fuvarozas2/koltseg-adat";
import { fejlecKmSzamitas, type Forras, type Tetel } from "@/lib/fuvarozas2/koltseg-szamitas";
import type { ArfolyamInfo } from "@/lib/fuvarozas/arfolyam";

export type KimutatasIdoszak = "nap" | "het" | "ho";

export type KimutatasJarmu = {
  kod: string;
  cimke: string;
  sofor: string | null;
  vanGps: boolean;
  /** GPS — tény. */
  km: number;
  liter: number;
  /** Fuvarlánc — becslés. */
  berKm: number;
  sajatKm: number;
  uresKm: number;
  berDb: number;
  sajatDb: number;
  /** Bérfuvar-bevétel Ft-ban (az EUR átváltva). */
  bevetelFt: number;
  /** EUR-os díj, amihez nem volt árfolyam — átváltás nélkül. */
  atvaltatlanEur: number;
  uzemanyag: Tetel | null;
  utdij: Tetel | null;
  napiFix: Tetel;
  /** Kézzel rögzített egyéb költség (várakozási pótdíj, kiállási díj…). */
  keziEgyeb: Tetel | null;
  aktivNap: number;
  osszKoltsegFt: number;
  osszKoltsegForras: Forras;
  berEredmenyFt: number;
  /** Saját fuvarok belső költsége — külön oszlop, NEM része az eredménynek. */
  sajatBelsoKoltsegFt: number;
  /** Üres utak, állás: a megbízásokra nem osztott költség. */
  nemHozzarendeltFt: number;
  /** Bérfuvar-eredmény − nem hozzárendelt költség. */
  eredmenyFt: number;
  eredmenyFtKm: number | null;
  /** Tájékoztató: saját rakott km × km-díj — semmibe nem adódik hozzá. */
  elkerultKoltsegFt: number;
  ftKm: number | null;
};

export type KimutatasMegbizas = IdoszakMegbizas;

export type KimutatasNap = { nap: string; km: number; berKm: number; sajatKm: number; uresKm: number; bevetelFt: number };

export type KimutatasEredmeny = {
  idoszak: KimutatasIdoszak;
  kezdet: string;
  veg: string;
  jarmuvek: KimutatasJarmu[];
  megbizasok: KimutatasMegbizas[];
  napok: KimutatasNap[];
  ossz: {
    /** GPS-km (tény) — csak a mért kocsik. */
    km: number;
    /** A fejléc km-e: GPS-tény, ahol van; a GPS-tény nélküli kocsiknál a fuvarlánc (rakott + üres) becslése. */
    fejlecKm: { ertek: number; forras: Forras; tenyKm: number; becsultKm: number; becsultKocsi: number };
    berKm: number; sajatKm: number; uresKm: number; liter: number;
    bevetelFt: number; atvaltatlanEur: number;
    uzemanyagFt: number; uzemanyagForras: Forras;
    utdijFt: number; utdijForras: Forras;
    napiKoltsegFt: number; aktivNap: number;
    keziEgyebFt: number;
    osszKoltsegFt: number; osszKoltsegForras: Forras;
    berFtKm: number | null;
    berEredmenyFt: number; sajatBelsoKoltsegFt: number; nemHozzarendeltFt: number;
    eredmenyFt: number; elkerultKoltsegFt: number;
  };
  gazolajAr: number | null;
  gazolajCimke: string | null;
  gpsHiba: string | null;
  vanUtdijImport: boolean;
  tankolasDb: number;
  arfolyamok: ArfolyamInfo[];
  /** Átváltás nélkül kimaradt kézi költségsorok (lásd IdoszakKoltseg.atvaltatlanKezi). */
  atvaltatlanKezi: { db: number; eur: number; masPenznemDb: number };
  napiKoltsegBeallitas: number;
  sajatKmDijBeallitas: number;
  /** Hány megbízás esett az időszakra kocsi nélkül — ezek km-je sehol nem szerepel. */
  kocsiNelkul: number;
};

async function idoszakHatarok(idoszak: KimutatasIdoszak, nap?: string): Promise<{ kezdet: string; veg: string }> {
  const [r] = await query<{ kezdet: string; veg: string }>(
    `with n as (select coalesce($2::date, (now() at time zone 'Europe/Budapest')::date) as d)
     select case $1
              when 'nap' then (select d from n)
              when 'het' then (select date_trunc('week', d)::date from n)
              else (select date_trunc('month', d)::date from n)
            end::text as kezdet,
            case $1
              when 'nap' then (select d from n)
              when 'het' then (select (date_trunc('week', d) + interval '6 days')::date from n)
              else (select (date_trunc('month', d) + interval '1 month' - interval '1 day')::date from n)
            end::text as veg`,
    [idoszak, nap ?? null]
  );
  return r;
}

export async function getKimutatas(idoszak: KimutatasIdoszak = "het", nap?: string): Promise<KimutatasEredmeny> {
  await requireAnyViewPermission(["fuvarozas", "elszamolas"]);
  const { kezdet, veg } = await idoszakHatarok(idoszak, nap);
  const k = await koltsegIdoszakra(kezdet, veg);

  const napok = new Map<string, KimutatasNap>();
  const napSor = (n: string) => {
    const x = napok.get(n) ?? { nap: n, km: 0, berKm: 0, sajatKm: 0, uresKm: 0, bevetelFt: 0 };
    napok.set(n, x);
    return x;
  };
  const jarmuvek: KimutatasJarmu[] = k.jarmuvek.map((j) => {
    for (const [n, x] of j.napiKm) napSor(n).km += x.km;
    let berKm = 0, sajatKm = 0, uresKm = 0;
    for (const l of j.lanc) {
      const b = l.jelleg === "ber" ? l.rakott : 0;
      const s = l.jelleg === "sajat" ? l.rakott : 0;
      berKm += b; sajatKm += s; uresKm += l.ures;
      const n = napSor(l.nap);
      n.berKm += b; n.sajatKm += s; n.uresKm += l.ures;
    }
    for (const m of j.megbizasok) if (m.jelleg === "ber" && m.bevetelFt != null) napSor(m.nap).bevetelFt += m.bevetelFt;
    const e = j.eredmeny;
    return {
      kod: j.kod, cimke: j.cimke, sofor: j.sofor, vanGps: j.vanGps,
      km: j.km, liter: j.liter,
      berKm: Math.round(berKm), sajatKm: Math.round(sajatKm), uresKm: Math.round(uresKm),
      berDb: e.berDb, sajatDb: e.sajatDb,
      bevetelFt: e.berBevetelFt, atvaltatlanEur: e.atvaltatlanEur,
      uzemanyag: j.ossz.uzemanyag, utdij: j.ossz.utdij, napiFix: j.ossz.napiFix, keziEgyeb: j.ossz.keziEgyeb ?? null,
      aktivNap: j.aktivNap,
      osszKoltsegFt: e.osszKoltsegFt, osszKoltsegForras: e.osszKoltsegForras,
      berEredmenyFt: e.berEredmenyFt, sajatBelsoKoltsegFt: e.sajatBelsoKoltsegFt,
      nemHozzarendeltFt: e.nemHozzarendeltFt, eredmenyFt: e.eredmenyFt,
      eredmenyFtKm: j.km > 0 ? Math.round(e.eredmenyFt / j.km) : null,
      elkerultKoltsegFt: e.elkerultKoltsegFt,
      ftKm: berKm > 0 && e.berBevetelFt > 0 ? Math.round(e.berBevetelFt / berKm) : null,
    };
  });

  const sum = (f: (j: KimutatasJarmu) => number) => jarmuvek.reduce((a, j) => a + f(j), 0);
  const mindTeny = (f: (j: KimutatasJarmu) => Forras | undefined) => (jarmuvek.every((j) => f(j) === "teny") && jarmuvek.length > 0 ? "teny" : "becsles") as Forras;
  const berKmOssz = sum((j) => j.berKm);
  const bevetelFtOssz = sum((j) => j.bevetelFt);
  const fejlecKm = fejlecKmSzamitas(jarmuvek);
  return {
    idoszak, kezdet, veg,
    jarmuvek,
    megbizasok: k.jarmuvek.flatMap((j) => j.megbizasok),
    napok: [...napok.values()].sort((a, b) => a.nap.localeCompare(b.nap)),
    ossz: {
      km: sum((j) => j.km), fejlecKm, berKm: berKmOssz, sajatKm: sum((j) => j.sajatKm), uresKm: sum((j) => j.uresKm), liter: sum((j) => j.liter),
      bevetelFt: bevetelFtOssz, atvaltatlanEur: sum((j) => j.atvaltatlanEur),
      uzemanyagFt: sum((j) => j.uzemanyag?.ft ?? 0), uzemanyagForras: mindTeny((j) => j.uzemanyag?.forras),
      utdijFt: sum((j) => j.utdij?.ft ?? 0), utdijForras: mindTeny((j) => j.utdij?.forras),
      napiKoltsegFt: sum((j) => j.napiFix.ft), aktivNap: sum((j) => j.aktivNap),
      keziEgyebFt: sum((j) => j.keziEgyeb?.ft ?? 0),
      osszKoltsegFt: sum((j) => j.osszKoltsegFt), osszKoltsegForras: mindTeny((j) => j.osszKoltsegForras),
      berFtKm: berKmOssz > 0 && bevetelFtOssz > 0 ? Math.round(bevetelFtOssz / berKmOssz) : null,
      berEredmenyFt: sum((j) => j.berEredmenyFt), sajatBelsoKoltsegFt: sum((j) => j.sajatBelsoKoltsegFt),
      nemHozzarendeltFt: sum((j) => j.nemHozzarendeltFt), eredmenyFt: sum((j) => j.eredmenyFt),
      elkerultKoltsegFt: sum((j) => j.elkerultKoltsegFt),
    },
    gazolajAr: k.gazolajAr, gazolajCimke: k.gazolajCimke, gpsHiba: k.gpsHiba,
    vanUtdijImport: k.vanUtdijImport, tankolasDb: k.tankolasDb, arfolyamok: k.arfolyamok, atvaltatlanKezi: k.atvaltatlanKezi,
    napiKoltsegBeallitas: k.beallitas.napi_koltseg_ft, sajatKmDijBeallitas: k.beallitas.sajat_fuvar_km_dij_ft,
    kocsiNelkul: k.kocsiNelkul,
  };
}
