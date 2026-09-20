-- Külső (HU-GO, Nominatim) válaszok tartós gyorsítótára — T1/T3/T13/T16.
--
-- MIÉRT: a Kalkulátor, az idővonal-újraláncolás és a tervezés ugyanazokra az
-- útvonalakra kéri újra és újra az állami útdíjkalkulátort; a mai egy perces
-- folyamat-cache minden pipánál ürül, és több instance esetén amúgy sem
-- közös. Így az ellenőrzés becslése szerint napi 10–15 ezer hívás menne egy
-- kulcs nélküli, dokumentálatlan, rate limit nélküli külső végpontra — ez
-- előbb-utóbb kizárást vagy hibát hoz.
--
-- MIT NEM CSINÁL: nem változtat az eredmény jelentésén. A kulcs tartalmazza
-- az összes paramétert (jármű-kategória, euro, tömeg, geometria kérése,
-- megállók), ezért két különböző kérés soha nem oszthat egy soron. A lejárt
-- sorok kiesnek, és a hívó ugyanúgy friss választ kap.
create table if not exists kulso_valasz_cache (
  kulcs        text primary key,
  szolgaltato  text not null,
  valasz       jsonb not null,
  letrehozva_at timestamptz not null default now(),
  lejar_at     timestamptz not null,
  talalat      integer not null default 0
);
create index if not exists idx_kulso_valasz_cache_lejar on kulso_valasz_cache (lejar_at);
create index if not exists idx_kulso_valasz_cache_szolgaltato on kulso_valasz_cache (szolgaltato, letrehozva_at desc);
