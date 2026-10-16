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
  // A régi /posta könyvjelzője Szabina Posta-lapjára vigyen, ne 404-re.
  async redirects() {
    return [
      { source: "/posta", destination: "/attekintes/posta", permanent: false },
      // A régi Fuvarozás felület 2026-10-04-én törölve — a könyvjelzők az újra vigyenek.
      { source: "/fuvarozas", destination: "/fuvarozas2", permanent: false },
      // Fuvarozás 2 navigáció (2026-10-12): minden funkció egy helyen; a megszűnt
      // lapok régi könyvjelzői a helyükre visznek.
      // A kézi kalkulátor az Ajánlat (Timocom) lapon; a ?honnan=&hova= továbbmegy.
      { source: "/fuvarozas2/kalkulator", destination: "/fuvarozas2/timocom", permanent: false },
      // Megszűnt (2026-10-12, Budaházi Zoltán): Diszpécser, GPS → Ma; Elszámolás → a Megbízások pénz-nézete.
      { source: "/fuvarozas2/diszpecser", destination: "/fuvarozas2", permanent: false },
      { source: "/fuvarozas2/gps", destination: "/fuvarozas2", permanent: false },
      { source: "/fuvarozas2/elszamolas", destination: "/fuvarozas2/megbizasok", permanent: false },
      // Régi könyvjelző: Tervezés ?menetnap=…#menetterv — a menetterv-felület megszűnt.
      {
        source: "/fuvarozas2/tervezes",
        has: [{ type: "query", key: "menetnap" }],
        destination: "/fuvarozas2",
        permanent: false,
      },
      // Telefonos vezetői nézet megszűnt (2026-10-16, docs/fuvarozas-1-hullam-terv.md D4):
      // a Fuvar · Cég · Rendszer · Számla · Papír fül régi könyvjelzői a /m-re visznek.
      { source: "/m/fuvar/:path*", destination: "/m", permanent: false },
      { source: "/m/ceg/:path*", destination: "/m", permanent: false },
      { source: "/m/rendszer/:path*", destination: "/m", permanent: false },
      { source: "/m/szamla/:path*", destination: "/m", permanent: false },
      { source: "/m/papir/:path*", destination: "/m", permanent: false },
    ];
  },
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
          // Próba üzemmód: semmit nem tilt, csak jelent (/api/csp-jelentes →
          // Railway-napló). Ha néhány napig nincs váratlan jelentés, a
          // fejléc neve "Content-Security-Policy"-ra cserélhető.
          {
            key: "Content-Security-Policy-Report-Only",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
              "font-src 'self' data:",
              "connect-src 'self'",
              "frame-src 'self'",
              "frame-ancestors 'self'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "report-uri /api/csp-jelentes",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
