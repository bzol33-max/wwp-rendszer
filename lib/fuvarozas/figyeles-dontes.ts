// A teljesítés-figyelő döntőfüggvénye (docs/fuvarozas-1-hullam-terv.md A/2):
// melyik fuvart kell még figyelni egy körben. Tiszta függvény — a
// scripts/teszt-1hullam-rendszer.ts tsx alól tölti be.
//
// Eddig a lezárt (teljesitve) fuvar azonnal kiesett, így ha a sofőr az utolsó
// lerakón „Indulok”-ot nyomott (vagy kézzel zárták), mielőtt a kocsi
// ténylegesen elment, a megálló gps_tavozas-a soha nem íródott be. Most a
// < 24 órája lezárt, nyitott távozású fuvar még figyelt marad.

/** Ennyi óráig figyeljük még a lezárt fuvar nyitott távozását. */
export const LEZART_FIGYELES_ORA = 24;

export type FigyelesAdat = {
  /** Még nem teljesített és nincs számlázva. */
  nyitott: boolean;
  /** Hány órája zárták le (teljesitve_at), vagy null, ha nincs lezárva / nem ismert. */
  lezarvaOraja: number | null;
  /** Van-e megállója, amin gps_erkezes megvan, de gps_tavozas nincs. */
  vanNyitottTavozas: boolean;
  /** Van-e számlaszáma. */
  szamlazva: boolean;
};

export function figyelendo(f: FigyelesAdat): boolean {
  if (f.nyitott) return true;
  if (f.szamlazva) return false;
  return f.lezarvaOraja !== null && f.lezarvaOraja < LEZART_FIGYELES_ORA && f.vanNyitottTavozas;
}
