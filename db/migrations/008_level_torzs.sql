-- A megbízást kísérő levél szövege (2026-09-25). Az EUCARGO a megbízás
-- PDF-jében csak annyit írt: „részletes felrakási adatokat emailben
-- küldöm” — a 4 felrakó és 10 lerakó a levélben volt, a rendszer viszont
-- csak 400 karakteres kivonatot kapott. A Gmail-figyelő ezentúl a
-- MEGBÍZÁSNAK osztályozott levelek teljes szövegét is beküldi.
alter table fuvar_level add column if not exists torzs text;
alter table fuvar_level add column if not exists torzs_at timestamptz;

-- A megbízás újraolvasva a kísérő levéllel (vagy a felvételkor már azzal
-- olvastuk) — lib/fuvarozas/drive-sync-core.ts levelSzovegPotlasa.
alter table fuvar_megbizasok add column if not exists level_kiegeszitve_at timestamptz;
