# archive/

Kivezetett, de megőrzött fájlok (audit 2026-10). Nem része a buildnek
(`tsconfig.json` exclude, eslint ignore) — a fájlok az eredeti útvonalukon
vannak az `archive/` alatt, így `git log --follow` mutatja az előzményüket.

| Fájl | Mikor | Miért |
|---|---|---|
| `lib/auth/api-guard.ts` | 2026-10-25 | Egyetlen route sem használta: mindegyik saját őrt hív (`irat-jog.ts`, `drive-sync-guard.ts`). Audit D2. |
