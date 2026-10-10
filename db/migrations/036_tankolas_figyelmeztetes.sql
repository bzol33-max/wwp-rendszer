-- Tankolás: figyelmeztetés a gyanús sorokhoz (2026-10-10, költség-javítás).
-- CSAK ADDITÍV. Ha az Oplusz-értesítőből kiolvasott liter valószínűtlen
-- egységárat adna (300–1200 Ft/l-en kívül), az összeg megmarad, a liter
-- üres, és ide kerül az ok — a Költségek oldal megjelöli a sort.
alter table tankolas add column if not exists figyelmeztetes text;
