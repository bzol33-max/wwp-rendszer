// Fuvarozás 2 — a Levelek tárolása és feldolgozása (E9a).
//
// NEM "use server" fájl: a route handlerek (app/api/fuvarozas2/gmail/*) és a
// szerver-akciók is hívják, és googleapis-t húz be a Drive-feltöltéshez.
//
// A folyamat:
//   1. A felhasználó Gmail-fiókjában futó Apps Script 5 percenként beküldi az
//      új levelek METAADATÁT (docs/gmail-fuvar-figyelo.gs).
//   2. Itt osztályozzuk (lib/fuvarozas2/level-osztalyozo.ts, determinisztikus).
//   3. A megbízásnak/papírnak ítélt leveleknél `csatolmany_kell = true`.
//   4. A script a következő körben feltölti azok csatolmányát; a megbízás
//      irata a Drive „Fuvarmegbízások" mappájába kerül, ahonnan a MEGLÉVŐ
//      drive-sync importálja — nem írunk új import-utat.

import { query } from "@/lib/db";
import { osztalyozLevelet, AUTO_DRIVE_BIZALOM, type LevelBemenet, type LevelOsztaly } from "@/lib/fuvarozas2/level-osztalyozo";
import { feltoltMegbizasIratot } from "@/lib/fuvarozas/drive-sync-core";

export type BeerkezoLevel = LevelBemenet & {
  gmailMessageId: string;
  gmailThreadId?: string | null;
  feladoNev?: string | null;
  erkezett: string;
};

export type BeveteliEredmeny = { uj: number; ismert: number; kert: string[] };

function domainja(cim: string): string {
  const m = /@([^\s>]+)/.exec(cim.trim().toLowerCase());
  return m ? m[1].replace(/>$/, "") : "";
}

/** A figyelő által beküldött metaadatok osztályozása és mentése. Idempotens a gmail_message_id-ra. */
export async function veszLeveleket(levelek: BeerkezoLevel[]): Promise<BeveteliEredmeny> {
  let uj = 0;
  let ismert = 0;
  for (const l of levelek) {
    const o = osztalyozLevelet(l);
    const partner = o.partnerKod
      ? await query<{ id: string }>(
          `select p.id::text from fuvar_partnerek p
           where p.sablon_azonosito = $1 or lower(p.nev) = lower($2) limit 1`,
          [o.partnerKod, o.partnerNev]
        )
      : [];
    const csatolmanyKell = o.csatolmanyKell && (o.bizalom >= AUTO_DRIVE_BIZALOM || o.osztaly === "megbizas");
    const sorok = await query<{ id: string }>(
      `insert into fuvar_level (gmail_message_id, gmail_thread_id, felado, felado_nev, felado_domain, cimzettek,
         targy, snippet, erkezett, szal_elso, csatolmany_nevek, osztaly, bizalom, indoklas, partner_kod, partner_id,
         hivatkozas, rendszam, csatolmany_kell)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       on conflict (gmail_message_id) do nothing
       returning id::text`,
      [
        l.gmailMessageId, l.gmailThreadId ?? null, l.felado, l.feladoNev ?? null, domainja(l.felado), l.cimzettek ?? [],
        l.targy, l.snippet, l.erkezett, l.szalElso ?? true, l.csatolmanyNevek ?? [], o.osztaly, o.bizalom, o.indoklas,
        o.partnerKod, partner[0]?.id ?? null, o.hivatkozas, o.rendszam, csatolmanyKell,
      ]
    );
    if (sorok.length > 0) uj++;
    else ismert++;
  }
  await jelezFutast({ utolso_bevetel: new Date().toISOString(), utolso_darab: levelek.length });
  return { uj, ismert, kert: await kertCsatolmanyok() };
}

/** A levél szövegének felső határa (a megbízás-levelek néhány ezer karakteresek). */
const MAX_TORZS = 50_000;

/**
 * Mely levelek TELJES szövegét kérjük: csak a megbízásnak osztályozottakét
 * (a többi levél törzse nem kell és nem is jön), az utolsó 14 napból.
 */
export async function kertTorzsek(): Promise<string[]> {
  const sorok = await query<{ gmail_message_id: string }>(
    `select gmail_message_id from fuvar_level
     where coalesce(kezi_osztaly, osztaly) = 'megbizas' and torzs is null and allapot <> 'elvetve'
       and erkezett >= now() - interval '14 days'
     order by erkezett desc limit 20`
  );
  return sorok.map((s) => s.gmail_message_id);
}

/** A megbízás-levél szövegének mentése (a figyelő küldi; más osztályú levélét eldobjuk). */
export async function veszTorzset(gmailMessageId: string, torzs: string): Promise<{ ok: boolean; hiba?: string }> {
  const szoveg = torzs.replace(/\r\n/g, "\n").trim().slice(0, MAX_TORZS);
  const sorok = await query<{ id: string }>(
    `update fuvar_level set torzs = $2, torzs_at = now()
     where gmail_message_id = $1 and coalesce(kezi_osztaly, osztaly) = 'megbizas'
     returning id::text`,
    [gmailMessageId, szoveg]
  );
  return sorok.length > 0 ? { ok: true } : { ok: false, hiba: "ismeretlen vagy nem megbízás-levél" };
}

/** Mely levelek csatolmányát várjuk a figyelőtől (Gmail message id lista). */
export async function kertCsatolmanyok(): Promise<string[]> {
  const sorok = await query<{ gmail_message_id: string }>(
    `select gmail_message_id from fuvar_level
     where csatolmany_kell and csatolmany_megjott_at is null and allapot <> 'elvetve'
     order by erkezett desc limit 20`
  );
  return sorok.map((s) => s.gmail_message_id);
}

/**
 * A levél megkeresése és a csatolmány-igény ellenőrzése — a két
 * csatolmány-út (Drive-azonosító, illetve tartalom) közös eleje.
 */
async function csatolmanyCelLevel(
  gmailMessageId: string
): Promise<{ ok: true; levelId: string } | { ok: false; hiba: string }> {
  const [level] = await query<{ id: string; osztaly: string; kezi_osztaly: string | null }>(
    `select id::text, osztaly, kezi_osztaly from fuvar_level where gmail_message_id = $1`,
    [gmailMessageId]
  );
  if (!level) return { ok: false, hiba: "ismeretlen levél" };
  const osztaly = (level.kezi_osztaly ?? level.osztaly) as LevelOsztaly;
  if (osztaly !== "megbizas" && osztaly !== "papirok") {
    await query(`update fuvar_level set csatolmany_kell = false where id = $1`, [level.id]);
    return { ok: false, hiba: "ehhez a levélhez nem kérünk csatolmányt" };
  }
  return { ok: true, levelId: level.id };
}

async function rogzitCsatolmanyt(levelId: string, driveId: string, driveUrl: string): Promise<void> {
  await query(
    `update fuvar_level set csatolmany_megjott_at = now(), csatolmany_kell = false, drive_file_id = $2, drive_url = $3 where id = $1`,
    [levelId, driveId, driveUrl]
  );
}

/**
 * A figyelő MÁR feltöltötte a csatolmányt a Drive figyelt mappájába (a saját
 * fiókja kvótájából) — itt csak rögzítjük. Ez az elsődleges út.
 *
 * MIÉRT: a mappa egy személyes Google-fiók My Drive-jában van, a szerver
 * viszont service accounttal hitelesít, annak pedig nincs tárhelykvótája —
 * `files.create` 403 `storageQuotaExceeded`-del elszáll (2026-09-20, éles
 * 500-ak a /csatolmany végponton). Olvasni tud, ezért a drive-sync megy.
 */
export async function veszCsatolmanyDriveId(
  gmailMessageId: string,
  fajl: { driveFileId: string; driveUrl?: string | null }
): Promise<{ ok: boolean; driveId?: string; hiba?: string }> {
  const cel = await csatolmanyCelLevel(gmailMessageId);
  if (!cel.ok) return { ok: false, hiba: cel.hiba };
  const url = fajl.driveUrl?.trim() || `https://drive.google.com/file/d/${fajl.driveFileId}/view`;
  await rogzitCsatolmanyt(cel.levelId, fajl.driveFileId, url);
  return { ok: true, driveId: fajl.driveFileId };
}

/**
 * Tartalék út: a figyelő a fájl tartalmát küldte (mert a saját Drive-
 * feltöltése nem sikerült). A szerver tölti fel — ez a service account
 * kvótája miatt ma elszállhat, ezért csak tartalék.
 */
export async function veszCsatolmanyt(
  gmailMessageId: string,
  fajl: { nev: string; mimeType: string; tartalom: Buffer }
): Promise<{ ok: boolean; driveId?: string; hiba?: string }> {
  const cel = await csatolmanyCelLevel(gmailMessageId);
  if (!cel.ok) return { ok: false, hiba: cel.hiba };
  const feltoltve = await feltoltMegbizasIratot(fajl.nev, fajl.mimeType || "application/pdf", fajl.tartalom);
  await rogzitCsatolmanyt(cel.levelId, feltoltve.id, feltoltve.url);
  return { ok: true, driveId: feltoltve.id };
}

export async function jelezFutast(ertek: Record<string, unknown>): Promise<void> {
  await query(
    `insert into gmail_figyelo_allapot (kulcs, ertek, frissitve_at) values ('figyelo', $1::jsonb, now())
     on conflict (kulcs) do update set ertek = gmail_figyelo_allapot.ertek || excluded.ertek, frissitve_at = now()`,
    [JSON.stringify(ertek)]
  );
}
