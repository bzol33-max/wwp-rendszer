// Menetterv — HU-GO „megszakító” egy számolási körre (tiszta: nincs
// adatbázis, nincs hálózat; a HU-GO hívást a hívó adja). Teszt:
// scripts/teszt-menetterv.ts.
//
// Miért: az óránkénti kör cold cache-sel több száz HU-GO hívást indíthat, és
// egy-egy időtúllépés 30 s (nem próbálja újra). Ha a HU-GO nem válaszol, a
// kör minden szakaszra kivárná — órákig fogva a modell-szinkron zárat. Ezért:
//   • az ELSŐ időtúllépés / hálózati hiba / 5xx után a kör hátralévő részében
//     NEM hívjuk a HU-GO-t, hanem légvonal × 1,3 becslést adunk ('becsles');
//   • a „nincs útvonal” jellegű hiba (TollCalcError — egy rossz címpár) nem
//     állítja le a kört, csak azt az egy szakaszt becsüli;
//   • opcionálisan hívásszám-korlát és teljes határidő (a kattintásra induló
//     hozzárendelés-javaslathoz): utána is becslés.

export type HugoKor = {
  /** Leállt-e a HU-GO ebben a körben (az első időtúllépés / hálózati hiba után). */
  leallt: boolean;
  /** Miért állt le (naplózáshoz). */
  ok: string | null;
  /** Hány HU-GO hívást indítottunk. */
  hivasok: number;
  /** Legfeljebb ennyi hívás (null: nincs korlát). */
  maxHivas: number | null;
  /** Eddig (ms, Date.now) — utána becslés (null: nincs határidő). */
  hatarido: number | null;
};

export function ujHugoKor(o: { maxHivas?: number | null; idokeretMs?: number | null; most?: number } = {}): HugoKor {
  const most = o.most ?? Date.now();
  return { leallt: false, ok: null, hivasok: 0, maxHivas: o.maxHivas ?? null, hatarido: o.idokeretMs != null ? most + o.idokeretMs : null };
}

/**
 * A hiba a szolgáltatás elérhetetlenségét jelzi-e (időtúllépés, hálózat,
 * 429/5xx) — szemben egy adott címpárra szóló „nincs útvonal” / 4xx hibával
 * (a hívó `cimparHiba`-ja ismeri fel, szerveren: TollCalcError), ami után a
 * többi szakasz még kérdezhető. Ismeretlen hiba: leállító.
 */
export function leallitoHiba(err: unknown, cimparHiba?: (err: unknown) => boolean): boolean {
  return !(cimparHiba?.(err) ?? false);
}

/**
 * Egy szakasz: HU-GO, ha a kör még él; különben (vagy hibánál) a becslés.
 * Az első leállító hiba után a kör `leallt` lesz — a további hívások már
 * nem mennek ki. A határidő a futó hívást is elvágja (a háttérben befejeződik,
 * de a kör nem vár rá).
 */
export async function hugoVagyBecsles<T>(
  kor: HugoKor,
  hugo: () => Promise<T>,
  becsles: () => T,
  o: { cimparHiba?: (err: unknown) => boolean; most?: () => number } = {}
): Promise<{ ertek: T; hugo: boolean }> {
  const most = o.most ?? Date.now;
  if (kor.leallt) return { ertek: becsles(), hugo: false };
  if (kor.maxHivas != null && kor.hivasok >= kor.maxHivas) {
    kor.leallt = true;
    kor.ok = `hívás-korlát (${kor.maxHivas})`;
    return { ertek: becsles(), hugo: false };
  }
  const maradt = kor.hatarido != null ? kor.hatarido - most() : null;
  if (maradt != null && maradt <= 0) {
    kor.leallt = true;
    kor.ok = "időkeret";
    return { ertek: becsles(), hugo: false };
  }
  kor.hivasok++;
  try {
    const hivas = hugo();
    const ertek = maradt == null
      ? await hivas
      : await new Promise<T>((ok, nem) => {
          const t = setTimeout(() => nem(new Error("időkeret")), maradt);
          hivas.then((x) => { clearTimeout(t); ok(x); }, (e) => { clearTimeout(t); nem(e); });
        });
    return { ertek, hugo: true };
  } catch (err) {
    if (leallitoHiba(err, o.cimparHiba)) {
      kor.leallt = true;
      kor.ok = err instanceof Error ? err.message : String(err);
    }
    return { ertek: becsles(), hugo: false };
  }
}
