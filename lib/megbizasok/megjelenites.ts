import { varosNev } from "@/lib/fuvarozas/varos";

/** A cím első városa, a munkaasztal eddigi rövidítésével. */
export function varos(cim: string | null): string {
  if (!cim) return "—";
  const elso = cim.split(/;|\s\+\s/)[0].trim();
  const v = varosNev(elso).trim();
  return v && v.length <= 32 ? v : elso.length > 32 ? `${elso.slice(0, 31)}…` : elso;
}
export function utolsoVaros(cim: string | null): string {
  if (!cim) return "?";
  const reszek = cim.split(/;|\s\+\s/);
  return varos(reszek[reszek.length - 1]);
}
export function megalloDb(cim: string | null): number {
  return cim ? cim.split(/;|\s\+\s/).filter((x) => x.trim()).length : 0;
}
export function cimReszek(cim: string | null): string[] {
  return (cim ?? "").split(/;|\s\+\s/).map((x) => x.trim()).filter(Boolean);
}
export function rovidCim(cim: string | null): string {
  const v = varosNev(cim ?? "").trim();
  return v && v.length <= 32 ? v : (cim ?? "—").slice(0, 32);
}
export function megbizasCim(s: { kitol?: string | null; partner_nev?: string | null; jelleg: string }): string {
  return s.kitol ? `${s.kitol} → ${s.partner_nev ?? "?"}` : s.partner_nev ?? (s.jelleg === "sajat" ? "Saját fuvar" : "(nincs megbízó)");
}
