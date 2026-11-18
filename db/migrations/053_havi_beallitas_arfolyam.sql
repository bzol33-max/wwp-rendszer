-- Megbízások „Kocsi-sínek” nézet (2026-11-18, Budaházi Zoltán, Q5b-F terv):
-- 1) kézi havi kiadás és havi cél a havi sávhoz („később részletezzük, most egy összeg”),
-- 2) MNB napi árfolyam-cache: az EUR-os fuvardíj a számla keltének árfolyamán
--    számít Ft-ra (lib/fuvarozas2/arfolyam.ts).
create table if not exists fuvar_havi_beallitas (
  ev          int not null,
  ho          int not null check (ho between 1 and 12),
  kiadas_ft   bigint,
  cel_ft      bigint,
  updated_by  text,
  updated_at  timestamptz not null default now(),
  primary key (ev, ho)
);

create table if not exists arfolyam (
  nap      date not null,
  penznem  text not null,
  ertek    numeric(12,4) not null,
  forras   text not null default 'MNB',
  primary key (nap, penznem)
);
