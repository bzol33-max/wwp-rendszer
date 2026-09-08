export type JelenletEmployee = {
  id: string;
  name: string;
};

export type JelenletRow = {
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

// A napi 9 órás munkaidőhöz képesti eltérés percben (pozitív = túlóra,
// negatív = kevesebb, mint 9 óra). Null, ha nincs mindkét időpont rögzítve.
export function diffFromWorkday(
  arrival: string | null,
  departure: string | null
): number | null {
  if (!arrival || !departure) return null;
  return toMinutes(departure) - toMinutes(arrival) - WORKDAY_MINUTES;
}

export function formatDiff(minutes: number | null): string {
  if (minutes === null) return "—";
  const sign = minutes > 0 ? "+" : minutes < 0 ? "−" : "";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}:${String(m).padStart(2, "0")}`;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
