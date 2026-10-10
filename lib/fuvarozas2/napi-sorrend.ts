// Egy kocsi fuvarjainak sorrendje — EGY közös szabály minden nézetre: a Ma
// oldal (heti rács, tükör, holnapi lista), a Tervezés, a Tervező, az
// elvinni-hét, a GPS lap / sofőr app blokkjai és a GPS-párosítás
// (oldal és figyelő ugyanabban a sorrendben adja a fuvarokat a
// jelolMegallokat-nak). Tesztek: scripts/teszt-napi-sorrend.ts,
// scripts/teszt-ma-tukor.ts.
//
// Nem a rögzítés sorrendje számít: Gergő 10.05-i napján a Lösung-fuvar
// (#293, Sárvár → Debrecen, lerakás 10.06.) korábban került be, mint a két
// saját fuvar (Szakoly → Tata, Tata → Tompaládony), ezért a lista elejére
// került, holott a nap végén, a hazafelé úton jön. És fordítva: egy később
// rögzített, 10:00-ra kiírt bérfuvar nem kerülhet a korábban rögzített,
// időpont nélküli saját fuvar mögé (2026-10-10: „bérfuvar után a saját
// fuvar külön, a helyes sorrendben — ne ugorjon előre”).
//
// A szabály, sorrendben:
// a) Nap. Előbb az, amelyik hamarabb ér véget (lerakás napja), azon belül a
//    felrakás napja — a több napra nyúló fuvar az aznapiak után jön, és
//    ennek a lerakója lesz a kocsi következő napi helye.
//    e) Ez a „nap végére” szabály csak az IDŐPONT ÉS TÉNY NÉLKÜLI többnapos
//    fuvarra él (Micó 09-18, Hajdúspedíció péntek→hétfő, közben Ebes →
//    Balkány). Ha van kiírt időpontja vagy már elkezdődött, a felrakás
//    napján az időpontja szerint áll a sorban — a tény / terv erősebb a
//    feltevésnél.
// b) A napon belül előbb a már elkezdett vagy lezárt fuvarok, a tényük
//    (legkorábbi GPS-érkezés / sofőr-jelölés) szerint. A tény nélkül lezárt
//    (az iroda zárta, GPS és sofőr-jelölés nélkül) fuvar a tervezett helyén
//    marad: ha van terv-ideje, aszerint, ha nincs, a csoport elején — kész,
//    tehát nem kerülhet az utána következő, már elkezdett fuvar mögé.
// c) Utána a kiírt időponttal (ablak kezdete vagy az időpont-mező) bírók,
//    az időpont szerint.
// d) Végül az időpont nélküliek, a már időzítettek UTÁN: láncolás (ha egy
//    fuvar ott rak fel, ahol egy másik lerak — Tata → Tata —, a lerakós
//    megy előre), majd a rögzítés sorrendje (id).
// Mesterséges helykitöltő időt (éjfél UTC, reggel 7) a szabály nem használ.

import { varosNev } from "@/lib/fuvarozas/varos";
import { parseIdopontSzoveg } from "@/lib/fuvarozas/idovonal";
import { budapestFalioraToInstant } from "@/lib/fuvarozas/idozona";

export type SorrendAdat = {
  id: string;
  felrakasNap: string | null;
  lerakasNap: string | null;
  felrako: string | null;
  lerako: string | null;
  /** Tény (ms): a legkorábbi GPS-érkezés / sofőr-jelölés, ha a fuvar már elkezdődött. */
  tenyIdo?: number | null;
  /** Lezárt (teljesítve vagy későbbi állapotú) fuvar. */
  lezart?: boolean;
  /** Kiírt terv-idő (ms): az ablak kezdete vagy az időpont-mező — null, ha nincs. */
  tervIdo?: number | null;
};

/** A rendezés kulcsa (lásd a fájl elejét): nap, másodlagos nap, csoport (0 tény/lezárt, 1 időzített, 2 időpont nélküli), idő, id. */
export type FuvarSorrendKulcs = { nap: string; nap2: string; csoport: 0 | 1 | 2; ido: number; id: number };

export function fuvarSorrendKulcs(a: SorrendAdat): FuvarSorrendKulcs {
  const fel = a.felrakasNap ?? a.lerakasNap ?? "";
  const le = a.lerakasNap ?? a.felrakasNap ?? "";
  const vanTeny = a.tenyIdo != null;
  const vanTerv = a.tervIdo != null;
  // e) Időpont és tény nélkül a lerakás napja dönt (a felrakás napjának végére kerül).
  const nap = !vanTeny && !vanTerv ? le : fel;
  const csoport: 0 | 1 | 2 = vanTeny || a.lezart ? 0 : vanTerv ? 1 : 2;
  const ido = csoport === 0 ? (a.tenyIdo ?? a.tervIdo ?? Number.NEGATIVE_INFINITY) : csoport === 1 ? a.tervIdo! : 0;
  return { nap, nap2: fel, csoport, ido, id: Number(a.id) };
}

function kulcsSorrend(x: FuvarSorrendKulcs, y: FuvarSorrendKulcs): number {
  return x.nap.localeCompare(y.nap) || x.nap2.localeCompare(y.nap2) || x.csoport - y.csoport || (x.ido === y.ido ? 0 : x.ido < y.ido ? -1 : 1) || x.id - y.id;
}

/** Két fuvar összehasonlítása a közös szabály szerint — a láncolás nélkül (az a napiSorrend dolga). */
export function osszehasonlitFuvarokat(x: SorrendAdat, y: SorrendAdat): number {
  return kulcsSorrend(fuvarSorrendKulcs(x), fuvarSorrendKulcs(y));
}

function varosKulcs(cim: string | null): string {
  return (varosNev(cim) || "").trim().toLowerCase();
}

/** Egy kocsi fuvarjai a közös szabály szerint (a–e, láncolással). Mindig EGY kocsi listáját add át. */
export function napiSorrend<T>(lista: T[], adat: (t: T) => SorrendAdat): T[] {
  const elemek = lista.map((t) => {
    const a = adat(t);
    return { t, a, k: fuvarSorrendKulcs(a) };
  });
  elemek.sort((x, y) => kulcsSorrend(x.k, y.k));

  // d) Láncolás az időpont nélküliek között, azonos napon: ha egy későbbi
  // elem lerakója ennek a felrakója, az előre kerül. Az időzítettek és a már
  // elkezdettek sorrendjét nem bolygatja. Körbeérő láncnál (A → B → A) a
  // lépésszám-korlát megállítja, és marad az id-sorrend.
  const egyCsoport = (x: FuvarSorrendKulcs, y: FuvarSorrendKulcs) => x.nap === y.nap && x.nap2 === y.nap2 && x.csoport === y.csoport;
  for (let lepes = 0; lepes < elemek.length * elemek.length; lepes++) {
    let mozdult = false;
    for (let i = 0; i < elemek.length && !mozdult; i++) {
      if (elemek[i].k.csoport !== 2) continue;
      const fel = varosKulcs(elemek[i].a.felrako);
      if (!fel) continue;
      for (let j = i + 1; j < elemek.length; j++) {
        if (!egyCsoport(elemek[j].k, elemek[i].k)) break;
        if (varosKulcs(elemek[j].a.lerako) === fel && varosKulcs(elemek[i].a.lerako) !== varosKulcs(elemek[j].a.felrako)) {
          const [e] = elemek.splice(j, 1);
          elemek.splice(i, 0, e);
          mozdult = true;
          break;
        }
      }
    }
    if (!mozdult) break;
  }
  return elemek.map((e) => e.t);
}

/** Időbélyeg ms-ban — a Postgres „2026-09-20 07:00:00+00” és az ISO „…Z” alakját is érti. */
export function idobelyegMs(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : d.getTime();
  let s = d.trim().replace(" ", "T");
  if (/[+-]\d{2}$/.test(s)) s += ":00";
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Egy megbízás kiírt terv-ideje (ms): a felrakási ablak kezdete, különben
 * az időpont-mező („06:00”, „de. 6.30”) a felrakás napján, budapesti
 * faliórával. Ha egyik sincs: null — nincs helykitöltő óra.
 */
export function tervIdoMegbizasbol(nap: string | null, ablakTol: Date | string | null | undefined, idopont: string | null | undefined): number | null {
  const ablak = idobelyegMs(ablakTol);
  if (ablak != null) return ablak;
  const p = parseIdopontSzoveg(idopont ?? null);
  if (!p || !nap || !/^\d{4}-\d{2}-\d{2}$/.test(nap)) return null;
  const [ev, ho, n] = nap.split("-").map(Number);
  return budapestFalioraToInstant(ev, ho, n, p.ora, p.perc, 0).getTime();
}

/**
 * A GPS-párosítás (jelolMegallokat) bemeneti sorrendje — a GPS lap
 * (actions.ts) és a teljesítés-figyelő (megbizasok.ts →
 * teljesites-figyeles.ts) UGYANEZT használja, csak a megbízás saját
 * mezőiből (tény nélkül: a tényt épp a párosítás állítja elő). Így ugyanazt
 * a valós megállást a kettő nem rendelheti két különböző fuvarhoz.
 * Egy kocsi sorait kell átadni.
 */
export function parositasiSorrend<
  T extends {
    id: string;
    datum: string;
    lerakas_datum: string | null;
    felrako: string | null;
    lerako: string | null;
    felrakas_ablak_tol: string | null;
    idopont?: string | null;
    teljesitve: boolean;
  },
>(sorok: T[]): T[] {
  return napiSorrend(sorok, (s) => ({
    id: s.id,
    felrakasNap: s.datum,
    lerakasNap: s.lerakas_datum ?? s.datum,
    felrako: s.felrako,
    lerako: s.lerako,
    lezart: s.teljesitve,
    tervIdo: tervIdoMegbizasbol(s.datum, s.felrakas_ablak_tol, s.idopont),
  }));
}

/**
 * Ütközés-e egy kocsi egy napja: legalább két BÉRFUVAR esik rá. A saját
 * fuvarokat mi tervezzük a bérfuvar köré (Gergő 10.05.: két saját + egy
 * Lösung egymás után), azok nem ütköznek — két külön megbízó viszont
 * ugyanarra a kocsira és napra már kettős foglalás lehet, azt nézni kell.
 */
export function berUtkozes(fuvarok: { jelleg: "ber" | "sajat" }[]): boolean {
  return fuvarok.filter((f) => f.jelleg === "ber").length > 1;
}
