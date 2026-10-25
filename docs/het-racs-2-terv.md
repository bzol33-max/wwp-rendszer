# Hét nézet · Rács 2.0 — terv és fájl-tulajdon

> **Állapot (2026-10-25, audit E10):** megvalósult (`lib/fuvarozas2/heti-utemterv*.ts`). A fájl-tulajdon táblák már nem érvényesek.

Jóváhagyva: Budaházi Zoltán, 2026-10-17 („mehet”): az R1 kártya + R4 napi mérleg + R7 tartalék-jelző kombinációja
(„Hét nézet – 10 terv” vászon, Rács 2.0 oldal). Telefonra külön terv nem kell (a rács görgethető marad).
Kiegészítés (11:15): **a hétvégéket és ünnepnapokat keskeny sávval jelölni** a rácsban.
Csak ingyenes, regisztráció nélküli források (saját GPS/tachó előzmény, jogszabály). Nincs új tábla, nincs migráció.

## Mit lát a felhasználó

A meglévő Hét rács (gördülő ablak, `tervezes-het.ts`/`tervezes-het.tsx`) cellái:

- **Kártya fuvaronként (R1):** fejléc: megbízó + útvonal (`Nyírbátor → Budapest`); sorok:
  `◷ fel 07:00 → le ~12:40` (várható idők, ~ = becslés), `⇢ 265 km rakott · 35 üres` (az előtte lévő üres út),
  `135 000 Ft · 509 Ft/km` (bér; saját fuvarnál „saját” és nincs díj). Több napos fuvar: az első napon a felrakás,
  az utolsón a lerakás, köztes nap „↳ úton”.
- **Tartalék-jelző (R7):** a kártya jobb felső sarkában jelvény a legszűkebb megállóra: `+80 p` (zöld, ≥ 60 perc),
  `+15 p` (borostyán, 0–59), `−35 p` (piros, késik). Ha nincs időablak: nincs jelvény.
- **Napi mérleg (R4):** a cella alján szürke sáv: `végez ~18:30 · Szakoly`, `km 520 / 35`, `bér 135 e`, vezetés
  `8:50 / 9:00` csíkkal; ha a nap 15:00 előtt véget ér és marad ≥ 3 ó vezetés: borostyán „délután szabad · 7 ó 40 p
  vezetés →” link a réshez/ajánlathoz (ugyanaz a link, mint a szabad cellánál).
- **Napi pihenő:** ha a lánc napközben kifut a 9 órából: `■ napi pihenő ~18:15-től` a cellában, a folytatás másnap.
- **Kamionstop:** ha a lánc tilalmi ablakba ütközne: `■ kamionstop szo 22:00 – v 22:00` és a várakozás beszámít.
- **Hétvége/ünnep sáv (új):** ahol az ablak két oszlopa között nem munkanap van (szombat, vasárnap, ünnep), egy
  **keskeny (kb. 18–22 px) függőleges sáv** a két oszlop között, halvány csíkozással, függőleges felirattal
  (pl. „P ünnep · Szo · V” vagy „Szo · V”); a fejlécben is. Szombat/ünnep oszlop, ha fuvar van rajta, marad rendes
  oszlop (a gördülő ablak szabálya), de a fejléce halványan jelölve („Szo”, „ünnep”).

## Becslő motor — tiszta modul: `lib/fuvarozas2/heti-utemterv-alap.ts`

Idők: helyi Budapest „YYYY-MM-DDTHH:MM” szövegként (mint a `kamionstop.ts`), a perc-aritmetika DST-biztos helperrel
(a kamionstop.ts helperei újrahasznosíthatók — exportáld onnan, ha kell).

```ts
import type { TilalmiAblak } from "@/lib/fuvarozas2/kamionstop";

export type UtemMegallo = {
  tipus: "felrako" | "lerako";
  varos: string;
  nap: string;                 // tervezett nap "YYYY-MM-DD"
  ablakTol: string | null;     // helyi "YYYY-MM-DDTHH:MM"
  ablakIg: string | null;
  rakodasPerc: number;         // tanult vagy alapértelmezett
};
export type UtemFuvar = {
  id: string; cim: string; jelleg: "ber" | "sajat";
  dijFt: number | null;        // forintra váltva; saját: null
  megallok: UtemMegallo[];     // sorrendben, ≥ 1
  /** Menet a megállók között (megallok.length - 1 elem): perc és km. */
  szakaszok: { perc: number; km: number; becsles: boolean }[];
  /** Üres ráállás az előző pontról az első megállóig. */
  raallas: { perc: number; km: number; becsles: boolean };
};
export type UtemKezdes = {
  ido: string;                 // a lánc legkorábbi kezdése (pl. holnap 06:00, vagy most)
  folyamatosPerc: number;      // utolsó ≥45 p szünet óta vezetett
  napiPerc: number;            // ma már vezetett (tachóból: 540 − napi_hatra)
};
export type UtemParam = {
  napKezdes: string;           // "06:00" — egy új nap legkorábbi indulása, ha nincs ablak
  szunetUtanPerc: number; szunetPerc: number; napiMaxPerc: number; napiPihenoPerc: number; // 270/45/540/660
  tilalmak: TilalmiAblak[];
};

export type MegalloEredmeny = {
  tipus: "felrako" | "lerako"; varos: string;
  erkezes: string; kezdes: string; tavozas: string; varakozasPerc: number;
  tartalekPerc: number | null; // ablakIg − erkezes (percben); nincs ablakIg → null
};
export type FuvarEredmeny = {
  id: string;
  megallok: MegalloEredmeny[];
  rakottKm: number; uresKmElotte: number; dijFt: number | null; ftKm: number | null; // díj / rakott km, egészre
  legszukebbTartalek: number | null; // min(tartalekPerc), ha van
  becsles: boolean;                  // bármely szakasz becslés
};
export type NapMerleg = {
  nap: string;
  vegez: { ido: string; varos: string } | null;   // az aznapi utolsó távozás (ha aznap ér véget)
  rakottKm: number; uresKm: number;
  berFt: number;              // több napos fuvar: km-arányosan szétosztva a napokra
  vezetesPerc: number;
  napiPihenoTol: string | null; // ha aznap a lánc napi pihenőre áll meg útközben
  kamionstop: TilalmiAblak | null;
  delutanSzabad: { tol: string; maradekVezetesPerc: number } | null; // vegez < 15:00 és maradék ≥ 180
};
export type KocsiUtemterv = { fuvarok: FuvarEredmeny[]; napok: NapMerleg[] };

export function utemterv(fuvarok: UtemFuvar[], kezdes: UtemKezdes, p: UtemParam, napok: string[]): KocsiUtemterv;
```

Szabályok (mind teszttel):
1. A fuvarok a kapott sorrendben, egy láncban. Kezdő idő = `kezdes.ido`.
2. Egy fuvar első megállójához: indulás = max(előző távozás, a megálló napjának `napKezdes`-e); ráállás menet
   (`raallas.perc`) a vezetési szabállyal (`lib/fuvarozas/eta-lanc.ts` `vezetSzaballyal` logikája: 270 perc után 45 p
   szünet, 540 perc után 660 p napi pihenő), plusz kamionstop (`tilalmonAtugrik`): ha a menet tilalmi ablakba érne,
   megáll az ablak elején, az ablak végén folytatja (a várakozás ≥ 660 p → napi pihenőnek számít, a napi vezetés
   nullázódik).
3. Érkezés után, ha `ablakTol` későbbi: várakozás (≥ 45 p → szünetnek számít; ≥ 660 p → napi pihenő). Majd
   rakodás (`rakodasPerc`), távozás.
4. Megállók között a `szakaszok[i]` ugyanígy.
5. Napváltás: ha a napi pihenő vagy egy másnapi ablak miatt átcsúszik, az idők a valós napra esnek; a
   `NapMerleg` a ténylegesen arra a napra eső vezetést/km-t gyűjti (egy szakasz km-jét és perceit arányosan osztja,
   ha napi pihenő vágja ketté).
6. `tartalekPerc` = ablakIg − érkezés (negatív: késik). `legszukebbTartalek` = a legkisebb.
7. `berFt` napokra: a bérfuvar díja a rakott km arányában a napokra, amikre a rakott menet esik (egy napos: mind
   aznap).
8. `delutanSzabad`: az adott napon a lánc utolsó távozása < 15:00, és aznap nincs több fuvar, és
   `napiMaxPerc − vezetesPerc ≥ 180` → `{ tol: vegez.ido, maradekVezetesPerc }`.
9. `napok` a gördülő ablak napjai: csak ezekre ad `NapMerleg`-et (üres napra is: nullák, `vegez: null`).
10. Tiszta függvény: nincs I/O, nincs `Date.now()`.

## Betöltő (Dev B) — `lib/fuvarozas2/tervezes-het.ts` + `lib/fuvarozas2/heti-utemterv.ts` (server-only)

- `heti-utemterv.ts`: `szamoljUtemtervet(kocsik, ...)`: kocsinként az ablak (és az előtte lévő nyitott) fuvarjai a
  `napBelulFuzve` sorrendjében → `UtemFuvar[]`:
  - megállók: `fuvar_megallok` (tipus, telepules/cim_nyers, tervezett_nap, ablak_tol/ig → helyi idő), ha nincs
    megálló-sor: a fuvar fel/le (a megbízás `felrakas_ablak_tol/ig`, `lerakas_ablak_tol/ig`, `datum`, `lerakas_datum`).
  - rakodás: a tanult rakodási idő (`lib/fuvarozas/eta-lanc.ts` `tanultRakodas` + a `tanultRakodasIdok()` lekérdezés
    — ha az nem exportált az actions.ts-ből, emeld ki egy server-only helperbe, viselkedés-változás nélkül), különben
    a beállítás (`getFuvarBeallitasok()` rakodási puffer, ha van; különben 60 p).
  - menet: HU-GO útvonal (`calculateToll` a meglévő gyorsítótárral) × a kalibrációs szorzó (`szamitsKalibraciot`
    globális szorzója, ha elérhető, különben 1,15); egy szakasz 3 mp-en belül, a teljes számítás 6 mp-en belül, ami nem
    jön meg: légvonal × 1,3 és 65 km/h (`becsles: true`). Pontok: a megálló lat/lon, különben a meglévő geokódolás.
  - díj forintban: `dijFtban` (EUR árfolyammal).
  - kezdés: ha az ablak tartalmazza a mai napot: a kocsi mostani állapota (most, `legutobbiTacho()`
    `napi_hatra_perc` → `napiPerc = 540 − napi_hatra`, friss ≤ 15 perc; különben 0), egyébként az ablak első napja
    `napKezdes`. A kiindulópont: a kocsi utolsó ismert lerakója/telephelye (ugyanaz, mint a rés-számításé).
  - tilalmak: `tilalmiAblakok(ablak első napja − 1, utolsó + 1)`.
- `tervezes-het.ts`: a `TervezesHet.kocsik[]` elemei kapnak `utemterv: KocsiUtemterv | null` mezőt (hiba/időtúllépés
  → null, a rács a régi módon jelenik meg). A `napok` mellé `szunetSavok: { elott: string; cimke: string }[]`: a
  napok közti nem-munkanap szakaszok (a második oszlop napja előtt), címke pl. „P ünnep · Szo · V”; ehhez a
  `lib/jelenlet/shared.ts` `munkaszunetiNap`/`torvenyesUnnep`.

## Felület (Dev C) — `components/fuvarozas2/tervezes-het.tsx`

- A cella kártyái az `utemterv` alapján (R1), jelvény (R7), alul napi mérleg (R4), napi pihenő / kamionstop sor,
  délután szabad link. `utemterv == null` → a mostani megjelenés.
- Keskeny hétvége/ünnep sáv a `szunetSavok` szerint (fejlécben és a sorokban), halvány csíkozás
  (`repeating-linear-gradient`), függőleges felirat (`writing-mode: vertical-rl`), ~20 px.
- A design-tokenek a meglévők (`--f2-mint`, `--f2-blue`, `--f2-amb`, `--f2-red` és `-l` párjaik). Szám-formázás a
  meglévő segédekkel. Akadálymentes: a jelvénynek `title`/`aria-label` („80 perc tartalék a budapesti lerakásig”).

## Tesztek (Tesztelő, a kód előtt)

- `scripts/teszt-het-utemterv.ts`: a 10 szabályra; esetek: Gergő H (Nyírbátor → Bp, saját vissza, 8:50 vezetés),
  Gergő K (Kisvárda, délután szabad), Micó H→K (Tompaládony, Sárvár, napi pihenő útközben, kedd 10:00 körüli
  Debrecen), ablak miatti várakozás (szünetnek számít), késés (negatív tartalék), kamionstop szombat 22:00-nál,
  több napos díj szétosztás, üres nap merlege. Hozzáadás a `package.json` `teszt` láncához.
- `scripts/teszt-het-szunetsav.ts`: a `szunetSavok` számítás (tiszta részét Dev B a
  `lib/fuvarozas2/tervezes-het-alap.ts`-be teszi `szunetSavok(napok: string[])` néven): Cs 10.22. → H 10.26.: „P ünnep
  · Szo · V” a 10.26. előtt; P → H: „Szo · V”; nincs rés → üres.

## Fájl-tulajdon

| Ki | Fájlok |
|---|---|
| Tesztelő | `scripts/teszt-het-utemterv.ts`, `scripts/teszt-het-szunetsav.ts`, `package.json` (csak a `teszt` lánc) |
| Dev A | `lib/fuvarozas2/heti-utemterv-alap.ts` (+ ha kell, export-bővítés a `lib/fuvarozas2/kamionstop.ts`-ben) |
| Dev B | `lib/fuvarozas2/heti-utemterv.ts`, `lib/fuvarozas2/tervezes-het.ts`, `lib/fuvarozas2/tervezes-het-alap.ts` (csak `szunetSavok`), a tanult-rakodás/kalibráció kiemelése (`lib/fuvarozas/actions.ts` → új helper, viselkedés-változás nélkül) |
| Dev C | `components/fuvarozas2/tervezes-het.tsx` |
| Integrátor | `PROGRESS.md`, `lib/modules.ts`, ellenőrzések, élesítés (a tulajdonos igenjével) |
