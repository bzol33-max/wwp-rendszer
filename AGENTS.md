<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Mobil felület — kötelező konvenciók (2026-09-10)

Minden ÚJ, önálló, mobilra tervezett nézet (pl. `/felvasarlas`, és minden
ezután készülő hasonló oldal) az alábbi két dolgot kapja meg alapból:

1. **Menta-antracit színséma** — `lib/mobil-theme.ts` `MOBIL_THEME` (a
   `--mob-*` CSS egyéni tulajdonságok), ugyanaz a paletta, amit Budaházi
   Zoltán is választott az Áttekintés modulhoz (`lib/attekintes/theme.ts`).
   A gyökér elemre kell tenni (`style={MOBIL_THEME}`), a színeket pedig
   Tailwind tetszőleges érték szintaxissal kell olvasni
   (pl. `bg-[var(--mob-bg)]`, `text-[var(--mob-text)]`).
2. **Lehúzásra frissítés** — `components/mobil/pull-to-refresh.tsx`
   `PullToRefresh` görgethető tartalom-wrapper, natív app-szerű "húzd le a
   tetejéről" gesztussal (`router.refresh()`-t hív).

Lásd `components/felvasarlas/felvasarlas-mobil-view.tsx` mint referencia-
megvalósítás. A meglévő önálló mobil nézetek (`/mobil`, `/posta`, `/erkezes`)
is át lettek állítva erre a sémára (2026-09-10) — a MovementForm/
InventoryDialog kivétel, mert azok a desktop Készlet modullal közösek, azokat
nem szabad átszínezni.
