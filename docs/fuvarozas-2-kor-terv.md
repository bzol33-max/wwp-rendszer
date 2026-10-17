# Fuvarozás 2. kör — kocsi-központú felépítés (B) — terv és fájl-tulajdon

Jóváhagyva: Budaházi Zoltán, 2026-10-16 („ok, mehet minden”: B változat) és 2026-10-17 („haladjunk a fejlesztéssel tovább”).
Döntési anyag: „Fuvarozás 2.0 terv” artifact, 1. döntés / B.

## Cél

Három főfül: **Kocsik · Megbízások · Pénz** (+ ⚙ Rendszer). Minden kocsi egy **sáv**: hol van, tachó, futó fuvar
haladása (következő megálló, ETA, ablak, késés), heti bevétel és üres km %, a következő szabad nap / rés és onnan
egy kattintás az ajánlathoz. A sávra kattintva a **kocsi lapja**: a nap megállói terv és tény szerint, a kocsi hete,
kihasználtság, telemetria. A pénz-számok (bérfuvar havi/heti csempék, kihasználtság-sáv) a **Pénz** fülre kerülnek.

NEM cél most: új adatforrás, új tábla, migráció, a Megbízások fül átalakítása, a Tervezés/Timocom lapok
logikájának változtatása. Minden régi URL él (a meglévő címek maradnak, csak a fülsor címkéi változnak).

## Navigáció (Dev C)

`components/fuvarozas2/fulek.tsx` FOFULEK:

| főfül | kulcs | alfülek (href → címke) |
|---|---|---|
| Kocsik | `kocsik` | `/fuvarozas2` → „Ma”, `/fuvarozas2/tervezes` → „Hét”, `/fuvarozas2/timocom` → „Ajánlat” |
| Megbízások | `megbizasok` | változatlan (Lista, Levelek, Partnerek) |
| Pénz | `penz` | `/fuvarozas2/eredmeny` → „Áttekintés”, `/fuvarozas2/kimutatas` → „Kimutatás”, `/fuvarozas2/koltsegek` → „Költségek” |

A jogosultsági jelölések (`csakFuvarozas`) változatlanok. A `/fuvarozas2/kocsi/[kod]` lap a „Kocsik” főfül alá
tartozik (aktív főfül: Kocsik). Az oldalcímek (`cim` prop): „Ma”, „Hét”, „Ajánlat”, „Pénz” stb. — a lapok
`Fuvarozas2Fulek aktiv=… cim=…` hívásait Dev C igazítja (a `/fuvarozas2` és a kocsi lap kivétel: azokat A ill. B írja).
`lib/modules.ts` fuvarozas `description`: az új felépítés szerint.

## Pénz → Áttekintés (Dev C)

A `Csempesor` (bérfuvar október / 42. hét / Km-díj csempék + Kihasználtság Hét|Hónap) átkerül a Ma lapról az
`/fuvarozas2/eredmeny` lap tetejére, a meglévő `EredmenyNezet` fölé. Adat: a `getMaVaszon()` belsejéből
kiemelt, önálló `getBerOsszesitok(): Promise<{ berHavi; berHeti; berHonapHetei }>` (lib/fuvarozas2/ma-vaszon.ts,
viselkedés-változás nélkül — a getMaVaszon tovább hívja és tovább adja ugyanazokat a mezőket), plusz
`getKihasznaltsag(ma)` (meglévő). A Ma lap ezeket már nem rajzolja (Dev A veszi ki a `ma-vaszon.tsx`-ből).

## Kocsi-sáv (Dev A) — tiszta logika: `lib/fuvarozas2/kocsi-sav-alap.ts`

```ts
import type { MaKocsiAllapot } from "@/lib/fuvarozas2/ma-vaszon";      // csak típus
import type { TukorSor } from "@/lib/fuvarozas2/ma-tukor";             // csak típus
import type { NapCella, Res } from "@/lib/fuvarozas2/tervezes-het-alap";
import type { Kihasznaltsag } from "@/lib/fuvarozas2/kihasznaltsag-alap";

export type KocsiSavBemenet = {
  kod: string;                     // pl. "AOPU-427"
  sofor: string;                   // pl. "Gergő"
  helykitolto: string | null;      // MaKocsi.helykitolto (nem üzemel → nem null)
  allapot: MaKocsiAllapot | null;  // { szoveg, szin, hely }
  hetiSor: string | null;          // MaKocsi.hetiSor („Tachó: ma még 2 ó 40 p · hét 31/56 ó”)
  sorok: TukorSor[];               // MaKocsi.sorok (mai megállók tükörben)
  holnap: { partner: string; utvonal: string }[];  // MaKocsi.holnap (MaBlokk) partner+utvonal
  het: (Kihasznaltsag & { berBevetelFt: number }) | null;  // KihasznaltsagAdat.kocsik[kod].het
  ma: string;                      // "YYYY-MM-DD"
  hetKezdet: string;               // a tervezes-het hétfője ("YYYY-MM-DD")
  cellak: NapCella[];              // TervezesHet.kocsik[kod].cellak (vagy [] ha nincs)
  resek: Res[];                    // TervezesHet.resek, ennek a kocsinak (kocsi === kod)
};

export type KocsiSav = {
  kod: string;
  sofor: string;
  uzemel: boolean;                 // helykitolto === null
  helykitolto: string | null;
  allapot: { szoveg: string; szin: "mint" | "amber" | "red" | "normal" } | null;
  hely: string | null;             // allapot?.hely ?? null
  tacho: string | null;            // hetiSor
  futo: null | {
    fuvarId: string;
    partner: string;
    jelleg: "ber" | "sajat";
    keszDb: number;                // a fuvar kész megállói
    osszDb: number;                // a fuvar összes megállója (ma látható)
    kovetkezo: null | {
      felLe: "felrako" | "lerako";
      varos: string;
      terv: string | null;
      teny: string | null;         // pl. „ETA 13:20”
      elteres: string | null;
      kesik: boolean;              // kiemelt === "kesik"
    };
  };
  kovetkezoFuvar: { partner: string; utvonal: string } | null;  // ha nincs futó: holnap[0]
  hetSzamok: null | { bevetelFt: number; uresSzazalek: number | null; fedezetPerNap: number | null };
  szabad: null | { nap: string; cimke: string; honnan: string | null; resKulcs: string | null; km: number | null };
  ajanlatHref: string;
};

export function kocsiSav(b: KocsiSavBemenet): KocsiSav;
export function napCimke(nap: string, ma: string): string;
```

Szabályok:

1. **futo**: a `sorok` „megallo” sorai fuvarId szerint csoportosítva, a sorok eredeti sorrendjében. Futó fuvar az
   ELSŐ olyan fuvar, amelynek van `allapot === "most"` vagy `"kovetkezo"` megállója. `partner` és `jelleg` a hozzá
   tartozó `tipus: "fuvar"` sorból (ha nincs ilyen sor: partner `""`, jelleg `"ber"`). `keszDb` = a fuvar
   `allapot === "kesz"` megállói, `osszDb` = a fuvar összes megállója. `kovetkezo` = a fuvar első `"most"` megállója,
   ha nincs, az első `"kovetkezo"`. Ha nincs ilyen fuvar (minden kész, vagy nincs sor): `futo = null`.
2. **kovetkezoFuvar**: csak ha `futo === null` és `holnap.length > 0` → `holnap[0]`; különben `null`.
3. **hetSzamok**: `het` null → null; különben `{ bevetelFt: het.berBevetelFt, uresSzazalek: het.uresKmSzazalek,
   fedezetPerNap: het.fedezetPerNap }` (a kihasznaltsag-alap számait NEM számoljuk újra).
4. **szabad**: a `cellak` közül az első, amelyik `nap >= ma` ÉS (`szabad === true` VAGY van `resek` eleme ugyanarra a
   napra). Ha az a nap résből jön (van ugyanarra a napra rés): `resKulcs`, `honnan`, `km` a legelső ilyen rés
   `kulcs`/`honnan`/`km` mezője; ha csak szabad cella: `honnan = null`, `resKulcs = null`, `km = null`. A rés-napot és
   a szabad napot egyformán kezeljük — a korábbi nap nyer. Ha nincs ilyen nap: `null`. `cimke = napCimke(nap, ma)`.
5. **napCimke**: `nap === ma` → „ma”; `ma + 1 nap` → „holnap”; különben rövid magyar nap + hónap.nap, pl.
   „Cs 10.22.” (H, K, Sze, Cs, P, Szo, V — ugyanaz a jelölés, mint a Tervezés fejlécében).
6. **ajanlatHref**: van `szabad.resKulcs` → `/fuvarozas2/tervezes?het=${hetKezdet}&res=${encodeURIComponent(resKulcs)}`;
   különben `/fuvarozas2/tervezes?het=${hetKezdet}`.
7. **uzemel**: `helykitolto === null`. Nem üzemelő kocsinál (`JANI`) `futo`, `kovetkezoFuvar`, `szabad` mind `null`,
   `hetSzamok` is `null`, `ajanlatHref` a fenti 6. szerint.
8. Tiszta függvény: nincs I/O, nincs `Date.now()` (a dátum a `ma` bemenetből).

## Kocsi-sáv betöltő és felület (Dev A)

- `lib/fuvarozas2/kocsi-sav.ts` (`import "server-only"`, NEM "use server"): `getKocsiSavok(vaszon: MaVaszon):
  Promise<{ savok: KocsiSav[]; dontesreVar: { bejovo: number; kocsiraVar: number } }>`. A `getTervezesHet()`
  (paraméter nélkül: a mostani hét) eredményét **2,5 mp időkorláttal** várja; időtúllépés/hiba → `cellak: []`,
  `resek: []` (a sáv akkor is megjelenik, csak szabad nap nélkül). Soha nem dob. `bejovo`: a döntésre váró
  bérmegbízások száma (ugyanaz a feltétel, mint a Tervezés „Bejövő megbízások — döntés” listájában — a lekérdezést
  a `lib/fuvarozas2/tervezo.ts`-ből kell venni, egy `count(*)`-ként); `kocsiraVar`: `vaszon.kocsiNelkul.length`.
- `components/fuvarozas2/kocsi-savok.tsx`: kártyánként egy kocsi (a meglévő kártya-stílussal: `rounded-2xl border
  bg-card`, kocsi-szín pötty a `findJarmuByKod` szerint). Fej: sofőr + rendszám, állapot-szöveg, hely, tachó.
  Futó fuvar: partner, „1/2 megálló kész”, következő megálló: felrakás/lerakás + város + terv + tény + eltérés,
  késésnél piros. Ha nincs futó: „Következő: <partner> <útvonal> (holnap)” vagy „Szabad”. Láb: „Hét: 235 e Ft ·
  üres 16 % · fedezet/nap −95 e” és a szabad nap: „Szabad: Cs 10.22. (Budapest → 276 km üres) → ajánlat”. A kártya
  fejére kattintva `/fuvarozas2/kocsi/${encodeURIComponent(kod)}`. Fölötte egy „Döntésre vár” sor, csak ha
  `bejovo + kocsiraVar > 0`: „Döntésre vár: 2 bejövő megbízás · 1 kocsira vár” → `/fuvarozas2/tervezes`.
  Mobilon (≤ 640 px) egy oszlop, szélesebben kettő.
- `app/fuvarozas2/page.tsx`: fülsor (aktív: `/fuvarozas2`, cím „Kocsik”) → Döntésre vár → sávok → a meglévő
  `MaVaszonNezet` (a részletes mai nézet, változatlanul, a Csempesor nélkül).
- `components/fuvarozas2/ma-vaszon.tsx`: a `Csempesor` sor törlése (más változtatás nincs).

## Kocsi lapja (Dev B) — `/fuvarozas2/kocsi/[kod]`

- `app/fuvarozas2/kocsi/[kod]/page.tsx` + `components/fuvarozas2/kocsi-lap.tsx` + `lib/fuvarozas2/kocsi-lap.ts`
  (server-only betöltő). Jogosultság: `requireViewPermission("fuvarozas")` (mint a Ma lapé). Ismeretlen kód → 404
  (`notFound()`).
- Tartalom, felülről lefelé:
  1. Fej: sofőr, rendszám, állapot, hely, tachó (a `getMaVaszon().kocsik` megfelelő eleméből), „← Kocsik” link.
  2. **Ma**: a kocsi `sorok` tükre — a meglévő Ma-kártya renderelését kell újrahasználni (a `ma-vaszon.tsx`-ből
     exportálni a kocsi-kártya komponenst, ha még nem exportált — ezt az egy exportot Dev B adhatja hozzá, mást ne
     változtasson abban a fájlban; Dev A csak a Csempesor sort törli onnan — ütközés esetén Dev A változata él és a
     B-export rákerül).
  3. **A hét**: a `getTervezesHet()` ennek a kocsinak a sora (napcellák fuvarokkal és résekkel, a Tervezés
     cellastílusával, egyszerű listaként is elég: nap → fuvarok / rés / szabad), link a teljes Héthez.
  4. **Kihasználtság**: hét és hónap (`getKihasznaltsag(ma)` ennek a kocsinak a sora): bevétel/nap, fedezet/nap,
     üres km %, fizetős napok.
  5. **Telemetria**: `canNapok(jarmuId, ma−7, ma)` táblázat (nap, km, liter, l/100), szervizig km a legutolsó
     sorból (ha van). A `jarmuId` a `fuvar_jarmuvek.kod` alapján.
- Minden blokk külön hibatűrő: ha egy forrás hibázik vagy 2,5 mp-nél tovább tart, a blokk helyén rövid szürke
  „most nem elérhető” szöveg, a lap többi része megjelenik.

## Tesztek (Tesztelő — a kód előtt)

- `scripts/teszt-2kor-kocsi-sav.ts`: a `kocsiSav` és `napCimke` minden fenti szabályára (1–8), határesetekkel
  (üres sorok, minden kész, „most” és „kovetkezo” együtt, több fuvar, fuvar-sor nélküli megállók, rés és szabad cella
  ugyanazon/különböző napon, múltbeli nap, nem üzemelő kocsi, ajanlatHref kódolás, hónapváltás a napCimkében).
  Tiszta, DB nélküli. Hozzáadás a `package.json` `teszt` láncához.
- `scripts/teszt-2kor-navigacio.ts`: a fülszerkezet. Dev C a `FOFULEK` tömböt (és típusait) egy tiszta modulba
  teszi: `lib/fuvarozas2/fulek-szerkezet.ts` (`export const FOFULEK`, `export type Fofül/Alful`), a `fulek.tsx`
  onnan importál. A teszt: három főfül a fenti sorrendben (kocsik, megbizasok, penz), a 9 régi href mind szerepel
  pontosan egyszer, a `csakFuvarozas` jelölés pontosan a Hét, Ajánlat, Áttekintés, Kimutatás alfüleken van.

## Fájl-tulajdon

| Ki | Fájlok |
|---|---|
| Tesztelő | `scripts/teszt-2kor-*.ts`, `package.json` (csak a `teszt` lánc) |
| Dev A | `lib/fuvarozas2/kocsi-sav-alap.ts`, `lib/fuvarozas2/kocsi-sav.ts`, `components/fuvarozas2/kocsi-savok.tsx`, `app/fuvarozas2/page.tsx`, `components/fuvarozas2/ma-vaszon.tsx` (csak a Csempesor sor) |
| Dev B | `app/fuvarozas2/kocsi/[kod]/page.tsx`, `components/fuvarozas2/kocsi-lap.tsx`, `lib/fuvarozas2/kocsi-lap.ts`, `components/fuvarozas2/ma-vaszon.tsx` (csak a kocsi-kártya exportja) |
| Dev C | `components/fuvarozas2/fulek.tsx`, `lib/fuvarozas2/fulek-szerkezet.ts`, `lib/fuvarozas2/ma-vaszon.ts` (csak `getBerOsszesitok` kiemelése), `app/fuvarozas2/eredmeny/page.tsx`, `components/fuvarozas2/csempesor.tsx` (ha kell), a többi lap `Fuvarozas2Fulek` címkéje, `lib/modules.ts` |
| Integrátor (fő session) | `PROGRESS.md`, ütközések, teljes ellenőrzés, élesítés |

## Elfogadás

`tsc` 0, az érintett fájlok `eslint`-je 0, `npm run teszt` 0, `npm run build` 0; független QA ≥ 8/10;
élesítés a tulajdonos igenjével.
