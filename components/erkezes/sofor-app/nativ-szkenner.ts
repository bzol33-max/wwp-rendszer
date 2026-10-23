// A Google ML Kit dokumentum-szkenner a „WWP Sofőr” Android appban
// (android-app/, Capacitor héj). 2026-10-23 — a kutatás és az 5 szakértői
// bírálat eredménye: a fuvarozói appok (Samsara, Motive/ArcBest/Scanbot,
// Genius Scan) natív szkennert használnak; az ingyenes natív szkenner a
// Google-é (ugyanaz, mint a Google Drive-ban): élő lapkeresés, magától fotóz,
// kivág, kiegyenesít, fehérít, ujjat/foltot eltüntet, több oldal.
//
// Csak akkor él, ha az oldal az appban fut (Capacitor natív platform); sima
// böngészőben null — ott a tartalék út (telefon kamerája + OpenCV) megy.

import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

type ScanResult = { scannedImages?: string[] };
type DocumentScannerPlugin = {
  scanDocument(o: { scannerMode: "FULL" | "BASE" | "BASE_WITH_FILTER"; resultFormats: "JPEG" | "PDF" | "JPEG_PDF"; pageLimit: number; galleryImportAllowed: boolean }): Promise<ScanResult>;
  isGoogleDocumentScannerModuleAvailable(): Promise<{ available: boolean }>;
  installGoogleDocumentScannerModule(): Promise<void>;
  addListener(e: "googleDocumentScannerModuleInstallProgress", f: (x: { state: number; progress?: number }) => void): Promise<PluginListenerHandle>;
};
type AppPlugin = {
  addListener(e: "backButton", f: (x: { canGoBack: boolean }) => void): Promise<PluginListenerHandle>;
  minimizeApp(): Promise<void>;
};

const DocumentScanner = registerPlugin<DocumentScannerPlugin>("DocumentScanner");
const App = registerPlugin<AppPlugin>("App");

/** A WWP Sofőr appban fut-e az oldal, és van-e benne szkenner. */
export function vanNativSzkenner(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("DocumentScanner");
  } catch {
    return false;
  }
}

/** Sima Android böngésző (nem az app) — itt ajánljuk fel az app letöltését. */
export function androidBongeszo(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent) && !/WWPSofor\//.test(navigator.userAgent);
}

/** A szkenner-modul előkészítése (első indításkor tölti le a Play-szolgáltatás). */
export async function szkennerModulElokeszit(allapot?: (szoveg: string) => void): Promise<boolean> {
  if (!vanNativSzkenner()) return false;
  try {
    if ((await DocumentScanner.isGoogleDocumentScannerModuleAvailable()).available) return true;
    allapot?.("A szkenner letöltése…");
    let figyelo: PluginListenerHandle | null = null;
    const kesz = new Promise<boolean>((ok) => {
      void DocumentScanner.addListener("googleDocumentScannerModuleInstallProgress", (e) => {
        if (e.state === 4) ok(true); // COMPLETED
        else if (e.state === 3 || e.state === 5) ok(false); // CANCELED / FAILED
        else if (e.progress != null) allapot?.(`A szkenner letöltése… ${Math.round(e.progress)}%`);
      }).then((h) => (figyelo = h));
      // Szüneteltetett letöltés (nincs Wi-Fi) ne lógjon örökké — a következő indításkor újra próbáljuk.
      setTimeout(() => ok(false), 5 * 60_000);
    });
    try {
      await DocumentScanner.installGoogleDocumentScannerModule();
    } catch (err) {
      if (/already/i.test(err instanceof Error ? err.message : String(err))) return true;
      throw err;
    }
    try {
      return await kesz;
    } finally {
      (figyelo as PluginListenerHandle | null)?.remove();
    }
  } catch {
    return false;
  }
}

/** Az ML Kit kimenete legfeljebb 2400 px, 0,85-ös JPEG (≈205 dpi A4-en — a CMR apró betűje is olvasható). */
async function meretez(b: Blob): Promise<Blob> {
  try {
    const kep = await createImageBitmap(b);
    try {
      const arany = Math.min(1, 2400 / Math.max(kep.width, kep.height));
      if (arany === 1 && b.size < 2_500_000) return b;
      const c = document.createElement("canvas");
      c.width = Math.round(kep.width * arany);
      c.height = Math.round(kep.height * arany);
      c.getContext("2d")?.drawImage(kep, 0, 0, c.width, c.height);
      return (await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.85))) ?? b;
    } finally {
      kep.close();
    }
  } catch {
    return b;
  }
}

async function oldalakBeolvas(eredmeny: ScanResult): Promise<File[]> {
  const ki: File[] = [];
  for (const [i, uri] of (eredmeny.scannedImages ?? []).entries()) {
    const v = await fetch(Capacitor.convertFileSrc(uri));
    const nyers = await v.blob();
    if (!v.ok || !nyers.type.startsWith("image/")) throw new Error("A szkennelt oldal nem olvasható.");
    const b = await meretez(nyers);
    ki.push(new File([b], `oldal-${i + 1}.jpg`, { type: "image/jpeg" }));
  }
  return ki;
}

/**
 * A szkenner megnyitása. Visszaadja a beolvasott oldalakat (JPEG-ként), vagy
 * üres listát, ha a sofőr kilépett. Galéria-import szándékosan nincs (a
 * sofőr ne csatolhasson rossz képet — UX-bírálat).
 */
let szkennelesFolyik: Promise<File[]> | null = null;
export function nativSzkenneles(): Promise<File[]> {
  // Dupla koppintás: a plugin a második hívással felülírná az elsőt, ami sosem térne vissza (bírálat).
  if (szkennelesFolyik) return szkennelesFolyik;
  szkennelesFolyik = (async () => {
    try {
      const e = await DocumentScanner.scanDocument({ scannerMode: "FULL", resultFormats: "JPEG", pageLimit: 10, galleryImportAllowed: false });
      return await oldalakBeolvas(e);
    } catch (err) {
      const u = err instanceof Error ? err.message : String(err);
      if (/cancel/i.test(u)) return [];
      throw err;
    }
  })().finally(() => {
    szkennelesFolyik = null;
  });
  return szkennelesFolyik;
}

/**
 * Az Android „Vissza” gomb az appban: a hívó bezárja a nyitott réteget; ha
 * nincs mit bezárni (false), az app a háttérbe megy (különben semmi sem
 * történne — Capacitor alapértelmezés). Böngészőben nem csinál semmit.
 */
export function figyelVisszaGomb(bezar: () => boolean): () => void {
  if (!vanNativSzkenner()) return () => {};
  let h: PluginListenerHandle | null = null;
  let le = false;
  void App.addListener("backButton", () => {
    if (!bezar()) void App.minimizeApp();
  }).then((x) => {
    h = x;
    if (le) void x.remove();
  });
  return () => {
    le = true;
    void h?.remove();
  };
}
