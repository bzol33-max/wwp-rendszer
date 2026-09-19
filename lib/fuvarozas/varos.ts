/** Ismert telephely-kódok, amikhez a szövegben nincs irányítószám (pl. "Budapest (BILK)"). */
const ISMERT_IRSZ_KULCSSZO: Record<string, string> = {
  BILK: "1239",
};

/**
 * Utcatípus-szavak — ezek jelenléte kizárja, hogy egy cím-darab városnév
 * legyen. A rövidített alakok (u., krt., stny.) is kellenek: nélkülük egy
 * "Budapest Hoffher Albert u.42." típusú cím nem ismerhető fel utcaként,
 * ezért a városnév-kinyerés feladja, és a teljes nyers cím jelenik meg a
 * listákon város helyett.
 */
// Szóhatárként nem \b-t használunk: a JavaScript \b csak ASCII betűt ismer,
// így az ékezettel kezdődő "út" / "útja" elé sosem tett szóhatárt, és a
// "3390 Füzesabony Kerecsendi út 123" alakból az utca nem vált le a
// városról. A \p{L} lookaround minden betűre működik.
const UTCA_SZAVAK =
  /((?<!\p{L})(utca|út|útja|tér|tere|körút|sor|sétány|dűlő|park|ipartelep|telep|lakótelep|fasor|köz|rakpart|major|puszta|hrsz)(?!\p{L})|(?<!\p{L})(u|krt|stny|sgt|ltp)\.)/iu;
const CEGFORMA_SZAVAK = /\b(kft\.?|zrt\.?|bt\.?|nyrt\.?|kkt\.?|gmbh|s\.r\.o\.?|a\.s\.?|sp\.\s?z\s?o\.o\.?)\b/i;

/**
 * Kétbetűs országkód (HU, DE, SK, AT…) — soha nem városnév. Enélkül egy
 * "Duvenbeck Kft. – HU – 2360 Gyál" alakú mezőből a "HU" darab városnévként
 * jelent meg a fuvarlistákon.
 */
const ORSZAGKOD = /^[A-Z]{2}$/;

/**
 * Egyértelmű állomás-elválasztók: a Drive-automatika " + "-szal fűzi össze a
 * teljes címeket egy több-megállós megbízásnál. Szóközzel körülvéve, hogy
 * házszám-tartományokat (pl. "12-14") ne szakítsunk szét.
 */
const ELSODLEGES_ELVALASZTO = /\s*\+\s*|;\s*|\n+/;

/**
 * A gondolatjel CSAK feltételes elválasztó. A kézi javítások (lásd
 * db/fuvar-corrections.json) így sorolnak fel csupasz városneveket
 * ("Polgár – Debrecen"), viszont gondolatjel valódi címekben is előfordul
 * (cégnév után, országkód körül). Feltétel nélkül elválasztónak véve egyetlen
 * cím több hamis megállóvá esett szét — egy cégnévvé, egy országkóddá és a
 * valódi címmé —, és mindhárom külön sorként jelent meg a GPS idővonalon.
 */
const GONDOLATJEL = /\s+[–—]\s+/;

/**
 * Igaz, ha a szöveg csupasz városnév (nincs benne vessző, szám, utcatípus-szó,
 * cégforma, és nem országkód) — csak ilyeneket választunk szét gondolatjel
 * mentén.
 */
function csupaszVarosnev(s: string): boolean {
  const t = s.trim();
  if (t.length < 3 || t.length > 40) return false;
  if (t.includes(",")) return false;
  if (/\d/.test(t)) return false;
  if (ORSZAGKOD.test(t)) return false;
  return !UTCA_SZAVAK.test(t) && !CEGFORMA_SZAVAK.test(t);
}

/** Egy felrakó/lerakó mező felbontása egyedi állomásokra, a teljes (geokódolható) szöveggel állomásonként. Egymegállós mezőnél az egyetlen elemű tömböt adja vissza. */
export function bontsMegallokra(cim: string | null | undefined): string[] {
  if (!cim) return [];
  return cim
    .split(ELSODLEGES_ELVALASZTO)
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((resz) => {
      const darabok = resz.split(GONDOLATJEL).map((s) => s.trim()).filter(Boolean);
      // Gondolatjel mentén csak akkor bontunk, ha MINDEN darab csupasz
      // városnév — egyébként a gondolatjel a címen belüli írásjel, nem elválasztó.
      return darabok.length > 1 && darabok.every(csupaszVarosnev) ? darabok : [resz];
    });
}

/**
 * Egy felrakó/lerakó cím vesszővel tagolt részei közül megkeresi a
 * városnevet (és ha van, az irányítószámot) — akkor is, ha nincs
 * irányítószám a szövegben (pl. "Cégnév, Város, utca házszám" formátum,
 * ahol a "Város" rész önmagában áll, számok és utcatípus-szavak nélkül).
 * Sorrend: 1) irányítószám + városnév egy darabban (pl. "4400 Nyíregyháza"),
 * 2) városnév + zárójelezett irányítószám/utca egy darabban (pl.
 * "Nyíregyháza (4400 Móricz Zsigmond u. 24.)"), 3) ismert telephely-kód
 * (pl. "Budapest (BILK)"), 4) heurisztika — az első olyan darab, ami nem
 * szám, nem utcatípus-szó és nem cégforma-toldalék (3+ darabnál az elsőt,
 * jellemzően a cégnevet, kihagyva).
 */
/**
 * Az irányítószám utáni szövegből csak a városnév, ha vessző nélkül az utca
 * is ott folytatódik ("3390 Füzesabony Kerecsendi út 123" → "Füzesabony").
 * Magyar településnév szóközt nem tartalmaz, ezért ha a maradékban
 * utcatípus-szó van, az első szó a város, a többi az utca. Utcatípus-szó
 * nélkül a szöveg változatlan (pl. "TÉGLÁS", "Debrecen").
 */
function varosUtcaNelkul(szoveg: string): string {
  if (!UTCA_SZAVAK.test(szoveg)) return szoveg;
  const [elso] = szoveg.split(/\s+/);
  return elso && elso.length >= 3 ? elso : szoveg;
}

export function talalVaros(parts: string[]): { zip: string; city: string; idx: number } | null {
  // A lookbehind kizárja azt az esetet, amikor az irányítószám egy MÁSIK
  // minta (lásd lentebb) zárójelezett részében van — ott a városnév a
  // zárójel ELŐTT van, nem az irányítószám UTÁN.
  // Az irányítószám után állhat egy záró szögletes zárójel is: az RBT
  // megbízásain a formátum "CÉGNÉV [H-4243] TÉGLÁS, Hrsz. …" — enélkül a
  // "4243]" nem illeszkedett, a városnév helyett a teljes nyers cím jelent
  // meg, és a GPS-felismerés (pontosság "ismeretlen") kihagyta a megállót.
  for (let i = 0; i < parts.length; i++) {
    const m = parts[i].match(/(?<!\()(\d{4})\]?\s+([^(]+)/);
    if (m) return { zip: m[1], city: varosUtcaNelkul(m[2].trim()), idx: i };
  }

  for (let i = 0; i < parts.length; i++) {
    const m = parts[i].match(/^([^(]+?)\s*\((\d{4})\b/);
    if (m) return { zip: m[2], city: m[1].trim(), idx: i };
  }

  for (let i = 0; i < parts.length; i++) {
    const kulcsszo = Object.keys(ISMERT_IRSZ_KULCSSZO).find((k) => parts[i].includes(k));
    if (kulcsszo) {
      return { zip: ISMERT_IRSZ_KULCSSZO[kulcsszo], city: parts[i].replace(/\(.*\)/, "").trim(), idx: i };
    }
  }

  const jeloltek = parts.length >= 3 ? parts.slice(1) : parts;
  for (const p of jeloltek) {
    // Az országkód (HU, DE) és a túl rövid töredék soha nem városnév — ezek
    // korábban átcsúsztak a szűrőn, és "Le: HU" alakban jelentek meg.
    if (p.trim().length < 3 || ORSZAGKOD.test(p.trim())) continue;
    if (!/\d/.test(p) && !UTCA_SZAVAK.test(p) && !CEGFORMA_SZAVAK.test(p)) {
      return { zip: "", city: p, idx: parts.indexOf(p) };
    }
  }

  // Vessző nélkül egybeírt "Város Utcanév házszám" alak (pl. "Budapest
  // Hoffher Albert u.42."). A városnév az utcatípus-szó ELŐTTI első szó — de
  // csak akkor, ha legalább két szó áll előtte. Ez különbözteti meg a valódi
  // várost egy puszta utcanévtől: a "Campona utca . 1"-ben egyetlen szó áll
  // az "utca" előtt, az az utca neve, nem város, és ilyenkor helyesebb
  // felismerhetetlennek mondani, mint kitalálni egy nem létező várost.
  for (let i = 0; i < parts.length; i++) {
    const utca = parts[i].match(UTCA_SZAVAK);
    if (!utca || utca.index === undefined) continue;
    const elotte = parts[i].slice(0, utca.index).trim().split(/\s+/).filter(Boolean);
    if (elotte.length >= 2 && !/\d/.test(elotte[0])) {
      return { zip: "", city: elotte[0], idx: i };
    }
  }

  return null;
}

/**
 * Mennyire pontosan azonosítható egy megálló címe:
 *
 * - `pontos` — van irányítószám vagy utcanév a városnév mellett, tehát a
 *   geokódolás konkrét helyet ad.
 * - `csak_varos` — csak a város neve ismert. A geokódolás ilyenkor a város
 *   KÖZEPÉRE mutat, ami egy nagyvárosban több kilométerre lehet a tényleges
 *   rakodóhelytől.
 * - `ismeretlen` — a szövegből még várost sem sikerült kiolvasni.
 *
 * Ez nem kozmetika: a GPS-alapú "ott járt" felismerés egy sugáron belüli
 * találatot keres, és egy városközépre mutató koordináta körül bármelyik
 * városi megállás találatnak látszik. A pontosság ismeretében a rendszer meg
 * tudja különböztetni a biztos felismerést a valószínűsítettől, ahelyett hogy
 * mindkettőt késznek állítaná.
 */
export type CimPontossag = "pontos" | "csak_varos" | "ismeretlen";

export function cimPontossaga(value: string | null | undefined): CimPontossag {
  if (!value?.trim()) return "ismeretlen";
  const talalat = talalVaros(cimDarabok(value));
  if (!talalat) return "ismeretlen";
  if (talalat.zip) return "pontos";
  return UTCA_SZAVAK.test(value) ? "pontos" : "csak_varos";
}

/**
 * Vezető országkód-előtag levágása ("HU – Budapest, …" → "Budapest, …",
 * "HU-2360 Gyál" → "2360 Gyál"). Enélkül az egész szöveg városnévként
 * jelent meg, mert a szűrők egyike sem fogta meg.
 */
function vagdLeOrszagkodot(s: string): string {
  return s.replace(/^\s*[A-Za-z]{2}\s*[–—-]\s*/, "").trim();
}

/** Egy állomás szövegének vesszővel tagolt darabjai, országkód-előtag nélkül. */
function cimDarabok(value: string): string[] {
  return vagdLeOrszagkodot(value)
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Egyetlen állomás (nem több-megállós!) szövegéből a városnév kinyerése, vesszős tagolással. */
function varosNevEgyMegallobol(value: string): string {
  return talalVaros(cimDarabok(value))?.city || value;
}

/**
 * Egy felrakó/lerakó cím szövegéből csak a városnév (irányítószám, utca és
 * partner nélkül) — minden fuvarlistán ez jelenik meg. Több-megállós
 * mezőknél (lásd bontsMegallokra) mindegyik állomás városát kinyeri, és
 * " + "-szal összefűzve adja vissza (szomszédos duplikátumokat kiszűrve —
 * pl. ha a felrakó és az első lerakó ugyanabban a városban van).
 */
export function varosNev(value: string | null | undefined): string {
  if (!value) return "";
  const megallok = bontsMegallokra(value);
  if (megallok.length <= 1) return varosNevEgyMegallobol(value);

  const varosok = megallok.map(varosNevEgyMegallobol);
  // Kis-nagybetűtől és a szóközöktől független összehasonlítás — a
  // talalVaros a városnevet a nyers, szabad szöveges címből vágja ki,
  // írásmód-kanonizálás nélkül, így ugyanaz a város két szomszédos
  // állomásnál eltérő írásmóddal is szerepelhet (pl. "Budapest" és
  // "BUDAPEST"), amit a sima "!==" nem ismerne fel duplikátumnak.
  return varosok
    .filter((v, i) => i === 0 || v.trim().toLowerCase() !== varosok[i - 1].trim().toLowerCase())
    .join(" + ");
}

/**
 * Egy cím normalizált kulcsa a helyszín-szótárhoz (fuvar_helyszin_koordinata):
 * kisbetűs, ékezet nélkül, minden nem betű/szám egy szóközre vonva. Így az
 * "RBT EUROPE Kft. [H-4243] TÉGLÁS, Hrsz. 0123" és ugyanez más
 * szóközözéssel vagy kis/nagybetűvel ugyanarra a kulcsra esik, két különböző
 * cím viszont nem.
 */
export function cimKulcs(cim: string): string {
  return cim
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
