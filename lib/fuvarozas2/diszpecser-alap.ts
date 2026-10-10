// Diszpécser nézet (6. fázis) — típusok és TISZTA segédek (se "server-only",
// se DB): a kliens-komponens, a szerver-betöltő (lib/fuvarozas2/diszpecser.ts)
// és a teszt (scripts/teszt-diszpecser.ts) közösen használja.
//
// Amit itt döntünk el (és a teszt véd):
//   • GPS-frissesség: friss ≤ gps_kesei_perc, késői ≤ gps_elavult_perc,
//     elavult afölött, „nincs GPS”, ha nincs jel — pozíciót SOHA nem találunk ki;
//   • a probléma-sáv összeállítása (késésveszély, üres indulás, GPS, ütközés,
//     kapacitás, hiányzó cím, kocsi nélküli fuvar);
//   • a szűrők (URL ↔ állapot) és alkalmazásuk a betöltött napra;
//   • az idővonal geometriája (tengely, blokk-hely, átfedés-sorok);
//   • a jármű-okmányok lejárati jelzése (≤ 30 nap borostyán, lejárt vörös).

import { FELADAT_TIPUS_CIMKE, type FeladatTipus, type Figyelmeztetes, type KmForras, type MenetAllapot } from "@/lib/menet/tipusok";
import { lejaratAllapot, hatralevoNap } from "@/lib/jarmuvek/tipusok";

export { FELADAT_TIPUS_CIMKE };

// ------------------------------------------------------------------ típusok

export type GpsFrissesseg = "friss" | "kesoi" | "elavult" | "nincs";

export const GPS_FRISSESSEG_CIMKE: Record<GpsFrissesseg, string> = {
  friss: "friss",
  kesoi: "késői",
  elavult: "elavult",
  nincs: "nincs GPS",
};

export type DiszFeladatAllapot = "kesz" | "folyamatban" | "tervezett";

export const FELADAT_ALLAPOT_CIMKE: Record<DiszFeladatAllapot, string> = {
  kesz: "kész",
  folyamatban: "folyamatban",
  tervezett: "tervezett",
};

export type Ablak = { tol: string | null; ig: string | null };

export type DiszFeladat = {
  /** Egyedi kulcs a nézetben: a menet_feladat id-je, vagy „m<megbízás-id>” menet nélkül. */
  kulcs: string;
  /** A menet_feladat id-je (a lezárás ezzel megy) — menet nélkül null. */
  feladatId: string | null;
  jarmuKod: string;
  sorszam: number | null;
  tipus: FeladatTipus;
  megbizasId: string | null;
  partner: string | null;
  hivatkozas: string | null;
  honnan: string | null;
  hova: string | null;
  /** A feladat által érintett saját telephelyek nevei (a telephely-szűrőhöz). */
  telephelyek: string[];
  felrakasAblak: Ablak;
  lerakasAblak: Ablak;
  /** ISO időpontok. */
  tervIndulas: string | null;
  tervErkezes: string | null;
  tenyIndulas: string | null;
  tenyErkezes: string | null;
  /** Élő ETA (csak ma, csak ha a GPS-lánc ki tudta számolni). */
  eta: string | null;
  etaCel: string | null;
  allapot: DiszFeladatAllapot;
  uresKm: number | null;
  rakottKm: number | null;
  kmForras: KmForras | null;
  raklapDb: number | null;
  kapacitasRaklap: number | null;
  /** A költségmodul tárolt sorai (fuvar_megbizas_koltseg): összeg és tény/becslés. */
  koltseg: { ft: number; forras: "teny" | "becsles" } | null;
  dokDb: number;
  figyelmeztetesek: Figyelmeztetes[];
};

export type DiszGps = { lat: number; lon: number; utolsoAdat: string; cim: string | null; sebesseg: number };

export type DiszKocsi = {
  jarmuId: string;
  kod: string;
  cimke: string;
  vontato: string | null;
  potkocsi: string | null;
  sofor: string;
  vanGpsEszkoz: boolean;
  gps: DiszGps | null;
  gpsHiba: string | null;
  /** Honnan jön a sorrend: jóváhagyott menet, gépi javaslat, vagy nincs menet (a megbízások terv-ideje szerint). */
  menetForras: "jovahagyott" | "javaslat" | "nincs";
  menetAllapot: MenetAllapot | null;
  menetId: string | null;
  feladatok: DiszFeladat[];
  /** A következő megálló ismert koordinátával (a térképi vonalhoz) — ha nincs, nem rajzolunk. */
  kovetkezoCel: { lat: number; lon: number; cim: string } | null;
};

export type DiszTavollet = "szabadsag" | "beteg";

export type DiszHetCella = {
  nap: string;
  feladatDb: number;
  tipusok: Partial<Record<FeladatTipus, number>>;
  forras: "jovahagyott" | "javaslat" | "megbizas" | "nincs";
  tavollet: DiszTavollet | null;
};

export type DiszOkmany = { cimke: string; targy: string; lejarat: string; allapot: "lejart" | "hamarosan"; hatraNap: number };

export type DiszHetSor = { kod: string; cimke: string; sofor: string; napok: DiszHetCella[]; okmanyok: DiszOkmany[] };

export type DiszKocsiNelkul = { id: string; partner: string | null; honnan: string | null; hova: string | null };

export type Diszpecser = {
  nap: string;
  ma: string;
  /** A betöltés pillanata (ISO) — a „most” vonal és a GPS-kor ehhez számol. */
  most: string;
  beallitas: { gpsKesoiPerc: number; gpsElavultPerc: number; uresIndulasKm: number };
  kocsik: DiszKocsi[];
  kocsiNelkul: DiszKocsiNelkul[];
  gpsHiba: string | null;
  menetHiba: string | null;
  het: { napok: string[]; sorok: DiszHetSor[]; tavolletLathato: boolean };
  telephelyNevek: string[];
  szerkeszthet: boolean;
};

// ------------------------------------------------------------------ idő

/** Postgres „2026-10-12 08:00:00+02” (vagy ISO) → Date; érvénytelenre null. */
export function pgIdo(t: string | Date | null | undefined): Date | null {
  if (!t) return null;
  if (t instanceof Date) return Number.isNaN(t.getTime()) ? null : t;
  let s = t.trim().replace(" ", "T");
  if (/[+-]\d{2}$/.test(s)) s += ":00";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Postgres-idő → ISO szöveg (vagy null). */
export const isoVagyNull = (t: string | Date | null | undefined): string | null => pgIdo(t)?.toISOString() ?? null;

const BP_FORMA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Budapest", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function napSzam(iso: string): number {
  const [e, h, n] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(e, h - 1, n) / 86400000;
}

/**
 * Egy időpont budapesti falióra szerint, percben a `nap` 00:00-jától
 * (előző nap negatív, következő nap 1440 fölött).
 */
export function percANapban(iso: string | null, nap: string): number | null {
  const d = pgIdo(iso);
  if (!d) return null;
  const r = Object.fromEntries(BP_FORMA.formatToParts(d).map((p) => [p.type, p.value]));
  const napEltolas = napSzam(`${r.year}-${r.month}-${r.day}`) - napSzam(nap);
  return napEltolas * 1440 + Number(r.hour) * 60 + Number(r.minute);
}

/** „08:30” budapesti idő szerint (vagy null). */
export function oraPerc(iso: string | null | undefined): string | null {
  const d = pgIdo(iso ?? null);
  return d ? d.toLocaleTimeString("hu-HU", { timeZone: "Europe/Budapest", hour: "2-digit", minute: "2-digit" }) : null;
}

/**
 * A feladat megjeleníthető kezdete és vége (ISO). A kezdet: tény, különben
 * terv; a vég: tény, különben élő ETA, különben terv. Ha a vég nem a kezdet
 * UTÁN van (ellentmondásos adat), csak a megbízhatóbbat adjuk vissza
 * (tény > ETA > terv; egyenlőnél a kezdetet) — vég < kezdet SOHA nem
 * jelenik meg (QA 2026-10-10: „14:51–09:17”).
 */
export function feladatIdok(f: Pick<DiszFeladat, "tervIndulas" | "tervErkezes" | "tenyIndulas" | "tenyErkezes" | "eta">): { kezd: string | null; veg: string | null; ellentmondas: boolean } {
  const kezdTeny = pgIdo(f.tenyIndulas);
  const kezd = kezdTeny ?? pgIdo(f.tervIndulas);
  const vegTeny = pgIdo(f.tenyErkezes);
  const vegEta = vegTeny ? null : pgIdo(f.eta);
  const veg = vegTeny ?? vegEta ?? pgIdo(f.tervErkezes);
  if (kezd && veg && veg.getTime() <= kezd.getTime()) {
    const kezdRang = kezdTeny ? 3 : 1;
    const vegRang = vegTeny ? 3 : vegEta ? 2 : 1;
    return vegRang > kezdRang
      ? { kezd: null, veg: veg.toISOString(), ellentmondas: true }
      : { kezd: kezd.toISOString(), veg: null, ellentmondas: true };
  }
  return { kezd: kezd?.toISOString() ?? null, veg: veg?.toISOString() ?? null, ellentmondas: false };
}

/** „08:30”, más napon „08:30 (+1)” / „21:52 (−1)” — a `nap`-hoz képest. */
export function oraPercNap(iso: string | null | undefined, nap: string): string | null {
  const o = oraPerc(iso);
  const p = percANapban(iso ?? null, nap);
  if (o == null || p == null) return o;
  const n = Math.floor(p / 1440);
  return n === 0 ? o : `${o} (${n > 0 ? "+" : "−"}${Math.abs(n)})`;
}

/** „08:00–14:06”, csak az egyik, ha a másik hiányzik / ellentmondásos; „” ha egyik sincs. */
export function idoSzoveg(f: Pick<DiszFeladat, "tervIndulas" | "tervErkezes" | "tenyIndulas" | "tenyErkezes" | "eta">, nap: string): string {
  const x = feladatIdok(f);
  const k = oraPercNap(x.kezd, nap);
  const v = oraPercNap(x.veg, nap);
  return k && v ? `${k}–${v}` : k ? `${k}–` : v ? `–${v}` : "";
}

/** Nap + n nap (ISO). */
export function napEltolva(nap: string, n: number): string {
  const d = new Date(`${nap}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** A nap hetének hétfője (ISO). */
export function hetHetfoje(nap: string): string {
  const d = new Date(`${nap}T12:00:00Z`);
  return napEltolva(nap, -((d.getUTCDay() + 6) % 7));
}

// ------------------------------------------------------------------ GPS-frissesség

/**
 * Élő ETA csak akkor mutatható, ha a kocsinak friss vagy késői GPS-jele van,
 * ÉS a becslés ugyanarra a feladatra (megbízásra) szól. Jel nélkül (vagy
 * elavult jellel) a GPS-lánc csak a terv láncolását adná vissza — azt nem
 * írjuk ki „élő GPS-becslés”-ként (QA 2026-10-10: „ETA 13:58 · élő
 * GPS-becslés” a „× nincs GPS” kocsin).
 */
export function etaMutathato(frissesseg: GpsFrissesseg, becslesMegbizasId: string | null | undefined, feladatMegbizasId: string | null | undefined): boolean {
  return (frissesseg === "friss" || frissesseg === "kesoi") && !!becslesMegbizasId && becslesMegbizasId === feladatMegbizasId;
}

/** A GPS-jel kora alapján: friss ≤ késői-küszöb, késői ≤ elavult-küszöb, különben elavult; jel nélkül „nincs”. */
export function gpsFrissesseg(utolsoAdat: string | null | undefined, mostMs: number, kesoiPerc: number, elavultPerc: number): GpsFrissesseg {
  const d = pgIdo(utolsoAdat ?? null);
  if (!d) return "nincs";
  const kor = (mostMs - d.getTime()) / 60000;
  if (kor <= kesoiPerc) return "friss";
  if (kor <= elavultPerc) return "kesoi";
  return "elavult";
}

/** „3 perce”, „1 ó 20 p-e”, „2 napja” — a GPS-jel kora. */
export function korSzoveg(utolsoAdat: string | null | undefined, mostMs: number): string | null {
  const d = pgIdo(utolsoAdat ?? null);
  if (!d) return null;
  const perc = Math.max(0, Math.round((mostMs - d.getTime()) / 60000));
  if (perc < 60) return `${perc} perce`;
  if (perc < 24 * 60) return `${Math.floor(perc / 60)} ó ${perc % 60} p-e`;
  return `${Math.floor(perc / 1440)} napja`;
}

// ------------------------------------------------------------------ jármű-név

/**
 * A jármű EGY megjelenítési szabálya (Diszpécser minden nézete és a Ma oldal):
 * a kód mindig elöl; ha a címke nem tartalmazza a kódot, „kód · címke”
 * (pl. „JANI · DAF XG (gyártás alatt)”), különben a címke maga
 * („AOPU-427/AOTY-474”).
 */
export function jarmuNev(j: { kod: string | null | undefined; cimke: string | null | undefined }): string {
  const kod = (j.kod ?? "").trim();
  const cimke = (j.cimke ?? "").trim();
  if (!kod) return cimke || "?";
  if (!cimke || cimke.toLocaleUpperCase("hu-HU").includes(kod.toLocaleUpperCase("hu-HU"))) return cimke || kod;
  return `${kod} · ${cimke}`;
}

// ------------------------------------------------------------------ okmányok

/** Lejárati jelzés: csak a lejárt és a 30 napon belül lejáró okmány kap jelet. */
export function okmanyJelzes(lejarat: string | null | undefined, ma: string): { allapot: "lejart" | "hamarosan"; hatraNap: number } | null {
  const a = lejaratAllapot(lejarat, ma);
  if (a !== "lejart" && a !== "hamarosan") return null;
  return { allapot: a, hatraNap: hatralevoNap(lejarat!, ma) };
}

// ------------------------------------------------------------------ problémák

export type ProblemaTipus = "kesesveszely" | "ures_indulas" | "gps" | "utkozes" | "kapacitas" | "hianyzo_cim" | "kocsi_nelkul";

export const PROBLEMA_CIMKE: Record<ProblemaTipus, string> = {
  kesesveszely: "Késésveszély",
  ures_indulas: "Üres indulás",
  gps: "GPS",
  utkozes: "Időütközés",
  kapacitas: "Kapacitás",
  hianyzo_cim: "Hiányzó cím",
  kocsi_nelkul: "Kocsi nélkül",
};

export type Problema = {
  kulcs: string;
  tipus: ProblemaTipus;
  sulyos: boolean;
  szoveg: string;
  jarmuKod: string | null;
  /**
   * „feladat”: a feladat saját problémája — ez adja a ▲ jelet a feladaton;
   * „kocsi”: a kocsi egészére szól (GPS), a feladaton NEM jelez, csak a
   * kijelöléshez ad egy feladatot; „flotta”: kocsi nélküli fuvar.
   */
  szint: "feladat" | "kocsi" | "flotta";
  /** A kijelölendő feladat kulcsa (ha van). */
  feladatKulcs: string | null;
  /** Ha nincs feladat: egy megbízás linkje (kocsi nélküli fuvar). */
  megbizasId: string | null;
};

const FIGY_TIPUS: Record<Figyelmeztetes["kod"], ProblemaTipus> = {
  ures_indulas: "ures_indulas",
  utkozes: "utkozes",
  kapacitas: "kapacitas",
  hianyzo_cim: "hianyzo_cim",
};
const SULYOS: Record<ProblemaTipus, boolean> = {
  kesesveszely: true, utkozes: true, gps: false, ures_indulas: false, kapacitas: true, hianyzo_cim: false, kocsi_nelkul: false,
};
const TIPUS_REND: ProblemaTipus[] = ["kesesveszely", "utkozes", "kapacitas", "gps", "ures_indulas", "hianyzo_cim", "kocsi_nelkul"];

/** Egy feladat rövid neve a sávban és a listán: „#2 Szakoly → Tata”. */
export function feladatNev(f: Pick<DiszFeladat, "sorszam" | "honnan" | "hova">, varos: (c: string | null) => string = (c) => c ?? "?"): string {
  return `${f.sorszam != null ? `#${f.sorszam} ` : ""}${varos(f.honnan)} → ${varos(f.hova)}`;
}

/**
 * Késésveszély: a lerakóra várható idő (élő ETA, ha van, különben a terv)
 * az ablak vége után van; vagy a felrakás terve az ablak vége után, és még
 * nem kezdődött el. A kész feladat nem késik.
 */
export function kesesveszely(f: Pick<DiszFeladat, "allapot" | "eta" | "tervErkezes" | "tervIndulas" | "tenyIndulas" | "lerakasAblak" | "felrakasAblak">): { hol: "lerako" | "felrako"; varhato: string; ablakVege: string; forras: "eta" | "terv" } | null {
  if (f.allapot === "kesz") return null;
  const leVege = pgIdo(f.lerakasAblak.ig);
  const varhato = f.eta ?? f.tervErkezes;
  const v = pgIdo(varhato);
  if (leVege && v && v.getTime() > leVege.getTime()) return { hol: "lerako", varhato: v.toISOString(), ablakVege: leVege.toISOString(), forras: f.eta ? "eta" : "terv" };
  const felVege = pgIdo(f.felrakasAblak.ig);
  const ti = pgIdo(f.tervIndulas);
  if (!f.tenyIndulas && felVege && ti && ti.getTime() > felVege.getTime()) return { hol: "felrako", varhato: ti.toISOString(), ablakVege: felVege.toISOString(), forras: "terv" };
  return null;
}

/**
 * A probléma-sáv: a menet figyelmeztetései, a számolt késésveszély, a
 * GPS-hiány (csak ha a kocsinak van még nyitott feladata a napon) és a
 * kocsi nélküli fuvarok. Súlyos elöl, azon belül típus, majd kocsi szerint.
 */
export function problemak(adat: Pick<Diszpecser, "kocsik" | "kocsiNelkul" | "beallitas" | "most">, varos?: (c: string | null) => string): Problema[] {
  const mostMs = pgIdo(adat.most)?.getTime() ?? Date.now();
  const ki: Problema[] = [];
  adat.kocsik.forEach((k) => {
    const knev = jarmuNev(k);
    for (const f of k.feladatok) {
      const nev = feladatNev(f, varos);
      const kes = kesesveszely(f);
      // A menet már jelzett ütközést ugyanerre — a tervből számolt késést nem duplázzuk, az élő ETA-ból valót igen.
      const vanUtkozes = f.figyelmeztetesek.some((x) => x.kod === "utkozes");
      if (kes && (kes.forras === "eta" || !vanUtkozes)) {
        ki.push({
          kulcs: `kes-${f.kulcs}`, tipus: "kesesveszely", sulyos: true, jarmuKod: k.kod, szint: "feladat", feladatKulcs: f.kulcs, megbizasId: f.megbizasId,
          szoveg: `${knev} ${nev}: ${kes.forras === "eta" ? "ETA" : "terv"} ${oraPerc(kes.varhato)}, a ${kes.hol === "lerako" ? "lerakási" : "felrakási"} ablak vége ${oraPerc(kes.ablakVege)}`,
        });
      }
      if (f.allapot === "kesz") continue;
      f.figyelmeztetesek.forEach((x, i) => {
        const tipus = FIGY_TIPUS[x.kod] ?? "hianyzo_cim";
        ki.push({ kulcs: `fig-${f.kulcs}-${i}`, tipus, sulyos: SULYOS[tipus], jarmuKod: k.kod, szint: "feladat", feladatKulcs: f.kulcs, megbizasId: f.megbizasId, szoveg: `${knev} ${nev}: ${x.szoveg}` });
      });
    }
    const nyitott = k.feladatok.filter((f) => f.allapot !== "kesz");
    const fr = gpsFrissesseg(k.gps?.utolsoAdat, mostMs, adat.beallitas.gpsKesoiPerc, adat.beallitas.gpsElavultPerc);
    if (nyitott.length > 0 && (fr === "elavult" || fr === "nincs")) {
      ki.push({
        kulcs: `gps-${k.kod}`, tipus: "gps", sulyos: false, jarmuKod: k.kod, szint: "kocsi", feladatKulcs: nyitott[0].kulcs, megbizasId: null,
        szoveg: fr === "nincs"
          ? `${knev}: nincs GPS-jel${k.vanGpsEszkoz ? (k.gpsHiba ? ` (${k.gpsHiba})` : "") : " — nincs Ecofleet-eszköz"}`
          : `${knev}: elavult GPS-jel (${korSzoveg(k.gps?.utolsoAdat, mostMs)}, határ ${adat.beallitas.gpsElavultPerc} perc)`,
      });
    }
  });
  for (const m of adat.kocsiNelkul) {
    ki.push({
      kulcs: `nk-${m.id}`, tipus: "kocsi_nelkul", sulyos: false, jarmuKod: null, szint: "flotta", feladatKulcs: null, megbizasId: m.id,
      szoveg: `#${m.id} ${m.partner ?? ""} ${varos ? `${varos(m.honnan)} → ${varos(m.hova)}` : `${m.honnan ?? "?"} → ${m.hova ?? "?"}`}: nincs kocsihoz rendelve`.replace(/\s+/g, " "),
    });
  }
  const kocsiRend = new Map(adat.kocsik.map((k, i) => [k.kod, i]));
  return ki
    .map((p, i) => ({ p, i }))
    .sort((a, b) =>
      Number(b.p.sulyos) - Number(a.p.sulyos)
      || TIPUS_REND.indexOf(a.p.tipus) - TIPUS_REND.indexOf(b.p.tipus)
      || (kocsiRend.get(a.p.jarmuKod ?? "") ?? 99) - (kocsiRend.get(b.p.jarmuKod ?? "") ?? 99)
      || a.i - b.i)
    .map(({ p }) => p);
}

/**
 * A ▲ (problémás) jelet kapó feladatok: PONTOSAN a probléma-lista feladat-szintű
 * elemei. A kocsi-szintű (GPS) probléma nem jelöl meg feladatot — különben a
 * jel olyan feladaton is ott volt, amelyhez a sávban nincs saját sor.
 */
export function problemasFeladatKulcsok(lista: readonly Problema[]): Set<string> {
  return new Set(lista.flatMap((p) => (p.szint === "feladat" && p.feladatKulcs ? [p.feladatKulcs] : [])));
}

/** A kijelölt feladat problémái: a sajátjai, és külön a kocsijára szólók. */
export function feladatProblemai(lista: readonly Problema[], f: { kulcs: string; jarmuKod: string }): { sajat: Problema[]; kocsi: Problema[] } {
  return {
    sajat: lista.filter((p) => p.szint === "feladat" && p.feladatKulcs === f.kulcs),
    kocsi: lista.filter((p) => p.szint === "kocsi" && p.jarmuKod === f.jarmuKod),
  };
}

// ------------------------------------------------------------------ szűrők

export type Nezet = "idovonal" | "het" | "lista" | "terkep";
export const NEZETEK: { kulcs: Nezet; cimke: string }[] = [
  { kulcs: "idovonal", cimke: "Idővonal" },
  { kulcs: "het", cimke: "Heti beosztás" },
  { kulcs: "lista", cimke: "Lista" },
  { kulcs: "terkep", cimke: "Térkép" },
];

export type StatuszSzuro = DiszFeladatAllapot | "problema";

export type Szuro = { jarmu: string; sofor: string; partner: string; telephely: string; statusz: StatuszSzuro | "" };

export const URES_SZURO: Szuro = { jarmu: "", sofor: "", partner: "", telephely: "", statusz: "" };

const STATUSZOK: StatuszSzuro[] = ["kesz", "folyamatban", "tervezett", "problema"];

/** URL-paraméterekből (a hibás értéket elhagyja). */
export function szuroUrlbol(p: { get(k: string): string | null }): Szuro {
  const s = (k: string) => (p.get(k) ?? "").trim().slice(0, 80);
  const statusz = s("statusz") as StatuszSzuro;
  return { jarmu: s("jarmu"), sofor: s("sofor"), partner: s("partner"), telephely: s("telephely"), statusz: STATUSZOK.includes(statusz) ? statusz : "" };
}

/** Szűrő + nap + nézet → URL-paraméterek (az üreseket és az alapértékeket kihagyja). */
export function szuroUrlbe(sz: Szuro, extra: { nap?: string | null; nezet?: Nezet | null } = {}): URLSearchParams {
  const q = new URLSearchParams();
  if (extra.nap) q.set("nap", extra.nap);
  if (extra.nezet && extra.nezet !== "idovonal") q.set("nezet", extra.nezet);
  for (const k of ["jarmu", "sofor", "partner", "telephely", "statusz"] as const) if (sz[k]) q.set(k, sz[k]);
  return q;
}

export function nezetUrlbol(v: string | null | undefined): Nezet {
  return v === "het" || v === "lista" || v === "terkep" ? v : "idovonal";
}

const kis = (s: string | null | undefined) => (s ?? "").toLocaleLowerCase("hu-HU").trim();

/**
 * A szűrők alkalmazása: a jármű és a sofőr a sávokat szűri (a többi kocsi
 * eltűnik), a partner, a telephely és a státusz a feladatokat (a sáv
 * megmarad, legfeljebb üres). A „problema” státusz a probléma-sáv
 * feladatait tartja meg.
 */
export function alkalmazSzurot(kocsik: DiszKocsi[], sz: Szuro, problemasFeladatok: ReadonlySet<string> = new Set()): DiszKocsi[] {
  return kocsik
    .filter((k) => !sz.jarmu || k.kod === sz.jarmu)
    .filter((k) => !sz.sofor || kis(k.sofor) === kis(sz.sofor))
    .map((k) => ({
      ...k,
      feladatok: k.feladatok.filter((f) =>
        (!sz.partner || kis(f.partner) === kis(sz.partner))
        && (!sz.telephely || f.telephelyek.some((t) => kis(t) === kis(sz.telephely)))
        && (!sz.statusz || (sz.statusz === "problema" ? problemasFeladatok.has(f.kulcs) : f.allapot === sz.statusz))),
    }));
}

export function vanSzuro(sz: Szuro): boolean {
  return !!(sz.jarmu || sz.sofor || sz.partner || sz.telephely || sz.statusz);
}

// ------------------------------------------------------------------ idővonal-geometria

export type Tengely = { tol: number; ig: number };

/** A blokk kezdete és vége percben (tény, ha van, különben terv); null, ha nincs ideje. */
export function feladatIdoszak(f: Pick<DiszFeladat, "tervIndulas" | "tervErkezes" | "tenyIndulas" | "tenyErkezes" | "eta">, nap: string): { kezd: number; veg: number } | null {
  const x = feladatIdok(f);
  const kezd = percANapban(x.kezd, nap);
  const veg = percANapban(x.veg, nap);
  if (kezd == null && veg == null) return null;
  const k = kezd ?? (veg as number) - 30;
  const v = veg != null && veg > k ? veg : k + 30;
  return { kezd: k, veg: v };
}

/**
 * Az időtengely: a nap feladataihoz (és ma a „most”-hoz) igazítva, egész
 * órákra kerekítve, egy óra ráhagyással, legalább 8 órás, 0–24 közé vágva.
 * Feladat nélkül a teljes nap.
 */
export function idoTengely(idoszakok: { kezd: number; veg: number }[], mostPerc: number | null): Tengely {
  const pontok = idoszakok.flatMap((x) => [x.kezd, x.veg]);
  if (mostPerc != null && mostPerc >= 0 && mostPerc <= 1440) pontok.push(mostPerc);
  if (idoszakok.length === 0) return { tol: 0, ig: 1440 };
  let tol = Math.max(0, Math.floor(Math.min(...pontok) / 60) * 60 - 60);
  let ig = Math.min(1440, Math.ceil(Math.max(...pontok) / 60) * 60 + 60);
  if (ig - tol < 480) {
    const kozep = (tol + ig) / 2;
    tol = Math.max(0, Math.floor((kozep - 240) / 60) * 60);
    ig = Math.min(1440, tol + 480);
    tol = Math.max(0, ig - 480);
  }
  return { tol, ig };
}

/** Blokk-hely százalékban a tengelyen (a tengelyen kívüli rész levágva). Legalább 1,5% széles. */
export function blokkHely(x: { kezd: number; veg: number }, t: Tengely): { bal: number; szel: number; levagvaBal: boolean; levagvaJobb: boolean } {
  const hossz = t.ig - t.tol;
  const k = Math.max(t.tol, Math.min(t.ig, x.kezd));
  const v = Math.max(t.tol, Math.min(t.ig, x.veg));
  let bal = ((k - t.tol) / hossz) * 100;
  let szel = ((v - k) / hossz) * 100;
  if (szel < 1.5) {
    szel = 1.5;
    if (bal + szel > 100) bal = 100 - szel;
  }
  return { bal: Math.round(bal * 100) / 100, szel: Math.round(szel * 100) / 100, levagvaBal: x.kezd < t.tol, levagvaJobb: x.veg > t.ig };
}

/** Átfedő blokkok külön sorba (mohó: az első sor, ahol az előző már véget ért). Visszaadja a sorindexeket. */
export function sorokraBont(idoszakok: { kezd: number; veg: number }[]): number[] {
  const sorVegek: number[] = [];
  const rend = idoszakok.map((x, i) => ({ ...x, i })).sort((a, b) => a.kezd - b.kezd || a.i - b.i);
  const ki = new Array<number>(idoszakok.length).fill(0);
  for (const x of rend) {
    let s = sorVegek.findIndex((v) => v <= x.kezd);
    if (s < 0) { s = sorVegek.length; sorVegek.push(x.veg); } else sorVegek[s] = x.veg;
    ki[x.i] = s;
  }
  return ki;
}

/**
 * A tengely felirat-jelölői a „most” címke mellett: azok az órák maradnak ki,
 * amelyek feliratát a „most HH:MM” címke takarná (a tengely `tavolsag`
 * hányadán belül vannak). A rácsvonalak maradnak (oraJelolok).
 */
export function oraFeliratok(t: Tengely, mostPerc: number | null, tavolsag = 0.08): number[] {
  const hossz = t.ig - t.tol;
  if (mostPerc == null || mostPerc < t.tol || mostPerc > t.ig) return oraJelolok(t);
  return oraJelolok(t).filter((p) => Math.abs(p - mostPerc) / hossz >= tavolsag);
}

/**
 * A sorokba bontáshoz a blokkot legalább `minHanyad`-nyi tengelyhosszra
 * szélesítjük — a minimális chip-szélesség miatt a rövid feladat se lógjon rá
 * a következőre ugyanabban a sorban.
 */
export function minSzelesIdoszak(x: { kezd: number; veg: number }, t: Tengely, minHanyad = 0.09): { kezd: number; veg: number } {
  return { kezd: x.kezd, veg: Math.max(x.veg, x.kezd + (t.ig - t.tol) * minHanyad) };
}

/** A tengely óra-jelölői (2 óránként, 12 óránál hosszabb tengelyen 3 óránként). */
export function oraJelolok(t: Tengely): number[] {
  const lepes = t.ig - t.tol > 720 ? 180 : 120;
  const ki: number[] = [];
  for (let p = Math.ceil(t.tol / lepes) * lepes; p <= t.ig; p += lepes) ki.push(p);
  return ki;
}

// ------------------------------------------------------------------ lista-rendezés

export type ListaOszlop = "jarmu" | "sorszam" | "tipus" | "partner" | "felrako" | "lerako" | "ablak" | "statusz" | "km" | "koltseg";
export type ListaSor = DiszFeladat & { jarmuCimke: string; jarmuIndex: number };

function rendezoErtek(s: ListaSor, o: ListaOszlop): string | number | null {
  switch (o) {
    case "jarmu": return s.jarmuIndex;
    case "sorszam": return s.sorszam;
    case "tipus": return FELADAT_TIPUS_CIMKE[s.tipus];
    case "partner": return s.partner ? kis(s.partner) : null;
    case "felrako": return s.honnan ? kis(s.honnan) : null;
    case "lerako": return s.hova ? kis(s.hova) : null;
    case "ablak": return pgIdo(s.felrakasAblak.tol ?? s.lerakasAblak.tol ?? s.tervIndulas)?.getTime() ?? null;
    case "statusz": return ["folyamatban", "tervezett", "kesz"].indexOf(s.allapot);
    case "km": return (s.uresKm ?? 0) + (s.rakottKm ?? 0) || null;
    case "koltseg": return s.koltseg?.ft ?? null;
  }
}

/** Stabil rendezés; az üres érték mindig a végére kerül. */
export function rendezLista(sorok: ListaSor[], o: ListaOszlop, irany: "asc" | "desc"): ListaSor[] {
  const szor = irany === "asc" ? 1 : -1;
  return sorok
    .map((s, i) => ({ s, i, v: rendezoErtek(s, o) }))
    .sort((a, b) => {
      if (a.v == null && b.v == null) return a.i - b.i;
      if (a.v == null) return 1;
      if (b.v == null) return -1;
      const c = typeof a.v === "number" && typeof b.v === "number" ? a.v - b.v : String(a.v).localeCompare(String(b.v), "hu");
      return c !== 0 ? c * szor : a.i - b.i;
    })
    .map(({ s }) => s);
}
