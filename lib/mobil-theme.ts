import type { CSSProperties } from "react";

// Kötelező alap-színséma minden ÚJ, önálló, mobilra tervezett nézethez
// (pl. /felvasarlas) — a "Menta-antracit" paletta, amit Budaházi Zoltán is
// választott az Áttekintés modulhoz (ld. lib/attekintes/theme.ts
// MENTA_ANTRACIT). Az Áttekintés saját, felhasználónkénti színválasztását ez
// nem érinti (pl. Budaházi Szabina ott Óceánturkizt lát) — az továbbra is a
// getAttekintesTheme() dönti el. Ez a modul a "--mob-" előtaggal vezeti be
// ugyanazokat az értékeket, hogy a mobil nézetek Tailwind tetszőleges érték
// szintaxissal (pl. "bg-[var(--mob-bg)]") olvashassák, az Áttekintéstől
// függetlenül.
export const MOBIL_THEME: CSSProperties = {
  "--mob-bg": "#eceeec",
  "--mob-card": "#ffffff",
  "--mob-tile": "#dfe6e2",
  "--mob-border": "#d2dbd6",
  "--mob-text": "#14201a",
  "--mob-muted": "#5f6d66",
  "--mob-positive": "#1f7a5c",
  "--mob-negative": "#a3392e",
  "--mob-accent": "#1f9c73",
} as CSSProperties;
