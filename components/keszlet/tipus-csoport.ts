// Típuscsoport a név alapján (nincs csoport mező az adatban) — a Készlet
// redesign (3) csoportszínezéséhez.
export type Csoport = "EUR" | "Egyutas" | "Egyéb";

export function csoportOf(name: string): Csoport {
  const n = name.toLowerCase();
  if (n.startsWith("eur") || n.startsWith("vegyes eur") || n.startsWith("csere")) return "EUR";
  if (n.startsWith("egyutas")) return "Egyutas";
  return "Egyéb";
}

export const CSOPORT_SZIN: Record<Csoport, string> = {
  EUR: "#0A84FF",
  Egyutas: "#28A745",
  Egyéb: "#AF52DE",
};
