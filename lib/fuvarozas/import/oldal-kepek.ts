// A megbízás-PDF oldalai képként (2026-11-17, képes kiolvasás): a nyelvi
// modell a szövegréteg mellett a LÁTOTT oldalt is megkapja — a csak képként
// beágyazott fejléc (FERSPED #375) és a hasábos táblázat így olvasható.
// Plain Node modul (nincs "server-only"), mert a drive-sync-core is az.

/** Az ingyenes, képet olvasó modellek, sorrendben (2026-11-17: „ingyenes kell”). */
export const INGYENES_OLVASO_MODELLEK = ["nvidia/nemotron-3.5-super-vl:free", "google/gemma-4-31b-it:free"];

/** Az import modelljei: OPENROUTER_IMPORT_MODELLEK (vesszővel) vagy az ingyenes lista. */
export function importModellek(): string[] {
  const env = process.env.OPENROUTER_IMPORT_MODELLEK?.split(",").map((s) => s.trim()).filter(Boolean);
  return env && env.length > 0 ? env : INGYENES_OLVASO_MODELLEK;
}

/** Az első `maxOldal` oldal JPEG-képe data URL-ként (1400 px széles, 80% minőség). */
export async function oldalKepek(pdf: Buffer, maxOldal = 3): Promise<string[]> {
  const { PDFParse } = await import("pdf-parse");
  const sharp = (await import("sharp")).default;
  const parser = new PDFParse({ data: pdf });
  try {
    const kep = await parser.getScreenshot({ first: maxOldal, desiredWidth: 1400, imageBuffer: true, imageDataUrl: false });
    const kepek: string[] = [];
    for (const o of kep.pages) {
      if (!o.data) continue;
      const jpeg = await sharp(Buffer.from(o.data)).jpeg({ quality: 80 }).toBuffer();
      kepek.push(`data:image/jpeg;base64,${jpeg.toString("base64")}`);
    }
    return kepek;
  } finally {
    await parser.destroy();
  }
}
