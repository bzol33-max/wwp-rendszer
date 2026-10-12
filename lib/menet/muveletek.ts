import "server-only";
import { withTransaction, type Querier } from "@/lib/db";
import { getMenetById } from "@/lib/menet/repo";
import { beszurFeladatokat, menetAdat, szerverTav } from "@/lib/menet/generalas";
import {
  ellenorizAtrendezest,
  ellenorizIndokot,
  ellenorizLezarasInvarianst,
  ellenorizVerziot,
  bovitettSorrend,
  epitMenetJavaslat,
  munkakSorrendben,
} from "@/lib/menet/menet-alap";
import { idobelyegMs } from "@/lib/fuvarozas2/napi-sorrend";
import type { TavFn } from "@/lib/menet/tipusok";

// Menetterv — az írási műveletek magja (szerver, jogosultság NÉLKÜL: a
// lib/menet/akciok.ts "use server" burkai ellenőrzik a jogot és adják a
// `ki`-t). Külön modul, hogy a valós adatbázison is tesztelhető legyen.
//
// Szabályok:
//   • jóváhagyás és átrendezés optimista zárral (verzio): elavult verzióra
//     érthető hibaüzenet, semmi nem íródik;
//   • átrendezéshez indok kell, a napló a régi és az új sorrendet is őrzi
//     (menet_esemeny + fuvar_valtozas);
//   • a feladat-lezárás CSAK az adott sor lezarva_at-ját állítja — a
//     következő sor sorszáma/típusa nem változhat (ellenőrizve, különben
//     visszagördül).

export type Valasz<T = object> = ({ ok: true } & T) | { ok: false; hiba: string };

const AZONOSITO = /^\d+$/;

async function zaroltMenet(tx: Querier, menetId: string) {
  const [m] = await tx<{ id: string; allapot: string; verzio: number; jarmu_id: string; nap: string }>(
    `select id::text, allapot, verzio, jarmu_id::text, nap::text from fuvar_menet where id = $1 for update`,
    [menetId]
  );
  return m ?? null;
}

/** Jóváhagyás: a javaslat sorrendje mostantól minden nézet sorrendje. */
export async function jovahagyMenet(menetId: string, verzio: number, ki: string): Promise<Valasz<{ verzio: number }>> {
  if (!AZONOSITO.test(menetId)) return { ok: false, hiba: "Érvénytelen menet." };
  const r = await withTransaction(async (tx): Promise<Valasz<{ verzio: number }>> => {
    const m = await zaroltMenet(tx, menetId);
    if (!m) return { ok: false, hiba: "Nincs ilyen menet." };
    const v = ellenorizVerziot(m.verzio, verzio);
    if (!v.ok) return v;
    if (m.allapot !== "javaslat") return { ok: false, hiba: "Ez a menet már jóvá van hagyva." };
    const [u] = await tx<{ verzio: number }>(
      `update fuvar_menet set allapot = 'jovahagyott', verzio = verzio + 1, jovahagyta = $2, jovahagyva_at = now(), modositva_at = now()
       where id = $1 returning verzio`,
      [menetId, ki]
    );
    const sorrend = await tx<{ megbizas_id: string | null; feladat_tipus: string }>(
      `select megbizas_id::text, feladat_tipus from menet_feladat where menet_id = $1 order by sorszam`,
      [menetId]
    );
    await tx(
      `insert into menet_esemeny (menet_id, esemeny, verzio, ki, reszletek) values ($1, 'jovahagyas', $2, $3, $4::jsonb)`,
      [menetId, u.verzio, ki, JSON.stringify({ sorrend: sorrend.map((s) => s.megbizas_id ?? s.feladat_tipus) })]
    );
    return { ok: true, verzio: u.verzio };
  });
  return r;
}

/**
 * Átrendezés (jóváhagyott / folyamatban lévő menet): `ujSorrend` a feladat-
 * id-k új sorrendje. A munkák sorrendje az új sorrend; az üres
 * pozicionálásokat, a TELJES idő-láncot (tervezett indulás / érkezés minden
 * feladatra) és a figyelmeztetéseket az új sorrendre újraszámolja (a lezárt
 * feladatok előtagja érintetlen marad).
 */
export async function atrendezMenet(menetId: string, verzio: number, ujSorrend: string[], ok: string, ki: string, tav: TavFn = szerverTav()): Promise<Valasz<{ verzio: number }>> {
  if (!AZONOSITO.test(menetId) || !Array.isArray(ujSorrend) || ujSorrend.some((x) => typeof x !== "string")) {
    return { ok: false, hiba: "Érvénytelen kérés." };
  }
  const indok = ellenorizIndokot(ok);
  if (!indok.ok) return indok;

  const menet = await getMenetById(menetId);
  if (!menet) return { ok: false, hiba: "Nincs ilyen menet." };
  const v = ellenorizVerziot(menet.verzio, verzio);
  if (!v.ok) return v;
  if (menet.allapot === "javaslat") return { ok: false, hiba: "Előbb hagyd jóvá a javaslatot, utána rendezd át (a javaslatot a gép óránként újraszámolja)." };
  if (menet.allapot === "lezart") return { ok: false, hiba: "Lezárt menet nem rendezhető át." };
  const ell = ellenorizAtrendezest(menet.feladatok, ujSorrend);
  if (!ell.ok) return ell;

  // A lezárt előtag (az utolsó lezárt feladatig) marad; utána újraszámolunk.
  const szerint = new Map(menet.feladatok.map((f) => [f.id, f]));
  const uj = ujSorrend.map((id) => szerint.get(id)!);
  const utolsoLezart = uj.reduce((h, f, i) => (f.lezarvaAt ? i : h), -1);
  const elotag = uj.slice(0, utolsoLezart + 1);
  const maradek = uj.slice(utolsoLezart + 1);
  const munkaSorrend = maradek.flatMap((f) => (f.megbizasId ? [f.megbizasId] : []));

  const adat = await menetAdat(menet.jarmuId, menet.nap);
  if (!adat) return { ok: false, hiba: "Nincs ilyen kocsi." };
  const benne = new Set(munkaSorrend);
  const munkak = adat.munkak.filter((m) => benne.has(m.id));
  const kimaradt = munkaSorrend.filter((id) => !munkak.some((m) => m.id === id));
  const utolso = elotag.at(-1);
  const ujFeladatok = await epitMenetJavaslat({
    ...adat,
    munkak,
    tav,
    sorrend: munkaSorrend,
    indulas: utolso ? { cim: utolso.celCim, pont: null, telephelyPontId: utolso.celTelephelyPontId } : adat.indulas,
    elsoIndulas: !utolso,
    sorszamKezdet: elotag.length + 1,
    // A lezárt előtag után: legkorábban a lezárásakor (különben a tervezett érkezésekor) indul tovább.
    legkorabbiIndulas: utolso ? idobelyegMs(utolso.lezarvaAt) ?? idobelyegMs(utolso.tervezettErkezes) : null,
  });

  const r = await withTransaction(async (tx): Promise<Valasz<{ verzio: number }>> => {
    const m = await zaroltMenet(tx, menetId);
    if (!m) return { ok: false, hiba: "Nincs ilyen menet." };
    const v2 = ellenorizVerziot(m.verzio, verzio);
    if (!v2.ok) return v2;
    // Az előtag sorszámai az új sorrendre (a halasztott egyediség a végén ellenőriz).
    for (let i = 0; i < elotag.length; i++) {
      await tx(`update menet_feladat set sorszam = $2 where id = $1 and menet_id = $3`, [elotag[i].id, i + 1, menetId]);
    }
    if (maradek.length) {
      await tx(`delete from menet_feladat where menet_id = $1 and lezarva_at is null and id = any($2::bigint[])`, [menetId, maradek.map((f) => f.id)]);
    }
    await beszurFeladatokat(tx, menetId, ujFeladatok);
    const [u] = await tx<{ verzio: number }>(
      `update fuvar_menet set verzio = verzio + 1, modositva_at = now() where id = $1 returning verzio`,
      [menetId]
    );
    const regiSorrend = [...menet.feladatok].sort((a, b) => a.sorszam - b.sorszam).map((f) => f.megbizasId ?? f.feladatTipus);
    const ujSorrendLeiras = [...elotag.map((f) => f.megbizasId ?? f.feladatTipus), ...ujFeladatok.map((f) => f.megbizasId ?? f.feladatTipus)];
    await tx(
      `insert into menet_esemeny (menet_id, esemeny, verzio, ki, ok, reszletek) values ($1, 'atrendezes', $2, $3, $4, $5::jsonb)`,
      [menetId, u.verzio, ki, ok.trim(), JSON.stringify({ regi: regiSorrend, uj: ujSorrendLeiras, ...(kimaradt.length ? { kimaradt } : {}) })]
    );
    await tx(
      `insert into fuvar_valtozas (tabla, sor_id, mezo, regi, uj, ki, ok) values ('fuvar_menet', $1, 'sorrend', $2, $3, $4, $5)`,
      [menetId, JSON.stringify(regiSorrend), JSON.stringify(ujSorrendLeiras), ki, ok.trim()]
    );
    return { ok: true, verzio: u.verzio };
  });
  return r;
}

/** Egy feladat lezárása (kész). Csak az adott sor lezarva_at-ja változik. */
export async function lezarMenetFeladatot(feladatId: string, ki: string): Promise<Valasz<{ verzio: number }>> {
  if (!AZONOSITO.test(feladatId)) return { ok: false, hiba: "Érvénytelen feladat." };
  try {
    return await withTransaction(async (tx): Promise<Valasz<{ verzio: number }>> => {
      const [f] = await tx<{ menet_id: string; sorszam: number }>(`select menet_id::text, sorszam from menet_feladat where id = $1`, [feladatId]);
      if (!f) return { ok: false, hiba: "Nincs ilyen feladat." };
      const m = await zaroltMenet(tx, f.menet_id);
      if (!m) return { ok: false, hiba: "Nincs ilyen menet." };
      if (m.allapot !== "jovahagyott" && m.allapot !== "folyamatban") return { ok: false, hiba: "Csak jóváhagyott menet feladata zárható le." };
      type S = { id: string; sorszam: number; feladatTipus: string; megbizasId: string | null; lezarvaAt: string | null };
      const pillanatkep = () =>
        tx<S>(
          `select id::text, sorszam, feladat_tipus as "feladatTipus", megbizas_id::text as "megbizasId", lezarva_at::text as "lezarvaAt"
           from menet_feladat where menet_id = $1 order by sorszam`,
          [f.menet_id]
        );
      const elotte = await pillanatkep();
      const [u] = await tx<{ id: string }>(`update menet_feladat set lezarva_at = now() where id = $1 and lezarva_at is null returning id::text`, [feladatId]);
      if (!u) return { ok: false, hiba: "Ez a feladat már le van zárva." };
      const utana = await pillanatkep();
      const sertes = ellenorizLezarasInvarianst(elotte, utana, feladatId);
      if (sertes) throw new Error(sertes); // visszagördül
      const mindKesz = utana.every((x) => x.lezarvaAt);
      const [mv] = await tx<{ verzio: number }>(
        `update fuvar_menet set allapot = $2, verzio = verzio + 1, modositva_at = now() where id = $1 returning verzio`,
        [f.menet_id, mindKesz ? "lezart" : "folyamatban"]
      );
      await tx(
        `insert into menet_esemeny (menet_id, esemeny, verzio, ki, reszletek) values ($1, 'feladat_lezarva', $2, $3, $4::jsonb)`,
        [f.menet_id, mv.verzio, ki, JSON.stringify({ feladat_id: feladatId, sorszam: f.sorszam, menet_lezart: mindKesz })]
      );
      return { ok: true, verzio: mv.verzio };
    });
  } catch (err) {
    console.error("[menetterv] feladat-lezárás hiba:", err);
    return { ok: false, hiba: err instanceof Error && err.message.includes("visszavonva") ? err.message : "Nem sikerült a lezárás." };
  }
}

/** Visszavonás: a jóváhagyott (még egyetlen lezárt feladat nélküli) menet újra javaslat — a nézetek visszaállnak a közös napi szabályra. */
export async function visszaJavaslatbaMenet(menetId: string, ki: string): Promise<Valasz<{ verzio: number }>> {
  if (!AZONOSITO.test(menetId)) return { ok: false, hiba: "Érvénytelen menet." };
  const r = await withTransaction(async (tx): Promise<Valasz<{ verzio: number }>> => {
    const m = await zaroltMenet(tx, menetId);
    if (!m) return { ok: false, hiba: "Nincs ilyen menet." };
    if (m.allapot === "javaslat") return { ok: false, hiba: "Ez a menet még csak javaslat." };
    const [{ db }] = await tx<{ db: number }>(`select count(*)::int as db from menet_feladat where menet_id = $1 and lezarva_at is not null`, [menetId]);
    if (db > 0) return { ok: false, hiba: "Már van lezárt feladata — nem vonható vissza javaslatba." };
    const [u] = await tx<{ verzio: number }>(
      `update fuvar_menet set allapot = 'javaslat', verzio = verzio + 1, jovahagyta = null, jovahagyva_at = null, modositva_at = now()
       where id = $1 returning verzio`,
      [menetId]
    );
    await tx(
      `insert into menet_esemeny (menet_id, esemeny, verzio, ki, reszletek) values ($1, 'vissza_javaslatba', $2, $3, $4::jsonb)`,
      [menetId, u.verzio, ki, JSON.stringify({ elozo_allapot: m.allapot })]
    );
    return { ok: true, verzio: u.verzio };
  });
  return r;
}

/**
 * Jóváhagyott / folyamatban lévő menet bővítése: ha a kocsira a nap folyamán új
 * megbízás került (vagy egy lekerült róla), a menet nyitott része újraépül — a
 * lezárt előtag érintetlen, a jóváhagyott sorrend marad, az új munka a közös napi
 * szabály szerinti helyére kerül (bovitettSorrend), az üres utak és az idő-lánc
 * újraszámolódik. Napló: menet_esemeny 'bovites' + fuvar_valtozas.
 */
export async function bovitJovahagyottMenetet(
  menetId: string,
  ki: string,
  tav: TavFn = szerverTav()
): Promise<Valasz<{ eredmeny: "valtozatlan" | "bovitve"; uj: string[]; kivett: string[] }>> {
  if (!AZONOSITO.test(menetId)) return { ok: false, hiba: "Érvénytelen menet." };
  const menet = await getMenetById(menetId);
  if (!menet) return { ok: false, hiba: "Nincs ilyen menet." };
  const valtozatlan = { ok: true as const, eredmeny: "valtozatlan" as const, uj: [] as string[], kivett: [] as string[] };
  if (menet.allapot !== "jovahagyott" && menet.allapot !== "folyamatban") return valtozatlan;
  const adat = await menetAdat(menet.jarmuId, menet.nap);
  if (!adat) return { ok: false, hiba: "Nincs ilyen kocsi." };

  const sorrendben = [...menet.feladatok].sort((a, b) => a.sorszam - b.sorszam);
  const utolsoLezart = sorrendben.reduce((h, f, i) => (f.lezarvaAt ? i : h), -1);
  const elotag = sorrendben.slice(0, utolsoLezart + 1);
  const maradek = sorrendben.slice(utolsoLezart + 1);
  const menetben = new Set(sorrendben.flatMap((f) => (f.megbizasId ? [f.megbizasId] : [])));
  const elotagban = new Set(elotag.flatMap((f) => (f.megbizasId ? [f.megbizasId] : [])));
  const kocsin = new Set(adat.munkak.map((m) => m.id));
  const uj = adat.munkak.filter((m) => !menetben.has(m.id)).map((m) => m.id);
  const kivett = maradek.flatMap((f) => (f.megbizasId && !kocsin.has(f.megbizasId) ? [f.megbizasId] : []));
  if (uj.length === 0 && kivett.length === 0) return valtozatlan;

  const nyitottMunkak = adat.munkak.filter((m) => !elotagban.has(m.id));
  const alap = munkakSorrendben(nyitottMunkak, null).map((m) => m.id);
  const mentettSorrend = maradek.flatMap((f) => (f.megbizasId ? [f.megbizasId] : []));
  const munkaSorrend = bovitettSorrend(mentettSorrend, alap);
  const utolso = elotag.at(-1);
  const ujFeladatok = await epitMenetJavaslat({
    ...adat,
    munkak: nyitottMunkak,
    tav,
    sorrend: munkaSorrend,
    indulas: utolso ? { cim: utolso.celCim, pont: null, telephelyPontId: utolso.celTelephelyPontId } : adat.indulas,
    elsoIndulas: !utolso,
    sorszamKezdet: elotag.length + 1,
    legkorabbiIndulas: utolso ? idobelyegMs(utolso.lezarvaAt) ?? idobelyegMs(utolso.tervezettErkezes) : null,
  });

  return withTransaction(async (tx) => {
    const m = await zaroltMenet(tx, menetId);
    // Közben valaki módosította — a következő kör újra megpróbálja.
    if (!m || m.verzio !== menet.verzio) return valtozatlan;
    if (maradek.length) {
      await tx(`delete from menet_feladat where menet_id = $1 and lezarva_at is null and id = any($2::bigint[])`, [menetId, maradek.map((f) => f.id)]);
    }
    await beszurFeladatokat(tx, menetId, ujFeladatok);
    const [u] = await tx<{ verzio: number }>(
      `update fuvar_menet set verzio = verzio + 1, modositva_at = now() where id = $1 returning verzio`,
      [menetId]
    );
    const regiSorrend = sorrendben.map((f) => f.megbizasId ?? f.feladatTipus);
    const ujSorrendLeiras = [...elotag.map((f) => f.megbizasId ?? f.feladatTipus), ...ujFeladatok.map((f) => f.megbizasId ?? f.feladatTipus)];
    const ok = `Új fuvar a kocsin${uj.length ? ` (+${uj.join(", ")})` : ""}${kivett.length ? `, lekerült: ${kivett.join(", ")}` : ""}`;
    await tx(
      `insert into menet_esemeny (menet_id, esemeny, verzio, ki, ok, reszletek) values ($1, 'bovites', $2, $3, $4, $5::jsonb)`,
      [menetId, u.verzio, ki, ok, JSON.stringify({ regi: regiSorrend, uj: ujSorrendLeiras, hozzaadva: uj, kivett })]
    );
    await tx(
      `insert into fuvar_valtozas (tabla, sor_id, mezo, regi, uj, ki, ok) values ('fuvar_menet', $1, 'sorrend', $2, $3, $4, $5)`,
      [menetId, JSON.stringify(regiSorrend), JSON.stringify(ujSorrendLeiras), ki, ok]
    );
    return { ok: true as const, eredmeny: "bovitve" as const, uj, kivett };
  });
}
