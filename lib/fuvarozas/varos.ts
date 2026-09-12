/** Ismert telephely-kódok, amikhez a szövegben nincs irányítószám (pl. "Budapest (BILK)"). */
const ISMERT_IRSZ_KULCSSZO: Record<string, string> = {
  BILK: "1239",
};

/** Utcatípus-szavak — ezek jelenléte kizárja, hogy egy cím-darab városnév legyen. */
const UTCA_SZAVAK = /\b(utca|út|tér|krt\.?|körút|sor|dűlő|park|ipartelep|telep|fasor|köz|rakpart)\b/i;
const CEGFORMA_SZAVAK = /\b(kft\.?|zrt\.?|bt\.?|nyrt\.?|kkt\.?)\b/i;

/**
 * Több-megállós felrakó/lerakó mezőket elválasztó jelek — szóközzel
 * körülvéve (vagy pontosvessző/sortörés), hogy házszám-tartományokat (pl.
 * "12-14") ne szakítsunk szét. A Drive-automatika " + "-szal fűzi össze a
 * teljes címeket egy több-megállós megbízásnál, a kézi javítások (lásd
 * db/fuvar-corrections.json) " – " (nagykötőjel) jellel, már csak
 * városnevekkel.
 */
const MEGALLO_ELVALASZTO = /\s*\+\s*|\s+[–—]\s+|;\s*|\n+/;

/** Egy felrakó/lerakó mező felbontása egyedi állomásokra, a teljes (geokódolható) szöveggel állomásonként. Egymegállós mezőnél az egyetlen elemű tömböt adja vissza. */
export function bontsMegallokra(cim: string | null | undefined): string[] {
  if (!cim) return [];
  return cim
    .split(MEGALLO_ELVALASZTO)
    .map((s) => s.trim())
    .filter(Boolean);
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
export function talalVaros(parts: string[]): { zip: string; city: string; idx: number } | null {
  // A lookbehind kizárja azt az esetet, amikor az irányítószám egy MÁSIK
  // minta (lásd lentebb) zárójelezett részében van — ott a városnév a
  // zárójel ELŐTT van, nem az irányítószám UTÁN.
  for (let i = 0; i < parts.length; i++) {
    const m = parts[i].match(/(?<!\()(\d{4})\s+([^(]+)/);
    if (m) return { zip: m[1], city: m[2].trim(), idx: i };
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
    if (!/\d/.test(p) && !UTCA_SZAVAK.test(p) && !CEGFORMA_SZAVAK.test(p)) {
      return { zip: "", city: p, idx: parts.indexOf(p) };
    }
  }

  return null;
}

/** Egyetlen állomás (nem több-megállós!) szövegéből a városnév kinyerése, vesszős tagolással. */
function varosNevEgyMegallobol(value: string): string {
  const parts = value
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  return talalVaros(parts)?.city || value;
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
