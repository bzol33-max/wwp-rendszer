import "server-only";
import { query } from "@/lib/db";
import { mnbValaszArfolyamok } from "@/lib/fuvarozas2/kocsi-sinek-alap";

// MNB napi árfolyam (2026-11-18, Budaházi Zoltán): az EUR-os fuvardíj a számla
// keltének napján érvényes MNB-árfolyamon számít Ft-ra. A lekért napok az
// `arfolyam` táblába kerülnek (053), így egy nap csak egyszer megy ki kérés.
// Hétvégén / ünnepnapon az utolsó jegyzett nap árfolyama él (MNB-gyakorlat).

const MNB_URL = "https://www.mnb.hu/arfolyamok.asmx";
const SOAP_ACTION = "http://www.mnb.hu/webservices/GetExchangeRates";

async function mnbLeker(tol: string, ig: string, penznem: string): Promise<Map<string, number>> {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetExchangeRates xmlns="http://www.mnb.hu/webservices/">
      <startDate>${tol}</startDate><endDate>${ig}</endDate><currencyNames>${penznem}</currencyNames>
    </GetExchangeRates>
  </soap:Body>
</soap:Envelope>`;
  const res = await fetch(MNB_URL, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: SOAP_ACTION },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`MNB ${res.status}`);
  return mnbValaszArfolyamok(await res.text(), penznem);
}

function napElt(nap: string, d: number): string {
  const t = new Date(nap + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + d);
  return t.toISOString().slice(0, 10);
}

/**
 * Árfolyam több napra egyszerre: a hiányzó napokat egy MNB-kéréssel pótolja
 * (a legkorábbi kért nap – 10 nap … legkésőbbi), és a jegyzés nélküli napokra
 * (hétvége) az azt megelőző utolsó jegyzett napot adja. Hiba esetén a cache-ből
 * ad, ami van; a hiányzó nap `null` marad.
 */
export async function arfolyamNapokra(napok: string[], penznem = "EUR"): Promise<Map<string, number | null>> {
  const ki = new Map<string, number | null>();
  const kert = [...new Set(napok.filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n)))].sort();
  if (!kert.length) return ki;
  const tol = napElt(kert[0], -10);
  const ig = kert[kert.length - 1];
  const cache = await query<{ nap: string; ertek: string }>(
    `select to_char(nap, 'YYYY-MM-DD') as nap, ertek::text from arfolyam where penznem = $1 and nap between $2::date and $3::date order by nap`,
    [penznem, tol, ig]
  );
  const jegyzett = new Map(cache.map((c) => [c.nap, Number(c.ertek)]));
  // Ha a kért napok közül valamelyikhez nincs legfeljebb 4 napon belüli jegyzés, lekérünk.
  const hianyzik = kert.some((n) => ![0, 1, 2, 3, 4].some((d) => jegyzett.has(napElt(n, -d))));
  if (hianyzik) {
    try {
      const friss = await mnbLeker(tol, ig, penznem);
      for (const [nap, ertek] of friss) {
        if (jegyzett.has(nap)) continue;
        jegyzett.set(nap, ertek);
        await query(`insert into arfolyam (nap, penznem, ertek) values ($1::date, $2, $3) on conflict do nothing`, [nap, penznem, ertek]);
      }
    } catch (e) {
      console.warn("[arfolyam] MNB lekérés nem sikerült:", e instanceof Error ? e.message : e);
    }
  }
  const rendezett = [...jegyzett.keys()].sort();
  for (const n of kert) {
    let talalt: number | null = null;
    for (let i = rendezett.length - 1; i >= 0; i--) {
      if (rendezett[i] <= n) { talalt = jegyzett.get(rendezett[i]) ?? null; break; }
    }
    ki.set(n, talalt);
  }
  return ki;
}
