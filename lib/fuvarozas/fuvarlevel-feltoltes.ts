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
import { kovetkezoMinoseg } from "@/lib/fuvarozas/fuvarlevel-minoseg";

/** 3000 px-en megmarad a kézírás részlete; 0,9-es JPEG többnyire 1,5–3,5 MB, a 8 MB-os feltöltési határ alatt. */
const FOTO_MAX_OLDAL_PX = 3000;
const FOTO_JPEG_MINOSEG = 0.9;

/**
 * A fotó kicsinyítése a telefonon, feltöltés előtt. Mobilnetről egy 8 MB-os
 * kép lassú és a szerver-akció korlátjába is beleütközne; a 3000 px-es,
 * 0,9-es JPEG jellemzően 1,5–3,5 MB. Ha 8 MB fölé kerül, fokozatosan
 * csökkentjük a minőséget 0,85-re, majd 0,8-ra. Ha a böngésző nem tudja,
 * az eredeti megy.
 */
export async function kicsinyitFotot(fajl: File): Promise<Blob> {
  let kep: ImageBitmap | null = null;
  try {
    kep = await createImageBitmap(fajl);
    const arany = Math.min(1, FOTO_MAX_OLDAL_PX / Math.max(kep.width, kep.height));
    if (arany === 1 && fajl.size < 1_500_000) return fajl;
    const vaszon = document.createElement("canvas");
    vaszon.width = Math.round(kep.width * arany);
    vaszon.height = Math.round(kep.height * arany);
    const ctx = vaszon.getContext("2d");
    if (!ctx) return fajl;
    ctx.drawImage(kep, 0, 0, vaszon.width, vaszon.height);
    let minoseg: number | null = FOTO_JPEG_MINOSEG;
    while (minoseg !== null) {
      const blob = await new Promise<Blob | null>((ok) => vaszon.toBlob(ok, "image/jpeg", minoseg ?? undefined));
      if (!blob) break;
      const kovetkezo = kovetkezoMinoseg(minoseg, blob.size);
      if (kovetkezo === minoseg) return blob;
      minoseg = kovetkezo;
    }
    throw new Error("A tömörített kép meghaladja a 8 MB-ot.");
  } catch {
    return fajl;
  } finally {
    // A dekódolt kép memóriája azonnal felszabadul — tízoldalas sorozatnál
    // gyenge telefonon ez számít (audit FE-8).
    kep?.close();
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
