export type JelenletEmployee = {
  id: string;
  name: string;
};

export type DayType = "munka" | "szabadsag" | "beteg";

export const DAY_TYPE_LABELS: Record<DayType, string> = {
  munka: "Munka",
  szabadsag: "Szabadság",
  beteg: "Betegszabadság",
};

// Egy munkaidő-szakasz (session) — egy nap TÖBB is lehet ugyanannál a
// dolgozónál (pl. hazamegy, majd visszajön kamiont pakolni), ezért ez NEM
// egy teljes napot azonosít, csak egy érkezés-távozás párt. A day_type
// 'szabadsag'/'beteg' esetén a sor nem munkaidő-szakasz, hanem az egész
// napot jelöli távollétnek — ilyenkor arrival/departure üres.
export type JelenletSession = {
  id: string;
  employee_id: string;
  work_date: string; // YYYY-MM-DD
  arrival_time: string | null; // HH:MM
  departure_time: string | null; // HH:MM
  day_type: DayType;
  note: string | null;
};

export type RepeatFreq = "egyszeri" | "heti" | "ketheti" | "havi";

export type Feladat = {
  id: string;
  task_date: string;
  site_id: number;
  site_name: string;
  description: string;
  urgency: number;
  repeat_freq: RepeatFreq;
  done: boolean;
  elvegzes_datum: string | null;
  created_by: string | null;
  created_at: string;
};

export type Site = { id: number; name: string };

export type FeladatComment = {
  id: string;
  feladat_id: string;
  author: string | null;
  comment: string;
  created_at: string;
};

// Sürgősség: 1 = piros/azonnali … 5 = zöld/ráér.
export const URGENCY_LEVELS = [1, 2, 3, 4, 5] as const;

export const URGENCY_LABELS: Record<number, string> = {
  1: "Azonnali",
  2: "Sürgős",
  3: "Közepes",
  4: "Nem sürgős",
  5: "Ráér",
};

export const URGENCY_COLORS: Record<number, string> = {
  1: "bg-red-500",
  2: "bg-orange-500",
  3: "bg-yellow-500",
  4: "bg-lime-500",
  5: "bg-green-500",
};

export const REPEAT_LABELS: Record<RepeatFreq, string> = {
  egyszeri: "Egyszeri",
  heti: "Heti",
  ketheti: "Kétheti",
  havi: "Havi",
};

const WORKDAY_MINUTES = 9 * 60;

function toMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

/** Egy lezárt (érkezés+távozás) szakasz hossza percben, null ha nyitott. */
export function sessionMinutes(session: JelenletSession): number | null {
  if (!session.arrival_time || !session.departure_time) return null;
  return toMinutes(session.departure_time) - toMinutes(session.arrival_time);
}

/** Több szakasz összes ledolgozott ideje percben (csak a lezárt szakaszok számítanak). */
export function sumWorkedMinutes(sessions: JelenletSession[]): number {
  return sessions.reduce((sum, s) => sum + (sessionMinutes(s) ?? 0), 0);
}

// A napi 9 órás munkaidőhöz képesti eltérés percben, az adott nap ÖSSZES
// szakaszát összeadva (pozitív = túlóra, negatív = kevesebb, mint 9 óra).
// Null, ha aznap egyetlen lezárt szakasz sincs még.
export function dayDiffFromWorkday(sessions: JelenletSession[]): number | null {
  const hasClosed = sessions.some((s) => s.arrival_time && s.departure_time);
  if (!hasClosed) return null;
  return sumWorkedMinutes(sessions) - WORKDAY_MINUTES;
}

// Egy nap típusa: ha van rajta szabadság/betegszabadság sor, az egész nap
// annak számít (nem munkanapnak) — az eltérés-számítás ilyenkor kimarad,
// hogy egy szabadnap ne jelenjen meg hamis "-9:00"-ként.
export function dayType(sessions: JelenletSession[]): DayType {
  return sessions.find((s) => s.day_type !== "munka")?.day_type ?? "munka";
}

export function formatDiff(minutes: number | null): string {
  if (minutes === null) return "—";
  const sign = minutes > 0 ? "+" : minutes < 0 ? "−" : "";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}:${String(m).padStart(2, "0")}`;
}

export function groupSessionsByDate(sessions: JelenletSession[]): Map<string, JelenletSession[]> {
  const map = new Map<string, JelenletSession[]>();
  for (const s of sessions) {
    const list = map.get(s.work_date) ?? [];
    list.push(s);
    map.set(s.work_date, list);
  }
  return map;
}

export type DaySummary = {
  date: string;
  sessions: JelenletSession[];
  dayType: DayType;
  workedMinutes: number;
  diffMinutes: number | null;
  /**
   * Van a napon hiányos munkaszakasz (nincs távozás, vagy nincs érkezés).
   * Ilyenkor a nap hossza nem ismert, ezért diffMinutes null, és a nap sem a
   * heti, sem a havi egyenlegbe nem számít bele — amíg az admin le nem zárja.
   */
  nyitott: boolean;
};

/** Napi bontás, a legfrissebb nap elöl — egy nap összes szakaszával és eltérésével. */
export function summarizeByDay(sessions: JelenletSession[]): DaySummary[] {
  const byDate = groupSessionsByDate(sessions);
  return Array.from(byDate.entries())
    .map(([date, daySessions]) => {
      const sorted = [...daySessions].sort((a, b) =>
        (a.arrival_time ?? "").localeCompare(b.arrival_time ?? "")
      );
      const type = dayType(sorted);
      // A hiányos szakasz korábban csendben kimaradt az összeadásból: egy
      // 07:00-kor nyitva hagyott nap "−9:00"-ként jelent meg, mintha ott se
      // lett volna senki. Most a nap jelöletlen marad, és az admin zárja le.
      const nyitott = type === "munka" && vanNyitottSzakasz(sorted);
      return {
        date,
        sessions: sorted,
        dayType: type,
        workedMinutes: sumWorkedMinutes(sorted),
        diffMinutes: type === "munka" && !nyitott ? dayDiffFromWorkday(sorted) : null,
        nyitott,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** A hónap összes napi eltérésének összege ("mennyi plusz/mínusz van a hónapban"). */
export function monthlyTotalDiff(days: DaySummary[]): number {
  return days.reduce((sum, d) => sum + (d.diffMinutes ?? 0), 0);
}

export function currentYearMonth(): { year: number; month: number } {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

// FONTOS: NEM new Date().toISOString() — az mindig UTC-re konvertál, ami
// éjfél körül (a böngésző helyi ideje szerinti 00:00 és a UTC-eltolódás
// közötti sávban, pl. hajnal 1-2-ig nyáron) az ELŐZŐ napot adná vissza. A
// getFullYear/getMonth/getDate a Date objektum böngésző szerinti HELYI
// (a felhasználó gépén beállított, jellemzően Europe/Budapest) naptári
// napját adja — ez a helyes "ma" egy dátum-mezőhöz.
export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const HU_MONTH_ABBR = [
  "jan.", "febr.", "márc.", "ápr.", "máj.", "jún.",
  "júl.", "aug.", "szept.", "okt.", "nov.", "dec.",
] as const;

export type WeekInfo = { mondayIso: string; year: number; week: number; label: string };

// ISO 8601 hét (hétfőtől indul, az 1. hét az, amiben az adott év első
// csütörtöke van) — az Archívum ez alapján csoportosítja a kész feladatokat.
export function weekInfo(dateStr: string): WeekInfo {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // hétfő = 0
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - dow);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  const thursday = new Date(monday);
  thursday.setUTCDate(monday.getUTCDate() + 3);
  const isoYear = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Dow = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Dow);
  const week = Math.round((thursday.getTime() - week1Monday.getTime()) / (7 * 86400000)) + 1;

  const fmt = (x: Date) => `${HU_MONTH_ABBR[x.getUTCMonth()]} ${x.getUTCDate()}.`;
  const label = `${isoYear}. ${week}. hét (${fmt(monday)} – ${fmt(sunday)})`;

  return { mondayIso: monday.toISOString().slice(0, 10), year: isoYear, week, label };
}

// ---------------------------------------------------------------------------
// Ismétlődő feladatok (2026-09-20)
// ---------------------------------------------------------------------------

/**
 * Hány nappal az esedékesség ELŐTT jelenjen meg egy feladat a nyitott
 * listákon (Jelenlét oldal, dolgozói mobil). Budaházi Zoltán kérése: a
 * készre jelentett ismétlődő feladat archívumba kerül, és "esedékessége
 * előtt 3 nappal újra megjelenik".
 */
export const LATHATO_NAPPAL = 3;

function napokkalEltolva(datum: string, napok: number): string {
  const [ev, ho, nap] = datum.split("-").map(Number);
  const d = new Date(Date.UTC(ev, ho - 1, nap + napok));
  return d.toISOString().slice(0, 10);
}

function honappalEltolva(datum: string, honapok: number): string {
  const [ev, ho, nap] = datum.split("-").map(Number);
  // Hónap-végi csúszás kezelése: jan. 31. + 1 hónap = febr. 28./29., nem
  // márc. 3. (a Date magától átfordulna a következő hónapra).
  const cel = new Date(Date.UTC(ev, ho - 1 + honapok, 1));
  const utolsoNap = new Date(Date.UTC(cel.getUTCFullYear(), cel.getUTCMonth() + 1, 0)).getUTCDate();
  cel.setUTCDate(Math.min(nap, utolsoNap));
  return cel.toISOString().slice(0, 10);
}

/**
 * Egy ismétlődő feladat következő esedékessége. Az ALAP az előző példány
 * kiadási dátuma (nem a készre jelentés napja) — így a heti feladat megtartja
 * a ritmusát akkor is, ha egyszer később végezték el. Ha a számított nap már
 * elmúlt (késve jelentették készre), addig léptetjük, amíg a mai nap utánra
 * nem kerül. Egyszeri feladatnál null.
 */
export function kovetkezoEsedekesseg(
  elozoTaskDate: string,
  freq: RepeatFreq,
  maIso: string = todayIso()
): string | null {
  if (freq === "egyszeri") return null;
  const lepes = (d: string) =>
    freq === "heti" ? napokkalEltolva(d, 7)
      : freq === "ketheti" ? napokkalEltolva(d, 14)
        : honappalEltolva(d, 1);
  let kovetkezo = lepes(elozoTaskDate);
  // Védelem a végtelen ciklus ellen (elrontott dátum): legfeljebb 60 lépés,
  // ami heti ismétlődésnél is több mint egy év.
  for (let i = 0; i < 60 && kovetkezo <= maIso; i++) kovetkezo = lepes(kovetkezo);
  return kovetkezo;
}

/** Látszik-e már a nyitott listákon? Esedékes, vagy LATHATO_NAPPAL napon belül az lesz. */
export function marLathato(taskDate: string, maIso: string = todayIso()): boolean {
  return taskDate <= napokkalEltolva(maIso, LATHATO_NAPPAL);
}

// ---------------------------------------------------------------------------
// Nyitva maradt nap és heti összesítés (2026-09-20)
// ---------------------------------------------------------------------------

/**
 * Van-e a napon nyitva hagyott munkaszakasz (érkezés van, távozás nincs)?
 * Ilyenkor a nap hossza nem ismert, ezért a nap NEM számít bele sem a heti,
 * sem a havi egyenlegbe — az admin egy kattintással lezárja, és onnantól
 * beleszámít. A csak-távozás sor (elfelejtett érkezés) ugyanígy hiányos.
 */
export function vanNyitottSzakasz(sessions: JelenletSession[]): boolean {
  return sessions.some(
    (s) => s.day_type === "munka" && (!s.arrival_time || !s.departure_time)
  );
}

export type WeekSummary = {
  week: WeekInfo;
  days: DaySummary[];
  /** A hét lezárt napjainak összege percben. */
  diffMinutes: number;
  workedDays: number;
  szabadsagDays: number;
  betegDays: number;
  nyitottDays: number;
};

/** A napokat ISO-hetekbe csoportosítja, a legfrissebb hét elöl. */
export function summarizeByWeek(days: DaySummary[]): WeekSummary[] {
  const map = new Map<string, WeekSummary>();
  for (const d of days) {
    const w = weekInfo(d.date);
    const meglevo = map.get(w.mondayIso);
    const cel: WeekSummary =
      meglevo ??
      { week: w, days: [], diffMinutes: 0, workedDays: 0, szabadsagDays: 0, betegDays: 0, nyitottDays: 0 };
    cel.days.push(d);
    if (d.nyitott) cel.nyitottDays++;
    else if (d.dayType === "szabadsag") cel.szabadsagDays++;
    else if (d.dayType === "beteg") cel.betegDays++;
    else {
      cel.workedDays++;
      cel.diffMinutes += d.diffMinutes ?? 0;
    }
    map.set(w.mondayIso, cel);
  }
  for (const w of map.values()) w.days.sort((a, b) => a.date.localeCompare(b.date));
  return Array.from(map.values()).sort((a, b) => b.week.mondayIso.localeCompare(a.week.mondayIso));
}

// ---------------------------------------------------------------------------
// Szabadságkeret (dolgozói mobil Profil, 2026-09-20)
// ---------------------------------------------------------------------------

/**
 * Hány nap szabadság vehető még ki. A fordulónapon még kivehető napok
 * számából (a bérjegyzékről átvett érték) levonjuk a fordulónap UTÁN
 * rögzített szabadság-napokat. A betegszabadság nem fogyaszt keretet.
 * Null, ha a dolgozóhoz nincs keret beállítva — ilyenkor a Profil nem
 * mutat szabadság-szakaszt.
 */
export type SzabadsagKeret = {
  /** A fordulónapon még kivehető napok száma. */
  keret: number;
  fordulonap: string;
  /** A fordulónap óta jelentett szabadság-napok száma. */
  felhasznalt: number;
  /** Ennyi vehető még ki (nem megy nulla alá). */
  maradek: number;
};

// A sürgősség színe a listasor bal szélén végigfutó sávként is megjelenik
// (Jelenlét oldal, telephely-oszlopok). A meleg tónusú alaptémán egy apró
// pötty önmagában alig olvasható, a sávval viszont egy pillantás alatt
// végig lehet futni a listán. Ugyanaz az öt szín, mint az URGENCY_COLORS-ban.
export const URGENCY_BORDERS: Record<number, string> = {
  1: "border-l-red-500",
  2: "border-l-orange-500",
  3: "border-l-yellow-500",
  4: "border-l-lime-500",
  5: "border-l-green-500",
};

// A nap típusának színe (Jelenlét sáv és havi napló): a szabadság kék, a
// betegszabadság borostyán — ugyanaz a két szín, mint a dolgozói mobilon,
// hogy a két felület ne mondjon mást ugyanarról a napról.
export const DAY_TYPE_STYLES: Record<Exclude<DayType, "munka">, string> = {
  szabadsag: "border-blue-300 bg-blue-100 text-blue-700",
  beteg: "border-orange-300 bg-orange-100 text-orange-700",
};

/**
 * A havi naptár megjelenítendő hetei: a hónap elejét megelőző hétfőtől a
 * hónap végét követő vasárnapig, hetes csoportokban (hétfővel kezdve). A
 * szomszédos hónapba lógó napok is benne vannak — nélkülük a hónap szélén
 * álló hét összege csonka lenne, hiszen a hét egy része átlóg.
 */
export function honapHetei(ev: number, honap: number): string[][] {
  const elso = new Date(Date.UTC(ev, honap - 1, 1));
  const elsoDow = (elso.getUTCDay() + 6) % 7; // hétfő = 0
  const kurzor = new Date(elso);
  kurzor.setUTCDate(1 - elsoDow);

  const utolsoNap = new Date(Date.UTC(ev, honap, 0)).getUTCDate();
  const veg = new Date(Date.UTC(ev, honap - 1, utolsoNap));
  const vegDow = (veg.getUTCDay() + 6) % 7;
  const zaras = new Date(veg);
  zaras.setUTCDate(utolsoNap + (6 - vegDow));

  const hetek: string[][] = [];
  while (kurzor <= zaras) {
    const het: string[] = [];
    for (let i = 0; i < 7; i++) {
      het.push(kurzor.toISOString().slice(0, 10));
      kurzor.setUTCDate(kurzor.getUTCDate() + 1);
    }
    hetek.push(het);
  }
  return hetek;
}
