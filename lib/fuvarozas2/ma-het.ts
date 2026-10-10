// A Ma oldal heti rácsa (Budaházi Zoltán, 2026-10-05, „R2” terv): soronként
// egy kocsi, előtte a „Most” oszlop — hol tart a mostani fuvar (kész
// megállók aránya, következő megálló, ETA) —, utána hétfőtől péntekig a
// megbízások kártyái. A kész fuvarok is a helyükön maradnak (lezárt, fotóra
// vár, számlázható…), a több napos fuvar a következő napokon „folytatódik”.
//
// Tiszta modul (nincs adatbázis) — scripts/teszt-ma-het.ts teszteli.

import { varosNev } from "@/lib/fuvarozas/varos";
import type { Allapot } from "@/lib/fuvarozas/allapot";
import type { TukorSor } from "@/lib/fuvarozas2/ma-tukor";
import { napiSorrend, tervIdoMegbizasbol } from "@/lib/fuvarozas2/napi-sorrend";
import { alkalmazMenetSorrendet } from "@/lib/menet/menet-alap";

export type HetFuvar = {
  id: string;
  allapot: Allapot;
  jelleg: "ber" | "sajat";
  partner: string | null;
  hivatkozas: string | null;
  jarmu_kod: string | null;
  felrakas_nap: string | null;
  lerakas_nap: string | null;
  felrako: string | null;
  lerako: string | null;
  /** A kiírt felrakási ablak kezdete és az időpont-mező — a közös sorrendhez (napi-sorrend.ts). */
  felrakas_ablak_tol?: string | null;
  idopont?: string | null;
};

/** Egy megálló annyiban, amennyi a kártya állapotához kell. */
export type HetMegallo = { tipus: "felrako" | "lerako"; varos: string; nap: string | null; ott: boolean; kesz: boolean };

export type HetSzin = "kesz" | "foto" | "uton" | "ott" | "terv" | "ellenorzes";

export type HetKartya = {
  id: string;
  partner: string;
  /** „Szakoly → Tata”. */
  utvonal: string;
  jelleg: "ber" | "sajat";
  szin: HetSzin;
  /** „lezárt”, „fotóra vár”, „úton”, „rakodik”, „tervezett”… */
  cimke: string;
  /** Igaz a fuvar második, harmadik… napján. */
  folytatodik: boolean;
  /** A folytatódó napon: aznapi megállók („Debrecen le”), különben null. */
  aznap: string | null;
  /** A folytatódó nap teendője kész (a fuvar lezárult, vagy aznapi megállói mind készek). */
  aznapKesz: boolean;
};

export type HetMost =
  | { tipus: "fuvar"; fuvarId: string; partner: string; szazalek: number; kovetkezo: string; ido: string | null; szin: "blue" | "amber" }
  | { tipus: "kesz" }
  | { tipus: "ures" };

export type HetNap = { nap: string; cimke: string; ma: boolean };

const NAPNEV = ["Vasárnap", "Hétfő", "Kedd", "Szerda", "Csütörtök", "Péntek", "Szombat"];

/** A megjelenítendő hét hétfője–péntekje: hétvégén már a következő hét. */
export function hetNapjai(ma: string): HetNap[] {
  const d = new Date(`${ma}T12:00:00Z`);
  const hetNapja = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (hetNapja === 6 ? 2 : hetNapja === 0 ? 1 : 1 - hetNapja));
  const ki: HetNap[] = [];
  for (let i = 0; i < 5; i++) {
    const nap = d.toISOString().slice(0, 10);
    ki.push({ nap, cimke: `${NAPNEV[d.getUTCDay()]} ${d.getUTCDate()}.`, ma: nap === ma });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return ki;
}

/** ISO hét száma — „41. hét”. */
export function hetSzama(nap: string): number {
  const d = new Date(`${nap}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
}

const KESZ_CIMKE: Partial<Record<Allapot, string>> = {
  teljesitve: "fotóra vár",
  szamlazhato: "számlázható",
  szamlazva: "számlázva",
  email_elment: "számlázva",
  postazva: "számlázva",
  lezart: "lezárt",
};

function allapotKartya(f: HetFuvar, megallok: HetMegallo[]): { szin: HetSzin; cimke: string } {
  if (f.allapot === "teljesitve") return { szin: "foto", cimke: "fotóra vár" };
  const kesz = KESZ_CIMKE[f.allapot];
  if (kesz) return { szin: "kesz", cimke: kesz };
  if (f.allapot === "ellenorzesre_var") return { szin: "ellenorzes", cimke: "ellenőrzésre vár" };
  if (f.allapot === "folyamatban") {
    const ott = megallok.find((m) => m.ott && !m.kesz);
    if (ott) return { szin: "ott", cimke: ott.tipus === "felrako" ? `rakodik · ${ott.varos}` : `lerakón · ${ott.varos}` };
    return { szin: "uton", cimke: "úton" };
  }
  return { szin: "terv", cimke: "tervezett" };
}

const varos = (cim: string | null) => (cim ? varosNev(cim) ?? cim : "—");

/**
 * Egy kocsi (vagy a kocsi nélküliek) cellái a hét öt napjára. Egy fuvar
 * minden olyan napon megjelenik, amely a felrakás és a lerakás napja közé
 * esik; az első napon teljes kártya, utána „folytatódik”. Ha egy napra
 * JÓVÁHAGYOTT menet van (`menetSorrend(nap)`, lib/menet), az a nap sorrendje.
 */
export function hetCellak(
  fuvarok: HetFuvar[],
  megallok: Map<string, HetMegallo[]>,
  napok: HetNap[],
  menetSorrend: (nap: string) => readonly string[] | null | undefined = () => null
): HetKartya[][] {
  return napok.map(({ nap }) => {
    const aznapiak = fuvarok.filter((f) => {
      const tol = f.felrakas_nap ?? f.lerakas_nap;
      const ig = f.lerakas_nap && tol && f.lerakas_nap >= tol ? f.lerakas_nap : tol;
      return tol != null && ig != null && tol <= nap && nap <= ig;
    });
    // A közös sorrend (napi-sorrend.ts): a lezárt elöl, a kiírt időpontú a
    // nélküle lévők előtt — itt nincs tény-idő, csak a terv.
    const sorrendben = alkalmazMenetSorrendet(
      napiSorrend(aznapiak, (f) => ({
        id: f.id, felrakasNap: f.felrakas_nap, lerakasNap: f.lerakas_nap, felrako: f.felrako, lerako: f.lerako,
        lezart: !!KESZ_CIMKE[f.allapot],
        tervIdo: tervIdoMegbizasbol(f.felrakas_nap, f.felrakas_ablak_tol, f.idopont),
      })),
      menetSorrend(nap),
      (f) => f.id
    );
    return sorrendben.map((f) => {
      const gs = megallok.get(f.id) ?? [];
      const elsoNap = nap === napok[0].nap ? (f.felrakas_nap ?? nap) >= nap : (f.felrakas_nap ?? nap) === nap;
      const folytatodik = !elsoNap;
      const aznapiGs = gs.filter((m) => m.nap === nap);
      const aznapMegallok = aznapiGs.map((m) => `${m.varos} ${m.tipus === "felrako" ? "fel" : "le"}`);
      const allapot = allapotKartya(f, gs);
      // Kedden a hétfőn indult, már lezárt Lösung/ÁB Speed fuvar ne látsszon
      // nyitott „folytatódik”-nak (Budaházi Zoltán, 2026-10-07).
      const aznapKesz = folytatodik && (allapot.szin === "kesz" || allapot.szin === "foto" || (aznapiGs.length > 0 && aznapiGs.every((m) => m.kesz)));
      return {
        id: f.id,
        partner: f.partner ?? "(nincs megbízó)",
        utvonal: `${varos(f.felrako)} → ${varos(f.lerako)}`,
        jelleg: f.jelleg,
        ...allapot,
        folytatodik,
        aznap: folytatodik ? (aznapMegallok.join(", ") || (nap === f.lerakas_nap ? `${varos(f.lerako)} le` : "úton")) : null,
        aznapKesz,
      };
    });
  });
}

/**
 * A „Most” oszlop a mai tükör-sorokból (ma-tukor.ts): az első még nem kész
 * megálló fuvarja, a kész megállói arányával. Ha minden mai megálló kész:
 * „kesz”; ha ma nincs megálló: „ures”.
 */
export function hetMost(sorok: TukorSor[]): HetMost {
  const megallok = sorok.filter((s): s is Extract<TukorSor, { tipus: "megallo" }> => s.tipus === "megallo");
  if (megallok.length === 0) return { tipus: "ures" };
  const kov = megallok.find((m) => m.allapot !== "kesz");
  if (!kov) return { tipus: "kesz" };
  const sajat = megallok.filter((m) => m.fuvarId === kov.fuvarId);
  const kesz = sajat.filter((m) => m.allapot === "kesz").length;
  const fej = sorok.find((s): s is Extract<TukorSor, { tipus: "fuvar" }> => s.tipus === "fuvar" && s.fuvarId === kov.fuvarId);
  const ott = kov.allapot === "most";
  return {
    tipus: "fuvar",
    fuvarId: kov.fuvarId,
    partner: fej?.partner ?? "(nincs megbízó)",
    szazalek: Math.round((kesz / sajat.length) * 100),
    kovetkezo: `${kov.varos} ${kov.felLe === "felrako" ? "fel" : "le"}`,
    ido: kov.teny ?? kov.terv,
    szin: ott || kov.kiemelt ? "amber" : "blue",
  };
}
