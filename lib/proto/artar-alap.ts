// Prototípus: ártár a WWP saját bérfuvarjaiból. Tiszta számítás, se DB, se hálózat.
// A kérdés, amire válaszol: „ez a díj jó-e ehhez a viszonylathoz és partnerhez?”.

export type ArMinta = {
  id: string;
  partner: string;
  fel: string;
  le: string;
  nap: string;
  dijFt: number;
  km: number | null;
  szamla: string | null;
};

export type ArItelet = "jo" | "atlagos" | "alacsony" | "nincs_adat";

export type ArCsekk = {
  ftKm: number | null;
  itelet: ArItelet;
  /** Mihez mértük: „ez a viszonylat (5 fuvar)”, „ez a partner (7 fuvar)”, „a teljes flotta (70 fuvar)”. */
  alap: string | null;
  alapFtKm: number | null;
  viszonylat: { db: number; medianDij: number; medianFtKm: number | null; utolso: { partner: string; dijFt: number; nap: string } | null };
  partner: { db: number; medianFtKm: number | null };
  flottaFtKm: number | null;
};

/** Ennyi fuvar alatt nem hasonlítunk csoporthoz, mert egy-két kiugró eldöntené. */
const MIN_MINTA = 3;
const SAV = 0.07;

export function median(szamok: number[]): number | null {
  if (szamok.length === 0) return null;
  const s = [...szamok].sort((a, b) => a - b);
  const k = Math.floor(s.length / 2);
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
}

function kulcs(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Azonos számlaszámú sorokból egy marad: a duplikált fuvar ne torzítsa az ártárat. */
export function szamlaSzerintEgyedi<T extends { szamla: string | null }>(sorok: T[]): T[] {
  const lattuk = new Set<string>();
  return sorok.filter((s) => {
    if (!s.szamla) return true;
    if (lattuk.has(s.szamla)) return false;
    lattuk.add(s.szamla);
    return true;
  });
}

export function arCsekk(
  minta: ArMinta[],
  k: { partner: string | null; fel: string; le: string; dijFt: number | null; km: number | null }
): ArCsekk {
  const ftKm = (m: { dijFt: number; km: number | null }) => (m.km && m.km > 0 ? m.dijFt / m.km : null);
  const ertekek = (l: ArMinta[]) => l.map(ftKm).filter((x): x is number => x != null);

  const vl = minta
    .filter((m) => kulcs(m.fel) === kulcs(k.fel) && kulcs(m.le) === kulcs(k.le))
    .sort((a, b) => b.nap.localeCompare(a.nap));
  const pl = k.partner ? minta.filter((m) => kulcs(m.partner) === kulcs(k.partner!)) : [];
  const vFtKm = median(ertekek(vl));
  const pFtKm = median(ertekek(pl));
  const fFtKm = median(ertekek(minta));
  const sajat = k.dijFt != null && k.km && k.km > 0 ? k.dijFt / k.km : null;

  let alap: string | null = null;
  let alapFtKm: number | null = null;
  if (vFtKm != null && ertekek(vl).length >= MIN_MINTA) { alap = `ez a viszonylat (${vl.length} fuvar)`; alapFtKm = vFtKm; }
  else if (pFtKm != null && ertekek(pl).length >= MIN_MINTA) { alap = `ez a partner (${pl.length} fuvar)`; alapFtKm = pFtKm; }
  else if (fFtKm != null && ertekek(minta).length >= MIN_MINTA) { alap = `az összes fuvar (${ertekek(minta).length})`; alapFtKm = fFtKm; }

  let itelet: ArItelet = "nincs_adat";
  if (sajat != null && alapFtKm != null) {
    const arany = sajat / alapFtKm;
    itelet = arany < 1 - SAV ? "alacsony" : arany > 1 + SAV ? "jo" : "atlagos";
  }

  return {
    ftKm: sajat != null ? Math.round(sajat) : null,
    itelet,
    alap,
    alapFtKm: alapFtKm != null ? Math.round(alapFtKm) : null,
    viszonylat: {
      db: vl.length,
      medianDij: Math.round(median(vl.map((m) => m.dijFt)) ?? 0),
      medianFtKm: vFtKm != null ? Math.round(vFtKm) : null,
      utolso: vl[0] ? { partner: vl[0].partner, dijFt: vl[0].dijFt, nap: vl[0].nap } : null,
    },
    partner: { db: pl.length, medianFtKm: pFtKm != null ? Math.round(pFtKm) : null },
    flottaFtKm: fFtKm != null ? Math.round(fFtKm) : null,
  };
}

export type Duplikatum = { szamla: string; fuvarok: { id: string; partner: string; nap: string; dijFt: number }[]; tobbletFt: number };

/** Élő fuvarok azonos számlaszámmal. Csak jelzés: hogy melyik a valódi, ember dönti el. */
export function duplikatumok(minta: ArMinta[]): Duplikatum[] {
  const m = new Map<string, ArMinta[]>();
  for (const s of minta) {
    if (!s.szamla) continue;
    m.set(s.szamla, [...(m.get(s.szamla) ?? []), s]);
  }
  return [...m.entries()]
    .filter(([, l]) => l.length > 1)
    .map(([szamla, l]) => ({
      szamla,
      fuvarok: l.map((s) => ({ id: s.id, partner: s.partner, nap: s.nap, dijFt: s.dijFt })),
      tobbletFt: l.slice(1).reduce((a, s) => a + s.dijFt, 0),
    }))
    .sort((a, b) => b.tobbletFt - a.tobbletFt);
}
