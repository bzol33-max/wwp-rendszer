// Megbízások · teljes életút tábla (Budaházi Zoltán, 2026-10-21: az „1-es
// terv” a 10 TMS összevetéséből — Truckpedia-minta). A bérfuvar a
// beérkezéstől a fizetésig a táblán marad (Kiküldve → Lejárt → Fizetve), a
// saját fuvar külön sávban, a kész saját fuvar az utolsó 7 napból nem tűnik
// el. Tiszta besorolás; teszt: scripts/teszt-eletut-tabla.ts.

import type { MunkaasztalSor } from "@/lib/fuvarozas2/megbizasok";
import type { PenzSzuro } from "@/lib/fuvarozas2/penz-lista-alap";
import { beerkElokeszitesOszlopba } from "@/lib/megbizasok/elvinni-szabalyok";

/** Egy lezárt (archív) bérfuvar számlájának állapota a `szamla` táblából. */
export type Fizetes = { all: "kikuldve" | "lejart" | "fizetve"; fizetveNap: string | null; lejartNap: number };

export type EletutOszlop = {
  kulcs: string;
  cim: string;
  /** A kártyák (legfeljebb OSZLOP_MAX). */
  sorok: MunkaasztalSor[];
  /** Az oszlopba eső összes fuvar száma (a levágás előtt). */
  osszes: number;
  /** Ha több van, mint ami látszik: melyik pénz-szűrő mutatja mindet. */
  penzSzuro?: PenzSzuro;
  ures: string;
};

/** Egy oszlopban legfeljebb ennyi kártya; a többi a pénz-szűrővel (lista a tábla alatt). */
export const OSZLOP_MAX = 8;

const HONAP = ["január", "február", "március", "április", "május", "június", "július", "augusztus", "szeptember", "október", "november", "december"];

function napKul(a: string, b: string) {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

function oszlop(kulcs: string, cim: string, mind: MunkaasztalSor[], ures: string, penzSzuro?: PenzSzuro): EletutOszlop {
  return { kulcs, cim, sorok: mind.slice(0, OSZLOP_MAX), osszes: mind.length, penzSzuro, ures };
}

/**
 * A tábla két sávja. `sorok` = a nyitott (nem archív) megbízások, `archiv` =
 * a lezártak (postázott / lezárt bér, teljesített / lezárt saját), mindkettő
 * a legújabb elöl; `fizetes` = az archív bérfuvarok számla-állapota.
 */
export function eletutOszlopok(be: {
  sorok: MunkaasztalSor[];
  archiv: MunkaasztalSor[];
  fizetes: Record<string, Fizetes>;
  ma: string;
}): { ber: EletutOszlop[]; sajat: EletutOszlop[] } {
  const { sorok, archiv, fizetes, ma } = be;
  const ber = sorok.filter((s) => s.jelleg === "ber");
  const sajat = sorok.filter((s) => s.jelleg === "sajat");
  const berArchiv = archiv.filter((s) => s.jelleg === "ber" && s.szakasz === "archiv");
  const sajatArchiv = archiv.filter((s) => s.jelleg === "sajat" && s.szakasz === "archiv");
  const fiz = (s: MunkaasztalSor) => fizetes[s.id];
  const honap = ma.slice(0, 7);
  const nap = (s: MunkaasztalSor) => s.lerakas_nap ?? s.felrakas_nap ?? ma;

  const lejart = berArchiv
    .filter((s) => fiz(s)?.all === "lejart")
    .sort((x, y) => (fiz(y)?.lejartNap ?? 0) - (fiz(x)?.lejartNap ?? 0));

  return {
    ber: [
      oszlop("beerkezett", "Beérkezett", ber.filter((s) => beerkElokeszitesOszlopba(s)), "Nincs új megbízás"),
      oszlop("folyamatban", "Úton", ber.filter((s) => s.szakasz === "folyamatban"), "Nincs úton lévő bérfuvar"),
      oszlop("szamlazasra", "Lerakva · számlázásra", ber.filter((s) => s.szakasz === "szamlazasra"), "Nincs számlázandó"),
      oszlop("postara", "Számlázva · postára", ber.filter((s) => s.szakasz === "postara"), "Nincs postázandó"),
      oszlop("kikuldve", "Kiküldve · fizetésre vár", berArchiv.filter((s) => fiz(s)?.all === "kikuldve"), "Nincs kint lévő számla", "kikuldve"),
      oszlop("lejart", "Lejárt", lejart, "Nincs lejárt számla", "lejart"),
      oszlop(
        "fizetve",
        `Fizetve · ${HONAP[Number(honap.slice(5, 7)) - 1]}`,
        berArchiv.filter((s) => fiz(s)?.all === "fizetve" && fiz(s)?.fizetveNap?.slice(0, 7) === honap),
        "Ebben a hónapban még nem fizettek",
        "fizetve"
      ),
    ],
    sajat: [
      oszlop("s-elokeszites", "Előkészítés", sajat.filter((s) => beerkElokeszitesOszlopba(s)), "Nincs előkészítés alatt"),
      oszlop("s-folyamatban", "Tervezett / úton", sajat.filter((s) => s.szakasz === "folyamatban"), "Nincs tervezett saját fuvar"),
      // Lerakva, de a sofőr még nem fotózta a szállítólevelet (a fotó zárja le, 019);
      // 60 napnál régebbit nem kérünk számon (a pénz-nézet papír-szabálya).
      oszlop(
        "s-fotora",
        "Lerakva · fotóra vár",
        sajatArchiv.filter((s) => s.allapot === "teljesitve" && napKul(nap(s), ma) <= 60),
        "Minden szállítólevél megvan"
      ),
      oszlop(
        "s-kesz",
        "Kész · utolsó 7 nap",
        sajatArchiv.filter((s) => s.allapot === "lezart" && napKul(nap(s), ma) <= 7),
        "Az elmúlt héten nem zárult saját fuvar"
      ),
    ],
  };
}
