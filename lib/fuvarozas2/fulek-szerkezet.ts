// A Fuvarozás 2 fülsorának szerkezete — tiszta modul (nincs szerver-import),
// hogy a navigációs teszt (scripts/teszt-2kor-navigacio.ts) DB és session
// nélkül ellenőrizhesse. A megjelenítés és a jogosultság-szűrés:
// components/fuvarozas2/fulek.tsx.
//
// Az „elszamolas" hatókör (Szabina) a Megbízásokat (Lista, Levelek,
// Partnerek) és a Költségeket látja — GPS-részletet, tervezést, kimutatást és
// rendszer-egészséget nem (S16). Ezt a `csakFuvarozas` jelölés adja.
//
// 2026-10-11: 11 fül helyett fő fülek + fogaskerék (⚙ Rendszer). A régi oldalak
// VÁLTOZATLAN címen, a főfül alatti alfülként érhetők el — így minden régi
// link és a Timocom „→ WWP” gomb (/fuvarozas2/timocom#d=…) tovább működik,
// és a jogosultság alfülenként ugyanaz, mint eddig.
//
// 2026-10-17 (2. kör, kocsi-központú B változat): három főfül —
// Kocsik · Megbízások · Pénz. Csak a címkék és a csoportosítás változott,
// a hrefek és a `csakFuvarozas` jelölések nem.

export type Alful = { href: string; label: string; csakFuvarozas?: boolean };
export type Fofül = { kulcs: string; label: string; alfulek: Alful[] };

export const FOFULEK: Fofül[] = [
  // 2026-10-12 (a tulajdonos: „régi és új lapok közt kell keresgetni”): minden
  // funkció pontosan EGY helyen. A régi címek átirányítással élnek tovább
  // (next.config.ts redirects).
  {
    kulcs: "kocsik",
    label: "Kocsik",
    alfulek: [
      // A Ma: kocsi-sávok + a megállók nézete. A /fuvarozas2/kocsi/[kod] lap is
      // ehhez a főfülhöz tartozik (aktiv="/fuvarozas2").
      { href: "/fuvarozas2", label: "Ma" },
      { href: "/fuvarozas2/tervezes", label: "Hét", csakFuvarozas: true },
      // Ajánlat: Timocom → WWP (a böngésző „→ WWP” gombja ide küld) + kézi kalkulátor.
      // A cím szándékosan /timocom marad.
      { href: "/fuvarozas2/timocom", label: "Ajánlat", csakFuvarozas: true },
    ],
  },
  {
    kulcs: "megbizasok",
    label: "Megbízások",
    alfulek: [
      { href: "/fuvarozas2/megbizasok", label: "Lista" },
      { href: "/fuvarozas2/levelek", label: "Levelek" },
      { href: "/fuvarozas2/partnerek", label: "Partnerek" },
    ],
  },
  {
    kulcs: "penz",
    label: "Pénz",
    alfulek: [
      // Áttekintés (2026-10-11): három kérdés, vízesés, havi fedezet, megbízók;
      // 2026-10-17-től felül a bérfuvar-csempék és a kihasználtság.
      { href: "/fuvarozas2/eredmeny", label: "Áttekintés", csakFuvarozas: true },
      { href: "/fuvarozas2/kimutatas", label: "Kimutatás", csakFuvarozas: true },
      // Költségek (5. fázis): az Elszámolás hatóköre is látja (HU-GO import, tankolások).
      { href: "/fuvarozas2/koltsegek", label: "Költségek" },
    ],
  },
];

/** A fülsor számára: melyik főfülhöz tartozik egy aktív útvonal. A kocsi lapja
 * (/fuvarozas2/kocsi/…) a Kocsik alá tartozik akkor is, ha a hívó a saját
 * útvonalát adja át. */
export function aktivFofulKulcs(fulek: Fofül[], aktiv: string): string | null {
  const talalat = fulek.find((f) => f.alfulek.some((a) => a.href === aktiv));
  if (talalat) return talalat.kulcs;
  if (aktiv.startsWith("/fuvarozas2/kocsi/") || aktiv === "/fuvarozas2/kocsi") {
    return fulek.some((f) => f.kulcs === "kocsik") ? "kocsik" : null;
  }
  return null;
}
