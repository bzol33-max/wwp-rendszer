// Egyszerű, bejelentkezés nélküli "ki vagy" — a böngésző localStorage-ában
// tárolt névvel bélyegzünk minden rögzített tételt. Nincs mögötte
// jogosultságkezelés, csak nyomon követhetőség.
const KEY = "wwp_current_user";

export function getCurrentUser(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function setCurrentUser(name: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, name);
  } catch {
    // localStorage nem elérhető (pl. privát böngészés) — csendben elnyeljük.
  }
}
