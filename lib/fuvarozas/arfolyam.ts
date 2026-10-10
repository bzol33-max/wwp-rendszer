import "server-only";
import { query } from "@/lib/db";
import { arfolyamNapra, mnbKeresTorzs, parseMnbArfolyamok } from "@/lib/fuvarozas/arfolyam-alap";

// Az MNB hivatalos napi EUR/HUF árfolyama az `arfolyam` táblában (001-es
// migráció) gyorsítótárazva. A Kimutatás az EUR-os bérfuvar-díjat a
// TELJESÍTÉS NAPJÁNAK árfolyamán váltja át (hétvégén/ünnepen a megelőző
// munkanapé), és mindig kiírja, melyik árfolyammal számolt.
//
// SOHA NEM DOB: ha az MNB nem érhető el, a legutóbbi tárolt árfolyammal
// megy tovább; ha az sincs, `null` (a felület ilyenkor az EUR-t külön
// mutatja, átváltás nélkül).
//
// MIÉRT http:// ELŐSZÖR: az MNB SOAP-szolgáltatása a WSDL szerint a
// http://www.mnb.hu/arfolyamok.asmx címen válaszol; a https-re küldött
// POST a mérés napján (2026-10-10) 404-et adott. A https tartalék marad,
// ha egyszer megfordul. A válasz nyilvános árfolyam, titok nem megy ki.

const MNB_URLEK = ["http://www.mnb.hu/arfolyamok.asmx", "https://www.mnb.hu/arfolyamok.asmx"];
const SOAP_ACTION = "http://www.mnb.hu/webservices/MNBArfolyamServiceSoap/GetExchangeRates";
/** Egy tartományra legfeljebb ennyi időnként kérdezzük újra az MNB-t (pl. a mai, még nem közzétett nap miatt). */
const UJRAKERES_MS = 60 * 60 * 1000;
const utolsoProba = new Map<string, number>();

export type ArfolyamInfo = {
  /** Ft / 1 EUR */
  ft: number;
  /** Melyik nap árfolyama (a teljesítés napja vagy a megelőző közzétett nap). */
  nap: string;
  /** false, ha nem a teljesítés napjáig közzétett árfolyam, hanem tartalék (a legkorábbi későbbi, vagy a legutóbbi tárolt). */
  pontos: boolean;
  forras: string;
};

async function mnbLekeres(kezdet: string, veg: string): Promise<{ nap: string; penznem: string; ft: number }[]> {
  let utolsoHiba: unknown = null;
  for (const url of MNB_URLEK) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"${SOAP_ACTION}"` },
        body: mnbKeresTorzs(kezdet, veg, ["EUR"]),
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) { utolsoHiba = new Error(`MNB HTTP ${res.status}`); continue; }
      return parseMnbArfolyamok(await res.text());
    } catch (err) {
      utolsoHiba = err;
    }
  }
  throw utolsoHiba instanceof Error ? utolsoHiba : new Error("MNB nem érhető el");
}

function napEltol(nap: string, delta: number): string {
  const d = new Date(`${nap}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * EUR árfolyamok a megadott teljesítési napokra. Az MNB-t csak akkor hívja,
 * ha a tárolt sorok nem fedik a tartományt (óránként legfeljebb egyszer
 * tartományonként), az eredményt az `arfolyam` táblába írja.
 */
export async function getEurArfolyamok(napok: string[]): Promise<Map<string, ArfolyamInfo>> {
  const ki = new Map<string, ArfolyamInfo>();
  const egyedi = [...new Set(napok.filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n)))].sort();
  if (egyedi.length === 0) return ki;
  try {
    // Hétvége/ünnep miatt 7 nappal korábbról is kell a legutóbbi közzétett nap.
    const kezdet = napEltol(egyedi[0], -7);
    const veg = egyedi[egyedi.length - 1];
    let sorok = await query<{ nap: string; ft: number }>(
      `select to_char(nap, 'YYYY-MM-DD') as nap, ft::float8 as ft from arfolyam
       where penznem = 'EUR' and nap between $1::date and $2::date order by nap`,
      [kezdet, veg]
    );
    const ma = new Date().toISOString().slice(0, 10);
    const hianyos = egyedi.some((n) => {
      // Egy napra akkor van meg, ha van aznapi vagy legfeljebb 4 nappal korábbi tárolt sor (hosszú hétvége).
      const tol = napEltol(n, -4);
      return !sorok.some((s) => s.nap >= tol && s.nap <= n) && n <= ma;
    });
    const kulcs = `${kezdet}|${veg}`;
    if (hianyos && Date.now() - (utolsoProba.get(kulcs) ?? 0) > UJRAKERES_MS) {
      utolsoProba.set(kulcs, Date.now());
      try {
        const friss = (await mnbLekeres(kezdet, veg)).filter((r) => r.penznem === "EUR");
        for (const r of friss) {
          await query(
            `insert into arfolyam (nap, penznem, ft, forras) values ($1::date, 'EUR', $2, 'mnb')
             on conflict (nap, penznem) do update set ft = excluded.ft, forras = excluded.forras`,
            [r.nap, r.ft]
          );
        }
        if (friss.length > 0) {
          sorok = await query<{ nap: string; ft: number }>(
            `select to_char(nap, 'YYYY-MM-DD') as nap, ft::float8 as ft from arfolyam
             where penznem = 'EUR' and nap between $1::date and $2::date order by nap`,
            [kezdet, veg]
          );
        }
      } catch (err) {
        console.warn("[arfolyam] MNB lekérés nem sikerült, tárolt árfolyammal megyünk:", err instanceof Error ? err.message : err);
      }
    }
    // Tartalék: a legutóbbi tárolt árfolyam (bármely napról).
    let tartalek: { nap: string; ft: number } | null = null;
    if (sorok.length === 0) {
      [tartalek] = await query<{ nap: string; ft: number }>(
        `select to_char(nap, 'YYYY-MM-DD') as nap, ft::float8 as ft from arfolyam
         where penznem = 'EUR' order by abs(nap - $1::date), nap desc limit 1`,
        [veg]
      );
    }
    for (const n of egyedi) {
      const v = arfolyamNapra(sorok, n);
      if (v) ki.set(n, { ft: v.ft, nap: v.nap, pontos: v.pontos, forras: "MNB" });
      else if (tartalek) ki.set(n, { ft: Number(tartalek.ft), nap: tartalek.nap, pontos: false, forras: "MNB (legutóbbi tárolt)" });
    }
  } catch (err) {
    console.warn("[arfolyam] árfolyam nem olvasható:", err instanceof Error ? err.message : err);
  }
  return ki;
}
