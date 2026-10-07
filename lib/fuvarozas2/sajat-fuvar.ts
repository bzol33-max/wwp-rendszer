"use server";

import * as actions from "@/lib/megbizasok/akciok";

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
// Elnevezés: saját fuvar = jelleg 'sajat' (a régi, fordított `tipus` oszlopban
// 'ber' — azt csak beszúráskor írjuk, a jelleg-et a 001-es trigger tölti; a
// lekérdezések a helyes irányú jelleg-et használják, audit BIZ-3).

import { query } from "@/lib/db";
import { requireViewPermission } from "@/lib/auth/require-permission";
import { SAJAT_JARMUVEK } from "@/lib/fuvarozas/vehicles";
import { SAJAT_TELEPHELYEK } from "@/lib/fuvarozas/telephelyek";
import type { DuplikatumJelolt } from "@/lib/fuvarozas2/sajat-duplikatum";

export type SajatFuvarAdat = {
  datum: string;
  jarmuKod: string | null;
  honnan: string;
  hova: string;
  /** Ki adja az árut (csak szöveg, nem köt partnerhez). */
  kitol: string | null;
  kinek: string | null;
  megjegyzes: string | null;
};

/**
 * `duplikatumok`: ha mentésnél már van ugyanannak látszó fuvar (lásd
 * lib/fuvarozas2/sajat-duplikatum.ts), a szerver nem ment, hanem ezeket adja
 * vissza; a felület megkérdezi, és „mégis mentem”-re `duplikatumOk: true`-val
 * hívja újra.
 */
export type Eredmeny = { ok: true; id: string } | { ok: false; hiba: string; duplikatumok?: DuplikatumJelolt[] };

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

/**
 * Új előkészített saját fuvar, vagy egy előkészítés alatti módosítása.
 * Ha ugyanaz a kocsi ±1 napon ugyanazt az utat már viszi, `duplikatumOk`
 * nélkül nem ment (2026-10-06, #274/#295).
 */
export async function mentSajatFuvart(id: string | null, nyers: SajatFuvarAdat, opciok: { duplikatumOk?: boolean } = {}): Promise<Eredmeny> { return actions.mentSajatFuvart(id, nyers, opciok); }
export async function rogzitElvinnivalot(a: actions.ElvinniAdat): Promise<Eredmeny> { return actions.rogzitElvinnivalot(a); }
export async function modositElvinnivalot(id: string, a: actions.ElvinniAdat): Promise<Eredmeny> { return actions.modositElvinnivalot(id, a); }
export async function utemezElvinnivalot(id: string, a: { jarmuKod: string; nap: string }): Promise<Eredmeny> { return actions.utemezElvinnivalot(id, a); }
export async function visszaElvinnivalokba(id: string): Promise<Eredmeny> { return actions.visszaElvinnivalokba(id); }

/**
 * „Kocsira adom”: a kocsi a `jarmu` mezőbe kerül (a sofőr appja innen
 * látja), az előkészítés véget ér, a Fuvarozás 2 megállói felépülnek.
 */
export async function kocsiraAdom(id: string): Promise<Eredmeny> { return actions.kocsiraAdom(id); }

/**
 * „Visszaveszem”: a kocsira adott saját fuvar vissza előkészítésbe, amíg a
 * sofőr el nem indult vele (egyik megállóját sem érintette sofőr vagy GPS).
 */
export async function visszaveszem(id: string): Promise<Eredmeny> { return actions.visszaveszem(id); }

/** Előkészítés alatti saját fuvar törlése (a kocsira adottat előbb vissza kell venni). */
export async function torolElokeszitettet(id: string): Promise<Eredmeny> { return actions.torolElokeszitettet(id); }

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
         select felrako as cim, max(datum) as utolso from fuvar_megbizasok where jelleg = 'sajat' and felrako <> '' group by felrako
         union all
         select lerako, max(datum) from fuvar_megbizasok where jelleg = 'sajat' and lerako <> '' group by lerako
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
