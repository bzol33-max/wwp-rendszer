// A szétválogatás szabálya — EGY helyen, a szerver és a kliens is innen olvas
// (audit BIZ-8: eddig három helyen volt leírva, és a szerver nem ellenőrizte a
// Vegyes EUR céljait). Tiszta konstans modul, nincs "use server".
//
// A "Vegyes EUR" a klasszikus EUR-vegyes — abból csak világos/szürke/törött
// lehet. A "Vegyes" a mindenes halom (Szakoly/Balkány): olyan szállítmány,
// amiben EUR-on kívül színes, egyutas is van — bármelyik, a telepen aktív
// típusra bontható.

export const SZETVALOGATAS_FORRASOK = ["Vegyes EUR", "Vegyes"];
export const VEGYES_EUR_CELOK = ["EUR világos", "EUR szürke", "EUR törött"];

/** Ebből a forrásból szétválogatható-e erre a típusra (az aktív-típus feltétel külön). */
export function szetvalogathatoCelra(forras: string, cel: string): boolean {
  if (SZETVALOGATAS_FORRASOK.includes(cel)) return false;
  return forras === "Vegyes EUR" ? VEGYES_EUR_CELOK.includes(cel) : true;
}
