"use server";

// FIGYELEM: "use server" fájl — csak async függvényeket exportálhat, lásd
// lib/fuvarozas/megbizasok.ts mintáját. Típusok: kontokivonat-constants.ts.
//
// A bank heti pár alkalommal exportált "HISTORY_xxxx.xlsx" kontókivonatát
// dolgozza fel, és a bevételi (pozitív összegű, nem kártyás) tételeket
// megpróbálja párosítani a nyitott (not fizetve) számlákkal:
//  1. Közlemény-ben szereplő számlaszám (vagy annak "ÉV-sorszám" rövidített
//     alakja) — ez kezeli a több számlát egyszerre fedező utalásokat is.
//  2. Ha nincs használható közlemény: vevő név + összeg-egyezés (1 vagy több
//     nyitott számla összege pontosan kiadja a befizetést).
// A feltöltés önmagában NEM ír az adatbázisba — a review-képernyőn
// elfogadott találatokat a fogadjaElParositasokat() könyveli.

import ExcelJS from "exceljs";
import { query } from "@/lib/db";
import { requireEditPermission } from "@/lib/auth/require-permission";
import type {
  KivonatEredmeny,
  KivonatParositas,
  KivonatSzamlaJelolt,
  KivonatTranzakcio,
} from "./kontokivonat-constants";

type NyitottSzamla = {
  id: string;
  szamlaszam: string;
  vevo_nev: string;
  brutto: number;
  penznem: string;
};

const CEGFORMA_MINTA =
  /\b(KFT|ZRT|BT|EV|RT|NYRT|KORL[AÁ]TOLT FELEL[OŐ]SS[EÉ]G[UŰ] T[AÁ]RSAS[AÁ]G|KORLATOLT F(ELELOSS)?)\b\.?/g;

function normalizeCegNev(nev: string): string {
  return nev
    .toUpperCase()
    .replace(/["'.,]/g, "")
    .replace(CEGFORMA_MINTA, "")
    .replace(/\s+/g, " ")
    .trim();
}

function nevEgyezik(bankNev: string, dbNev: string): boolean {
  const a = normalizeCegNev(bankNev);
  const b = normalizeCegNev(dbNev);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const aElso = a.split(" ")[0] ?? "";
  const bElso = b.split(" ")[0] ?? "";
  return aElso.length >= 3 && aElso === bElso;
}

/** Egy szövegrész önálló előfordulása: előtte nem betű/szám/kötőjel, utána nem szám — így pl. "WLLWR-2026-18" nem egyezik a "WLLWR-2026-181"-gyel, és a rövidített "2026-50" sem egy másik előtag "WNYH-2026-50" számával. */
function onalloanSzerepel(szoveg: string, resz: string): boolean {
  const escaped = resz.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![A-Z0-9-])${escaped}(?!\\d)`).test(szoveg);
}

/** "teljes" = a teljes számlaszám szerepel a közleményben; "reszleges" = csak az "ÉV-sorszám" utótag (pl. "WLLWR-2026-98" -> "2026-98"). */
function memoTartalmazzaSzamlaszamot(memo: string, szamlaszam: string): "teljes" | "reszleges" | null {
  const memoNorm = memo.toUpperCase();
  const szNorm = szamlaszam.toUpperCase();
  if (onalloanSzerepel(memoNorm, szNorm)) return "teljes";
  const utotag = szNorm.match(/^[A-Z]+-(\d{4}-\d+)$/);
  if (utotag && onalloanSzerepel(memoNorm, utotag[1])) return "reszleges";
  return null;
}

/** A bank "HUF"-ot, a Számlázz.hu "Ft"-ot ír ugyanarra — összehasonlításhoz egységesítjük. */
function penznemKod(penznem: string): string {
  const p = penznem.trim().toUpperCase();
  return p === "FT" ? "HUF" : p;
}

/** Összeg egész fillérre/centre — lebegőpontos összeadásnál (pl. EUR) a === különben elcsúszhat. */
function centben(osszeg: number): number {
  return Math.round(osszeg * 100);
}

/** Kis részhalmaz-összeg kereső (max. 3 tételig) — egy befizetés gyakran több nyitott számlát fedez egyszerre. */
function talaljOsszegKombinaciot(szamlak: NyitottSzamla[], celOsszeg: number): NyitottSzamla[] | null {
  const n = Math.min(szamlak.length, 12);
  const cel = centben(celOsszeg);
  const c = szamlak.map((sz) => centben(sz.brutto));
  for (let i = 0; i < n; i++) {
    if (c[i] === cel) return [szamlak[i]];
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (c[i] + c[j] === cel) return [szamlak[i], szamlak[j]];
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        if (c[i] + c[j] + c[k] === cel) {
          return [szamlak[i], szamlak[j], szamlak[k]];
        }
      }
    }
  }
  return null;
}

function cella(row: ExcelJS.Row, index: number): unknown {
  const cell = row.getCell(index);
  return cell.value && typeof cell.value === "object" && "result" in cell.value
    ? (cell.value as { result: unknown }).result
    : cell.value;
}

/** Adatsor-e (nem a fájlban időnként megismétlődő fejléc), és ha igen, milyen jellegű. */
function sorJellege(row: ExcelJS.Row): "fejlec" | "kiadas" | "kartya" | "bevetel" {
  const elso = cella(row, 1);
  if (!elso || String(elso).trim() === "Számlaszám") return "fejlec";

  const osszegRaw = cella(row, 7);
  const osszeg = typeof osszegRaw === "number" ? osszegRaw : Number(osszegRaw ?? NaN);
  if (!Number.isFinite(osszeg) || osszeg <= 0) return "kiadas";

  const partnerNevRaw = String(cella(row, 5) ?? "");
  const elsoSor = partnerNevRaw.split("\n")[0]?.trim() ?? "";
  if (elsoSor.startsWith("+CMS")) return "kartya";

  return "bevetel";
}

function sorbolTranzakcio(row: ExcelJS.Row): KivonatTranzakcio {
  const penznem = String(cella(row, 2) ?? "").trim();
  const ertekNapRaw = cella(row, 3);
  const partnerNevRaw = String(cella(row, 5) ?? "");
  const osszegRaw = cella(row, 7);
  const memoRaw = cella(row, 8);

  const osszeg = typeof osszegRaw === "number" ? osszegRaw : Number(osszegRaw ?? 0);

  const sorok = partnerNevRaw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const azonosito = sorok[0] ?? "";
  const partnerNev = sorok.length > 1 ? sorok[sorok.length - 1] : (sorok[0] ?? "");

  let datum: string;
  if (ertekNapRaw instanceof Date) {
    datum = ertekNapRaw.toISOString().slice(0, 10);
  } else {
    datum = String(ertekNapRaw ?? "").slice(0, 10);
  }

  const memo = memoRaw ? String(memoRaw).trim() : "";

  return { datum, partnerNev, penznem, osszeg, memo: memo || null, azonosito };
}

/**
 * A böngészőből base64-ként érkező .xlsx feldolgozása: a bevételi (vevői
 * befizetésnek tűnő) tételek párosítási javaslattal térnek vissza, a
 * kiadás/kártya jellegű sorok csak összesítve. Nem ír az adatbázisba.
 */
export async function dolgozzFelKivonatot(base64: string, fajlNev: string): Promise<KivonatEredmeny> {
  await requireEditPermission("szamlak");
  const buffer = Buffer.from(base64, "base64");
  const workbook = new ExcelJS.Workbook();
  // A @types/node újabb generikus Buffer<ArrayBufferLike> típusa nem egyezik
  // az exceljs saját (régebbi stílusú) Buffer deklarációjával — futásidőben
  // ugyanaz az objektum, csak a típusdefiníciók térnek el.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any);
  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    return {
      fajlNev,
      tranzakcioSzam: 0,
      datumtol: null,
      datumig: null,
      parositasok: [],
      kihagyottKiadas: 0,
      kihagyottKartya: 0,
    };
  }

  let osszesAdatSor = 0;
  let kihagyottKiadas = 0;
  let kihagyottKartya = 0;
  const tranzakciok: KivonatTranzakcio[] = [];

  worksheet.eachRow((row) => {
    const jelleg = sorJellege(row);
    if (jelleg === "fejlec") return;
    osszesAdatSor += 1;
    if (jelleg === "kiadas") {
      kihagyottKiadas += 1;
      return;
    }
    if (jelleg === "kartya") {
      kihagyottKartya += 1;
      return;
    }
    tranzakciok.push(sorbolTranzakcio(row));
  });

  const nyitottSzamlak = await query<NyitottSzamla>(
    `select id::text, szamlaszam, vevo_nev, (brutto + helyesbites_osszeg)::float8 as brutto, penznem
     from szamla
     where not fizetve and not sztorno and not sztornozva`
  );

  const parositasok: KivonatParositas[] = [];

  for (const tranz of tranzakciok) {
    const nyitottAdottPenznemben = nyitottSzamlak.filter((sz) => penznemKod(sz.penznem) === penznemKod(tranz.penznem));

    if (tranz.memo) {
      const teljesEgyezesek: KivonatSzamlaJelolt[] = [];
      const reszlegesEgyezesek: KivonatSzamlaJelolt[] = [];
      for (const sz of nyitottAdottPenznemben) {
        const talalat = memoTartalmazzaSzamlaszamot(tranz.memo, sz.szamlaszam);
        if (talalat === "teljes") teljesEgyezesek.push(sz);
        else if (talalat === "reszleges") reszlegesEgyezesek.push(sz);
      }
      if (teljesEgyezesek.length > 0) {
        parositasok.push({
          tranzakcio: tranz,
          allapot: "auto",
          mod: "memo",
          szamlak: teljesEgyezesek,
          megjegyzes: teljesEgyezesek.length > 1 ? `${teljesEgyezesek.length} számla egy utalásban` : null,
        });
        continue;
      }
      if (reszlegesEgyezesek.length === 1) {
        parositasok.push({
          tranzakcio: tranz,
          allapot: "auto",
          mod: "memo",
          szamlak: reszlegesEgyezesek,
          megjegyzes: "rövidített számlaszám a közleményben",
        });
        continue;
      }
      if (reszlegesEgyezesek.length > 1) {
        parositasok.push({
          tranzakcio: tranz,
          allapot: "review",
          mod: "memo",
          szamlak: reszlegesEgyezesek,
          megjegyzes: `${reszlegesEgyezesek.length} lehetséges egyezés a közlemény alapján`,
        });
        continue;
      }
    }

    const vevoNyitottak = nyitottAdottPenznemben
      .filter((sz) => nevEgyezik(tranz.partnerNev, sz.vevo_nev))
      .sort((a, b) => a.brutto - b.brutto);

    if (vevoNyitottak.length === 0) {
      parositasok.push({
        tranzakcio: tranz,
        allapot: "review",
        mod: null,
        szamlak: [],
        megjegyzes: "nincs egyező vevő a nyitott számlák között",
      });
      continue;
    }

    const kombinacio = talaljOsszegKombinaciot(vevoNyitottak, tranz.osszeg);
    if (kombinacio) {
      parositasok.push({
        tranzakcio: tranz,
        allapot: "auto",
        mod: "osszeg",
        szamlak: kombinacio,
        megjegyzes: kombinacio.length > 1 ? `összeg-egyezés (${kombinacio.length} számla)` : "összeg-egyezés",
      });
    } else {
      parositasok.push({
        tranzakcio: tranz,
        allapot: "review",
        mod: "osszeg",
        szamlak: vevoNyitottak.slice(0, 5),
        megjegyzes: "nincs pontos összeg-egyezés — válaszd ki kézzel",
      });
    }
  }

  const datumok = tranzakciok.map((t) => t.datum).sort();

  return {
    fajlNev,
    tranzakcioSzam: osszesAdatSor,
    datumtol: datumok[0] ?? null,
    datumig: datumok[datumok.length - 1] ?? null,
    parositasok,
    kihagyottKiadas,
    kihagyottKartya,
  };
}

/** A review-képernyőn elfogadott párosítások könyvelése — bulk "fizetve" jelölés. */
export async function fogadjaElParositasokat(szamlaIdk: string[]): Promise<{ sikeres: number }> {
  await requireEditPermission("szamlak");
  if (szamlaIdk.length === 0) return { sikeres: 0 };
  const eredmeny = await query<{ id: string }>(
    `update szamla set fizetve = true, fizetve_datum = now()
     where id = any($1::bigint[]) and not fizetve
     returning id::text as id`,
    [szamlaIdk]
  );
  return { sikeres: eredmeny.length };
}
