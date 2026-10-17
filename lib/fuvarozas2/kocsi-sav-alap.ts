// Fuvarozás 2. kör · Kocsi-sáv tiszta logika (docs/fuvarozas-2-kor-terv.md,
// „Kocsi-sáv (Dev A)” 1–8. szabály). Nincs I/O, nincs Date.now(): a dátum a
// `ma` bemenetből jön. Teszt: scripts/teszt-2kor-kocsi-sav.ts.

import type { MaKocsiAllapot } from "@/lib/fuvarozas2/ma-vaszon";
import type { TukorSor } from "@/lib/fuvarozas2/ma-tukor";
import type { NapCella, Res } from "@/lib/fuvarozas2/tervezes-het-alap";
import type { Kihasznaltsag } from "@/lib/fuvarozas2/kihasznaltsag-alap";

export type KocsiSavBemenet = {
  kod: string;
  sofor: string;
  helykitolto: string | null;
  allapot: MaKocsiAllapot | null;
  hetiSor: string | null;
  sorok: TukorSor[];
  holnap: { partner: string; utvonal: string }[];
  het: (Kihasznaltsag & { berBevetelFt: number }) | null;
  ma: string;
  hetKezdet: string;
  cellak: NapCella[];
  resek: Res[];
};

export type KocsiSavKovetkezo = {
  felLe: "felrako" | "lerako";
  varos: string;
  terv: string | null;
  teny: string | null;
  elteres: string | null;
  kesik: boolean;
};

export type KocsiSav = {
  kod: string;
  sofor: string;
  uzemel: boolean;
  helykitolto: string | null;
  allapot: { szoveg: string; szin: "mint" | "amber" | "red" | "normal" } | null;
  hely: string | null;
  tacho: string | null;
  futo: null | {
    fuvarId: string;
    partner: string;
    jelleg: "ber" | "sajat";
    keszDb: number;
    osszDb: number;
    kovetkezo: KocsiSavKovetkezo | null;
  };
  kovetkezoFuvar: { partner: string; utvonal: string } | null;
  hetSzamok: null | { bevetelFt: number; uresSzazalek: number | null; fedezetPerNap: number | null };
  szabad: null | { nap: string; cimke: string; honnan: string | null; resKulcs: string | null; km: number | null };
  ajanlatHref: string;
};

type Megallo = Extract<TukorSor, { tipus: "megallo" }>;

const NAPNEV = ["V", "H", "K", "Sze", "Cs", "P", "Szo"];
const DEL = (iso: string) => Date.parse(`${iso}T12:00:00Z`);

/** „ma”, „holnap”, különben „Cs 10.22.” (a Tervezés fejlécének jelölése). */
export function napCimke(nap: string, ma: string): string {
  if (nap === ma) return "ma";
  const kulonbseg = Math.round((DEL(nap) - DEL(ma)) / 86_400_000);
  if (kulonbseg === 1) return "holnap";
  return `${NAPNEV[new Date(DEL(nap)).getUTCDay()]} ${nap.slice(5, 7)}.${nap.slice(8, 10)}.`;
}

function futoFuvar(sorok: TukorSor[]): KocsiSav["futo"] {
  // A fuvarok a megállóik első előfordulásának sorrendjében.
  const csoportok = new Map<string, Megallo[]>();
  for (const s of sorok) {
    if (s.tipus !== "megallo") continue;
    const lista = csoportok.get(s.fuvarId);
    if (lista) lista.push(s);
    else csoportok.set(s.fuvarId, [s]);
  }
  for (const [fuvarId, megallok] of csoportok) {
    const kov = megallok.find((m) => m.allapot === "most") ?? megallok.find((m) => m.allapot === "kovetkezo");
    if (!kov) continue;
    const fejSor = sorok.find((s): s is Extract<TukorSor, { tipus: "fuvar" }> => s.tipus === "fuvar" && s.fuvarId === fuvarId);
    return {
      fuvarId,
      partner: fejSor?.partner ?? "",
      jelleg: fejSor?.jelleg ?? "ber",
      keszDb: megallok.filter((m) => m.allapot === "kesz").length,
      osszDb: megallok.length,
      kovetkezo: {
        felLe: kov.felLe,
        varos: kov.varos,
        terv: kov.terv,
        teny: kov.teny,
        elteres: kov.elteres,
        kesik: kov.kiemelt === "kesik",
      },
    };
  }
  return null;
}

function szabadNap(b: KocsiSavBemenet): KocsiSav["szabad"] {
  for (const c of b.cellak) {
    if (c.nap < b.ma) continue;
    const res = b.resek.find((r) => r.nap === c.nap);
    if (res) return { nap: c.nap, cimke: napCimke(c.nap, b.ma), honnan: res.honnan, resKulcs: res.kulcs, km: res.km };
    if (c.szabad) return { nap: c.nap, cimke: napCimke(c.nap, b.ma), honnan: null, resKulcs: null, km: null };
  }
  return null;
}

export function kocsiSav(b: KocsiSavBemenet): KocsiSav {
  const uzemel = b.helykitolto === null;
  const futo = uzemel ? futoFuvar(b.sorok) : null;
  const kovetkezoFuvar = uzemel && futo === null && b.holnap.length > 0 ? { partner: b.holnap[0].partner, utvonal: b.holnap[0].utvonal } : null;
  const hetSzamok =
    uzemel && b.het
      ? { bevetelFt: b.het.berBevetelFt, uresSzazalek: b.het.uresKmSzazalek, fedezetPerNap: b.het.fedezetPerNap }
      : null;
  const szabad = uzemel ? szabadNap(b) : null;
  const ajanlatHref = szabad?.resKulcs
    ? `/fuvarozas2/tervezes?het=${b.hetKezdet}&res=${encodeURIComponent(szabad.resKulcs)}`
    : `/fuvarozas2/tervezes?het=${b.hetKezdet}`;
  return {
    kod: b.kod,
    sofor: b.sofor,
    uzemel,
    helykitolto: b.helykitolto,
    allapot: b.allapot ? { szoveg: b.allapot.szoveg, szin: b.allapot.szin } : null,
    hely: b.allapot?.hely ?? null,
    tacho: b.hetiSor,
    futo,
    kovetkezoFuvar,
    hetSzamok,
    szabad,
    ajanlatHref,
  };
}
