// A /jelenlet asztali „Csapat” lapjának tiszta segédjei (redesign 6): hét-tartomány,
// feliratok és a rács egy cellájának állapota. Adatot nem kérnek le, így tesztelhetők
// (scripts/teszt-csapat-lap.ts).

import {
  munkanap,
  munkaszunetiNap,
  weekInfo,
  type DaySummary,
  type JelenletSession,
  type RacsBejegyzes,
  type SzabadsagMerleg,
} from "@/lib/jelenlet/shared";

const HO_ROVID = ["jan.", "febr.", "márc.", "ápr.", "máj.", "jún.", "júl.", "aug.", "szept.", "okt.", "nov.", "dec."];
const NAP_NEVEK = ["vasárnap", "hétfő", "kedd", "szerda", "csütörtök", "péntek", "szombat"];

/** A nap betűjele a rács fejlécében, hétfővel kezdve. */
export const NAP_BETUK = ["H", "K", "Sze", "Cs", "P", "Szo", "V"] as const;

/** Az „Marad” oszlop narancs küszöbe: ennyi vagy kevesebb nap. */
export const KEVES_SZABADSAG_NAP = 3;

export function eltolIso(iso: string, napok: number): string {
  const [ev, ho, nap] = iso.split("-").map(Number);
  return new Date(Date.UTC(ev, ho - 1, nap + napok)).toISOString().slice(0, 10);
}

/** Az adott nap hetének hétfője. */
export function hetfoIso(iso: string): string {
  return weekInfo(iso).mondayIso;
}

/** `db` egymás utáni hét, hetenként 7 nap, `hetfo`-től. */
export function hetekNapjai(hetfo: string, db: number): string[][] {
  return Array.from({ length: db }, (_, h) =>
    Array.from({ length: 7 }, (_, n) => eltolIso(hetfo, h * 7 + n))
  );
}

/** „okt. 19.” */
export function datumRovid(iso: string): string {
  const [, ho, nap] = iso.split("-").map(Number);
  return `${HO_ROVID[ho - 1]} ${nap}.`;
}

/** „hétfő, nov. 2.” */
export function napDatumCimke(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${NAP_NEVEK[d.getUTCDay()]}, ${datumRovid(iso)}`;
}

/** A hét fejléce: „43. hét · okt. 19–25.”, hónaphatáron „44. hét · okt. 26. – nov. 1.”. */
export function hetCimke(hetfo: string): string {
  const vasarnap = eltolIso(hetfo, 6);
  const [, ho1, nap1] = hetfo.split("-").map(Number);
  const [, ho2, nap2] = vasarnap.split("-").map(Number);
  const tartomany =
    ho1 === ho2
      ? `${HO_ROVID[ho1 - 1]} ${nap1}–${nap2}.`
      : `${datumRovid(hetfo)} – ${datumRovid(vasarnap)}`;
  return `${weekInfo(hetfo).week}. hét · ${tartomany}`;
}

/** Percből „8:50”. */
export function formatIdo(perc: number): string {
  const h = Math.floor(perc / 60);
  const m = perc % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** Az éves lekérdezésekhez: mely naptári évek érintettek a tartományban. */
export function tartomanyEvei(tol: string, ig: string): number[] {
  const elso = Number(tol.slice(0, 4));
  const utolso = Number(ig.slice(0, 4));
  return Array.from({ length: utolso - elso + 1 }, (_, i) => elso + i);
}

export type CellaTipus =
  | "szabadsag"
  | "kert"
  | "beteg"
  | "ledolgozott"
  | "bent"
  | "nyitott"
  | "unnep"
  | "hetvege"
  | "hianyzik"
  | "jovo"
  | "ures";

export type Cella = { tipus: CellaTipus; felirat: string; cim: string };

function szakaszIdok(nap: DaySummary | undefined): string {
  return (nap?.sessions ?? [])
    .filter((s) => s.day_type === "munka")
    .map((s) => `${s.arrival_time ?? "?"}–${s.departure_time ?? "…"}`)
    .join(" · ");
}

/**
 * Egy dolgozó egy napjának cellája. A sorrend: távollét (jóváhagyott / kért /
 * beteg), hétvége-ünnep, a munkanap ledolgozott ideje, nyitott nap, hiányzó
 * bejegyzés, jövő. `aktiv`: van-e a dolgozónak jelenléti nyilvántartása (a
 * sofőröknek nincs, náluk a múltbeli üres nap nem „hiányzó” bejegyzés).
 */
export function cella(adat: {
  iso: string;
  ma: string;
  aktiv: boolean;
  bejegyzes?: Pick<RacsBejegyzes, "tipus" | "allapot">;
  nap?: DaySummary;
}): Cella {
  const { iso, ma, aktiv, nap } = adat;
  const tavol =
    adat.bejegyzes ??
    (nap && nap.dayType !== "munka"
      ? { tipus: nap.dayType, allapot: "jovahagyva" as const }
      : undefined);

  if (tavol) {
    if (tavol.allapot === "kert") {
      return {
        tipus: "kert",
        felirat: "k",
        cim: tavol.tipus === "beteg" ? "Kért betegszabadság, még nincs jóváhagyva" : "Kért szabadság, még nincs jóváhagyva",
      };
    }
    return tavol.tipus === "beteg"
      ? { tipus: "beteg", felirat: "B", cim: "Betegszabadság" }
      : { tipus: "szabadsag", felirat: "Sz", cim: "Jóváhagyott szabadság" };
  }

  if (!munkanap(iso)) {
    const unnep = munkaszunetiNap(iso);
    if (nap && nap.workedMinutes > 0) {
      return {
        tipus: "ledolgozott",
        felirat: formatIdo(nap.workedMinutes),
        cim: `${unnep ?? "Hétvége"}, dolgoztak: ${szakaszIdok(nap)}`,
      };
    }
    return unnep
      ? { tipus: "unnep", felirat: "Ü", cim: unnep }
      : { tipus: "hetvege", felirat: "", cim: "Hétvége" };
  }

  if (nap) {
    if (nap.nyitott) {
      const bent =
        iso === ma && nap.sessions.some((s) => s.day_type === "munka" && s.arrival_time && !s.departure_time);
      return bent
        ? { tipus: "bent", felirat: "bent", cim: `Bent van: ${szakaszIdok(nap)}` }
        : { tipus: "nyitott", felirat: "!", cim: `Nyitott nap, nincs rögzítve az érkezés vagy a távozás: ${szakaszIdok(nap)}` };
    }
    if (nap.workedMinutes > 0) {
      return { tipus: "ledolgozott", felirat: formatIdo(nap.workedMinutes), cim: `Ledolgozott idő: ${szakaszIdok(nap)}` };
    }
  }

  if (iso > ma || iso === ma) {
    return { tipus: iso > ma ? "jovo" : "ures", felirat: "", cim: iso > ma ? "Még nem esedékes" : "Ma még nincs bejegyzés" };
  }
  return aktiv
    ? { tipus: "hianyzik", felirat: "–", cim: "Nincs bejegyzés — a cellára kattintva pótolható" }
    : { tipus: "ures", felirat: "", cim: "" };
}

/** A „Marad” oszlop: „5/21”, vagy „—”, ha nincs keret. */
export function maradCimke(merleg: SzabadsagMerleg | undefined): {
  szoveg: string;
  keves: boolean;
  cim: string;
} {
  if (!merleg || merleg.keret === null || merleg.maradek === null) {
    return { szoveg: "—", keves: false, cim: "Nincs keret beállítva" };
  }
  return {
    szoveg: `${merleg.maradek}/${merleg.keret}`,
    keves: merleg.maradek <= KEVES_SZABADSAG_NAP,
    cim:
      merleg.maradek < 0
        ? `Túllépte a keretet (${merleg.keret} nap)`
        : `${merleg.maradek} nap vehető még ki a ${merleg.keret} napos keretből`,
  };
}

/** A fejléc „N bent · N távol” sora a mai napról. */
export function maiLetszam(
  dolgozoIdk: string[],
  ma: string,
  maiSzakaszok: JelenletSession[],
  racs: Map<string, RacsBejegyzes[]>
): { bent: number; tavol: number } {
  const bent = new Set(
    maiSzakaszok
      .filter((s) => s.day_type === "munka" && s.arrival_time && !s.departure_time)
      .map((s) => s.employee_id)
  );
  const tavol = new Set(
    maiSzakaszok.filter((s) => s.day_type !== "munka").map((s) => s.employee_id)
  );
  for (const b of racs.get(ma) ?? []) {
    if (b.allapot === "jovahagyva") tavol.add(b.employeeId);
  }
  return {
    bent: dolgozoIdk.filter((id) => bent.has(id)).length,
    tavol: dolgozoIdk.filter((id) => tavol.has(id)).length,
  };
}
