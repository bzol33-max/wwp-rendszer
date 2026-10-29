# Redesign – 2. modul: Számlák · Teendők fül (W1 terv)

Branch: `redesign/2-teendok` (main-ről). NE pusholj, NE deployolj.
Csak a Teendők fül megjelenése + oszloponkénti összesítők. A „Fizetve?” gomb (5 perces visszavonással), a „részben fizetve” jelölés,
a kontókivonat-párosítás, a szinkron, a többi fül, az adatmodell NEM változik. Fizetési emlékeztető funkciót NEM építünk.
Adatbázis: csak olvasó select. Séma, migráció, írás tilos.

## A W1 terv (jóváhagyva)
Két oszlop: **Fuvar** | **Raklap** (ahogy most). Minden oszlop egy kártya, benne felülről:
1. Fejléc: oszlop neve (18 px félkövér) + jobbra „N nyitott” (szürke).
2. **3 szám-csempe egy sorban**: `Kint` (összeg, fekete) · `Lejárt · N db` (összeg, piros #E5172F) · `7 napon belül · N db` (összeg, narancs #D97706).
   Halvány háttér (#F2F5FA vagy a muted token), radius 12, szám 18 px félkövér tabular-nums.
3. **Lejárt korosítás**: egy 8 px magas vízszintes sáv három szegmenssel arányosan az összeg szerint – `1–30 nap` narancs #D97706, `31–60 nap` piros #E5172F, `60+ nap` sötétpiros #A0001C;
   alatta jelmagyarázat: pötty + „1–30 nap · 714 000 Ft (2 db)” mindhárom sávra (a 0-s is látszik). Ha nincs lejárt: a sáv helyett szürke „Nincs lejárt számla”.
4. **Lejárt · N** szakasz (piros cím, jobbra az összeg), alatta a meglévő táblázat (Határidő · Vevő+sorszám · Összeg · Állapot · Fizetve?).
5. **Következő 10 lejárat** szakasz ugyanígy.
Az oszlop-kártya belül görgethető, ha nem fér ki, a csempék + korosítás fent maradnak (sticky).

## Számítás
- Pénznem: a csempék és a korosítás **HUF** (a meglévő `HATRALEK_SQL`-lel, részfizetéssel csökkentve). Ha az oszlopban van nyitott nem HUF számla, a `Kint` csempe alá kis szürke sor: „+ X EUR külön”.
- Kategória: Fuvar = `kategoria='fuvar'`, Raklap = `kategoria='raklap'` (mint most a Teendőknél). A felső mappa-szűrő (Mind/Fuvar/Fabrika/Keter/Egyéb) viselkedése nem változik.
- Lejárt napok = ma (Europe/Budapest, a meglévő `MA_SQL`) − `fizetesi_hatarido`; 1–30 / 31–60 / 61+.
- Új olvasó szerver-akció a meglévők mellé, pl. `getSzamlaTeendoOsszesito()` → kategóriánként: nyitott_osszeg/darab, lejart_osszeg/darab, het_osszeg/darab (ma..ma+7, mint `getSzamlaFejlec`), korosítás 3 sávja (összeg+darab), nem-HUF nyitott összeg pénznemenként. A meglévő akciókat ne módosítsd.

## Stílus
- Kártyák a 0c tokenekkel (`--shadow-card`, `--hi`), szövegszínek #1D1D1F / #48484A / #6E6E73, 12 px alatt semmi, számok `tabular-nums`.
- Állapot-szövegek: lejárt piros, 0–3 napon belül narancs, egyébként szürke (ahogy most, ha már így van, ne változtasd).
- A Számlák modul saját témája (`.szamlak`) marad; a fenti piros/narancs színeket közvetlenül add meg.

## Ellenőrzés és lezárás
- `npx eslint` a módosított fájlokra, `npx tsc --noEmit` (a `helyi/` hiba figyelmen kívül hagyható), `git diff --stat`.
- Buildet és böngészős ellenőrzést NE – azt a felügyelő végzi.
- Commit (a feladatleírással együtt): `redesign 2: Számlák · Teendők (W1: oszloponként 3 szám + lejárt-korosítás)`. PROGRESS.md egy sor.
- A végén röviden: módosított fájlok, a lekérdezés leírása, futtatott parancsok, nyitott kérdések.
