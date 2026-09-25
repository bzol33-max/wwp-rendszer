"use server";

import { query } from "@/lib/db";
import { frissitsdFuvarozas2Modellt } from "@/lib/fuvarozas2/modell-szinkron";
import { requireAnyEditPermission, requireAnyViewPermission, requireEditPermission } from "@/lib/auth/require-permission";
import { PARTNEREK } from "@/lib/fuvarozas/import/partnerek";
import { ceglNevKanonikusan, normalizaltCegKulcs, sajatCegunkE } from "@/lib/fuvarozas/fuvar-constants";
import { FUVAR_HELY_SQL, FUVAR_MA_SQL, type FuvarHely } from "@/lib/fuvarozas/fuvar-hely";
import { toroljIdovonalCachet } from "@/lib/fuvarozas/idovonal-cache";
import { bontsMegallokra } from "@/lib/fuvarozas/varos";
import { kiegAlap, parositKiegSzamlakat, parositSzamlakat } from "@/lib/fuvarozas/szamla-parositas";
import { requireSession } from "@/lib/auth/dal";
import type {
  FuvarTipus,
  FuvarStatusz,
  FuvarRow,
  MaiFuvarSor,
  AddFuvarInput,
  ApproveFuvarInput,
  FuvarErintesSor,
  FuvardijPenznem,
  KimutatasJarmuSor,
  UtkozesJelolt,
} from "@/lib/fuvarozas/fuvar-constants";

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
 * A "Bér fuvarok" fül logikája: a Drive-ból (fuvarmegbízás-figyelő
 * automatika) érkező, "sajat" típusú fuvarok itt jelennek meg, amíg a munka
 * (a lerakás) folyamatban van. Amint a lerakás dátuma elmúlt, a fuvar innen
 * eltűnik, és onnantól csak a Számla/Posta fülön látszik (lásd
 * getSzamlaPostaFuvarok) — ott intézhető a számlázás/postázás, majd
 * (postázás + 5 perc) után automatikusan archiválódik (getArchivFuvarok).
 * "Folyamatban" = a lerakás dátuma (vagy ha nincs külön megadva, a felrakás
 * dátuma) még nem múlt el.
 */
export async function getFolyamatbanSajatFuvarok(): Promise<FuvarRow[]> {
  return query<FuvarRow>(
    `select ${FUVAR_ROW_COLUMNS}
     from fuvar_megbizasok
     where statusz <> 'torolt' and ${FUVAR_HELY_SQL} = 'ber_folyamatban'
     order by ellenorzott asc, coalesce(lerakas_datum, datum) asc, id asc
     limit 200`
  );
}

/**
 * A "Saját fuvarok" fül (tipus='ber') aktív listája — ugyanaz a
 * "folyamatban" logika, mint getFolyamatbanSajatFuvarok-nál (nem
 * "Kész"-re jelölve, és a lerakás/felrakás dátuma még nem múlt el), csak a
 * másik fuvar-típusra. A teljesítettek innen eltűnnek és az Archívba
 * kerülnek (lásd getArchivFuvarok) — nincs külön Számla/Posta köztes
 * állapotuk, mert nincs postázási/számlázási munkafolyamatuk (belső, saját
 * célú szállítás).
 */
export async function getFolyamatbanValodiSajatFuvarok(): Promise<FuvarRow[]> {
  return query<FuvarRow>(
    `select ${FUVAR_ROW_COLUMNS}
     from fuvar_megbizasok
     where statusz <> 'torolt' and ${FUVAR_HELY_SQL} = 'sajat_folyamatban'
     order by coalesce(lerakas_datum, datum) asc, id asc
     limit 200`
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
 * Ennyi napra visszamenőleg mutatja a GPS lap a CSÚSZÓ fuvarokat: járművel
 * rendelkező, még nem Teljesítve és még nem számlázott fuvar, aminek a
 * lerakási napja már elmúlt (a kiszámlázott nyilván megtörtént, csak a
 * Teljesítve pipa maradt el — az nem csúszik).
 * Élesben a #130 (Pápa → Debrecen, lerakás 09-16) éjfél után eltűnt a GPS
 * lapról, miközben a kocsi felrakva Pápán állt, és csak másnap indult.
 */
const CSUSZO_FUVAR_NAPOK = 3;

/**
 * A csúszó fuvar akkor is a nap része, ha AZNAP zárult le: a #134 (Ghibli
 * Gyöngyöshalász → Debrecen, tervezett lerakás 09-17) 09-18 07:57-kor ért a
 * lerakóhoz, és 09:25-kor automatikusan Teljesítve lett — attól a perctől
 * eltűnt a mai GPS lapról, a reggeli debreceni lerakás sehol nem látszott,
 * miközben a kocsi már a következő fuvar felrakójához ment. A megjelenített
 * nap ELŐTT lezárt csúszó fuvar viszont nem a nap munkája (azt a
 * szamitsIdovonalakat napElottKesz szűrője is kizárja).
 */
const CSUSZO_NYITOTT_VAGY_AZNAP_KESZ_SQL = `(not teljesitve
  or (teljesitve_at at time zone 'Europe/Budapest')::date = coalesce($1::date, ${FUVAR_MA_SQL}))`;

/**
 * Egy adott nap (alapértelmezetten a mai) saját fuvarjai — akár aznap
 * kell felrakni, akár aznap kell lerakni, AKÁR a kettő közé eső napon (egy
 * többnapos fuvar felrakás és lerakás közti napjain, pl. amíg a jármű a
 * saját telephelyen áll) —, nyers dátumokkal, a napi jármű-idővonalra
 * (GPS-idővonal + tervezett fuvarok) történő időpont-becsléshez.
 *
 * FONTOS: korábban ez csak a felrakás VAGY a lerakás napjára illeszkedett
 * (egyenlőségvizsgálattal) — egy péntek-hétfő közti többnapos fuvar emiatt
 * szombaton/vasárnap teljesen eltűnt a GPS idővonalról (majd hétfőn
 * "visszatért"), holott a fuvar ezeken a napokon is folyamatban van (csak
 * éppen áll). A tartomány-illesztés ezt a hézagot zárja be.
 *
 * `csuszokIs`: a CSUSZO_FUVAR_NAPOK napon belül lerakandó, még nem
 * Teljesítve VAGY aznap Teljesítve lett, járművel rendelkező fuvarok is (a
 * GPS lap mai nézetéhez — lásd CSUSZO_NYITOTT_VAGY_AZNAP_KESZ_SQL).
 */
export async function getMaiSajatFuvarok(nap?: string, csuszokIs = false): Promise<MaiFuvarSor[]> {
  return query<MaiFuvarSor>(
    `select
       id::text, megrendelo, felrako, lerako, idopont,
       to_char(datum, 'YYYY-MM-DD') as datum,
       to_char(lerakas_datum, 'YYYY-MM-DD') as lerakas_datum,
       jarmu, sofor, pozicioszam, referencia,
       aru, mennyiseg, suly, fuvardij, fuvardij_penznem,
       (select count(*) from fuvar_dokumentumok d where d.fuvar_id = fuvar_megbizasok.id and d.tipus = 'fuvarlevel')::int as fuvarlevel_foto_db,
       to_char(felrakas_ablak_tol at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as felrakas_ablak_tol,
       to_char(lerakas_ablak_tol at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as lerakas_ablak_tol,
       teljesitve,
       to_char(teljesitve_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as teljesitve_at
     from fuvar_megbizasok
     where tipus = 'sajat' and statusz <> 'torolt'
       and (
         (datum <= coalesce($1::date, ${FUVAR_MA_SQL})
          and coalesce(lerakas_datum, datum) >= coalesce($1::date, ${FUVAR_MA_SQL}))
         or ($2::boolean and ${CSUSZO_NYITOTT_VAGY_AZNAP_KESZ_SQL}
             and coalesce(szamla_szam, '') = '' and jarmu is not null and jarmu <> ''
             and coalesce(lerakas_datum, datum)
               between coalesce($1::date, ${FUVAR_MA_SQL}) - ${CSUSZO_FUVAR_NAPOK}
                   and coalesce($1::date, ${FUVAR_MA_SQL}) - 1)
       )
     order by idopont nulls last, id asc
     limit 100`,
    [nap ?? null, csuszokIs]
  );
}

/**
 * Egy adott nap (alapértelmezetten a mai) "Saját fuvarok" fülön (tipus='ber')
 * rögzített, kézzel felvett fuvarjai — a mobil összefoglaló nézethez
 * (kocsinkénti csoportosítás a `jarmu` mező alapján). Lásd getMaiSajatFuvarok
 * fenti megjegyzését a "sajat"/"ber" elnevezés (történelmi okokból fordított
 * UI-címkézés: tipus='sajat' → "Bér fuvarok" fül, tipus='ber' → "Saját
 * fuvarok" fül) tisztázásához.
 */
export async function getMaiValodiSajatFuvarok(nap?: string, csuszokIs = false): Promise<MaiFuvarSor[]> {
  return query<MaiFuvarSor>(
    `select
       id::text, megrendelo, felrako, lerako, idopont,
       to_char(datum, 'YYYY-MM-DD') as datum,
       to_char(lerakas_datum, 'YYYY-MM-DD') as lerakas_datum,
       jarmu, sofor, pozicioszam,
       aru, mennyiseg, suly, fuvardij, fuvardij_penznem,
       (select count(*) from fuvar_dokumentumok d where d.fuvar_id = fuvar_megbizasok.id and d.tipus = 'fuvarlevel')::int as fuvarlevel_foto_db,
       to_char(felrakas_ablak_tol at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as felrakas_ablak_tol,
       to_char(lerakas_ablak_tol at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as lerakas_ablak_tol,
       teljesitve,
       to_char(teljesitve_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as teljesitve_at
     from fuvar_megbizasok
     where tipus = 'ber' and statusz <> 'torolt'
       and (
         (datum <= coalesce($1::date, ${FUVAR_MA_SQL})
          and coalesce(lerakas_datum, datum) >= coalesce($1::date, ${FUVAR_MA_SQL}))
         or ($2::boolean and ${CSUSZO_NYITOTT_VAGY_AZNAP_KESZ_SQL}
             and coalesce(szamla_szam, '') = '' and jarmu is not null and jarmu <> ''
             and coalesce(lerakas_datum, datum)
               between coalesce($1::date, ${FUVAR_MA_SQL}) - ${CSUSZO_FUVAR_NAPOK}
                   and coalesce($1::date, ${FUVAR_MA_SQL}) - 1)
       )
     order by idopont nulls last, id asc
     limit 100`,
    [nap ?? null, csuszokIs]
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

/** A PDF-ből előkészített, még jóvá nem hagyott fuvarok — típustól függetlenül. */
export async function getElokeszitettFuvarok(): Promise<FuvarRow[]> {
  return query<FuvarRow>(
    `select ${FUVAR_ROW_COLUMNS}
     from fuvar_megbizasok
     where ellenorzott = false and statusz <> 'torolt'
     order by datum desc, id desc
     limit 200`
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
 * A Drive/Gmail-automatika minden megbízást a saját dokumentumának
 * szövegéből olvas ki újra, cégnyilvántartás nélkül — ezért ugyanaz a
 * partner megbízásonként eltérő írásmóddal (kis/nagybetű, kötőjel,
 * cégforma-toldalék, vagy a CEG_ALIAS_CSOPORTOK-ban rögzített, tartalmilag
 * eltérő névváltozat) kerülhet be. Ez a lépés az addFuvar/approveFuvar
 * mentés ELŐTT lefutva a DB-ben MÁR meglévő megrendelő-nevek közül
 * kiválasztja azt, amelyik ugyanarra a normalizált kulcsra esik (a
 * leggyakrabban előfordulót, ha korábbról több variáns is létezne), és azt
 * írja be — így maga a tárolt adat is egységesedik egyetlen írásmódra,
 * nem csak az Archív/Kapcsolatok fülek megjelenítési csoportosítása.
 * Teljesen új partnernél (nincs egyező kulcs) a whitespace-normalizált
 * nyers nevet adja vissza.
 */
async function kanonikusMegrendeloNev(nyersNev: string | null | undefined): Promise<string | null> {
  const nev = nyersNev?.trim().replace(/\s+/g, " ");
  if (!nev) return null;
  // Szabály: a saját cégünk sosem megrendelő (mi vagyunk a megbízott). Az
  // import már szűri, de a kézi felvitel/jóváhagyás is ezen a ponton megy át,
  // így a mezőt itt is üresen hagyjuk, nem csak a következő indításkor javítjuk.
  if (sajatCegunkE(nev)) return null;
  const kulcs = normalizaltCegKulcs(ceglNevKanonikusan(nev));
  const meglevok = await query<{ megrendelo: string }>(
    `select megrendelo from fuvar_megbizasok
     where megrendelo is not null
     group by megrendelo
     order by count(*) desc`
  );
  for (const { megrendelo } of meglevok) {
    if (normalizaltCegKulcs(ceglNevKanonikusan(megrendelo)) === kulcs) {
      return megrendelo;
    }
  }
  return nev;
}

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

export async function updateFuvarStatus(id: string, statusz: FuvarStatusz) {
  await requireEditPermission("fuvarozas");
  await query(`update fuvar_megbizasok set statusz = $2 where id = $1`, [id, statusz]);
}

export async function deleteFuvar(id: string) {
  await requireEditPermission("fuvarozas");
  // Nem töröljük fizikailag — "Törölt" státuszba kerül, hogy a naplózás megmaradjon.
  await query(`update fuvar_megbizasok set statusz = 'torolt' where id = $1`, [id]);
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

/** A lista soron belüli, azonnali javítás: a hivatkozási szám kitöltése vagy "nincs" jelölése. */
export async function setFuvarPoziciszam(
  id: string,
  input: { pozicioszam?: string | null; nincs?: boolean }
) {
  await requireEditPermission("fuvarozas");
  await query(
    `update fuvar_megbizasok set
       pozicioszam = $2,
       pozicioszam_nincs = $3
     where id = $1`,
    [id, input.pozicioszam || null, input.nincs ?? false]
  );
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
 * A fuvar eredeti papírjainak (CMR, fuvarlevél) beérkezése a telephelyre.
 * Ez a Számla/Posta fülön a "Papírra vár" és a "Számlázható" csoport közti
 * határ — papír nélkül nem állítunk ki számlát.
 *
 * Több fuvart egyszerre fogad, mert a sofőr egy fordulóból jellemzően több
 * megbízás papírját hozza be egyszerre (lásd PapirNyugtazoSav).
 */
export async function setFuvarokPapirokBeerkeztek(ids: string[], beerkezett: boolean) {
  await requireEditPermission("fuvarozas");
  if (ids.length === 0) return;
  await query(
    `update fuvar_megbizasok
     set papirok_beerkeztek_at = case when $2 then now() else null end
     where id = any($1::bigint[])`,
    [ids, beerkezett]
  );
}

/** Egy fuvar-lista megállóinak kézi állapota (sofőr mobil / GPS lap jelölése) a fuvar_megallo_allapot táblából. */
export async function getMegalloAllapotok(fuvarIds: string[]): Promise<
  {
    fuvar_id: string;
    megallo_index: number;
    kesz: boolean;
    kesz_by: string | null;
    /** Mikor lett kézzel készre jelölve (sofőr mobil, GPS lap pipa). */
    kesz_at: Date | null;
    /** A sofőr "Megérkeztem" koppintásának ideje. */
    kezi_erkezes: Date | null;
    varakozas_kezdete: Date | null;
    varakozas_vege: Date | null;
  }[]
> {
  if (fuvarIds.length === 0) return [];
  // Nem csak a kész sorok: a várakozás-jelölés és a "Megérkeztem" kész
  // megálló nélkül is létezik — a GPS lap táblázata mindkettőt mutatja.
  return query(
    `select fuvar_id::text as fuvar_id, megallo_index, kesz, kesz_by, kesz_at, kezi_erkezes, varakozas_kezdete, varakozas_vege
     from fuvar_megallo_allapot
     where fuvar_id = any($1::bigint[]) and (kesz or varakozas_kezdete is not null or kezi_erkezes is not null)`,
    [fuvarIds]
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
export async function setFuvarTeljesitve(id: string, teljesitve: boolean) {
  await requireEditPermission("fuvarozas");
  await query(
    `update fuvar_megbizasok set teljesitve = $2, teljesitve_at = case when $2 then now() else null end where id = $1`,
    [id, teljesitve]
  );
  toroljIdovonalCachet();
}

/**
 * Az Archív fül "Visszaállítás" gombja: azt nullázza, ami a sort TÉNYLEGESEN
 * az Archívban tartja (lásd FUVAR_HELY_SQL), nem a statusz-t — a statusz a
 * besorolásban nem játszik, ezért a korábbi, csak-statusz-író változat a
 * saját fuvaroknál (tipus='ber') nem mozdította el a sort.
 *   - tipus='sajat' (Bér fuvarok): a postázás visszavonása → Számla/Posta.
 *   - tipus='ber' (Saját fuvarok): a "Kész" jelölés (és egy esetleges
 *     postázás) visszavonása → Saját fuvarok (folyamatban).
 * Visszaadja a sor ÚJ helyét, hogy a UI őszintén jelezhesse, ha a sor mégis
 * archív maradt — ez akkor fordul elő, ha a lerakás/felrakás dátuma már
 * elmúlt, vagy van számlaszáma: ezeket csak szerkesztéssel lehet módosítani,
 * a gomb nem hamisítja meg őket.
 */
export async function visszaallitFuvarArchivbol(id: string): Promise<FuvarHely | null> {
  await requireEditPermission("fuvarozas");
  const rows = await query<{ hely: FuvarHely }>(
    `update fuvar_megbizasok
     set postazva = false,
         postazva_at = null,
         teljesitve = case when tipus = 'ber' then false else teljesitve end,
         teljesitve_at = case when tipus = 'ber' then null else teljesitve_at end
     where id = $1
     returning ${FUVAR_HELY_SQL} as hely`,
    [id]
  );
  return rows[0]?.hely ?? null;
}

// Az "effektíve archivált" (postázva + 5 perc) és a "munka kész" feltétel,
// valamint a fülek közti besorolás EGY helyen él: lib/fuvarozas/fuvar-hely.ts
// (FUVAR_HELY_SQL). Az alábbi lekérdezések csak azt szűrik, hogy a sor helye
// melyik fül — a szabályt ott módosítsd, ne itt.

/**
 * A Számla/Posta lista: a Bér fuvarok, DE csak azok, amiknek a munkája már
 * befejeződött — akár mert a lerakás dátuma elmúlt, akár mert kézzel
 * "Teljesítve"-nek lett jelölve a rögzített dátum előtt (lásd
 * setFuvarTeljesitve; amíg egyik sem igaz, a "Bér fuvarok" fülön látszik,
 * lásd getFolyamatbanSajatFuvarok) —, és amik még nem "effektíve"
 * archiváltak (postázva, és az 5 perces visszavonási ablak már lejárt) —
 * ezek helyette az Archív fülön (getArchivFuvarok) jelennek meg.
 */
export async function getSzamlaPostaFuvarok(): Promise<FuvarRow[]> {
  const rows = await query<FuvarRow>(
    `select ${FUVAR_ROW_COLUMNS}
     from fuvar_megbizasok
     where statusz <> 'torolt' and ${FUVAR_HELY_SQL} = 'szamla_posta'
     order by ellenorzott asc, fuvar_megbizasok.erkezett_datum desc nulls last, datum desc, id desc
     limit 200`
  );
  return potolHianyzoPostazasiCimeket(rows);
}

/**
 * A megbízó (megrendelő) címe, ha a fuvarhoz nincs külön postázási cím
 * megadva: először a partner-sablonban rögzített székhely/postacím (lib/
 * fuvarozas/import/partnerek.ts), annak hiányában ugyanannak a megbízónak
 * a legutóbbi fuvarján rögzített cím. Null, ha egyik sem ismert.
 */
export async function getMegbizoCime(megrendelo: string | null | undefined): Promise<string | null> {
  const nev = megrendelo?.trim();
  if (!nev) return null;
  const kulcs = normalizaltCegKulcs(ceglNevKanonikusan(nev));
  const sablon = PARTNEREK.find(
    (p) => p.postazasiCim && normalizaltCegKulcs(ceglNevKanonikusan(p.nev)) === kulcs
  );
  if (sablon?.postazasiCim) return sablon.postazasiCim;
  return getPostazasiCimJavaslat(nev);
}

/**
 * Minden Számla/Posta sornak legyen postázási címe: ahol a dokumentumból
 * nem került be külön cím, ott a megbízó címét írjuk be (getMegbizoCime),
 * és el is mentjük, hogy a desktop lista és a /posta nézet ugyanazt
 * mutassa, és a Számla/Posta füzet később is visszakereshető legyen. Csak
 * üres mezőt tölt — kézzel beírt címet sosem ír felül. Egy megbízóhoz
 * egyszer keresünk címet, hogy a lista betöltése ne lassuljon.
 */
async function potolHianyzoPostazasiCimeket(rows: FuvarRow[]): Promise<FuvarRow[]> {
  const gyorsitotar = new Map<string, string | null>();
  for (const row of rows) {
    if (row.postazasi_cim?.trim() || !row.megrendelo?.trim()) continue;
    const kulcs = normalizaltCegKulcs(ceglNevKanonikusan(row.megrendelo));
    let cim = gyorsitotar.get(kulcs);
    if (cim === undefined) {
      cim = await getMegbizoCime(row.megrendelo);
      gyorsitotar.set(kulcs, cim);
    }
    if (!cim) continue;
    await query(
      `update fuvar_megbizasok set postazasi_cim = $2
        where id = $1 and coalesce(trim(postazasi_cim), '') = ''`,
      [row.id, cim]
    );
    row.postazasi_cim = cim;
  }
  return rows;
}

/** Egy papírra váró fuvar minimális adatai a nyugtázó sávhoz. */
export type PapirraVaroFuvar = {
  id: string;
  megrendelo: string | null;
  felrako: string | null;
  lerako: string;
  jarmu: string | null;
  sofor: string | null;
  datum: string;
};

/**
 * A Számla/Posta fülön álló, papírra még váró fuvarok — a telephelyi
 * nyugtázó sávhoz (lásd getPapirNyugtazasJavaslat az actions.ts-ben), ahol a
 * hazaért kocsi fuvarjait egy listából lehet kipipálni.
 */
export async function getPapirraVaroFuvarok(): Promise<PapirraVaroFuvar[]> {
  return query<PapirraVaroFuvar>(
    `select id::text, megrendelo, felrako, lerako, jarmu, sofor,
       to_char(coalesce(lerakas_datum, datum), 'YYYY-MM-DD') as datum
     from fuvar_megbizasok
     where statusz <> 'torolt' and ${FUVAR_HELY_SQL} = 'szamla_posta'
       and papirok_beerkeztek_at is null
     order by coalesce(lerakas_datum, datum) asc, id asc
     limit 100`
  );
}

/**
 * Archív fül: a postázott (és az 5 perces visszavonási ablakon már
 * túljutott) BÉR fuvarok (tipus='sajat'), ÉS a teljesített SAJÁT fuvarok
 * (tipus='ber') — utóbbiaknak nincs postázási/számlázási munkafolyamatuk
 * (belső, saját célú szállítás, nincs mindig valódi külső megrendelőjük),
 * ezért náluk ugyanaz a "teljesítve" feltétel jelenti az archiválást, mint
 * getFolyamatbanValodiSajatFuvarok "folyamatban" feltételének az ellentéte
 * (kézzel "Kész"-re jelölve, vagy a lerakás/felrakás dátuma már elmúlt). A
 * UI-n (ArchivLista) a saját fuvarok mind egy közös "Well-worn Pallet"
 * csoportba kerülnek.
 */
export async function getArchivFuvarok(): Promise<FuvarRow[]> {
  return query<FuvarRow>(
    `select ${FUVAR_ROW_COLUMNS}
     from fuvar_megbizasok
     where statusz <> 'torolt' and ${FUVAR_HELY_SQL} = 'archiv'
     order by postazva_at desc nulls last, datum desc
     limit 200`
  );
}

/**
 * A Megbízások "Kimutatás" füléhez: mindkét fuvar-típus (Bér fuvarok ÉS
 * Saját fuvarok, lásd a fordított UI-címkézésről szóló megjegyzést
 * getMaiSajatFuvarok-nál) fuvarjai jármű szerint, nyers (YYYY-MM-DD)
 * dátummal — a jármű-egyeztetést (resolveJarmu, fuzzy: rendszám vagy
 * sofőrnév is elfogadott) és a heti/havi csoportosítást a kliens végzi,
 * mert a "jarmu" mező szabad szöveg. Csak a hozzárendelt kocsival
 * rendelkező sorokat adja vissza — kocsi nélkül nincs hova sorolni a
 * kimutatásban.
 */
export async function getKimutatasJarmuFuvarok(): Promise<KimutatasJarmuSor[]> {
  return query<KimutatasJarmuSor>(
    `select id::text, tipus,
       to_char(datum, 'YYYY-MM-DD') as datum,
       jarmu, megrendelo, felrako, lerako, fuvardij, fuvardij_penznem
     from fuvar_megbizasok
     where statusz <> 'torolt' and tipus in ('sajat', 'ber')
       and jarmu is not null and jarmu <> ''
     order by datum desc
     limit 1000`
  );
}

/**
 * Minden még aktív (a lerakás — vagy ha nincs külön megadva, a felrakás —
 * dátuma még nem múlt el) saját ÉS bér fuvar jármű-ütközés kereséshez. Két
 * fuvar "ütközik", ha ugyanahhoz a járműhöz van rendelve, és a [datum,
 * lerakas_datum] dátumtartományuk átfedi egymást — egy kocsi fizikailag
 * nem lehet egyszerre két helyen (lásd a konkrét esetet: egy fuvar Sopronból
 * indul, egy másik ugyanaznap Debrecenből — ugyanarra a kocsira rögzítve).
 * A kliens (talalJarmuUtkozeseket) végzi a jármű-egyeztetést (resolveJarmu)
 * és az átfedés-vizsgálatot, mert a "jarmu" mező szabad szöveg.
 */
export async function getAktivFuvarokUtkozeshez(): Promise<UtkozesJelolt[]> {
  return query<UtkozesJelolt>(
    `select id::text, jarmu, sofor,
       to_char(datum, 'YYYY-MM-DD') as datum,
       to_char(lerakas_datum, 'YYYY-MM-DD') as lerakas_datum,
       felrako, lerako, megrendelo
     from fuvar_megbizasok
     where statusz <> 'torolt' and tipus in ('sajat', 'ber')
       and jarmu is not null and jarmu <> ''
       and coalesce(lerakas_datum, datum) >= ${FUVAR_MA_SQL}
     order by datum asc
     limit 500`
  );
}

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
     where m.tipus = 'sajat' and m.statusz <> 'torolt' and m.torolt_at is null
       and coalesce(m.szamla_szam, '') = ''
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
    const frissitve = await query<{ id: string }>(
      `update fuvar_megbizasok set szamla_szam = $2 where id = $1 and coalesce(szamla_szam, '') = '' returning id::text`,
      [p.fuvarId, p.szamlaszam]
    );
    if (frissitve.length === 0) continue;
    talalatDarab++;
    await query(
      `insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, forras, reszletek) values ($1, 'szamla_parositva', 'szamla_szinkron', $2)`,
      [p.fuvarId, JSON.stringify({ szamla_szam: p.szamlaszam, mod: p.mod })]
    );
    console.log(`[szamla-parositas] #${p.fuvarId} ← ${p.szamlaszam} (${p.mod})`);
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
  await query(`update fuvar_megbizasok set szamla_szam = $2 where id = $1`, [
    id,
    szamlaSzam || null,
  ]);
}

/**
 * Javaslat a postázási címhez: az adott megrendelőnél korábban már rögzített,
 * legutóbbi postázási cím (ha van) — hogy jóváhagyáskor ne kelljen újra
 * beírni egy már ismert partner címét (lásd 20. pont: "ha egy adat már
 * rendelkezésre áll, ne kérje be újra").
 */
export async function getPostazasiCimJavaslat(megrendelo: string): Promise<string | null> {
  if (!megrendelo.trim()) return null;
  // A "megrendelo" mezőt a Drive-automatika tölti ki, dokumentumonként
  // újra kiolvasva a partner nevét — ugyanaz a cég két megbízáson akár
  // eltérő írásmóddal is szerepelhet (extra szóköz, nagybetűzés, "Kft."
  // után pont vagy anélkül). Az eredeti, egyszerű "ilike $1" (wildcard
  // nélkül, tehát valójában kis-nagybetű-független EGZAKT egyezés) emiatt
  // hamisan üresnek látta a javaslatot már ismert partnereknél is —
  // whitespace-normalizálással (trim + belső szóközök összevonása)
  // egyeztetünk, hogy ez a tipikus eltérés ne törje meg az egyezést.
  const rows = await query<{ postazasi_cim: string }>(
    `select postazasi_cim
       from fuvar_megbizasok
      where lower(regexp_replace(trim(megrendelo), '\\s+', ' ', 'g'))
              = lower(regexp_replace(trim($1), '\\s+', ' ', 'g'))
        and postazasi_cim is not null
      order by created_at desc
      limit 1`,
    [megrendelo]
  );
  return rows[0]?.postazasi_cim ?? null;
}

/** A "Jóváhagy" / "Módosít" gomb: a mezőket (esetleg módosítva) menti, és ellenorzott = true. */
export async function approveFuvar(input: ApproveFuvarInput) {
  await requireEditPermission("fuvarozas");
  const megrendelo = await kanonikusMegrendeloNev(input.megrendelo);
  await query(
    `update fuvar_megbizasok set
       tipus = $2, datum = $3, idopont = $4, felrako = $5, lerako = $6,
       megrendelo = $7, aru = $8, mennyiseg = $9, suly = $10,
       jarmu = $11, sofor = $12, alvallalkozo = $13,
       fuvardij = $14, koltseg = $15, megjegyzes = $16,
       pozicioszam = $17, pozicioszam_nincs = $18,
       postazasi_cim = $19, fuvardij_penznem = $20,
       lerakas_datum = $21,
       -- A Fuvarozás 2 kulcsai (partner_id, jarmu_id) a szövegből épülnek, de
       -- csak a beolvasáskor: ha itt MÁS lesz a megrendelő vagy a kocsi, a
       -- régi kulcsot eldobjuk, és lent a szövegből újra kitöltjük. Enélkül
       -- a jóváhagyáskor kiosztott kocsi a Fuvarozás 2 listán "kocsi
       -- nélkül" maradt (Huncargo 26S009326/1, Gergő, 2026-09-24). Az
       -- UPDATE jobb oldalán a megrendelo/jarmu még a RÉGI érték.
       partner_id = case when megrendelo is distinct from $7 then null else partner_id end,
       jarmu_id = case when jarmu is distinct from $11 or sofor is distinct from $12 then null else jarmu_id end,
       ellenorzott = true
     where id = $1`,
    [
      input.id,
      input.tipus,
      input.datum,
      input.idopont || null,
      input.felrako,
      input.lerako,
      megrendelo,
      input.aru || null,
      input.mennyiseg || null,
      input.suly || null,
      input.jarmu || null,
      input.sofor || null,
      input.alvallalkozo || null,
      input.fuvardij ?? null,
      input.koltseg ?? null,
      input.megjegyzes || null,
      input.pozicioszam || null,
      input.pozicioszamNincs ?? false,
      input.postazasiCim || null,
      input.fuvardijPenznem ?? "Ft",
      input.lerakasDatum || null,
    ]
  );
  await frissitsdFuvarozas2Modellt(input.id);
}
