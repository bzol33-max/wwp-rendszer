// Egyelőre nincs bejelentkezés/felhasználókezelés — amíg az nem készül el
// jogosultságokkal együtt, minden rögzített tétel "admin" névvel bélyegződik.
// A böngésző-alapú névbekérő widget emiatt le van kapcsolva.
export function getCurrentUser(): string {
  return "admin";
}
