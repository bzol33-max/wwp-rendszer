export type JelenletEmployee = {
  id: string;
  name: string;
};

// Egy munkaidő-szakasz (session) — egy nap TÖBB is lehet ugyanannál a
// dolgozónál (pl. hazamegy, majd visszajön kamiont pakolni), ezért ez NEM
// egy teljes napot azonosít, csak egy érkezés-távozás párt.
export type JelenletSession = {
  id: string;
  employee_id: string;
  work_date: string; // YYYY-MM-DD
  arrival_time: string | null; // HH:MM
  departure_time: string | null; // HH:MM
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
  workedMinutes: number;
  diffMinutes: number | null;
};

/** Napi bontás, a legfrissebb nap elöl — egy nap összes szakaszával és eltérésével. */
export function summarizeByDay(sessions: JelenletSession[]): DaySummary[] {
  const byDate = groupSessionsByDate(sessions);
  return Array.from(byDate.entries())
    .map(([date, daySessions]) => {
      const sorted = [...daySessions].sort((a, b) =>
        (a.arrival_time ?? "").localeCompare(b.arrival_time ?? "")
      );
      return {
        date,
        sessions: sorted,
        workedMinutes: sumWorkedMinutes(sorted),
        diffMinutes: dayDiffFromWorkday(sorted),
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
