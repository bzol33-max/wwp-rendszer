// A Drive-import közös rétegeinek regressziós tesztje:
// szövegjavítás (normalizalas.ts), partnerfelismerés (partnerek.ts),
// hitelesség-vizsgálat (ellenorzes.ts).
//
// Futtatás:  npx tsx scripts/teszt-import.mts
//
// MIÉRT VAN EZ ITT? Egy korábbi nekifutásnál 33 + 22 állítás futott zöldre —
// csak olyan bemeneten, ami élesben nem létezik: a mintákat a Google Drive
// saját szöveg-megjelenítéséről írtam, élesben viszont a pdf-parse fut, más
// sortöréssel. Az értelmező minden valódi iratra csendben nemet mondott, és a
// feldolgozás visszaesett a nyelvi modellre, ami rossz sorokat gyártott.
//
// Ezért a scripts/teszt-minta/ fájlok a pdf-parse VALÓDI tördelését másolják
// — kitalált cégnevekkel és összegekkel, mert a repó nyilvános. A tabulátorok
// ott vannak, ahol élesben is: azok hordozzák a hasábhatárt.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { normalizaltSzoveg, torzsSzoveg } from "@/lib/fuvarozas/import/normalizalas";
import { felismerPartner, partnerKodSzerint } from "@/lib/fuvarozas/import/partnerek";
import { ellenorizKivontFuvart, type KivontFuvar } from "@/lib/fuvarozas/import/ellenorzes";
import { findJarmuInSzoveg } from "@/lib/fuvarozas/vehicles";

const mintaDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "teszt-minta");
const minta = (nev: string) => readFileSync(path.join(mintaDir, nev), "utf8");

let rendben = 0;
const hibak: string[] = [];
function allit(felteves: boolean, leiras: string) {
  if (felteves) rendben++;
  else hibak.push(leiras);
}
function egyenlo<T>(kapott: T, vart: T, leiras: string) {
  allit(
    Object.is(kapott, vart),
    `${leiras}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`
  );
}

// ---------------------------------------------------------------------------
// 1. Szövegjavítás — a négyszeres nyomtatási ismétlés összevonása
// ---------------------------------------------------------------------------
const rbtNyers = minta("rbt-megbizas.txt");
const rbt = normalizaltSzoveg(rbtNyers);

allit(rbt.includes("123 456,00 HUF"), "a fuvardíj összevonás után is megvan (123 456,00 HUF)");
egyenlo(
  (rbt.match(/123 456,00/g) ?? []).length,
  1,
  "a fuvardíj PONTOSAN egyszer szerepel az összevonás után"
);
egyenlo(
  (rbt.match(/WELL-WORN PALLET KFT/g) ?? []).length,
  1,
  "a négyszer kinyomtatott cégnév egyszer marad"
);
allit(
  rbt.includes("Ügyintézőnk: PELDA BEA"),
  "az ismétlés-futam UTÁN álló érték (ügyintéző neve) nem vész el"
);
allit(
  rbt.includes("Dátum: BUDAPEST, 2026.09.15 R99 / 1111 / 2222"),
  "az ismétlés-futam ELŐTT álló címke+érték (pozíciószám) nem vész el"
);
allit(rbt.includes("Helye: PELDA GYAR ZRT"), "a 'Helye:' címke nem szakad el az értékétől");
egyenlo(
  (rbt.match(/PELDA GYAR ZRT/g) ?? []).length,
  1,
  "a felrakó cégnév egyszer marad"
);
allit(
  rbt.includes("AODU427") && rbt.includes("AOTY474"),
  "a rendszámok (partner-oldali elírással együtt) megmaradnak"
);
allit(rbt.length < rbtNyers.length, "a normalizált szöveg rövidebb a nyersnél");

// A vastagítás-utánzás összevonása SOHA nem törölhet adatot: minden nem üres
// nyers sornak legyen nyoma a normalizált szövegben.
const duvenbeckMintak = ["duvenbeck-megbizas.txt", "duvenbeck-rakomanylista.txt", "duvenbeck-megbizas-tort-cegnev.txt"];
for (const nev of duvenbeckMintak) {
  const nyers = minta(nev);
  const normSorok = new Set(normalizaltSzoveg(nyers).split("\n").map((s) => s.trim()));
  const elveszett = nyers
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !normSorok.has(s));
  egyenlo(elveszett.length, 0, `${nev}: a normalizálás egyetlen sort sem tüntet el`);
}

// ---------------------------------------------------------------------------
// 2. A kisbetűs rész levágása — a csali pénzösszegek eltávolítása
// ---------------------------------------------------------------------------
const rbtPartner = partnerKodSzerint("rbt-europe")!;
const rbtTorzs = torzsSzoveg(rbt, rbtPartner.torzsVege);

allit(rbtTorzs.includes("123 456,00 HUF"), "a levágás UTÁN is megvan a valódi fuvardíj");
allit(rbtTorzs.includes("2026.09.17"), "a levágás után is megvannak a dátumok");
allit(!rbtTorzs.includes("EUR 100"), "a csali kötbér-összeg (EUR 100) levágásra kerül");
allit(!rbtTorzs.includes("EUR 200"), "a csali kötbér-összeg (EUR 200) levágásra kerül");
allit(rbtTorzs.length < rbt.length, "a levágás ténylegesen rövidít a szövegen");

// Ékezetes kezdőbetűs ujjlenyomat: a JavaScript \b nem ismer ékezetes
// szóhatárt, ezért erre külön állítás kell (lásd partnerek.ts).
egyenlo(
  felismerPartner("ÁB Speed Szállítmányozási Kft. 9625 Gór, Széchenyi utca 58.")?.kod,
  "ab-speed",
  "ékezettel kezdődő partnernév felismerése a sor elején"
);

// Öv a nadrágtartó mellé: ha a határoló a fuvardíj ELÉ esne, nem vágunk.
const rosszHatarolo = [/Gépjármű rendszám/];
egyenlo(
  torzsSzoveg(rbt, rosszHatarolo),
  rbt,
  "a levágás elmarad, ha elvinné a fuvardíjat (őrzendő minta)"
);

// ---------------------------------------------------------------------------
// 3. Partnerfelismerés
// ---------------------------------------------------------------------------
egyenlo(felismerPartner(rbt)?.kod, "rbt-europe", "az RBT-sablon felismerése az e-mail-domainből");
egyenlo(
  felismerPartner("Megbízó adatai: ÁB Speed Szállítmányozási Kft. 9625 Gór")?.nev,
  "ÁB Speed Szállítmányozási Kft.",
  "ÁB Speed felismerése"
);
egyenlo(
  felismerPartner("küldje a transport@abspeed.hu címre")?.kod,
  "ab-speed",
  "ÁB Speed felismerése az e-mail-domainből"
);
egyenlo(
  felismerPartner("Transorg Software / Ver:2.6001 / HAPP kft Adószám")?.kod,
  "happ",
  "HAPP felismerése a sablongeneráló szoftver nevéből"
);
egyenlo(
  felismerPartner("A dokumentum az Innomedio Kft. InnoManagement szoftverével készült.")?.kod,
  "trans-sped",
  "Trans-Sped felismerése a sablongeneráló szoftver nevéből"
);
egyenlo(
  felismerPartner("Flott-Trans Kft. 3300 Eger, flott@flott.hu")?.kod,
  "flott-trans",
  "Flott-Trans felismerése"
);
egyenlo(felismerPartner("Duvenbeck Logisztikai Kft.")?.kod, "duvenbeck", "Duvenbeck felismerése");
egyenlo(felismerPartner("Teljesen ismeretlen Bt. fuvarmegbízása"), null, "ismeretlen partner esetén null");

// Több ujjlenyomattal illeszkedő partner nyer: egy futólagos névemlítés nem
// üti ki az irat valódi kibocsátóját.
egyenlo(
  felismerPartner(
    "Flott-Trans Kft. flott@flott.hu — korábban a Trans-Sped Kft. szállította"
  )?.kod,
  "flott-trans",
  "a több ujjlenyomattal illeszkedő partner nyer a futólagos névemlítés ellen"
);

// ---------------------------------------------------------------------------
// 4. Hitelesség-vizsgálat
// ---------------------------------------------------------------------------
const MOST = new Date("2026-09-15T12:00:00Z");
const alap: KivontFuvar = {
  megrendelo: "ÁB Speed Szállítmányozási Kft.",
  felrako: "Sopron",
  felrakasDatum: "2026-09-17",
  lerako: "Budapest",
  lerakasDatum: "2026-09-18",
  aru: "raklap",
  mennyiseg: "24 t",
  rendszamVagySofor: "AOPU-427",
  fuvardij: 125000,
  fuvardijPenznem: "Ft",
  fizetesiHataridoNap: 60,
  postazasiCim: "9662 Tompaládony, Ifjúság u. 20.",
  pozicioszam: "26/3663",
  megjegyzes: null,
};

egyenlo(
  ellenorizKivontFuvart({ ...alap }, true, MOST).verdikt,
  "biztos",
  "a teljes, hihető rekord verdiktje 'biztos'"
);
egyenlo(
  ellenorizKivontFuvart({ ...alap, lerako: null }, true, MOST).verdikt,
  "elutasitva",
  "lerakóhely nélkül nem lesz sor"
);
egyenlo(
  ellenorizKivontFuvart({ ...alap, felrakasDatum: null }, true, MOST).verdikt,
  "elutasitva",
  "felrakási dátum nélkül nem lesz sor"
);

// A saját cégünk SOHA nem lehet megrendelő — a mezőt ki is ürítjük.
const sajatCeg = { ...alap, megrendelo: "Well Worn Pallett Kft" };
const sajatEredmeny = ellenorizKivontFuvart(sajatCeg, false, MOST);
egyenlo(sajatCeg.megrendelo, null, "a saját cégünk megrendelőként kitörlődik a mezőből");
allit(
  sajatEredmeny.kifogasok.some((k) => k.includes("saját cégünket")),
  "a saját cég megrendelőként kifogást ad"
);

// Csali összegek: a kötbér-nagyságrend kifogást ad.
allit(
  ellenorizKivontFuvart({ ...alap, fuvardij: 10000 }, true, MOST).kifogasok.some((k) =>
    k.includes("sávon")
  ),
  "a 10 000 Ft-os (késedelmi díj nagyságrendű) összeg kifogást ad"
);
allit(
  ellenorizKivontFuvart(
    { ...alap, fuvardij: 100, fuvardijPenznem: "EUR" },
    true,
    MOST
  ).kifogasok.some((k) => k.includes("sávon")),
  "a 100 EUR-s (kötbér nagyságrendű) összeg kifogást ad"
);
allit(
  ellenorizKivontFuvart({ ...alap, fuvardij: 500, fuvardijPenznem: "EUR" }, true, MOST).verdikt ===
    "biztos",
  "a valódi 500 EUR-s Duvenbeck-díj NEM ad kifogást"
);

allit(
  ellenorizKivontFuvart({ ...alap, lerakasDatum: "2026-09-16" }, true, MOST).kifogasok.some((k) =>
    k.includes("korábbi")
  ),
  "a felrakás elé eső lerakási dátum kifogást ad"
);
allit(
  ellenorizKivontFuvart({ ...alap, felrakasDatum: "2024-01-01" }, true, MOST).kifogasok.some((k) =>
    k.includes("napja volt")
  ),
  "a több mint egy éve volt felrakási dátum kifogást ad"
);
allit(
  ellenorizKivontFuvart({ ...alap, pozicioszam: null }, true, MOST).kifogasok.some((k) =>
    k.includes("hivatkozási")
  ),
  "a hiányzó pozíciószám kifogást ad"
);
allit(
  ellenorizKivontFuvart({ ...alap }, false, MOST).kifogasok.some((k) =>
    k.includes("nem ismert partner-sablon")
  ),
  "a nyelvi modell által tippelt megrendelő kifogást ad"
);
egyenlo(
  ellenorizKivontFuvart({ ...alap }, false, MOST).verdikt,
  "ellenorizendo",
  "a tippelt megrendelőjű rekord ellenőrizendő, de nem elutasított"
);

// ---------------------------------------------------------------------------
// Kocsi felismerése a megbízás rendszám-szövegéből (vehicles.ts
// findJarmuInSzoveg). A megbízók a vontató és a pótkocsi rendszámát együtt
// írják — az alakok az élesben látott iratokból valók (2026-09-15..18).
// ---------------------------------------------------------------------------
const kocsi = (szoveg: string | null) => findJarmuInSzoveg(szoveg)?.sofor ?? null;
egyenlo(kocsi("NMZ492/XZV926"), "Micó", "Hajdúspedíció: vontató/pótkocsi perjellel");
egyenlo(kocsi("AOPU-427 AOTY-474"), "Gergő", "BB-Logistic: két rendszám szóközzel");
egyenlo(kocsi("AOPU427/AOTY474"), "Gergő", "Ghibli: kötőjel nélkül, perjellel");
egyenlo(kocsi("AOPU427,/AOTY474"), "Gergő", "Ghibli: vesszővel elgépelve");
egyenlo(kocsi("Rendszám: AOPU-427 Pótkocsi: AOTY-474"), "Gergő", "címkékkel együtt kiolvasva");
egyenlo(kocsi("AODU427"), "Gergő", "RBT: egy betű elgépelve (AODU427)");
egyenlo(kocsi("NZM-492"), "Micó", "Duvenbeck írásváltozat (NZM492)");
egyenlo(kocsi("AOPU-427"), "Gergő", "egyetlen rendszám továbbra is megy");
egyenlo(kocsi("Vadon Gergő"), "Gergő", "sofőrnév rendszám nélkül");
egyenlo(kocsi("Micó"), "Micó", "keresztnév rendszám nélkül");
egyenlo(kocsi("Sofőr: Takács Miklós"), "Micó", "hivatalos teljes név címkével");
egyenlo(kocsi("Gergely Kovács"), null, "hasonló, de más név nem egyezik");
egyenlo(kocsi("AOPU-427 NMZ-492"), null, "két saját kocsi egy szövegben: nem tippelünk");
egyenlo(kocsi("KLM-123"), null, "idegen rendszám: nincs kocsi");
egyenlo(kocsi("HU13500287 UH748629"), null, "hosszabb azonosítók nem rendszámok");
egyenlo(kocsi(null), null, "üres szöveg");
egyenlo(kocsi(""), null, "üres string");

// ---------------------------------------------------------------------------
if (hibak.length > 0) {
  console.error(`\n${hibak.length} HIBA:\n`);
  for (const h of hibak) console.error(`  ✗ ${h}`);
  console.error(`\n${rendben} rendben, ${hibak.length} hiba`);
  process.exit(1);
}
console.log(`${rendben} rendben, 0 hiba`);
