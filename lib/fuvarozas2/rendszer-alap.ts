// A Rendszer lap tiszta szabályai (docs/fuvarozas-1-hullam-terv.md A/4).
// Nem "use server" — a scripts/teszt-1hullam-rendszer.ts tsx alól tölti be.

export type GpsEgeszsegBemenet = {
  /** A teljesítés-figyelő utolsó életjele (rendszer_eletjel) hány perce volt; null, ha még soha. */
  eletjelKorPerc: number | null;
  /** Aktív megálló: nyitott fuvar, van kocsija, tervezett_nap <= ma, még nincs gps_erkezes. */
  aktivMegalloDb: number;
  /** Az utolsó GPS-írás (érkezés/távozás) hány órája volt; null, ha még soha. */
  utolsoIrasOra: number | null;
};

export type GpsEgeszseg = { szint: "rendben" | "figyelj" | "gond"; szoveg: string };

/**
 * Az életjel a döntő: ha a figyelő nem fut, az gond, akármi más is látszik.
 * Ha fut, és nincs mit érinteni (nincs aktív megálló), a régi írás nem baj —
 * eddig ilyenkor (hétvégén, üres napokon) is „figyelmeztetés” volt.
 */
export function gpsEgeszseg(x: GpsEgeszsegBemenet): GpsEgeszseg {
  if (x.eletjelKorPerc === null || x.eletjelKorPerc > 15) {
    return {
      szint: "gond",
      szoveg: x.eletjelKorPerc === null
        ? "a figyelő nem fut (még nem volt életjel)"
        : `a figyelő nem fut (utolsó életjel ${Math.round(x.eletjelKorPerc)} perce)`,
    };
  }
  if (x.aktivMegalloDb === 0) return { szint: "rendben", szoveg: "a figyelő fut, nincs aktív megálló" };
  if (x.utolsoIrasOra !== null && x.utolsoIrasOra > 12) {
    return {
      szint: "figyelj",
      szoveg: `${x.aktivMegalloDb} aktív megálló, de ${Math.round(x.utolsoIrasOra)} órája nem volt GPS-érintés`,
    };
  }
  return { szint: "rendben", szoveg: `a figyelő fut, ${x.aktivMegalloDb} aktív megálló` };
}
