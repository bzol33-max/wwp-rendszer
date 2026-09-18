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
// A Bér fuvarok ÉS a Saját fuvarok fül tételei is részt vesznek (mindkét
// tipus, lásd getSajatFuvarokErinteshez) — a Saját fuvar a GPS szerinti kész
// állapottal Teljesítve lesz, és (postázási munkafolyamat híján) az Archívba
// kerül, ahogy a kézi "Kész" gomb is teszi.
//
// A MÁR LEZÁRT fuvarok is részt vesznek a párosításban (getSajatFuvarokErinteshez):
// ők "foglalják" a saját valós megállásukat, különben ugyanaz az egy érkezés
// a következő körben egy másik, azonos lerakójú fuvart is lezárna (élesben:
// két Pápa → Debrecen Duvenbeck-megbízás, NMZ-492).

import { getFleetLastPositions, getVehicleTrips, parseEcofleetTimestamp, EcofleetError, type EcofleetPosition } from "./ecofleet";
import { SAJAT_JARMUVEK, resolveJarmu } from "./vehicles";
import { getSajatFuvarokErinteshez, setFuvarTeljesitve } from "./megbizasok";
import { cimSugarKm, epitsIdovonal, fuvarKeszGpsSzerint, haversineKm, jelolMegallokat, kiegesziteloAllapottal } from "./idovonal";
import { epitsErintesMegallokat, mozogE } from "./erintes-felismeres";
import { rogzitGpsErinteseket } from "./megallo-naplo";
import { budapestFalioraToInstant, budapestNapISO, formatBudapestFaliora } from "./idozona";
import type { IdovonalSzakasz, TervezettCim, TervezettMegallo } from "./idovonal";

/** Ennyi nappal visszamenőleg vesszük figyelembe a lerakandó fuvarokat és a trip-előzményt. */
const VISSZATEKINTES_NAP = 3;

export type TeljesitesFigyelesEredmeny = {
  vizsgalt: number;
  automatikusanTeljesitve: number;
  hibak: string[];
};

const ido = (d: Date | null) => (d ? formatBudapestFaliora(d).slice(5, 16) : "-");

/**
 * Egy nem érintett megállóhoz a nyomvonal LEGKÖZELEBBI állása (távolság,
 * idő, hossz, Ecofleet-cím) — ebből a Railway-naplóban látszik, MIÉRT nincs
 * érintés: a kocsi 3 km-re állt a geokódolt ponttól (a cím a falu közepe,
 * a rakodó a szélén), vagy rossz helyre geokódolódott a cím, vagy tényleg
 * nem járt arra. Enélkül csak annyi látszott, hogy "nincs érintés", és a
 * GPS-adathoz nem lehetett hozzáférni a kivizsgáláshoz.
 */
function legkozelebbiAllasNaplo(m: TervezettMegallo, szakaszok: IdovonalSzakasz[]): string {
  if (m.lat == null || m.lon == null) return "";
  const { lat, lon } = m;
  let legjobb: { tav: number; a: Extract<IdovonalSzakasz, { tipus: "allas" }> } | null = null;
  for (const sz of szakaszok) {
    if (sz.tipus !== "allas" || sz.idotartamSec < 5 * 60) continue;
    if (m.ablakKezdet && sz.veg.getTime() < m.ablakKezdet.getTime()) continue;
    const tav = haversineKm(lat, lon, sz.lat, sz.lon);
    if (!legjobb || tav < legjobb.tav) legjobb = { tav, a: sz };
  }
  if (!legjobb) return ", az ablak óta nincs 5 percnél hosszabb állás";
  const { tav, a } = legjobb;
  return `, legközelebbi állás ${tav.toFixed(1)} km (${ido(a.kezdet)}–${ido(a.veg)}, ${Math.round(a.idotartamSec / 60)} perc${a.cim ? `, ${a.cim}` : ""}), kör ${cimSugarKm(m.pontossag)} km`;
}

/** Egy megálló állapota egy sorban a naplóhoz: szerep, város, geokódolás, érkezés/távozás vagy "nincs érintés" (+ a legközelebbi állás). */
function megalloNaplo(m: TervezettMegallo, szakaszok: IdovonalSzakasz[]): string {
  const szerep = m.tipus === "felrako" ? "Fel" : "Le";
  const geo =
    m.lat == null || m.lon == null
      ? "geo ✗"
      : `${m.pontossag === "pontos" ? "geo ✓" : `geo ~${m.pontossag}`}${m.geoCimke ? ` "${m.geoCimke}"` : ""} ${m.lat.toFixed(4)},${m.lon.toFixed(4)}`;
  const allapot = m.elhagyva
    ? `érk ${ido(m.tenylegesIdo)} táv ${ido(m.tenylegesTavozas)}`
    : m.eppenItt
      ? `érk ${ido(m.tenylegesIdo)}, itt áll`
      : `nincs érintés (ablak ${ido(m.ablakKezdet)}-tól${legkozelebbiAllasNaplo(m, szakaszok)})`;
  return `${szerep} ${m.cim || m.nyersCim.slice(0, 30)} [${geo}] ${allapot}`;
}

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
    // Nyitott: még nem Teljesítve és nincs számlázva — a lerakási nap múlása
    // (a Megbízások fülön Számla/Posta) nem zárja ki: a csúszó fuvar (a #130
    // egy nappal a tervezett után ért Debrecenbe) is lezárandó, ha a GPS
    // szerint kész.
    const nyitottak = sajat.filter((s) => !s.teljesitve && !s.szamlas);
    eredmeny.vizsgalt += nyitottak.length;
    if (nyitottak.length === 0) continue; // csak naplózni nem érdemes külső hívásokat indítani

    try {
      const fuvarok = await Promise.all(sajat.map(async (sor) => ({ sor, megallok: await epitsErintesMegallokat(sor) })));
      const tervezettCimek: TervezettCim[] = fuvarok.flatMap((f) =>
        f.megallok
          .filter((m) => m.lat != null && m.lon != null)
          .map((m) => ({ lat: m.lat as number, lon: m.lon as number, sugarKm: cimSugarKm(m.pontossag) }))
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
        if (sor.teljesitve || sor.szamlas) continue;
        const kesz = fuvarKeszGpsSzerint(jelolt[i]);
        // Körönkénti diagnosztika a nyitott fuvarokra — a Railway-naplóból
        // látszik, melyik megálló miért (nem) számít érintettnek.
        console.log(
          `[teljesites-figyeles] ${jarmu.sofor} #${sor.id}${sor.tipus === "ber" ? " (saját)" : ""}${kesz ? " → TELJESÍTVE" : ""}: ${jelolt[i]
            .map((m) => megalloNaplo(m, szakaszok))
            .join(" | ")}`
        );
        if (!kesz) continue;
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
