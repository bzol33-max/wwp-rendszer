/**
 * EGYETLEN helyen eldöntve: egy fuvar (fuvar_megbizasok sor) melyik
 * Megbízások-fülön van. Korábban a hat fül lekérdezése (lib/fuvarozas/
 * megbizasok.ts több get*-függvénye) egymástól függetlenül, párhuzamosan
 * írta le ugyanazokat a feltételeket, ezért szét tudtak csúszni — egy sor
 * két fülön is látszhatott, vagy egyiken sem.
 *
 * Ez a fájl NEM "use server" fájl, ezért exportálhat konstansokat és
 * szinkron függvényt is; a "use server" fájlok (megbizasok.ts) innen
 * importálják a SQL-feltételt, a scriptek pedig a TS-tükröt.
 *
 * KÉT MEGVALÓSÍTÁS, EGY SZABÁLY:
 *   - FUVAR_HELY_SQL   — a Postgres CASE-kifejezés, amit a fül-lekérdezések
 *                        where-feltétele használ (`... = 'archiv'`).
 *   - getFuvarHelye()  — ugyanez TypeScriptben, egy már beolvasott sorra.
 *                        A scripts/fuvar-hely-ujrasorolas.mts ellenőrzi,
 *                        hogy a kettő minden meglévő soron ugyanazt adja.
 *   Ha a szabály változik, MINDKETTŐT ugyanúgy módosítsd.
 *
 * A SZABÁLY (a fülnevek a UI szerint — figyelem: tipus='sajat' a "Bér
 * fuvarok" fül, tipus='ber' a "Saját fuvarok" fül, lásd a megjegyzést
 * getMaiSajatFuvarok-nál a megbizasok.ts-ben):
 *   1. archiv          — postázva, és az 5 perces visszavonási ablak lejárt
 *                        (a hiányzó postazva_at "régen postázott"-nak számít);
 *                        VAGY tipus='ber' és a munka kész (nincs postázási
 *                        munkafolyamata, ezért a "kész" nála az archiválás).
 *   2. szamla_posta    — tipus='sajat', a munka kész, de még nincs postázva.
 *   3. ber_folyamatban — tipus='sajat', a munka még nem kész.
 *   4. sajat_folyamatban — tipus='ber', a munka még nem kész.
 *
 * "A munka kész" = kézzel Teljesítve-nek jelölve, VAGY a lerakás (ha nincs,
 * a felrakás) dátuma már elmúlt, VAGY már van számlaszáma. Az utolsó azért
 * kell, mert számla csak befejezett fuvarról készül: ha a lerakás dátuma
 * (tévedésből) jövőbeli, de van már számlaszám, a sor akkor is a Számla/
 * Posta fülre való, ahol postázni lehet — nem a "folyamatban" listába.
 */

import type { FuvarTipus } from "@/lib/fuvarozas/fuvar-constants";

export type FuvarHely = "ber_folyamatban" | "sajat_folyamatban" | "szamla_posta" | "archiv";

export const FUVAR_HELYEK: readonly FuvarHely[] = [
  "ber_folyamatban",
  "sajat_folyamatban",
  "szamla_posta",
  "archiv",
];

/** A fül UI-címkéje (lásd a tipus/fülnév csere megjegyzését fent). */
export const FUVAR_HELY_CIMKE: Record<FuvarHely, string> = {
  ber_folyamatban: "Bér fuvarok (folyamatban)",
  sajat_folyamatban: "Saját fuvarok (folyamatban)",
  szamla_posta: "Számla/Posta",
  archiv: "Archív",
};

/** Az 5 perces visszavonási ablak, amíg egy "Postázva" jelölésű fuvar még nem archiválódik automatikusan. */
export const ARCHIVALAS_ABLAK_PERC = 5;

/**
 * "Effektíve archivált": postázva, és az ablak lejárt. A hiányzó postazva_at-
 * ot "régen archivált"-nak vesszük. Enélkül a NULL továbbterjedne a <=
 * összehasonlításon (`true and NULL` = NULL), és a sor minden fül where-
 * feltételén elbukna — vagyis sehol nem látszana. Ilyen sor a
 * setFuvarPostazva-n keresztül nem keletkezik (az együtt írja a két mezőt),
 * de importból vagy kézi DB-javításból igen.
 */
export const FUVAR_EFFEKTIVE_ARCHIVALT_SQL = `(postazva and coalesce(postazva_at, '-infinity'::timestamptz) <= now() - interval '${ARCHIVALAS_ABLAK_PERC} minutes')`;

/** "A munka kész" — lásd a fájl fejlécét. */
export const FUVAR_MUNKA_KESZ_SQL = `(teljesitve or coalesce(lerakas_datum, datum) < current_date or coalesce(szamla_szam, '') <> '')`;

/** A fuvar helye a Megbízások fülei közt — CASE-kifejezés, a fuvar_megbizasok tábla oszlopaira hivatkozik. */
export const FUVAR_HELY_SQL = `(case
  when ${FUVAR_EFFEKTIVE_ARCHIVALT_SQL} or (tipus = 'ber' and ${FUVAR_MUNKA_KESZ_SQL}) then 'archiv'
  when ${FUVAR_MUNKA_KESZ_SQL} then 'szamla_posta'
  when tipus = 'ber' then 'sajat_folyamatban'
  else 'ber_folyamatban'
end)`;

/** A getFuvarHelye-hez szükséges minimális mezők (a FuvarRow ezeket mind tartalmazza). */
export type FuvarHelyBemenet = {
  tipus: FuvarTipus;
  /** A felrakás napja, YYYY-MM-DD. */
  datum_iso: string;
  /** A lerakás napja, YYYY-MM-DD, vagy null, ha megegyezik a felrakással. */
  lerakas_datum_iso: string | null;
  postazva: boolean;
  /** Postgres timestamptz szövegként (pl. "2026-09-16 10:00:00+00"), ISO-szöveg vagy Date. */
  postazva_at: string | Date | null;
  teljesitve: boolean;
  szamla_szam: string | null;
};

/**
 * Postgres timestamptz `::text` alakja ("2026-09-16 10:00:00.123+00" vagy
 * "+02") és az ISO alak is elfogadott. A "+00" végű időzóna-jelölést a Date
 * csak ":00"-lal kiegészítve érti meg minden futtatókörnyezetben.
 */
function idopontMs(ertek: string | Date): number {
  if (ertek instanceof Date) return ertek.getTime();
  let s = ertek.trim().replace(" ", "T");
  if (/[+-]\d{2}$/.test(s)) s += ":00";
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) throw new Error(`Értelmezhetetlen időpont: "${ertek}"`);
  return ms;
}

/**
 * A FUVAR_HELY_SQL TS-tükre egy beolvasott sorra.
 *
 * @param ma    A "mai nap" YYYY-MM-DD alakban — a SQL `current_date`-jének
 *              felel meg, ezért az adatbázistól kérd le (`current_date::text`),
 *              hogy az időzóna ne csússzon el a kettő közt.
 * @param most  A "most" a postázási ablak számításához (SQL: `now()`).
 */
export function getFuvarHelye(fuvar: FuvarHelyBemenet, ma: string, most: Date = new Date()): FuvarHely {
  const ablakMs = ARCHIVALAS_ABLAK_PERC * 60 * 1000;
  const postazvaAtMs = fuvar.postazva_at === null ? Number.NEGATIVE_INFINITY : idopontMs(fuvar.postazva_at);
  const effektiveArchivalt = fuvar.postazva && postazvaAtMs <= most.getTime() - ablakMs;

  const lerakasNap = fuvar.lerakas_datum_iso ?? fuvar.datum_iso;
  const munkaKesz =
    fuvar.teljesitve || lerakasNap < ma || (fuvar.szamla_szam ?? "") !== "";

  if (effektiveArchivalt || (fuvar.tipus === "ber" && munkaKesz)) return "archiv";
  if (munkaKesz) return "szamla_posta";
  return fuvar.tipus === "ber" ? "sajat_folyamatban" : "ber_folyamatban";
}
