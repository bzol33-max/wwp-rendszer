// Eredeti papír (CMR / fuvarlevél) nyugtázása — tiszta rész (2026-10-11).
// Teszt: scripts/teszt-papir-jelzes.ts.
//
// A tulajdonos döntése (Budaházi Zoltán, 2026-10-11): a rendszer a papír
// hiánya miatt NEM tilt, csak figyelmeztet — számlázni papír nélkül is lehet.
// A papírt Szabina nyugtázza („Papír megjött ✓”), ez tölti a
// `papirok_beerkeztek_at`-et. A sofőr fotója külön jelzés („fotó van”), a
// postázás („Feladva ✓”) pedig többé nem állítja a papírt.

/** A figyelmeztetés szövege számláskor (segéd, kézi számlaszám, részlet). */
export const PAPIR_HIANY_SZOVEG = "Az eredeti papír még nem érkezett meg";
/** A „Feladva ✓” megerősítésében, ha nincs nyugtázott papír. */
export const PAPIR_NINCS_NYUGTAZVA = "Az eredeti papír még nincs nyugtázva";

/** Hiba szövege, ha a kért papír-jelölés nem értelmes; null, ha mehet. */
export function papirValtasHiba(p: { jelleg: string | null; torolt: boolean; megvan: boolean; megjott: boolean }): string | null {
  if (p.torolt) return "Törölt megbízás.";
  if (p.jelleg !== "ber") return "Papír-nyugtázás csak bérfuvarnál van.";
  if (p.megjott && p.megvan) return "A papír már nyugtázva van.";
  if (!p.megjott && !p.megvan) return "Nincs nyugtázott papír, nincs mit visszavonni.";
  return null;
}

/** A „Feladva ✓” megerősítő szövege (Szabina mobil Posta lapja). */
export function feladvaMegerosites(p: { megbizo: string | null; szamlaSzam: string | null; papirMegvan: boolean }): string {
  const fej = [p.megbizo ?? "(nincs megbízó)", p.szamlaSzam].filter(Boolean).join(" · ");
  return p.papirMegvan
    ? `${fej}\n\nA papírt postára adtad? Ezzel a fuvar kész.`
    : `${fej}\n\n${PAPIR_NINCS_NYUGTAZVA}. Biztosan postára adtad?`;
}

/** Rövid papír-felirat (fotó külön jelzés). */
export function papirFelirat(p: { papirMegvan: boolean; fotoVan: boolean }): string {
  if (p.papirMegvan) return "papír megvan";
  return p.fotoVan ? "papír még nincs · fotó van" : "papír még nincs";
}
