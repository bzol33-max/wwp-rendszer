// Szerepkörök. Nem "use server" / nem "server-only": a Felhasználók felület
// (kliens komponens) és a szerver akciók is innen olvassák, és a "use server"
// fájlokból csak async függvény exportálható, konstans nem.
//
// A "dolgozo" és a "sofor" korábban csak migrációval volt beállítható, a
// felületen nem szerepelt — emiatt egy sofőr fiók szerkesztése csendben
// "felhasznalo"-ra írta volna a szerepkört (2026-10-02).
export const ROLES = [
  { value: "felhasznalo", label: "Felhasználó (jogosultságok alább)" },
  { value: "admin", label: "Admin (mindent lát és szerkeszthet)" },
  { value: "dolgozo", label: "Dolgozó (mobil nézet)" },
  { value: "sofor", label: "Sofőr (mobil nézet, csak fuvarok és profil)" },
] as const;

export type Role = (typeof ROLES)[number]["value"];

/** Rövid címke a táblázathoz. */
export const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  felhasznalo: "Felhasználó",
  dolgozo: "Dolgozó",
  sofor: "Sofőr",
};

export function normalizeRole(input: string): Role {
  const r = ROLES.find((x) => x.value === input);
  if (!r) throw new Error(`Ismeretlen szerepkör: ${input}`);
  return r.value;
}
