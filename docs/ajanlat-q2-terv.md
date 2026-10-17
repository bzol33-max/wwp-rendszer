# Ajánlat oldal · Q2 — keresési javaslat a felszabaduló kocsikra

Budaházi Zoltán, 2026-10-17: „ha Gergő kedden délelőtt végez Kisvárdán, a vezetési
időkből legyen ajánlás ~3 viszonylatra, mit érdemes keresni. Cél: 2–3 kocsiba
alvás egy héten, a hét utolsó munkanapján üresen itthon (Szakoly). A bevétel
növelése a cél.” Forrás: jól fizető irányok, saját múlt, Timocom, hazafelé.
Választott terv: **Q2 · Kocsik időrendben, ahogy kiürülnek** (tervvászon „ajanlat2”).
Az útdíj-kalkulátor (KozosKalkulator) változatlanul marad.

## Felület (app/fuvarozas2/timocom)

1. Fejléc, fülek, Timocom-befogadó — változatlan.
2. **Kocsikártyák** (legfeljebb 4 oszlop, balról jobbra a felszabadulás sorrendjében):
   kocsiszínű felső csík, sofőr, „kedd 08:37 · Kisvárda”, alatta
   „7:38 vezetés aznap · haza: péntek”. Kártyánként legfeljebb 3 irány-sor:
   betű (A/B/C), irány neve („Budapest felé”), egy sor tény
   („+45 km ráállás · ~1 éj kint · péntekre haza ✓”), várható díj, forrás
   („3 korábbi · 1 Timocom”) és egy **keres** gomb.
3. A **keres** gomb (`?kocsi=…&irany=…#kereses`) kiválasztja az irányt: alatta
   egy sáv mutatja a Timocom-keresés szövegét, az illő nyitott Timocom-ajánlatokat
   (link a `?id=`-re), a „kit hívjak” listát (saját múlt), és a kalkulátor a szabad
   hellyel és az irány városával kitöltve nyílik.
4. Kiválasztott Timocom-ajánlatnál (`?id=`) a mostani ajánlat-kártya + kalkulátor.
5. Timocom-lista — változatlan.

## Számítás (lib/fuvarozas2/kereses-javaslat-alap.ts, tiszta)

- **Felszabadulás**: a Hét-ütemterv (getTervezesHet → kocsik[].utemterv) utolsó
  valódi fuvarjának (nem `bej:`) utolsó megállója: idő, város, pont (a hét cellájából).
  Ha ez már elmúlt vagy nincs fuvar: ma, most, az utolsó lerakónál / telephelyen.
  Aznapi vezetés hátra: 540 − az aznapi tervezett vezetés.
- **Haza-nap**: a felszabadulás hetének utolsó munkanapja; ha előtte sofőr-távollét
  jön, a távollét előtti munkanap. Ha a felszabadulás napja = haza-nap → csak hazafelé.
- **Jelöltek**: saját bérfuvarok (365 nap) és nyitott Timocom-ajánlatok, amelyek
  felrakója ≤ 80 km (Timocom ≤ 120 km) a szabad helytől; Timocomnál a felrakás napja
  a szabad nap vagy az utána következő (vagy ismeretlen).
- **Irányok**: a jelöltek lerakói 50 km-es csoportokba; név: a leggyakoribb lerakó-város.
  Csoportonként: db (múlt, Timocom), medián díj, medián Ft/km, ráállás, rakott km,
  haza km. Vezetés = (ráállás + rakott + haza km) / 60 km/h + 1 ó rakodás.
  Napok: az első nap maradék vezetése, utána 9 ó/nap → éjszaka kint = napok − 1.
  Hazaér: a napok száma belefér a haza-napig. Pontszám (bevétel-fókusz):
  (várható díj − (ráállás + rakott km) × km-költség) / a célig tartó napok — a hazautat nem vonjuk le (onnan a következő fuvart keressük), az csak a „hazaér” feltétel.
- **Választás (≤ 3)**: legjobb pontszám („több pénz”), leggyakoribb („gyakori”,
  Timocom duplán számít), legjobb hazafelé tartó (lerakó ≤ 60 km Szakolytól vagy
  ≥ 50 km-rel közelebb hazához) — ha nincs, „Üresen haza” sor. Pótlás pontszám szerint.
  Csak hazafelé, ha a szabad nap a haza-nap. Ami nem ér haza időben, „péntekre nem ér
  haza” jelzéssel hátra kerül.
- Szám csak valós adatból; adat nélkül „—”, és a kártya kiírja: „innen még nem volt fuvarunk”.

## Teszt

`scripts/teszt-kereses-javaslat.ts` (tiszta logika), a `npm test` láncban.
