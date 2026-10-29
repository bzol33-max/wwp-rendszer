// Ma + hét lap (redesign 5): a „Most dönts” panel gombjainak közös osztályai.
// Külön (nem "use client") modul, hogy szerver- és kliens-komponens is használhassa.

export const FO_GOMB =
  "inline-flex h-8 items-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-[var(--glow-primary)] [background-image:var(--grad-primary)] hover:brightness-110 disabled:opacity-50";
export const MASODLAGOS_GOMB =
  "inline-flex h-8 items-center rounded-lg px-3 text-sm font-semibold text-foreground ring-1 ring-foreground/20 hover:bg-muted disabled:opacity-50";
