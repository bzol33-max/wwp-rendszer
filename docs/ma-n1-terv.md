# Ma oldal · N1 kocsikártya (ma + holnap)

> **Állapot (2026-10-25, audit E10):** megvalósult (a409049), majd 2026-10-21-én felülírta a metró-vonalas kártya (`components/fuvarozas2/ma-metro.tsx`, `lib/fuvarozas2/ma-metro-alap.ts`); a `ma-kartya-alap.ts` még használatban van.

Döntés: Budaházi Zoltán, 2026-10-17 („N1”), a terv-vászon „M2 tovább” oldaláról.
Oldal: `/fuvarozas2` (Kocsik → Ma).

- **2×2 kártya** a négy kocsi-oszlop helyett (széles kártya, a megálló-tükör elfér).
- **Kocsiszín** (törzsadat `szin`): színes fejléc felső csíkkal, betű-jelvény (mint a Hét B1).
- **Figyelmeztető szalag** a fejléc alatt (`kocsiJelzesek`, `lib/fuvarozas2/ma-kartya-alap.ts`):
  a kocsi aktív eltérései (várakozik / késés / csúszik, hellyel); távollét ma vagy holnap
  (Jelenlét; piros, ha mégis van fuvar); „ma nincs fuvar” (munkanapon, egész napos bejegyzés és
  távollét nélkül); „holnapra még nincs fuvar” (ha nem folytatódik a mai, és nincs egész napos
  bejegyzés / távollét). Piros elöl.
- **Tachó-csík:** a napi vezetési keretből hátralévő idő (Ecofleet tachó, ha friss).
- **Ma / holnap:** a meglévő megálló-tükör és holnapi blokkok, előttük a távollét és a bejegyzések
  (szerviz, gumis, mosás … — a Hét nézetben felvitt `fuvar_bejegyzesek`).
- **Lábléc:** ma km (GPS) és a papír / számla teendők.
- **Az iroda számai** (ellenőrzésre vár, postára vár, számlázandó, fotó, kintlévőség, holnapi
  megbízás, kocsi nélkül, ütközés) egy sorban a kártyák fölé kerültek (eddig lent egy dobozban).
- Ami maradt: „Döntésre vár” sor, visszfuvar-riasztás, kocsi-sávok, eltérés-sáv, „Kocsi nélkül” doboz.

Teszt: `scripts/teszt-ma-kartya.ts`.
