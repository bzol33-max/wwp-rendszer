// A raklap-telephelyek közös listái (audit D4/BIZ-12, 2026-10-25): eddig
// 7 helyen, külön-külön másolva éltek. A sorrendek a korábbiakkal azonosak.
// (A lib/nav.ts SITES a navigáció sorrendje; a fuvarozás saját telephelyei
// koordinátákkal a lib/fuvarozas/telephelyek.ts-ben vannak — az más fogalom.)

/** Megjelenítési sorrend a Készlet, az Archívum és az Áttekintés listáin. */
export const TELEP_SORREND: readonly string[] = ["Nyíregyháza", "Balkány", "Szakoly"];

/** A dolgozói (saját) készlet-rögzítés telephelyei — a többi csak az irodáé. */
export const SAJAT_KESZLET_TELEPEK = ["Szakoly", "Balkány"] as const;
export type SajatKeszletTelep = (typeof SAJAT_KESZLET_TELEPEK)[number];
