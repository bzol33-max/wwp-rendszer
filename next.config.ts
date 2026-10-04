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
  experimental: {
    // A kontókivonat-feltöltés (lib/szamlak/kontokivonat.ts) az .xlsx-et
    // base64-ként küldi a Server Actionnek — a Next.js alapértelmezett 1MB-os
    // korlátja egy több hónapos, több száz tranzakciós kivonatnál (~33%
    // base64-többlettel) szűk lehet.
    serverActions: { bodySizeLimit: "10mb" },
  },
  // Biztonsági fejlécek minden válaszra (audit 2026-10-04, SEC-9). CSP
  // szándékosan még nincs: a Leaflet-csempék és az inline stílusok miatt
  // előbb Report-Only módban kellene kipróbálni.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          // SAMEORIGIN, nem DENY: a saját oldalaink beágyazhatják a saját
          // irat-végpontunkat (PDF-előnézet), más oldal viszont nem kerethez.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
