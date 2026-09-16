// GPS-alapú automatikus "Teljesítve" figyelés a "Bér fuvarok — folyamatban"
// listához, és a tényleges érkezés/távozás tartós naplózása.
//
// UGYANAZT a felismerést futtatja, amit a GPS lap mutat (lib/fuvarozas/
// erintes-felismeres.ts + idovonal.ts jelolMegallokat): állomásokra bontott,
// geokódolt, időablakos megállók; az Ecofleet trip-előzményből épített
// állás-szakaszok; kölcsönös párosítás (egy valós megállás egyetlen
// megállót igazol, a nap összes fuvarjára együtt); "elhagyva", ha a jármű az
// érintés után legalább 3 km-re továbbment. Egy fuvar akkor kész, ha MINDEN
// lerakóját elhagyta — ugyanaz a jelölő, amit a kézi "Kész" gomb is állít.
//
// Két hibát zár ez a közös út:
// 1. A GPS-érintések naplója (fuvar_megallo_allapot.gps_erkezes/gps_tavozas)
//    korábban csak akkor íródott, ha valaki megnyitotta a GPS lapot — most
//    a 15 perces kör írja, nézőtől függetlenül.
// 2. A figyelő és a lap más-más logikával döntött (a figyelő a lerakó mezőt
//    egyben geokódolta, több-lerakós fuvarnál rossz címmel), így ugyanarra a
//    fuvarra ellentmondó állapotot mutattak.
//
// A MÁR LEZÁRT fuvarok is részt vesznek a párosításban (getSajatFuvarokErinteshez):
// ők "foglalják" a saját valós megállásukat, különben ugyanaz az egy érkezés
// a következő körben egy másik, azonos lerakójú fuvart is lezárna (élesben:
// két Pápa → Debrecen Duvenbeck-megbízás, NMZ-492).

import { getFleetLastPositions, getVehicleTrips, parseEcofleetTimestamp, EcofleetError, type EcofleetPosition } from "./ecofleet";
import { SAJAT_JARMUVEK, resolveJarmu } from "./vehicles";
import { getSajatFuvarokErinteshez, setFuvarTeljesitve } from "./megbizasok";
import { epitsIdovonal, fuvarKeszGpsSzerint, jelolMegallokat, kiegesziteloAllapottal } from "./idovonal";
import { epitsErintesMegallokat, mozogE } from "./erintes-felismeres";
import { rogzitGpsErinteseket } from "./megallo-naplo";
import { budapestFalioraToInstant, budapestNapISO } from "./idozona";

/** Ennyi nappal visszamenőleg vesszük figyelembe a lerakandó fuvarokat és a trip-előzményt. */
const VISSZATEKINTES_NAP = 3;

export type TeljesitesFigyelesEredmeny = {
  vizsgalt: number;
  automatikusanTeljesitve: number;
  hibak: string[];
};

function napIsoEltolva(napISO: string, delta: number): string {
  const [ev, ho, nap] = napISO.split("-").map(Number);
  const d = new Date(Date.UTC(ev, ho - 1, nap + delta, 12));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Egy teljes ellenőrzési kör, járművenként: felismerés, érintés-napló,
 * és a GPS szerint kész, még folyamatban lévő fuvarok lezárása.
 */
export async function futtatTeljesitesFigyeles(): Promise<TeljesitesFigyelesEredmeny> {
  const eredmeny: TeljesitesFigyelesEredmeny = { vizsgalt: 0, automatikusanTeljesitve: 0, hibak: [] };
  const most = new Date();

  const sorok = await getSajatFuvarokErinteshez(napIsoEltolva(budapestNapISO(most), -VISSZATEKINTES_NAP));
  if (sorok.length === 0) return eredmeny;

  let eloPoziciok: EcofleetPosition[];
  try {
    eloPoziciok = await getFleetLastPositions();
  } catch (err) {
    eredmeny.hibak.push(
      `Élő GPS-pozíciók lekérése sikertelen: ${err instanceof EcofleetError ? err.message : "ismeretlen hiba"}`
    );
    eloPoziciok = [];
  }

  for (const jarmu of SAJAT_JARMUVEK) {
    if (!jarmu.ecofleetObjectId) continue; // nincs GPS-kötés ehhez a járműhöz
    const sajat = sorok.filter((s) => resolveJarmu(s.jarmu) === jarmu);
    if (sajat.length === 0) continue;
    const nyitottak = sajat.filter((s) => s.hely === "ber_folyamatban" && !s.teljesitve);
    eredmeny.vizsgalt += nyitottak.length;
    if (nyitottak.length === 0) continue; // csak naplózni nem érdemes külső hívásokat indítani

    try {
      const fuvarok = await Promise.all(sajat.map(async (sor) => ({ sor, megallok: await epitsErintesMegallokat(sor) })));
      const tervezettCimek = fuvarok.flatMap((f) =>
        f.megallok.filter((m) => m.lat != null && m.lon != null).map((m) => ({ lat: m.lat as number, lon: m.lon as number }))
      );

      // Trip-előzmény a legkorábbi érintett felrakás napjától (de legfeljebb
      // VISSZATEKINTES_NAP napra vissza) a jelen pillanatig.
      const legkorabbiNap = sajat.map((s) => s.datum).sort()[0];
      const [ev, ho, nap] = legkorabbiNap.split("-").map(Number);
      const also = new Date(most.getTime() - VISSZATEKINTES_NAP * 86400000);
      const kezdet = new Date(Math.max(budapestFalioraToInstant(ev, ho, nap, 0, 0, 0).getTime(), also.getTime()));
      const trips = await getVehicleTrips(jarmu.ecofleetObjectId, kezdet, most);
      let szakaszok = epitsIdovonal(trips, tervezettCimek);

      const elo = eloPoziciok.find((p) => p.objectId === jarmu.ecofleetObjectId);
      const eloIdo = elo ? parseEcofleetTimestamp(elo.timestamp) : null;
      if (elo && eloIdo) {
        szakaszok = kiegesziteloAllapottal(
          szakaszok,
          { lat: elo.latitude, lon: elo.longitude, cim: null, mozog: mozogE(elo), idobelyeg: eloIdo },
          most,
          tervezettCimek
        );
      }

      const jelolt = jelolMegallokat(
        fuvarok.map((f) => f.megallok),
        szakaszok
      );

      const erintesek = fuvarok.flatMap((f, i) =>
        jelolt[i]
          .filter((m) => m.tenylegesIdo !== null)
          .map((m) => ({ fuvarId: f.sor.id, index: m.index, erkezes: m.tenylegesIdo!, tavozas: m.tenylegesTavozas }))
      );
      await rogzitGpsErinteseket(erintesek).catch((err) => console.error("[megallo-naplo] felírás sikertelen:", err));

      for (let i = 0; i < fuvarok.length; i++) {
        const { sor } = fuvarok[i];
        if (sor.hely !== "ber_folyamatban" || sor.teljesitve) continue;
        if (!fuvarKeszGpsSzerint(jelolt[i])) continue;
        await setFuvarTeljesitve(sor.id, true);
        eredmeny.automatikusanTeljesitve++;
      }
    } catch (err) {
      eredmeny.hibak.push(
        `${jarmu.sofor}: ${err instanceof EcofleetError ? err.message : err instanceof Error ? err.message : "ismeretlen hiba"}`
      );
    }
  }

  return eredmeny;
}
