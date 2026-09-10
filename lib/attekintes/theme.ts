import type { CSSProperties } from "react";

// Az Áttekintés (/attekintes) színsémái — a felhasználók a bemutatott 20
// mockup közül választottak (BudahaziZoltan: #14 Menta-antracit,
// BudahaziSzabina: #9 Óceánturkiz) — kizárólag az /attekintes szekcióra
// korlátozva, CSS egyéni tulajdonságokként a layout gyökerén
// (app/attekintes/layout.tsx). Szándékosan NEM a globals.css megosztott
// design tokenjeit (--card, --muted, stb.) írja felül, hogy ne hasson ki
// az app többi részére — helyette saját, "--at-" előtagú változókat
// vezet be, amiket az /attekintes al-oldalak Tailwind tetszőleges érték
// szintaxissal (pl. "bg-[var(--at-card)]") olvasnak.

const MENTA_ANTRACIT = {
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

const OCEANTURKIZ = {
  "--at-bg": "#eaf2f1",
  "--at-card": "#ffffff",
  "--at-tile": "#dfeceb",
  "--at-border": "#d3e2e0",
  "--at-text": "#0f2422",
  "--at-muted": "#597370",
  "--at-positive": "#12706a",
  "--at-negative": "#b0402f",
  "--at-accent": "#12706a",
} as CSSProperties;

// Az összehasonlítást ékezettől, szóköztől és kis/nagybetűtől függetlenné
// tesszük, hogy a felhasználó nevének pontos rögzített formája (szóközzel
// vagy anélkül, ékezettel vagy anélkül) ne számítson a párosításnál.
function normalizeNev(nev: string): string {
  return nev
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

// Felhasználónkénti színséma-választás — a bejelentkezett felhasználó
// megjelenítendő neve (session.name) alapján. Akinek nincs itt
// bejegyzése, az alapértelmezett (Menta-antracit) sémát kapja.
const THEME_BY_USER: Record<string, CSSProperties> = {
  [normalizeNev("Budaházi Zoltán")]: MENTA_ANTRACIT,
  [normalizeNev("Budaházi Szabina")]: OCEANTURKIZ,
};

export function getAttekintesTheme(userName: string): CSSProperties {
  return THEME_BY_USER[normalizeNev(userName)] ?? MENTA_ANTRACIT;
}
