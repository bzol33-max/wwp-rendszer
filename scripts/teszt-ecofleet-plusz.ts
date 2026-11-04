// Tank, tachó-terv, sebesség, tankolás-egyeztetés és a közös getLastData tesztje.
// Futtatás: npx tsx scripts/teszt-ecofleet-plusz.ts

import { _tesztCacheUrit, _tesztFetchBeallit, getLastDataCachelve } from "@/lib/ecofleet/kliens";
import {
  pihenoErkezesElott, sebessegOsszegzes, szenzorTankolasok, tachoTervLastDatabol,
  tankLiterLastDatabol, tankolasEgyeztetes,
} from "@/lib/ecofleet/plusz";
import { getFleetLastPositions } from "@/lib/fuvarozas/ecofleet";
import { orszagbanVan, vetit } from "@/lib/proto/orszag";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

// Tank
eq("tank: szám", tankLiterLastDatabol({ fuel: 838 }), 838);
eq("tank: hiányzik → null, nem 0", tankLiterLastDatabol({}), null);
eq("tank: null → null", tankLiterLastDatabol({ fuel: null }), null);

// Tachó-terv (az éles válasz alakja: eltolás nélküli budapesti falióra)
const vezet = tachoTervLastDatabol({ tcoData: { nextDrivingBreak: 13754, nextDrivingBreakTimestamp: "2026-11-04 16:00:32", nextDailyRest: 25165, nextDailyRestTimestamp: "2026-11-04 19:10:43" } });
eq("szünet időpontja budapesti idő", vezet?.szunetIdopont?.toISOString(), "2026-11-04T15:00:32.000Z");
eq("napi pihenő időpontja", vezet?.napiPihenoIdopont?.toISOString(), "2026-11-04T18:10:43.000Z");
eq("szünetig perc", vezet?.szunetigPerc, 229);
const all = tachoTervLastDatabol({ tcoData: { nextDrivingBreak: 16178, nextDrivingBreakTimestamp: null, nextDailyRest: null } });
eq("álló kocsi: nincs időpont", all?.szunetIdopont, null);
eq("álló kocsi: a perc megvan", all?.szunetigPerc, 270);
eq("hiányzó pihenő → null", all?.napiPihenoigPerc, null);
eq("nincs tcoData → null", tachoTervLastDatabol({ tcoData: null }), null);
eq("érkezés a pihenő után", pihenoErkezesElott(vezet, new Date("2026-11-04T18:30:00Z")), true);
eq("érkezés a pihenő előtt", pihenoErkezesElott(vezet, new Date("2026-11-04T17:00:00Z")), false);
eq("nincs ETA", pihenoErkezesElott(vezet, null), false);

// Sebesség
eq("sebesség", sebessegOsszegzes([{ maxSpeed: 97 }, { maxSpeed: 94 }, { maxSpeed: 0 }]), { max: 97, tullepesDb: 1, utDb: 3 });
eq("sebesség: nincs út", sebessegOsszegzes([]), { max: null, tullepesDb: 0, utDb: 0 });

// Szenzor: az élő napok alakja (2026-10-05: csak lötyögés, 10-06: két lépéses tankolás, 10-02: után kis ugrás)
eq("lötyögés nem tankolás", szenzorTankolasok([
  { idopont: "2026-10-05 04:12:00+0200", hozzaadott: 82 },
  { idopont: "2026-10-05 04:16:00+0200", hozzaadott: 59 },
  { idopont: "2026-10-05 10:02:00+0200", hozzaadott: 57 },
]), []);
const ketLepes = szenzorTankolasok([
  { idopont: "2026-10-06 16:19:00+0200", hozzaadott: 641 },
  { idopont: "2026-10-06 16:08:00+0200", hozzaadott: 81 },
]);
eq("két lépés egy tankolás", ketLepes.map((t) => t.liter), [722]);
eq("a tankolás ideje az első lépés", ketLepes[0].idopont.toISOString(), "2026-10-06T14:08:00.000Z");
eq("távoli kis ugrás nem csapódik hozzá", szenzorTankolasok([
  { idopont: "2026-10-02 08:17:00+0200", hozzaadott: 60 },
  { idopont: "2026-10-02 11:11:00+0200", hozzaadott: 733 },
  { idopont: "2026-10-02 11:14:00+0200", hozzaadott: 56 },
]).map((t) => t.liter), [789]);
eq("hibás időpont kimarad", szenzorTankolasok([{ idopont: "x", hozzaadott: 500 }]), []);

eq("a lötyögés nem adódik a tankoláshoz", szenzorTankolasok([
  { idopont: "2026-10-02 10:50:00+0200", hozzaadott: 65, literElotte: 262, literUtana: 327 },
  { idopont: "2026-10-02 10:55:00+0200", hozzaadott: 65, literElotte: 270, literUtana: 335 },
  { idopont: "2026-10-02 11:11:00+0200", hozzaadott: 733, literElotte: 315, literUtana: 1048 },
]).map((t) => t.liter), [786]);

// Országhatár
eq("Sopron bent", orszagbanVan(vetit(47.68, 16.58)), true);
eq("Budapest bent", orszagbanVan(vetit(47.5, 19.04)), true);
eq("Nyírbátor bent", orszagbanVan(vetit(47.83, 22.13)), true);
eq("Bécs kint", orszagbanVan(vetit(48.21, 16.37)), false);
eq("Pozsony kint", orszagbanVan(vetit(48.15, 17.11)), false);
eq("Nagyvárad kint", orszagbanVan(vetit(47.07, 21.93)), false);

// Egyeztetés
const nap = (d: Date) => d.toISOString().slice(0, 10);
const t = (s: string) => new Date(s);
const napok = new Set(["2026-11-02", "2026-11-03"]);
eq("egyezik", tankolasEgyeztetes([{ idopont: t("2026-11-02T13:40:00Z"), liter: 316 }], [{ idopont: t("2026-11-02T13:30:00Z"), liter: 330 }], napok, nap).map((x) => x.tipus), ["egyezik"]);
eq("eltér", tankolasEgyeztetes([{ idopont: t("2026-11-02T13:40:00Z"), liter: 316 }], [{ idopont: t("2026-11-02T13:30:00Z"), liter: 600 }], napok, nap).map((x) => x.tipus), ["elteres"]);
eq("két számla egy tankoláshoz", tankolasEgyeztetes([{ idopont: t("2026-11-02T13:40:00Z"), liter: 600 }], [{ idopont: t("2026-11-02T13:30:00Z"), liter: 300 }, { idopont: t("2026-11-02T13:35:00Z"), liter: 290 }], napok, nap).map((x) => [x.tipus, x.szamlaL]), [["egyezik", 590]]);
eq("két közeli tankolás a saját számláját kapja", tankolasEgyeztetes(
  [{ idopont: t("2026-11-02T08:00:00Z"), liter: 300 }, { idopont: t("2026-11-02T12:00:00Z"), liter: 500 }],
  [{ idopont: t("2026-11-02T08:10:00Z"), liter: 310 }, { idopont: t("2026-11-02T12:10:00Z"), liter: 490 }], napok, nap).map((x) => x.tipus), ["egyezik", "egyezik"]);
eq("nincs számla", tankolasEgyeztetes([{ idopont: t("2026-11-02T13:40:00Z"), liter: 316 }], [], napok, nap).map((x) => x.tipus), ["nincsSzamla"]);
eq("számla, de a szenzor nem nőtt", tankolasEgyeztetes([], [{ idopont: t("2026-11-03T08:00:00Z"), liter: 500 }], napok, nap).map((x) => x.tipus), ["nincsSzenzor"]);
eq("szenzoradat nélküli napon nincs jelzés", tankolasEgyeztetes([], [{ idopont: t("2026-11-05T08:00:00Z"), liter: 500 }], napok, nap), []);
eq("kis rátöltés nem jelzés", tankolasEgyeztetes([], [{ idopont: t("2026-11-03T08:00:00Z"), liter: 80 }], napok, nap), []);
eq("liter nélküli számla: időre egyezik", tankolasEgyeztetes([{ idopont: t("2026-11-02T13:40:00Z"), liter: 316 }], [{ idopont: t("2026-11-02T13:30:00Z"), liter: null }], napok, nap).map((x) => x.tipus), ["egyezik"]);

// Közös getLastData: a pozíciók és a tachó ugyanabból az egy hívásból jönnek
async function kozos() {
  process.env.ECOFLEET_API_KEY = "teszt-kulcs";
  let hivas = 0;
  _tesztCacheUrit();
  _tesztFetchBeallit((async () => {
    hivas++;
    return new Response(JSON.stringify({ status: 0, response: [
      { objectId: 369485, objectName: "NMZ", plate: "NMZ-492", timestamp: "2026-11-04 12:00:00+0100", latitude: 47.5, longitude: 19.0, speed: 72, direction: 90, enginestate: 1, currentOdometer: 917199, fuel: 838 },
      { objectId: 2, plate: "NINCS-GPS", latitude: null, longitude: null },
    ] }));
  }) as typeof fetch);
  const [poz, nyers, poz2] = await Promise.all([getFleetLastPositions(), getLastDataCachelve(), getFleetLastPositions()]);
  eq("egyetlen Ecofleet-hívás", hivas, 1);
  eq("a koordináta nélküli kocsi kimarad", poz.length, 1);
  eq("a pozíció mezői", poz[0], { objectId: "369485", name: "NMZ", plate: "NMZ-492", timestamp: "2026-11-04 12:00:00+0100", latitude: 47.5, longitude: 19, speed: 72, direction: 90, engineOn: true, odometerKm: 917199 });
  eq("a nyers sor is megvan", nyers.sorok.length, 2);
  _tesztCacheUrit();
  _tesztFetchBeallit((async () => new Response(JSON.stringify({ status: 0, response: [{ objectId: 3, plate: "X", latitude: 47, longitude: 19, currentOdometer: null }] }))) as typeof fetch);
  eq("a hiányzó km-óra null, nem 0", (await getFleetLastPositions())[0].odometerKm, null);
  eq("a második hívó ugyanazt látja", poz2[0].timestamp, poz[0].timestamp);
  _tesztFetchBeallit(null);
  _tesztCacheUrit();
}

void kozos().then(() => {
  console.log(`\nEcofleet plusz teszt: ${ok} rendben, ${bad} hiba`);
  if (bad > 0) process.exit(1);
});
