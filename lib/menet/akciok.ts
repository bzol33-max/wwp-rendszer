"use server";

// Menetterv — szerver-akciók (Tervezés oldal, Menetterv panel). Minden
// export jogosultságot ellenőriz (scripts/teszt-akcio-jogok.ts): olvasás a
// fuvarozás megtekintési, minden írás a fuvarozás szerkesztési jogával.
//
// Szabályok:
//   • a 'javaslat' menetet a gép számolja (óránként és „Javaslat frissítése”),
//     a jóváhagyottat SOHA nem írja felül;
//   • jóváhagyás és átrendezés optimista zárral (verzio): elavult verzióra
//     érthető hibaüzenet, semmi nem íródik;
//   • átrendezéshez indok kell, a napló a régi és az új sorrendet is őrzi
//     (menet_esemeny + fuvar_valtozas);
//   • a feladat-lezárás CSAK az adott sor lezarva_at-ját állítja — a
//     következő sor sorszáma/típusa nem változhat (ellenőrizve, különben
//     visszagördül).

import { requireEditPermission, requireViewPermission } from "@/lib/auth/require-permission";
import { requireSession } from "@/lib/auth/dal";
import { getJarmuvek } from "@/lib/fuvarozas/jarmuvek-db";
import { toroljIdovonalCachet } from "@/lib/fuvarozas/idovonal-cache";
import { getMenetEsemenyek, getMenetek } from "@/lib/menet/repo";
import { ATLAG_SEBESSEG_KMH, frissitMenetJavaslatot } from "@/lib/menet/generalas";
import { getFuvarBeallitasok } from "@/lib/beallitasok/fuvar";
import { menetVezetes } from "@/lib/menet/menet-alap";
import { atrendezMenet, jovahagyMenet, lezarMenetFeladatot, visszaJavaslatbaMenet, type Valasz } from "@/lib/menet/muveletek";
import { nyitottJavaslatok } from "@/lib/menet/optimalizalo-szerver";
import type { OptJavaslatNezet } from "@/lib/menet/optimalizalo";
import type { Menet, MenetEsemeny, MenetFigyelmeztetes } from "@/lib/menet/tipusok";

const ISO_NAP = /^\d{4}-\d{2}-\d{2}$/;
const AZONOSITO = /^\d+$/;

async function kiVagyok(): Promise<string> {
  const s = await requireSession();
  return s.name ?? s.username;
}

export type MenettervKocsi = {
  jarmuId: string;
  kod: string;
  cimke: string;
  sofor: string;
  menet: Menet | null;
  esemenyek: MenetEsemeny[];
  /** Az optimalizáló nyitott sorrend-javaslata (4. fázis), ha van; `elavult`: azóta változott a menet verziója. */
  optimalizalo: (OptJavaslatNezet & { elavult: boolean }) | null;
  /** A menet becsült napi vezetése (perc) és a kártya-szintű figyelmeztetés, ha a napi keret felett van. */
  vezetes: { perc: number; maxPerc: number; figyelmeztetes: MenetFigyelmeztetes | null } | null;
};

/** A Menetterv panel adatai egy napra: minden aktív kocsi (JANI is), a menetével és a naplójával. */
export async function getMenettervNap(nap: string): Promise<{ nap: string; kocsik: MenettervKocsi[]; hiba: string | null }> {
  await requireViewPermission("fuvarozas");
  if (!ISO_NAP.test(nap)) return { nap, kocsik: [], hiba: "Érvénytelen nap." };
  const jarmuvek = (await getJarmuvek()).filter((j) => j.id && j.kod);
  let menetek: Menet[] = [];
  let hiba: string | null = null;
  try {
    menetek = await getMenetek(nap, nap);
  } catch (err) {
    hiba = "A menetterv táblái még nem érhetők el (migráció?).";
    console.error("[menetterv] olvasási hiba:", err instanceof Error ? err.message : err);
  }
  const esemenyek = menetek.length ? await getMenetEsemenyek(menetek.map((m) => m.id)).catch(() => new Map<string, MenetEsemeny[]>()) : new Map<string, MenetEsemeny[]>();
  const javaslatok = await nyitottJavaslatok(menetek.map((m) => m.id));
  const vezetesMaxPerc = (await getFuvarBeallitasok()).sofor_napi_vezetes_max_perc;
  return {
    nap,
    hiba,
    kocsik: jarmuvek.map((j) => {
      const menet = menetek.find((m) => m.jarmuId === j.id) ?? null;
      const opt = menet ? javaslatok.get(menet.id) ?? null : null;
      return {
        jarmuId: j.id!, kod: j.kod!, cimke: j.label, sofor: j.sofor, menet, esemenyek: menet ? esemenyek.get(menet.id) ?? [] : [],
        optimalizalo: opt && menet ? { ...opt, elavult: opt.menetVerzio != null && opt.menetVerzio !== menet.verzio } : null,
        vezetes: menet && menet.feladatok.length
          ? { ...menetVezetes(menet.feladatok, { atlagSebessegKmh: ATLAG_SEBESSEG_KMH, vezetesMaxPerc }), maxPerc: vezetesMaxPerc }
          : null,
      };
    }),
  };
}

/** A 'javaslat' menet újraszámolása — jóváhagyott menethez nem nyúl. */
export async function javaslatFrissites(jarmuId: string, nap: string): Promise<Valasz<{ eredmeny: string }>> {
  await requireEditPermission("fuvarozas");
  if (!AZONOSITO.test(jarmuId) || !ISO_NAP.test(nap)) return { ok: false, hiba: "Érvénytelen kocsi vagy nap." };
  const ki = await kiVagyok();
  try {
    const r = await frissitMenetJavaslatot(jarmuId, nap, ki);
    if (r.eredmeny === "jovahagyott") return { ok: false, hiba: "Ez a menet már jóvá van hagyva — a javaslat nem írja felül. Ha újra kell tervezni, előbb vond vissza javaslatba." };
    return { ok: true, eredmeny: r.eredmeny };
  } catch (err) {
    console.error("[menetterv] javaslat-frissítés hiba:", err);
    return { ok: false, hiba: "Nem sikerült a javaslat frissítése." };
  }
}

/** Jóváhagyás: a javaslat sorrendje mostantól minden nézet sorrendje. */
export async function jovahagy(menetId: string, verzio: number): Promise<Valasz<{ verzio: number }>> {
  await requireEditPermission("fuvarozas");
  const r = await jovahagyMenet(menetId, verzio, await kiVagyok());
  if (r.ok) toroljIdovonalCachet();
  return r;
}

/** Átrendezés indokkal (jóváhagyott / folyamatban lévő menet) — lásd muveletek.ts. */
export async function atrendez(menetId: string, verzio: number, ujSorrend: string[], ok: string): Promise<Valasz<{ verzio: number }>> {
  await requireEditPermission("fuvarozas");
  const r = await atrendezMenet(menetId, verzio, ujSorrend, ok, await kiVagyok());
  if (r.ok) toroljIdovonalCachet();
  return r;
}

/** Egy feladat lezárása (kész). Csak az adott sor lezarva_at-ja változik. */
export async function feladatLezaras(feladatId: string): Promise<Valasz<{ verzio: number }>> {
  await requireEditPermission("fuvarozas");
  const r = await lezarMenetFeladatot(feladatId, await kiVagyok());
  if (r.ok) toroljIdovonalCachet();
  return r;
}

/** Visszavonás javaslatba (még lezárt feladat nélküli jóváhagyott menet). */
export async function visszaJavaslatba(menetId: string): Promise<Valasz<{ verzio: number }>> {
  await requireEditPermission("fuvarozas");
  const r = await visszaJavaslatbaMenet(menetId, await kiVagyok());
  if (r.ok) toroljIdovonalCachet();
  return r;
}
