// Lezárhatja-e a sofőr fuvarlevél-fotója a fuvar utolsó lerakóját (2026-10-10).
//
// Tiszta modul (nincs DB) — a lib/fuvarozas/sofor.ts feltoltFuvarlevelFoto
// használja, a scripts/teszt-fuvarlevel-lezaras.ts teszteli.
//
// MIÉRT: a fotó a lerakás kész jele (Micó #300, 2026-10-07), és saját
// fuvarnál a 019 óta a fotó teljesítve → lezárt is lépteti. Ha a sofőr egy
// bérfuvar CMR-jét a kocsi KÖVETKEZŐ saját fuvarjának kártyáján fotózta le,
// a saját fuvar lerakója készre jelölődött, a fuvar teljesült és a fotótól
// azonnal lezárult. Mostantól a fotó csak akkor zár, ha
//   1. a fuvar minden más megállója kész (sofőr "Indulok" vagy GPS-távozás), és
//   2. a kocsinak nincs másik, még nyitott fuvarja be nem fejezett lerakóval,
//      ami ELŐTTE jár: korábbi napi (ellenőrzésre vár/tervezett/folyamatban),
//      vagy ugyanaznapi, már elindult (folyamatban) és az első ténye
//      (érkezés/kész) KORÁBBI, mint ennek a fuvarnak az első ténye.
// Különben a fotó elmentődik, de nem zár, és a sofőr figyelmeztetést kap.

/** A fuvar egy megálló-sora (fuvar_megallok), sorszám szerint. */
export type LezarasMegallo = { sorszam: number; tipus: string; kesz: boolean };

/** A kocsi egy másik, nyitott fuvarja. `nap` = felrakás napja (YYYY-MM-DD). */
export type MasikFuvar = {
  id: string;
  nap: string;
  allapot: string;
  nyitottLerako: boolean;
  /** A fuvar megállóinak legkorábbi ténye (GPS-érkezés, sofőr érkezés/kész), ISO; null, ha még nincs. */
  elsoTeny?: string | null;
};

export type FotoLezarasDontes = {
  /** A lezárandó megálló indexe (sorszam − 1), vagy null, ha a fotó nem zár. */
  megalloIndex: number | null;
  /** A sofőrnek szóló figyelmeztetés, ha a fotó azért NEM zárt, mert valami nem stimmel. */
  figyelmeztetes: string | null;
};

const NYITOTT = new Set(["ellenorzesre_var", "tervezett", "folyamatban"]);

/** Az a másik fuvar, amelyik a kocsin ELŐTTE jár, és a lerakója még nincs kész. */
export function elozoNyitottFuvar(ennekNapja: string, masikFuvarok: MasikFuvar[], ennekElsoTenye: string | null = null): MasikFuvar | null {
  // Ugyanaznapi elindult fuvar csak akkor jár ELŐTTE, ha korábban indult:
  // a bérfuvar lerakásakor a következő saját fuvar felrakója is tényt kap
  // (folyamatban lesz), de az a bérfuvar CMR-fotóját nem tarthatja vissza.
  const elotteIndult = (m: MasikFuvar) =>
    !ennekElsoTenye || (!!m.elsoTeny && Date.parse(m.elsoTeny) < Date.parse(ennekElsoTenye));
  return (
    masikFuvarok.find(
      (m) =>
        m.nyitottLerako &&
        NYITOTT.has(m.allapot) &&
        (m.nap < ennekNapja || (m.nap === ennekNapja && m.allapot === "folyamatban" && elotteIndult(m)))
    ) ?? null
  );
}

export function fotoLezarasDontes(
  megallok: LezarasMegallo[],
  ennekNapja: string,
  masikFuvarok: MasikFuvar[],
  ennekElsoTenye: string | null = null
): FotoLezarasDontes {
  const sorban = [...megallok].sort((a, b) => a.sorszam - b.sorszam);
  const utolso = sorban.at(-1);
  // Nincs mit lezárni (nincs megálló, már kész, vagy nem lerakó a vége).
  if (!utolso || utolso.kesz || utolso.tipus !== "lerako") return { megalloIndex: null, figyelmeztetes: null };
  if (sorban.slice(0, -1).some((g) => !g.kesz)) {
    return {
      megalloIndex: null,
      figyelmeztetes: "A fotó elmentve, de a fuvar nem zárult le: van még nyitott megálló ezen a fuvaron.",
    };
  }
  const elozo = elozoNyitottFuvar(ennekNapja, masikFuvarok, ennekElsoTenye);
  if (elozo) {
    return {
      megalloIndex: null,
      figyelmeztetes:
        `A fotó elmentve, de a fuvar NEM zárult le: a kocsinak van még be nem fejezett fuvarja (#${elozo.id}). ` +
        "Ha ez annak a papírja, ott töltsd fel; ha ennek a fuvarnak a lerakója tényleg kész, nyomd meg az „Indulok” gombot.",
    };
  }
  return { megalloIndex: utolso.sorszam - 1, figyelmeztetes: null };
}
