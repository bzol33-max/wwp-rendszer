// Rövid élettartamú, folyamat-szintű gyorsítótár a GPS lap idővonalához.
//
// Miért: a getIdovonalak minden hívása külső hívások sorozata (Ecofleet
// trip-előzmény és élő pozíció, HU-GO geokódolás, útvonalszámítás minden
// hátralévő pontra, járművenként). Az oldal 5 percenként újratölt, és
// MINDEN megnyitott böngésző külön indítja — a terhelés a nézők számával
// szorzódott. Egy perces gyorsítótárral a nézők ugyanazt az eredményt
// kapják, a külső hívások száma a nézőktől független.
//
// A kézi jelölések (megálló kész, fuvar Teljesítve) törlik a tárat, hogy a
// gombnyomás után azonnal a friss állapot látsszon.
//
// NEM "use server" fájl — tiszta segédfüggvények.

type Bejegyzes = { lejar: number; ertek: Promise<unknown> };

const tar = new Map<string, Bejegyzes>();

/** A `kulcs`-hoz tartozó, még érvényes eredmény; ha nincs, az `fn` futtatása és az eredmény tárolása `ervenyesMs` ideig. Sikertelen (elutasított) eredményt nem tárol. */
export function cachelve<T>(kulcs: string, ervenyesMs: number, fn: () => Promise<T>): Promise<T> {
  const most = Date.now();
  const meglevo = tar.get(kulcs);
  if (meglevo && meglevo.lejar > most) return meglevo.ertek as Promise<T>;
  const ertek = fn();
  tar.set(kulcs, { lejar: most + ervenyesMs, ertek });
  ertek.catch(() => {
    if (tar.get(kulcs)?.ertek === ertek) tar.delete(kulcs);
  });
  return ertek;
}

/** Minden tárolt idővonal eldobása — kézi állapotváltozás (megálló kész, fuvar Teljesítve) után. */
export function toroljIdovonalCachet(): void {
  tar.clear();
}
