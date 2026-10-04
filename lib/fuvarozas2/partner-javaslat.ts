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
import { letoltDriveFajlt } from "@/lib/fuvarozas/drive-sync-core";
import { partnerEgyezik } from "@/lib/fuvarozas/szamla-parositas";
import { javaslatokKiolvasasbol, vevoCimSzamlaXmlbol, type Javaslat, type NyersKiolvasas } from "@/lib/fuvarozas2/partner-javaslat-alap";

const MAX_PDF_BAJT = 8 * 1024 * 1024;

const UTASITAS = `Egy magyar fuvarmegbízás PDF-jét kapod. A MEGBÍZÓ (az iratot kiadó cég) adatait keresd — NEM a címzettét: a címzett mi vagyunk (Well-Worn Pallet Kft., Szakoly), a mi adatainkat SOHA ne add vissza. Rakodóhely (felrakó, lerakó) címét se.

Nézd meg a fejlécet, a logó melletti szöveget és a láblécet is — a megbízó címe gyakran csak ott áll.

Válasz kizárólag JSON:
{
  "megbizoNev": string|null,          // a megbízó cég neve
  "postazasiCim": string|null,        // ahová az eredeti papírokat postázni kell: kifejezett postázási/levelezési cím > számlázási cím > székhely. Irányítószámmal, településsel, utcával, házszámmal, ahogy az iraton áll.
  "szamlazasiEmail": string|null,     // ahová a számlát e-mailben kérik
  "papirHataridoNap": number|null,    // hány napon belül kell a számlát / eredeti papírokat beküldeni (pl. "15 napon belül postázni" -> 15)
  "fizetesiHataridoNap": number|null  // fizetési határidő napokban (pl. "30 naptári nap" -> 30)
}
Ha valamit nem látsz egyértelműen, null — ne találj ki adatot.`;

async function kiolvasPdfbol(pdf: Buffer, nev: string): Promise<NyersKiolvasas | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Hiányzik az OPENROUTER_API_KEY környezeti változó.");
  const model = process.env.OPENROUTER_PDF_MODEL || "google/gemini-2.5-flash";
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    signal: AbortSignal.timeout(60_000),
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: UTASITAS },
        {
          role: "user",
          content: [
            { type: "text", text: "A megbízás PDF-je:" },
            { type: "file", file: { filename: nev, file_data: `data:application/pdf;base64,${pdf.toString("base64")}` } },
          ],
        },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter hiba (${res.status}): ${(await res.text()).slice(0, 300)}`);
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
 * Egy kör: partnerenként a legutóbbi, még ki nem olvasott megbízás-PDF
 * (legfeljebb `korlat` irat), és a postázási címhez a számlák vevőcíme.
 */
export async function futtatPartnerJavaslatokat(korlat = 10): Promise<{ irat: number; javaslat: number; hiba: number }> {
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

  // 2. A megbízás-PDF-ek, képként is.
  const iratok = await query<{ partner_id: string; megbizas_id: string; drive_file_id: string; fajlnev: string | null }>(
    `select distinct on (m.partner_id) m.partner_id::text, m.id::text as megbizas_id, d.drive_file_id, d.fajlnev
     from fuvar_dokumentumok d
     join fuvar_megbizasok m on m.id = d.fuvar_id
     where d.tipus = 'megbizas' and m.partner_id = any($1::bigint[]) and m.torolt_at is null
       and coalesce(d.fajlnev, '') ~* '\\.pdf$'
       and not exists (select 1 from fuvar_partner_kiolvasas k where k.drive_file_id = d.drive_file_id)
     order by m.partner_id, d.created_at desc`,
    [partnerek.map((p) => p.id)]
  );
  for (const irat of iratok.slice(0, korlat)) {
    const p = partnerek.find((x) => x.id === irat.partner_id);
    if (!p) continue;
    eredmeny.irat++;
    try {
      const fajl = await letoltDriveFajlt(irat.drive_file_id);
      if (fajl.mimeType !== "application/pdf" || fajl.buffer.length > MAX_PDF_BAJT) throw new Error(`nem olvasható PDF (${fajl.mimeType}, ${fajl.buffer.length} bájt)`);
      const nyers = await kiolvasPdfbol(fajl.buffer, irat.fajlnev ?? "megbizas.pdf");
      const javaslatok = javaslatokKiolvasasbol(nyers, [p.nev, ...p.nevvaltozatok]);
      eredmeny.javaslat += await rogzit(p, javaslatok, "megbizas_pdf", irat.fajlnev, irat.megbizas_id);
      await query(
        `insert into fuvar_partner_kiolvasas (drive_file_id, partner_id, megbizas_id, eredmeny) values ($1, $2, $3, $4)
         on conflict (drive_file_id) do update set eredmeny = excluded.eredmeny, hiba = null, futott_at = now()`,
        [irat.drive_file_id, p.id, irat.megbizas_id, JSON.stringify(nyers)]
      );
      console.log(`[partner-javaslat] ${p.nev} ← ${irat.fajlnev ?? irat.drive_file_id}: ${javaslatok.map((j) => `${j.mezo}=${j.mezo === "postazasi_cim" ? "(cím)" : j.ertek}`).join(", ") || "nincs új adat"}`);
    } catch (err) {
      eredmeny.hiba++;
      const uzenet = err instanceof Error ? err.message : String(err);
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
