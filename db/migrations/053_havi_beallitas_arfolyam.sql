-- Megbízások „Kocsi-sínek” nézet (2026-11-18, Budaházi Zoltán, Q5b-F terv):
-- kézi havi kiadás és havi cél a havi sávhoz („később részletezzük, most egy összeg”).
-- Az EUR → Ft a meglévő `arfolyam` táblából megy (001, lib/fuvarozas/arfolyam.ts).
create table if not exists fuvar_havi_beallitas (
  ev          int not null,
  ho          int not null check (ho between 1 and 12),
  kiadas_ft   bigint,
  cel_ft      bigint,
  updated_by  text,
  updated_at  timestamptz not null default now(),
  primary key (ev, ho)
);
