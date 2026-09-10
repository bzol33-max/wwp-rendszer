/** Ismert telephely-kódok, amikhez a szövegben nincs irányítószám (pl. "Budapest (BILK)"). */
const ISMERT_IRSZ_KULCSSZO: Record<string, string> = {
  BILK: "1239",
};

/** Utcatípus-szavak — ezek jelenléte kizárja, hogy egy cím-darab városnév legyen. */
const UTCA_SZAVAK = /\b(utca|út|tér|krt\.?|körút|sor|dűlő|park|ipartelep|telep|fasor|köz|rakpart)\b/i;
const CEGFORMA_SZAVAK = /\b(kft\.?|zrt\.?|bt\.?|nyrt\.?|kkt\.?)\b/i;

/**
 * Egy felrakó/lerakó cím vesszővel tagolt részei közül megkeresi a
 * városnevet (és ha van, az irányítószámot) — akkor is, ha nincs
 * irányítószám a szövegben (pl. "Cégnév, Város, utca házszám" formátum,
 * ahol a "Város" rész önmagában áll, számok és utcatípus-szavak nélkül).
 * Sorrend: 1) irányítószám + városnév egy darabban, 2) ismert telephely-kód
 * (pl. "Budapest (BILK)"), 3) heurisztika — az első olyan darab, ami nem
 * szám, nem utcatípus-szó és nem cégforma-toldalék (3+ darabnál az elsőt,
 * jellemzően a cégnevet, kihagyva).
 */
export function talalVaros(parts: string[]): { zip: string; city: string; idx: number } | null {
  for (let i = 0; i < parts.length; i++) {
    const m = parts[i].match(/(\d{4})\s+([^(]+)/);
    if (m) return { zip: m[1], city: m[2].trim(), idx: i };
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

/** Egy felrakó/lerakó cím szövegéből csak a városnév (irányítószám, utca és partner nélkül) — minden fuvarlistán ez jelenik meg. */
export function varosNev(value: string | null | undefined): string {
  if (!value) return "";
  const parts = value
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  return talalVaros(parts)?.city || value;
}
