// Postacím egységes alakra — tiszta modul (kliens és szerver is használja).
//
// A partner-címek forrásonként másképp néznek ki („H-8441 …”, „HU-1222 …”,
// „3300 EGER, KISTÁLYAI U.12.”, „Újtelep utca 41 8445 Csehbánya”). Egy
// alakra hozzuk: „8445 Csehbánya, Újtelep utca 41”. Ha a cím nem ismerhető
// fel, csak a felesleges szóközöket és az ország-előtagot vesszük le.

/** Csupa nagybetűs szavak („EGER”, „KISTÁLYAI”) → „Eger”, „Kistályai”; a rövidítések (U., DC8) maradnak. */
function nagybetuSzelid(s: string): string {
  return s.split(" ").map((szo) => {
    const betuk = szo.replace(/[^\p{L}]/gu, "");
    return betuk.length >= 3 && betuk === betuk.toUpperCase() && betuk !== betuk.toLowerCase() ? szo.charAt(0) + szo.slice(1).toLowerCase() : szo;
  }).join(" ");
}

export function cimSzep(nyers: string | null | undefined): string {
  let s = (nyers ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  // Külföldi cím (pl. „DE 85386 ECHING, …”): csak a nagybetűket szelídítjük.
  if (/^(?!HU?\b)[A-Z]{2}[ -]\d{4,5}\b/.test(s)) return nagybetuSzelid(s);
  s = s.replace(/^(?:HU?|Magyarország)[- ,]*(?=\d{4}\b)/i, "");
  // „utca házszám IRSZ Település” → „IRSZ Település, utca házszám”
  const forditott = /^(.+?)[ ,]+(\d{4}) ([\p{L} -]+)$/u.exec(s);
  if (forditott && !/^\d{4}\b/.test(s)) s = `${forditott[2]} ${forditott[3].trim()}, ${forditott[1].replace(/,$/, "")}`;
  // „IRSZ Település utca …” vessző nélkül → vesszővel
  const irsz = /^(\d{4}) ([\p{L}-]+) (?!,)(.+)$/u.exec(s);
  if (irsz && !s.includes(",")) s = `${irsz[1]} ${irsz[2]}, ${irsz[3]}`;
  return nagybetuSzelid(s);
}
