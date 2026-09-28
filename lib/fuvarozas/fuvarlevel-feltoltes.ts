// A sofőr fuvarlevél-/CMR-fotóinak feltöltése a telefonról — böngészős
// segéd, a régi dolgozói nézet (components/erkezes/sofor-fuvar-nap.tsx) és a
// sofőr app (components/m/sofor-nap.tsx) közösen használja.
//
// Többoldalas papír (Budaházi Zoltán, 2026-09-28: „az okmányok több
// oldalasak, akár 10 vagy több”): minden oldal külön kép, külön kérésben
// megy fel, hogy egy gyenge térerőn elakadt oldal ne vigye magával a többit,
// és egyik kérés se ütközzön a szerver-akció méretkorlátjába. Az irodában az
// oldalak egy PDF-be fűzve is letölthetők (app/api/fuvarozas/fuvarlevel-pdf).

import { feltoltFuvarlevelFoto } from "@/lib/fuvarozas/sofor";

/** A feltöltött kép leghosszabb oldala pixelben — a telefon 4000 px-es, 5-8 MB-os fotója így ~300-600 KB lesz. */
const FOTO_MAX_OLDAL_PX = 1600;
const FOTO_JPEG_MINOSEG = 0.82;

/**
 * A fotó kicsinyítése a telefonon, feltöltés előtt. Mobilnetről egy 8 MB-os
 * kép lassú és a szerver-akció korlátjába is beleütközne; egy fuvarlevél
 * 1600 px-en tökéletesen olvasható. Ha a böngésző nem tudja (nincs canvas),
 * az eredeti megy.
 */
export async function kicsinyitFotot(fajl: File): Promise<Blob> {
  try {
    const kep = await createImageBitmap(fajl);
    const arany = Math.min(1, FOTO_MAX_OLDAL_PX / Math.max(kep.width, kep.height));
    if (arany === 1 && fajl.size < 1_500_000) return fajl;
    const vaszon = document.createElement("canvas");
    vaszon.width = Math.round(kep.width * arany);
    vaszon.height = Math.round(kep.height * arany);
    const ctx = vaszon.getContext("2d");
    if (!ctx) return fajl;
    ctx.drawImage(kep, 0, 0, vaszon.width, vaszon.height);
    const blob = await new Promise<Blob | null>((ok) => vaszon.toBlob(ok, "image/jpeg", FOTO_JPEG_MINOSEG));
    return blob ?? fajl;
  } catch {
    return fajl;
  }
}

/**
 * Több oldal feltöltése egymás után. `haladas(kesz, osszes)` minden oldal után
 * hívódik (a „Feltöltés 3/10…” felirathoz). Egy hibás oldal nem állítja meg a
 * többit; a végén megmondja, hány ment fel és hány nem.
 */
export async function feltoltOldalakat(
  fuvarId: string,
  fajlok: File[],
  haladas?: (kesz: number, osszes: number) => void
): Promise<{ sikeres: number; hibas: number }> {
  let sikeres = 0;
  let hibas = 0;
  haladas?.(0, fajlok.length);
  for (const fajl of fajlok) {
    try {
      const kicsi = await kicsinyitFotot(fajl);
      const form = new FormData();
      form.append("foto", kicsi, kicsi.type === "image/png" ? "fuvarlevel.png" : "fuvarlevel.jpg");
      await feltoltFuvarlevelFoto(fuvarId, form);
      sikeres++;
    } catch {
      hibas++;
    }
    haladas?.(sikeres + hibas, fajlok.length);
  }
  return { sikeres, hibas };
}

/** A feltöltés eredménye egy mondatban, a sofőrnek. */
export function feltoltesUzenet(e: { sikeres: number; hibas: number }): { ok: boolean; szoveg: string } {
  if (e.hibas === 0) return { ok: true, szoveg: e.sikeres === 1 ? "Oldal feltöltve." : `${e.sikeres} oldal feltöltve.` };
  if (e.sikeres === 0) return { ok: false, szoveg: "Nem sikerült feltölteni — próbáld újra, ha jobb a térerő." };
  return { ok: false, szoveg: `${e.sikeres} oldal feltöltve, ${e.hibas} nem ment fel — azt küldd újra.` };
}
