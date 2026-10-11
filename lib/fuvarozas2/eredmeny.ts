"use server";

// Eredmény oldal adatai (az új terv 4. oldala, 2026-10-11): ugyanaz a
// költség-motor, mint a Kimutatásé (koltsegIdoszakra), csak három kérdésre
// rendezve: kerestünk-e a bérfuvaron, kinek dolgozunk ingyen, mennyibe kerül a
// saját áru fuvarja. A lezárt hónapokat 6 órára, a folyamatban lévőt 10
// percre gyorsítótárazza (az Ecofleet útvonal-jelentés lassú).

import { requireAnyViewPermission } from "@/lib/auth/require-permission";
import { query } from "@/lib/db";
import { koltsegIdoszakra, type IdoszakKoltseg } from "@/lib/fuvarozas2/koltseg-adat";
import {
  ingyenesMegbizok, negyHonap, partnerOsszesites, URES_VIZESES, vizeses, vizesesOsszeg,
  type Forras, type PartnerSor, type Vizeses,
} from "@/lib/fuvarozas2/eredmeny-alap";

export type EredmenyValasztas = "het" | "ho" | "elozo" | "negy";

/** `atvaltatlanEur`: EUR-os bérdíj árfolyam nélkül — a vízesés bevételében és fedezetében NINCS benne (a költsége igen), ugyanúgy, mint a Kimutatáson. */
export type EredmenyKocsi = { kod: string; sofor: string | null; berDb: number; sajatDb: number; vizeses: Vizeses; sajatBelsoFt: number; atvaltatlanEur: number };

export type EredmenyAdat = {
  valasztas: EredmenyValasztas;
  idoszakCimke: string;
  kocsik: EredmenyKocsi[];
  fedezetOssz: number;
  atvaltatlanEurOssz: number;
  sajatOssz: number;
  sajatDb: number;
  honapok: { cimke: string; folyamatban: boolean; kocsik: { kod: string; sofor: string | null; fedezet: number }[] }[];
  partnerek: PartnerSor[];
  ingyen: ReturnType<typeof ingyenesMegbizok>;
  forras: { uzemanyag: Forras; utdij: Forras };
  gpsHiba: string | null;
  /** Kézi költségsorok, amik átváltás nélkül kimaradtak a költségből (a kiválasztott időszakban). */
  atvaltatlanKezi: { db: number; eur: number; masPenznemDb: number };
  vanUtdijImport: boolean;
  valasztek: { k: EredmenyValasztas; c: string }[];
};

const tar = new Map<string, { ido: number; adat: IdoszakKoltseg }>();

async function idoszak(kezdet: string, veg: string, lezart: boolean): Promise<IdoszakKoltseg> {
  const kulcs = `${kezdet}|${veg}`;
  const x = tar.get(kulcs);
  const ttl = lezart ? 6 * 3600_000 : 10 * 60_000;
  if (x && Date.now() - x.ido < ttl) return x.adat;
  const adat = await koltsegIdoszakra(kezdet, veg);
  tar.set(kulcs, { ido: Date.now(), adat });
  return adat;
}

function kocsikIdoszakbol(k: IdoszakKoltseg): EredmenyKocsi[] {
  return k.jarmuvek.map((j) => ({
    kod: j.kod, sofor: j.sofor, berDb: j.eredmeny.berDb, sajatDb: j.eredmeny.sajatDb,
    vizeses: vizeses({ berBevetelFt: j.eredmeny.berBevetelFt, eredmenyFt: j.eredmeny.eredmenyFt, nemHozzarendeltFt: j.eredmeny.nemHozzarendeltFt, megbizasok: j.megbizasok }),
    sajatBelsoFt: Math.round(j.eredmeny.sajatBelsoKoltsegFt),
    atvaltatlanEur: j.eredmeny.atvaltatlanEur,
  }));
}

function osszevon(listak: EredmenyKocsi[][]): EredmenyKocsi[] {
  const m = new Map<string, EredmenyKocsi>();
  for (const l of listak) for (const k of l) {
    const x = m.get(k.kod) ?? { kod: k.kod, sofor: k.sofor, berDb: 0, sajatDb: 0, vizeses: URES_VIZESES, sajatBelsoFt: 0, atvaltatlanEur: 0 };
    m.set(k.kod, { kod: k.kod, sofor: x.sofor ?? k.sofor, berDb: x.berDb + k.berDb, sajatDb: x.sajatDb + k.sajatDb, vizeses: vizesesOsszeg(x.vizeses, k.vizeses), sajatBelsoFt: x.sajatBelsoFt + k.sajatBelsoFt, atvaltatlanEur: x.atvaltatlanEur + k.atvaltatlanEur });
  }
  return [...m.values()];
}

const lathatoKocsi = (k: EredmenyKocsi) => k.berDb + k.sajatDb > 0 || k.vizeses.uresAllas !== 0;

function forrasOf(listak: IdoszakKoltseg[], f: (j: IdoszakKoltseg["jarmuvek"][number]) => Forras | undefined): Forras {
  const mind = listak.flatMap((l) => l.jarmuvek).filter((j) => j.eredmeny.berDb > 0);
  return mind.length > 0 && mind.every((j) => f(j) === "teny") ? "teny" : "becsles";
}

export async function getEredmeny(valasztasBe?: string): Promise<EredmenyAdat> {
  await requireAnyViewPermission(["fuvarozas"]);
  const valasztas: EredmenyValasztas = (["het", "ho", "elozo", "negy"] as const).includes(valasztasBe as EredmenyValasztas) ? (valasztasBe as EredmenyValasztas) : "ho";
  const [n] = await query<{ ma: string; hetKezdet: string; hetVeg: string }>(
    `with n as (select (now() at time zone 'Europe/Budapest')::date as d)
     select d::text as ma, date_trunc('week', d)::date::text as "hetKezdet", (date_trunc('week', d) + interval '6 days')::date::text as "hetVeg" from n`
  );
  const ho = negyHonap(n.ma);
  // Sorban, nem párhuzamosan: az Ecofleet-jelentést nem terheljük egyszerre négyszer.
  const honapAdat: IdoszakKoltseg[] = [];
  for (const h of ho) honapAdat.push(await idoszak(h.kezdet, h.veg, !h.folyamatban));

  let kivalasztott: IdoszakKoltseg[];
  let idoszakCimke: string;
  if (valasztas === "het") {
    kivalasztott = [await idoszak(n.hetKezdet, n.hetVeg, false)];
    idoszakCimke = `${n.hetKezdet.slice(5).replace("-", ".")}.–${n.hetVeg.slice(5).replace("-", ".")}.`;
  } else if (valasztas === "elozo") {
    kivalasztott = [honapAdat[2]];
    idoszakCimke = ho[2].cimke;
  } else if (valasztas === "negy") {
    kivalasztott = honapAdat;
    idoszakCimke = `${ho[0].cimke}–${ho[3].cimke}`;
  } else {
    kivalasztott = [honapAdat[3]];
    idoszakCimke = ho[3].cimke;
  }

  const kocsik = osszevon(kivalasztott.map(kocsikIdoszakbol)).filter(lathatoKocsi);
  const partnerek = partnerOsszesites(honapAdat.flatMap((h) => h.jarmuvek.flatMap((j) => j.megbizasok)), n.ma);
  const valasztek: { k: EredmenyValasztas; c: string }[] = [
    { k: "het", c: "Hét" },
    { k: "ho", c: ho[3].cimke.replace(/^./, (c) => c.toUpperCase()) },
    { k: "elozo", c: ho[2].cimke.replace(/^./, (c) => c.toUpperCase()) },
    { k: "negy", c: "4 hónap" },
  ];
  return {
    valasztas, idoszakCimke, kocsik,
    fedezetOssz: kocsik.reduce((a, k) => a + k.vizeses.fedezet, 0),
    atvaltatlanEurOssz: kocsik.reduce((a, k) => a + k.atvaltatlanEur, 0),
    sajatOssz: kocsik.reduce((a, k) => a + k.sajatBelsoFt, 0),
    sajatDb: kocsik.reduce((a, k) => a + k.sajatDb, 0),
    honapok: ho.map((h, i) => ({
      cimke: h.cimke, folyamatban: h.folyamatban,
      kocsik: kocsikIdoszakbol(honapAdat[i]).map((k) => ({ kod: k.kod, sofor: k.sofor, fedezet: k.vizeses.fedezet })),
    })),
    partnerek,
    ingyen: ingyenesMegbizok(partnerek),
    forras: { uzemanyag: forrasOf(kivalasztott, (j) => j.ossz.uzemanyag?.forras), utdij: forrasOf(kivalasztott, (j) => j.ossz.utdij?.forras) },
    gpsHiba: kivalasztott.map((k) => k.gpsHiba).find(Boolean) ?? null,
    atvaltatlanKezi: kivalasztott.reduce((a, k) => ({ db: a.db + k.atvaltatlanKezi.db, eur: a.eur + k.atvaltatlanKezi.eur, masPenznemDb: a.masPenznemDb + k.atvaltatlanKezi.masPenznemDb }), { db: 0, eur: 0, masPenznemDb: 0 }),
    vanUtdijImport: kivalasztott.some((k) => k.vanUtdijImport),
    valasztek,
  };
}
