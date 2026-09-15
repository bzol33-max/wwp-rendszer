// A kinyert dokumentumszöveg helyreállítása, MIELŐTT bárki (determinisztikus
// olvasó vagy nyelvi modell) értelmezné.
//
// Miért kell ez? A fuvarmegbízásokat generáló programok a PDF-ben nem
// "vastag" betűtípust használnak, hanem UGYANAZT A SZÖVEGET NYOMTATJÁK KI
// NÉGYSZER, egy pixelnyi eltolással. A pdf-parse ezt hűségesen visszaadja,
// tabulátorral elválasztva:
//
//   90 000,00→90 000,00→90 000,00→90 000,00 HUF→HUF→HUF→HUF (+ 27 % ÁFA)→Fuvardíj (nettó):→…
//
// Egy nyelvi modell ebből nem tudja kiszedni a fuvardíjat — és az utolsó
// ismétlés az, amelyik a FOLYTATÁST is viszi ("90 000,00 HUF"), tehát nem
// elég az elsőt megtartani.
//
// A második feladat a KISBETŰS RÉSZ levágása. A megbízások 1 oldal adatot és
// 3-8 oldal szerződéses szöveget tartalmaznak, tele CSALI PÉNZÖSSZEGEKKEL
// (kötbér 100 EUR, 400 EUR, állásdíj 210 EUR/nap, 10.000 Ft/óra...). A
// fuvardíjat eddig rendszeresen ezek közül választotta ki a modell. A
// partner-sablonhoz tartozó határoló mondattól (lásd partnerek.ts
// `torzsVege`) kezdve a szöveg eldobható.
//
// NEM "use server" fájl — sima segédmodul, tesztből is hívható.

/**
 * Hány egyforma szakasznak kell egymás után állnia, hogy ÖNMAGÁBAN
 * ismétlésnek tekintsük. A vastagítás-utánzás négyszeres; hármat is
 * összevonunk, de kettőt magában SOHA — az lehet valódi adat.
 */
const ISMETLES_KUSZOB = 3;

/**
 * A "hordozó" az a szomszédos szakasz, amiben az ismételt érték a CÍMKÉJÉVEL
 * vagy a FOLYTATÁSÁVAL együtt szerepel:
 *
 *   "Helye: HAJDU ZRT"  ←  "HAJDU ZRT" × 3        (a címke az ELSŐHÖZ tapadt)
 *   "90 000,00" × 3     →  "90 000,00 HUF"        (a folytatás az UTOLSÓN van)
 *
 * Ha van hordozó, az ismétlés bizonyítottan tipográfia, nem adat — ilyenkor
 * már kettőt is összevonunk, és MINDIG a hordozó marad meg.
 *
 * FIGYELEM: szakaszokat csak SZIGORÚ EGYENLŐSÉG alapján vonunk egy futamba.
 * A láncolt ("előző vége = következő eleje") összevonás átfut a mezőhatáron,
 * és megette a fuvardíjat: a
 *   90 000,00 → 90 000,00 → 90 000,00 HUF → HUF → HUF (+ 27 % ÁFA)
 * sorból "HUF (+ 27 % ÁFA)" maradt, az összeg nélkül.
 */
function hordozoE(szomszed: string | null, ertek: string, elotte: boolean): boolean {
  if (!szomszed) return false;
  return elotte ? szomszed.endsWith(" " + ertek) : szomszed.startsWith(ertek + " ");
}

/** Egy sor tabulátoros szakaszaiban összevonja a tipográfiai ismétléseket. */
function osszevonSorIsmetleseket(sor: string): string {
  if (!sor.includes("\t")) return sor;
  const szakaszok = sor.split("\t");
  const eredmeny: string[] = [];
  let i = 0;
  while (i < szakaszok.length) {
    const ertek = szakaszok[i];
    let vege = i;
    while (vege + 1 < szakaszok.length && szakaszok[vege + 1] === ertek) vege++;
    const darab = vege - i + 1;

    if (darab >= 2 && ertek !== "") {
      const elozo = eredmeny.length > 0 ? eredmeny[eredmeny.length - 1] : null;
      const kovetkezo = vege + 1 < szakaszok.length ? szakaszok[vege + 1] : null;
      // A hordozót vagy már kiírtuk (elötte), vagy a következő körben írjuk ki.
      if (hordozoE(elozo, ertek, true) || hordozoE(kovetkezo, ertek, false)) {
        i = vege + 1;
        continue;
      }
      if (darab >= ISMETLES_KUSZOB) {
        eredmeny.push(ertek);
        i = vege + 1;
        continue;
      }
    }
    if (darab >= 2 && ertek === "") {
      eredmeny.push("");
      i = vege + 1;
      continue;
    }
    for (let j = i; j <= vege; j++) eredmeny.push(szakaszok[j]);
    i = vege + 1;
  }
  return eredmeny.join("\t");
}

/**
 * A PDF-ből kinyert nyers szöveg olvasható alakra hozása: sorvégek
 * egységesítése, a vastagítás-utánzó ismétlések összevonása, a szakaszok
 * széli szóközeinek levágása, üres sorok tömörítése.
 *
 * A tabulátorokat MEGTARTJA: azok hordozzák a hasábhatárt, és a
 * determinisztikus olvasók erre támaszkodnak.
 */
export function normalizaltSzoveg(nyers: string): string {
  return nyers
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((sor) => osszevonSorIsmetleseket(sor))
    .map((sor) =>
      sor
        .split("\t")
        .map((szakasz) => szakasz.replace(/[  ]+/g, " ").trim())
        .join("\t")
        .replace(/\t+$/, "")
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Az a legrövidebb szöveg, ami alá már nem vágunk. A határoló mondat néha
 * korán szerepel (pl. fejlécben); e küszöb alatt inkább az egész szöveget
 * megtartjuk, mint hogy az adatokat is levágjuk.
 */
const MINIMALIS_TORZS_HOSSZ = 300;

/**
 * Amit a levágás UTÁN is tartalmaznia kell a szövegnek. Ha bármelyik minta
 * megvolt a teljes szövegben, de a levágott törzsből hiányzik, a vágás
 * ADATOT VITT EL — ilyenkor inkább az egész szöveget adjuk vissza.
 *
 * Ez az öv a nadrágtartó mellé: a `torzsVege` határolókat nem minden
 * partnerhez tudtuk még VALÓDI pdf-parse kimeneten ellenőrizni, és egy
 * rosszul elhelyezett határoló némán megehetné a fuvardíjat. Inkább
 * maradjon bent a kisbetűs rész, mint hogy hiányozzon az ár.
 */
const ORZENDO: readonly RegExp[] = [
  // Pénzösszeg-alak: "180 000,-" / "90 000,00" / "125.000,-" / "250 000"
  /\d[\d .\u00a0]{2,}(?:,\d{2})?\s*,?-?\s*(?:Ft|HUF|EUR|€)/i,
  // Dátum: "2026.09.17" / "2026-09-17"
  /\d{4}[.\-]\s?\d{2}[.\-]\s?\d{2}/,
];

/**
 * Levágja a szerződéses kisbetűs részt az első olyan határoló mondatnál,
 * ami a `hatarolok` közül illeszkedik. Az eredeti szöveget adja vissza, ha
 * egyik határoló sem illeszkedik, ha a vágás túl rövid törzset hagyna, vagy
 * ha a vágás elvinne egy ŐRZENDŐ mintát (lásd ott).
 */
export function torzsSzoveg(szoveg: string, hatarolok: readonly RegExp[]): string {
  let vagasPont = szoveg.length;
  for (const hatarolo of hatarolok) {
    const talalat = szoveg.match(hatarolo);
    if (talalat?.index != null && talalat.index < vagasPont) {
      vagasPont = talalat.index;
    }
  }
  if (vagasPont >= szoveg.length) return szoveg;

  const torzs = szoveg.slice(0, vagasPont).trim();
  if (torzs.length < MINIMALIS_TORZS_HOSSZ) return szoveg;
  for (const minta of ORZENDO) {
    if (minta.test(szoveg) && !minta.test(torzs)) return szoveg;
  }
  return torzs;
}
