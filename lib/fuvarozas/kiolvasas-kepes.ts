import "server-only";

// Képes megbízás-kiolvasás (D terv, 1. lépés — Budaházi Zoltán, 2026-11-17).
//
// A régi út (drive-sync-core.ts kivonatolFuvarAdatot) csak a PDF SZÖVEGRÉTEGÉT
// adja egy olcsó modellnek. Ami a PDF-ben kép (FERSPED #375: a megbízó
// fejléce logóként van benne), az kimarad; ami hasábos táblázat, az
// összecsúszik (felrakó ↔ lerakó, dátum ↔ cím). Itt a modell az oldalak
// KÉPÉT is megkapja, a szöveggel és a küldő e-mail címével együtt.
//
// Forrásmegjelölés (a google/langextract elve): minden mezőhöz a modell
// szó szerint idézi, honnan vette. Az idézetet a szövegrétegben
// visszakeressük — ha nincs ott, és nem a képes fejlécből/e-mailből jött,
// a mező gyanús. Ez a modul NEM ír semmit: a hívó dönt.

import { gyanusPontok, type KepesValasz } from "@/lib/fuvarozas/kiolvasas-kepes-alap";

export type KepesEredmeny = {
  adat: KepesValasz | null;
  /** Mezőnkénti gyanú: az idézet nem található a szövegben, vagy logikai ellentmondás. */
  gyanus: string[];
  modell: string;
  oldalak: number;
  ms: number;
  hiba?: string;
};

const UTASITAS = `Magyar fuvarmegbízást olvasol. Megkapod az irat OLDALAINAK KÉPÉT, az irat kinyert szövegét, és ha van, a küldő e-mail címét.
A fuvarozó (megbízott) MINDIG a Well-Worn Pallet Kft. — ő SOHA nem a megrendelő.

A megrendelő (megbízó) az a cég, amelyik az iratot KIADTA. Sorrend, amit nézel:
1. a fejléc / levélpapír / logó a KÉPEN (gyakran csak képként van benne, a szövegben nincs),
2. „Megbízó” / „Megrendelő” feliratú blokk,
3. a küldő e-mail címének domainje vagy az aláírás cége.
A felrakó vagy a lerakó cége LEHET a megrendelő, de csak ha az irat ezt mutatja (pl. a fejlécben ő áll). Ha a fejlécben más cég áll, az a megrendelő.

A felrakó és a lerakó helyét a KÉPEN lévő elrendezés szerint olvasd: a címke („Felrakóhely”, „Lerakóhely”, „Rakodás”, „Kirakás”) melletti/alatti mező tartozik hozzá. Ne cseréld fel őket. Minden megállót add vissza, útvonal-sorrendben.
A dátum az adott megállóhoz tartozó „ideje/napja” mezőből jön (ÉÉÉÉ-HH-NN). A fuvardíj a „Fuvardíj” mező nettó összege — kötbér, állásdíj, raklapár NEM fuvardíj.

FORRÁSMEGJELÖLÉS: minden mezőnél az "idezet" a forrás SZÓ SZERINTI, rövid (max 80 karakter) részlete, ahogy az iratban áll. A "hol": "fejlec" (a képes fejlécből/logóból), "szoveg" (az irat szövegéből), "email" (a küldő címéből), "nincs" (nem található — ilyenkor ertek null).
Ha nem vagy biztos, null a jó válasz. Ne találj ki adatot.

Csak JSON-t adj vissza, pontosan ebben az alakban:
{
  "megrendelo": {"ertek": string|null, "idezet": string|null, "hol": "fejlec"|"szoveg"|"email"|"nincs"},
  "megrendeloAdoszam": string|null,
  "pozicioszam": {"ertek": string|null, "idezet": string|null, "hol": "fejlec"|"szoveg"|"email"|"nincs"},
  "fuvardij": {"ertek": string|null, "penznem": "Ft"|"EUR"|null, "idezet": string|null, "hol": "szoveg"|"nincs"},
  "aru": string|null,
  "megallok": [{"tipus": "felrako"|"lerako", "ceg": string|null, "cim": string|null, "nap": string|null, "ido": string|null, "idezet": string|null}]
}`;

function jsonBol(nyers: string): KepesValasz | null {
  const a = nyers.indexOf("{");
  const b = nyers.lastIndexOf("}");
  if (a < 0 || b < a) return null;
  try {
    return JSON.parse(nyers.slice(a, b + 1)) as KepesValasz;
  } catch {
    return null;
  }
}

/** Az első `maxOldal` oldal JPEG-képe (data URL) és a teljes szövegréteg. */
async function oldalakEsSzoveg(pdf: Buffer, maxOldal: number): Promise<{ kepek: string[]; szoveg: string; oldalak: number }> {
  const { PDFParse } = await import("pdf-parse");
  const sharp = (await import("sharp")).default;
  const parser = new PDFParse({ data: pdf });
  try {
    const szoveg = (await parser.getText()).text;
    const kep = await parser.getScreenshot({ first: maxOldal, desiredWidth: 1400, imageBuffer: true, imageDataUrl: false });
    const kepek: string[] = [];
    for (const o of kep.pages) {
      if (!o.data) continue;
      const jpeg = await sharp(Buffer.from(o.data)).jpeg({ quality: 80 }).toBuffer();
      kepek.push(`data:image/jpeg;base64,${jpeg.toString("base64")}`);
    }
    return { kepek, szoveg, oldalak: kep.total ?? kepek.length };
  } finally {
    await parser.destroy();
  }
}

export async function kepesKiolvasas(bemenet: {
  pdf: Buffer;
  kuldo?: string | null;
  levelTorzs?: string | null;
  modell?: string;
  maxOldal?: number;
}): Promise<KepesEredmeny> {
  const modell = bemenet.modell ?? process.env.OPENROUTER_KEPES_MODEL ?? "google/gemini-2.5-flash";
  const kezd = Date.now();
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { adat: null, gyanus: [], modell, oldalak: 0, ms: 0, hiba: "Hiányzik az OPENROUTER_API_KEY." };

  const { kepek, szoveg, oldalak } = await oldalakEsSzoveg(bemenet.pdf, bemenet.maxOldal ?? 3);
  const szovegResz = [
    bemenet.kuldo ? `=== KÜLDŐ E-MAIL CÍME ===\n${bemenet.kuldo}` : null,
    `=== AZ IRAT KINYERT SZÖVEGE ===\n${szoveg.slice(0, 20000)}`,
    bemenet.levelTorzs ? `=== KÍSÉRŐ E-MAIL ===\n${bemenet.levelTorzs.slice(0, 4000)}` : null,
  ].filter(Boolean).join("\n\n");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    signal: AbortSignal.timeout(120_000),
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modell,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: UTASITAS },
        {
          role: "user",
          content: [
            ...kepek.map((url) => ({ type: "image_url", image_url: { url } })),
            { type: "text", text: szovegResz },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    return { adat: null, gyanus: [], modell, oldalak, ms: Date.now() - kezd, hiba: `OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}` };
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const adat = jsonBol(data.choices?.[0]?.message?.content ?? "");
  if (!adat) return { adat: null, gyanus: [], modell, oldalak, ms: Date.now() - kezd, hiba: "A modell válasza nem értelmezhető JSON." };
  adat.megallok = Array.isArray(adat.megallok) ? adat.megallok : [];
  return { adat, gyanus: gyanusPontok(adat, szoveg), modell, oldalak, ms: Date.now() - kezd };
}
