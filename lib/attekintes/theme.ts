import type { CSSProperties } from "react";

// A "Menta-antracit" színséma — a felhasználó ezt választotta a bemutatott
// 20 mockup közül (#14) — kizárólag az /attekintes szekcióra korlátozva,
// CSS egyéni tulajdonságokként a layout gyökerén (app/attekintes/layout.tsx).
// Szándékosan NEM a globals.css megosztott design tokenjeit (--card,
// --muted, stb.) írja felül, hogy ne hasson ki az app többi részére —
// helyette saját, "--at-" előtagú változókat vezet be, amiket az
// /attekintes al-oldalak Tailwind tetszőleges érték szintaxissal
// (pl. "bg-[var(--at-card)]") olvasnak.
export const ATTEKINTES_THEME_STYLE = {
  "--at-bg": "#eceeec",
  "--at-card": "#ffffff",
  "--at-tile": "#dfe6e2",
  "--at-border": "#d2dbd6",
  "--at-text": "#14201a",
  "--at-muted": "#5f6d66",
  "--at-positive": "#1f7a5c",
  "--at-negative": "#a3392e",
  "--at-accent": "#1f9c73",
} as CSSProperties;
