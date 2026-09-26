-- Saját fuvar: kitől (Budaházi Zoltán, 2026-09-26) — ki adja az árut, a
-- „kinek” (megrendelo) párja. Csak szöveg, nem köt partnerhez (a partner-
-- kötés a „kinek”-é), csak a saját fuvar űrlapja írja.
alter table fuvar_megbizasok add column if not exists kitol text;
