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
// 1. A GPS-érintések naplója (fuvar_megallok.gps_erkezes/gps_tavozas). (2026-10-06)
//    korábban csak akkor íródott, ha valaki megnyitotta a GPS lapot — most
//    az 5 perces kör írja, nézőtől függetlenül.
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
import { resolveJarmu } from "./vehicles";
import { getJarmuvek } from "./jarmuvek-db";
import { getSajatFuvarokErinteshez, jelolTeljesitveGpsAlapjan } from "./megbizasok";
import { cimSugarKm, epitsIdovonal, fuvarKeszGpsSzerint, haversineKm, jelolMegallokat, kiegesziteloAllapottal, megalloJeloltjei } from "./idovonal";
import { epitsErintesMegallokat, mozogE } from "./erintes-felismeres";
import { rogzitGpsErinteseket } from "./megallo-naplo";
import { betoltEloElozmenyt, getEloElozmeny, rogzitEloMegfigyelest } from "./elo-elozmeny";
import { budapestFalioraToInstant, budapestNapISO, formatBudapestFaliora } from "./idozona";
import type { IdovonalSzakasz, TervezettCim, TervezettMegallo } from "./idovonal";
import { figyelendo } from "./figyeles-dontes";
import { maszkoltUzenet } from "@/lib/ecofleet/kliens";
import { query } from "@/lib/db";

/** Ennyi nappal visszamenőleg vesszük figyelembe a lerakandó fuvarokat és a trip-előzményt. */
const VISSZATEKINTES_NAP = 3;

export type TeljesitesFigyelesEredmeny = {
  vizsgalt: number;
  automatikusanTeljesitve: number;
  hibak: string[];
};

/** Valódi, maszkolt hibaszöveg (a kulcs és az URL nem kerülhet a naplóba / az életjelbe). */
function hibaSzoveg(err: unknown): string {
  return maszkoltUzenet(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
}

/** Mely fuvaroknak van olyan megállója, ahol a GPS érkezést látott, de távozást még nem. */
async function nyitottTavozasuFuvarok(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const sorok = await query<{ id: string }>(
    `select distinct megbizas_id::text as id from fuvar_megallok
      where megbizas_id = any($1::bigint[]) and gps_erkezes is not null and gps_tavozas is null`,
    [ids]
  );
  return new Set(sorok.map((r) => r.id));
}

/**
 * A figyelő életjele (rendszer_eletjel, 043): a Rendszer lap ebből látja,
 * fut-e a kör. Soha nem dob — ha a tábla még nincs meg (migráció előtt),
 * csak naplóz.
 */
export async function rogzitEletjelet(eredmeny: TeljesitesFigyelesEredmeny): Promise<void> {
  try {
    await query(
      `insert into rendszer_eletjel (kulcs, utolso_kor, adat) values ('teljesites-figyeles', now(), $1::jsonb)
       on conflict (kulcs) do update set utolso_kor = excluded.utolso_kor, adat = excluded.adat`,
      [JSON.stringify({
        vizsgalt: eredmeny.vizsgalt,
        hibak: eredmeny.hibak.length,
        teljesitve: eredmeny.automatikusanTeljesitve,
        elso_hiba: eredmeny.hibak[0] ?? null,
      })]
    );
  } catch (err) {
    console.error("[teljesites-figyeles] életjel írása sikertelen:", hibaSzoveg(err));
  }
}

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

/**
 * Egy nem érintett megálló ELVETETT jelöltjei az okkal (messze: X km / az
 * ablakon kívül / túl rövid / másik megálló vitte) — legfeljebb 3, a
 * legközelebbiek. A #293 debreceni és a #300 nyírjákói esetében (2026-10-06)
 * csak annyi látszott, hogy "nincs érintés"; ebből a naplóból kiderül,
 * melyik állást miért nem fogadta el a felismerés.
 */
function elvetettJeloltekNaplo(m: TervezettMegallo, szakaszok: IdovonalSzakasz[]): string {
  const jeloltek = megalloJeloltjei(m, szakaszok)
    .sort((a, b) => a.tavKm - b.tavKm)
    .slice(0, 3);
  if (jeloltek.length === 0) return "";
  return `; jelöltek: ${jeloltek
    .map((j) => {
      const mi = `${ido(j.kezdet)}–${ido(j.veg)} ${Math.round(j.idotartamSec / 60)}p${j.szint === "varos" ? " város" : ""}`;
      return `${mi} → ${j.dontes.elfogadva ? `másik megálló vitte (${j.tavKm.toFixed(1)} km)` : `${j.dontes.ok}: ${j.dontes.reszlet}`}`;
    })
    .join("; ")}`;
}

/** Egy megálló állapota egy sorban a naplóhoz: szerep, város, geokódolás, érkezés/távozás vagy "nincs érintés" (+ a legközelebbi állás). */
function megalloNaplo(m: TervezettMegallo, szakaszok: IdovonalSzakasz[]): string {
  const szerep = m.tipus === "felrako" ? "Fel" : "Le";
  const geo =
    m.lat == null || m.lon == null
      ? "geo ✗"
      : `${m.pontossag === "pontos" ? "geo ✓" : `geo ~${m.pontossag}`}${m.geoCimke ? ` "${m.geoCimke}"` : ""} ${m.lat.toFixed(4)},${m.lon.toFixed(4)}`;
  const varosSzint = m.varosSzintuEgyezes ? " (város szintű egyezés)" : "";
  const allapot = m.elhagyva
    ? `érk ${ido(m.tenylegesIdo)} táv ${ido(m.tenylegesTavozas)}${varosSzint}`
    : m.eppenItt
      ? `érk ${ido(m.tenylegesIdo)}, itt áll${varosSzint}`
      : `nincs érintés (ablak ${ido(m.ablakKezdet)}-tól${legkozelebbiAllasNaplo(m, szakaszok)}${elvetettJeloltekNaplo(m, szakaszok)})`;
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

  await betoltEloElozmenyt();
  let eloPoziciok: EcofleetPosition[];
  try {
    eloPoziciok = await getFleetLastPositions();
  } catch (err) {
    eredmeny.hibak.push(
      `Élő GPS-pozíciók lekérése sikertelen: ${err instanceof EcofleetError ? err.message : hibaSzoveg(err)}`
    );
    eloPoziciok = [];
  }

  // A < 24 órája lezárt fuvar is figyelt marad, ha valamelyik megállójáról
  // még nincs GPS-távozás (a sofőr „Indulok”-ja / a kézi zárás megelőzheti a
  // tényleges elindulást) — lásd figyeles-dontes.ts.
  const nyitottTavozas = await nyitottTavozasuFuvarok(sorok.filter((s) => s.teljesitve && !s.szamlas).map((s) => s.id));
  const figyelt = (s: (typeof sorok)[number]) => {
    const lezarvaMs = s.teljesitve && s.teljesitve_at ? Date.parse(s.teljesitve_at) : NaN;
    return figyelendo({
      nyitott: !s.teljesitve && !s.szamlas,
      lezarvaOraja: Number.isNaN(lezarvaMs) ? null : Math.max(0, (most.getTime() - lezarvaMs) / 3_600_000),
      vanNyitottTavozas: nyitottTavozas.has(s.id),
      szamlazva: s.szamlas,
    });
  };

  const jarmuLista = await getJarmuvek();
  for (const jarmu of jarmuLista) {
    if (!jarmu.ecofleetObjectId) continue; // nincs GPS-kötés ehhez a járműhöz
    const sajat = sorok.filter((s) => resolveJarmu(s.jarmu, jarmuLista) === jarmu);
    if (sajat.length === 0) continue;
    // Figyelt: nyitott (még nem Teljesítve és nincs számlázva — a lerakási
    // nap múlása nem zárja ki: a csúszó fuvar, pl. a #130, is lezárandó, ha a
    // GPS szerint kész), vagy < 24 órája lezárt, nyitott távozással. A
    // lezárást továbbra is csak a nyitottak kaphatják (lent).
    const figyeltek = sajat.filter(figyelt);
    eredmeny.vizsgalt += figyeltek.length;
    if (figyeltek.length === 0) continue; // csak naplózni nem érdemes külső hívásokat indítani

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
      const utolsoLezart = szakaszok[szakaszok.length - 1];
      if (elo && eloIdo) {
        const megfigyeles = { lat: elo.latitude, lon: elo.longitude, mozog: mozogE(elo), idobelyeg: eloIdo };
        const elozmeny = getEloElozmeny(jarmu.ecofleetObjectId);
        rogzitEloMegfigyelest(jarmu.ecofleetObjectId, megfigyeles);
        szakaszok = kiegesziteloAllapottal(szakaszok, { ...megfigyeles, cim: null }, most, tervezettCimek, elozmeny);
      }
      // A jármű élő helyzete és a nyomvonal vége a naplóba — látszik, ha a
      // kocsi áll valahol, de az Ecofleet még nem zárta le az odavezető tripet.
      const utolso = szakaszok[szakaszok.length - 1];
      console.log(
        `[teljesites-figyeles] ${jarmu.sofor} élő: ${
          elo && eloIdo ? `${elo.latitude.toFixed(4)},${elo.longitude.toFixed(4)} ${elo.speed} km/h, jel ${ido(eloIdo)}` : "nincs"
        }; utolsó lezárt szakasz: ${
          utolsoLezart ? `${utolsoLezart.tipus} ${ido(utolsoLezart.tipus === "indulas" ? utolsoLezart.idopont : utolsoLezart.veg)}-ig` : "nincs"
        }; nyomvonal vége: ${utolso ? `${utolso.tipus}${utolso.tipus !== "indulas" && utolso.elo ? " (élő)" : ""}` : "üres"}`
      );

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

      // Egy körben kocsinként legfeljebb EGY fuvar zárul le, a párosítási
      // sorrend (parositasiSorrend) szerinti első kész — a következő a
      // következő körben (5 perc múlva), ha addig is kész. Két egymás utáni
      // fuvar egyszerre lezárása eddig a hibás párosítás jele volt.
      let lezartEbbenAKorben = false;
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
        if (lezartEbbenAKorben) {
          console.log(`[teljesites-figyeles] ${jarmu.sofor} #${sor.id}: GPS szerint kész, de ebben a körben már zárult fuvar ennél a kocsinál — a következő körben.`);
          continue;
        }
        if (await jelolTeljesitveGpsAlapjan(sor.id)) {
          eredmeny.automatikusanTeljesitve++;
          lezartEbbenAKorben = true;
        }
      }
    } catch (err) {
      eredmeny.hibak.push(
        `${jarmu.sofor}: ${err instanceof EcofleetError ? err.message : hibaSzoveg(err)}`
      );
    }
  }

  return eredmeny;
}
