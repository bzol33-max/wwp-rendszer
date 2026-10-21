import type { CSSProperties } from "react";

// A sofőr app színei — Budaházi Zoltán 2026-10-21-én a 6. tervkör „9-es”
// (gyorsgombos) tervét választotta: világos, kékes háttér, egy erős kék fő
// gomb, fehér kártyák. Ez SZÁNDÉKOS kivétel a Menta-antracit MOBIL_THEME alól
// (AGENTS.md), ugyanúgy, ahogy az Áttekintés is saját sémát kapott: a
// sofőrök a korábbi sötét / menta felületet elutasították.
export const SOFOR_THEME: CSSProperties = {
  "--sa-bg": "#F4F6FB",
  "--sa-bg-top": "#DCE7FF",
  "--sa-card": "#FFFFFF",
  "--sa-line": "#EEF0F4",
  "--sa-ink": "#0B1220",
  "--sa-muted": "#6B7280",
  "--sa-blue": "#2F5BFF",
  "--sa-blue-soft": "#E6ECFF",
  "--sa-amber": "#8A5A00",
  "--sa-amber-soft": "#FFF4CC",
  "--sa-green": "#15803D",
  "--sa-green-soft": "#E9F7EF",
  "--sa-red": "#B42318",
  "--sa-red-soft": "#FDECEA",
} as CSSProperties;
