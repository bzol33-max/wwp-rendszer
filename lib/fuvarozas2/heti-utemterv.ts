import "server-only";

// Hét nézet · Rács 2.0 (docs/het-racs-2-terv.md, „Betöltő”): kocsinként a
// gördülő ablak fuvarjaiból a becslő motor (heti-utemterv-alap.ts utemterv())
// bemenete — megállók időablakkal, tanult rakodási idő, HU-GO menetidő a
// GPS-ből tanult kalibrációval, díj forintban, a kocsi kezdő állapota és a
// kamionstop-ablakok. Csak olvas. Nem "use server": a hívó (tervezes-het.ts)
// már ellenőrizte a jogot.
//
// Időkeret: egy útvonal-szakasz legfeljebb 3 mp, a teljes számítás 6 mp; ami
// addig nem jön meg, az légvonal × 1,3 (legvonalKm) és 65 km/h becslés
// (`becsles: true`). A lekért HU-GO válasz a háttérben is gyorsítótárba kerül,
// így a következő betöltésnél már pontos.

import { query } from "@/lib/db";
import { getFuvarBeallitasok } from "@/lib/beallitasok/fuvar";
import { calculateToll, FIXED_VEHICLE } from "@/lib/fuvarozas/utdijkalkulacio";
import { geokodolCachelve } from "@/lib/fuvarozas/erintes-felismeres";
import { tanultRakodas, type TanultRakodasIdo } from "@/lib/fuvarozas/eta-lanc";
import { szamitsKalibraciot, tanultRakodasIdok } from "@/lib/fuvarozas/menetido-tanulas";
import { getEurArfolyamok } from "@/lib/fuvarozas/arfolyam";
import { parseIdopontSzoveg } from "@/lib/fuvarozas/idovonal";
import { varosNev } from "@/lib/fuvarozas/varos";
import { legutobbiTacho } from "@/lib/jarmu-telemetria/repo";
import { tachoFriss } from "@/lib/ecofleet/szamitas";
import { dijFtban } from "@/lib/fuvarozas2/kalkulacio-tar";
import { tilalmiAblakok } from "@/lib/fuvarozas2/kamionstop";
import { legvonalKm, type Pont } from "@/lib/fuvarozas2/tervezo-alap";
import { fuvarJel, napBelulFuzve, type HetiFuvar } from "@/lib/fuvarozas2/tervezes-het-alap";
import {
  lancKiindulasok, raallasSzakasz, utemterv,
  type KocsiUtemterv, type LancHely, type UtemFuvar, type UtemKezdes, type UtemMegallo, type UtemParam,
} from "@/lib/fuvarozas2/heti-utemterv-alap";
import {
  bejegyzesFoglalas, bejegyzesFuvarId, bejegyzesMegallo, bejegyzesPerc, idoSzerintBeszur, tavolletFoglalas, tipusNev,
  type Bejegyzes,
} from "@/lib/fuvarozas2/bejegyzes-alap";

/** Egy fuvar a betöltőtől: a Hét rács fuvarja + a díj és a nyers címek. */
export type UtemSor = HetiFuvar & {
  jelleg: "ber" | "sajat";
  fuvardij: number | null;
  penznem: string;
  felrako: string | null;
  lerako: string | null;
};

export type UtemKocsiBemenet = {
  kod: string;
  /** A kocsi összes betöltött fuvarja (a szűrés és a sorrend itt történik, mint a hetiReszek-ben). */
  fuvarok: UtemSor[];
  /** A kocsi utolsó ismert lerakója az ablak előtt — ugyanaz, mint a rés-számításé. */
  elozoVeg: { pont: Pont; varos: string } | null;
  /** B1: a kocsi bejegyzés-alkalmai az ablakban (megálló vagy foglalt időszak lesz belőlük). */
  bejegyzesek?: Bejegyzes[];
  /** B1: a sofőr távolléti napjai (foglalt időszak). */
  tavolletNapok?: string[];
};

export type UtemBemenet = {
  napok: string[];
  ma: string;
  /** Most, helyi Budapest „YYYY-MM-DDTHH:MM”. */
  most: string;
  telephely: { pont: Pont; varos: string };
  kocsik: UtemKocsiBemenet[];
};

export type UtemOpciok = { teljesMs?: number; szakaszMs?: number };

const TELJES_MS = 6000;
const SZAKASZ_MS = 3000;
const KALIBRACIO_MS = 1500;
const TARTALEK_SZORZO = 1.15;
const BECSLES_KMH = 65;
/** Koordináta nélküli rakott szakaszra (mint az idővonal-becslés ALAPERTELMEZETT_UTVONAL_PERC). */
const ISMERETLEN_SZAKASZ_PERC = 120;
const NAP_KEZDES = "06:00";
const PARHUZAMOS_HIVAS = 6;

type MegalloSor = {
  megbizas_id: string; tipus: "felrako" | "lerako"; cim_nyers: string; telepules: string | null;
  lat: number | null; lon: number | null; tervezett_nap: string | null;
  ablak_tol: string | null; ablak_ig: string | null; kesz: boolean;
};
type MegbizasSor = {
  id: string; fel_tol: string | null; fel_ig: string | null; le_tol: string | null; le_ig: string | null; idopont: string | null;
};

type Szakasz = { perc: number; km: number; becsles: boolean };
type MunkaMegallo = UtemMegallo & { pont: Pont | null; cim: string; kesz: boolean };

function idokorlat<T>(p: Promise<T>, ms: number, tartalek: T): Promise<T> {
  const biztos = p.catch(() => tartalek); // a későn elbukó hívás se legyen kezeletlen elutasítás
  if (ms <= 0) return Promise.resolve(tartalek);
  let t: ReturnType<typeof setTimeout> | undefined;
  const ido = new Promise<T>((r) => { t = setTimeout(() => r(tartalek), ms); });
  return Promise.race([biztos, ido]).finally(() => clearTimeout(t));
}

const helyiIdo = (oszlop: string) => `to_char(${oszlop} at time zone 'Europe/Budapest', 'YYYY-MM-DD"T"HH24:MI')`;

const pontKulcs = (p: Pont) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;

function becsultSzakasz(a: Pont, b: Pont): Szakasz {
  const km = legvonalKm(a, b); // már × 1,3 (KOZUTI_SZORZO)
  return { km, perc: Math.round((km / BECSLES_KMH) * 60), becsles: true };
}

/** Egyszerű korlátozott párhuzamosságú végrehajtás. */
async function sorban<T>(feladatok: (() => Promise<T>)[], egyszerre: number): Promise<T[]> {
  const ki: T[] = new Array(feladatok.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(egyszerre, feladatok.length) }, async () => {
    while (i < feladatok.length) { const n = i++; ki[n] = await feladatok[n](); }
  }));
  return ki;
}

/**
 * Kocsinként az ütemterv (a kód szerint). Egy kocsi hibája csak annak a
 * kocsinak ad null-t; a hívó a teljes számítást is időkorláttal védje.
 */
export async function szamoljUtemtervet(b: UtemBemenet, opciok: UtemOpciok = {}): Promise<Map<string, KocsiUtemterv | null>> {
  const hatarido = Date.now() + (opciok.teljesMs ?? TELJES_MS);
  const maradek = () => hatarido - Date.now();
  const szakaszMs = opciok.szakaszMs ?? SZAKASZ_MS;
  const ki = new Map<string, KocsiUtemterv | null>();
  const { napok, ma } = b;
  if (!napok.length) return ki;
  const elso = napok[0], utolso = napok[napok.length - 1];
  // Ha az ablak a mai napot is tartalmazza: a lánc most indul, a kész fuvarok/megállók kimaradnak.
  const maMod = elso <= ma && ma <= utolso;

  // 1. Kocsinként az ablak fuvarjai a rés-számítással azonos sorrendben.
  const lancok = b.kocsik.map((k) => {
    const szerint = new Map(k.fuvarok.map((f) => [f.id, f]));
    const heti = napBelulFuzve(
      k.fuvarok.filter((f) => f.felNap <= utolso && f.leNap >= elso)
        .sort((x, y) => x.felNap.localeCompare(y.felNap) || x.leNap.localeCompare(y.leNap)),
      (k.elozoVeg ?? b.telephely).pont
    ).map((f) => szerint.get(f.id)!);
    return { kod: k.kod, elozoVeg: k.elozoVeg, heti, bejegyzesek: k.bejegyzesek ?? [], tavolletNapok: k.tavolletNapok ?? [] };
  });
  const osszes = lancok.flatMap((l) => l.heti);
  const ids = [...new Set(osszes.map((f) => f.id))];

  // 2. Adatok párhuzamosan; a lassú forrásoknak (kalibráció, tachó) saját korlát.
  const eurNapok = osszes.filter((f) => f.jelleg === "ber" && f.penznem === "EUR" && f.fuvardij).map((f) => f.felNap);
  const [megalloSorok, megbizasSorok, beallitas, tanult, kalibracio, tachok, arfolyamok] = await Promise.all([
    ids.length ? query<MegalloSor>(
      `select g.megbizas_id::text, g.tipus, g.cim_nyers, g.telepules, g.lat, g.lon,
         to_char(g.tervezett_nap, 'YYYY-MM-DD') as tervezett_nap,
         ${helyiIdo("g.ablak_tol")} as ablak_tol, ${helyiIdo("g.ablak_ig")} as ablak_ig,
         (g.sofor_kesz_at is not null or g.gps_tavozas is not null) as kesz
       from fuvar_megallok g where g.megbizas_id = any($1::bigint[]) order by g.megbizas_id, g.sorszam`,
      [ids]
    ) : Promise.resolve([] as MegalloSor[]),
    ids.length ? query<MegbizasSor>(
      `select m.id::text, ${helyiIdo("m.felrakas_ablak_tol")} as fel_tol, ${helyiIdo("m.felrakas_ablak_ig")} as fel_ig,
         ${helyiIdo("m.lerakas_ablak_tol")} as le_tol, ${helyiIdo("m.lerakas_ablak_ig")} as le_ig, m.idopont
       from fuvar_megbizasok m where m.id = any($1::bigint[])`,
      [ids]
    ) : Promise.resolve([] as MegbizasSor[]),
    getFuvarBeallitasok(),
    idokorlat(tanultRakodasIdok(), Math.min(KALIBRACIO_MS, maradek()), [] as TanultRakodasIdo[]),
    idokorlat(
      szamitsKalibraciot().then((k) => (k.mintaSzam >= 5 && k.globalisSzorzo > 0 ? k.globalisSzorzo : TARTALEK_SZORZO)),
      Math.min(KALIBRACIO_MS, maradek()), TARTALEK_SZORZO
    ),
    maMod ? idokorlat(legutobbiTacho(), Math.min(KALIBRACIO_MS, maradek()), new Map()) : Promise.resolve(new Map()),
    eurNapok.length ? idokorlat(getEurArfolyamok(eurNapok), Math.min(KALIBRACIO_MS, maradek()), new Map()) : Promise.resolve(new Map()),
  ]);

  const megallokSzerint = new Map<string, MegalloSor[]>();
  for (const m of megalloSorok) {
    const l = megallokSzerint.get(m.megbizas_id) ?? [];
    l.push(m);
    megallokSzerint.set(m.megbizas_id, l);
  }
  const megbizasSzerint = new Map(megbizasSorok.map((m) => [m.id, m]));

  const ervenyes = (n: unknown, alap: number) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : alap);
  const pufferFel = ervenyes(beallitas.felrakas_rahagyas_perc, 60);
  const pufferLe = ervenyes(beallitas.lerakas_rahagyas_perc, 60);
  const rakodas = (tipus: "felrako" | "lerako", varos: string, nyers: string | null) =>
    tanultRakodas(varos, nyers, tanult) ?? (tipus === "felrako" ? pufferFel : pufferLe);

  // 3. Megállók fuvaronként: fuvar_megallok, különben a megbízás fel/le adatai.
  const geokodKell = new Set<string>();
  const megallokFuvar = new Map<string, MunkaMegallo[]>();
  for (const f of osszes) {
    if (megallokFuvar.has(f.id)) continue;
    const mb = megbizasSzerint.get(f.id);
    const ido = parseIdopontSzoveg(mb?.idopont ?? null);
    const idopontAblak = ido ? `${f.felNap}T${String(ido.ora).padStart(2, "0")}:${String(ido.perc).padStart(2, "0")}` : null;
    const sorok = megallokSzerint.get(f.id) ?? [];
    let lista: MunkaMegallo[];
    if (sorok.length) {
      lista = sorok.map((s) => {
        const varos = (s.telepules?.trim() || varosNev(s.cim_nyers)) || "?";
        return {
          tipus: s.tipus, varos, cim: s.cim_nyers,
          nap: s.tervezett_nap ?? (s.tipus === "felrako" ? f.felNap : f.leNap),
          ablakTol: s.ablak_tol, ablakIg: s.ablak_ig,
          rakodasPerc: rakodas(s.tipus, varos, s.cim_nyers),
          pont: s.lat != null && s.lon != null ? { lat: Number(s.lat), lon: Number(s.lon) } : null,
          kesz: !!s.kesz,
        };
      });
      // Az első felrakó ablaka helyett a megbízás „Időpont” mezője, ha más nincs.
      const elsoFel = lista.find((m) => m.tipus === "felrako");
      if (elsoFel && !elsoFel.ablakTol && !elsoFel.ablakIg && idopontAblak && elsoFel.nap === f.felNap) elsoFel.ablakTol = idopontAblak;
      // A lekérdezés első felrakó / utolsó lerakó pontja már geokódolt lehet (tervezes-het.ts).
      const elsoF = lista.findIndex((m) => m.tipus === "felrako");
      if (elsoF >= 0 && !lista[elsoF].pont && f.fel) lista[elsoF].pont = f.fel;
      const utolsoL = lista.map((m) => m.tipus).lastIndexOf("lerako");
      if (utolsoL >= 0 && !lista[utolsoL].pont && f.le) lista[utolsoL].pont = f.le;
    } else {
      lista = [
        {
          tipus: "felrako", varos: f.felVaros, cim: f.felrako ?? "", nap: f.felNap,
          ablakTol: mb?.fel_tol ?? (mb?.fel_ig ? null : idopontAblak), ablakIg: mb?.fel_ig ?? null,
          rakodasPerc: rakodas("felrako", f.felVaros, f.felrako), pont: f.fel, kesz: false,
        },
        {
          tipus: "lerako", varos: f.leVaros, cim: f.lerako ?? "", nap: f.leNap,
          ablakTol: mb?.le_tol ?? null, ablakIg: mb?.le_ig ?? null,
          rakodasPerc: rakodas("lerako", f.leVaros, f.lerako), pont: f.le, kesz: false,
        },
      ];
    }
    for (const m of lista) if (!m.pont && m.cim.trim()) geokodKell.add(m.cim);
    megallokFuvar.set(f.id, lista);
  }

  // 3/b. B1: a hellyel, időponthoz kötött bejegyzés megálló lesz (odamegy, ott tölti az időt) — a helyét is geokódoljuk.
  const bejegyzesSor = (bj: Bejegyzes): UtemSor => {
    const varos = varosNev(bj.hely ?? "") || bj.hely || "?";
    return {
      id: bejegyzesFuvarId(bj), cim: tipusNev(bj.tipus), felVaros: varos, leVaros: varos, fel: null, le: null,
      felNap: bj.alkalom, leNap: bj.alkalom, sajat: true, allapot: "tervezett",
      jelleg: "sajat", fuvardij: null, penznem: "Ft", felrako: bj.hely, lerako: bj.hely,
    };
  };
  for (const l of lancok) {
    for (const bj of l.bejegyzesek) {
      if (!bejegyzesMegallo(bj)) continue;
      const sor = bejegyzesSor(bj);
      // Ma-módban a már elkezdett (folyamatban lévő) bejegyzés „kész” megálló: a kocsi ott van,
      // a hátralévő idő foglalt időszak lesz (QA2 #3).
      megallokFuvar.set(sor.id, [{
        tipus: "felrako", varos: sor.felVaros, cim: bj.hely ?? "", nap: bj.alkalom,
        ablakTol: `${bj.alkalom}T${bj.tol}`, ablakIg: `${bj.alkalom}T${bj.tol}`,
        rakodasPerc: bejegyzesPerc(bj) ?? 0, allasnakSzamit: true, pont: null, kesz: maMod && `${bj.alkalom}T${bj.tol}` <= b.most,
      }]);
      if (bj.hely?.trim()) geokodKell.add(bj.hely);
    }
  }

  // 4. Hiányzó pontok geokódolása (gyorsítótárazott; szakaszonkénti és teljes korláttal).
  const geokod = new Map<string, Pont | null>();
  await sorban([...geokodKell].map((cim) => async () => {
    if (maradek() < 200) { geokod.set(cim, null); return; }
    const g = await idokorlat(geokodolCachelve(cim), Math.min(szakaszMs, maradek()), null);
    geokod.set(cim, g ? { lat: g.lat, lon: g.lon } : null);
  }), PARHUZAMOS_HIVAS);
  for (const lista of megallokFuvar.values()) {
    for (const m of lista) if (!m.pont && m.cim.trim()) m.pont = geokod.get(m.cim) ?? null;
  }

  // 5. Láncok: kész fuvarok/megállók kiszűrése (ma-módban), szakasz-igények.
  type Lanc = { kod: string; fuvarok: { f: UtemSor; megallok: MunkaMegallo[]; honnan: LancHely; raallasRakott: boolean }[] };
  // B1: a megtalált helyű bejegyzés megálló (idő szerint a fuvarok közé); a többi + távollét foglalt időszak.
  const foglaltKocsi = new Map<string, { tol: string; ig: string }[]>();
  const lancLista: Lanc[] = lancok.map((l) => {
    const foglalt = l.tavolletNapok.map((n) => tavolletFoglalas(n, NAP_KEZDES));
    const ujak: { elem: UtemSor; kulcs: string }[] = [];
    for (const bj of l.bejegyzesek) {
      const id = bejegyzesFuvarId(bj);
      const m = megallokFuvar.get(id)?.[0];
      if (m?.pont) {
        ujak.push({ elem: bejegyzesSor(bj), kulcs: m.ablakTol ?? `${bj.alkalom}T${NAP_KEZDES}` });
        if (m.kesz && `${bj.alkalom}T${bj.ig}` > b.most) foglalt.push(bejegyzesFoglalas(bj, NAP_KEZDES));
      } else foglalt.push(bejegyzesFoglalas(bj, NAP_KEZDES));
    }
    foglaltKocsi.set(l.kod, foglalt);
    const kezdoKulcs = (f: UtemSor) => {
      const ms = megallokFuvar.get(f.id) ?? [];
      // Ma-módban az elkezdett (már van kész megállója) élő fuvar marad elöl: a lánc onnan indul (QA2 #1).
      if (maMod && ms.some((x) => x.kesz) && ms.some((x) => !x.kesz) && fuvarJel(f.allapot) !== "kesz") return "";
      const m = (maMod ? ms.find((x) => !x.kesz) : undefined) ?? ms[0];
      return m ? m.ablakTol ?? `${m.nap}T${NAP_KEZDES}` : `${f.felNap}T${NAP_KEZDES}`;
    };
    const sor = idoSzerintBeszur(l.heti, kezdoKulcs, ujak);
    return {
      kod: l.kod,
      fuvarok: lancKiindulasok(
        sor.map((f) => {
          const mind = megallokFuvar.get(f.id) ?? [];
          const bejegyzes = f.id.startsWith("bej:");
          return { f, mind, keszFuvar: bejegyzes ? mind.every((x) => x.kesz) : fuvarJel(f.allapot) === "kesz", le: bejegyzes ? mind[0]?.pont ?? null : f.le };
        }),
        l.elozoVeg ?? b.telephely,
        maMod
      ),
    };
  });

  const igenyek = new Map<string, { a: Pont; b: Pont }>();
  const igeny = (a: Pont | null, c: Pont | null) => {
    if (!a || !c) return;
    igenyek.set(`${pontKulcs(a)}>${pontKulcs(c)}`, { a, b: c });
  };
  for (const l of lancLista) {
    for (const { megallok, honnan } of l.fuvarok) {
      igeny(honnan.pont, megallok[0]?.pont ?? null);
      for (let i = 1; i < megallok.length; i++) igeny(megallok[i - 1].pont, megallok[i].pont);
    }
  }

  // 6. Menetidők: HU-GO × kalibráció, korláton túl becslés.
  const szakaszok = new Map<string, Szakasz>();
  await sorban([...igenyek.entries()].map(([kulcs, { a, b: c }]) => async () => {
    const becsles = becsultSzakasz(a, c);
    if (becsles.km < 2) { szakaszok.set(kulcs, { km: becsles.km, perc: becsles.perc, becsles: false }); return; }
    if (maradek() < 200) { szakaszok.set(kulcs, becsles); return; } // kifutott a teljes keret
    const route = await idokorlat(
      calculateToll({ points: [{ lon: a.lon, lat: a.lat }, { lon: c.lon, lat: c.lat }], ...FIXED_VEHICLE }),
      Math.min(szakaszMs, maradek()), null
    );
    szakaszok.set(kulcs, route
      ? { km: Math.round(route.distanceKm), perc: Math.round(route.durationMin * kalibracio), becsles: false }
      : becsles);
  }), PARHUZAMOS_HIVAS);
  const ismertSzakasz = (a: Pont, c: Pont): Szakasz => szakaszok.get(`${pontKulcs(a)}>${pontKulcs(c)}`) ?? becsultSzakasz(a, c);
  const szakaszKi = (a: Pont | null, c: Pont | null, alapPerc: number): Szakasz =>
    a && c ? ismertSzakasz(a, c) : { km: 0, perc: alapPerc, becsles: true };

  // 7. Paraméterek és kezdés. A beállítható szabályértékek (fuvar_beallitas) mindenhol a
  // beállításból jönnek — a tachó-kezdőérték is a beállított napi keretből számol; a szünet
  // (45) és a napi pihenő (660) nem beállítható (mint az actions.ts láncszabályában).
  const param: UtemParam = {
    napKezdes: NAP_KEZDES,
    szunetUtanPerc: ervenyes(beallitas.szunet_utan_perc, 270),
    szunetPerc: 45,
    napiMaxPerc: ervenyes(beallitas.sofor_napi_vezetes_max_perc, 540),
    napiPihenoPerc: 660,
    tilalmak: tilalmiAblakok(napEltol(elso, -1), napEltol(utolso, 1)),
  };
  const mostDate = new Date();

  for (const l of lancLista) {
    try {
      const fuvarok: UtemFuvar[] = l.fuvarok.filter((x) => x.megallok.length > 0).map(({ f, megallok, honnan, raallasRakott }) => ({
        id: f.id,
        cim: f.cim,
        jelleg: f.jelleg,
        dijFt: f.jelleg === "ber" ? dijFtban(f.fuvardij, f.penznem, arfolyamok.get(f.felNap) ?? null) : null,
        megallok: megallok.map(({ tipus, varos, nap, ablakTol, ablakIg, rakodasPerc, allasnakSzamit }) => ({ tipus, varos, nap, ablakTol, ablakIg, rakodasPerc, ...(allasnakSzamit ? { allasnakSzamit } : {}) })),
        szakaszok: megallok.slice(1).map((m, i) => szakaszKi(megallok[i].pont, m.pont, ISMERETLEN_SZAKASZ_PERC)),
        raallas: raallasSzakasz(honnan, megallok[0], ismertSzakasz, ISMERETLEN_SZAKASZ_PERC),
        ...(raallasRakott ? { raallasRakott: true } : {}),
      }));
      let kezdes: UtemKezdes = { ido: `${elso}T${NAP_KEZDES}`, folyamatosPerc: 0, napiPerc: 0 };
      if (maMod) {
        const t = tachok.get(l.kod)?.tacho;
        const hatra = t && tachoFriss(t, mostDate, 15) ? t.napiVezetesHatraPerc : null;
        // napiPerc: a beállított napi keretből a tachó szerinti hátralévőt levonva (régi tachó → 0).
        // folyamatosPerc: 0 — a tachó-adatban nincs „utolsó szünet óta vezetett” mező.
        kezdes = { ido: b.most, folyamatosPerc: 0, napiPerc: hatra != null ? Math.max(0, Math.round(param.napiMaxPerc - hatra)) : 0 };
      }
      ki.set(l.kod, utemterv(fuvarok, kezdes, { ...param, foglalt: foglaltKocsi.get(l.kod) ?? [] }, napok));
    } catch {
      ki.set(l.kod, null);
    }
  }
  return ki;
}

function napEltol(nap: string, n: number): string {
  const d = new Date(`${nap}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
