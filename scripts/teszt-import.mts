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
import { kivonSpediTransMezoket } from "@/lib/fuvarozas/import/speditrans";
import { kivonGhibliMezoket } from "@/lib/fuvarozas/import/ghibli";
import type { SzovegElem } from "@/lib/fuvarozas/import/pdf-elemek";

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
  "HAPP felismerése a láblécben álló cégnévből"
);
egyenlo(
  felismerPartner("Transorg Software / 2026.09.24. 15:03:32 / Ver:2.6003 / 7 / Huncargo Forwarding Kft. / Lenthár-Kugler Edina")?.kod,
  "huncargo",
  "Huncargo felismerése — ugyanaz a Transorg-sablon, mint a HAPP-é (0000065055)"
);
egyenlo(felismerPartner("Transorg Software / Ver:2.6003"), null, "a szoftvernév egymagában nem partner");
egyenlo(
  felismerPartner("Szállítási megbízás Megbízó: EUCARGO 2008 KFT. H-1103 Budapest,Gergely u.42. oliver.horvath@eucargo2008.eu Megbízott: WELL-WORN PALETT KFT.")?.kod,
  "eucargo",
  "EUCARGO felismerése (2026.09.25.02)"
);
egyenlo(
  felismerPartner("Felrakóhely: Huncargo - Dunaharaszti raktár. Megbízó adatai: ÁB Speed Szállítmányozási Kft. transport@abspeed.hu")?.kod,
  "ab-speed",
  "a Huncargo mint felrakóhely nem teszi Huncargo-irattá"
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
// SpediTrans (BB-Logistic) — determinisztikus mezők a pdf-parse tényleges
// tördeléséből. A kéthasábos felrakó/lerakó tábla a nyelvi modellnek
// kétértelmű volt; itt a blokkok sorrendje dönt: előbb a felrakó.
// ---------------------------------------------------------------------------
const kocsi = (szoveg: string | null) => findJarmuInSzoveg(szoveg)?.sofor ?? null;
const spediNyers = minta("speditrans-megbizas.txt");
egyenlo(felismerPartner(normalizaltSzoveg(spediNyers))?.kod, "bb-logistic", "BB-Logistic felismerése a cégnévből");
// A szoftver neve NEM ujjlenyomat: a SpediTranst az Alpok-Trans is használja.
egyenlo(felismerPartner("Cégnév ... SpediTrans for Windows v2.11.741"), null, "a szoftver nevéből önmagában nincs partner");
egyenlo(
  felismerPartner("Megbízó Vállalkozó Alpok-Trans Kft HU-9730, Kőszeg … SpediTrans for Windows v2.11.777")?.kod,
  "alpok-trans",
  "Alpok-Trans felismerése ugyanabból a SpediTrans-sablonból"
);
egyenlo(
  felismerPartner("Megbízó: BB-Logistic Solution kft … Vállalkozó: Alpok-Trans Kft"),
  null,
  "döntetlen (két partner ugyanannyi ujjlenyomattal) esetén nem tippelünk"
);

// ---------------------------------------------------------------------------
// A többi visszatérő megbízó — a Drive-mappa 2026-09-18-i átvizsgálása
// szerint minden kibocsátónak van sablonja. A minták az iratok egysoros,
// cégre jellemző darabjai (fejléc, e-mail-domain).
// ---------------------------------------------------------------------------
egyenlo(
  felismerPartner("Ghibli Szállítmányozási Kft. H-1211 Budapest, Petróleum u. 2. E-mail: info@ghibli.hu")?.kod,
  "ghibli",
  "Ghibli felismerése a fejlécből"
);
egyenlo(felismerPartner("NK_FUVMEGREND")?.kod, "ghibli", "Ghibli felismerése a nyomtatvány kódjából");
egyenlo(
  felismerPartner("HAJDÚSPEDÍCIÓ Fuvarozó és Szolgáltató Kft. 3360 Heves, Táncsics M. út 4. sz.")?.kod,
  "hajduspedicio",
  "Hajdúspedíció felismerése"
);
allit(partnerKodSzerint("hajduspedicio")?.nincsHivatkozas === true, "a Hajdúspedíció megbízásán tudottan nincs pozíciószám");
egyenlo(felismerPartner("E-mail: iroda@hrtsped.hu Pénzügy: penzugy@hrtsped.hu")?.kod, "hrt-spedition", "HRT Spedition felismerése a domainből");
egyenlo(felismerPartner("SG Transport Kft HU-4033 Debrecen, Skalnitzky A. u. 7")?.kod, "sg-transport", "SG Transport felismerése");
egyenlo(felismerPartner("FUVAROZÁSI MEGBÍZÁS PRO LINE SPEED KFT H-4030 DEBRECEN")?.kod, "pro-line-speed", "Pro Line Speed felismerése");
egyenlo(felismerPartner("K + K Spedit Kft. 4400 Nyíregyháza Búza tér 10.")?.kod, "kk-spedit", "K+K Spedit felismerése");
egyenlo(felismerPartner("MEGBÍZÁS WELL PACK HUNGARIA KFT PN:2667/30")?.kod, "well-pack", "Well Pack felismerése");
egyenlo(
  ellenorizKivontFuvart({ ...alap, megrendelo: "Well Pack Hungária Kft." }, true, MOST).kifogasok.some((k) => k.includes("saját")),
  false,
  "a Well Pack NEM a saját cégünk (Well-Worn Pallet) — nem törlődik ki"
);
egyenlo(felismerPartner("VOXOV Logistics Kft. Szerződéses feltételek")?.kod, "voxov", "VOXOV felismerése");

// Ghibli: a lerakási dátumTARTOMÁNY vége a lerakás napja; a modell ezt
// egynaposnak vette (#134, 2026-09-17). A minta a Drive szövegének tördelése
// tabulátorral/sortöréssel is — a címke és az érték közti fehér karakter
// szabad.
const ghibliSzoveg =
  "Pozíciószámunk\tN26/22795\n\nFelrakás dátuma: 2026.09.17 Lerakás dátuma: 2026.09.17 - 2026.09.18 Rendszám: AOPU427/AOTY474\n\nÁru:\n\nFuvardíj:\n\nKözösségi szállítmányozás átvételi díjtétel 400.00 EUR +ÁFA A számlán";
const ghibli = kivonGhibliMezoket(ghibliSzoveg);
egyenlo(ghibli.felrakasDatum, "2026-09-17", "Ghibli: felrakás dátuma");
egyenlo(ghibli.lerakasDatum, "2026-09-18", "Ghibli: a lerakási tartomány VÉGE a lerakás napja");
egyenlo(ghibli.pozicioszam, "N26/22795", "Ghibli: pozíciószám");
egyenlo(ghibli.fuvardij, 400, "Ghibli: fuvardíj 400.00 EUR → 400");
egyenlo(ghibli.fuvardijPenznem, "EUR", "Ghibli: pénznem EUR");
egyenlo(kocsi(ghibli.rendszamVagySofor ?? null), "Gergő", "Ghibli: a rendszámokból Gergő kocsija");
const ghibliEgynapos = kivonGhibliMezoket(
  "Felrakás dátuma: 2026.09.18\nLerakás dátuma: 2026.09.18\nRendszám: AOPU427,/AOTY474\n"
);
egyenlo(ghibliEgynapos.lerakasDatum, null, "Ghibli: azonos napi lerakásnál a lerakási dátum null");
egyenlo(ghibliEgynapos.rendszamVagySofor, "AOPU427,/AOTY474", "Ghibli: vesszős rendszám-elgépelés szó szerint");
egyenlo(Object.keys(kivonGhibliMezoket("Felrakás helye: Budapest")).length, 0, "Ghibli: idegen szövegből nincs mező");

// A megrendelőnek olvasott cég a rakodóhely cége (Ghibli-eset: Apollo Tyres).
allit(
  ellenorizKivontFuvart(
    {
      ...alap,
      megrendelo: "Apollo Tyres (Hungary) Kft",
      felrako: "Magyarország, 3212 Gyöngyöshalász, Apollo Road 106 (Apollo Tyres (Hungary) Kft.)",
    },
    false,
    MOST
  ).kifogasok.some((k) => k.includes("felrakó-/lerakóhely cége")),
  "a felrakóhely cége megrendelőként kifogást ad"
);
allit(
  !ellenorizKivontFuvart({ ...alap }, false, MOST).kifogasok.some((k) => k.includes("felrakó-/lerakóhely cége")),
  "egy valódi megrendelő nem kap rakodóhely-kifogást"
);
// Hivatkozás nélküli partner: a hiányzó pozíciószám nem kifogás.
egyenlo(
  ellenorizKivontFuvart({ ...alap, pozicioszam: null }, true, MOST, true).verdikt,
  "biztos",
  "hivatkozás nélküli partnernél a hiányzó pozíciószám nem kifogás"
);
// A pdfjs szövegelemei koordinátával: a BAL hasáb ("Felrakás helye:" alatt)
// a felrakó — a pdf-parse szövegében a jobb hasáb blokkja áll előbb, ezért
// a szövegsorrend fordítva adná (élesben így is történt).
const spediElemek = JSON.parse(minta("speditrans-megbizas.json")).map((e: Omit<SzovegElem, "oldal">) => ({ oldal: 1, ...e })) as SzovegElem[];
const spedi = kivonSpediTransMezoket(spediNyers, spediElemek);
egyenlo(
  partnerKodSzerint("alpok-trans")?.kivon?.(spediNyers, spediElemek).fuvardij,
  spedi.fuvardij,
  "az Alpok-Trans is a SpediTrans-olvasót kapja"
);
egyenlo(spedi.felrako, "Példa Raklap Kft., 4254 Nyíradony, Kossuth utca 17.", "SpediTrans: a BAL hasáb (Felrakás helye alatt) a felrakó");
egyenlo(spedi.lerako, "Minta Csomagolás Kft., 3390 Füzesabony, Fő utca 1", "SpediTrans: a JOBB hasáb (Lerakás helye alatt) a lerakó");
const csakSzoveg = kivonSpediTransMezoket(spediNyers, null);
egyenlo(csakSzoveg.felrako, undefined, "SpediTrans: koordináta nélkül a felrakót nem tippeljük");
egyenlo(csakSzoveg.lerako, undefined, "SpediTrans: koordináta nélkül a lerakót nem tippeljük");
egyenlo(csakSzoveg.fuvardij, 123000, "SpediTrans: koordináta nélkül a fuvardíj a szövegből megvan");
egyenlo(spedi.felrakasDatum, "2026-09-21", "SpediTrans: felrakás határideje");
egyenlo(spedi.lerakasDatum, null, "SpediTrans: azonos napi lerakás -> null");
egyenlo(spedi.pozicioszam, "001234/26", "SpediTrans: pozíciószám a szögletes zárójelből");
egyenlo(spedi.fuvardij, 123000, "SpediTrans: fuvardíj a címke ELŐTTI értékből");
egyenlo(spedi.fuvardijPenznem, "Ft", "SpediTrans: HUF -> Ft");
egyenlo(spedi.rendszamVagySofor, "AOPU-427 AOTY-474", "SpediTrans: vontató + pótkocsi rendszám");
egyenlo(kocsi(spedi.rendszamVagySofor ?? null), "Gergő", "SpediTrans: a két rendszámból a kocsi");
// Nem SpediTrans-szerkezet: semmit nem tippel.
const idegen = kivonSpediTransMezoket("Felrakás helye: Budapest\nLerakás helye: Győr\nFuvardíj: 100 000 Ft", null);
egyenlo(idegen.felrako, undefined, "idegen szerkezetből nincs felrakó");
egyenlo(idegen.fuvardij, undefined, "idegen szerkezetből nincs fuvardíj");
// Több napos: a két határidő eltérő napra esik.
const tobbNapos = kivonSpediTransMezoket(spediNyers.replace("2026.09.21. 14:00", "2026.09.22. 08:00"), null);
egyenlo(tobbNapos.lerakasDatum, "2026-09-22", "SpediTrans: eltérő napi lerakás dátuma");

// ---------------------------------------------------------------------------
// Kocsi felismerése a megbízás rendszám-szövegéből (vehicles.ts
// findJarmuInSzoveg). A megbízók a vontató és a pótkocsi rendszámát együtt
// írják — az alakok az élesben látott iratokból valók (2026-09-15..18).
// ---------------------------------------------------------------------------
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
