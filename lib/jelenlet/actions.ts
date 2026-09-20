"use server";

import { revalidatePath } from "next/cache";
import { query, withTransaction } from "@/lib/db";
import { requireSession } from "@/lib/auth/dal";
import {
  requireAnyEditPermission,
  requireAnyViewPermission,
  requireEditPermission,
  requireSajatVagyModulJog,
  requireViewPermission,
} from "@/lib/auth/require-permission";
import {
  kovetkezoEsedekesseg,
  type DayType,
  type Feladat,
  type FeladatComment,
  type JelenletEmployee,
  type JelenletSession,
  type RepeatFreq,
  type Site,
  type SzabadsagKeret,
} from "@/lib/jelenlet/shared";

// A Railway-konténer (és a hozzá tartozó Postgres session) alapértelmezett
// időzónája UTC, nem Europe/Budapest — lásd lib/fuvarozas/idozona.ts
// hasonló megjegyzését. A sima `current_date`/`localtime`/`now()` ezért a
// szerver (UTC) faliórát adná vissza, ami nyáron 2, télen 1 órával eltér a
// valós budapesti időtől, és éjfél körül akár a naptári napot is elcsúsztatja.
// Minden itt rögzített/összehasonlított dátum-idő ezért explicit
// `at time zone 'Europe/Budapest'` konverzióval számol, a szerver
// időzóna-beállításától függetlenül.
const BUDAPEST_NOW_DATE = `(now() at time zone 'Europe/Budapest')::date`;
const BUDAPEST_NOW_TIME = `(now() at time zone 'Europe/Budapest')::time`;

// A jelenlét-sorok közös oszloplistája — mindenhol ugyanaz a alakzat megy ki
// a kliensre (lásd JelenletSession). Az idő HH:MM-re formázva, a dátum
// YYYY-MM-DD-re: nyers `time`/`date` értéket nem adunk ki, mert a pg
// objektumot adna vissza, amit a React nem tud megjeleníteni.
const SESSION_COLS = `id::text, employee_id::text, to_char(work_date, 'YYYY-MM-DD') as work_date,
   to_char(arrival_time, 'HH24:MI') as arrival_time,
   to_char(departure_time, 'HH24:MI') as departure_time,
   day_type, note`;

const FELADAT_COLS = `f.id::text, to_char(f.task_date, 'YYYY-MM-DD') as task_date, f.site_id,
   s.name as site_name, f.description, f.urgency, f.repeat_freq, f.done,
   to_char(f.elvegzes_datum, 'YYYY-MM-DD') as elvegzes_datum,
   f.created_by, to_char(f.created_at at time zone 'Europe/Budapest', 'YYYY-MM-DD HH24:MI') as created_at`;

function revalidateJelenlet() {
  revalidatePath("/jelenlet");
  revalidatePath("/jelenlet/archivum");
  revalidatePath("/erkezes");
}

// --- Jelenlét (érkezés/távozás) ---

export async function getJelenletEmployees(): Promise<JelenletEmployee[]> {
  await requireViewPermission("jelenlet");
  return query<JelenletEmployee>(
    `select id::text, name from alkalmazottak
     where jelenlet_aktiv = true and active = true
     order by position, id`
  );
}

// A mai nap ÖSSZES szakasza, minden dolgozónál (egy dolgozónak több sora is
// lehet, ha többször érkezett/távozott aznap).
export async function getTodayJelenletek(): Promise<JelenletSession[]> {
  const jog = await requireAnyViewPermission(["jelenlet", "erkezes"]);
  const rows = await query<JelenletSession>(
    `select ${SESSION_COLS}
     from jelenletek
     where work_date = ${BUDAPEST_NOW_DATE}
     order by arrival_time nulls last, id`
  );
  // Az önkiszolgáló "erkezes" jog csak a saját sorokra szól — eddig a teljes
  // napi lista ment ki, és a kliens szűrte. Most a szerver szűr.
  if (jog === "erkezes") {
    const session = await requireSession();
    return rows.filter((r) => r.employee_id === session.employeeId);
  }
  return rows;
}

/** Egy tetszőleges nap szakaszai, minden jelenlét-aktív dolgozóval (admin nézet). */
export async function getNapJelenletek(workDate: string): Promise<JelenletSession[]> {
  await requireViewPermission("jelenlet");
  return query<JelenletSession>(
    `select ${SESSION_COLS} from jelenletek where work_date = $1
     order by employee_id, arrival_time nulls last, id`,
    [workDate]
  );
}

export async function getJelenletHistory(
  employeeId: string,
  days = 14
): Promise<JelenletSession[]> {
  await requireViewPermission("jelenlet");
  return query<JelenletSession>(
    `select ${SESSION_COLS}
     from jelenletek
     where employee_id = $1 and work_date >= ${BUDAPEST_NOW_DATE} - $2::int
     order by work_date desc, id`,
    [employeeId, days]
  );
}

export async function getMonthJelenletek(
  employeeId: string,
  year: number,
  month: number
): Promise<JelenletSession[]> {
  await requireViewPermission("jelenlet");
  return query<JelenletSession>(
    `select ${SESSION_COLS}
     from jelenletek
     where employee_id = $1
       and work_date >= make_date($2, $3, 1)
       and work_date < (make_date($2, $3, 1) + interval '1 month')
     order by work_date, id`,
    [employeeId, year, month]
  );
}

/**
 * Egy teljes hónap MINDEN jelenlét-aktív dolgozóval, egyetlen lekérdezésben —
 * a havi nézet (hetekre bontott napló) ezt használja. Korábban dolgozónként
 * indult külön lekérdezés, ami két embernél is két kör volt, és minden új
 * dolgozóval eggyel több.
 */
export async function getMonthJelenletekMind(
  year: number,
  month: number
): Promise<JelenletSession[]> {
  await requireViewPermission("jelenlet");
  return query<JelenletSession>(
    `select ${SESSION_COLS}
     from jelenletek j
     where work_date >= make_date($1, $2, 1)
       and work_date < (make_date($1, $2, 1) + interval '1 month')
       and exists (select 1 from alkalmazottak a
                    where a.id = j.employee_id and a.jelenlet_aktiv and a.active)
     order by work_date, employee_id, arrival_time nulls last, id`,
    [year, month]
  );
}

/**
 * A javításra váró napok: ahol van hiányos munkaszakasz (érkezés távozás
 * nélkül, vagy távozás érkezés nélkül). A Jelenlét oldal figyelmeztető sávja
 * és a dolgozói mobil piros sávja ebből dolgozik. A mai nap nyitott szakasza
 * NEM hiba (még bent van), ezért az kimarad.
 */
export type NyitottNap = {
  employee_id: string;
  employee_name: string;
  work_date: string;
  session_id: string;
  arrival_time: string | null;
  departure_time: string | null;
};

export async function getNyitottNapok(napVissza = 60): Promise<NyitottNap[]> {
  const jog = await requireAnyViewPermission(["jelenlet", "erkezes"]);
  const rows = await query<NyitottNap>(
    `select j.employee_id::text, a.name as employee_name,
       to_char(j.work_date, 'YYYY-MM-DD') as work_date, j.id::text as session_id,
       to_char(j.arrival_time, 'HH24:MI') as arrival_time,
       to_char(j.departure_time, 'HH24:MI') as departure_time
     from jelenletek j
     join alkalmazottak a on a.id = j.employee_id
     where j.day_type = 'munka'
       and (j.arrival_time is null or j.departure_time is null)
       and j.work_date < ${BUDAPEST_NOW_DATE}
       and j.work_date >= ${BUDAPEST_NOW_DATE} - $1::int
     order by j.work_date desc, a.position, j.id`,
    [napVissza]
  );
  if (jog === "erkezes") {
    const session = await requireSession();
    return rows.filter((r) => r.employee_id === session.employeeId);
  }
  return rows;
}

// --- Admin (Jelenlét oldal): kézi szakasz-kezelés ---

/**
 * Új szakasz felvitele BÁRMELY napra (nem csak a maira). Korábban a gomb
 * azonnal beszúrt egy üres sort (se érkezés, se távozás), ami a listában
 * lógott és semmit nem jelentett — ezért legalább az egyik időpont kötelező.
 */
export async function createJelenletSession(input: {
  employeeId: string;
  workDate: string;
  arrivalTime: string | null;
  departureTime: string | null;
  note?: string | null;
}) {
  await requireEditPermission("jelenlet");
  if (!input.arrivalTime && !input.departureTime) {
    throw new Error("Az érkezés vagy a távozás időpontja kötelező.");
  }
  await query(
    `insert into jelenletek (employee_id, work_date, arrival_time, departure_time, note)
     values ($1, $2, $3, $4, $5)`,
    [
      input.employeeId,
      input.workDate,
      input.arrivalTime,
      input.departureTime,
      input.note?.trim() || null,
    ]
  );
  revalidateJelenlet();
}

export async function updateJelenletSession(
  id: string,
  input: { arrivalTime: string | null; departureTime: string | null; note?: string | null }
) {
  await requireEditPermission("jelenlet");
  await query(
    `update jelenletek set arrival_time = $2, departure_time = $3, note = $4 where id = $1`,
    [id, input.arrivalTime, input.departureTime, input.note?.trim() || null]
  );
  revalidateJelenlet();
}

export async function deleteJelenletSession(id: string) {
  await requireEditPermission("jelenlet");
  await query(`delete from jelenletek where id = $1`, [id]);
  revalidateJelenlet();
}

/**
 * Egy nap típusának beállítása adminként: szabadság vagy betegszabadság az
 * EGÉSZ napra. Egy napon nem keveredhet többféle bejegyzés (2026-09-08-án
 * pontosan ez történt: munkaszakaszok, szabadság és betegszabadság egyszerre),
 * ezért a nap minden korábbi sora törlődik, és egyetlen távollét-sor marad.
 * dayType = null esetén a távollét törlődik, a nap üres lesz.
 */
export async function setJelenletNapTipus(input: {
  employeeId: string;
  workDate: string;
  dayType: Exclude<DayType, "munka"> | null;
  note?: string | null;
}) {
  await requireEditPermission("jelenlet");
  await withTransaction(async (q) => {
    await q(`delete from jelenletek where employee_id = $1 and work_date = $2`, [
      input.employeeId,
      input.workDate,
    ]);
    if (input.dayType) {
      await q(
        `insert into jelenletek (employee_id, work_date, day_type, note)
         values ($1, $2, $3, $4)`,
        [input.employeeId, input.workDate, input.dayType, input.note?.trim() || null]
      );
    }
  });
  revalidateJelenlet();
}

/** A nyitva maradt szakasz lezárása egy megadott időponttal (admin, egy kattintás). */
export async function lezarJelenletSession(id: string, departureTime: string) {
  await requireEditPermission("jelenlet");
  if (!departureTime) throw new Error("Add meg a távozás időpontját.");
  await query(`update jelenletek set departure_time = $2 where id = $1`, [id, departureTime]);
  revalidateJelenlet();
}

// --- Saját (mobil) nézet: egy koppintással rögzíti a jelenlegi időt ---
// Egy nap többször is használható — minden "Érkezés" koppintás ÚJ szakaszt
// nyit, a "Távozás" pedig a legutóbb nyitva hagyott (távozás nélküli)
// mai szakaszt zárja le. Így le lehet fedni azt is, ha valaki hazamegy,
// majd később visszajön (pl. kamiont pakolni).

async function sajatJelenletJog(employeeId: string) {
  await requireSajatVagyModulJog({
    employeeId,
    sajatModule: "erkezes",
    modul: "jelenlet",
    kind: "edit",
  });
}

export async function recordArrivalNow(employeeId: string, note?: string) {
  await sajatJelenletJog(employeeId);
  // Kétszer megnyomott gomb ellen: 2026-09-08-án azonos percre nyitott-zárt
  // szakaszok keletkeztek, mert a képernyő nem mondta meg, hogy már bent van.
  // A felület mostantól tiltja a gombot, a szerver pedig visszautasítja.
  const nyitott = await query<{ id: string }>(
    `select id::text from jelenletek
     where employee_id = $1 and work_date = ${BUDAPEST_NOW_DATE}
       and day_type = 'munka' and arrival_time is not null and departure_time is null
     limit 1`,
    [employeeId]
  );
  if (nyitott.length > 0) {
    throw new Error("Már bent vagy — előbb a távozást rögzítsd.");
  }
  await query(
    `insert into jelenletek (employee_id, work_date, arrival_time, note)
     values ($1, ${BUDAPEST_NOW_DATE}, ${BUDAPEST_NOW_TIME}, $2)`,
    [employeeId, note?.trim() || null]
  );
  revalidateJelenlet();
}

export async function recordDepartureNow(employeeId: string, note?: string) {
  await sajatJelenletJog(employeeId);
  const updated = await query<{ id: string }>(
    `update jelenletek
     set departure_time = ${BUDAPEST_NOW_TIME}, note = coalesce($2, note)
     where id = (
       select id from jelenletek
       where employee_id = $1 and work_date = ${BUDAPEST_NOW_DATE}
         and day_type = 'munka' and arrival_time is not null and departure_time is null
       order by arrival_time desc nulls last, id desc
       limit 1
     )
     returning id`,
    [employeeId, note?.trim() || null]
  );
  if (updated.length === 0) {
    // Korábban ilyenkor önálló, érkezés NÉLKÜLI sor keletkezett. Az ilyen sor
    // sosem ad munkaidőt (nincs mihez mérni), csendben rontotta az egyenleget,
    // és csak az adminnak volt látható hiányos napként. Inkább nem írunk.
    throw new Error("Nincs nyitott szakaszod — előbb az érkezést rögzítsd.");
  }
  revalidateJelenlet();
}

// Szabadság / Betegszabadság: az egész napot távollétnek jelöli (nincs
// érkezés/távozás-idő), és a nap minden más bejegyzését felváltja — egy napra
// nem kerülhet egyszerre munka, szabadság és betegszabadság. A felület
// megerősítést kér, mielőtt ezt hívja.
export async function recordAbszenciaNow(
  employeeId: string,
  dayType: "szabadsag" | "beteg",
  note?: string
) {
  await sajatJelenletJog(employeeId);
  await withTransaction(async (q) => {
    await q(
      `delete from jelenletek where employee_id = $1 and work_date = ${BUDAPEST_NOW_DATE}`,
      [employeeId]
    );
    await q(
      `insert into jelenletek (employee_id, work_date, day_type, note)
       values ($1, ${BUDAPEST_NOW_DATE}, $2, $3)`,
      [employeeId, dayType, note?.trim() || null]
    );
  });
  revalidateJelenlet();
}

/**
 * Az utolsó mai rögzítés visszavonása a telefonon (téves koppintás). Csak a
 * friss (10 percen belüli) bejegyzésre működik, hogy egy délelőtti szakaszt
 * ne lehessen véletlenül eltüntetni. Sorrend: nyitott szakasz törlése, majd
 * a frissen beírt távozás visszavonása, végül a mai távollét törlése.
 */
export async function undoUtolsoJelenlet(employeeId: string): Promise<string> {
  await sajatJelenletJog(employeeId);
  const nyitott = await query<{ id: string }>(
    `select id::text from jelenletek
     where employee_id = $1 and work_date = ${BUDAPEST_NOW_DATE}
       and day_type = 'munka' and arrival_time is not null and departure_time is null
       and created_at > now() - interval '10 minutes'
     order by id desc limit 1`,
    [employeeId]
  );
  if (nyitott.length > 0) {
    await query(`delete from jelenletek where id = $1`, [nyitott[0].id]);
    revalidateJelenlet();
    return "Az érkezés visszavonva.";
  }
  const frissTavozas = await query<{ id: string }>(
    `select id::text from jelenletek
     where employee_id = $1 and work_date = ${BUDAPEST_NOW_DATE}
       and day_type = 'munka' and departure_time is not null
       and departure_time > ${BUDAPEST_NOW_TIME} - interval '10 minutes'
     order by departure_time desc, id desc limit 1`,
    [employeeId]
  );
  if (frissTavozas.length > 0) {
    await query(`update jelenletek set departure_time = null where id = $1`, [frissTavozas[0].id]);
    revalidateJelenlet();
    return "A távozás visszavonva, a szakasz újra nyitva.";
  }
  const abszencia = await query<{ id: string }>(
    `select id::text from jelenletek
     where employee_id = $1 and work_date = ${BUDAPEST_NOW_DATE} and day_type <> 'munka'
       and created_at > now() - interval '10 minutes'
     order by id desc limit 1`,
    [employeeId]
  );
  if (abszencia.length > 0) {
    await query(`delete from jelenletek where id = $1`, [abszencia[0].id]);
    revalidateJelenlet();
    return "A bejegyzés visszavonva.";
  }
  throw new Error("Nincs mit visszavonni (csak a 10 percnél frissebb rögzítés vonható vissza).");
}

// --- Szabadságkeret (dolgozói mobil Profil) ---

/**
 * Hány nap szabadság vehető még ki. A fordulónapon még kivehető napok
 * számából (bérjegyzékről átvett érték, lásd db/migrations/006) levonjuk a
 * fordulónap UTÁN rögzített szabadság-napokat. Betegszabadság nem fogyaszt.
 * Null, ha a dolgozóhoz nincs keret beállítva.
 */
export async function getSzabadsagKeret(employeeId: string): Promise<SzabadsagKeret | null> {
  await requireSajatVagyModulJog({
    employeeId,
    sajatModule: "erkezes",
    modul: "jelenlet",
    kind: "view",
  });
  const rows = await query<{ keret: number | null; fordulonap: string | null; felhasznalt: number }>(
    `select a.szabadsag_keret_nap as keret,
       to_char(a.szabadsag_keret_datum, 'YYYY-MM-DD') as fordulonap,
       (select count(distinct j.work_date) from jelenletek j
         where j.employee_id = a.id and j.day_type = 'szabadsag'
           and j.work_date > a.szabadsag_keret_datum) as felhasznalt
     from alkalmazottak a where a.id = $1`,
    [employeeId]
  );
  const r = rows[0];
  if (!r || r.keret === null || !r.fordulonap) return null;
  // A pg a count()-ot (bigint) szövegként adja vissza — lásd CLAUDE.md.
  const felhasznalt = Number(r.felhasznalt);
  const keret = Number(r.keret);
  return {
    keret,
    fordulonap: r.fordulonap,
    felhasznalt,
    maradek: Math.max(0, keret - felhasznalt),
  };
}

// --- Feladatok (üzenőfal) ---

export async function getSites(): Promise<Site[]> {
  // A dolgozói mobil telephely-fülei is ezt kérik — ott az "erkezes" jog szól.
  await requireAnyViewPermission(["jelenlet", "erkezes"]);
  return query<Site>(`select id, name from sites order by id`);
}

/**
 * A nyitott (nem kész) telephelyi feladatok. A sofőrök gondjelzései NEM
 * jelennek meg itt: azok ugyanebbe a táblába íródnak, de forras='sofor_gond'
 * jelöléssel, és a Fuvarozás/Áttekintés olvassa vissza őket (lásd
 * lib/fuvarozas/sofor.ts jelezGondot).
 *
 * A jövőbeli (még nem esedékes) példányok is benne vannak — a felület
 * választja szét őket a marLathato() szerint: ami 3 napon belül esedékes, az
 * a telephely oszlopába kerül, a többi az "Ütemezett" sorba.
 */
export async function listFeladatok(): Promise<Feladat[]> {
  await requireAnyViewPermission(["jelenlet", "erkezes"]);
  return query<Feladat>(
    `select ${FELADAT_COLS}
     from feladatok f
     join sites s on s.id = f.site_id
     where f.done = false and f.forras = 'jelenlet'
     order by f.urgency asc, f.task_date asc, f.id asc`
  );
}

export async function getArchivedFeladatok(): Promise<Feladat[]> {
  await requireViewPermission("jelenlet");
  return query<Feladat>(
    `select ${FELADAT_COLS}
     from feladatok f
     join sites s on s.id = f.site_id
     where f.done = true and f.forras = 'jelenlet'
     order by f.elvegzes_datum desc nulls last, f.id desc`
  );
}

export async function createFeladat(input: {
  taskDate: string;
  siteId: number;
  description: string;
  urgency: number;
  repeatFreq: RepeatFreq;
  createdBy?: string;
}) {
  await requireEditPermission("jelenlet");
  const description = input.description.trim();
  if (!description) throw new Error("A feladat leírása kötelező.");
  if (input.urgency < 1 || input.urgency > 5) {
    throw new Error("A sürgősség 1 és 5 között lehet.");
  }
  await query(
    `insert into feladatok (task_date, site_id, description, urgency, repeat_freq, created_by, forras)
     values ($1, $2, $3, $4, $5, $6, 'jelenlet')`,
    [
      input.taskDate,
      input.siteId,
      description,
      input.urgency,
      input.repeatFreq,
      input.createdBy ?? null,
    ]
  );
  revalidateJelenlet();
}

/**
 * Készre jelentés / visszanyitás.
 *
 * Ismétlődő feladatnál a készre jelentés archívumba teszi a sort, és rögtön
 * létrehozza a KÖVETKEZŐ példányt (az előző kiadási dátumához igazodva, hogy
 * a ritmus ne csússzon el). Az új példány a nyitott listákon csak 3 nappal az
 * esedékessége előtt jelenik meg. A sorozat_id köti össze a láncot: enélkül
 * egy visszanyitás után minden újabb készre jelentés újabb példányt gyártana.
 *
 * Visszanyitáskor a még nem esedékes (jövőbeli) testvér-példány törlődik — a
 * visszanyitott sor veszi át a helyét, nem lóg ott mindkettő.
 */
export async function toggleFeladatDone(id: string, done: boolean) {
  // A dolgozói mobil feladat-csempéjéről is jelölhető késznek.
  await requireAnyEditPermission(["jelenlet", "erkezes"]);
  await withTransaction(async (q) => {
    const rows = await q<{
      id: string;
      task_date: string;
      site_id: number;
      description: string;
      urgency: number;
      repeat_freq: RepeatFreq;
      created_by: string | null;
      sorozat_id: string | null;
      forras: string;
    }>(
      `select id::text, to_char(task_date, 'YYYY-MM-DD') as task_date, site_id, description,
         urgency, repeat_freq, created_by, sorozat_id::text, forras
       from feladatok where id = $1 for update`,
      [id]
    );
    const f = rows[0];
    if (!f) return;

    await q(
      `update feladatok
       set done = $2, elvegzes_datum = case when $2 then ${BUDAPEST_NOW_DATE} else null end
       where id = $1`,
      [id, done]
    );

    if (f.repeat_freq === "egyszeri" || f.forras !== "jelenlet") return;
    const sorozat = f.sorozat_id ?? f.id;

    if (done) {
      // Van-e már nyitott példánya ennek a sorozatnak? (Pl. mert korábban
      // visszanyitottak egyet, vagy kétszer koppintottak a kész gombra.)
      const nyitott = await q<{ id: string }>(
        `select id::text from feladatok
         where done = false and coalesce(sorozat_id, id) = $1::bigint and id <> $2::bigint
         limit 1`,
        [sorozat, f.id]
      );
      if (nyitott.length > 0) return;

      const mai = await q<{ ma: string }>(`select to_char(${BUDAPEST_NOW_DATE}, 'YYYY-MM-DD') as ma`);
      const kovetkezo = kovetkezoEsedekesseg(f.task_date, f.repeat_freq, String(mai[0].ma));
      if (!kovetkezo) return;
      await q(
        `insert into feladatok (task_date, site_id, description, urgency, repeat_freq,
           created_by, forras, sorozat_id)
         values ($1, $2, $3, $4, $5, $6, 'jelenlet', $7::bigint)`,
        [kovetkezo, f.site_id, f.description, f.urgency, f.repeat_freq, f.created_by, sorozat]
      );
      // Az első példányon még nincs sorozat_id — visszamenőleg beírjuk, hogy
      // a lánc mindkét vége ugyanarra az azonosítóra mutasson.
      if (!f.sorozat_id) {
        await q(`update feladatok set sorozat_id = $1::bigint where id = $1::bigint`, [sorozat]);
      }
    } else {
      await q(
        `delete from feladatok
         where done = false and coalesce(sorozat_id, id) = $1::bigint and id <> $2::bigint
           and task_date > ${BUDAPEST_NOW_DATE}`,
        [sorozat, f.id]
      );
    }
  });
  revalidateJelenlet();
}

export async function deleteFeladat(id: string) {
  await requireEditPermission("jelenlet");
  await query(`delete from feladatok where id = $1`, [id]);
  revalidateJelenlet();
}

export async function getFeladatComments(feladatId: string): Promise<FeladatComment[]> {
  await requireAnyViewPermission(["jelenlet", "erkezes"]);
  return query<FeladatComment>(
    `select id::text, feladat_id::text, author, comment,
       to_char(created_at at time zone 'Europe/Budapest', 'YYYY-MM-DD HH24:MI') as created_at
     from feladat_megjegyzesek
     where feladat_id = $1
     order by created_at asc, id asc`,
    [feladatId]
  );
}

export async function addFeladatComment(input: {
  feladatId: string;
  author?: string;
  comment: string;
}) {
  // A dolgozók a saját (mobil) nézetükből írnak ide vissza ("a felét
  // megcsináltam"), nekik viszont a teljes "jelenlet" modulra nincs joguk —
  // eddig ezért minden küldés hibára futott, és egyetlen megjegyzés sem
  // született a rendszerben. Az "erkezes" jog is feljogosít.
  await requireAnyEditPermission(["jelenlet", "erkezes"]);
  const comment = input.comment.trim();
  if (!comment) throw new Error("A megjegyzés nem lehet üres.");
  await query(
    `insert into feladat_megjegyzesek (feladat_id, author, comment) values ($1, $2, $3)`,
    [input.feladatId, input.author ?? null, comment]
  );
  revalidateJelenlet();
}

/**
 * Telephelyenként hány feladatot jelentettek ma készre — a nyitókép oszlopai
 * ezt írják ki a lábukban, hogy a nap munkája ne tűnjön el nyomtalanul
 * (a kész feladat azonnal lekerül a listáról az archívumba).
 */
export async function getMaiKeszSzamok(): Promise<Record<number, number>> {
  await requireAnyViewPermission(["jelenlet", "erkezes"]);
  const rows = await query<{ site_id: number; db: string }>(
    `select site_id, count(*)::text as db
     from feladatok
     where done = true and forras = 'jelenlet' and elvegzes_datum = ${BUDAPEST_NOW_DATE}
     group by site_id`
  );
  // A pg a count()-ot (bigint) szövegként adja vissza — lásd CLAUDE.md.
  return Object.fromEntries(rows.map((r) => [r.site_id, Number(r.db)]));
}
