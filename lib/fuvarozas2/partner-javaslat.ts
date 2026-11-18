// Partner-adat javaslatok — a háttérkör (lásd partner-javaslat-alap.ts).
//
// Óránként fut a modell-szinkron körrel: azoknál a partnereknél, ahol a
// postázási cím, a számlázási e-mail vagy a két határidő hiányzik, (1) a
// legutóbbi, még ki nem olvasott megbízás-PDF-et a modell KÉPKÉNT is
// megkapja (a fejléc, logó, lábléc is látszik — a szöveges réteg ezt nem
// tartalmazza), (2) a postázási címhez a korábbi számlák vevőcímét is
// megnézzük. Iratonként egyszer fut (fuvar_partner_kiolvasas).
//
// NEM "use server" fájl: csak a szerver ütemezője hívja.

import { query } from "@/lib/db";
import { importModellek, oldalKepek } from "@/lib/fuvarozas/import/oldal-kepek";
import { letoltDriveFajlt } from "@/lib/fuvarozas/drive-sync-core";
import { partnerEgyezik } from "@/lib/fuvarozas/szamla-parositas";
import { javaslatokKiolvasasbol, kapcsolattartokKiolvasasbol, vevoCimSzamlaXmlbol, type Javaslat, type KapcsolattartoJavaslat, type NyersKiolvasas } from "@/lib/fuvarozas2/partner-javaslat-alap";

/**
 * 2026-11-18 (tulajdonos: „minden adat minden partnernél meglegyen”): a
 * kiolvasás új mezőket kér (székhely, kapcsolattartók), ezért az ennél
 * korábban kiolvasott iratok egyszer újra sorra kerülnek.
 */
const UJRAOLVASAS_UTAN = "2026-11-18T09:00:00Z";

const MAX_PDF_BAJT = 8 * 1024 * 1024;

const UTASITAS = `Egy magyar fuvarmegbízást kapod (PDF-ként vagy egy Word-irat szövegeként). A MEGBÍZÓ (az iratot kiadó cég) adatait keresd — NEM a címzettét: a címzett mi vagyunk (Well-Worn Pallet Kft., Szakoly), a mi adatainkat SOHA ne add vissza. Rakodóhely (felrakó, lerakó) címét se.

Nézd meg a fejlécet, a logó melletti szöveget és a láblécet is — a megbízó címe gyakran csak ott áll.

Válasz kizárólag JSON:
{
  "megbizoNev": string|null,          // a megbízó cég neve
  "postazasiCim": string|null,        // ahová az eredeti papírokat postázni kell: kifejezett postázási/levelezési cím > számlázási cím > székhely. Irányítószámmal, településsel, utcával, házszámmal, ahogy az iraton áll.
  "szekhely": string|null,            // a megbízó cég székhelye / címe a fejlécből vagy láblécből (irányítószám, település, utca, házszám)
  "kapcsolattartok": [                // a megbízó emberei az iraton (diszpécser, ügyintéző, aláíró): akinek telefonja vagy e-mailje van
    { "nev": string|null, "telefon": string|null, "email": string|null }
  ],
  "szamlazasiEmail": string|null,     // ahová a számlát e-mailben kérik
  "papirHataridoNap": number|null,    // hány napon belül kell a számlát / eredeti papírokat beküldeni (pl. "15 napon belül postázni" -> 15)
  "fizetesiHataridoNap": number|null  // fizetési határidő napokban (pl. "30 naptári nap" -> 30)
}
Ha valamit nem látsz egyértelműen, null — ne találj ki adatot.`;

/**
 * Word-megbízás (.doc / .docx) szövege — 2026-10-19: a Krajnik Sped megbízása
 * régi .doc volt, a kiolvasás csak PDF-et nézett, így az e-mail és a fizetési
 * feltétel sosem jutott el a partner-törzsbe (a tulajdonos az első számlát
 * mindig a megbízásban álló utasítás szerint állítja ki).
 */
async function wordSzovege(buffer: Buffer, mimeType: string | null): Promise<string> {
  // A fejléc is kell: a megbízó cégneve sokszor csak a Word-fejlécben áll (PÁNTYA #330, 2026-10-21).
  const { default: WordExtractor } = await import("word-extractor");
  const doc = await new WordExtractor().extract(buffer).catch(() => null);
  const fej = doc ? [doc.getHeaders({ includeFooters: false }), doc.getFooters()].map((t) => t.trim()).filter(Boolean).join("\n") : "";
  let torzs = doc?.getBody() ?? "";
  if (mimeType !== "application/msword") torzs = (await import("mammoth").then((m) => m.extractRawText({ buffer })).catch(() => null))?.value || torzs;
  return fej ? `=== AZ IRAT FEJLÉCE (LEVÉLPAPÍR) ===\n${fej}\n=== AZ IRAT SZÖVEGE ===\n${torzs}` : torzs;
}

const WORD_MIME = new Set(["application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);

async function kiolvasPdfbol(pdf: Buffer, nev: string, szoveg?: string): Promise<NyersKiolvasas | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Hiányzik az OPENROUTER_API_KEY környezeti változó.");
  // Ingyenes modellekkel (2026-11-17, Budaházi Zoltán: „ingyenes kell”): a
  // PDF-et oldalképként + szövegként kapja (az ingyenes modellek a PDF-fájlt
  // magát nem olvassák). Ha egyik sem válaszol, a hívó naplózza, és a
  // következő óránkénti kör újrapróbálja — fizetős modell nem fut.
  let tartalom: unknown[];
  if (szoveg != null) {
    tartalom = [{ type: "text", text: `A megbízás szövege (Word-irat, ${nev}):\n\n${szoveg.slice(0, 30_000)}` }];
  } else {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: pdf });
    const pdfSzoveg = await parser.getText().then((t) => t.text).catch(() => "").finally(() => parser.destroy());
    const kepek = await oldalKepek(pdf).catch(() => [] as string[]);
    tartalom = [
      ...kepek.map((url) => ({ type: "image_url", image_url: { url } })),
      { type: "text", text: `A megbízás PDF-je (${nev}) — az oldalak képe fent, a kinyert szöveg:\n\n${pdfSzoveg.slice(0, 30_000)}` },
    ];
  }
  let res: Response | null = null;
  const hibak: string[] = [];
  for (const model of importModellek()) {
    try {
      res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        signal: AbortSignal.timeout(180_000),
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: UTASITAS },
            { role: "user", content: tartalom },
          ],
          temperature: 0,
          response_format: { type: "json_object" },
        }),
      });
    } catch (err) {
      hibak.push(`${model}: ${err instanceof Error ? err.message : "hálózati hiba"}`);
      continue;
    }
    if (res.ok) break;
    hibak.push(`${model}: ${res.status}`);
  }
  if (!res?.ok) throw new Error(`A partneradat-olvasó (ingyenes) modellek most nem érhetők el — a következő kör újrapróbálja. (${hibak.join("; ")})`);

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const t = data.choices?.[0]?.message?.content ?? "";
  const eleje = t.indexOf("{");
  const vege = t.lastIndexOf("}");
  if (eleje === -1 || vege < eleje) return null;
  try {
    return JSON.parse(t.slice(eleje, vege + 1)) as NyersKiolvasas;
  } catch {
    return null;
  }
}

type HianyosPartner = {
  id: string;
  nev: string;
  nevvaltozatok: string[];
  hianyzik: string[];
};

async function hianyosPartnerek(): Promise<HianyosPartner[]> {
  return query<HianyosPartner>(
    `select p.id::text, p.nev, p.nevvaltozatok,
       array_remove(array[
         case when p.postazasi_cim is null and not p.posta_nem_kell then 'postazasi_cim' end,
         case when p.szekhely is null then 'szekhely' end,
         case when not exists (select 1 from fuvar_kapcsolatok k where k.partner_id = p.id and (k.telefon is not null or k.email is not null)) then 'kapcsolat' end,
         case when p.szamlazasi_email is null and not p.szamla_email_nem_kell then 'szamlazasi_email' end,
         case when p.papir_bekuldesi_hatarido_nap is null then 'papir_bekuldesi_hatarido_nap' end,
         case when p.fizetesi_hatarido_nap is null then 'fizetesi_hatarido_nap' end
       ], null) as hianyzik
     from fuvar_partnerek p
     where exists (select 1 from fuvar_megbizasok m where m.partner_id = p.id and m.torolt_at is null and m.jelleg = 'ber')`
  ).then((sorok) => sorok.filter((p) => p.hianyzik.length > 0));
}

/** A javaslatok felírása — csak a még hiányzó mezőkre, ugyanazt az értéket egyszer. */
async function rogzit(p: HianyosPartner, javaslatok: Javaslat[], forras: string, leiras: string | null, megbizasId: string | null): Promise<number> {
  let db = 0;
  for (const j of javaslatok) {
    if (!p.hianyzik.includes(j.mezo)) continue;
    const r = await query<{ id: string }>(
      `insert into fuvar_partner_javaslat (partner_id, mezo, ertek, forras, forras_leiras, megbizas_id)
       values ($1, $2, $3, $4, $5, $6) on conflict (partner_id, mezo, ertek) do nothing returning id::text`,
      [p.id, j.mezo, j.ertek, forras, leiras, megbizasId]
    );
    db += r.length;
  }
  return db;
}

/**
 * A megbízáson talált kapcsolattartók a Kapcsolatok törzsbe, a partnerhez kötve —
 * aki már ott van (ugyanaz az e-mail, vagy ugyanaz a név), annak csak a hiányzó
 * telefonja/e-mailje pótlódik. Nem partner-mező, ezért nem javaslat: egyből bekerül.
 */
async function rogzitKapcsolatokat(p: HianyosPartner, kapcsolatok: KapcsolattartoJavaslat[], forras: string): Promise<number> {
  if (kapcsolatok.length === 0) return 0;
  const meglevo = await query<{ id: string; kapcsolattarto: string | null; telefon: string | null; email: string | null }>(
    `select id::text, kapcsolattarto, telefon, email from fuvar_kapcsolatok where partner_id = $1`,
    [p.id]
  );
  let db = 0;
  for (const k of kapcsolatok) {
    const volt = meglevo.find((m) => (k.email && m.email?.toLowerCase() === k.email) || (k.nev && m.kapcsolattarto?.toLowerCase() === k.nev.toLowerCase()));
    if (volt) {
      if ((!volt.telefon && k.telefon) || (!volt.email && k.email)) {
        await query(`update fuvar_kapcsolatok set telefon = coalesce(telefon, $2), email = coalesce(email, $3) where id = $1`, [volt.id, k.telefon, k.email]);
        db++;
      }
      continue;
    }
    await query(
      `insert into fuvar_kapcsolatok (ceg, kapcsolattarto, telefon, email, forras, partner_id) values ($1, $2, $3, $4, $5, $6)`,
      [p.nev, k.nev, k.telefon, k.email, `megbízás: ${forras}`.slice(0, 200), p.id]
    );
    meglevo.push({ id: "", kapcsolattarto: k.nev, telefon: k.telefon, email: k.email });
    db++;
  }
  return db;
}

/**
 * Egy kör: partnerenként a legutóbbi, még ki nem olvasott megbízás-PDF
 * (legfeljebb `korlat` irat — óránként 2, hogy az ingyenes modellek napi
 * kerete az importnak is jusson), és a postázási címhez a számlák vevőcíme.
 */
export async function futtatPartnerJavaslatokat(korlat = 2): Promise<{ irat: number; javaslat: number; hiba: number }> {
  const eredmeny = { irat: 0, javaslat: 0, hiba: 0 };
  const partnerek = await hianyosPartnerek();
  if (partnerek.length === 0) return eredmeny;

  // 1. A számlák vevőcíme — olcsó, DB-n belül.
  const kellCim = partnerek.filter((p) => p.hianyzik.includes("postazasi_cim"));
  if (kellCim.length > 0) {
    const szamlak = await query<{ szamlaszam: string; vevo_nev: string; raw_xml: string | null }>(
      `select szamlaszam, vevo_nev, raw_xml from szamla
       where kategoria = 'fuvar' and not sztorno and raw_xml is not null
       order by kiallitas_datum desc limit 400`
    );
    for (const p of kellCim) {
      const sz = szamlak.find((x) => partnerEgyezik(x.vevo_nev, [p.nev, ...p.nevvaltozatok]));
      const cim = sz ? vevoCimSzamlaXmlbol(sz.raw_xml) : null;
      if (sz && cim) eredmeny.javaslat += await rogzit(p, [{ mezo: "postazasi_cim", ertek: cim }], "szamla", sz.szamlaszam, null);
    }
  }

  // 2. A megbízás-iratok (PDF képként is, Word fejléccel). A fájlnév nélküli
  // dokumentum-sor és a csak a megbízáson álló Drive-azonosító is számít
  // (2026-10-21, PÁNTYA #330: fajlnev = null miatt sosem olvastuk ki); a típust
  // a letöltés mondja meg, a nem olvasható irat hibaként egyszer rögzül.
  const iratok = await query<{ partner_id: string; megbizas_id: string; drive_file_id: string; fajlnev: string | null }>(
    `select distinct on (x.partner_id) x.partner_id::text, x.megbizas_id::text, x.drive_file_id, x.fajlnev
     from (
       select m.partner_id, m.id as megbizas_id, d.drive_file_id, d.fajlnev
       from fuvar_dokumentumok d join fuvar_megbizasok m on m.id = d.fuvar_id
       where d.tipus = 'megbizas' and m.torolt_at is null and d.drive_file_id is not null
         and (d.fajlnev is null or d.fajlnev ~* '\\.(pdf|docx?)$')
       union all
       select m.partner_id, m.id, m.drive_file_id, null
       from fuvar_megbizasok m where m.torolt_at is null and m.drive_file_id is not null
     ) x
     where x.partner_id = any($1::bigint[])
       and not exists (select 1 from fuvar_partner_kiolvasas k where k.drive_file_id = x.drive_file_id and k.futott_at >= $2::timestamptz)
     order by x.partner_id, x.megbizas_id desc, x.fajlnev nulls last`,
    [partnerek.map((p) => p.id), UJRAOLVASAS_UTAN]
  );
  for (const irat of iratok.slice(0, korlat)) {
    const p = partnerek.find((x) => x.id === irat.partner_id);
    if (!p) continue;
    eredmeny.irat++;
    try {
      const fajl = await letoltDriveFajlt(irat.drive_file_id);
      irat.fajlnev ??= fajl.nev;
      if (fajl.buffer.length > MAX_PDF_BAJT) throw new Error(`túl nagy irat (${fajl.buffer.length} bájt)`);
      let nyers: NyersKiolvasas | null;
      if (fajl.mimeType === "application/pdf") nyers = await kiolvasPdfbol(fajl.buffer, irat.fajlnev ?? "megbizas.pdf");
      else if (fajl.mimeType && WORD_MIME.has(fajl.mimeType)) nyers = await kiolvasPdfbol(fajl.buffer, irat.fajlnev ?? "megbizas.doc", await wordSzovege(fajl.buffer, fajl.mimeType));
      else throw new Error(`nem olvasható irat (${fajl.mimeType})`);
      const javaslatok = javaslatokKiolvasasbol(nyers, [p.nev, ...p.nevvaltozatok]);
      eredmeny.javaslat += await rogzit(p, javaslatok, "megbizas_pdf", irat.fajlnev, irat.megbizas_id);
      const kapcsolatok = kapcsolattartokKiolvasasbol(nyers, [p.nev, ...p.nevvaltozatok]);
      eredmeny.javaslat += await rogzitKapcsolatokat(p, kapcsolatok, irat.fajlnev ?? irat.drive_file_id);
      await query(
        `insert into fuvar_partner_kiolvasas (drive_file_id, partner_id, megbizas_id, eredmeny) values ($1, $2, $3, $4)
         on conflict (drive_file_id) do update set eredmeny = excluded.eredmeny, hiba = null, futott_at = now()`,
        [irat.drive_file_id, p.id, irat.megbizas_id, JSON.stringify(nyers)]
      );
      console.log(`[partner-javaslat] ${p.nev} ← ${irat.fajlnev ?? irat.drive_file_id}: ${javaslatok.map((j) => `${j.mezo}=${j.mezo === "postazasi_cim" ? "(cím)" : j.ertek}`).join(", ") || "nincs új adat"}`);
    } catch (err) {
      eredmeny.hiba++;
      const uzenet = err instanceof Error ? err.message : String(err);
      // Ha csak az ingyenes modellek voltak épp elérhetetlenek, nem rögzítjük
      // véglegesnek: a következő óránkénti kör újra megpróbálja.
      if (uzenet.includes("most nem érhetők el")) {
        console.error(`[partner-javaslat] ${p.nev}: ${uzenet}`);
        continue;
      }
      await query(
        `insert into fuvar_partner_kiolvasas (drive_file_id, partner_id, megbizas_id, hiba) values ($1, $2, $3, $4)
         on conflict (drive_file_id) do update set hiba = excluded.hiba, futott_at = now()`,
        [irat.drive_file_id, p.id, irat.megbizas_id, uzenet.slice(0, 500)]
      ).catch(() => {});
      console.error(`[partner-javaslat] ${p.nev}: ${uzenet}`);
    }
  }
  return eredmeny;
}
