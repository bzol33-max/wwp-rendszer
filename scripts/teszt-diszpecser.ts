// Diszpécser nézet (6. fázis) — a tiszta rész (lib/fuvarozas2/diszpecser-alap.ts).
// Futtatás: npx tsx scripts/teszt-diszpecser.ts
//
// Amit véd: a GPS-frissesség küszöbei (friss ≤ 10, késői ≤ 30, elavult > 30,
// „nincs GPS” — pozíciót nem találunk ki), a probléma-sáv összeállítása és
// sorrendje, a szűrők (URL ↔ állapot, alkalmazás), az idővonal geometriája
// (tengely, blokk-hely, átfedés-sorok, budapesti percek), az okmány-lejárat
// jelzése (≤ 30 nap borostyán, lejárt vörös) és a lista rendezése. Plusz
// statikus őrök: a betöltő nem hív közvetlenül Ecofleetet, és a fülsorban
// ott a Diszpécser.

import { readFileSync } from "node:fs";
import {
  URES_SZURO, alkalmazSzurot, blokkHely, etaMutathato, feladatIdok, feladatIdoszak, feladatProblemai, gpsFrissesseg, hetHetfoje, idoSzoveg, idoTengely,
  jarmuNev, kesesveszely, korSzoveg, minSzelesIdoszak, napEltolva, nezetUrlbol, okmanyJelzes, oraFeliratok, oraJelolok, oraPercNap, percANapban,
  problemak, problemasFeladatKulcsok, rendezLista, sorokraBont, szuroUrlbe, szuroUrlbol, vanSzuro,
  type DiszFeladat, type DiszKocsi, type Diszpecser, type ListaSor,
} from "@/lib/fuvarozas2/diszpecser-alap";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

// 2026-10-12 hétfő, Budapest nyári idő (UTC+2).
const NAP = "2026-10-12";
const T = (hhmm: string, nap = NAP) => new Date(`${nap}T${hhmm}:00+02:00`).toISOString();
const MOST = T("10:00");
const MOST_MS = Date.parse(MOST);

function feladat(r: Partial<DiszFeladat> & { kulcs: string }): DiszFeladat {
  return {
    feladatId: r.kulcs, jarmuKod: "AOPU-427", sorszam: 1, tipus: "berfuvar", megbizasId: null, partner: null, hivatkozas: null,
    honnan: "Szakoly", hova: "Debrecen", telephelyek: [], felrakasAblak: { tol: null, ig: null }, lerakasAblak: { tol: null, ig: null },
    tervIndulas: null, tervErkezes: null, tenyIndulas: null, tenyErkezes: null, eta: null, etaCel: null, allapot: "tervezett",
    uresKm: null, rakottKm: null, kmForras: null, raklapDb: null, kapacitasRaklap: null, koltseg: null, dokDb: 0, figyelmeztetesek: [],
    ...r,
  };
}
function kocsi(r: Partial<DiszKocsi> & { kod: string }): DiszKocsi {
  return {
    jarmuId: "1", cimke: r.kod, vontato: r.kod, potkocsi: null, sofor: "Gergő", vanGpsEszkoz: true, gps: null, gpsHiba: null,
    menetForras: "jovahagyott", menetAllapot: "jovahagyott", menetId: "1", feladatok: [], kovetkezoCel: null, ...r,
  };
}
const BEALL = { gpsKesoiPerc: 10, gpsElavultPerc: 30, uresIndulasKm: 30 };

(() => {
  // ------------------------------------------------------------ GPS-frissesség
  eq("frissesség: nincs jel", gpsFrissesseg(null, MOST_MS, 10, 30), "nincs");
  eq("frissesség: érvénytelen idő → nincs", gpsFrissesseg("nem idő", MOST_MS, 10, 30), "nincs");
  eq("frissesség: 0 perc friss", gpsFrissesseg(MOST, MOST_MS, 10, 30), "friss");
  eq("frissesség: pont 10 perc még friss", gpsFrissesseg(T("09:50"), MOST_MS, 10, 30), "friss");
  eq("frissesség: 11 perc késői", gpsFrissesseg(T("09:49"), MOST_MS, 10, 30), "kesoi");
  eq("frissesség: pont 30 perc késői", gpsFrissesseg(T("09:30"), MOST_MS, 10, 30), "kesoi");
  eq("frissesség: 31 perc elavult", gpsFrissesseg(T("09:29"), MOST_MS, 10, 30), "elavult");
  eq("frissesség: a beállítás küszöbét követi (5/15)", gpsFrissesseg(T("09:52"), MOST_MS, 5, 15), "kesoi");
  eq("frissesség: jövőbeli időbélyeg is friss", gpsFrissesseg(T("10:02"), MOST_MS, 10, 30), "friss");
  eq("frissesség: Postgres-alak is érthető", gpsFrissesseg("2026-10-12 09:58:00+02", MOST_MS, 10, 30), "friss");
  eq("kor szöveg perc", korSzoveg(T("09:47"), MOST_MS), "13 perce");
  eq("kor szöveg óra", korSzoveg(T("08:40"), MOST_MS), "1 ó 20 p-e");
  eq("kor szöveg nap", korSzoveg(T("09:00", "2026-10-10"), MOST_MS), "2 napja");
  eq("kor szöveg nincs", korSzoveg(null, MOST_MS), null);

  // ------------------------------------------------------------ budapesti percek
  eq("perc a napban: 08:30", percANapban(T("08:30"), NAP), 510);
  eq("perc a napban: előző nap 23:00 → -60", percANapban(T("23:00", "2026-10-11"), NAP), -60);
  eq("perc a napban: másnap 01:00 → 1500", percANapban(T("01:00", "2026-10-13"), NAP), 1500);
  eq("perc a napban: téli idő (UTC+1)", percANapban(new Date("2026-11-02T07:00:00Z").toISOString(), "2026-11-02"), 480);
  eq("perc a napban: null", percANapban(null, NAP), null);
  eq("hét hétfője (vasárnapból)", hetHetfoje("2026-10-18"), "2026-10-12");
  eq("hét hétfője (hétfőből)", hetHetfoje("2026-10-12"), "2026-10-12");
  eq("nap eltolás hónaphatáron", napEltolva("2026-10-31", 1), "2026-11-01");

  // ------------------------------------------------------------ okmányok
  eq("okmány: lejárt", okmanyJelzes("2026-10-01", NAP), { allapot: "lejart", hatraNap: -11 });
  eq("okmány: aznap még nem lejárt (0 nap)", okmanyJelzes(NAP, NAP), { allapot: "hamarosan", hatraNap: 0 });
  eq("okmány: 30 nap borostyán", okmanyJelzes("2026-11-11", NAP), { allapot: "hamarosan", hatraNap: 30 });
  eq("okmány: 31 nap nincs jel", okmanyJelzes("2026-11-12", NAP), null);
  eq("okmány: nincs dátum", okmanyJelzes(null, NAP), null);

  // ------------------------------------------------------------ késésveszély
  const kesoTerv = feladat({ kulcs: "a", tervErkezes: T("14:00"), lerakasAblak: { tol: T("10:00"), ig: T("13:00") } });
  eq("késés: terv a lerakási ablak vége után", kesesveszely(kesoTerv)?.forras, "terv");
  eq("késés: élő ETA felülírja a tervet (időben)", kesesveszely({ ...kesoTerv, eta: T("12:30") }), null);
  eq("késés: élő ETA késik", kesesveszely({ ...kesoTerv, tervErkezes: T("12:00"), eta: T("13:20") })?.forras, "eta");
  eq("késés: kész feladat nem késik", kesesveszely({ ...kesoTerv, allapot: "kesz" }), null);
  eq("késés: felrakás terve az ablak után", kesesveszely(feladat({ kulcs: "b", tervIndulas: T("09:00"), felrakasAblak: { tol: T("07:00"), ig: T("08:00") } }))?.hol, "felrako");
  eq("késés: elkezdett felrakás nem késés", kesesveszely(feladat({ kulcs: "b", tervIndulas: T("09:00"), tenyIndulas: T("07:50"), felrakasAblak: { tol: T("07:00"), ig: T("08:00") } })), null);
  eq("késés: ablak nélkül nincs", kesesveszely(feladat({ kulcs: "c", tervErkezes: T("23:00") })), null);

  // ------------------------------------------------------------ probléma-sáv
  const adat: Pick<Diszpecser, "kocsik" | "kocsiNelkul" | "beallitas" | "most"> = {
    most: MOST,
    beallitas: BEALL,
    kocsik: [
      kocsi({
        kod: "AOPU-427", gps: { lat: 47.5, lon: 21.6, utolsoAdat: T("09:55"), cim: null, sebesseg: 70 },
        feladatok: [
          feladat({ kulcs: "u1", tipus: "ures_pozicionalas", sorszam: 1, figyelmeztetesek: [{ kod: "ures_indulas", szoveg: "Üres indulás 85 km" }] }),
          feladat({ kulcs: "f2", sorszam: 2, tervErkezes: T("14:00"), lerakasAblak: { tol: null, ig: T("13:00") } }),
          feladat({ kulcs: "f3", sorszam: 3, allapot: "kesz", figyelmeztetesek: [{ kod: "hianyzo_cim", szoveg: "régi" }] }),
        ],
      }),
      kocsi({
        kod: "NMZ-492", sofor: "Micó", gps: { lat: 47, lon: 19, utolsoAdat: T("08:00"), cim: null, sebesseg: 0 },
        feladatok: [feladat({ kulcs: "n1", jarmuKod: "NMZ-492", figyelmeztetesek: [{ kod: "utkozes", szoveg: "ütközik" }], tervErkezes: T("15:00"), lerakasAblak: { tol: null, ig: T("12:00") } })],
      }),
      kocsi({ kod: "JANI", sofor: "Jani", vanGpsEszkoz: false, feladatok: [feladat({ kulcs: "j1", jarmuKod: "JANI", tipus: "sajat_aru", figyelmeztetesek: [{ kod: "kapacitas", szoveg: "35 raklap > 33 hely" }] })] }),
      kocsi({ kod: "UJ", sofor: "Új", vanGpsEszkoz: false, feladatok: [] }),
    ],
    kocsiNelkul: [{ id: "99", partner: "Lösung", honnan: "Sárvár", hova: "Debrecen" }],
  };
  const p = problemak(adat);
  const tipusok = p.map((x) => `${x.tipus}:${x.jarmuKod ?? "-"}`);
  eq("probléma: súlyosak elöl (késés, ütközés, kapacitás), majd GPS, üres indulás, kocsi nélkül", tipusok, [
    "kesesveszely:AOPU-427", "utkozes:NMZ-492", "kapacitas:JANI", "gps:NMZ-492", "gps:JANI", "ures_indulas:AOPU-427", "kocsi_nelkul:-",
  ]);
  eq("probléma: a tervből számolt késést az ütközés-jelzés mellett nem duplázza", p.filter((x) => x.feladatKulcs === "n1" && x.tipus !== "gps").map((x) => x.tipus), ["utkozes"]);
  eq("probléma: a kész feladat régi figyelmeztetése nem jelenik meg", p.some((x) => x.feladatKulcs === "f3"), false);
  eq("probléma: friss GPS-ű kocsira nincs GPS-jelzés", p.some((x) => x.tipus === "gps" && x.jarmuKod === "AOPU-427"), false);
  eq("probléma: feladat nélküli kocsi GPS-hiánya nem probléma", p.some((x) => x.jarmuKod === "UJ"), false);
  eq("probléma: a GPS-jelzés a kocsi első nyitott feladatát jelöli ki", p.find((x) => x.tipus === "gps" && x.jarmuKod === "NMZ-492")?.feladatKulcs, "n1");
  eq("probléma: eszköz nélküli kocsi szövege", p.find((x) => x.tipus === "gps" && x.jarmuKod === "JANI")?.szoveg, "JANI: nincs GPS-jel — nincs Ecofleet-eszköz");
  eq("probléma: elavult jel szövege a korral és a határral", p.find((x) => x.tipus === "gps" && x.jarmuKod === "NMZ-492")?.szoveg, "NMZ-492: elavult GPS-jel (2 ó 0 p-e, határ 30 perc)");
  eq("probléma: kocsi nélküli fuvar a megbízásra mutat", p.find((x) => x.tipus === "kocsi_nelkul")?.megbizasId, "99");
  eq("probléma: élő ETA-késés az ütközés mellett is megjelenik", problemak({ ...adat, kocsik: [kocsi({ kod: "X", gps: { lat: 1, lon: 1, utolsoAdat: MOST, cim: null, sebesseg: 0 }, feladatok: [feladat({ kulcs: "x", eta: T("13:30"), lerakasAblak: { tol: null, ig: T("13:00") }, figyelmeztetesek: [{ kod: "utkozes", szoveg: "ü" }] })] })], kocsiNelkul: [] }).map((x) => x.tipus), ["kesesveszely", "utkozes"]);
  eq("probléma: üres nap → nincs", problemak({ ...adat, kocsik: [], kocsiNelkul: [] }), []);

  // ------------------------------------------------------------ szűrők
  const sz = szuroUrlbol(new URLSearchParams("jarmu=NMZ-492&statusz=rossz&partner=L%C3%B6sung&x=1"));
  eq("szűrő URL-ből: ismeretlen státusz elhagyva", sz, { jarmu: "NMZ-492", sofor: "", partner: "Lösung", telephely: "", statusz: "" });
  eq("szűrő URL-be: üresek és alapnézet kimaradnak", szuroUrlbe(sz, { nap: null, nezet: "idovonal" }).toString(), "jarmu=NMZ-492&partner=L%C3%B6sung");
  eq("szűrő URL-be: nap és nézet", szuroUrlbe(URES_SZURO, { nap: "2026-10-13", nezet: "lista" }).toString(), "nap=2026-10-13&nezet=lista");
  eq("szűrő oda-vissza", szuroUrlbol(szuroUrlbe({ jarmu: "JANI", sofor: "Jani", partner: "", telephely: "Szakoly (telephely)", statusz: "problema" })), { jarmu: "JANI", sofor: "Jani", partner: "", telephely: "Szakoly (telephely)", statusz: "problema" });
  eq("nézet URL-ből: ismeretlen → idővonal", [nezetUrlbol("terkep"), nezetUrlbol("x"), nezetUrlbol(null)], ["terkep", "idovonal", "idovonal"]);
  eq("van szűrő", [vanSzuro(URES_SZURO), vanSzuro({ ...URES_SZURO, statusz: "kesz" })], [false, true]);

  const k2 = [
    kocsi({ kod: "A", sofor: "Gergő", feladatok: [feladat({ kulcs: "1", partner: "Lösung", telephelyek: ["Szakoly (telephely)"] }), feladat({ kulcs: "2", partner: "Duvenbeck", allapot: "kesz" })] }),
    kocsi({ kod: "B", sofor: "Micó", feladatok: [feladat({ kulcs: "3", partner: "lösung " })] }),
  ];
  const kulcsok = (ks: DiszKocsi[]) => ks.map((k) => `${k.kod}:${k.feladatok.map((f) => f.kulcs).join(",")}`);
  eq("szűrés: nincs szűrő → minden", kulcsok(alkalmazSzurot(k2, URES_SZURO)), ["A:1,2", "B:3"]);
  eq("szűrés: jármű a sávot szűri", kulcsok(alkalmazSzurot(k2, { ...URES_SZURO, jarmu: "B" })), ["B:3"]);
  eq("szűrés: sofőr kis/nagybetű nélkül", kulcsok(alkalmazSzurot(k2, { ...URES_SZURO, sofor: "gergő" })), ["A:1,2"]);
  eq("szűrés: partner a feladatot szűri, a sáv marad", kulcsok(alkalmazSzurot(k2, { ...URES_SZURO, partner: "Lösung" })), ["A:1", "B:3"]);
  eq("szűrés: telephely", kulcsok(alkalmazSzurot(k2, { ...URES_SZURO, telephely: "szakoly (telephely)" })), ["A:1", "B:"]);
  eq("szűrés: státusz kész", kulcsok(alkalmazSzurot(k2, { ...URES_SZURO, statusz: "kesz" })), ["A:2", "B:"]);
  eq("szűrés: problémás", kulcsok(alkalmazSzurot(k2, { ...URES_SZURO, statusz: "problema" }, new Set(["3"]))), ["A:", "B:3"]);
  eq("szűrés: nem módosítja a bemenetet", k2[0].feladatok.length, 2);

  // ------------------------------------------------------------ idővonal-geometria
  eq("időszak: terv", feladatIdoszak(feladat({ kulcs: "g", tervIndulas: T("08:00"), tervErkezes: T("11:30") }), NAP), { kezd: 480, veg: 690 });
  eq("időszak: a tény felülírja a tervet", feladatIdoszak(feladat({ kulcs: "g", tervIndulas: T("08:00"), tenyIndulas: T("08:20"), tervErkezes: T("11:30"), tenyErkezes: T("11:00") }), NAP), { kezd: 500, veg: 660 });
  eq("időszak: csak kezdés → 30 perces blokk", feladatIdoszak(feladat({ kulcs: "g", tervIndulas: T("08:00") }), NAP), { kezd: 480, veg: 510 });
  eq("időszak: csak érkezés → 30 perccel előtte", feladatIdoszak(feladat({ kulcs: "g", eta: T("12:00") }), NAP), { kezd: 690, veg: 720 });
  eq("időszak: idő nélkül null", feladatIdoszak(feladat({ kulcs: "g" }), NAP), null);
  eq("tengely: feladat nélkül 0–24", idoTengely([], 600), { tol: 0, ig: 1440 });
  eq("tengely: órára kerekítve, 1 ó ráhagyással", idoTengely([{ kezd: 330, veg: 1000 }], null), { tol: 240, ig: 1080 });
  eq("tengely: a most-ot is tartalmazza", idoTengely([{ kezd: 480, veg: 600 }, { kezd: 600, veg: 1000 }], 1200), { tol: 420, ig: 1260 });
  eq("tengely: legalább 8 óra", idoTengely([{ kezd: 600, veg: 660 }], null), { tol: 360, ig: 840 });
  eq("tengely: 0–24 közé vágva (éjféli átnyúlás)", idoTengely([{ kezd: -120, veg: 1500 }], null), { tol: 0, ig: 1440 });
  eq("blokk: arányos hely", blokkHely({ kezd: 480, veg: 600 }, { tol: 360, ig: 1080 }), { bal: 16.67, szel: 16.67, levagvaBal: false, levagvaJobb: false });
  eq("blokk: levágás bal oldalt", blokkHely({ kezd: -60, veg: 120 }, { tol: 0, ig: 1440 }), { bal: 0, szel: 8.33, levagvaBal: true, levagvaJobb: false });
  eq("blokk: minimális szélesség a jobb szélen", blokkHely({ kezd: 1440, veg: 1440 }, { tol: 0, ig: 1440 }), { bal: 98.5, szel: 1.5, levagvaBal: false, levagvaJobb: false });
  eq("sorok: egymás utániak egy sorban", sorokraBont([{ kezd: 0, veg: 60 }, { kezd: 60, veg: 120 }]), [0, 0]);
  eq("sorok: átfedő a második sorba, a következő vissza", sorokraBont([{ kezd: 0, veg: 100 }, { kezd: 50, veg: 150 }, { kezd: 120, veg: 200 }]), [0, 1, 0]);
  eq("sorok: a bemenet sorrendjétől független", sorokraBont([{ kezd: 50, veg: 150 }, { kezd: 0, veg: 100 }]), [1, 0]);
  eq("óra-jelölők 2 óránként", oraJelolok({ tol: 360, ig: 840 }), [360, 480, 600, 720, 840]);
  eq("óra-jelölők hosszú tengelyen 3 óránként", oraJelolok({ tol: 0, ig: 1440 }).length, 9);

  // ------------------------------------------------------------ lista-rendezés
  const sorok: ListaSor[] = [
    { ...feladat({ kulcs: "1", partner: "Zala", koltseg: { ft: 50000, forras: "becsles" }, allapot: "kesz" }), jarmuCimke: "A", jarmuIndex: 0 },
    { ...feladat({ kulcs: "2", partner: "Ádám", koltseg: null }), jarmuCimke: "B", jarmuIndex: 1 },
    { ...feladat({ kulcs: "3", partner: "Lösung", koltseg: { ft: 20000, forras: "teny" }, allapot: "folyamatban" }), jarmuCimke: "A", jarmuIndex: 0 },
  ];
  const k = (x: ListaSor[]) => x.map((s) => s.kulcs);
  eq("lista: partner magyar ábécé szerint", k(rendezLista(sorok, "partner", "asc")), ["2", "3", "1"]);
  eq("lista: költség csökkenő, üres a végén", k(rendezLista(sorok, "koltseg", "desc")), ["1", "3", "2"]);
  eq("lista: költség növekvő, üres a végén", k(rendezLista(sorok, "koltseg", "asc")), ["3", "1", "2"]);
  eq("lista: jármű stabil", k(rendezLista(sorok, "jarmu", "asc")), ["1", "3", "2"]);
  eq("lista: státusz (folyamatban, tervezett, kész)", k(rendezLista(sorok, "statusz", "asc")), ["3", "2", "1"]);

  // ------------------------------------------------------------ QA-javítások (2026-10-10)
  // 1. ETA csak friss/késői GPS-szel és ugyanarra a megbízásra.
  eq("ETA: friss GPS, ugyanaz a megbízás", etaMutathato("friss", "12", "12"), true);
  eq("ETA: késői GPS is jó", etaMutathato("kesoi", "12", "12"), true);
  eq("ETA: nincs GPS → nem számolható", etaMutathato("nincs", "12", "12"), false);
  eq("ETA: elavult GPS → nem számolható", etaMutathato("elavult", "12", "12"), false);
  eq("ETA: más megbízásra szóló becslés nem jó", etaMutathato("friss", "13", "12"), false);
  eq("ETA: becslés nélkül nem jó", etaMutathato("friss", null, "12"), false);
  // 1b. Vég < kezdet soha.
  eq("idők: rendes terv", feladatIdok(feladat({ kulcs: "i", tervIndulas: T("06:00"), tervErkezes: T("14:06") })), { kezd: T("06:00"), veg: T("14:06"), ellentmondas: false });
  eq("idők: terv-vég a kezdet előtt → csak a kezdet", feladatIdok(feladat({ kulcs: "i", tervIndulas: T("14:51"), tervErkezes: T("09:17") })), { kezd: T("14:51"), veg: null, ellentmondas: true });
  eq("idők: ETA a terv-kezdet előtt → az ETA marad (megbízhatóbb)", feladatIdok(feladat({ kulcs: "i", tervIndulas: T("09:29"), eta: T("07:00") })), { kezd: null, veg: T("07:00"), ellentmondas: true });
  eq("idők: tény-kezdet a terv-vég után → a tény marad", feladatIdok(feladat({ kulcs: "i", tenyIndulas: T("15:00"), tervErkezes: T("14:00") })), { kezd: T("15:00"), veg: null, ellentmondas: true });
  eq("idők: egyenlő kezdet és vég ellentmondás", feladatIdok(feladat({ kulcs: "i", tervIndulas: T("08:00"), tervErkezes: T("08:00") })).ellentmondas, true);
  eq("idő-szöveg: rendes", idoSzoveg(feladat({ kulcs: "i", tervIndulas: T("06:00"), tervErkezes: T("14:06") }), NAP), "06:00–14:06");
  eq("idő-szöveg: ellentmondásosnál csak a kezdet", idoSzoveg(feladat({ kulcs: "i", tervIndulas: T("14:51"), tervErkezes: T("09:17") }), NAP), "14:51–");
  eq("idő-szöveg: előző napi kezdés jelölve", idoSzoveg(feladat({ kulcs: "i", tervIndulas: T("21:52", "2026-10-11"), tervErkezes: T("06:00") }), NAP), "21:52 (−1)–06:00");
  eq("idő-szöveg: semmi", idoSzoveg(feladat({ kulcs: "i" }), NAP), "");
  eq("óra+nap: másnap", oraPercNap(T("07:00", "2026-10-13"), NAP), "07:00 (+1)");
  eq("időszak: ellentmondásos terv nem fordul meg", feladatIdoszak(feladat({ kulcs: "i", tervIndulas: T("14:51"), tervErkezes: T("09:17") }), NAP), { kezd: 891, veg: 921 });
  // 2. A ▲ jel pontosan a probléma-lista feladat-szintű elemeiből.
  const jelolt = problemasFeladatKulcsok(p);
  eq("jelölő: csak feladat-szintű problémák (a GPS nem jelöl)", [...jelolt].sort(), ["f2", "j1", "n1", "u1"]);
  eq("jelölő: minden jelölt feladathoz van saját sor a listában", [...jelolt].every((kl) => p.some((x) => x.szint === "feladat" && x.feladatKulcs === kl)), true);
  const csakGps = problemak({ ...adat, kocsik: [kocsi({ kod: "NMZ-492", gps: null, feladatok: [feladat({ kulcs: "g1" })] })], kocsiNelkul: [] });
  eq("jelölő: csak GPS-gond → a feladaton nincs jel", [csakGps.map((x) => x.tipus), problemasFeladatKulcsok(csakGps).size], [["gps"], 0]);
  eq("részlet: a feladat saját és a kocsi problémái", (() => { const r = feladatProblemai(p, { kulcs: "n1", jarmuKod: "NMZ-492" }); return [r.sajat.map((x) => x.tipus), r.kocsi.map((x) => x.tipus)]; })(), [["utkozes"], ["gps"]]);
  eq("szint: GPS kocsi, kocsi nélküli flotta", [p.find((x) => x.tipus === "gps")?.szint, p.find((x) => x.tipus === "kocsi_nelkul")?.szint, p.find((x) => x.tipus === "utkozes")?.szint], ["kocsi", "flotta", "feladat"]);
  // 3. Chip-hely és a „most” címke ütközése.
  eq("feliratok: a most melletti óra-felirat kimarad", oraFeliratok({ tol: 0, ig: 1440 }, 1341), [0, 180, 360, 540, 720, 900, 1080]);
  eq("feliratok: most nélkül mind", oraFeliratok({ tol: 0, ig: 1440 }, null).length, 9);
  eq("feliratok: távoli most nem rejt el semmit", oraFeliratok({ tol: 360, ig: 840 }, 660), [360, 480, 600, 720, 840]);
  eq("feliratok: közeli most a szomszéd órát rejti", oraFeliratok({ tol: 360, ig: 840 }, 620), [360, 480, 720, 840]);
  eq("min. szélesség: rövid blokk a sorokhoz kiszélesítve", minSzelesIdoszak({ kezd: 600, veg: 610 }, { tol: 0, ig: 1000 }), { kezd: 600, veg: 690 });
  eq("min. szélesség: rövid blokkok külön sorba kerülnek", sorokraBont([{ kezd: 600, veg: 610 }, { kezd: 620, veg: 630 }].map((x) => minSzelesIdoszak(x, { tol: 0, ig: 1000 }))), [0, 1]);
  // 5. Egy névszabály.
  eq("név: kód a címkében", jarmuNev({ kod: "AOPU-427", cimke: "AOPU-427/AOTY-474" }), "AOPU-427/AOTY-474");
  eq("név: kód + címke", jarmuNev({ kod: "JANI", cimke: "DAF XG (gyártás alatt)" }), "JANI · DAF XG (gyártás alatt)");
  eq("név: címke nélkül a kód", jarmuNev({ kod: "QAT-101", cimke: "" }), "QAT-101");
  eq("név: kód nélkül a címke", jarmuNev({ kod: null, cimke: "3. kocsi" }), "3. kocsi");
  eq("probléma-szöveg a névszabállyal", problemak({ ...adat, kocsik: [kocsi({ kod: "JANI", cimke: "DAF XG (gyártás alatt)", vanGpsEszkoz: false, feladatok: [feladat({ kulcs: "j" })] })], kocsiNelkul: [] })[0].szoveg, "JANI · DAF XG (gyártás alatt): nincs GPS-jel — nincs Ecofleet-eszköz");

  // ------------------------------------------------------------ statikus őrök
  const betolto = readFileSync("lib/fuvarozas2/diszpecser.ts", "utf8");
  eq("betöltő: server-only", /^import "server-only";/.test(betolto), true);
  eq("betöltő: jogosultság-ellenőrzés", /requireViewPermission\("fuvarozas"\)/.test(betolto), true);
  eq("betöltő: nem hív közvetlenül Ecofleetet (a gyorsítótárazott GPS-láncot használja)", /getFleetLastPositions|getUtvonalJelentes|getVehicleTrips|ecofleetGet/.test(betolto), false);
  eq("betöltő: a menetterv napját és az idővonalat használja", /getMenettervNap\(/.test(betolto) && /getIdovonalak\(/.test(betolto), true);
  const fulek = readFileSync("components/fuvarozas2/fulek.tsx", "utf8");
  eq("fülsor: Diszpécser fül", /\/fuvarozas2\/diszpecser"/.test(fulek), true);
  // Navigáció 2026-10-12: minden funkció pontosan egy helyen.
  const fulSorok = [...fulek.matchAll(/\{ href: "([^"]+)", label: "([^"]+)"([^}]*)\}/g)].map((m) => ({ href: m[1], label: m[2], rejtett: /rejtett: true/.test(m[3]) }));
  const hrefek = fulSorok.map((f) => f.href);
  eq("fülsor: minden cím egyszer szerepel", hrefek.length === new Set(hrefek).size, true);
  eq("fülsor: látható alfülek", fulSorok.filter((f) => !f.rejtett).map((f) => f.label), ["Most", "Diszpécser", "GPS", "A hét", "Ajánlat", "Lista", "Levelek", "Partnerek", "Áttekintés", "Kimutatás", "Költségek"]);
  eq("fülsor: rejtett (átirányított) lapok", fulSorok.filter((f) => f.rejtett).map((f) => f.href), ["/fuvarozas2/kalkulator", "/fuvarozas2/elszamolas"]);
  eq("fülsor: az Ajánlat címe /timocom marad (böngésző „→ WWP”)", fulSorok.find((f) => f.label === "Ajánlat")?.href, "/fuvarozas2/timocom");
  const konfig = readFileSync("next.config.ts", "utf8");
  eq("átirányítás: kalkulátor → Ajánlat", /source: "\/fuvarozas2\/kalkulator", destination: "\/fuvarozas2\/timocom", permanent: false/.test(konfig), true);
  eq("átirányítás: elszámolás → Megbízások", /source: "\/fuvarozas2\/elszamolas", destination: "\/fuvarozas2\/megbizasok", permanent: false/.test(konfig), true);
  const lap = readFileSync("app/fuvarozas2/diszpecser/page.tsx", "utf8");
  eq("Diszpécser lap: menetterv a Diszpécser napjára", /getMenettervNap\(adat\.nap\)/.test(lap) && /<MenettervPanel/.test(lap), true);
  eq("Diszpécser lap: menetterv-szerkesztés a fuvarozás szerkesztési jogával", /szerkeszthet=\{session\.can\("fuvarozas"\)\.edit\}/.test(lap), true);
  eq("Tervezés lap: nincs rajta menetterv és régi hét", /MenettervPanel|RegiTervHet/.test(readFileSync("app/fuvarozas2/tervezes/page.tsx", "utf8")), false);
  eq("diszpécser: nem visz a Tervezés menettervére", /tervezes\?menetnap|tervezes#menetterv/.test(readFileSync("components/fuvarozas2/diszpecser.tsx", "utf8")), false);
  eq("Ma oldal érintetlen (nem hivatkozik a diszpécserre)", /diszpecser/.test(readFileSync("app/fuvarozas2/page.tsx", "utf8")), false);
  const kliens = readFileSync("components/fuvarozas2/diszpecser.tsx", "utf8");
  eq("térkép: dinamikus import, ssr nélkül", /dynamic\(\(\) => import\("@\/components\/fuvarozas2\/diszpecser-terkep"\)[\s\S]*?ssr: false/.test(kliens), true);
  eq("probléma-sáv: aria-live polite", /aria-live="polite"/.test(kliens), true);
  eq("lista: Költség oszlop", /kulcs: "koltseg", cimke: "Költség"/.test(kliens), true);
  eq("betöltő: az ETA a GPS-frissességhez kötött", /etaMutathato\(frissesseg/.test(betolto), true);

  console.log(`\nDiszpécser: ${ok} rendben, ${bad} hibás`);
  if (bad > 0) process.exit(1);
})();
