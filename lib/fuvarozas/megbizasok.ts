"use server";

import { query, withTransaction } from "@/lib/db";
import { frissitsdFuvarozas2Modellt } from "@/lib/fuvarozas2/modell-szinkron";
import { requireAnyEditPermission, requireAnyViewPermission, requireEditPermission, requireViewPermission } from "@/lib/auth/require-permission";
import { kanonikusMegrendeloNev } from "@/lib/fuvarozas/megrendelo-nev";
import { FUVAR_HELY_SQL, FUVAR_MA_SQL } from "@/lib/fuvarozas/fuvar-hely";
import { toroljIdovonalCachet } from "@/lib/fuvarozas/idovonal-cache";
import { bontsMegallokra } from "@/lib/fuvarozas/varos";
import { fuvarSzamlaTukor, kiegAlap, parositKiegSzamlakat, parositSzamlakat } from "@/lib/fuvarozas/szamla-parositas";
import { requireSession } from "@/lib/auth/dal";
import type {
  FuvarTipus,
  FuvarRow,
  MaiFuvarSor,
  AddFuvarInput,
  FuvarErintesSor,
  FuvardijPenznem } from "@/lib/fuvarozas/fuvar-constants";

// FIGYELEM: ez egy "use server" fájl — Next.js-ben ez KIZÁRÓLAG async
// függvényeket exportálhat. Típusokat, konstans objektumokat/tömböket NE
// ide tegyünk (lásd lib/fuvarozas/fuvar-constants.ts), mert az futásidőben
// "A "use server" file can only export async functions, found object."
// hibát okoz, és eldönti az egész oldalt.

const TIME_FMT = "mon. DD";

/**
 * A fuvar TÉNYLEGES befejezése — a legkésőbbi állomás-érintés a
 * fuvar_megallo_allapot naplóból: a sofőr kézi jelölése (kesz_at), vagy ha az
 * nincs, a GPS-ből megfigyelt megérkezés (gps_erkezes). A max() az utolsó
 * állomást adja, ami a végső lerakás.
 *
 * Miért nem a lerakas_datum? Mert az a TERVEZETT nap, és a papír-, illetve
 * számlázási határidőket a valóban megtörtént lerakástól kell számolni. Null
 * marad, ha egyik forrásból sincs adat — a hívó ilyenkor essen vissza a
 * tervezett dátumra.
 */
const LERAKAS_TENYLEGES_SQL = `(
  select max(coalesce(ma.kesz_at, ma.gps_erkezes, ma.kezi_erkezes))::text
  from fuvar_megallo_allapot ma
  where ma.fuvar_id = fuvar_megbizasok.id
)`;

const FUVAR_ROW_COLUMNS = `
  id::text, tipus,
  to_char(datum, '${TIME_FMT}') as date,
  to_char(datum, 'YYYY-MM-DD') as datum_iso,
  idopont, felrako, lerako, megrendelo, aru, mennyiseg, suly,
  jarmu, sofor, alvallalkozo,
  fuvardij, fuvardij_penznem, koltseg, statusz, megjegyzes,
  dokumentum_url, forras, ellenorzott, created_by,
  to_char(erkezett_datum, '${TIME_FMT}') as erkezett_datum,
  to_char(lerakas_datum, '${TIME_FMT}') as lerakas_datum,
  to_char(lerakas_datum, 'YYYY-MM-DD') as lerakas_datum_iso,
  fizetesi_hatarido_nap,
  pozicioszam, pozicioszam_nincs, postazasi_cim, postazva, szamla_szam,
  postazva_at::text, teljesitve, teljesitve_at::text,
  papirok_beerkeztek_at::text,
  ${LERAKAS_TENYLEGES_SQL} as lerakas_tenyleges_at,
  (select count(*) from fuvar_dokumentumok d where d.fuvar_id = fuvar_megbizasok.id and d.tipus = 'fuvarlevel')::int as fuvarlevel_foto_db,
  (select min(d.id) from fuvar_dokumentumok d where d.fuvar_id = fuvar_megbizasok.id and d.tipus = 'fuvarlevel')::text as fuvarlevel_foto_id,
  (select coalesce(sum(extract(epoch from (coalesce(ma.varakozas_vege, now()) - ma.varakozas_kezdete)) / 60), 0)::int
     from fuvar_megallo_allapot ma where ma.fuvar_id = fuvar_megbizasok.id and ma.varakozas_kezdete is not null) as varakozas_perc
`;

export async function getFuvarok(tipus: FuvarTipus): Promise<FuvarRow[]> {
  await requireAnyViewPermission(["fuvarozas", "attekintes"]);
  // A "sajat" tipus mögött (megjelenítve: "Bér fuvarok") a megbízás beérkezési
  // dátuma a fő rendezési szempont — a "fuvar_megbizasok." előtag azért kell,
  // mert az erkezett_datum alias a select-listában már formázott szöveg, a
  // dátum szerinti (nem szöveges) rendezéshez az eredeti oszlopra van szükség.
  const orderBy =
    tipus === "sajat"
      ? `ellenorzott asc, fuvar_megbizasok.erkezett_datum desc nulls last, datum desc, id desc`
      : `ellenorzott asc, datum desc, id desc`;
  return query<FuvarRow>(
    `select ${FUVAR_ROW_COLUMNS}
     from fuvar_megbizasok
     where tipus = $1 and statusz <> 'torolt'
     order by ${orderBy}
     limit 200`,
    [tipus]
  );
}

/**
 * A GPS-érintés-felismerés bemenete (lásd teljesites-figyeles.ts): a
 * `kezdetNapISO` óta lerakandó (vagy már lerakott), járművel rendelkező
 * fuvarok MINDKÉT fülről (tipus='sajat' = Bér fuvarok, tipus='ber' = Saját
 * fuvarok) — a MÁR LEZÁRTAK is (ők foglalják a párosításban a saját
 * megállásukat), de csak a mai napig felrakottak (a holnapi fuvarhoz még
 * nincs mit felismerni).
 *
 * Korábban csak a Bér fuvarok voltak benne: a Saját fuvarok fül tételeit
 * (élesben 2026-09-18: Micó Ebes→Balkány, a saját balkányi telepre) a
 * figyelő se nem naplózta, se nem zárta le, és a párosításban sem
 * foglalták a saját megállásukat — a GPS lap ugyanakkor mindkét fület
 * mutatja, így a kettő nem ugyanazt látta.
 */
export async function getSajatFuvarokErinteshez(kezdetNapISO: string): Promise<FuvarErintesSor[]> {
  await requireViewPermission("fuvarozas");
  return query<FuvarErintesSor>(
    `select id::text, tipus, jarmu, felrako, lerako,
       to_char(datum, 'YYYY-MM-DD') as datum,
       to_char(lerakas_datum, 'YYYY-MM-DD') as lerakas_datum,
       to_char(felrakas_ablak_tol at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as felrakas_ablak_tol,
       to_char(lerakas_ablak_tol at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as lerakas_ablak_tol,
       teljesitve,
       to_char(teljesitve_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as teljesitve_at,
       (coalesce(szamla_szam, '') <> '') as szamlas,
       ${FUVAR_HELY_SQL} as hely
     from fuvar_megbizasok
     where tipus in ('sajat', 'ber') and statusz <> 'torolt'
       and jarmu is not null and jarmu <> ''
       and coalesce(lerakas_datum, datum) >= $1::date
       and datum <= ${FUVAR_MA_SQL}
     order by id asc
     limit 200`,
    [kezdetNapISO]
  );
}

/**
 * A [kezdetNapISO, vegNapISO] (mindkét vég zárt) intervallumba eső fuvarok
 * (Bér fuvarok ÉS Saját fuvarok fül egyaránt, lásd getMaiSajatFuvarok fenti
 * megjegyzését a fordított UI-címkézésről), a felrakás dátuma szerint — a
 * GPS lap "következő napok" előnézetéhez, ahol csak a napi bontás és a
 * városnév kell, geokódolás/útvonalszámítás nélkül.
 */
export async function getFuvarokIdoszakban(kezdetNapISO: string, vegNapISO: string): Promise<(MaiFuvarSor & { tipus: FuvarTipus })[]> {
  await requireViewPermission("fuvarozas");
  return query<MaiFuvarSor & { tipus: FuvarTipus }>(
    `select
       id::text, tipus, megrendelo, felrako, lerako, idopont,
       to_char(datum, 'YYYY-MM-DD') as datum,
       to_char(lerakas_datum, 'YYYY-MM-DD') as lerakas_datum,
       jarmu, sofor, pozicioszam,
       aru, mennyiseg, suly, fuvardij, fuvardij_penznem,
       (select count(*) from fuvar_dokumentumok d where d.fuvar_id = fuvar_megbizasok.id and d.tipus = 'fuvarlevel')::int as fuvarlevel_foto_db,
       to_char(felrakas_ablak_tol at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as felrakas_ablak_tol,
       to_char(lerakas_ablak_tol at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as lerakas_ablak_tol,
       teljesitve
     from fuvar_megbizasok
     where tipus in ('sajat', 'ber') and statusz <> 'torolt'
       and datum between $1::date and $2::date
     order by datum asc, idopont nulls last, id asc
     limit 200`,
    [kezdetNapISO, vegNapISO]
  );
}

/**
 * A "dokumentum_url"-en lévő egyedi index (lásd db/schema.sql) miatt egy már
 * ismert Drive-dokumentum ismételt beküldése (pl. ha a drive-allapot
 * dedup-listája valamiért mégis hiányosan látná) csendben nem hoz létre új
 * sort ("on conflict do nothing") — ez a végső védelem a duplikálás ellen,
 * a drive-allapot végpont saját dedup-logikája mellett.
 */
/**
 * Új fuvar felvitele. A létrejött sor azonosítóját adja vissza, vagy `null`-t,
 * ha a `dokumentum_url` egyediségi megkötése miatt nem keletkezett új sor
 * (tehát ezt a dokumentumot már felvittük). A Drive-import ebből tudja, hogy
 * VALÓBAN új fuvar lett-e — korábban a duplikátumot is új sornak számolta.
 */
export async function addFuvar(input: AddFuvarInput): Promise<string | null> {
  await requireEditPermission("fuvarozas");
  const megrendelo = await kanonikusMegrendeloNev(input.megrendelo);
  const sorok = await query<{ id: string }>(
    `insert into fuvar_megbizasok
       (tipus, datum, idopont, felrako, lerako, megrendelo, aru, mennyiseg, suly,
        jarmu, sofor, alvallalkozo, fuvardij, fuvardij_penznem, koltseg, megjegyzes,
        dokumentum_url, drive_file_id, forras, ellenorzott, created_by,
        erkezett_datum, lerakas_datum, fizetesi_hatarido_nap,
        pozicioszam, pozicioszam_nincs, postazasi_cim)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
     on conflict (dokumentum_url) where dokumentum_url is not null do nothing
     returning id::text`,
    [
      input.tipus,
      input.datum,
      input.idopont || null,
      input.felrako || null,
      input.lerako,
      megrendelo,
      input.aru || null,
      input.mennyiseg || null,
      input.suly || null,
      input.jarmu || null,
      input.sofor || null,
      input.alvallalkozo || null,
      input.fuvardij ?? null,
      input.fuvardijPenznem ?? "Ft",
      input.koltseg ?? null,
      input.megjegyzes || null,
      input.dokumentumUrl || null,
      input.driveFileId || null,
      input.forras ?? "kezi",
      input.ellenorzott ?? true,
      input.createdBy ?? null,
      input.erkezettDatum || null,
      input.lerakasDatum || null,
      input.fizetesiHataridoNap ?? null,
      input.pozicioszam || null,
      input.pozicioszamNincs ?? false,
      input.postazasiCim || null,
    ]
  );
  const id = sorok[0]?.id ?? null;
  // A Fuvarozás 2 modell (megállók, partner, jármű, hivatkozás) utántöltése:
  // enélkül az új fuvarnak nincs megállója, és a Ma-képernyő ablak-, várakozás-
  // és „kész"-logikája vak rajta (2026-09-20).
  if (id) await frissitsdFuvarozas2Modellt(id);
  return id;
}

/**
 * Egy Drive-ból importált megbízás ÚJRAOLVASÁSRA felszabadítása: a sor
 * törölt lesz, és elengedi a Drive-iratot (dokumentum_url, drive_file_id),
 * hogy a következő szinkron-kör a jelenlegi olvasóval újra felvegye. A sima
 * törlés ezt NEM teszi: a törölt sor továbbra is fogja az iratot, a szinkron
 * "ismertnek" veszi, és a dokumentum_url egyedi indexe miatt új sor sem
 * születhetne belőle — így egy rosszul beolvasott megbízást eddig csak kézzel
 * lehetett javítani (2026-09-18, BB-Logistic 02215-2026). Ugyanaz, mint a
 * scripts/migrate.mjs egyszeri "szabaditsaFel…" javításai, csak gombról.
 */
export async function felszabaditFuvarDokumentumot(id: string): Promise<void> {
  await requireEditPermission("fuvarozas");
  const [sor] = await query<{ drive_file_id: string | null; dokumentum_url: string | null }>(
    `select drive_file_id, dokumentum_url from fuvar_megbizasok where id = $1`,
    [id]
  );
  if (!sor) throw new Error("Nincs ilyen fuvar.");
  const fileId = sor.drive_file_id ?? sor.dokumentum_url?.match(/\/file\/d\/([^/]+)\//)?.[1] ?? null;
  await query(
    `update fuvar_megbizasok
     set statusz = 'torolt',
         megjegyzes = coalesce(megjegyzes || ' | ', '') ||
           'Újraolvasásra felszabadítva, eredeti dokumentum: ' || coalesce(dokumentum_url, '-'),
         dokumentum_url = null,
         drive_file_id = null,
         -- A Duvenbeck-olvasó a törölt sor Út ID-jét „már megvan”-nak veszi
         -- (lib/fuvarozas/duvenbeck-import.ts, megvanMar) — itt elengedjük.
         reise_id = null
     where id = $1`,
    [id]
  );
  if (fileId) {
    // A csatolt irat és a napló hivatkozása se fogja tovább a fájlt — a
    // szinkron a napló nyers szövegét megtartja (nem tölti le újra hiába).
    await query(`delete from fuvar_dokumentumok where drive_file_id = $1 and fuvar_id = $2`, [fileId, id]);
    await query(`update fuvar_import_naplo set fuvar_id = null where drive_file_id = $1 and fuvar_id = $2`, [fileId, id]);
  }
  toroljIdovonalCachet();
}

/**
 * A Számla/Posta nézet soron belüli, azonnali javítása: postázási cím kitöltése.
 * A "posta" jog önmagában is feljogosít rá — a /posta nézet felhasználója
 * (Budaházi Szabina) a teljes Fuvarozás modulhoz nem fér hozzá, a lista
 * viszont neki készült (lásd app/posta/page.tsx).
 */
export async function setFuvarPostazasiCim(id: string, postazasiCim: string | null) {
  await requireAnyEditPermission(["fuvarozas", "posta"]);
  await query(`update fuvar_megbizasok set postazasi_cim = $2 where id = $1`, [
    id,
    postazasiCim || null,
  ]);
}

/**
 * A lista soron belüli, azonnali javítása: a fuvardíj kitöltése/módosítása.
 * Arra kell, hogy ha a Drive-automatika a megbízás dokumentumából mégsem
 * ismerte fel a fuvardíjat (pedig az szerepel benne), az ellenőrzést végző
 * kolléga a dokumentum alapján közvetlenül a listában pótolhassa —
 * anélkül, hogy vissza kellene mennie az "Előkészített" jóváhagyó űrlaphoz.
 */
export async function setFuvarFuvardij(
  id: string,
  fuvardij: number | null,
  penznem?: FuvardijPenznem
) {
  await requireEditPermission("fuvarozas");
  if (penznem) {
    await query(`update fuvar_megbizasok set fuvardij = $2, fuvardij_penznem = $3 where id = $1`, [
      id,
      fuvardij,
      penznem,
    ]);
  } else {
    await query(`update fuvar_megbizasok set fuvardij = $2 where id = $1`, [id, fuvardij]);
  }
}

/**
 * A lista soron belüli, azonnali javítása: a fizetési határidő (napokban)
 * kitöltése/módosítása — ugyanazon okból, mint setFuvarFuvardij: ha ez a
 * megbízás dokumentumában szerepel, de az automatika nem vitte fel, itt
 * pótolható, jóváhagyó űrlap újranyitása nélkül.
 */
export async function setFuvarFizetesiHatarido(id: string, nap: number | null) {
  await requireEditPermission("fuvarozas");
  await query(`update fuvar_megbizasok set fizetesi_hatarido_nap = $2 where id = $1`, [id, nap]);
}

/**
 * A Számla/Posta nézet jelölője: postára lett-e adva a fuvar dokumentációja
 * (számla + megbízás). A "postazva_at" időbélyeg indítja/törli az 5 perces
 * visszavonási ablakot — ennek leteltével a sor automatikusan (időalapon)
 * archiváltnak számít, lásd getSzamlaPostaFuvarok / getArchivFuvarok.
 */
export async function setFuvarPostazva(id: string, postazva: boolean) {
  // A "posta" jog is elég — ld. setFuvarPostazasiCim. Korábban csak a
  // Fuvarozás szerkesztési jogát fogadta el, ezért a /posta nézetben a
  // "Postázva" pipa hibával ("Nem sikerült menteni") visszapattant annál,
  // akinek csak a Posta modulja van engedélyezve.
  await requireAnyEditPermission(["fuvarozas", "posta"]);
  await query(
    `update fuvar_megbizasok set postazva = $2, postazva_at = case when $2 then now() else null end where id = $1`,
    [id, postazva]
  );
}

/**
 * A GPS lap pipája egy lerakó soron: a MEGÁLLÓT jelöli készre (ugyanabba a
 * sorba, ahová a sofőr mobilos megerősítése ír), és ha ez a fuvar UTOLSÓ
 * lerakója, a fuvart is Teljesítve-re állítja. Korábban a pipa bármelyik
 * lerakónál az egész fuvart lezárta, és a lezárás a listán nem is látszott
 * (a zöld jelölés kizárólag a GPS-felismerésből jött).
 */
export async function setMegalloKesz(fuvarId: string, megalloIndex: number): Promise<{ fuvarLezarva: boolean }> {
  await requireEditPermission("fuvarozas");
  const session = await requireSession();
  const sorok = await query<{ felrako: string | null; lerako: string; teljesitve: boolean }>(
    `select felrako, lerako, teljesitve from fuvar_megbizasok where id = $1 and statusz <> 'torolt'`,
    [fuvarId]
  );
  const sor = sorok[0];
  if (!sor) throw new Error("A fuvar nem található.");
  await query(
    `insert into fuvar_megallo_allapot (fuvar_id, megallo_index, kesz, kesz_at, kesz_by)
     values ($1, $2, true, now(), $3)
     on conflict (fuvar_id, megallo_index) do update set kesz = true, kesz_at = now(), kesz_by = $3`,
    [fuvarId, megalloIndex, session.name]
  );
  const utolsoIndex = bontsMegallokra(sor.felrako).length + bontsMegallokra(sor.lerako).length - 1;
  let fuvarLezarva = false;
  if (megalloIndex === utolsoIndex && !sor.teljesitve) {
    await query(`update fuvar_megbizasok set teljesitve = true, teljesitve_at = now() where id = $1`, [fuvarId]);
    fuvarLezarva = true;
  }
  toroljIdovonalCachet();
  return { fuvarLezarva };
}

/**
 * A "Bér fuvarok — folyamatban" fül kézi "Teljesítve" gombja: a fuvart a
 * rögzített (tervezett) lerakás dátumtól függetlenül azonnal átteszi a
 * Számla/Posta fülre — a valós dátumot NEM módosítja, csak ezt a külön
 * jelölőt. Lásd getSzamlaPostaFuvarok.
 */
/**
 * A GPS-figyelő teljesítés-jelölése: csak akkor ír, ha a fuvar még nincs
 * teljesítve és nincs számlája. A figyelő perccel korábban beolvasott sorokból
 * dolgozik — a feltétel nélküli írás felülírta a közben kézzel visszavont vagy
 * már számlázott sort, és a teljesitve_at-t is újraírta (audit 2026-10-04,
 * RACE-4). Igazat ad, ha tényleg írt.
 */
export async function jelolTeljesitveGpsAlapjan(id: string): Promise<boolean> {
  await requireEditPermission("fuvarozas");
  const irt = await query<{ id: string }>(
    `update fuvar_megbizasok set teljesitve = true, teljesitve_at = coalesce(teljesitve_at, now())
     where id = $1 and not teljesitve and coalesce(szamla_szam, '') = ''
     returning id::text`,
    [id]
  );
  if (irt.length > 0) toroljIdovonalCachet();
  return irt.length > 0;
}

// Az "effektíve archivált" (postázva + 5 perc) és a "munka kész" feltétel,
// valamint a fülek közti besorolás EGY helyen él: lib/fuvarozas/fuvar-hely.ts
// (FUVAR_HELY_SQL). Az alábbi lekérdezések csak azt szűrik, hogy a sor helye
// melyik fül — a szabályt ott módosítsd, ne itt.

/**
 * A fuvaron álló számlaszám egy sztornózott (törölt/teljesen helyesbített)
 * számláé — a fuvar valójában nincs kiszámlázva, az új, helyes számla még
 * jön (Huncargo WLLWR-2026-323 → 325, Lösung Trans → 328, 2026-09-28: hibás
 * teljesítési dátum miatt sztornó + új számla). Az ilyen fuvart a párosítás
 * számla nélkülinek veszi, és az új számla a sztornózott helyére kerül.
 */
const SZTORNOZOTT_SZAMLA_SQL = `exists (select 1 from szamla sz where sz.szamlaszam = m.szamla_szam and sz.sztornozva)`;

/**
 * A Számlák modulban rögzített fuvarszámlák (kategoria = 'fuvar') sorszámát
 * automatikusan beírja a megfelelő bér fuvar "Számla szám" mezőjébe. A döntés
 * a lib/fuvarozas/szamla-parositas.ts-ben van (szám → irat-szöveg →
 * partner+összeg+dátum+útvonal); itt csak a betöltés és az írás. Csak a
 * `szamla` táblát olvassa, a Számlázz.hu-t nem kérdezi. Meghívva: a
 * Számlázz.hu szinkron minden körének végén (lib/szamlak/poll.ts) és a
 * Számla/Posta lista betöltésekor.
 */
export async function szinkronizalSzamlaSzamokat(): Promise<number> {
  await requireEditPermission("fuvarozas");
  const fuvarSorok = await query<{
    id: string; partner_nev: string | null; megrendelo: string | null;
    pozicioszam: string | null; hivatkozas_kanonikus: string | null; reise_id: string | null; referencia: string | null;
    nyers_szoveg: string | null; fuvardij: string | null; fuvardij_penznem: string | null;
    felrakas_nap: string | null; lerakas_nap: string | null; felrako: string | null; lerako: string | null;
  }>(
    `select m.id::text, p.nev as partner_nev, m.megrendelo,
       m.pozicioszam, m.hivatkozas_kanonikus, m.reise_id, m.referencia,
       (select string_agg(n.nyers_szoveg, E'\n') from fuvar_import_naplo n where n.fuvar_id = m.id) as nyers_szoveg,
       m.fuvardij::text, m.fuvardij_penznem,
       to_char(m.datum, 'YYYY-MM-DD') as felrakas_nap,
       to_char(coalesce(m.lerakas_datum, m.datum), 'YYYY-MM-DD') as lerakas_nap,
       m.felrako, m.lerako
     from fuvar_megbizasok m
     left join fuvar_partnerek p on p.id = m.partner_id
     where m.jelleg = 'ber' and m.tipus = 'sajat' and m.statusz <> 'torolt' and m.torolt_at is null
       and (coalesce(m.szamla_szam, '') = '' or ${SZTORNOZOTT_SZAMLA_SQL})
       and coalesce(m.lerakas_datum, m.datum) >= current_date - 180`
  );
  const kieg = await szinkronizalKiegSzamlakat();
  if (fuvarSorok.length === 0) return kieg;

  const szamlaSorok = await query<{
    szamlaszam: string; vevo_nev: string; rendelesszam: string | null; netto: string | null; penznem: string | null;
    teljesites_nap: string | null; kiallitas_nap: string | null; tetelek_szoveg: string | null; hasznalt: boolean;
  }>(
    `select sz.szamlaszam, sz.vevo_nev, sz.rendelesszam, sz.netto::text, sz.penznem,
       to_char(sz.teljesites_datum, 'YYYY-MM-DD') as teljesites_nap, to_char(sz.kiallitas_datum, 'YYYY-MM-DD') as kiallitas_nap,
       sz.tetelek_szoveg,
       exists (select 1 from fuvar_megbizasok m where m.szamla_szam = sz.szamlaszam)
         or exists (select 1 from fuvar_elszamolas e where e.szamla_szam = sz.szamlaszam) as hasznalt
     from szamla sz
     where sz.kategoria = 'fuvar' and not sz.sztorno and not sz.sztornozva
       and not exists (select 1 from fuvar_megbizasok m where sz.szamlaszam = any(m.kieg_szamla_szamok))`
  );
  if (szamlaSorok.length === 0) return kieg;

  const parok = parositSzamlakat(
    fuvarSorok.map((f) => ({
      id: f.id,
      partnerNevek: [f.partner_nev, f.megrendelo].filter((x): x is string => !!x),
      szamok: [f.pozicioszam, f.hivatkozas_kanonikus, f.reise_id, f.referencia],
      nyersSzoveg: f.nyers_szoveg,
      fuvardij: f.fuvardij == null ? null : Number(f.fuvardij),
      penznem: f.fuvardij_penznem,
      felrakasNap: f.felrakas_nap, lerakasNap: f.lerakas_nap, felrako: f.felrako, lerako: f.lerako,
    })),
    // A kiegészítő számla („… kieg.”) sosem fő számla — azt lent a
    // szinkronizalKiegSzamlakat köti a már kiszámlázott fuvarhoz.
    szamlaSorok.filter((sz) => !kiegAlap(sz.rendelesszam)).map((sz) => ({
      szamlaszam: sz.szamlaszam, vevoNev: sz.vevo_nev, rendelesszam: sz.rendelesszam,
      netto: sz.netto == null ? null : Number(sz.netto), penznem: sz.penznem,
      teljesitesNap: sz.teljesites_nap, kiallitasNap: sz.kiallitas_nap, tetelekSzoveg: sz.tetelek_szoveg, hasznalt: sz.hasznalt,
    }))
  );

  let talalatDarab = 0;
  for (const p of parok) {
    const [sz] = await query<{ id: string; kelt: string | null }>(
      `select id::text, to_char(kiallitas_datum, 'YYYY-MM-DD') as kelt from szamla where szamlaszam = $1`,
      [p.szamlaszam]
    );
    const tukor = fuvarSzamlaTukor(p.szamlaszam, sz);
    const frissitve = await withTransaction(async (tx) => {
      const rows = await tx<{ id: string; regi: string | null }>(
        `update fuvar_megbizasok m set szamla_szam = $2
         from (select szamla_szam as regi from fuvar_megbizasok where id = $1) r
         where m.id = $1 and m.jelleg = 'ber' and (coalesce(m.szamla_szam, '') = '' or ${SZTORNOZOTT_SZAMLA_SQL})
         returning m.id::text, nullif(r.regi, '') as regi`,
        [p.fuvarId, tukor.szamlaSzam]
      );
      if (rows.length) await tx(
        `insert into fuvar_elszamolas (megbizas_id, szamla_szam, szamla_id, szamla_kelte)
         values ($1, $2, $3, $4) on conflict (megbizas_id) do update set
         szamla_szam = excluded.szamla_szam, szamla_id = excluded.szamla_id, szamla_kelte = excluded.szamla_kelte, frissitve_at = now()`,
        [p.fuvarId, tukor.szamlaSzam, tukor.szamlaId, tukor.szamlaKelte]
      );
      return rows;
    });
    if (frissitve.length === 0) continue;
    talalatDarab++;
    const regi = frissitve[0].regi;
    await query(
      `insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, forras, reszletek) values ($1, 'szamla_parositva', 'szamla_szinkron', $2)`,
      [p.fuvarId, JSON.stringify({ szamla_szam: p.szamlaszam, mod: p.mod, ...(regi ? { sztornozott_elozo: regi } : {}) })]
    );
    console.log(`[szamla-parositas] #${p.fuvarId} ← ${p.szamlaszam} (${p.mod})${regi ? ` — a sztornózott ${regi} helyett` : ""}`);
  }
  return talalatDarab + kieg;
}

/**
 * Kiegészítő számlák (rendelésszám „… kieg.”) a már kiszámlázott fuvarhoz —
 * a döntés: parositKiegSzamlakat (lib/fuvarozas/szamla-parositas.ts).
 */
async function szinkronizalKiegSzamlakat(): Promise<number> {
  const szamlak = await query<{ szamlaszam: string; vevo_nev: string; rendelesszam: string | null }>(
    `select sz.szamlaszam, sz.vevo_nev, sz.rendelesszam
     from szamla sz
     where sz.kategoria = 'fuvar' and not sz.sztorno and not sz.sztornozva
       and sz.kiallitas_datum >= current_date - 180
       and sz.rendelesszam ~* '(kieg|p[oó]tl[aá]s|p[oó]td[ií]j)'
       and not exists (select 1 from fuvar_megbizasok m where m.szamla_szam = sz.szamlaszam or sz.szamlaszam = any(m.kieg_szamla_szamok))
       and not exists (select 1 from fuvar_elszamolas e where e.szamla_szam = sz.szamlaszam)`
  );
  if (szamlak.length === 0) return 0;
  const fuvarok = await query<{
    id: string; partner_nev: string | null; megrendelo: string | null;
    pozicioszam: string | null; hivatkozas_kanonikus: string | null; reise_id: string | null; referencia: string | null;
  }>(
    `select m.id::text, p.nev as partner_nev, m.megrendelo, m.pozicioszam, m.hivatkozas_kanonikus, m.reise_id, m.referencia
     from fuvar_megbizasok m
     left join fuvar_partnerek p on p.id = m.partner_id
     where m.tipus = 'sajat' and m.statusz <> 'torolt' and m.torolt_at is null
       and coalesce(m.lerakas_datum, m.datum) >= current_date - 240`
  );
  const parok = parositKiegSzamlakat(
    fuvarok.map((f) => ({
      id: f.id,
      partnerNevek: [f.partner_nev, f.megrendelo].filter((x): x is string => !!x),
      szamok: [f.pozicioszam, f.hivatkozas_kanonikus, f.reise_id, f.referencia],
    })),
    szamlak.map((sz) => ({ szamlaszam: sz.szamlaszam, vevoNev: sz.vevo_nev, rendelesszam: sz.rendelesszam }))
  );
  let db = 0;
  for (const p of parok) {
    const frissitve = await query<{ id: string }>(
      `update fuvar_megbizasok set kieg_szamla_szamok = array_append(kieg_szamla_szamok, $2)
       where id = $1 and not ($2 = any(kieg_szamla_szamok)) returning id::text`,
      [p.fuvarId, p.szamlaszam]
    );
    if (frissitve.length === 0) continue;
    db++;
    await query(
      `insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, forras, reszletek) values ($1, 'szamla_parositva', 'szamla_szinkron', $2)`,
      [p.fuvarId, JSON.stringify({ kieg_szamla_szam: p.szamlaszam })]
    );
    console.log(`[szamla-parositas] #${p.fuvarId} ← ${p.szamlaszam} (kiegészítő)`);
  }
  return db;
}

/** A Számlák modulban lévő, egyik fuvarhoz sem párosított fuvarszámlák (az utolsó N napból). */
export async function getParositatlanFuvarszamlak(napok = 60): Promise<{
  szamlaszam: string; vevo_nev: string; rendelesszam: string | null; netto: number | null; kiallitas_nap: string;
}[]> {
  await requireAnyViewPermission(["fuvarozas", "elszamolas"]);
  return query(
    `select sz.szamlaszam, sz.vevo_nev, sz.rendelesszam, sz.netto::float8 as netto, to_char(sz.kiallitas_datum, 'YYYY-MM-DD') as kiallitas_nap
     from szamla sz
     where sz.kategoria = 'fuvar' and not sz.sztorno and not sz.sztornozva
       and sz.kiallitas_datum >= current_date - $1::int
       and not exists (select 1 from fuvar_megbizasok m where m.szamla_szam = sz.szamlaszam or sz.szamlaszam = any(m.kieg_szamla_szamok))
       and not exists (select 1 from fuvar_elszamolas e where e.szamla_szam = sz.szamlaszam)
     order by sz.kiallitas_datum desc, sz.szamlaszam desc`,
    [napok]
  );
}

/** A Számla/Posta nézet soron belüli, azonnali javítása: a kiállított számla sorszámának kitöltése. */
export async function setFuvarSzamlaSzam(id: string, szamlaSzam: string | null) {
  await requireEditPermission("fuvarozas");
  const szam = szamlaSzam?.trim() || null;
  const [sz] = szam ? await query<{ id: string; kelt: string | null }>(
    `select id::text, to_char(kiallitas_datum, 'YYYY-MM-DD') as kelt from szamla where szamlaszam = $1`, [szam]
  ) : [undefined];
  const tukor = fuvarSzamlaTukor(szam, sz);
  await withTransaction(async (tx) => {
    const sor = await tx<{ jelleg: string }>(`update fuvar_megbizasok set szamla_szam = $2 where id = $1 returning jelleg`, [id, szam]);
    if (sor[0]?.jelleg === "ber") await tx(
      `insert into fuvar_elszamolas (megbizas_id, szamla_szam, szamla_id, szamla_kelte)
       values ($1, $2, $3, $4) on conflict (megbizas_id) do update set
       szamla_szam = excluded.szamla_szam, szamla_id = excluded.szamla_id, szamla_kelte = excluded.szamla_kelte, frissitve_at = now()`,
      [id, tukor.szamlaSzam, tukor.szamlaId, tukor.szamlaKelte]
    );
  });
}
