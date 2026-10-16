import "server-only";
import { withTransaction, type Querier } from "@/lib/db";
import { getMenetById } from "@/lib/menet/repo";
import { beszurFeladatokat, menetAdat, szerverTav } from "@/lib/menet/generalas";
import { bovitettSorrend, epitMenetJavaslat, munkakSorrendben } from "@/lib/menet/menet-alap";
import { idobelyegMs } from "@/lib/fuvarozas2/napi-sorrend";
import type { TavFn } from "@/lib/menet/tipusok";

// Menetterv — a jóváhagyott menet bővítése (szerver, jogosultság NÉLKÜL; a
// hívó a lib/menet/generalas.ts frissitMegbizasMenetet, kocsira adás után).
// Optimista zár (verzio): ha közben változott a menet, nem ír semmit.
// 2026-10-16 (docs/fuvarozas-1-hullam-terv.md D1): a jóváhagyás, az
// átrendezés, a feladat-lezárás és a visszavonás felület nélkül maradt —
// törölve; a tiszta ellenőrzőik a menet-alap.ts-ben maradtak.

export type Valasz<T = object> = ({ ok: true } & T) | { ok: false; hiba: string };

const AZONOSITO = /^\d+$/;

async function zaroltMenet(tx: Querier, menetId: string) {
  const [m] = await tx<{ id: string; allapot: string; verzio: number; jarmu_id: string; nap: string }>(
    `select id::text, allapot, verzio, jarmu_id::text, nap::text from fuvar_menet where id = $1 for update`,
    [menetId]
  );
  return m ?? null;
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
