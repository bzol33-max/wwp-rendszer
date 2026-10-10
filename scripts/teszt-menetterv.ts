// Menetterv — a tiszta rész (lib/menet/menet-alap.ts, lib/menet/valtozas.ts).
// Futtatás: npx tsx scripts/teszt-menetterv.ts
//
// Amit véd: a feladat-típus, az üres pozicionálás beszúrása, a figyelmeztetések
// (üres indulás 30 km, kapacitás 33/28 hely és 660/812 raklap, ütközés,
// hiányzó cím), hogy a jóváhagyott menet sorrendje a forrás (különben a közös
// napi szabály, T5/T6), hogy a lezárás a következő feladatot nem bántja, és
// hogy az elavult verzió elutasítódik.

import { readFileSync } from "node:fs";
import { napiSorrend, type SorrendAdat } from "@/lib/fuvarozas2/napi-sorrend";
import {
  alkalmazMenetSorrendeket,
  alkalmazMenetSorrendet,
  ellenorizAtrendezest,
  ellenorizIndokot,
  ellenorizLezarasInvarianst,
  ellenorizVerziot,
  epitMenetJavaslat,
  feladatTipusMunkabol,
  feladatUjjlenyomat,
  kapacitasFigyelmeztetes,
  lezarFeladatot,
  megbizasSorrend,
  raklapMennyisegbol,
  sajatTelephelyPontja,
} from "@/lib/menet/menet-alap";
import { naplozandoValtozasok } from "@/lib/menet/valtozas";
import type { Hely, MenetBeallitas, MenetMunka, PotkocsiKapacitas, TavFn, TelephelyPontAdat } from "@/lib/menet/tipusok";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

// ------------------------------------------------------------------ alapadatok
const TELEPHELYEK: TelephelyPontAdat[] = [
  { id: "1", nev: "Szakoly (telephely)", cim: "Szakoly, Rákóczi utca 26", pont: { lat: 47.7656, lon: 21.9156 } },
  { id: "2", nev: "Balkány (telephely)", cim: "Balkány, Bocskai utca 11", pont: { lat: 47.7706, lon: 21.8597 } },
  { id: "3", nev: "Nyíregyháza (telephely)", cim: "Nyíregyháza, Tünde út 20/A", pont: { lat: 47.9696, lon: 21.7537 } },
  { id: "4", nev: "Szakoly (parkoló)", cim: "Szakoly, Létai utca", pont: { lat: 47.7700, lon: 21.9100 } },
];
const KAP: PotkocsiKapacitas = { raklaphelyNormal: 33, raklaphelyForgatott: 28, raklapDbNormal: 660, raklapDbForgatott: 812 };
const BEALL: MenetBeallitas = { uresIndulasFigyelmeztetesKm: 30, felrakasRahagyasPerc: 30, lerakasRahagyasPerc: 45, atlagSebessegKmh: 60 };
const h = (cim: string | null, pont: { lat: number; lon: number } | null = null): Hely => ({ cim, pont });

/** Teszt-távolság: táblázatból (HU-GO-ként), különben légvonal × 1,3 ('becsles'); ismeretlen helyre null. */
function tesztTav(tabla: Record<string, number> = {}): TavFn {
  return async (a, b) => {
    const k = `${a.cim}→${b.cim}`;
    if (k in tabla) return { km: tabla[k], forras: "hugo" };
    if (!a.pont || !b.pont) return null;
    const R = 6371, dLat = ((b.pont.lat - a.pont.lat) * Math.PI) / 180, dLon = ((b.pont.lon - a.pont.lon) * Math.PI) / 180;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.pont.lat * Math.PI) / 180) * Math.cos((b.pont.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return { km: Math.round(2 * R * Math.asin(Math.sqrt(x)) * 1.3), forras: "becsles" };
  };
}
function munka(p: Partial<MenetMunka> & Pick<MenetMunka, "id" | "felrako" | "lerako">): MenetMunka {
  return { jelleg: "sajat", felrakasNap: "2026-10-12", lerakasNap: "2026-10-12", tervIdo: null, rakottKm: null, raklapDb: null, ...p };
}
const NAP = "2026-10-12";
const BP = (hhmm: string) => Date.parse(`${NAP}T${hhmm}:00+02:00`);

(async () => {
  // ---------------------------------------------------------------- 1. típus
  eq("bérfuvar: jelleg ber", feladatTipusMunkabol({ jelleg: "ber", felrako: h("Debrecen"), lerako: h("Miskolc") }, TELEPHELYEK), "berfuvar");
  eq("bérfuvar akkor is, ha telephelyre visz", feladatTipusMunkabol({ jelleg: "ber", felrako: h("Szakoly, Rákóczi út 26."), lerako: h("Balkány, Bocskai u. 11") }, TELEPHELYEK), "berfuvar");
  eq("saját áru: vevőhöz", feladatTipusMunkabol({ jelleg: "sajat", felrako: h("Szakoly, Rákóczi utca 26"), lerako: h("2890 Tata, Agráripari telep") }, TELEPHELYEK), "sajat_aru");
  eq("telephelyi rakodás: Szakoly → Balkány utcával", feladatTipusMunkabol({ jelleg: "sajat", felrako: h("4234 Szakoly, Rákóczi út 26."), lerako: h("Balkány, Bocskai utca 11") }, TELEPHELYEK), "telephelyi_rakodas");
  eq("telephelyi rakodás: csupasz településnév saját fuvarnál", feladatTipusMunkabol({ jelleg: "sajat", felrako: h("Szakoly"), lerako: h("Balkány") }, TELEPHELYEK), "telephelyi_rakodas");
  eq("telephelyi rakodás: koordináta szerint (1 km-en belül)", feladatTipusMunkabol({ jelleg: "sajat", felrako: h("valahol", { lat: 47.7657, lon: 21.9150 }), lerako: h("Nyíregyháza, Tünde u. 20/A") }, TELEPHELYEK), "telephelyi_rakodas");
  eq("Nyíregyháza más utcája nem telephely", feladatTipusMunkabol({ jelleg: "sajat", felrako: h("Szakoly"), lerako: h("Nyíregyháza, Kossuth utca 5") }, TELEPHELYEK), "sajat_aru");
  eq("bérfuvar csupasz városa nem telephely", sajatTelephelyPontja(h("Nyíregyháza"), TELEPHELYEK, false), null);
  eq("saját fuvar csupasz városa telephely", sajatTelephelyPontja(h("4400 Nyíregyháza"), TELEPHELYEK, true)?.id, "3");

  // ---------------------------------------------------------------- 2. üres pozicionálás
  {
    const szakoly = h("Szakoly, Rákóczi utca 26", TELEPHELYEK[0].pont);
    const a = munka({ id: "294", felrako: h("Szakoly, Rákóczi utca 26"), lerako: h("Tata") });
    const b = munka({ id: "295", felrako: h("2890 Tata, Agráripari telep"), lerako: h("9662 Tompaládony, 0117/8 hrsz.") });
    const c = munka({ id: "293", jelleg: "ber", felrako: h("HU-9600 Sárvár, Ikervári út 42."), lerako: h("HU-4031 Debrecen"), lerakasNap: "2026-10-13" });
    const tav = tesztTav({
      "Szakoly, Rákóczi utca 26→Tata": 300,
      "Tata→2890 Tata, Agráripari telep": 1,
      "2890 Tata, Agráripari telep→9662 Tompaládony, 0117/8 hrsz.": 170,
      "9662 Tompaládony, 0117/8 hrsz.→HU-9600 Sárvár, Ikervári út 42.": 25,
      "HU-9600 Sárvár, Ikervári út 42.→HU-4031 Debrecen": 390,
    });
    const f = await epitMenetJavaslat({ nap: NAP, munkak: [c, b, a], indulas: { ...szakoly, telephelyPontId: "1" }, telephelyek: TELEPHELYEK, kapacitas: KAP, beallitas: BEALL, tav });
    eq("lánc: Szakoly→Tata, Tata→Tompaládony, ÜRES Tompaládony→Sárvár, Sárvár→Debrecen",
      f.map((x) => `${x.sorszam}:${x.feladatTipus}:${x.megbizasId ?? "-"}`),
      ["1:sajat_aru:294", "2:sajat_aru:295", "3:ures_pozicionalas:-", "4:berfuvar:293"]);
    eq("az üres szakasz km-e és forrása", [f[2].uresKm, f[2].kmForras, f[2].kiinduloCim, f[2].celCim], [25, "hugo", "9662 Tompaládony, 0117/8 hrsz.", "HU-9600 Sárvár, Ikervári út 42."]);
    eq("indulás a telephelyről: nincs üres szakasz, ha ott rak fel", f[0].kiinduloTelephelyPontId, "1");
    eq("a rakott km a távolság-függvényből", [f[0].rakottKm, f[3].rakottKm], [300, 390]);
    eq("ujjlenyomat stabil (változatlan javaslat nem ír)", feladatUjjlenyomat(f), feladatUjjlenyomat(await epitMenetJavaslat({ nap: NAP, munkak: [a, b, c], indulas: { ...szakoly, telephelyPontId: "1" }, telephelyek: TELEPHELYEK, kapacitas: KAP, beallitas: BEALL, tav })));

    // Indulás máshonnan: üres szakasz az első munkához, becslés-jelöléssel.
    const aPont = munka({ ...a, felrako: h("Szakoly, Rákóczi utca 26", TELEPHELYEK[0].pont), lerako: h("Tata", { lat: 47.65, lon: 18.32 }) });
    const g = await epitMenetJavaslat({ nap: NAP, munkak: [aPont], indulas: h("Nyíregyháza, Tünde út 20/A", TELEPHELYEK[2].pont), telephelyek: TELEPHELYEK, kapacitas: KAP, beallitas: BEALL, tav: tesztTav() });
    eq("indulási pontról üres szakasz az első munkához", g.map((x) => x.feladatTipus), ["ures_pozicionalas", "sajat_aru"]);
    eq("légvonal-tartalék: 'becsles' forrás", g[0].kmForras, "becsles");
    eq("Nyíregyháza→Szakoly ~ 30 km alatt nincs figyelmeztetés", g[0].figyelmeztetesek.map((x) => x.kod), []);

    // Korábbi napról hozott rakomány: nincs üres szakasz elé.
    const hozott = munka({ id: "400", felrakasNap: "2026-10-11", felrako: h("Győr"), lerako: h("Debrecen") });
    const k = await epitMenetJavaslat({ nap: NAP, munkak: [hozott], indulas: { ...szakoly, telephelyPontId: "1" }, telephelyek: TELEPHELYEK, kapacitas: KAP, beallitas: BEALL, tav: tesztTav({ "Győr→Debrecen": 320 }) });
    eq("tegnap felrakott fuvar: nincs üres szakasz elé", k.map((x) => x.feladatTipus), ["sajat_aru"]);
  }

  // ---------------------------------------------------------------- 3. üres indulás 30 km
  {
    const balkany: Hely = { cim: "Balkány, Bocskai utca 11", pont: TELEPHELYEK[1].pont, telephelyPontId: "2" };
    const tavoli = munka({ id: "500", jelleg: "ber", felrako: h("2200 Monor, Ipari park 1", { lat: 47.3510, lon: 19.4490 }), lerako: h("Budapest") });
    const tav = tesztTav({ "Balkány, Bocskai utca 11→2200 Monor, Ipari park 1": 230, "2200 Monor, Ipari park 1→Budapest": 40 });
    const f = await epitMenetJavaslat({ nap: NAP, munkak: [tavoli], indulas: balkany, telephelyek: TELEPHELYEK, kapacitas: KAP, beallitas: BEALL, tav });
    eq("AOPU-427 Balkányból ~230 km-re: üres indulás figyelmeztetés", f[0].figyelmeztetesek.map((x) => x.kod), ["ures_indulas"]);
    eq("…de NEM blokkol: a bérfuvar a menetben marad", f.map((x) => x.feladatTipus), ["ures_pozicionalas", "berfuvar"]);
    eq("az üres km 230 (HU-GO)", [f[0].uresKm, f[0].kmForras], [230, "hugo"]);
    const kozeli = munka({ id: "501", felrako: h("4320 Nagykálló, Fő utca 1", { lat: 47.8740, lon: 21.8420 }), lerako: h("Debrecen") });
    const g = await epitMenetJavaslat({ nap: NAP, munkak: [kozeli], indulas: balkany, telephelyek: TELEPHELYEK, kapacitas: KAP, beallitas: BEALL, tav: tesztTav({ "4320 Nagykálló, Fő utca 1→Debrecen": 50 }) });
    eq("közeli felrakó (Nagykálló): nincs figyelmeztetés", g[0].figyelmeztetesek.map((x) => x.kod), []);
    const h40 = await epitMenetJavaslat({ nap: NAP, munkak: [tavoli], indulas: balkany, telephelyek: TELEPHELYEK, kapacitas: KAP, beallitas: { ...BEALL, uresIndulasFigyelmeztetesKm: 400 }, tav });
    eq("a határ a beállításból jön (400 km → nincs)", h40[0].figyelmeztetesek.map((x) => x.kod), []);
  }

  // ---------------------------------------------------------------- 4. kapacitás
  eq("mennyiség: 812 db", raklapMennyisegbol("812 db EUR raklap"), { raklapDb: 812, raklaphely: null });
  eq("mennyiség: 33 raklaphely", raklapMennyisegbol("33 raklaphely"), { raklapDb: null, raklaphely: 33 });
  eq("mennyiség: 26 raklap", raklapMennyisegbol("26 raklap"), { raklapDb: 26, raklaphely: null });
  eq("mennyiség: olvashatatlan", raklapMennyisegbol("vegyes áru"), { raklapDb: null, raklaphely: null });
  eq("660 raklap (normál) befér", kapacitasFigyelmeztetes({ raklapDb: 660, raklaphely: null }, KAP), null);
  eq("812 raklap (forgatva) befér", kapacitasFigyelmeztetes({ raklapDb: 812, raklaphely: null }, KAP), null);
  eq("820 raklap: figyelmeztetés", kapacitasFigyelmeztetes({ raklapDb: 820, raklaphely: null }, KAP)?.kod, "kapacitas");
  eq("33 raklaphely befér", kapacitasFigyelmeztetes({ raklapDb: null, raklaphely: 33 }, KAP), null);
  eq("28 raklaphely (forgatott) befér", kapacitasFigyelmeztetes({ raklapDb: null, raklaphely: 28 }, KAP), null);
  eq("34 raklaphely: figyelmeztetés", kapacitasFigyelmeztetes({ raklapDb: null, raklaphely: 34 }, KAP)?.kod, "kapacitas");
  eq("ismeretlen pótkocsi: nincs jelzés", kapacitasFigyelmeztetes({ raklapDb: 2000, raklaphely: null }, null), null);
  {
    const sok = munka({ id: "600", felrako: h("Szakoly, Rákóczi utca 26"), lerako: h("Tata"), raklapDb: 820 });
    const f = await epitMenetJavaslat({ nap: NAP, munkak: [sok], indulas: { cim: "Szakoly, Rákóczi utca 26", pont: null, telephelyPontId: "1" }, telephelyek: TELEPHELYEK, kapacitas: KAP, beallitas: BEALL, tav: tesztTav({ "Szakoly, Rákóczi utca 26→Tata": 300 }) });
    eq("a feladaton is ott a kapacitás-figyelmeztetés, a feladat megmarad", [f.length, f[0].figyelmeztetesek.map((x) => x.kod), f[0].raklapDb], [1, ["kapacitas"], 820]);
  }

  // ---------------------------------------------------------------- 5. ütközés, hiányzó cím
  {
    const reggel = munka({ id: "700", jelleg: "ber", felrako: h("Debrecen"), lerako: h("Győr"), tervIdo: BP("08:00") });
    const kilenc = munka({ id: "701", jelleg: "ber", felrako: h("Győr, Ipari park"), lerako: h("Tata"), tervIdo: BP("09:00") });
    const f = await epitMenetJavaslat({ nap: NAP, munkak: [kilenc, reggel], indulas: { cim: "Debrecen", pont: null }, telephelyek: TELEPHELYEK, kapacitas: KAP, beallitas: BEALL, tav: tesztTav({ "Debrecen→Győr": 330, "Győr→Győr, Ipari park": 5, "Győr, Ipari park→Tata": 40 }) });
    const kilencF = f.find((x) => x.megbizasId === "701")!;
    eq("08:00 + 330 km után a 09:00-s felrakás: ütközés", kilencF.figyelmeztetesek.map((x) => x.kod), ["utkozes"]);
    eq("a tervezett indulás a valós érkezés (nem a 09:00)", (kilencF.tervezettIndulas ?? 0) > BP("09:00"), true);
    const reggelF = f.find((x) => x.megbizasId === "700")!;
    eq("az első munka 08:00-kor indul", reggelF.tervezettIndulas, BP("08:00"));

    const lyukas = munka({ id: "702", felrako: h(null), lerako: h("Tata") });
    const g = await epitMenetJavaslat({ nap: NAP, munkak: [lyukas], indulas: { cim: "Szakoly", pont: null }, telephelyek: TELEPHELYEK, kapacitas: KAP, beallitas: BEALL, tav: tesztTav() });
    eq("hiányzó felrakó: hianyzo_cim", g[0].figyelmeztetesek.some((x) => x.kod === "hianyzo_cim"), true);
    const ismeretlen = munka({ id: "703", felrako: h("Xyz-puszta"), lerako: h("Tata") });
    const k = await epitMenetJavaslat({ nap: NAP, munkak: [ismeretlen], indulas: { cim: "Szakoly", pont: null }, telephelyek: TELEPHELYEK, kapacitas: KAP, beallitas: BEALL, tav: tesztTav() });
    eq("el nem helyezhető cím: hianyzo_cim, km nélkül", [k[0].feladatTipus, k[0].uresKm, k[0].figyelmeztetesek[0]?.kod], ["ures_pozicionalas", null, "hianyzo_cim"]);
  }

  // ---------------------------------------------------------------- 6. egyetlen sorrend-forrás (T5/T6)
  {
    const BPh = (hhmm: string) => Date.parse(`2026-10-12T${hhmm}:00+02:00`);
    const ber10: SorrendAdat = { id: "320", felrakasNap: "2026-10-12", lerakasNap: "2026-10-12", felrako: "Debrecen", lerako: "Miskolc", tervIdo: BPh("10:00") };
    const sajatIdoNelkul: SorrendAdat = { id: "310", felrakasNap: "2026-10-12", lerakasNap: "2026-10-12", felrako: "Szakoly", lerako: "Nyíregyháza" };
    const nezet = (lista: SorrendAdat[], jovahagyott: string[] | null) => alkalmazMenetSorrendet(napiSorrend(lista, (x) => x), jovahagyott, (x) => x.id).map((x) => x.id);
    eq("T5 jóváhagyott menet nélkül: a napi szabály (bér 10:00 elöl)", nezet([sajatIdoNelkul, ber10], null), ["320", "310"]);
    eq("T5 jóváhagyott menettel: a menet sorrendje (saját elöl)", nezet([sajatIdoNelkul, ber10], ["310", "320"]), ["310", "320"]);
    eq("T5 a bejövő sorrendtől független", nezet([ber10, sajatIdoNelkul], ["310", "320"]), ["310", "320"]);
    const berLezart: SorrendAdat = { ...ber10, id: "330", tervIdo: null, lezart: true };
    const sajatUtana: SorrendAdat = { ...sajatIdoNelkul, id: "325" };
    eq("T6 menet nélkül: a lezárt bér az 1.", nezet([sajatUtana, berLezart], null), ["330", "325"]);
    eq("T6 jóváhagyott menettel: a menet dönt", nezet([sajatUtana, berLezart], ["325", "330"]), ["325", "330"]);
    eq("üres (egyelemű) menet-sorrend: a napi szabály", nezet([sajatUtana, berLezart], ["325"]), ["330", "325"]);
    const csuszo: SorrendAdat = { id: "290", felrakasNap: "2026-10-11", lerakasNap: "2026-10-11", felrako: "Ebes", lerako: "Balkány" };
    eq("a menetben nem szereplő (csúszó) fuvar a helyén marad", nezet([ber10, csuszo, sajatIdoNelkul], ["310", "320"]), ["290", "310", "320"]);
    eq("több nap egymás után (GPS-figyelő)", alkalmazMenetSorrendeket(["a", "b", "c", "d"].map((id) => ({ id })), [["b", "a"], ["d", "c"]], (x) => x.id).map((x) => x.id), ["b", "a", "d", "c"]);
    eq("a menet feladataiból a megbízás-sorrend (üres szakasz nélkül)", megbizasSorrend([
      { sorszam: 3, megbizasId: "320" }, { sorszam: 1, megbizasId: null }, { sorszam: 2, megbizasId: "310" },
    ]), ["310", "320"]);
  }

  // ---------------------------------------------------------------- 7. lezárás, verzió, átrendezés
  {
    type S = { id: string; sorszam: number; feladatTipus: string; megbizasId: string | null; lezarvaAt: string | null };
    const sorok: S[] = [
      { id: "11", sorszam: 1, feladatTipus: "ures_pozicionalas", megbizasId: null, lezarvaAt: null },
      { id: "12", sorszam: 2, feladatTipus: "berfuvar", megbizasId: "320", lezarvaAt: null },
      { id: "13", sorszam: 3, feladatTipus: "ures_pozicionalas", megbizasId: null, lezarvaAt: null },
      { id: "14", sorszam: 4, feladatTipus: "sajat_aru", megbizasId: "310", lezarvaAt: null },
    ];
    const utana = lezarFeladatot(sorok, "12", "2026-10-12 11:00:00+02");
    eq("lezárás: csak az adott sor lezarva_at-ja", utana.map((s) => s.lezarvaAt), [null, "2026-10-12 11:00:00+02", null, null]);
    eq("lezárás: a KÖVETKEZŐ sor sorszáma és típusa nem változik", [utana[2].sorszam, utana[2].feladatTipus, utana[3].sorszam, utana[3].feladatTipus], [3, "ures_pozicionalas", 4, "sajat_aru"]);
    eq("lezárás: invariáns rendben", ellenorizLezarasInvarianst(sorok, utana, "12"), null);
    const rontott = utana.map((s) => (s.id === "13" ? { ...s, sorszam: 2 } : s.id === "12" ? { ...s, sorszam: 3 } : s));
    eq("lezárás: ha a következő sor elmozdulna → hiba (visszagördül)", typeof ellenorizLezarasInvarianst(sorok, rontott, "12"), "string");
    const tipusValt = utana.map((s) => (s.id === "13" ? { ...s, feladatTipus: "varakozas" } : s));
    eq("lezárás: ha a következő sor típusa változna → hiba", typeof ellenorizLezarasInvarianst(sorok, tipusValt, "12"), "string");
    const masikIs = utana.map((s) => (s.id === "14" ? { ...s, lezarvaAt: "x" } : s));
    eq("lezárás: másik sor lezárása → hiba", typeof ellenorizLezarasInvarianst(sorok, masikIs, "12"), "string");
    eq("már lezárt sor újra lezárva: nem változik", lezarFeladatot(utana, "12", "később")[1].lezarvaAt, "2026-10-12 11:00:00+02");

    eq("verzió egyezik: rendben", ellenorizVerziot(3, 3), { ok: true });
    const elavult = ellenorizVerziot(4, 3);
    eq("elavult verzió: elutasítva, érthető üzenettel", [elavult.ok, !elavult.ok && /közben valaki módosította/.test(elavult.hiba)], [false, true]);
    eq("nem egész verzió: elutasítva", ellenorizVerziot(1, Number.NaN).ok, false);

    const ff = sorok.map((s) => ({ id: s.id, sorszam: s.sorszam, lezarvaAt: s.lezarvaAt }));
    eq("átrendezés: permutáció rendben", ellenorizAtrendezest(ff, ["13", "14", "11", "12"]), { ok: true });
    eq("átrendezés: hiányzó feladat → hiba", ellenorizAtrendezest(ff, ["11", "12", "13"]).ok, false);
    eq("átrendezés: duplikált → hiba", ellenorizAtrendezest(ff, ["11", "11", "13", "14"]).ok, false);
    eq("átrendezés: idegen id → hiba", ellenorizAtrendezest(ff, ["11", "12", "13", "99"]).ok, false);
    const lezart = ff.map((s) => (s.id === "12" ? { ...s, lezarvaAt: "x" } : s));
    eq("átrendezés: lezárt feladat nem mozdulhat", ellenorizAtrendezest(lezart, ["12", "11", "13", "14"]).ok, false);
    eq("átrendezés: a lezárt után szabad", ellenorizAtrendezest(lezart, ["11", "12", "14", "13"]), { ok: true });
    eq("indok kötelező", [ellenorizIndokot("").ok, ellenorizIndokot("  ").ok, ellenorizIndokot("a vevő kérte").ok], [false, false, true]);

    // Kötött sorrend (átrendezés utáni újraszámolás): az üres szakaszok az új sorrendhez igazodnak.
    const a = munka({ id: "1", felrako: h("Szakoly, Rákóczi utca 26"), lerako: h("Tata") });
    const b = munka({ id: "2", felrako: h("Tata"), lerako: h("Győr") });
    const tav = tesztTav({ "Szakoly, Rákóczi utca 26→Tata": 300, "Tata→Győr": 40, "Szakoly, Rákóczi utca 26→Tata ": 300, "Győr→Szakoly, Rákóczi utca 26": 330, "Tata→Szakoly, Rákóczi utca 26": 300 });
    const kotott = await epitMenetJavaslat({ nap: NAP, munkak: [a, b], indulas: { cim: "Szakoly, Rákóczi utca 26", pont: null, telephelyPontId: "1" }, telephelyek: TELEPHELYEK, kapacitas: KAP, beallitas: BEALL, tav, sorrend: ["2", "1"], sorszamKezdet: 3, elsoIndulas: false });
    eq("kötött sorrend: 2 előbb, üres szakaszokkal, sorszám 3-tól", kotott.map((x) => `${x.sorszam}:${x.megbizasId ?? "ü"}`), ["3:ü", "4:2", "5:ü", "6:1"]);
  }

  // ---------------------------------------------------------------- 8. mező-szintű napló
  eq("napló: csak a naplózott, változott mezők", naplozandoValtozasok(
    { jarmu: "Gergő - AOPU-427", datum: "2026-10-12", lerakasDatum: "", felrako: "Szakoly", lerako: "Tata", fuvardij: "120000", aru: "raklap" },
    { jarmu: "Micó - NMZ-492", datum: "2026-10-12", lerakasDatum: "2026-10-13", felrako: "Szakoly", lerako: "Tata", fuvardij: 130000, aru: "más" }
  ), [
    { mezo: "jarmu", regi: "Gergő - AOPU-427", uj: "Micó - NMZ-492" },
    { mezo: "lerakas_datum", regi: null, uj: "2026-10-13" },
    { mezo: "fuvardij", regi: "120000", uj: "130000" },
  ]);

  // ---------------------------------------------------------------- 9. a nézetek a közös forrást használják
  for (const fajl of ["lib/fuvarozas2/ma-tukor.ts", "lib/fuvarozas2/ma-het.ts", "lib/fuvarozas2/ma-vaszon.ts", "lib/fuvarozas/actions.ts", "lib/fuvarozas/megbizasok.ts", "lib/fuvarozas2/tervezes.ts", "lib/fuvarozas2/tervezo.ts"]) {
    eq(`${fajl}: a jóváhagyott menet sorrendjét alkalmazza`, /alkalmazMenetSorrende(t|ket)\(/.test(readFileSync(fajl, "utf8")), true);
  }
  eq("az idővonal párosítási szabálya érintetlen (nem ismeri a menetet)", /lib\/menet|MenetSorrend/.test(readFileSync("lib/fuvarozas/idovonal.ts", "utf8")), false);

  console.log(`\nMenetterv: ${ok} rendben, ${bad} hibás`);
  if (bad > 0) process.exit(1);
})();
