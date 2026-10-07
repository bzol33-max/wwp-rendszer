alter table fuvar_megbizasok add column if not exists legkorabban date;
alter table fuvar_megbizasok add column if not exists idopont_nyitott boolean not null default false;

create index if not exists idx_fuvar_megbizasok_elvinni_valo
  on fuvar_megbizasok (legkorabban, created_at)
  where jelleg = 'sajat' and elokeszites and idopont_nyitott and torolt_at is null;
