// A Duvenbeck-dokumentumok beírása az adatbázisba, PÁRONKÉNT EGY fuvarba.
//
// A lib/fuvarozas/duvenbeck.ts csak értelmez; itt dől el, hogy a két irat
// (Fuvar Megbízás + Rakománylista) egyetlen megbízás-sorrá áll össze. Az
// azonosság kulcsa az Út ID (Reise ID), ami mindkét iraton szerepel.
//
// A rendszer NEM "use server" fájl — a drive-sync-core.ts (sima Node modul)
// hívja, a jogosultság-ellenőrzés a cron-futásnál a rendszer-kontextuson
// keresztül engedélyezett (lásd lib/auth/require-permission.ts).

import { query } from "@/lib/db";
import { requireEditPermission } from "@/lib/auth/require-permission";
import { parseDuvenbeck, megalloCimek, type DuvenbeckDok } from "@/lib/fuvarozas/duvenbeck";
import { findJarmuByPlate, jarmuLabel } from "@/lib/fuvarozas/vehicles";
import { budapestFalioraToInstant } from "@/lib/fuvarozas/idozona";

/**
 * A megbízó neve kötött. A Duvenbeck-iratokon a CÍMZETT (mi) neve áll elöl,
 * a "Megbizott: Contractor:" / "Megbizo: Client:" címkék pedig a PDF-ből
 * kiolvasva a nevek MÖGÉ csúsznak — emiatt olvasta korábban a nyelvi modell
 * megrendelőnek a saját cégünket. A determinisztikus úton ez nem fordulhat
 * elő: ha a dokumentum Duvenbeck-sablon, a megrendelő a Duvenbeck.
 */
const MEGRENDELO = "Duvenbeck Logisztikai Kft.";

export type DuvenbeckMentes = {
  statusz: "uj" | "osszefuzve";
  fuvarId: string;
  reiseId: string | null;
};

type MeglevoSor = {
  id: string;
  ellenorzott: boolean;
  felrako: string | null;
  lerako: string | null;
  datum: string | null;
  lerakas_datum: string | null;
  idopont: string | null;
  fuvardij: number | null;
  suly: string | null;
  sofor: string | null;
  jarmu: string | null;
  pozicioszam: string | null;
  postazasi_cim: string | null;
  dokumentum_url: string | null;
};

/**
 * Melyik érték kerüljön a mezőbe.
 *
 * Az `ellenorzott = true` sorokat EMBER hagyta jóvá — ott az automatika csak
 * a még üres mezőket töltheti, felülírni soha nem szabad. Egyébként a
 * frissebb dokumentum nyer, ha a mező felülírhatónak van jelölve.
 */
function valassz<T>(uj: T | null, regi: T | null, felulirhato: boolean): T | null {
  if (uj == null || uj === "") return regi;
  if (regi == null || regi === "") return uj;
  return felulirhato ? uj : regi;
}

/** Budapesti falióra-időpont ("2026-09-15" + "07:00") valós pillanattá — lásd lib/fuvarozas/idozona.ts. */
function ablakInstant(ablak: { datum: string; ido: string } | null): Date | null {
  if (!ablak) return null;
  const [ev, ho, nap] = ablak.datum.split("-").map(Number);
  const [ora, perc] = ablak.ido.split(":").map(Number);
  if (!ev || !ho || !nap) return null;
  return budapestFalioraToInstant(ev, ho, nap, ora ?? 0, perc ?? 0);
}

/** A dokumentumban talált rendszám-jelöltek közül az első, ami saját járműre illik. */
function sajatJarmu(dok: DuvenbeckDok) {
  for (const jelolt of dok.rendszamJeloltek) {
    const jarmu = findJarmuByPlate(jelolt);
    if (jarmu) return { jarmu, nyersRendszam: jelolt };
  }
  return { jarmu: null, nyersRendszam: dok.rendszamJeloltek[0] ?? null };
}

/**
 * A fuvar azonossága. Elsődlegesen az Út ID (Reise ID) — ez van mindkét
 * iraton, és ez a számlázási kulcs is. Ha kivételesen hiányozna, a megbízás
 * ID-ra esünk vissza, hogy a pár akkor is egy sorba kerüljön; ilyenkor a
 * pozíciószám üresen marad, és a meglévő "hiányzik a hivatkozási szám"
 * figyelmeztetés hívja fel rá a figyelmet — kitalált szám helyett.
 */
function azonossagKulcs(dok: DuvenbeckDok): string {
  return dok.reiseId ?? `TA${dok.megbizasId}`;
}

/**
 * Egy Duvenbeck-dokumentum feldolgozása. null, ha a szöveg nem Duvenbeck-irat
 * — ilyenkor a hívó az általános, LLM-es kivonatolással folytatja.
 */
export async function mentDuvenbeckDokumentumot(
  szoveg: string,
  file: { id: string; name: string; url: string }
): Promise<DuvenbeckMentes | null> {
  const dok = parseDuvenbeck(szoveg);
  if (!dok) return null;
  await requireEditPermission("fuvarozas");

  const kulcs = azonossagKulcs(dok);
  const rakomanylista = dok.tipus === "rakomanylista";
  const megbizas = dok.tipus === "megbizas";

  const felrako = megalloCimek(dok, "felrako") || null;
  const lerako = megalloCimek(dok, "lerako") || null;
  const elsoFelrako = dok.megallok.find((m) => m.szerep === "felrako") ?? null;
  const utolsoLerako = [...dok.megallok].reverse().find((m) => m.szerep === "lerako") ?? null;
  const { jarmu, nyersRendszam } = sajatJarmu(dok);

  const uj = {
    felrako,
    lerako,
    datum: elsoFelrako?.ablakTol?.datum ?? null,
    lerakasDatum: utolsoLerako?.ablakTol?.datum ?? null,
    idopont: elsoFelrako?.ablakTol?.ido ?? null,
    felrakasAblakTol: ablakInstant(elsoFelrako?.ablakTol ?? null),
    felrakasAblakIg: ablakInstant(elsoFelrako?.ablakIg ?? null),
    lerakasAblakTol: ablakInstant(utolsoLerako?.ablakTol ?? null),
    lerakasAblakIg: ablakInstant(utolsoLerako?.ablakIg ?? null),
    // A fuvardij oszlop egész szám — a Duvenbeck EUR-összegei a gyakorlatban
    // kerek értékek ("500,00"), de a kerekítés itt explicit, hogy egy
    // tizedesjegyes ár se dobjon adatbázis-hibát a cron-futásban.
    fuvardij: dok.fuvardij == null ? null : Math.round(dok.fuvardij),
    penznem: dok.penznem,
    suly: dok.sulyKg ? `${dok.sulyKg} kg` : null,
    sofor: nyersRendszam,
    jarmu: jarmu ? jarmuLabel(jarmu) : null,
    pozicioszam: dok.reiseId,
    postazasiCim: dok.szamlaCim,
  };

  async function keresMeglevot(): Promise<MeglevoSor | undefined> {
    const [sor] = await query<MeglevoSor>(
      `select id::text, ellenorzott, felrako, lerako, datum::text, lerakas_datum::text,
              idopont, fuvardij, suly, sofor, jarmu, pozicioszam, postazasi_cim, dokumentum_url
       from fuvar_megbizasok
       where reise_id = $1 and statusz <> 'torolt'
       limit 1`,
      [kulcs]
    );
    return sor;
  }

  let meglevo = await keresMeglevot();
  let fuvarId: string | null = null;
  let statusz: DuvenbeckMentes["statusz"] = "uj";

  if (!meglevo) {
    // A felrakó/lerakó NOT NULL — ha egyik iratból sem jött ki cím, inkább
    // ne hozzunk létre féllábú sort, hagyjuk az általános feldolgozásra.
    if (!uj.felrako || !uj.lerako || !uj.datum) return null;
    // A pár két tagja ugyanabban a szinkron-körben érkezik, és a "Frissítés"
    // gomb a cronnal egyszerre is futhat. Az "on conflict do nothing" miatt a
    // versenyt vesztő ág nem hasal el, hanem az összefűzésre esik vissza.
    const [beszurt] = await query<{ id: string }>(
      `insert into fuvar_megbizasok
         (tipus, datum, idopont, felrako, lerako, megrendelo, suly, jarmu, sofor,
          fuvardij, fuvardij_penznem, dokumentum_url, drive_file_id, forras, ellenorzott,
          lerakas_datum, pozicioszam, postazasi_cim, reise_id,
          felrakas_ablak_tol, felrakas_ablak_ig, lerakas_ablak_tol, lerakas_ablak_ig)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       on conflict (reise_id) where reise_id is not null do nothing
       returning id::text`,
      [
        "sajat",
        uj.datum,
        uj.idopont,
        uj.felrako,
        uj.lerako,
        MEGRENDELO,
        uj.suly,
        uj.jarmu,
        uj.sofor,
        uj.fuvardij,
        uj.penznem ?? "EUR",
        file.url,
        file.id,
        "pdf_import",
        false,
        uj.lerakasDatum,
        uj.pozicioszam,
        uj.postazasiCim,
        kulcs,
        uj.felrakasAblakTol,
        uj.felrakasAblakIg,
        uj.lerakasAblakTol,
        uj.lerakasAblakIg,
      ]
    );
    if (beszurt) {
      fuvarId = beszurt.id;
      statusz = "uj";
    } else {
      meglevo = await keresMeglevot();
      if (!meglevo) return null;
    }
  }

  if (meglevo) {
    const szabad = !meglevo.ellenorzott;
    // A cím CSAK a rakománylistából írható felül: a megbízás hasábos
    // elrendezéséből mindig gyengébb cím jön ki, és egy később érkező
    // javított megbízás (V2) nem ronthatja el a már jó címet.
    const cimFelulirhato = szabad && rakomanylista;
    // Az árat és a számlázási adatokat csak a megbízás hordozza.
    const arFelulirhato = szabad && megbizas;

    await query(
      `update fuvar_megbizasok set
         megrendelo = $2,
         felrako = coalesce($3, felrako),
         lerako = coalesce($4, lerako),
         datum = coalesce($5, datum),
         lerakas_datum = $6,
         idopont = $7,
         suly = $8,
         sofor = $9,
         jarmu = $10,
         fuvardij = $11,
         fuvardij_penznem = coalesce($12, fuvardij_penznem),
         pozicioszam = $13,
         postazasi_cim = $14,
         dokumentum_url = coalesce($15, dokumentum_url),
         felrakas_ablak_tol = coalesce($16, felrakas_ablak_tol),
         felrakas_ablak_ig = coalesce($17, felrakas_ablak_ig),
         lerakas_ablak_tol = coalesce($18, lerakas_ablak_tol),
         lerakas_ablak_ig = coalesce($19, lerakas_ablak_ig)
       where id = $1`,
      [
        meglevo.id,
        MEGRENDELO,
        valassz(uj.felrako, meglevo.felrako, cimFelulirhato),
        valassz(uj.lerako, meglevo.lerako, cimFelulirhato),
        valassz(uj.datum, meglevo.datum, cimFelulirhato),
        valassz(uj.lerakasDatum, meglevo.lerakas_datum, cimFelulirhato),
        valassz(uj.idopont, meglevo.idopont, cimFelulirhato),
        valassz(uj.suly, meglevo.suly, szabad),
        valassz(uj.sofor, meglevo.sofor, szabad),
        valassz(uj.jarmu, meglevo.jarmu, szabad),
        valassz(uj.fuvardij, meglevo.fuvardij, arFelulirhato),
        // Pénznemet csak az az irat állíthat, amin ár is van (a megbízás) —
        // különben egy rakománylista "EUR"-ra írna át egy Ft-os megbízást.
        arFelulirhato ? uj.penznem : null,
        valassz(uj.pozicioszam, meglevo.pozicioszam, arFelulirhato),
        valassz(uj.postazasiCim, meglevo.postazasi_cim, arFelulirhato),
        // A megbízás a "fő" dokumentum (azon van az ár és a feltételek) —
        // a listákból erre mutasson a link, ha van.
        megbizas || !meglevo.dokumentum_url ? file.url : null,
        uj.felrakasAblakTol,
        uj.felrakasAblakIg,
        uj.lerakasAblakTol,
        uj.lerakasAblakIg,
      ]
    );
    fuvarId = meglevo.id;
    statusz = "osszefuzve";
  }

  if (!fuvarId) return null;

  // A forrásfájl nyilvántartása — enélkül a párjába olvadt dokumentumot a
  // szinkron óránként újra feldolgozná, és ugyanez fogja meg a mappába
  // kétszer feltöltött, azonos tartalmú fájlokat is.
  await query(
    `insert into fuvar_dokumentumok (fuvar_id, drive_file_id, dokumentum_url, tipus, verzio, fajlnev)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (drive_file_id) do update set fuvar_id = excluded.fuvar_id`,
    [fuvarId, file.id, file.url, dok.tipus, dok.verzio, file.name]
  );

  return { statusz, fuvarId, reiseId: dok.reiseId };
}

/** Azok a Drive fájl-ID-k, amiket már bármelyik fuvarhoz hozzákötöttünk. */
export async function ismertDriveFileIdk(): Promise<Set<string>> {
  const sorok = await query<{ drive_file_id: string }>(
    `select drive_file_id from fuvar_dokumentumok
     union
     select drive_file_id from fuvar_megbizasok where drive_file_id is not null`
  );
  return new Set(sorok.map((s) => s.drive_file_id));
}
