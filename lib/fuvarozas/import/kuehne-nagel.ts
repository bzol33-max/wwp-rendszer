// A Kuehne + Nagel „Szállítási megbízás” (K+N transport order_*.PDF)
// determinisztikusan olvasható mezői.
//
// Miért kell: a nyelvi modell a K+N-iraton a felrakó és a lerakó helyére a
// rakodóhely cégnevét írta, cím nélkül („AWF KFT. UM_15705911”, „SZERIP
// ZRT.” — 36998, 2026-10-01). Városnév nélkül a GPS nem ismerte fel a
// sárvári rakodást (a Ma oldalon „nem tervezett állás” lett belőle), és a
// pénteki debreceni lerakást sem ismerte volna fel. Rövidített utasítással
// újrapróbálva a modell a saját telephelyünket (Szakoly) is felrakónak vette.
//
// A pdf-parse kimenetében minden megálló ugyanígy áll:
//
//   Megállás dátuma/idopontja: 01.10.2026 7:00 - 15:0
//   AWF KFT. UM_15705911 Teljes súly: 7200 kg     <- rakodóhely cége
//   IKERVARI UT 42                                <- utca (egy vagy több sor)
//   HU 9600 SARVAR                                <- ország, irsz, város
//   MegállásTp Áruk  Rendelésszám./ …
//   VP in KG
//   Rakodás 80068309 96 EP …                      <- Rakodás = felrakó, Kirakodás = lerakó
//
// Ami itt megvan, az felülírja a nyelvi modell tippjét (drive-sync-core.ts);
// ami nincs (áru, postázási cím, megállónkénti cég/idő), az marad a modelltől.
//
// Minta: scripts/teszt-minta/kuehne-nagel-megbizas.txt (a pdf-parse
// tényleges tördelése, kitalált nevekkel).
//
// NEM "use server" fájl — sima segédmodul, tesztből is hívható.

import type { KivontFuvar } from "./ellenorzes";

const MEGALLAS = /^Meg[áa]ll[áa]s d[áa]tuma\/id[őo]pontja:\s*(\d{2})\.(\d{2})\.(\d{4})/;
/** "HU 9600 SARVAR" — országkód, irányítószám, város. */
const ORSZAG_IRSZ_VAROS = /^([A-Z]{2})\s+(\d{4,5})\s+(\S.*)$/;
const RAKODAS = /^Rakod[áa]s\b/;
const KIRAKODAS = /^Kirakod[áa]s\b/;
/** "Hiv.Sz.: 36998" */
const HIVATKOZAS = /Hiv\.\s*Sz\.:\s*(\d{3,})/;
/** "Megállapodott fuvardíj: 900,00 EUR" */
const FUVARDIJ = /fuvard[íi]j:\s*([\d][\d\s.]*(?:,\d{2})?)\s*(EUR|HUF|Ft)\b/i;
const VONTATO = /Teherg[ée]pkocsi rendsz[áa]ma:\s*([A-Z]{3,4}-?\d{3})/;
const POTKOCSI = /ut[áa]nfut[óo] rendsz[áa]ma:\s*([A-Z]{3,4}-?\d{3})/;

type Megallo = { tipus: "felrako" | "lerako"; nap: string; cim: string };

/** "IKERVARI UT 42" → "Ikervari Ut 42" — a csupa nagybetűs címet a geokódoló és a városnév-felismerés is jobban olvassa. */
function szepCim(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (_, elo: string, betu: string) => elo + betu.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}

function megallok(sorok: string[]): Megallo[] {
  const eredmeny: Megallo[] = [];
  for (let i = 0; i < sorok.length; i++) {
    const fej = sorok[i].match(MEGALLAS);
    if (!fej) continue;
    // A fej utáni sor a rakodóhely cége, utána az utca sora(i), végül a
    // "HU 9600 SARVAR" sor. Legfeljebb 4 utcasort engedünk.
    let j = i + 2;
    const utca: string[] = [];
    let irszVaros: RegExpMatchArray | null = null;
    for (; j < Math.min(sorok.length, i + 7); j++) {
      irszVaros = sorok[j].match(ORSZAG_IRSZ_VAROS);
      if (irszVaros) break;
      utca.push(sorok[j]);
    }
    if (!irszVaros || utca.length === 0) continue;
    // A megálló típusa a következő megálló-fejig álló Rakodás/Kirakodás sorból.
    let tipus: Megallo["tipus"] | null = null;
    for (let k = j + 1; k < sorok.length && !MEGALLAS.test(sorok[k]); k++) {
      if (KIRAKODAS.test(sorok[k])) { tipus = "lerako"; break; }
      if (RAKODAS.test(sorok[k])) { tipus = "felrako"; break; }
    }
    if (!tipus) continue;
    const orszag = irszVaros[1] === "HU" ? "" : `${irszVaros[1]}-`;
    eredmeny.push({
      tipus,
      nap: `${fej[3]}-${fej[2]}-${fej[1]}`,
      cim: `${orszag}${irszVaros[2]} ${szepCim(irszVaros[3])}, ${szepCim(utca.join(" "))}`,
    });
  }
  return eredmeny;
}

export function kivonKuehneNagelMezoket(nyersSzoveg: string): Partial<KivontFuvar> {
  const sorok = nyersSzoveg.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const eredmeny: Partial<KivontFuvar> = {};

  const lista = megallok(sorok);
  const felrakok = lista.filter((m) => m.tipus === "felrako");
  const lerakok = lista.filter((m) => m.tipus === "lerako");
  // Csak akkor írjuk felül a modellt, ha mindkét oldal megvan — egy félig
  // felismert irat ne adjon felrakót a modell lerakójához.
  if (felrakok.length > 0 && lerakok.length > 0) {
    // A pontosvessző a megállók elválasztója (varos.ts) — címen belül nem maradhat.
    eredmeny.felrako = felrakok.map((m) => m.cim.replace(/;/g, ",")).join("; ");
    eredmeny.lerako = lerakok.map((m) => m.cim.replace(/;/g, ",")).join("; ");
    eredmeny.felrakasDatum = felrakok[0].nap;
    const lerakasNap = lerakok[lerakok.length - 1].nap;
    eredmeny.lerakasDatum = lerakasNap === felrakok[0].nap ? null : lerakasNap;
  }

  const hiv = nyersSzoveg.match(HIVATKOZAS);
  if (hiv) eredmeny.pozicioszam = hiv[1];

  const dij = nyersSzoveg.match(FUVARDIJ);
  if (dij) {
    const ertek = Number(dij[1].replace(/[\s.]/g, "").replace(",", "."));
    if (Number.isFinite(ertek) && ertek > 0) {
      eredmeny.fuvardij = ertek;
      eredmeny.fuvardijPenznem = dij[2].toUpperCase() === "EUR" ? "EUR" : "Ft";
    }
  }

  const vontato = nyersSzoveg.match(VONTATO)?.[1];
  const potkocsi = nyersSzoveg.match(POTKOCSI)?.[1];
  if (vontato) eredmeny.rendszamVagySofor = potkocsi ? `${vontato}/${potkocsi}` : vontato;

  return eredmeny;
}
