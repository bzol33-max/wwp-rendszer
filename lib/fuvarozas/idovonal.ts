// Napi jármű-idővonal felépítése valós Ecofleet GPS trip-előzményből.
//
// Az Ecofleet Vehicles/getTrips végpontja a napot már "trip"-ekre bontva adja
// vissza (indulás/érkezés cím+koordináta, táv, időtartam), és minden trip
// után megkapjuk, hogy utána mennyi ideig ("stoppedAfter") állt a jármű a
// következő indulásig. Ez a modul ebből építi fel a megjelenítendő
// idővonalat: VEZETÉS és ÁLLÁS szakaszokra bontva, és — mivel egy telephelyi
// megállás gyakran több apró, néhány száz méteres mozgásra esik szét
// (portai bejelentkezés, belső/külső parkoló, rámpához állás, majd újra
// parkoló) — az egymáshoz közeli (< OSSZEVONAS_KM) apró mozgásokat egyetlen
// összevont állás-szakasszá vonja össze, hogy a valós rakodási/lerakodási
// idő ne aprózódjon szét several kis blokkra.
//
// NEM "use server" fájl — tiszta, szinkron függvények, bárhonnan hívhatók.

import type { EcofleetTrip } from "./ecofleet";
import { parseEcofleetTimestamp } from "./ecofleet";
import type { FuvarTipus } from "./fuvar-constants";
import type { CimPontossag } from "./varos";

/** Két koordináta közti távolság km-ben (haversine). */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Ennél közelebbi (km) apró mozgásokat egy állás-szakaszként kezelünk (porta, parkoló, rámpa). */
const OSSZEVONAS_KM = 1.5;

export type AllasKategoria = "rovid" | "rakodas" | "piheno";

/**
 * Ennél közelebb (km) tekintjük úgy, hogy a jármű egy tervezett fel-/lerakó
 * CÍMNÉL van. Szándékosan nagyobb, mint amilyen pontos egy geokódolt cím:
 * egy telephelyen a kamion a portától a külső parkolón át a rámpáig több
 * száz métert, nagyobb ipari parkban akár egy-két kilométert is mozog
 * (lásd OSSZEVONAS_KM), és a megbízáson szereplő cím is gyakran csak a cég
 * székhelye, nem a konkrét kapu. Ennél szűkebb sugárral a rendszer
 * rendszeresen NEM ismerné fel a ténylegesen megtörtént rakodást.
 */
const CIM_TAVOLSAG_KM = 2;

/**
 * Becslés arra, hogy egy állás inkább rövid megállás, rakodás/ügyintézés,
 * vagy (napi/heti) pihenő volt-e. Elsősorban helyalapú: ha az állás
 * CIM_TAVOLSAG_KM-en belül van a nap tervezett fuvarjainak geokódolt
 * fel-/lerakó címéhez, biztosan rakodás/ügyintézés, függetlenül attól, meddig
 * tartott. Enélkül tisztán időtartam-alapú heurisztika. Tájékoztató jellegű.
 */
function allasKategoria(durationSec: number, lat: number, lon: number, tervezettCimek: { lat: number; lon: number }[]): AllasKategoria {
  if (tervezettCimek.some((c) => haversineKm(lat, lon, c.lat, c.lon) < CIM_TAVOLSAG_KM)) return "rakodas";
  if (durationSec >= 6 * 3600) return "piheno";
  if (durationSec >= 15 * 60) return "rakodas";
  return "rovid";
}

export type IdovonalSzakasz =
  | {
      tipus: "indulas";
      idopont: Date;
      cim: string | null;
      lat: number;
      lon: number;
    }
  | {
      tipus: "vezetes";
      kezdet: Date;
      veg: Date;
      tavKm: number;
      idotartamSec: number;
      atlagSebesseg: number;
      honnan: string | null;
      hova: string | null;
      hovaLat: number;
      hovaLon: number;
      /** Igaz, ha ez egy még folyamatban lévő, az Ecofleet által még le nem zárt (ezért csak élő GPS-pozícióból becsült) szakasz. */
      elo?: boolean;
    }
  | {
      tipus: "allas";
      kezdet: Date;
      veg: Date;
      idotartamSec: number;
      cim: string | null;
      lat: number;
      lon: number;
      kategoria: AllasKategoria;
      /** Hány trip-nyi apró mozgás lett összevonva ebbe az egy állás-blokkba. */
      osszevontLepesek: number;
      /** Igaz, ha ez a szakasz az élő GPS-pozíció alapján lett a jelen pillanatig meghosszabbítva (az Ecofleet trip-adata még nem tart eddig). */
      elo?: boolean;
    };

/**
 * Egy jármű egy napi (vagy tetszőleges) trip-listájából felépíti a
 * megjelenítendő idővonal-szakaszokat, időrendben.
 *
 * `tervezettCimek`: a nap tervezett saját fuvarjainak geokódolt fel-/lerakó
 * koordinátái (lásd allasKategoria) — csak a helyalapú állás-kategorizáláshoz
 * kell, a szakaszok felépítését nem befolyásolja.
 */
export function epitsIdovonal(trips: EcofleetTrip[], tervezettCimek: { lat: number; lon: number }[] = []): IdovonalSzakasz[] {
  const rendezett = [...trips]
    .filter((t) => parseEcofleetTimestamp(t.startTimestamp) && parseEcofleetTimestamp(t.endTimestamp))
    .sort((a, b) => parseEcofleetTimestamp(a.startTimestamp)!.getTime() - parseEcofleetTimestamp(b.startTimestamp)!.getTime());

  if (rendezett.length === 0) return [];

  const szakaszok: IdovonalSzakasz[] = [];
  const elso = rendezett[0];
  szakaszok.push({
    tipus: "indulas",
    idopont: parseEcofleetTimestamp(elso.startTimestamp)!,
    cim: elso.startLocation,
    lat: elso.startLatitude,
    lon: elso.startLongitude,
  });

  let i = 0;
  while (i < rendezett.length) {
    const trip = rendezett[i];
    const kezdet = parseEcofleetTimestamp(trip.startTimestamp)!;
    const veg = parseEcofleetTimestamp(trip.endTimestamp)!;
    szakaszok.push({
      tipus: "vezetes",
      kezdet,
      veg,
      tavKm: trip.distance,
      idotartamSec: trip.duration,
      atlagSebesseg: trip.avgSpeed,
      honnan: trip.startLocation,
      hova: trip.endLocation,
      hovaLat: trip.endLatitude,
      hovaLon: trip.endLongitude,
    });

    // Állás e trip után — és amíg a következő trip(ek) csak apró, helyben
    // maradó mozgások, összevonjuk egyetlen állás-blokká.
    let stopSzek = trip.stoppedAfter;
    const stopKezdet = veg;
    let stopLat = trip.endLatitude;
    let stopLon = trip.endLongitude;
    let stopCim = trip.endLocation;
    let osszevontLepesek = 0;
    let j = i + 1;

    while (
      j < rendezett.length &&
      haversineKm(stopLat, stopLon, rendezett[j].endLatitude, rendezett[j].endLongitude) < OSSZEVONAS_KM &&
      rendezett[j].distance < OSSZEVONAS_KM
    ) {
      stopSzek += rendezett[j].duration + rendezett[j].stoppedAfter;
      stopLat = rendezett[j].endLatitude;
      stopLon = rendezett[j].endLongitude;
      stopCim = rendezett[j].endLocation ?? stopCim;
      osszevontLepesek++;
      j++;
    }

    if (stopSzek > 0) {
      const stopVeg = new Date(stopKezdet.getTime() + stopSzek * 1000);
      szakaszok.push({
        tipus: "allas",
        kezdet: stopKezdet,
        veg: stopVeg,
        idotartamSec: stopSzek,
        cim: stopCim,
        lat: stopLat,
        lon: stopLon,
        kategoria: allasKategoria(stopSzek, stopLat, stopLon, tervezettCimek),
        osszevontLepesek,
      });
    }

    i = j;
  }

  return szakaszok;
}

/** Egy nap teljes vezetési ideje másodpercben. */
export function napiVezetettIdoSec(szakaszok: IdovonalSzakasz[]): number {
  return szakaszok
    .filter((sz): sz is Extract<IdovonalSzakasz, { tipus: "vezetes" }> => sz.tipus === "vezetes")
    .reduce((sum, sz) => sum + sz.idotartamSec, 0);
}

/** Egy nap teljes megtett távja km-ben. */
export function napiTavKm(szakaszok: IdovonalSzakasz[]): number {
  return szakaszok
    .filter((sz): sz is Extract<IdovonalSzakasz, { tipus: "vezetes" }> => sz.tipus === "vezetes")
    .reduce((sum, sz) => sum + sz.tavKm, 0);
}

/**
 * Egy saját fuvar (megbízás) becsült elhelyezése az idővonalon — a valós
 * GPS-adattól függetlenül, a megbízás adataiból (időpont, felrakó/lerakó
 * cím, becsült menetidő + rakodási/lerakodási puffer) számolva. A
 * `lib/fuvarozas/actions.ts`-ben épül fel, mert a menetidő-becsléshez
 * hálózati hívás (geokódolás + útvonaltervezés) kell.
 */
export type TervezettFuvarSzakasz = {
  id: string;
  /** A megbízás DB-beli `tipus` mezője — FIGYELEM: a felület a két értéket történelmi okokból fordítva címkézi ("sajat" → "Bér fuvar", "ber" → "Saját fuvar"), lásd megbizasok.ts. */
  fuvarTipus: FuvarTipus;
  megrendelo: string | null;
  pozicioszam: string | null;
  honnan: string | null;
  hova: string;
  /**
   * A felrakó + az összes lerakó állomás, útvonal-sorrendben (előbb a
   * felrakó, utána a lerakó(k) — több-megállós mezőnél állomásonként, lásd
   * bontsMegallokra a varos.ts-ben). A dot-jelölőkhöz és az "elhagyva"
   * (kész) jelöléshez kell (lásd jelolMegallokElhagyottkent).
   */
  megallok: TervezettMegallo[];
  /** Becsült felrakás-kezdés időpontja. */
  kezdet: Date;
  /** Becsült lerakás-befejezés időpontja. */
  veg: Date;
  /** Igaz, ha a megbízáson nem volt megadva időpont, ezért a kezdés csak durva alapértelmezés (reggel 7). */
  idoBizonytalan: boolean;
  /** Igaz, ha a menetidőt nem sikerült kiszámolni (cím hiányzik/nem geokódolható), ezért egy átalány (2 óra) szerepel. */
  utvonalBizonytalan: boolean;
};

/** Egy tervezett fuvar egyetlen fel- vagy lerakó állomása, az idővonalon egy kis ponttal jelölve. */
export type TervezettMegallo = {
  /**
   * A megálló sorszáma a fuvar teljes állomás-sorrendjében (0 = az első
   * felrakó, utána a lerakók) — UGYANAZ az indexelés, amit a sofőr kézi
   * jelölése is használ (fuvar_megallo_allapot.megallo_index, lásd
   * lib/fuvarozas/sofor.ts). Mindkét oldal a bontsMegallokra(felrako) +
   * bontsMegallokra(lerako) sorrendből származik, ezért a két nyilvántartás
   * (kézi megerősítés és GPS-érintés) ugyanarra a sorra írható.
   */
  index: number;
  tipus: "felrako" | "lerako";
  /** Rövid, csak városnév alapú címke (lásd varosNev a varos.ts-ben). */
  cim: string;
  /** A megálló teljes, nyers címszövege — akkor kell, ha egy fuvaron belül két megálló ugyanabban a városban van, és a puszta városnév nem különbözteti meg őket. */
  nyersCim: string;
  /** Mennyire pontosan azonosítható a cím (lásd cimPontossaga a varos.ts-ben) — ettől függ, mennyire bízhatunk a GPS-alapú felismerésben. */
  pontossag: CimPontossag;
  lat: number | null;
  lon: number | null;
  /**
   * Becsült időpont — kezdetben a statikus formula alapján (a szülő fuvar
   * kezdet/veg mezőjéből), a mai napon, élő pozíció esetén viszont az
   * actions.ts láncba fűzi (előző, még el nem hagyott megállótól az élő
   * pozíción át számolva), hogy a valós haladást tükrözze, ne csak a
   * tervezett menetrendet.
   */
  idopont: Date;
  /** Igaz, ha a valós GPS-nyomvonal szerint a jármű már járt itt, és azóta tovább is ment — lásd jelolMegallokElhagyottkent. */
  elhagyva: boolean;
  /** Igaz, ha a jármű a GPS szerint MOST is itt áll (megérkezett, de még nem indult tovább) — lásd jelolMegallokElhagyottkent. */
  eppenItt: boolean;
  /** Ha a jármű járt itt, a tényleges (GPS szerinti) MEGÉRKEZÉS ideje — ide kerül a pont az idővonalon. */
  tenylegesIdo: Date | null;
  /** Ha a jármű már tovább is ment, a tényleges (GPS szerinti) TOVÁBBINDULÁS ideje. Amíg itt áll, null. */
  tenylegesTavozas: Date | null;
  /**
   * Igaz, ha a felismerés csak valószínűsítés, nem bizonyosság — mert a cím
   * csak városnév szintjén ismert, így a koordináta a városközépre mutat, és
   * a közelben történt megállás nem feltétlenül EZ a rakodás volt.
   */
  bizonytalanFelismeres: boolean;
  /**
   * Ettől a pillanattól számít érkezésnek, ha a jármű a cím közelében állt:
   * a megbízás időablakának kezdete (Duvenbeck: PV/PB), különben a felrakás
   * (felrakónál) vagy a lerakás (lerakónál) napjának kezdete. Az ablak ELŐTT
   * véget ért állás nem ehhez a megállóhoz tartozik — az oda-vissza ingázó
   * kocsinál a második fuvar felrakója az első fuvar lerakója, és enélkül a
   * lerakás egy nappal a tényleges lerakás előtt "késznek" látszott.
   */
  ablakKezdet: Date | null;
  /** Honnan tudjuk, hogy a megálló kész: GPS-felismerés, vagy kézi jelölés (sofőr a mobilon, vagy iroda a GPS lapon / a fuvar Teljesítve gombja). */
  keszForras: "gps" | "kezi" | null;
  /** Kézi jelölésnél a jelölő neve (fuvar_megallo_allapot.kesz_by), ha ismert. */
  keszBy: string | null;
};

export type EloPozicio = {
  lat: number;
  lon: number;
  cim: string | null;
  /** Igaz, ha a jármű az utolsó ismert adat szerint jár a motorja vagy mozog. */
  mozog: boolean;
  idobelyeg: Date;
};

/**
 * Az Ecofleet Vehicles/getTrips csak a MÁR LEZÁRULT trip-eket adja vissza —
 * egy éppen folyamatban lévő fuvar (vagy egy még véget nem ért állás) tehát
 * nem jelenik meg benne, amíg be nem fejeződik. Emiatt egy ténylegesen most
 * úton lévő kamion idővonalán üres/hiányzó rész látszódna a nap végéig. Ez a
 * függvény az élő GPS-pozíció (Vehicles/getLastData) alapján egészíti ki a
 * lezárt szakaszokat a jelen pillanatig: ha a jármű mozog (vagy már messze
 * jár az utolsó ismert megállási helytől), egy "élő" vezetés-szakaszt told
 * hozzá; ha áll és közel van, az utolsó állás-szakaszt hosszabbítja meg a
 * jelenig.
 *
 * `tervezettCimek`: lásd epitsIdovonal — ugyanaz a lista, a most meghosszabbított/újonnan létrehozott élő állás-szakasz kategorizálásához.
 */
export function kiegesziteloAllapottal(
  szakaszok: IdovonalSzakasz[],
  elo: EloPozicio | null,
  most: Date,
  tervezettCimek: { lat: number; lon: number }[] = []
): IdovonalSzakasz[] {
  if (!elo || szakaszok.length === 0) return szakaszok;

  const utolso = szakaszok[szakaszok.length - 1];
  const utolsoVeg = utolso.tipus === "indulas" ? utolso.idopont : utolso.veg;

  // Ha az élő pozíció adata régebbi, mint az utolsó lezárt szakasz vége, nincs mit kiegészíteni.
  if (elo.idobelyeg.getTime() <= utolsoVeg.getTime()) return szakaszok;

  const utolsoHely =
    utolso.tipus === "vezetes"
      ? { lat: utolso.hovaLat, lon: utolso.hovaLon, cim: utolso.hova }
      : { lat: utolso.lat, lon: utolso.lon, cim: utolso.cim };

  const tavolsagKm = haversineKm(utolsoHely.lat, utolsoHely.lon, elo.lat, elo.lon);
  const folyamatbanVezet = elo.mozog || tavolsagKm >= OSSZEVONAS_KM;

  if (folyamatbanVezet) {
    const uj: IdovonalSzakasz = {
      tipus: "vezetes",
      kezdet: utolsoVeg,
      veg: most,
      tavKm: tavolsagKm,
      idotartamSec: Math.max(0, (most.getTime() - utolsoVeg.getTime()) / 1000),
      atlagSebesseg: 0,
      honnan: utolsoHely.cim,
      hova: elo.cim,
      hovaLat: elo.lat,
      hovaLon: elo.lon,
      elo: true,
    };
    return [...szakaszok, uj];
  }

  if (utolso.tipus === "allas") {
    const kiegeszitett = [...szakaszok];
    kiegeszitett[kiegeszitett.length - 1] = {
      ...utolso,
      veg: most,
      idotartamSec: Math.max(0, (most.getTime() - utolso.kezdet.getTime()) / 1000),
      elo: true,
    };
    return kiegeszitett;
  }

  // Az utolsó lezárt szakasz vezetés volt, a jármű azóta (még le nem zárt
  // trip formájában) megállt a végpontján — ezt egy új, élő állás-szakasszal jelezzük.
  const idotartamSec = Math.max(0, (most.getTime() - utolsoVeg.getTime()) / 1000);
  const ujAllas: IdovonalSzakasz = {
    tipus: "allas",
    kezdet: utolsoVeg,
    veg: most,
    idotartamSec,
    cim: utolsoHely.cim,
    lat: utolsoHely.lat,
    lon: utolsoHely.lon,
    kategoria: allasKategoria(idotartamSec, utolsoHely.lat, utolsoHely.lon, tervezettCimek),
    osszevontLepesek: 0,
    elo: true,
  };
  return [...szakaszok, ujAllas];
}

/** Szabad szöveges időpont-mezőből ("06:00", "de. 6", stb.) kiolvasott óra:perc, ha felismerhető. */
export function parseIdopontSzoveg(text: string | null): { ora: number; perc: number } | null {
  if (!text) return null;
  const m = text.match(/(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  const ora = Number(m[1]);
  const perc = Number(m[2]);
  if (ora > 23 || perc > 59) return null;
  return { ora, perc };
}

/**
 * A valós (GPS-alapú) idővonal-szakaszokból egy időrendi ponthalmazt épít —
 * minden szakasz egyetlen reprezentatív hely+idő párral: indulásnál a
 * kezdőpont, vezetésnél az ÉRKEZÉS helye/ideje, álláson az ONNAN VALÓ
 * TOVÁBBINDULÁS ideje. Ez adja az alapot annak eldöntéséhez, hogy egy
 * tervezett fel-/lerakó pontot a jármű ténylegesen érintett-e, és mikor
 * ment tovább onnan — lásd jelolMegallokElhagyottkent.
 */
export function idovonalPontjai(szakaszok: IdovonalSzakasz[]): { lat: number; lon: number; at: number }[] {
  return szakaszok.map((sz) => {
    if (sz.tipus === "indulas") return { lat: sz.lat, lon: sz.lon, at: sz.idopont.getTime() };
    if (sz.tipus === "vezetes") return { lat: sz.hovaLat, lon: sz.hovaLon, at: sz.veg.getTime() };
    return { lat: sz.lat, lon: sz.lon, at: sz.veg.getTime() };
  });
}

/**
 * Ennyit (km) kell a járműnek egy érintett cím UTÁN ténylegesen távolodnia
 * ahhoz, hogy a megállót elhagyottnak (késznek) vegyük.
 *
 * Ez a küszöb önmagában egy valódi hibát javít: korábban elég volt, hogy a
 * cím közeli érintése után legyen BÁRMILYEN későbbi nyomvonal-pont. Egy
 * telephelyen viszont a rakodás közben is folyamatosan keletkeznek ilyenek
 * (portáról a parkolóba, parkolóból a rámpához) — a rendszer tehát már a
 * rakodás kezdetén késznek jelölte a megállót, holott a kamion még ott állt.
 * Azt akarjuk látni, hogy a jármű valóban elindult a következő cél felé,
 * nem azt, hogy a telepen belül arrébb gurult.
 */
const TOVABBHALADAS_TAVOLSAG_KM = 3;

/**
 * Ennél rövidebb állás nem számít fel-/lerakásnak — pusztán áthaladás
 * (lámpa, körforgalom, sorompó, egy cím melletti elhajtás). Rakodásnak
 * kategorizált állásnál (az a helyhez kötött, lásd allasKategoria) ez a
 * feltétel nem érvényes.
 */
const ERINTES_MIN_IDOTARTAM_SEC = 10 * 60;

/**
 * Ha az állás ennél közelebb (km) van a címhez, a rövid időtartam sem zárja
 * ki (a kapu előtt egy percre megállni is érintés). Ennél távolabb viszont
 * a 10 perces minimum kell — korábban a helyalapú "rakodás" kategória
 * bármilyen rövid állást átengedett a 2 km-es körön belül, így egy piros
 * lámpa vagy körforgalom a cím 1,9 km-es körzetében érkezésnek számított.
 */
const KOZVETLEN_KOZELSEG_KM = 0.3;

/** A párosításnál ekkora (km) sávokban hasonlítjuk a távolságot — ezen belül nem a méterek, hanem a fuvarok sorrendje dönt (lásd jelolMegallokat). */
const TAV_SAV_KM = 0.5;

/**
 * Megjelöli a jármű EGÉSZ NAPJÁRA, mely tervezett fel-/lerakó pontokat
 * érintette már, és melyeket hagyta el. Három lépés:
 *
 * 1. ÉRINTÉS — a valós GPS-idővonal ÁLLÁS-szakaszai közül keressük a
 *    legutolsót, ami CIM_TAVOLSAG_KM-en belül van a ponthoz, és elég sokáig
 *    tartott (vagy a helye alapján eleve rakodásnak minősült). Kifejezetten
 *    csak állásokat nézünk: aki csak elhajtott a cím mellett, az nem volt ott.
 *
 * 2. PÁROSÍTÁS — a lehetséges érintéseket a legközelebbi párral kezdve,
 *    kölcsönösen egyszer osztjuk ki, a nap összes megbízására együtt.
 *
 * 3. TOVÁBBHALADÁS — az érintés után volt-e a jármű TOVABBHALADAS_TAVOLSAG_KM-nél
 *    messzebb. Ha igen, a megálló "elhagyva" (kész). Ha nem, a jármű még ott
 *    van: `eppenItt`.
 *
 * Mindkét esetben `tenylegesIdo` az érintés KEZDETE, vagyis a tényleges
 * megérkezés ideje — ezt mutatja az idővonal a becsült időpont helyett.
 */
/**
 * Egy tervezett megálló egy LÁTOGATÁSA: egy vagy több, egymást követő
 * állás-szakasz a cím CIM_TAVOLSAG_KM-es körzetében, amik közt a jármű nem
 * távolodott TOVABBHALADAS_TAVOLSAG_KM-nél messzebb. Egy nagy telephelyen
 * (élesben a debreceni BMW-gyár) a kamion a portától a rámpáig, majd a
 * parkolóba másfél-két km-t is gurul, amiből az Ecofleet KÜLÖN trip-eket és
 * külön állásokat csinál — ez egyetlen ottlét, nem két érkezés. Két
 * külön állást két látogatásnak véve a második állás egy MÁSIK, azonos
 * lerakójú fuvart is "igazolt" (élesben: #130 a #126 mellett), miközben a
 * kocsi már máshol állt.
 */
type Latogatas = {
  /** A látogatást alkotó állás-szakaszok indexei az `allasok` listában, időrendben. */
  aik: number[];
  kezdet: Date;
  veg: Date;
  idotartamSec: number;
  /** A legkisebb távolság (km) a címtől a látogatás állásai közül. */
  tav: number;
};

function latogatasok(
  m: TervezettMegallo,
  allasok: Extract<IdovonalSzakasz, { tipus: "allas" }>[],
  pontok: { lat: number; lon: number; at: number }[]
): Latogatas[] {
  const eredmeny: Latogatas[] = [];
  let aktualis: Latogatas | null = null;
  allasok.forEach((a, ai) => {
    const tav = haversineKm(m.lat as number, m.lon as number, a.lat, a.lon);
    if (tav >= CIM_TAVOLSAG_KM) return;
    if (aktualis) {
      const elozoVeg = aktualis.veg.getTime();
      const elment = pontok.some(
        (p) =>
          p.at > elozoVeg &&
          p.at < a.kezdet.getTime() &&
          haversineKm(m.lat as number, m.lon as number, p.lat, p.lon) >= TOVABBHALADAS_TAVOLSAG_KM
      );
      if (!elment) {
        aktualis.aik.push(ai);
        aktualis.veg = a.veg;
        aktualis.idotartamSec += a.idotartamSec;
        aktualis.tav = Math.min(aktualis.tav, tav);
        return;
      }
      eredmeny.push(aktualis);
    }
    aktualis = { aik: [ai], kezdet: a.kezdet, veg: a.veg, idotartamSec: a.idotartamSec, tav };
  });
  if (aktualis) eredmeny.push(aktualis);
  return eredmeny;
}

export function jelolMegallokat(
  fuvarokMegalloi: TervezettMegallo[][],
  szakaszok: IdovonalSzakasz[]
): TervezettMegallo[][] {
  const allasok = szakaszok.filter((sz): sz is Extract<IdovonalSzakasz, { tipus: "allas" }> => sz.tipus === "allas");
  const pontok = idovonalPontjai(szakaszok);

  // A nap ÖSSZES tervezett megállója egy listában, hogy a párosítás a jármű
  // egész napjára érvényes legyen, ne fuvaronként külön. Enélkül ugyanaz a
  // valós megállás több, egymástól független megbízás megállóját is
  // igazolhatta — a felületen ez úgy látszott, hogy három különböző cím
  // ugyanabban a másodpercben lett kész.
  const lapos = fuvarokMegalloi.flatMap((megallok, fi) => megallok.map((m, mi) => ({ fi, mi, m })));

  const parok: { fi: number; mi: number; latogatas: Latogatas; tav: number }[] = [];
  lapos.forEach(({ fi, mi, m }) => {
    // Felismerhetetlen címnél nincs mihez hasonlítani — ilyet nem jelölünk késznek.
    if (m.lat == null || m.lon == null || m.pontossag === "ismeretlen") return;
    for (const l of latogatasok(m, allasok, pontok)) {
      // Az időablak előtt véget ért látogatás nem ehhez a megállóhoz tartozik (lásd TervezettMegallo.ablakKezdet).
      if (m.ablakKezdet && l.veg.getTime() < m.ablakKezdet.getTime()) continue;
      if (l.idotartamSec < ERINTES_MIN_IDOTARTAM_SEC && l.tav >= KOZVETLEN_KOZELSEG_KM) continue;
      parok.push({ fi, mi, latogatas: l, tav: l.tav });
    }
  });

  // Párosítás KÖLCSÖNÖSEN egyszer: egy tervezett megállót egyetlen látogatás
  // igazol, és egy látogatás (annak bármely állása) szerepenként egyetlen
  // megállót — egy LERAKÓT és egy FELRAKÓT igen (a kamion ugyanott lerak,
  // majd a következő fuvarhoz felrak: élesben a debreceni BMW-nél a #126
  // lerakása és a #128 felrakása egy ottlét volt), két lerakót vagy két
  // felrakót nem.
  //
  // A távolság csak TAV_SAV_KM-es sávokban számít: ugyanannak a telephelynek
  // két írásmódja pár tíz méterrel eltérő koordinátára geokódolódik, és a
  // méterekkel "közelebbi" pont nem a valós különbség. Egy sávon belül a
  // fuvarok sorrendje (a korábban rögzített/tervezett fuvar), azon belül a
  // megálló, majd a látogatás sorrendje dönt. Élesben enélkül a #130
  // debreceni lerakója vitte el a hajnali BMW-megállást a #126 elől, és a
  // kocsi Pápán állva "lezárta" a debreceni lerakást.
  parok.sort(
    (x, y) =>
      Math.round(x.tav / TAV_SAV_KM) - Math.round(y.tav / TAV_SAV_KM) ||
      x.fi - y.fi ||
      x.mi - y.mi ||
      x.latogatas.aik[0] - y.latogatas.aik[0]
  );
  const foglaltMegallo = new Set<string>();
  const foglaltAllas = new Set<string>();
  const parositas = new Map<string, Latogatas>();
  for (const p of parok) {
    const kulcs = `${p.fi}:${p.mi}`;
    const szerep = fuvarokMegalloi[p.fi][p.mi].tipus;
    if (foglaltMegallo.has(kulcs) || p.latogatas.aik.some((ai) => foglaltAllas.has(`${ai}:${szerep}`))) continue;
    foglaltMegallo.add(kulcs);
    for (const ai of p.latogatas.aik) foglaltAllas.add(`${ai}:${szerep}`);
    parositas.set(kulcs, p.latogatas);
  }

  return fuvarokMegalloi.map((megallok, fi) =>
    megallok.map((m, mi) => {
      const erintes = parositas.get(`${fi}:${mi}`);
      if (!erintes) return m;

      const tovabbment = pontok.some(
        (p) =>
          p.at > erintes.veg.getTime() &&
          haversineKm(m.lat as number, m.lon as number, p.lat, p.lon) >= TOVABBHALADAS_TAVOLSAG_KM
      );

      return {
        ...m,
        elhagyva: tovabbment,
        eppenItt: !tovabbment,
        keszForras: tovabbment ? "gps" : m.keszForras,
        tenylegesIdo: erintes.kezdet,
        tenylegesTavozas: tovabbment ? erintes.veg : null,
        // Csak városnév szintjén ismert címnél a koordináta a városközépre
        // mutat, tehát a közeli megállás nem bizonyíték, csak jel.
        bizonytalanFelismeres: m.pontossag !== "pontos",
      };
    })
  );
}

/**
 * A kézi jelölések ráfűzése a GPS-alapú jelölésre: ha a fuvar Teljesítve
 * (kézi gomb vagy automatikus lezárás), minden megállója kész; ha egy
 * megállót a sofőr (mobil) vagy az iroda (GPS lap) kézzel készre jelölt, az
 * a megálló kész. A kézi jelölés a GPS-nél erősebb bizonyíték, ezért az
 * "éppen itt" állapotot is felülírja. A GPS szerinti tényleges érkezés/
 * távozás időpontja megmarad, ha volt.
 */
export function ratesziKeziJeloleseket(
  megallok: TervezettMegallo[],
  fuvarTeljesitve: boolean,
  keziAllapotok: Map<number, { kesz: boolean; keszBy: string | null }>
): TervezettMegallo[] {
  return megallok.map((m) => {
    const kezi = keziAllapotok.get(m.index);
    const keziKesz = fuvarTeljesitve || !!kezi?.kesz;
    if (!keziKesz || m.elhagyva) return m;
    return { ...m, elhagyva: true, eppenItt: false, keszForras: "kezi", keszBy: kezi?.keszBy ?? m.keszBy };
  });
}

/** Igaz, ha a fuvar a GPS szerint kész: minden lerakója geokódolható, és a jármű mindegyiket érintette és el is hagyta. */
export function fuvarKeszGpsSzerint(megallok: TervezettMegallo[]): boolean {
  const lerakok = megallok.filter((m) => m.tipus === "lerako");
  return lerakok.length > 0 && lerakok.every((m) => m.lat != null && m.lon != null && m.elhagyva && m.keszForras === "gps");
}
