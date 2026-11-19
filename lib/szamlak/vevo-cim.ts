// A vevő címe a Számlázz.hu számla / szállítólevél XML-jéből (2026-11-19,
// Budaházi Zoltán: „minden szállítón rajta a cím”). Tiszta függvény, teszt:
// scripts/teszt-vevo-cim.ts. Forma: „1024 Budapest, Rómer Flóris utca 8.”

function entitasok(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

export function vevoCimXmlbol(xml: string | null | undefined): string | null {
  if (!xml) return null;
  const vevo = /<vevo>([\s\S]*?)<\/vevo>/.exec(xml)?.[1] ?? (xml.includes("<vevo>") ? xml.slice(xml.indexOf("<vevo>")) : null);
  if (!vevo) return null;
  // A külső <cim> blokk: orszag, irsz, telepules és egy belső <cim> (utca, házszám).
  const blokk = /<cim>\s*((?:<(?!\/?cim>)[\s\S]*?)*<cim>[\s\S]*?<\/cim>)/.exec(vevo)?.[1] ?? /<cim>([\s\S]*?)<\/cim>/.exec(vevo)?.[1];
  if (!blokk) return null;
  const mezo = (n: string) => entitasok((new RegExp(`<${n}>([\\s\\S]*?)</${n}>`).exec(blokk)?.[1] ?? "").trim());
  const irsz = mezo("irsz"), telepules = mezo("telepules"), utca = mezo("cim");
  const eleje = [irsz, telepules].filter(Boolean).join(" ");
  const ki = [eleje, utca].filter(Boolean).join(", ");
  return ki || null;
}

/** Teljes címnek számít-e (van benne szám: irányítószám vagy házszám) — a csak-város címmel szemben. */
export function teljesCim(c: string | null | undefined): boolean {
  return !!c && /\d/.test(c);
}
