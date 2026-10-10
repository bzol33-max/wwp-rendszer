// Menetterv — az optimalizáló (4. fázis, 2026-10-10). TISZTA modul: nincs
// adatbázis, nincs hálózat; a távolság-/idő-/útdíj-függvényt a hívó adja
// (szerveren HU-GO a kulso-hivas gyorsítótárával, légvonal × 1,3 tartalékkal,
// 'becsles' jelöléssel — lib/menet/optimalizalo-szerver.ts). Teszt:
// scripts/teszt-optimalizalo.ts.
//
// CSAK JAVASLAT: az eredményt a szerver 'nyitott' optimalizalo_javaslat
// sorként tárolja; jóváhagyott menetet csak az ember „Elfogadás” gombja
// rendez át, a meglévő átrendezés-úton (verzióval, indokkal, naplóval).
//
// CÉLFÜGGVÉNY (minimalizálandó, minden tag Ft-ban):
//   J = üzemanyag + útdíj + napi + késés-büntetés + várakozás-büntetés
//       + hazaút − saját érték
//   • üzemanyag = (üres km + rakott km) × fogyasztás/100 × gázolajár
//     (fogyasztás: a kocsi mért / saját értéke, különben a beállítás, 28 l/100);
//   • útdíj = szakaszonként a HU-GO-ból, ha az nincs: km × flottaátlag Ft/km;
//   • napi = napi költség × napok (egy kocsi-nap = 1 nap; a napi költség
//     FIX, mint a Tervezésben — a kocsi akkor is költ, ha áll —, ezért a
//     hozzárendelés határköltségében kiesik);
//   • késés-büntetés = w_késés × Σ késés perc — a késés KEMÉNY korlát, ez a
//     tag csak a (már eleve késő) jelenlegi terv kiírásához kell;
//   • várakozás-büntetés = w_vár × Σ várakozás perc (ablak előtti állás);
//   • hazaút = w_haza × az utolsó helyről a kocsi telephelyéig km (a hazaút
//     km-je NEM szerepel az üzemanyag/útdíj tagban — w_haza alapból épp
//     az üzemanyag + útdíj km-enként);
//   • saját érték = p × Σ saját fuvar rakott km × saját fuvar Ft/km
//     (p = prioritas_sajat_vs_ber) — a sorrendben állandó, a
//     hozzárendelésnél számít.
//
// KEMÉNY KORLÁTOK (megsértésük → a sorrend nem megengedett):
//   • késés: érkezés a felrakóra az ablak vége (ha nincs, az időpont) után,
//     a lerakóra a lerakási ablak vége után;
//   • kapacitás: raklap db / raklaphely a pótkocsin (660/812 db, 33/28 hely —
//     a nagyobbik, forgatott határ is elfogadott, mint a menet-alap.ts-ben);
//   • lerakó csak a saját felrakója után (munka-szintű sorrendnél szerkezetileg
//     teljesül, a szimuláció mégis ellenőrzi);
//   • a már elkezdett / lezárt munkák (tény, lezárt állapot, lezárt feladat)
//     a mostani sorrendben a helyükön maradnak (az utolsóig minden előtag
//     rögzített); a korábbról hozott rakomány mozgatható, de a kocsin van
//     (a kapacitásba számít, amíg le nem rakják); a későbbi napra átnyúló
//     munka a nap végén marad;
//   • vezetési idő: ≤ sofor_napi_vezetes_max_perc (540) naponta, és
//     szunet_utan_perc (270) folyamatos vezetés után 45 perc szünet (a
//     szimuláció beszúrja; ≥ 45 perc várakozás szünetnek számít). BECSLÉS:
//     a HU-GO / terv menetidejéből, nem tachográf-adat.
// FIGYELMEZTETÉS (nem blokkol): az első üres indulás > 30 km (beállítás), és
// a felrakó a legközelebbi saját telephelytől is messzebb van.
//
// ÉRKEZÉS AZ ABLAK VÉGÉRE (a tulajdonos diszpécser-elve): a nap első időzített
// megállójára a terv az ablak VÉGÉRE érkezik (nincs sorban állás); ha így
// valami később késne, az ablak elejére (mindkettőt kiértékeljük, a jobbat
// tartjuk). Utána az ablak előtti érkezés várakozásnak számít.
//
// ALGORITMUSOK:
//   (a) egy kocsi egy napja: ≤ 7 mozgatható munkánál az összes permutáció
//       (determinisztikus, lexikografikus sorrend), különben beszúrásos
//       kezdés + 2-opt (szakaszfordítás) + áthelyezés, amíg javul;
//   (b) hozzárendelés: egy új munka legjobb beszúrási helye minden kocsi
//       napjában (a többiek sorrendje marad), és a J határváltozása — a
//       legkisebb határköltségű megengedett kocsi a javaslat (a Tervezés
//       legjobbKocsi szabálya szerint: ütköző/nem megengedett kiesik).

import type { FuvarBeallitasok } from "@/lib/beallitasok/fuvar-alap";
import { KOZUTI_SZORZO, legvonalKm, munkakSorrendben, ugyanazAHely } from "@/lib/menet/menet-alap";
import type { Hely, KmForras, MenetMunka, PotkocsiKapacitas, TelephelyPontAdat } from "@/lib/menet/tipusok";

// ---------------------------------------------------------------- típusok

/** Egy szakasz: közúti km, menetidő (perc, ha ismert), útdíj (Ft, ha ismert), és honnan tudjuk. */
export type Szakasz = { km: number; perc: number | null; utdijFt: number | null; forras: KmForras };
export type SzakaszFn = (honnan: Hely, hova: Hely) => Promise<Szakasz | null>;

export type OptParam = {
  fogyasztasL100: number;
  gazolajFtL: number;
  /** Útdíj km-enként, ha a szakaszra nincs HU-GO érték (flottaátlag). */
  utdijPerKmFt: number;
  napiKoltsegFt: number;
  /** Késés súlya, Ft/perc (csak kiíráshoz — a késés kemény korlát). */
  wKesesFtPerc: number;
  /** Várakozás súlya, Ft/perc. */
  wVarakozasFtPerc: number;
  /** Hazaút súlya, Ft/km. */
  wHazautFtKm: number;
  /** p: saját fuvar súlya (prioritas_sajat_vs_ber). */
  prioritasSajat: number;
  sajatFuvarKmDijFt: number;
  uresIndulasFigyKm: number;
  felrakasPerc: number;
  lerakasPerc: number;
  atlagSebessegKmh: number;
  vezetesMaxPerc: number;
  szunetUtanPerc: number;
  szunetPerc: number;
};

/** Az OptParam a beállításokból (fuvar_beallitas) és a piaci adatokból. */
export function optParamBeallitasbol(
  b: Pick<FuvarBeallitasok,
    "fogyasztas_alap_l_100km" | "napi_koltseg_ft" | "sajat_fuvar_km_dij_ft" | "ures_indulas_figyelmeztetes_km" |
    "felrakas_rahagyas_perc" | "lerakas_rahagyas_perc" | "prioritas_sajat_vs_ber" | "sofor_napi_vezetes_max_perc" | "szunet_utan_perc">,
  x: { gazolajFtL: number; utdijPerKmFt: number; fogyasztasL100?: number | null; atlagSebessegKmh?: number }
): OptParam {
  const fogyasztasL100 = x.fogyasztasL100 != null && x.fogyasztasL100 > 0 ? x.fogyasztasL100 : b.fogyasztas_alap_l_100km;
  const uzemanyagPerKm = (fogyasztasL100 / 100) * x.gazolajFtL;
  // A várakozás egy perce a napi költség egy 10 órás munkanapra vetített perce.
  const wVar = Math.round(b.napi_koltseg_ft / 600);
  return {
    fogyasztasL100,
    gazolajFtL: x.gazolajFtL,
    utdijPerKmFt: x.utdijPerKmFt,
    napiKoltsegFt: b.napi_koltseg_ft,
    wKesesFtPerc: wVar * 10,
    wVarakozasFtPerc: wVar,
    wHazautFtKm: Math.round(uzemanyagPerKm + x.utdijPerKmFt),
    prioritasSajat: b.prioritas_sajat_vs_ber,
    sajatFuvarKmDijFt: b.sajat_fuvar_km_dij_ft,
    uresIndulasFigyKm: b.ures_indulas_figyelmeztetes_km,
    felrakasPerc: b.felrakas_rahagyas_perc,
    lerakasPerc: b.lerakas_rahagyas_perc,
    atlagSebessegKmh: x.atlagSebessegKmh ?? 60,
    vezetesMaxPerc: b.sofor_napi_vezetes_max_perc,
    szunetUtanPerc: b.szunet_utan_perc,
    szunetPerc: 45,
  };
}

/** A célfüggvény tagjai (Ft). `osszesen` = J. */
export type Celfuggveny = {
  uzemanyag: number;
  utdij: number;
  napi: number;
  keses_buntetes: number;
  varakozas_buntetes: number;
  hazaut: number;
  /** Negatív vagy nulla: −p × saját érték. */
  sajat_ertek: number;
  osszesen: number;
};

export type MegalloIdo = { munkaId: string; tipus: "fel" | "le"; erkezes: number | null; kezdes: number | null; varakozasPerc: number; kesesPerc: number };

export type TervErtekeles = {
  /** Megbízás-id-k sorrendben (az egész nap: rögzített előtag + mozgatható + átnyúló vég). */
  sorrend: string[];
  megengedett: boolean;
  /** A megsértett kemény korlátok (magyar szöveg). */
  serulesek: string[];
  /** Nem blokkoló figyelmeztetések. */
  figyelmeztetesek: string[];
  celfuggveny: Celfuggveny;
  uresKm: number;
  rakottKm: number;
  hazaKm: number;
  vezetesPerc: number;
  szunetDb: number;
  varakozasPerc: number;
  kesesPerc: number;
  /** Van-e légvonal × 1,3 becslésű szakasz. */
  becsles: boolean;
  /** Melyik érkezési elv adta: az első időzített megálló ablakának vége vagy eleje. */
  horgony: "ablak_vege" | "ablak_eleje" | "teny" | "nincs";
  megallok: MegalloIdo[];
};

export type OptModszer = "teljes_bejaras" | "beszuras_2opt" | "nincs_mozgathato";

export type SorrendEredmeny = {
  jelenlegi: TervErtekeles;
  /** A legjobb MEGENGEDETT sorrend — null, ha egy sincs. */
  legjobb: TervErtekeles | null;
  modszer: OptModszer;
  /** Hány teljes sorrendet értékelt ki. */
  vizsgalt: number;
  megtakaritasFt: number;
  megtakaritasKm: number;
  /** A rögzített munkák és egyéb megjegyzések (kemény korlátok magyarázata). */
  megjegyzesek: string[];
  /** Ha nincs megengedett sorrend: a legkevésbé rossz (legkisebb J-jű) sorrend megsértett korlátai — a kártya ezt magyarázza. */
  legkevesbeRosszSerulesek: string[];
};

export type OptBemenet = {
  nap: string;
  munkak: MenetMunka[];
  /** A mostani terv megbízás-sorrendje (a menetből); a hiányzók a közös napi szabály szerint a végére. */
  jelenlegiSorrend: readonly string[] | null;
  /** Rögzített munkák (lezárt menet-feladat) id-i — a tény / lezárt állapot magától is rögzít. */
  rogzitett?: readonly string[];
  indulas: Hely;
  /** A kocsi telephelye (hazaút); null: nincs hazaút-tag. */
  haza: Hely | null;
  telephelyek: TelephelyPontAdat[];
  kapacitas: PotkocsiKapacitas | null;
  param: OptParam;
  szakasz: SzakaszFn;
};

/** Teljes bejárás eddig a mozgatható munka-számig. */
export const TELJES_BEJARAS_MAX = 7;
/** Ennyi megtakarítás alatt nincs javaslat (Ft) … */
export const MEGTAKARITAS_KUSZOB_FT = 1000;
/** … vagy ennyi km alatt. */
export const MEGTAKARITAS_KUSZOB_KM = 5;

export const VEZETES_BECSLES_MEGJEGYZES = "A vezetési idő a HU-GO / terv menetidejéből becsült — nem tachográf-adat.";

// ---------------------------------------------------------------- belső: csomópontok és mátrix

type Munka = MenetMunka & { idx: number; hozott: boolean; atnyulo: boolean; rogzitett: boolean };

type Kontextus = {
  nap: string;
  munkak: Munka[];
  param: OptParam;
  kapacitas: PotkocsiKapacitas | null;
  telephelyek: TelephelyPontAdat[];
  /** A csomópontok: 0 = indulás, 1+2i = i. felrakó, 2+2i = i. lerakó, utolsó = haza. */
  helyek: Hely[];
  hazaNode: number | null;
  matrix: Map<string, Szakasz | null>;
};

const fel = (i: number) => 1 + 2 * i;
const le = (i: number) => 2 + 2 * i;
const kulcs = (a: number, b: number) => `${a}>${b}`;

function szakaszKozott(ctx: Kontextus, a: number, b: number): Szakasz | null {
  if (a === b) return { km: 0, perc: 0, utdijFt: 0, forras: "hugo" };
  if (ugyanazAHely(ctx.helyek[a], ctx.helyek[b])) return { km: 0, perc: 0, utdijFt: 0, forras: "hugo" };
  return ctx.matrix.get(kulcs(a, b)) ?? null;
}

const max = (a: number | null, b: number | null) => (a == null ? b : b == null ? a : Math.max(a, b));

async function epitKontextust(be: OptBemenet, munkak: Munka[]): Promise<Kontextus> {
  const helyek: Hely[] = [be.indulas];
  for (const m of munkak) helyek.push(m.felrako, m.lerako);
  let hazaNode: number | null = null;
  if (be.haza && (be.haza.cim?.trim() || be.haza.pont)) {
    hazaNode = helyek.length;
    helyek.push(be.haza);
  }
  const ctx: Kontextus = { nap: be.nap, munkak, param: be.param, kapacitas: be.kapacitas, telephelyek: be.telephelyek, helyek, hazaNode, matrix: new Map() };
  // A szükséges párok: honnan = indulás + minden lerakó; hová = minden felrakó (nem hozott),
  // minden lerakó (hozott), haza; plusz felrakó → saját lerakó.
  const parok: [number, number][] = [];
  const honnan = [0, ...munkak.map((m) => le(m.idx))];
  const hova = [...munkak.map((m) => (m.hozott ? le(m.idx) : fel(m.idx))), ...(hazaNode != null ? [hazaNode] : [])];
  for (const a of honnan) for (const b of hova) if (a !== b) parok.push([a, b]);
  for (const m of munkak) if (!m.hozott) parok.push([fel(m.idx), le(m.idx)]);
  const egyedi = [...new Map(parok.map((p) => [kulcs(p[0], p[1]), p])).values()];
  // Kis adagokban (a HU-GO-t ne terheljük párhuzamos hívások tömegével).
  for (let i = 0; i < egyedi.length; i += 4) {
    const adag = egyedi.slice(i, i + 4);
    const eredm = await Promise.all(
      adag.map(async ([a, b]) => {
        if (ugyanazAHely(helyek[a], helyek[b])) return { km: 0, perc: 0, utdijFt: 0, forras: "hugo" as const };
        if (!(helyek[a].cim?.trim() || helyek[a].pont) || !(helyek[b].cim?.trim() || helyek[b].pont)) return null;
        try {
          return await be.szakasz(helyek[a], helyek[b]);
        } catch {
          return null;
        }
      })
    );
    adag.forEach(([a, b], j) => ctx.matrix.set(kulcs(a, b), eredm[j]));
  }
  return ctx;
}

// ---------------------------------------------------------------- kiértékelés (szinkron)

const PERC = 60_000;
const kerek = (x: number) => Math.round(x);
const ORA = (ms: number) => new Date(ms).toLocaleTimeString("hu-HU", { timeZone: "Europe/Budapest", hour: "2-digit", minute: "2-digit" });

type Megallo = { m: Munka; tipus: "fel" | "le"; node: number; tol: number | null; ig: number | null; hatar: number | null };

function megallokSorrendbol(ctx: Kontextus, sorrend: number[]): Megallo[] {
  const ki: Megallo[] = [];
  for (const i of sorrend) {
    const m = ctx.munkak[i];
    if (!m.hozott) {
      const ig = m.felrakasAblakIg ?? null;
      ki.push({ m, tipus: "fel", node: fel(i), tol: m.tervIdo, ig, hatar: ig ?? m.tervIdo });
    }
    ki.push({ m, tipus: "le", node: le(i), tol: m.lerakasAblakTol ?? null, ig: m.lerakasAblakIg ?? null, hatar: m.lerakasAblakIg ?? null });
  }
  return ki;
}

/** Egy szakasz vezetése a szünet-szabállyal: visszaadja az eltelt időt (perc) és a szünetek számát. */
function vezet(allapot: { folyamatos: number }, perc: number, p: OptParam): { eltelt: number; szunet: number } {
  let maradek = perc;
  let eltelt = 0;
  let szunet = 0;
  while (p.szunetUtanPerc > 0 && allapot.folyamatos + maradek > p.szunetUtanPerc) {
    const d = p.szunetUtanPerc - allapot.folyamatos;
    eltelt += d + p.szunetPerc;
    maradek -= d;
    allapot.folyamatos = 0;
    szunet++;
  }
  eltelt += maradek;
  allapot.folyamatos += maradek;
  return { eltelt, szunet };
}

function szimulal(ctx: Kontextus, sorrend: number[], horgony: "ablak_vege" | "ablak_eleje"): TervErtekeles {
  const p = ctx.param;
  const sebesseg = p.atlagSebessegKmh > 0 ? p.atlagSebessegKmh : 60;
  const megallok = megallokSorrendbol(ctx, sorrend);
  const serulesek: string[] = [];
  const figyelmeztetesek: string[] = [];
  let uresKm = 0, rakottKm = 0, utdij = 0, vezetesPerc = 0, szunetDb = 0, varakozasPerc = 0, kesesPerc = 0;
  let becsles = false;

  // 1. menet: relatív idő (0-tól) az első időzített megállóig — ebből a nap indulása.
  type Lepes = { mg: Megallo; sz: Szakasz | null; menetPerc: number };
  const lepesek: Lepes[] = [];
  let pos = 0;
  for (const mg of megallok) {
    const sz = szakaszKozott(ctx, pos, mg.node);
    const km = mg.tipus === "le" && pos === fel(mg.m.idx) && mg.m.rakottKm != null ? mg.m.rakottKm : sz?.km ?? 0;
    const menetPerc = sz?.perc != null && sz.km > 0 ? sz.perc * (km / sz.km) : (km / sebesseg) * 60;
    lepesek.push({ mg, sz, menetPerc });
    pos = mg.node;
  }

  let horgonyIdo: number | null = null;
  let horgonyFajta: TervErtekeles["horgony"] = "nincs";
  {
    const all = { folyamatos: 0 };
    let t = 0;
    for (const l of lepesek) {
      t += vezet(all, l.menetPerc, p).eltelt;
      const teny = l.mg.tipus === "fel" ? l.mg.m.tenyIdo ?? null : null;
      if (teny != null) {
        horgonyIdo = teny - t * PERC;
        horgonyFajta = "teny";
        break;
      }
      const cel = horgony === "ablak_vege" ? l.mg.ig ?? l.mg.tol : l.mg.tol ?? l.mg.ig;
      if (cel != null) {
        horgonyIdo = cel - t * PERC;
        horgonyFajta = horgony;
        break;
      }
      t += l.mg.tipus === "fel" ? p.felrakasPerc : p.lerakasPerc;
    }
  }

  // 2. menet: abszolút idővel (ha van horgony), költséggel és korlátokkal.
  const allapot = { folyamatos: 0 };
  let t: number | null = horgonyIdo;
  let rakomanyDb = 0, rakomanyHely = 0;
  for (const m of ctx.munkak) {
    if (m.hozott && sorrend.includes(m.idx)) {
      rakomanyDb += m.raklapDb ?? 0;
      rakomanyHely += m.raklaphely ?? 0;
    }
  }
  const felvett = new Set<number>();
  const megalloIdok: MegalloIdo[] = [];
  let atnyuloVezetes = 0;
  let elsoUres = true;
  pos = 0;
  const dbHatar = ctx.kapacitas ? max(ctx.kapacitas.raklapDbNormal, ctx.kapacitas.raklapDbForgatott) : null;
  const helyHatar = ctx.kapacitas ? max(ctx.kapacitas.raklaphelyNormal, ctx.kapacitas.raklaphelyForgatott) : null;

  for (const l of lepesek) {
    const { mg, sz } = l;
    const m = mg.m;
    if (!sz && pos !== mg.node) serulesek.push(`Nem helyezhető el: ${ctx.helyek[pos].cim ?? "?"} → ${ctx.helyek[mg.node].cim ?? "?"} (nincs cím / koordináta).`);
    const rakott = mg.tipus === "le" && (pos === fel(m.idx) || m.hozott || felvett.has(m.idx));
    const km = mg.tipus === "le" && pos === fel(m.idx) && m.rakottKm != null ? m.rakottKm : sz?.km ?? 0;
    if (sz?.forras === "becsles" && km > 0) becsles = true;
    if (rakott && mg.tipus === "le") rakottKm += km;
    else uresKm += km;
    utdij += sz?.utdijFt != null && sz.km > 0 ? sz.utdijFt * (km / sz.km) : km * p.utdijPerKmFt;

    // A nap első üres indulása (figyelmeztetés, nem blokkol).
    if (elsoUres && mg.tipus === "fel") {
      elsoUres = false;
      if (km > p.uresIndulasFigyKm) {
        let legkozelebbi = Infinity;
        for (const tp of ctx.telephelyek) if (tp.pont && m.felrako.pont) legkozelebbi = Math.min(legkozelebbi, legvonalKm(tp.pont, m.felrako.pont) * KOZUTI_SZORZO);
        if (legkozelebbi > p.uresIndulasFigyKm) {
          figyelmeztetesek.push(`Üres indulás ${kerek(km)} km — a felrakó a legközelebbi telephelytől is ${Number.isFinite(legkozelebbi) ? kerek(legkozelebbi) : "?"} km (határ ${p.uresIndulasFigyKm} km).`);
        }
      }
    }
    if (mg.tipus === "le") elsoUres = false;

    // Vezetés: a későbbi napra átnyúló munka rakott útja nem a mai keret része.
    const v = vezet(allapot, l.menetPerc, p);
    szunetDb += v.szunet;
    if (mg.tipus === "le" && m.atnyulo && rakott) atnyuloVezetes += l.menetPerc;
    else vezetesPerc += l.menetPerc;
    let erkezes: number | null = t != null ? t + v.eltelt * PERC : null;
    if (mg.tipus === "fel" && m.tenyIdo != null) erkezes = m.tenyIdo;

    // Ablak: várakozás az ablak elejéig; késés az ablak vége után (kemény).
    let varak = 0, kes = 0;
    let kezdes = erkezes;
    if (erkezes != null) {
      if (mg.tol != null && erkezes < mg.tol && !(m.rogzitett || m.tenyIdo != null)) {
        varak = (mg.tol - erkezes) / PERC;
        kezdes = mg.tol;
        if (varak >= p.szunetPerc) allapot.folyamatos = 0;
      }
      if (mg.hatar != null && erkezes > mg.hatar + 0.5 * PERC && !(m.rogzitett || m.tenyIdo != null || m.lezart)) {
        kes = (erkezes - mg.hatar) / PERC;
        serulesek.push(`Késés: ${ORA(erkezes)}-kor érne a ${mg.tipus === "fel" ? "felrakóra" : "lerakóra"} (${m.id}), az ablak ${ORA(mg.hatar)}-kor zár.`);
      }
    }
    varakozasPerc += varak;
    kesesPerc += kes;

    // Rakomány és kapacitás; a lerakó csak a saját felrakója után.
    if (mg.tipus === "fel") {
      felvett.add(m.idx);
      rakomanyDb += m.raklapDb ?? 0;
      rakomanyHely += m.raklaphely ?? 0;
    } else {
      if (!m.hozott && !felvett.has(m.idx)) serulesek.push(`A(z) ${m.id} lerakója a felrakója előtt lenne.`);
      rakomanyDb -= m.raklapDb ?? 0;
      rakomanyHely -= m.raklaphely ?? 0;
    }
    if (dbHatar != null && rakomanyDb > dbHatar) serulesek.push(`Kapacitás: ${rakomanyDb} raklap nem fér a pótkocsira (legfeljebb ${dbHatar} db, forgatva is).`);
    if (helyHatar != null && rakomanyHely > helyHatar) serulesek.push(`Kapacitás: ${rakomanyHely} raklaphely nem fér a pótkocsira (legfeljebb ${helyHatar}).`);

    const szerviz = mg.tipus === "fel" ? p.felrakasPerc : p.lerakasPerc;
    megalloIdok.push({ munkaId: m.id, tipus: mg.tipus, erkezes, kezdes, varakozasPerc: kerek(varak), kesesPerc: kerek(kes) });
    t = kezdes != null ? kezdes + szerviz * PERC : null;
    pos = mg.node;
  }

  if (vezetesPerc > p.vezetesMaxPerc) {
    serulesek.push(`Vezetési idő: ${kerek(vezetesPerc)} perc a napi ${p.vezetesMaxPerc} perces keret felett (becslés).`);
  }
  if (atnyuloVezetes > 0) figyelmeztetesek.push(`A későbbi napra átnyúló munka ${kerek(atnyuloVezetes)} perc vezetése nem a mai keretbe számít.`);

  // Hazaút: az utolsó helyről a kocsi telephelyéig.
  let hazaKm = 0;
  if (ctx.hazaNode != null && megallok.length > 0) {
    const sz = szakaszKozott(ctx, pos, ctx.hazaNode);
    if (sz) {
      hazaKm = sz.km;
      if (sz.forras === "becsles" && sz.km > 0) becsles = true;
    }
  }

  const sajatErtek = ctx.munkak
    .filter((m) => sorrend.includes(m.idx) && m.jelleg === "sajat")
    .reduce((a, m) => a + (m.rakottKm ?? szakaszKozott(ctx, fel(m.idx), le(m.idx))?.km ?? 0) * p.sajatFuvarKmDijFt, 0);
  const cf: Omit<Celfuggveny, "osszesen"> = {
    uzemanyag: kerek(((uresKm + rakottKm) * p.fogyasztasL100 / 100) * p.gazolajFtL),
    utdij: kerek(utdij),
    napi: kerek(p.napiKoltsegFt),
    keses_buntetes: kerek(kesesPerc * p.wKesesFtPerc),
    varakozas_buntetes: kerek(varakozasPerc * p.wVarakozasFtPerc),
    hazaut: kerek(hazaKm * p.wHazautFtKm),
    sajat_ertek: -kerek(p.prioritasSajat * sajatErtek),
  };
  const osszesen = cf.uzemanyag + cf.utdij + cf.napi + cf.keses_buntetes + cf.varakozas_buntetes + cf.hazaut + cf.sajat_ertek;
  return {
    sorrend: sorrend.map((i) => ctx.munkak[i].id),
    megengedett: serulesek.length === 0,
    serulesek: [...new Set(serulesek)],
    figyelmeztetesek,
    celfuggveny: { ...cf, osszesen },
    uresKm: kerek(uresKm),
    rakottKm: kerek(rakottKm),
    hazaKm: kerek(hazaKm),
    vezetesPerc: kerek(vezetesPerc),
    szunetDb,
    varakozasPerc: kerek(varakozasPerc),
    kesesPerc: kerek(kesesPerc),
    becsles,
    horgony: horgonyFajta,
    megallok: megalloIdok,
  };
}

/** Jobb-e `a` mint `b`: előbb a megengedettség, aztán a kisebb J (fél forint alatti eltérés döntetlen). */
function jobb(a: TervErtekeles, b: TervErtekeles | null): boolean {
  if (!b) return true;
  if (a.megengedett !== b.megengedett) return a.megengedett;
  return a.celfuggveny.osszesen < b.celfuggveny.osszesen - 0.5;
}

/** Egy sorrend kiértékelése: az ablak végére érkezés elve, és ha az rosszabb, az ablak eleje. */
function ertekel(ctx: Kontextus, sorrend: number[]): TervErtekeles {
  const vege = szimulal(ctx, sorrend, "ablak_vege");
  if (vege.horgony === "nincs" || vege.horgony === "teny") return vege;
  const eleje = szimulal(ctx, sorrend, "ablak_eleje");
  return jobb(eleje, vege) ? eleje : vege;
}

// ---------------------------------------------------------------- előkészítés

const LEZART_MEGJEGYZES = "Rögzítve (már elkezdett vagy lezárt)";

function elokeszit(be: OptBemenet): { munkak: Munka[]; jelenlegi: number[]; elotag: number[]; mozgathato: number[]; veg: number[]; megjegyzesek: string[] } {
  const rogz = new Set(be.rogzitett ?? []);
  const sorban = munkakSorrendben(be.munkak, be.jelenlegiSorrend);
  const munkak: Munka[] = sorban.map((m, idx) => {
    const hozott = (m.felrakasNap ?? be.nap) < be.nap;
    return {
      ...m,
      idx,
      hozott,
      atnyulo: (m.lerakasNap ?? be.nap) > be.nap,
      rogzitett: rogz.has(m.id) || m.tenyIdo != null || !!m.lezart,
    };
  });
  const jelenlegi = munkak.map((m) => m.idx);
  // A rögzített előtag a mostani sorrendben az utolsó rögzített munkáig tart
  // (mint az átrendezésnél: ami kész, az a helyén marad, és elé sem kerül semmi).
  const utolsoRogzitett = munkak.reduce((h, m, i) => (m.rogzitett ? i : h), -1);
  const elotag = jelenlegi.slice(0, utolsoRogzitett + 1);
  const maradek = munkak.slice(utolsoRogzitett + 1);
  const veg = maradek.filter((m) => m.atnyulo).map((m) => m.idx);
  const mozgathato = maradek.filter((m) => !m.atnyulo).map((m) => m.idx);
  const megjegyzesek: string[] = [];
  if (elotag.length) megjegyzesek.push(`${LEZART_MEGJEGYZES}: ${elotag.map((i) => munkak[i].id).join(", ")} — az elején marad.`);
  if (veg.length) megjegyzesek.push(`Későbbi napra átnyúló munka a nap végén marad: ${veg.map((i) => munkak[i].id).join(", ")}.`);
  return { munkak, jelenlegi, elotag, mozgathato, veg, megjegyzesek };
}

/** Permutációk lexikografikus sorrendben (determinisztikus). */
function* permutaciok(elemek: number[]): Generator<number[]> {
  const a = [...elemek].sort((x, y) => x - y);
  yield [...a];
  for (;;) {
    let i = a.length - 2;
    while (i >= 0 && a[i] >= a[i + 1]) i--;
    if (i < 0) return;
    let j = a.length - 1;
    while (a[j] <= a[i]) j--;
    [a[i], a[j]] = [a[j], a[i]];
    for (let l = i + 1, r = a.length - 1; l < r; l++, r--) [a[l], a[r]] = [a[r], a[l]];
    yield [...a];
  }
}

// ---------------------------------------------------------------- (a) sorrend-optimalizálás

/**
 * Egy kocsi egy napjának legjobb munka-sorrendje. A rögzített előtag és az
 * átnyúló vég marad; a mozgatható munkák ≤ 7-ig teljes bejárással, fölötte
 * beszúrás + 2-opt + áthelyezés. Determinisztikus; döntetlennél a mostani
 * sorrend marad.
 */
export async function optimalizalSorrendet(be: OptBemenet): Promise<SorrendEredmeny> {
  const e = elokeszit(be);
  const ctx = await epitKontextust(be, e.munkak);
  const teljes = (mozg: number[]) => [...e.elotag, ...mozg, ...e.veg];
  const jelenlegiMozg = e.jelenlegi.filter((i) => e.mozgathato.includes(i));
  const jelenlegi = ertekel(ctx, teljes(jelenlegiMozg));
  const megjegyzesek = [...e.megjegyzesek, VEZETES_BECSLES_MEGJEGYZES];
  let legjobb: TervErtekeles = jelenlegi;
  let vizsgalt = 1;
  let modszer: OptModszer;

  if (e.mozgathato.length < 2) {
    modszer = "nincs_mozgathato";
  } else if (e.mozgathato.length <= TELJES_BEJARAS_MAX) {
    modszer = "teljes_bejaras";
    for (const p of permutaciok(e.mozgathato)) {
      const x = ertekel(ctx, teljes(p));
      vizsgalt++;
      if (jobb(x, legjobb)) legjobb = x;
    }
  } else {
    modszer = "beszuras_2opt";
    const sz = (mozg: number[]) => {
      vizsgalt++;
      return ertekel(ctx, teljes(mozg));
    };
    // Beszúrásos kezdés: időrendben (terv-idő, id), mindegyik a legjobb helyére.
    const rend = [...e.mozgathato].sort((a, b) => (e.munkak[a].tervIdo ?? Infinity) - (e.munkak[b].tervIdo ?? Infinity) || e.munkak[a].id.localeCompare(e.munkak[b].id));
    let epul: number[] = [];
    for (const i of rend) {
      let best: { s: number[]; x: TervErtekeles } | null = null;
      for (let p = 0; p <= epul.length; p++) {
        const s = [...epul.slice(0, p), i, ...epul.slice(p)];
        const x = sz(s);
        if (!best || jobb(x, best.x)) best = { s, x };
      }
      epul = best!.s;
    }
    const javit = (kezdo: number[]) => {
      let s = kezdo;
      let x = sz(s);
      for (let kor = 0; kor < 50; kor++) {
        let javult = false;
        // 2-opt: szakaszfordítás.
        for (let i = 0; i < s.length - 1; i++) {
          for (let j = i + 1; j < s.length; j++) {
            const u = [...s.slice(0, i), ...s.slice(i, j + 1).reverse(), ...s.slice(j + 1)];
            const ux = sz(u);
            if (jobb(ux, x)) { s = u; x = ux; javult = true; }
          }
        }
        // Áthelyezés: egy munka máshová.
        for (let i = 0; i < s.length; i++) {
          for (let j = 0; j < s.length; j++) {
            if (i === j) continue;
            const nelkul = [...s.slice(0, i), ...s.slice(i + 1)];
            const u = [...nelkul.slice(0, j), s[i], ...nelkul.slice(j)];
            const ux = sz(u);
            if (jobb(ux, x)) { s = u; x = ux; javult = true; }
          }
        }
        if (!javult) break;
      }
      return x;
    };
    for (const kezdo of [jelenlegiMozg, epul]) {
      const x = javit(kezdo);
      if (jobb(x, legjobb)) legjobb = x;
    }
  }

  const legjobbMeg = legjobb.megengedett ? legjobb : null;
  if (!legjobbMeg) megjegyzesek.push(`Nincs megengedett sorrend: ${legjobb.serulesek.join(" · ")}`);
  return {
    jelenlegi,
    legjobb: legjobbMeg,
    modszer,
    vizsgalt,
    megtakaritasFt: legjobbMeg ? jelenlegi.celfuggveny.osszesen - legjobbMeg.celfuggveny.osszesen : 0,
    megtakaritasKm: legjobbMeg ? jelenlegi.uresKm + jelenlegi.rakottKm + jelenlegi.hazaKm - (legjobbMeg.uresKm + legjobbMeg.rakottKm + legjobbMeg.hazaKm) : 0,
    megjegyzesek,
    legkevesbeRosszSerulesek: legjobbMeg ? [] : legjobb.serulesek,
  };
}

/**
 * Megéri-e javaslatként eltárolni: más a sorrend, a legjobb megengedett, és
 * vagy a mostani sérti a kemény korlátokat, vagy a megtakarítás eléri a
 * küszöböt (1 000 Ft vagy 5 km).
 */
export function erdemesJavasolni(e: SorrendEredmeny): boolean {
  if (!e.legjobb) return false;
  if (e.legjobb.sorrend.join(",") === e.jelenlegi.sorrend.join(",")) return false;
  if (!e.jelenlegi.megengedett) return true;
  return e.megtakaritasFt >= MEGTAKARITAS_KUSZOB_FT || (e.megtakaritasKm >= MEGTAKARITAS_KUSZOB_KM && e.megtakaritasFt > 0);
}

// ---------------------------------------------------------------- (b) hozzárendelés

export type KocsiNap = {
  jarmuId: string;
  kod: string;
  sofor: string;
  vanGps: boolean;
  munkak: MenetMunka[];
  jelenlegiSorrend: readonly string[] | null;
  rogzitett?: readonly string[];
  indulas: Hely;
  haza: Hely | null;
  kapacitas: PotkocsiKapacitas | null;
  param: OptParam;
};

export type HozzarendelesSor = {
  jarmuId: string;
  kod: string;
  sofor: string;
  vanGps: boolean;
  megengedett: boolean;
  serulesek: string[];
  /** A beszúrás helye a nap munkái között (0 = első), és az új sorrend. */
  pozicio: number | null;
  sorrend: string[];
  /** J változása (Ft) az új munkával — kisebb a jobb. */
  hatarFt: number | null;
  pluszKm: number | null;
  nelkule: Celfuggveny;
  vele: Celfuggveny | null;
};

export type HozzarendelesEredmeny = { legjobb: HozzarendelesSor | null; kocsik: HozzarendelesSor[] };

/**
 * Egy új munka legjobb helye minden kocsi napjában (a meglévő sorrend marad,
 * csak a beszúrás helye változik; a rögzített előtag elé és az átnyúló vég
 * mögé nem kerülhet). A javaslat a legkisebb határköltségű MEGENGEDETT kocsi;
 * döntetlennél a kód szerinti első. GPS nélküli kocsi is jelölt.
 */
export async function javasolHozzarendelest(uj: MenetMunka, nap: string, kocsik: KocsiNap[], szakasz: SzakaszFn, telephelyek: TelephelyPontAdat[]): Promise<HozzarendelesEredmeny> {
  const sorok: HozzarendelesSor[] = [];
  for (const k of kocsik) {
    const tobbi = k.munkak.filter((m) => m.id !== uj.id);
    const be: OptBemenet = {
      nap, munkak: [...tobbi, uj], jelenlegiSorrend: (k.jelenlegiSorrend ?? []).filter((id) => id !== uj.id),
      rogzitett: k.rogzitett, indulas: k.indulas, haza: k.haza, telephelyek, kapacitas: k.kapacitas, param: k.param, szakasz,
    };
    const e = elokeszit(be);
    const ctx = await epitKontextust(be, e.munkak);
    const ujIdx = e.munkak.find((m) => m.id === uj.id)!.idx;
    const ujM = e.munkak[ujIdx];
    // „Nélküle”: ugyanaz a kontextus, az új munka nélkül.
    const reszek = (lista: number[]) => lista.filter((i) => i !== ujIdx);
    const elotag = reszek(e.elotag), mozg = reszek(e.jelenlegi.filter((i) => e.mozgathato.includes(i))), veg = reszek(e.veg);
    const nelkule = ertekel(ctx, [...elotag, ...mozg, ...veg]);
    let best: { s: number[]; x: TervErtekeles; poz: number } | null = null;
    const jeloltek: { s: number[]; poz: number }[] = [];
    if (ujM.rogzitett) jeloltek.push({ s: [...elotag, ujIdx, ...mozg, ...veg], poz: elotag.length });
    else if (ujM.atnyulo) jeloltek.push({ s: [...elotag, ...mozg, ...veg, ujIdx], poz: elotag.length + mozg.length + veg.length });
    else for (let p = 0; p <= mozg.length; p++) jeloltek.push({ s: [...elotag, ...mozg.slice(0, p), ujIdx, ...mozg.slice(p), ...veg], poz: elotag.length + p });
    for (const j of jeloltek) {
      const x = ertekel(ctx, j.s);
      if (!best || jobb(x, best.x)) best = { ...j, x };
    }
    const vele = best!.x;
    sorok.push({
      jarmuId: k.jarmuId, kod: k.kod, sofor: k.sofor, vanGps: k.vanGps,
      megengedett: vele.megengedett,
      serulesek: vele.serulesek,
      pozicio: vele.megengedett ? best!.poz : null,
      sorrend: vele.sorrend,
      hatarFt: vele.celfuggveny.osszesen - nelkule.celfuggveny.osszesen,
      pluszKm: vele.uresKm + vele.rakottKm + vele.hazaKm - (nelkule.uresKm + nelkule.rakottKm + nelkule.hazaKm),
      nelkule: nelkule.celfuggveny,
      vele: vele.celfuggveny,
    });
  }
  const jo = sorok.filter((s) => s.megengedett && s.hatarFt != null);
  const legjobb = jo.reduce<HozzarendelesSor | null>((a, b) => (!a || b.hatarFt! < a.hatarFt! - 0.5 || (Math.abs(b.hatarFt! - a.hatarFt!) <= 0.5 && b.kod.localeCompare(a.kod) < 0) ? b : a), null);
  return { legjobb, kocsik: sorok };
}

// ---------------------------------------------------------------- ujjlenyomat

/** FNV-1a (32 bit) két maggal → 16 hex jegy. Nem kriptográfiai, csak változás-jelző. */
function fnv(s: string, mag: number): string {
  let h = mag >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * A bemenet ujjlenyomata: a munkák (helyek, ablakok, tény, lezárás, raklap),
 * az indulás, a mostani sorrend, a rögzítettek, a kapacitás és a menet
 * verziója. Ha változik, a régi nyitott javaslat elavult.
 */
export function bemenetUjjlenyomat(be: Pick<OptBemenet, "nap" | "munkak" | "jelenlegiSorrend" | "rogzitett" | "indulas" | "kapacitas"> & { menetVerzio: number | null }): string {
  const hely = (h: Hely) => [h.cim?.trim() ?? null, h.pont ? [h.pont.lat.toFixed(4), h.pont.lon.toFixed(4)] : null];
  const s = JSON.stringify([
    be.nap,
    be.menetVerzio,
    hely(be.indulas),
    be.jelenlegiSorrend ?? [],
    [...(be.rogzitett ?? [])].sort(),
    be.kapacitas,
    [...be.munkak].sort((a, b) => a.id.localeCompare(b.id)).map((m) => [
      m.id, m.jelleg, m.felrakasNap, m.lerakasNap, hely(m.felrako), hely(m.lerako), m.tervIdo, m.felrakasAblakIg ?? null,
      m.lerakasAblakTol ?? null, m.lerakasAblakIg ?? null, m.tenyIdo ?? null, !!m.lezart, m.rakottKm, m.raklapDb, m.raklaphely ?? null,
    ]),
  ]);
  return fnv(s, 0x811c9dc5) + fnv(s, 0x01234567);
}

// ---------------------------------------------------------------- megjelenítés (kliens is)

/** A felületnek: egy nyitott javaslat. */
export type OptJavaslatNezet = {
  id: string;
  menetId: string | null;
  letrehozvaAt: string;
  megtakaritasFt: number;
  megtakaritasKm: number;
  jelenlegi: { id: string; ut: string }[];
  javasolt: { id: string; ut: string }[];
  celfuggveny: { javasolt: Celfuggveny; jelenlegi: Celfuggveny };
  km: { javasolt: { ures: number; rakott: number; haza: number }; jelenlegi: { ures: number; rakott: number; haza: number } };
  megjegyzesek: string[];
  figyelmeztetesek: string[];
};

export const CELFUGGVENY_CIMKE: Record<Exclude<keyof Celfuggveny, "osszesen">, string> = {
  uzemanyag: "üzemanyag",
  utdij: "útdíj",
  napi: "napi költség",
  keses_buntetes: "késés",
  varakozas_buntetes: "várakozás",
  hazaut: "hazaút",
  sajat_ertek: "saját áru értéke",
};

// ---------------------------------------------------------------- elfogadás: a munka-sorrendből feladat-sorrend

/**
 * A javasolt MUNKA-sorrendből a menet FELADAT-id-inek új sorrendje az
 * átrendezéshez (lib/menet/muveletek.ts atrendezMenet): a lezárt előtag (az
 * utolsó lezárt feladatig) marad; utána minden megbízás-feladat a közvetlenül
 * előtte álló nem-megbízás feladatokkal (üres pozicionálás) együtt mozog — az
 * átrendezés ezeket úgyis újraszámolja. null, ha a javaslat munkái nem
 * egyeznek a menet mozgatható munkáival (közben változott a menet).
 */
export function feladatSorrendJavaslatbol(
  feladatok: readonly { id: string; sorszam: number; megbizasId: string | null; lezarvaAt: string | null }[],
  munkaSorrend: readonly string[]
): string[] | null {
  const rend = [...feladatok].sort((a, b) => a.sorszam - b.sorszam);
  const utolsoLezart = rend.reduce((h, f, i) => (f.lezarvaAt ? i : h), -1);
  const elotag = rend.slice(0, utolsoLezart + 1);
  const maradek = rend.slice(utolsoLezart + 1);
  const csoportok: { megbizasId: string; ids: string[] }[] = [];
  let fuggo: string[] = [];
  for (const f of maradek) {
    fuggo.push(f.id);
    if (f.megbizasId) {
      csoportok.push({ megbizasId: f.megbizasId, ids: fuggo });
      fuggo = [];
    }
  }
  const elotagMunkak = new Set(elotag.flatMap((f) => (f.megbizasId ? [f.megbizasId] : [])));
  const cel = munkaSorrend.filter((id) => !elotagMunkak.has(id));
  const benne = new Set(csoportok.map((c) => c.megbizasId));
  if (cel.length !== csoportok.length || cel.some((id) => !benne.has(id)) || new Set(cel).size !== cel.length) return null;
  const rang = new Map(cel.map((id, i) => [id, i]));
  const rendezett = [...csoportok].sort((a, b) => rang.get(a.megbizasId)! - rang.get(b.megbizasId)!);
  return [...elotag.map((f) => f.id), ...rendezett.flatMap((c) => c.ids), ...fuggo];
}
