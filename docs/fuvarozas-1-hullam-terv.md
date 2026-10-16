# Fuvarozás 2.0 — 1. hullám + takarítás (2026-10-16)

Jóváhagyva (Budaházi Zoltán, 15:33): B-felépítés (kocsi-központú) a 2. körben; most az 1. hullám és a teljes takarítás.
Döntési lap: https://claude.ai/artifact/4NuCBTm96S29Cq7MgoUBcm · Előzmény: `docs/ecofleet-telemetria-terv.md`.
Fő mérőszám: **fedezet / kocsi / munkanap**. Kiinduló: ~83 e Ft bérbevétel / kocsi / munkanap (2026-10-01–16).

## Fájl-tulajdon (párhuzamos munka — más fájlhoz NE nyúlj; ha kell, írd a jelentésbe)
| Tag | Fájlok |
|---|---|
| Tesztelő | `scripts/teszt-1hullam-*.ts`, `package.json` (csak a `teszt` lánc végéhez fűz) — ELSŐKÉNT fut |
| Dev A — rendszer-hibák | `db/migrations/043_elszamolas_potlas.sql`, `lib/fuvarozas/teljesites-figyeles.ts`, `lib/fuvarozas/teljesites-figyeles-scheduler.ts`, `lib/fuvarozas2/rendszer.ts` (+ a lapja), új: `lib/fuvarozas2/rendszer-alap.ts`, `lib/fuvarozas/figyeles-dontes.ts` |
| Dev B — kihasználtság | új: `lib/fuvarozas2/kihasznaltsag-alap.ts`, `lib/fuvarozas2/kihasznaltsag.ts`; `components/fuvarozas2/csempesor.tsx`, `lib/fuvarozas2/ma-vaszon.ts` (csak a csempe-adat), `components/fuvarozas2/ma-vaszon.tsx` (csak a csempesor bekötése) |
| Dev C — „Megnyertük” | `db/migrations/044_ajanlat_eredmeny.sql`, `lib/fuvarozas2/timocom.ts`, `lib/fuvarozas2/timocom-ajanlat.ts`, új: `lib/fuvarozas2/ajanlat-megbizas-alap.ts`, `components/fuvarozas2/ajanlat-gombok.tsx`, `components/fuvarozas2/timocom.tsx`, `components/fuvarozas2/tervezes-het.tsx` (csak a rés-panel ajánlat-sora) |
| Dev D — takarítás | `lib/menet/**`, `lib/fuvarozas2/modell-szinkron-scheduler.ts`, `lib/fuvarozas2/modell-szinkron.ts` (csak a törlendő al-körök), `app/api/fuvarozas/{drive-allapot,drive-hianyok,drive-frissites,drive-import,duplikaciok,duplikaciok-torles,kereses,szamla-kereses,import-naplo}`, `scripts/*` (egyszeriek), `package.json` (Tesztelő UTÁN), `app/m/{fuvar,ceg,rendszer,szamla,papir}`, `components/m/{vezeto,vezeto-ceg}.tsx`, `components/m/tabbar.tsx`, `lib/fuvarozas2/{ma,naplo}.ts`, `lib/fuvarozas/vehicles.ts` (csak `findJarmuByLabel` törlése), `lib/megbizasok/megallo.ts` (csak a tükörírás), `lib/fuvarozas2/koltseg*.ts` (csak `taroldMegbizasKoltsegeket`), `lib/fuvarozas2/oldal-naplo-alap.ts`, `db/migrations/045_takaritas.sql`, `next.config.ts` (átirányítások) |

Migrációk: 043 (A), 044 (C), 045 (D). Egy tranzakció, nincs begin/commit, idempotens (`if not exists`, `on conflict do nothing`, `create or replace`). Drop helyett átnevezés `regi_` előtaggal (db/migrations/README.md).

## A — rendszer-hibák
1. **Elszámolás-sor pótlás** (`043`): egyszeri `insert … select … on conflict (megbizas_id) do nothing` minden `jelleg='ber'`, `torolt_at is null`, `allapot in ('teljesitve','szamlazhato','szamlazva','email_elment','postazva','lezart')` fuvarra, aminek nincs `fuvar_elszamolas` sora; + `AFTER INSERT OR UPDATE OF allapot` trigger a `fuvar_megbizasok`-on, ami ugyanezt teszi az adott sorra. Az oszlopokat a valós sémából ellenőrizd (`fuvar_elszamolas`, `szamla`).
2. **GPS-távozás lezárt fuvarnál**: a figyelő ne ejtse ki azt a fuvart, amit < 24 órája zártak le (`teljesitve`/sofőr „Indulok”), ha van olyan megállója, amin `gps_erkezes is not null and gps_tavozas is null` — azt még figyelje, és írja be a távozást. Tiszta döntőfüggvény: `lib/fuvarozas/figyeles-dontes.ts`:
   `figyelendo(f: { nyitott: boolean; lezarvaOraja: number | null; vanNyitottTavozas: boolean; szamlazva: boolean }): boolean` — nyitott → true; számlázott → false; lezárva < 24 órája és van nyitott távozás → true; különben false.
3. **Valódi hibaüzenet**: `teljesites-figyeles.ts` „ismeretlen hiba” helyett `maszkoltUzenet(err instanceof Error ? \`${err.name}: ${err.message}\` : String(err))` (lib/ecofleet/kliens.ts).
4. **Életjel + okosabb GPS-szabály**: új tábla `rendszer_eletjel(kulcs text primary key, utolso_kor timestamptz not null, adat jsonb)` (043-ban); a figyelő minden kör végén upsert `('teljesites-figyeles', now(), {vizsgalt, hibak})`. `lib/fuvarozas2/rendszer-alap.ts`:
   `gpsEgeszseg(x: { eletjelKorPerc: number | null; aktivMegalloDb: number; utolsoIrasOra: number | null }): { szint: "rendben" | "figyelj" | "gond"; szoveg: string }` —
   életjel null vagy > 15 perc → gond („a figyelő nem fut”); aktivMegalloDb = 0 → rendben („nincs aktív megálló”); utolsoIrasOra > 12 → figyelj; különben rendben.
   „Aktív megálló”: nyitott fuvar, van kocsija, `tervezett_nap <= ma`, `gps_erkezes is null`. Az átállási kapu lekérdezésébe `torolt_at is null`.

## B — kocsi-kihasználtság (Ma lap csempesor helyett)
`lib/fuvarozas2/kihasznaltsag-alap.ts` (tiszta):
```ts
export type KocsiIdoszak = { munkanapok: number; berBevetelFt: number; rakottKm: number; uresKm: number;
  fizetosNapok: number; sajatNapok: number; fogyasztasL100: number; uzemanyagFtL: number; utdijFtKm: number; napiFixFt: number };
export type Kihasznaltsag = { bevetelPerNap: number | null; fedezetPerNap: number | null; uresKmSzazalek: number | null;
  fizetosNapArany: number | null; kmKoltsegFt: number; fedezetFt: number };
export function kihasznaltsag(k: KocsiIdoszak): Kihasznaltsag;
```
- kmKoltségFt = (rakottKm + uresKm) × (fogyasztasL100/100 × uzemanyagFtL + utdijFtKm); fedezetFt = berBevetelFt − kmKoltsegFt − napiFixFt × munkanapok.
- munkanapok = 0 → bevetelPerNap, fedezetPerNap, fizetosNapArany = null. összes km = 0 → uresKmSzazalek = null. Kerekítés: Ft egészre, % egy tizedesre.
- Az EUR-bevétel az MNB-árfolyammal Ft-ra (a meglévő `dijFtban`/árfolyam-útvonal).
`kihasznaltsag.ts`: kocsinként a mostani hét és a hónap eleje óta (munkanap = hétköznap; JANI és GPS nélküli kocsi kimarad, ha nincs fuvarja). Paraméterek a meglévő beállításokból (`lib/beallitasok/fuvar-alap.ts`: fogyasztás, üzemanyagár, útdíj/km, napi fix).
Ma lap: a `Csempesor` helyén kocsinként egy sor: **Fedezet/nap · Bevétel/nap · Üres km % · Fizetős napok** (hét | hónap váltó). Üres km > 30% borostyán, fedezet/nap < 0 piros. A 4–10. üres csempehely megszűnik.

## C — „Megnyertük → megbízás”
- `044`: a Timocom-ajánlat tábla állapota bővül: `nyert`, `vesztett` (+ meglévők); új oszlopok: `ajanlott_ar numeric`, `ajanlott_penznem text`, `eredmeny_at timestamptz`, `megbizas_id bigint references fuvar_megbizasok(id) on delete set null`.
- Tiszta: `lib/fuvarozas2/ajanlat-megbizas-alap.ts`:
  `megbizasAjanlatbol(a: AjanlatAdat, d: { jarmuKod: string; felrakasNap: string; dij: number; penznem: "HUF" | "EUR" }): BerFuvarAdat` — felrakás/lerakás hely és nap, megrendelő (ajánlattevő cég), díj + pénznem, rakott km ha ismert, forrás `timocom`, megjegyzés az ajánlat azonosítójával. Hiányzó lerakás-nap → felrakás nap + becsült menetnap (rakott km / 600, felfelé, min 0).
- Akciók (`timocom.ts`): `ajanlatMegnyerve(ajanlatId, d)` → bérfuvar létrehozása a meglévő `ujBerFuvar` úton, kocsira adás a meglévő kocsira-adó úton (`jarmu_id` azonnal), ajánlat → `nyert` + ár + `megbizas_id`; idempotens (már nyert → a meglévő megbízás id-ja). `ajanlatElvesztve(ajanlatId, ar?)` → `vesztett`.
- Felület: az ajánlat-kártyán „Megnyertük” (kis űrlap: kocsi, nap, díj — a rés kocsijával/napjával és a javasolt árral előtöltve) és „Nem nyertük”; a Tervezés rés-panelén ugyanez. Siker → toast „Megbízás #N létrehozva, Micóra adva”.
- Ár-memória: a `nyert` ajánlatok Ft/km-e bekerül az ár-létra előzményébe (`ar-letra.ts` olvasó oldala — csak olvasás-bővítés).

## D — takarítás
1. **Menet-motor**: az óránkénti `menetterv` és `optimalizáló` al-kör kivétele a `modell-szinkron-scheduler`-ből; a felület nélküli export-függvények törlése (`jovahagyMenet`, `lezarMenetFeladatot`, `visszaJavaslatbaMenet`, `optimalizalMenetet`, `elfogadJavaslatot`, `elutasitJavaslatot`, `nyitottJavaslatok`, `getMenetEsemenyek`) és ami csak ezekből él. MARAD: `hozzarendelesJavaslat`, `menetAdat`, a `menet-alap` tiszta függvényei, és a jóváhagyott menet olvasása (a sofőr-app követi, amíg van ilyen). A hozzájuk tartozó teszteket (teszt-menetterv, teszt-optimalizalo) a megmaradó részre szűkítsd vagy vedd ki a láncból.
2. **9 API-végpont** törlése (fenti lista) — az éles HTTP-napló szerint 30 napja 0 hívás.
3. **Egyszeri szkriptek**: `fuvarozas2-backfill`, `olvaso-osszevetes`, `megbizas-invarians`, `fuvar-hely-ujrasorolas.mts`, `backfill-allapot.ts` (+ teszt), `teszt-excel-import.mts`; `lib/fuvarozas/lerako-telephelyek.ts` (+ teszt). `package.json` scripts/teszt-lánc igazítása.
4. **Telefonos vezetői nézet**: `/m/fuvar`, `/m/ceg`, `/m/rendszer`, `/m/szamla`, `/m/papir`, `components/m/vezeto*.tsx`, `lib/fuvarozas2/{ma,naplo}.ts` (ha máshol nem kell) — az útvonalak átirányítva `/m`-re (next.config.ts). A sofőr-nézet és a Posta (/m/posta, Szabina) MARAD.
5. **Apró halott kód**: `findJarmuByLabel`, `getFuvarokIdoszakban`, `etaPontossag` (ha tényleg 0 hívó), `taroldMegbizasKoltsegeket` (+ hívása).
6. **Tükörtábla**: a `fuvar_megallo_allapot`-ba írás kivétele az app-kódból (`regiSorTx`); ha triggerek is írják, `045`-ben a trigger-függvényből kivenni (create or replace) — ha ez kockázatos/bonyolult, hagyd és jelezd.
7. **Használatlan táblák**: `045`-ben `alter table if exists X rename to regi_X` a 12 táblára (fuvar_kalkulaciok, fuvar_napi_osszesito, fuvar_riasztas, fuvar_ut_minta, fuvar_utvonal_cache, viszonylat_stat, push_elofizetes, telegram_kotes, seged_muvelet, seged_tudas, seged_uzenet, sofor_munkanap) — CSAK ha grep szerint sehol (lib/app/components/scripts/migrate.mjs) nincs rájuk hivatkozás; amelyikre van, marad.
8. **Mérés**: `oldal-naplo-alap.ts` naplózza az `/erkezes` útvonalat is (a régi sofőrnézet kivezetéséhez).

## Ellenőrzés (QA)
typecheck, eslint a módosított fájlokra, teljes `npm run teszt` (helyi DB: `TESZT_DATABASE_URL=postgres://postgres@localhost:5433/wwp`), `next build`, a 043–045 migráció a helyi DB-n kétszer (idempotencia), független kódátnézés. Élesítés csak Zoltán igenje után.
