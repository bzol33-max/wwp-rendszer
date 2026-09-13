import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (a Drive-fuvarmegbízás-import PDF-szövegkinyeréséhez, lásd
  // lib/fuvarozas/drive-sync-core.ts) a pdfjs-dist csomagra épül, ami egy
  // külön worker-fájlt (pdf.worker.mjs) tölt be futásidőben a saját
  // node_modules-beli helyéről. Ha Next.js a szerver-bundle-be ágyazza
  // (webpackeli/turbopackeli) ezt a csomagot, a worker-fájl relatív útja
  // már nem létezik a lefordított kimenetben — "Cannot find module
  // '.../pdf.worker.mjs'" hibát okozva élesben. A serverExternalPackages
  // kizárja ezeket a bundlingből, így natív node_modules-os require-dal
  // töltődnek be, ahol a worker-fájl ténylegesen megtalálható.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
