-- Munkamenet-visszavonás (audit 2026-10-04, SEC-8). A JWT-be bekerül a
-- felhasználó session_verzio-ja; a verifySession csak egyező verziót fogad el.
-- Jelszócserénél a verzió nő, így a régi (akár ellopott) süti azonnal
-- érvénytelen. A meglévő sütikben nincs verzió — azokat 0-nak vesszük, és a
-- kezdőérték is 0, tehát a bevezetéskor SENKINEK nem kell újra belépnie.
alter table users add column if not exists session_verzio integer not null default 0;
