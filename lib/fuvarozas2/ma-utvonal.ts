import "server-only";
import { calculateToll, FIXED_VEHICLE } from "@/lib/fuvarozas/utdijkalkulacio";
import { kerekitettPont, illesztSzakaszokat, szakaszokbol } from "@/lib/fuvarozas2/ma-utvonal-alap";

// A Ma oldal térképe (2026-10-12, Budaházi Zoltán: „rendesen legyen az útvonal”):
// a megtett út és a hátralévő terv eddig egyenes vonalak voltak a megállók
// között. Most a HU-GO útvonaltervező (a ház szabványa, J5) úthálózati
// geometriája rajzolódik. A hívások gyorsítótárazottak (3 nap, DB), a mai
// megtett szakaszok nem változnak, így oldalanként csak az új szakasz kerül
// pénzbe; a hátralévő út kiindulópontja ~2 km-re kerekítve, hogy a percenkénti
// frissítés ne hívjon újra. Ha a HU-GO nem válaszol időben, marad az egyenes.

const MAX_SZAKASZ = 20;
const IDOKORLAT_MS = 6000;

type LatLon = [number, number];

async function geometria(pontok: LatLon[]): Promise<LatLon[] | null> {
  try {
    const r = await calculateToll({ points: pontok.map(([lat, lon]) => ({ lat, lon })), ...FIXED_VEHICLE, withGeometry: true });
    if (!r.geometryLonLat || r.geometryLonLat.length < 2) return null;
    return r.geometryLonLat.map(([lon, lat]) => [lat, lon] as LatLon);
  } catch {
    return null;
  }
}

async function idokorlattal<T>(p: Promise<T>, tartalek: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(tartalek), IDOKORLAT_MS))]);
}

export type UtvonalasKocsi = {
  lat: number;
  lon: number;
  nyomvonal: LatLon[];
  hatraVan: { lat: number; lon: number }[];
  /** A hátralévő terv úthálózaton (mostani hely → hátralévő megállók); null: egyenes vonalak. */
  tervUt?: LatLon[] | null;
};

/** A kocsi mai nyomvonalát és hátralévő tervét úthálózatra illeszti (helyben módosít). Soha nem dob. */
export async function utvonalraIllesztes(kocsik: UtvonalasKocsi[]): Promise<void> {
  await Promise.all(kocsik.map(async (k) => {
    try {
      // 1. Megtett út: a hosszabb szakaszok úthálózaton, a rövidek egyenesen.
      const szakaszok = szakaszokbol(k.nyomvonal);
      const kell = szakaszok.filter((s) => s.hosszu).slice(-MAX_SZAKASZ);
      const geok = await idokorlattal(
        Promise.all(szakaszok.map((s) => (kell.includes(s) ? geometria([s.a, s.b]) : Promise.resolve(null)))),
        szakaszok.map(() => null as LatLon[] | null)
      );
      k.nyomvonal = illesztSzakaszokat(k.nyomvonal, geok);

      // 2. Hátralévő terv: mostani hely (kerekítve) → hátralévő megállók, egy hívással.
      if (k.hatraVan.length) {
        const pontok: LatLon[] = [kerekitettPont(k.lat, k.lon), ...k.hatraVan.slice(0, 8).map((h) => [h.lat, h.lon] as LatLon)];
        const g = await idokorlattal(geometria(pontok), null);
        k.tervUt = g ? [[k.lat, k.lon], ...g] : null;
      }
    } catch {
      // marad az egyenes vonal
    }
  }));
}
