# Ecofleet telemetria — 0. hét javítások + tény-réteg (2026-10-16)

Döntés (Five Minds, 5/5): NINCS új párhuzamos fuvarozási rész. A meglévő `/fuvarozas2`
felületek bővülnek; az új Ecofleet-adat egy új, elszigetelt, csak hozzáadó rétegen jön be.
A GPS-becslés marad tartaléknak; a tachó-adat forrás-címkével („tachó” / „GPS-becslés”) jelenik meg.

Élő API (2026-10-16-án ellenőrizve): `https://app.ecofleet.com/seeme/Api/<Útvonal>?json&key=<KULCS>`
→ JSON `{ "status": 0, "meta": {}, "response": [...] }`; hiba: `status != 0`, `errormessage`.
Rate limit nincs (percenkénti használat rendben). Tesztadat: `scripts/fixtures/ecofleet/*.json` (anonimizált).

## Fájl-tulajdon (párhuzamos munka — más fájlhoz NE nyúlj)
| Csapattag | Fájlok |
|---|---|
| Tesztelő | `scripts/teszt-ecofleet-kliens.ts`, `scripts/teszt-telemetria.ts`, `scripts/teszt-integritas-0het.ts`, `scripts/fixtures/ecofleet/*`, `package.json` (csak a `teszt` lánc vége) |
| Dev A (adat) | `lib/ecofleet/**` (új), `lib/jarmu-telemetria/**` (új), `db/migrations/041_jarmu_telemetria.sql`, `app/api/ecofleet/webhook/route.ts` (új), `lib/fuvarozas/ecofleet.ts`, `lib/db.ts` (csak `ZAR_KULCS` új kulcs), `instrumentation.ts` |
| Dev B (integritás) | `lib/fuvarozas/actions.ts`, `lib/megbizasok/akciok.ts`, `db/migrations/042_szamlazott_fuvar_vedelem.sql` |
| Dev C (felület) | `lib/fuvarozas2/ma-vaszon.ts`, `components/fuvarozas2/ma-vaszon.tsx`, `components/fuvarozas2/tervezes-het.tsx` (+ a hozzá tartozó `lib/fuvarozas2/tervezes-het*.ts`), `components/m/sofor-nap.tsx` (+ az adatát adó lib-fájl), `components/jarmuvek/jarmuvek-nezet.tsx` (+ `lib/jarmuvek/*`) |

## 1. Ecofleet JSON-kliens — `lib/ecofleet/kliens.ts` (Dev A)
- `ecofleetJson<T>(utvonal: string, params?: Record<string,string>, opciok?: { fetchImpl?: typeof fetch; timeoutMs?: number }): Promise<T>`
  - URL: `${ECOFLEET_BASE}/${utvonal}?json&key=...&<params>`; kulcs: `process.env.ECOFLEET_API_KEY`, hiányzik → `EcofleetError("Nincs beállítva az ECOFLEET_API_KEY …")`.
  - timeout 20 s (AbortSignal); hálózati hiba vagy HTTP 5xx → EGY újrapróbálás 1 s után; 4xx/`status != 0` → nincs újrapróbálás.
  - Hibaüzenet SOHA nem tartalmazhatja az URL-t vagy a kulcsot (`maszkol(szoveg)` exportálva: a kulcs minden előfordulását `***`-ra cseréli).
  - Visszaad: a `response` mezőt.
- `getLastDataCachelve(maxKorMs = 30_000): Promise<{ sorok: EcofleetLastData[]; lekerveAt: Date }>`
  — folyamaton belüli közös gyorsítótár, egyidejű hívók ugyanazt az ígéretet kapják (in-flight dedup); hiba NEM kerül gyorsítótárba.
- `lib/fuvarozas/ecofleet.ts` `getFleetLastPositions()` maradjon ugyanazzal a visszatérési típussal, de mostantól 30 s-ig gyorsítótárazott (in-flight dedup) — a hívói (idővonal, figyelő, menet-generálás, sofőr) változatlanok. Az ottani hibaüzenetek is maszkolva.

## 2. Tiszta számítások — `lib/ecofleet/szamitas.ts` (Dev A; Tesztelő teszteli)
```ts
export type TachoAllapot = {
  objectId: string;
  allapot: string | null;           // tcoData.currentState, pl. "Pihenő" / "Vezetés"
  allapotKezdete: Date | null;      // tcoData.stateBeginTime
  napiVezetesHatraPerc: number | null;   // tcoData.drivetimeLeftDay (mp) / 60
  hetiVezetesHatraPerc: number | null;   // tcoData.drivetimeLeftWeek / 60
  hetiVezetesPerc: number | null;        // tcoData.totalDriveTimeThisWeek / 60
  muszakHatraPerc: number | null;        // tcoData.remainingShiftTime / 60
  munkaidoHatraPerc: number | null;      // tcoData.remainingWorkingHours / 60
  kovetkezoNapiPihenoPerc: number | null;// tcoData.nextDailyRestDuration / 60
  csokkentettPihenok: number | null;     // tcoData.countOfReducedDailyRests
  hosszabbitottVezetesek: number | null; // tcoData.countOfExtendedDrives
  adatIdopont: Date | null;              // a sor timestamp-je
};
export function tachoAllapotLastDatabol(sor: unknown): TachoAllapot | null; // nincs tcoData → null; hiányzó mező → null (nem 0!)
export function tachoFriss(t: TachoAllapot, most: Date, maxKorPerc = 15): boolean;
export function percSzoveg(perc: number): string; // 160 → "2 ó 40 p", 45 → "45 p", 0 → "0 p", negatív → "0 p"

export type CanNap = {
  literCan: number | null;   // CANFuelUsed max − min a napon (számláló-visszaugrás/ugrás > 500 l/nap esetén null)
  kmCan: number | null;      // CANDistance max − min
  l100: number | null;       // literCan / kmCan * 100, csak ha kmCan >= 20
  tankolasok: { idopont: string; literElotte: number; literUtana: number; hozzaadott: number }[]; // Fuel (liter) ugrás >= 50 l két egymást követő minta közt
  szervizHatraKm: number | null;  // utolsó CANServiceDistance; <= 0 → 0 marad, de `szervizMegbizhato` false ha a napon minden érték <= 0
  szervizMegbizhato: boolean;
  tengelyTerhelesKg: Record<string, number> | null; // utolsó CANAxleWeights (JSON-string) parse-olva
  mintaDb: number;
};
export function canNapNyersbol(sorok: unknown[]): CanNap; // üres → minden null, mintaDb 0
```

## 3. Tény-réteg — DB + gyűjtő + webhook (Dev A)
`db/migrations/041_jarmu_telemetria.sql` (egy tranzakció, idempotens `if not exists`):
- `jarmu_tacho_pillanat(id bigserial pk, jarmu_id bigint references fuvar_jarmuvek(id) on delete cascade, ecofleet_object_id text not null, adat_idopont timestamptz, rogzitve timestamptz not null default now(), allapot text, napi_hatra_perc int, heti_hatra_perc int, heti_vezetes_perc int, muszak_hatra_perc int, munkaido_hatra_perc int, csokkentett_pihenok int, hosszabbitott_vezetesek int, nyers jsonb not null)`; index `(jarmu_id, rogzitve desc)`; unique `(ecofleet_object_id, adat_idopont)` (ugyanaz a minta kétszer ne kerüljön be).
- `jarmu_can_nap(jarmu_id bigint references fuvar_jarmuvek(id) on delete cascade, nap date, liter_can numeric, km_can numeric, l100 numeric, tankolasok jsonb not null default '[]', szerviz_hatra_km int, szerviz_megbizhato boolean not null default false, tengely_terheles jsonb, minta_db int not null, frissitve timestamptz not null default now(), primary key (jarmu_id, nap))`.
- `ecofleet_webhook_esemeny(id bigserial pk, kulcs text not null unique, beerkezett timestamptz not null default now(), payload jsonb not null)`.

`lib/jarmu-telemetria/` :
- `repo.ts`: `mentTachoPillanatok(sorok)`, `mentCanNap(jarmuId, nap, canNap)` (upsert), `legutobbiTacho(): Map<jarmuKod, { tacho: TachoAllapot; rogzitve: Date }>` (jármű-kód → a `fuvar_jarmuvek.kod`), `canNapok(jarmuId, tolNap, igNap)`, `webhookMent(kulcs, payload): Promise<"uj" | "ismetelt">` (`on conflict (kulcs) do nothing`).
- Jármű-azonosítás KIZÁRÓLAG `fuvar_jarmuvek.ecofleet_object_id = objectId` alapján (rendszám-szöveg nem!). Ismeretlen objectId → kihagyva + console.warn.
- `gyujto.ts` + `gyujto-scheduler.ts` (az `instrumentation.ts` indítja, `egyetlenPeldanyban(ZAR_KULCS.telemetriaGyujto = 72_005)`):
  - 2 percenként: `getLastDataCachelve()` → tachó-pillanat mentése (csak ha van tcoData).
  - óránként (és induláskor 60 s késleltetéssel): minden aktív, `ecofleet_object_id`-s kocsira a TEGNAPI és a MAI nap `Vehicles/getRawData` (`objectId`, `begTimestamp`/`endTimestamp` `YYYY-MM-DD HH:mm:ss` Budapest-idő) → `canNapNyersbol` → `mentCanNap`.
  - Ecofleet-hiba: console.error (maszkolva), a kör megy tovább a következő kocsival; semmi nem kerül 0-ként mentésre.
  - 30 napnál régebbi tachó-pillanatok törlése naponta egyszer.
- `app/api/ecofleet/webhook/route.ts`: `POST`. Hitelesítés: `?token=` időállandó összevetése `process.env.ECOFLEET_WEBHOOK_TOKEN`-nel (nincs beállítva → 503; rossz → 401). Body JSON (vagy form → objektum). Kulcs: a payload `id`/`eventId` mezője, ennek híján sha256(nyers body). `webhookMent` → 200 `{ ok: true, uj: boolean }`. Mást NEM csinál (feldolgozás később). `GET` → 405.

## 4. Integritás-javítások (Dev B)
- **Kalibráció** (`lib/fuvarozas/actions.ts` ~481–562): ha az Ecofleet-hívás hibázik vagy 0 minta jön, a szorzó NEM kerülhet a 24 órás gyorsítótárba (legfeljebb 5 percre, vagy sehogy). Tiszta, exportált döntőfüggvény: `kalibracioGyorsitotarazhato(mintaDb: number, voltHiba: boolean): boolean` (true csak ha mintaDb > 0 és nem volt hiba).
- **jarmu_id** (`lib/megbizasok/akciok.ts` ~237): szerkesztéskor a `jarmu_id` NEM nullázódik a háttér-szinkronra bízva: a „Kocsi” szövegből azonnal feloldódik (`resolveJarmu`, majd `findJarmuInSzoveg` — mint a `kocsiraAdom`); ha nem oldható fel, a régi `jarmu_id` megmarad, ha a kocsi-szöveg nem változott; ha változott és nem oldható fel → null + figyelmeztetés a visszatérési értékben. Tiszta döntőfüggvény exportálva: `ujJarmuId(regiJarmuId: number|null, regiKocsi: string|null, ujKocsi: string|null, feloldott: number|null): { jarmuId: number|null; figyelmeztetes: string|null }`.
- **Törlés egységesítése:** minden „törölt” állapotba tevés (`statusz='torolt'`) ugyanazzal a segédfüggvénnyel menjen, ami a `torolt_at = now()`-t is beállítja (az újraolvasás ága is). `042_szamlazott_fuvar_vedelem.sql`: BEFORE DELETE trigger a fuvar-táblán: fizikai DELETE tiltva, ha a sorhoz számla tartozik (a számla-hivatkozás tényleges oszlopát a kódból kell kideríteni). A kérésre végzett kézi soft-delete (statusz='torolt') MARAD engedélyezett.

## 5. Felület (Dev C) — csak meglévő lapokon, új menüpont nélkül
Adat: `legutobbiTacho()` és `canNapok()` (Dev A `lib/jarmu-telemetria/repo.ts` — a fenti aláírásokra építs; ha még nincs kész, ugyanazzal az aláírással importálj).
- **Ma (fuvarszervező)** `ma-vaszon.ts`: a kocsi-kártya `hetiSor`-a: friss tachó (`tachoFriss`) esetén `Tachó: ma még {percSzoveg(napi)} · hét {heti_vezetes óra}/56 ó` + kis „tachó” forrás-jel; különben a mostani GPS-becslés, de „GPS-becslés” címkével. Ha nincs semmi: nincs sor (JANI).
- **Tervezés → A hét** kocsi-sor: ugyanez a rövid chip (csak friss tachónál), tooltipben a részletek (műszak, csökkentett pihenők).
- **Sofőr `/m`** (`sofor-nap.tsx`): a lap tetején egyetlen szöveges sor, ha friss tachó van: „Ma még vezethetsz: 2 ó 40 p · a héten: 26 ó 25 p”. Nincs térkép, nincs extra lekérés a kliensen (szerveren jön az adattal). Nincs adat → nincs sor.
- **Járművek** lista: új oszlopok: „Szervizig” (km; `szerviz_megbizhato=false` → „—” + title „a jármű nem küldi”), „CAN fogyasztás (7 nap)” l/100 a `jarmu_can_nap`-ból (csak ha km ≥ 100), „Tengely” (kg, ha van).
- Minden új elem: `forras-jel.tsx` mintájú címke; mobilon is olvasható; nincs új kliens-oldali lekérés.

## Ellenőrzés (QA)
`npm run typecheck`, `npx eslint` a módosított fájlokra, `npm run teszt` (új szkriptekkel), `npm run build`, migráció helyi DB-n (`DATABASE_URL=postgres://postgres@localhost:5433/wwp node scripts/migrate.mjs`).
