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

// ── Kiolvasási hibák (Budaházi Zoltán, 2026-11-17: „hány megbízás
// beolvasásban volt hiba egy hónap alatt”) ──────────────────────────────────
//
// Kiolvasási hiba = egy importált bérfuvar olyan mezőjét, amit az irat
// kiolvasása tölt ki, utólag ember javította (modositBerFuvart naplója:
// reszletek.mezok). A kocsi, sofőr, költség és megjegyzés tervezési adat,
// nem olvasási hiba. A dátumot a hívó csak az indulás (első érkezés/kész)
// előtti javításnál adja át — utána az már csúszás, nem rossz olvasás.

const KIOLVASOTT_MEZO: Record<string, string> = {
  megrendelo: "Megrendelő",
  felrako: "Felrakó",
  lerako: "Lerakó",
  pozicioszam: "Pozíciószám",
  pozicioszamNincs: "Pozíciószám",
  fuvardij: "Fuvardíj",
  fuvardijPenznem: "Fuvardíj",
  datum: "Dátum / időpont",
  lerakasDatum: "Dátum / időpont",
  idopont: "Dátum / időpont",
  aru: "Áru / mennyiség",
  mennyiseg: "Áru / mennyiség",
  suly: "Áru / mennyiség",
  postazasiCim: "Postázási cím",
};

export type KiolvasasSor = { id: string; partner: string; torolt: boolean; mezok: string[] };

export type KiolvasasHibak = {
  importalt: number;
  hibas: number;
  torolt: number;
  mezonkent: { cimke: string; db: number }[];
  partnerenkent: { partner: string; importalt: number; hibas: number; cimkek: string[] }[];
};

export function kiolvasasHibaOsszesit(sorok: KiolvasasSor[]): KiolvasasHibak {
  const elo = sorok.filter((s) => !s.torolt);
  const mezoDb = new Map<string, number>();
  const partnerek = new Map<string, { importalt: number; hibas: number; cimkek: Set<string> }>();
  let hibas = 0;
  for (const s of elo) {
    const cimkek = new Set(s.mezok.map((m) => KIOLVASOTT_MEZO[m]).filter((c): c is string => !!c));
    const p = partnerek.get(s.partner) ?? { importalt: 0, hibas: 0, cimkek: new Set<string>() };
    p.importalt++;
    if (cimkek.size > 0) {
      hibas++;
      p.hibas++;
      for (const c of cimkek) {
        mezoDb.set(c, (mezoDb.get(c) ?? 0) + 1);
        p.cimkek.add(c);
      }
    }
    partnerek.set(s.partner, p);
  }
  return {
    importalt: elo.length,
    hibas,
    torolt: sorok.length - elo.length,
    mezonkent: [...mezoDb].map(([cimke, db]) => ({ cimke, db })).sort((a, b) => b.db - a.db || a.cimke.localeCompare(b.cimke, "hu")),
    partnerenkent: [...partnerek]
      .filter(([, p]) => p.hibas > 0)
      .map(([partner, p]) => ({ partner, importalt: p.importalt, hibas: p.hibas, cimkek: [...p.cimkek] }))
      .sort((a, b) => b.hibas - a.hibas || b.importalt - a.importalt || a.partner.localeCompare(b.partner, "hu")),
  };
}
