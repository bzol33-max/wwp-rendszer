# Hét nézet B1 — kocsiszín, nem-fuvar bejegyzés, szabadnap a Jelenlétből

Döntés: Budaházi Zoltán, 2026-10-17 („B1, B3 bevitelével”), a terv-vászon
„A2 tovább” oldaláról. Az oldal: `/fuvarozas2/tervezes` (Hét).

## Mi változik

1. **Kocsiszín** — a jármű törzsadatban beállított szín (`fuvar_jarmuvek.szin`:
   blue / yellow / green / purple) megjelenik:
   - a kocsi során bal oldali 4 px-es csíkként és a kocsi neve előtti betű-jelvényen,
   - minden fuvar-kártyán bal oldali 3 px-es csíkként (a kártya fehér),
   - az oldalsáv kocsinkénti sávjain és listáin.
   A fuvar típusa (bér / saját) innentől egy kis **BÉR / SAJÁT** címkéből látszik
   (a zöld kocsiszín és a régi „bérfuvar = zöld” különben összekeveredne).
2. **Bejegyzés** (nem megbízás): szerviz, gumis, mosás, műszaki vizsga,
   tachó-kalibrálás, egyéb. Egy kocsi egy napjára, időtartammal (tól–ig) vagy
   egész napra, hellyel, megjegyzéssel, opcionálisan **hetente ismétlődve**
   (meddig: dátum vagy nyitott).
   - Szürke kártya ikonnal a cellában, időrendben a fuvarok mellett.
   - Felvitel: „+ Bejegyzés” gomb a lap tetején, vagy kattintás egy „szabad”
     cellára (a kocsi és a nap előre kitöltve). Az ablak a B3 terv szerint:
     típus-csempék, tól/ig vagy egész nap, hely, megjegyzés, ismétlődés; ha a
     becslő tudja, kiírja, mikor és hol végez aznap a kocsi.
   - Törlés: a kártya × gombja (ismétlődőnél az egész sorozat törlődik — v1).
   - Hatás: egész napos bejegyzés vagy olyan, ami 12:00 után is tart → az a nap
     nem „szabad”, és a „délután szabad” link nem jelenik meg.
3. **Szabadnap a Jelenlétből** — a kocsihoz rendelt sofőr (`fuvar_jarmuvek.sofor_id`)
   `jelenletek.day_type = 'szabadsag' | 'beteg'` napjai. Csíkozott cella a
   kocsi színében, lakat, „Szabadság / Betegszabadság · Jelenlétből · ne tervezz”.
   A nap nem „szabad”, nincs „délután szabad”. Ha mégis van aznap fuvar:
   piros figyelmeztetés a cellában („a sofőr szabadságon van”).
   Forrás csak olvasva — a Jelenlét modul nem változik.
4. **Oldalsáv teteje: heti / havi összefoglaló** (A2) a meglévő
   `getKihasznaltsag(ma)` adatából (hét / hónap kapcsoló): bérbevétel,
   átváltatlan €, fizetős kocsinap, üres km aránya, kocsinként sáv a kocsi
   színében. Alatta „Nem fuvar a héten” és „Távollét · Jelenlétből” lista az
   ablak napjaira. Az ajánlat-listák változatlanul alatta maradnak.
5. **A mai oszlop szélesebb** (E1), a többi változatlan (gördülő ablak: egy
   munkanap vissza + előre, marad).

## Nem része (később)

- A bejegyzés még NEM tolja el a becslő (ETA) idejeit — csak a szabad
  kapacitás-jelzést veszi el. Következő lépés: a bejegyzés mint fix megálló az
  ütemtervben.
- Ismétlődő sorozatból egy alkalom törlése.

## Adat

`fuvar_bejegyzesek` (db/schema.sql, idempotens):
`id, jarmu_kod, tipus, nap, tol, ig, hely, megjegyzes, ismetles ('nincs'|'heti'), ismetles_ig, letrehozta, created_at, torolt_at`.
`tol` és `ig` vagy mindkettő üres (egész nap), vagy mindkettő kitöltve és `ig > tol`.

## Kód

- `lib/fuvarozas2/bejegyzes-alap.ts` — tiszta: típusok, ellenőrzés, ismétlődés kibontása, nap-foglaltság.
- `lib/fuvarozas2/kocsi-szin.ts` — tiszta: JarmuSzin → szín, halvány, sötét.
- `lib/fuvarozas2/bejegyzes-actions.ts` — server action: új, törlés (`fuvarozas` szerkesztési jog).
- `lib/fuvarozas2/tervezes-het.ts` — bejegyzések, távollétek, szín, összegzés a lap adatában.
- `components/fuvarozas2/tervezes-het.tsx`, `het-bejegyzes.tsx` (kliens: ablak, törlés), `het-osszegzes.tsx` (kliens: hét/hónap kapcsoló).

## Tesztek

`scripts/teszt-bejegyzes.ts`: ellenőrzés (típus, nap, tól/ig, hossz, ismétlődés),
kibontás az ablak napjaira (heti ismétlés, vége, kezdet előtt nincs, törölt nincs),
rendezés (egész nap elöl, aztán tól szerint), nap-foglaltság (távollét / egész nap /
12 után tartó → foglalt; reggeli → nem), színpaletta (ismeretlen → szürke).
