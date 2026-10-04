// Egy nap GPS-km-jének bontása bér / saját / üres részre — a Kimutatás és a
// Tervezés közös szabálya, hogy a két oldal ugyanazt a rakott/üres km-t mutassa.
//
// NAPI szintű közelítés: a nap km-je ahhoz a jelleghez tartozik, amilyen
// megbízás aznap ért véget (lerakás napja); ha bér és saját is, felezve; ha
// semmi, üres. A megállónkénti GPS-alapú pontos bontás akkor jön, amikor a
// megállók GPS-adatai minden soron megvannak.

export type KmBontas = { ber: number; sajat: number; ures: number };

export function napiKmBontas(km: number, aznapLerakottJellegek: ("ber" | "sajat")[]): KmBontas {
  const ber = aznapLerakottJellegek.includes("ber");
  const sajat = aznapLerakottJellegek.includes("sajat");
  if (ber && sajat) return { ber: km / 2, sajat: km / 2, ures: 0 };
  if (ber) return { ber: km, sajat: 0, ures: 0 };
  if (sajat) return { ber: 0, sajat: km, ures: 0 };
  return { ber: 0, sajat: 0, ures: km };
}
