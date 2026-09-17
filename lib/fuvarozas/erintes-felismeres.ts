// Közös GPS-érintés-felismerés a GPS lap (lib/fuvarozas/actions.ts
// getIdovonalak) és a 15 perces automatikus Teljesítve-figyelő
// (teljesites-figyeles.ts) számára.
//
// Korábban a kettő KÜLÖN logikával döntött ugyanarról: a lap az
// állás-szakaszokból, 2 km-es érintés + 3 km-es továbbhaladás +
// kölcsönös párosítás alapján mondott "elhagyva"-t; a figyelő a
// trip-végpontokból, 2 km / 10 km küszöbbel, a lerakó mezőt egyben
// geokódolva (több-lerakós fuvarnál rossz vagy semmilyen címmel). Ugyanarra
// a fuvarra a lap zöldet mutathatott, miközben a figyelő nem zárta le — vagy
// fordítva. Innentől mindkettő az idovonal.ts jelolMegallokat függvényét
// használja, az itt épített, állomásokra bontott, időablakos megállókkal.
//
// NEM "use server" fájl — szerveroldali segédfüggvények, hálózati hívással
// (geokódolás), de nem szerver-akciók.

import { geocodeAddress, TollCalcError, type GeocodedAddress } from "./utdijkalkulacio";
import { bontsMegallokra, cimKulcs, cimPontossaga, varosNev } from "./varos";
import { query } from "@/lib/db";
import { budapestFalioraToInstant } from "./idozona";
import type { EcofleetPosition } from "./ecofleet";
import type { TervezettMegallo } from "./idovonal";

/** Egy megálló időablakának forrás-mezői — a MaiFuvarSor és a FuvarErintesSor közös részhalmaza. */
export type AblakosFuvarSor = {
  /** ISO dátum (YYYY-MM-DD) — a felrakás napja. */
  datum: string;
  /** ISO dátum (YYYY-MM-DD), ha a lerakás más napra esik. */
  lerakas_datum: string | null;
  /** ISO időbélyeg (UTC, "…Z"), ha a megbízás megadta a felrakási ablak kezdetét. */
  felrakas_ablak_tol: string | null;
  /** ISO időbélyeg (UTC, "…Z"), ha a megbízás megadta a lerakási ablak kezdetét. */
  lerakas_ablak_tol: string | null;
};

function napKezdete(napISO: string): Date {
  const [ev, ho, nap] = napISO.split("-").map(Number);
  return budapestFalioraToInstant(ev, ho, nap, 0, 0, 0);
}

/**
 * Mikortól számít érkezésnek egy megálló érintése (lásd
 * TervezettMegallo.ablakKezdet): a megbízás ablakának kezdete, ha van,
 * különben a felrakás (felrakónál) / a lerakás (lerakónál) napjának kezdete.
 */
export function megalloAblakKezdet(sor: AblakosFuvarSor, tipus: "felrako" | "lerako"): Date {
  if (tipus === "felrako") {
    return sor.felrakas_ablak_tol ? new Date(sor.felrakas_ablak_tol) : napKezdete(sor.datum);
  }
  return sor.lerakas_ablak_tol ? new Date(sor.lerakas_ablak_tol) : napKezdete(sor.lerakas_datum ?? sor.datum);
}

// A címek geokódolása külső API-t hív — a címek nem változnak, a
// folyamat élettartamáig érvényes gyorsítótár elég. A helyszín-szótár
// (fuvar_helyszin_koordinata) a külső hívás ELŐTT jön: ha egy címhez a
// sofőr a helyszínről rögzítette a kocsi tényleges pozícióját, az a
// mérvadó, nem a bizonytalan geokódolás.
const geokodCache = new Map<string, GeocodedAddress | null>();

/** A helyszín-szótár és a geokódolási gyorsítótár eldobása — új helyszín rögzítése után. */
export function toroljGeokodCachet(): void {
  geokodCache.clear();
}

async function helyszinSzotarbol(cim: string): Promise<GeocodedAddress | null> {
  const kulcs = cimKulcs(cim);
  if (!kulcs) return null;
  try {
    const sorok = await query<{ lat: number; lon: number }>(
      `select lat, lon from fuvar_helyszin_koordinata where cim_kulcs = $1`,
      [kulcs]
    );
    return sorok[0] ? { label: cim, lat: Number(sorok[0].lat), lon: Number(sorok[0].lon) } : null;
  } catch (err) {
    console.error("[erintes-felismeres] helyszín-szótár hiba:", err);
    return null;
  }
}

/**
 * Egy megálló címének koordinátája: először a helyszín-szótárból, aztán
 * geokódolással, folyamat-szintű gyorsítótárral. Nem geokódolható címnél
 * null (nem dob).
 */
export async function geokodolCachelve(cim: string): Promise<GeocodedAddress | null> {
  if (geokodCache.has(cim)) return geokodCache.get(cim) ?? null;
  const rogzitett = await helyszinSzotarbol(cim);
  if (rogzitett) {
    geokodCache.set(cim, rogzitett);
    return rogzitett;
  }
  try {
    const talalat = await geocodeAddress(cim);
    geokodCache.set(cim, talalat);
    return talalat;
  } catch (err) {
    if (!(err instanceof TollCalcError)) {
      console.error("[erintes-felismeres] geokódolási hiba:", err);
    }
    geokodCache.set(cim, null);
    return null;
  }
}

/**
 * Egy fuvar állomásai a felismeréshez: a felrakó + az összes lerakó,
 * útvonal-sorrendben, állomásonként geokódolva, időablakkal. Az index
 * UGYANAZ, amit a sofőr kézi jelölése (fuvar_megallo_allapot.megallo_index)
 * és a GPS lap is használ. Az `idopont` itt csak helykitöltő (az ablak
 * kezdete) — a GPS lap a saját menetidő-becslésével írja felül.
 */
export async function epitsErintesMegallokat(
  sor: AblakosFuvarSor & { felrako: string | null; lerako: string },
  geokodol: (cim: string) => Promise<GeocodedAddress | null> = geokodolCachelve
): Promise<TervezettMegallo[]> {
  const szovegek = [
    ...bontsMegallokra(sor.felrako).map((szoveg) => ({ tipus: "felrako" as const, szoveg })),
    ...bontsMegallokra(sor.lerako).map((szoveg) => ({ tipus: "lerako" as const, szoveg })),
  ];
  const koordinatak = await Promise.all(szovegek.map((m) => geokodol(m.szoveg)));
  return szovegek.map((m, i) => {
    const ablakKezdet = megalloAblakKezdet(sor, m.tipus);
    return {
      index: i,
      tipus: m.tipus,
      cim: varosNev(m.szoveg),
      nyersCim: m.szoveg,
      pontossag: cimPontossaga(m.szoveg),
      lat: koordinatak[i]?.lat ?? null,
      lon: koordinatak[i]?.lon ?? null,
      idopont: ablakKezdet,
      elhagyva: false,
      eppenItt: false,
      tenylegesIdo: null,
      tenylegesTavozas: null,
      bizonytalanFelismeres: false,
      ablakKezdet,
      keszForras: null,
      keszBy: null,
    };
  });
}

/** Ennél nagyobb sebesség (km/h) számít mozgásnak. */
const MOZGAS_SEBESSEG_KMH = 3;

/**
 * Mozog-e a jármű az élő pozíció szerint. Csak a sebesség számít, a járó
 * motor NEM: a rakodón járó motorral (hűtés, hidraulika) álló kamiont a
 * korábbi "motor jár VAGY sebesség > 0" szabály vezetésnek vette, ezért az
 * utolsó szakasz élő vezetéssé vált állás helyett, és az "Itt van most"
 * nem jelent meg, amíg a motor járt.
 */
export function mozogE(pozicio: Pick<EcofleetPosition, "speed">): boolean {
  return pozicio.speed > MOZGAS_SEBESSEG_KMH;
}
