const SZAM = new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 0 });

export function ft(n: number): string {
  return `${SZAM.format(n)} Ft`;
}

export function szam(n: number): string {
  return SZAM.format(n);
}

export function eur(n: number): string {
  return `${SZAM.format(n)} €`;
}

/** „okt. 24.” a YYYY-MM-DD napból. */
export function napCimke(nap: string | null | undefined): string {
  if (!nap) return "Nincs dátum";
  const d = new Date(`${nap}T12:00:00Z`);
  return d.toLocaleDateString("hu-HU", { month: "short", day: "numeric", timeZone: "UTC" });
}
