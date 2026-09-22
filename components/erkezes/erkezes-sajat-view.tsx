"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  IdCard,
  LogOut,
  Package,
  Truck,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { logout } from "@/lib/auth/actions";
import { MOBIL_THEME } from "@/lib/mobil-theme";
import { PullToRefresh } from "@/components/mobil/pull-to-refresh";
import { EditPermissionProvider } from "@/components/auth/edit-permission-context";
import {
  getSzabadsagKeret,
  getTodayJelenletek,
  recordAbszenciaNow,
  recordArrivalNow,
  recordDepartureNow,
  undoUtolsoJelenlet,
} from "@/lib/jelenlet/actions";
import {
  formatDiff,
  sumWorkedMinutes,
  type JelenletSession,
  type SzabadsagKeret,
} from "@/lib/jelenlet/shared";
import { FeladatokMobilCsempe } from "@/components/erkezes/feladatok-mobil-csempe";
import { getSiteSnapshot, type IncomingRow } from "@/lib/keszlet/actions";
import { MovementForm } from "@/components/keszlet/movement-form";
import { BejovoSzallitmanyok } from "@/components/keszlet/bejovo-szallitmanyok";
import { MobilLeltar, MobilSzetvalogatas } from "@/components/erkezes/keszlet-mobil";
import type { Direction } from "@/lib/keszlet/actions";
import {
  acceptAdvance,
  getEmployeeElolegek,
  type EmployeeElolegekOsszesito,
} from "@/lib/dolgozok/actions";
import { HU_MONTHS, ft } from "@/lib/dolgozok/shared";
import { SoforFuvarNap } from "@/components/erkezes/sofor-fuvar-nap";

type Screen = "home" | "jelenlet" | "feladatok" | "keszlet" | "profil" | "fuvarok";
type ModulePermission = { view: boolean; edit: boolean };

const KESZLET_SITES = ["Szakoly", "Balkány"] as const;
type KeszletSite = (typeof KESZLET_SITES)[number];

// Az elfogadásra váró előleg sávja MINDEN képernyő tetején ott van, amíg rá
// nem nyomnak — Budaházi Zoltán kérése: értesítés nem kell, de "mindig
// kapjanak" jelzést és "lássák az egyenleget". Külön push-értesítés nincs,
// ezért ez a sáv az egyetlen, ami biztosan a szemük elé kerül.
const ElolegSavContext = createContext<{ fuggo: number; onOpen: () => void }>({
  fuggo: 0,
  onOpen: () => {},
});

function ElolegSav() {
  const { fuggo, onOpen } = useContext(ElolegSavContext);
  if (fuggo === 0) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2 rounded-xl border-2 border-destructive bg-destructive/10 px-3 py-2.5 text-left"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
      <span className="flex-1 text-sm font-semibold text-destructive">
        {fuggo === 1 ? "Egy előleged vár elfogadásra" : `${fuggo} előleged vár elfogadásra`}
      </span>
      <span className="text-xs font-semibold text-destructive">Megnézem →</span>
    </button>
  );
}

// Közös keret minden képernyőhöz: Menta-antracit színséma + lehúzásra
// frissítés (ld. AGENTS.md "Mobil felület — kötelező konvenciók").
function Shell({ children, onBack }: { children: React.ReactNode; onBack?: () => void }) {
  // Visszalépés lapozással: a képernyő BAL SZÉLÉRŐL jobbra húzva ugyanaz
  // történik, mint a fejléc nyilával — natív app-szerű mozdulat, kesztyűben
  // is eltalálható. Csak a szélső sávból (48 px) indulhat, hogy a listák
  // görgetését és a lehúzásra frissítést ne zavarja.
  const huzasKezdet = useRef<{ x: number; y: number } | null>(null);

  function touchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    huzasKezdet.current = t && t.clientX <= 48 ? { x: t.clientX, y: t.clientY } : null;
  }

  function touchEnd(e: React.TouchEvent) {
    const kezdet = huzasKezdet.current;
    huzasKezdet.current = null;
    if (!kezdet || !onBack) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - kezdet.x;
    const dy = Math.abs(t.clientY - kezdet.y);
    if (dx > 70 && dy < 60) onBack();
  }

  return (
    <div
      style={MOBIL_THEME}
      className="mx-auto flex h-dvh max-w-md flex-col overflow-hidden bg-[var(--mob-bg)] text-[var(--mob-text)]"
      onTouchStart={onBack ? touchStart : undefined}
      onTouchEnd={onBack ? touchEnd : undefined}
    >
      <PullToRefresh className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 px-4 py-4">
          <ElolegSav />
          {children}
        </div>
      </PullToRefresh>
    </div>
  );
}

const HU_NAPOK = ["vasárnap", "hétfő", "kedd", "szerda", "csütörtök", "péntek", "szombat"] as const;

/** "2026. szept. 18., péntek" — a fejlécben, hogy tudják, melyik napról van szó. */
function maiNapFelirat(): string {
  const d = new Date();
  return `${d.getFullYear()}. ${HU_MONTHS[d.getMonth()].slice(0, 4)}. ${d.getDate()}., ${HU_NAPOK[d.getDay()]}`;
}

function Header({ employeeName, onBack }: { employeeName: string; onBack?: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center justify-center rounded-md p-1 text-[var(--mob-muted)] hover:bg-[var(--mob-tile)]"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <div>
          <h1 className="text-base font-semibold">{employeeName}</h1>
          <p className="text-xs text-[var(--mob-muted)]">{maiNapFelirat()}</p>
        </div>
      </div>
      <form action={logout}>
        <button
          type="submit"
          className="flex items-center gap-1 text-xs text-[var(--mob-muted)] hover:text-[var(--mob-text)]"
        >
          <LogOut className="h-3.5 w-3.5" />
          Kijelentkezés
        </button>
      </form>
    </div>
  );
}

function HomeScreen({
  employeeName,
  showKeszlet,
  showFuvarok,
  showProfil,
  onSelect,
}: {
  employeeName: string;
  showKeszlet: boolean;
  showFuvarok: boolean;
  showProfil: boolean;
  onSelect: (screen: Screen) => void;
}) {
  return (
    <Shell>
      <Header employeeName={employeeName} />
      <div className="flex flex-1 flex-col gap-3 pt-4">
        {showFuvarok && (
          <button
            type="button"
            onClick={() => onSelect("fuvarok")}
            className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-[var(--mob-border)] bg-[var(--mob-card)] py-10 transition-colors active:bg-[var(--mob-tile)]"
          >
            <Truck className="h-7 w-7" />
            <span className="text-base font-semibold">Fuvarok</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => onSelect("jelenlet")}
          className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-[var(--mob-border)] bg-[var(--mob-card)] py-10 transition-colors active:bg-[var(--mob-tile)]"
        >
          <CalendarClock className="h-7 w-7" />
          <span className="text-base font-semibold">Jelenléti</span>
        </button>
        <button
          type="button"
          onClick={() => onSelect("feladatok")}
          className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-[var(--mob-border)] bg-[var(--mob-card)] py-10 transition-colors active:bg-[var(--mob-tile)]"
        >
          <ClipboardList className="h-7 w-7" />
          <span className="text-base font-semibold">Feladatok</span>
        </button>
        {showKeszlet && (
          <button
            type="button"
            onClick={() => onSelect("keszlet")}
            className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-[var(--mob-border)] bg-[var(--mob-card)] py-10 transition-colors active:bg-[var(--mob-tile)]"
          >
            <Package className="h-7 w-7" />
            <span className="text-base font-semibold">Készlet</span>
          </button>
        )}
        {showProfil && (
          <button
            type="button"
            onClick={() => onSelect("profil")}
            className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-[var(--mob-border)] bg-[var(--mob-card)] py-10 transition-colors active:bg-[var(--mob-tile)]"
          >
            <IdCard className="h-7 w-7" />
            <span className="text-base font-semibold">Profil</span>
          </button>
        )}
      </div>
    </Shell>
  );
}

// --- Jelenléti képernyő ---

// Az idővonal 6:00-tól 20:00-ig tart — a tényleges műszakok ebbe beleférnek,
// és így a délelőtt/délután közti szünet arányosan látszik.
const SAV_KEZDET = 6 * 60;
const SAV_VEG = 20 * 60;

function percbe(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

function savStilus(tolPerc: number, igPerc: number) {
  const skala = SAV_VEG - SAV_KEZDET;
  const bal = Math.min(100, Math.max(0, ((tolPerc - SAV_KEZDET) / skala) * 100));
  const jobb = Math.min(100, Math.max(0, ((igPerc - SAV_KEZDET) / skala) * 100));
  return { left: `${bal}%`, width: `${Math.max(2, jobb - bal)}%` };
}

function NapIdovonal({ sessions }: { sessions: JelenletSession[] }) {
  const most = new Date();
  const mostPerc = most.getHours() * 60 + most.getMinutes();
  const munkak = sessions.filter((s) => s.day_type === "munka" && s.arrival_time);

  return (
    <div>
      <div className="relative h-7 rounded-lg border border-[var(--mob-border)] bg-[var(--mob-tile)]">
        {munkak.map((s) => {
          const tol = percbe(s.arrival_time!);
          const nyitott = !s.departure_time;
          const ig = nyitott ? Math.max(tol + 5, mostPerc) : percbe(s.departure_time!);
          return (
            <span
              key={s.id}
              style={savStilus(tol, ig)}
              className={cn(
                "absolute inset-y-1 flex items-center justify-center rounded-md text-[9px] font-semibold text-white",
                nyitott
                  ? "bg-[repeating-linear-gradient(45deg,var(--mob-accent),var(--mob-accent)_6px,color-mix(in_srgb,var(--mob-accent)_75%,white)_6px,color-mix(in_srgb,var(--mob-accent)_75%,white)_12px)]"
                  : "bg-[var(--mob-accent)]"
              )}
            >
              {s.arrival_time}
            </span>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-[var(--mob-muted)]">
        <span>6</span>
        <span>9</span>
        <span>12</span>
        <span>15</span>
        <span>18</span>
        <span>20</span>
      </div>
    </div>
  );
}

function JelenletiScreen({
  employeeId,
  employeeName,
  onBack,
}: {
  employeeId: string;
  employeeName: string;
  onBack: () => void;
}) {
  const [sessions, setSessions] = useState<JelenletSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [utolsoMuvelet, setUtolsoMuvelet] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const rows = await getTodayJelenletek();
    setSessions(rows.filter((r) => r.employee_id === employeeId));
  }, [employeeId]);

  useEffect(() => {
    let mounted = true;
    load().finally(() => {
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [load]);

  const munkak = sessions.filter((s) => s.day_type === "munka");
  const nyitottSzakasz = munkak.find((s) => s.arrival_time && !s.departure_time) ?? null;
  const bent = nyitottSzakasz !== null;
  const abszencia = sessions.find((s) => s.day_type !== "munka") ?? null;
  const ledolgozott = sumWorkedMinutes(munkak);
  const utolsoTavozas = [...munkak].reverse().find((s) => s.departure_time)?.departure_time ?? null;

  function futtat(muvelet: () => Promise<unknown>, siker: string) {
    startTransition(async () => {
      try {
        await muvelet();
        setNote("");
        setUtolsoMuvelet(siker);
        await load();
        toast.success(siker);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nem sikerült rögzíteni.");
      }
    });
  }

  function abszenciat(dayType: "szabadsag" | "beteg") {
    const cimke = dayType === "szabadsag" ? "Szabadság" : "Betegszabadság";
    const figyelmeztetes =
      munkak.length > 0
        ? "\n\nMa már van rögzített munkaidőd — az a mai napról törlődik."
        : "";
    if (!window.confirm(`${cimke} a mai napra?${figyelmeztetes}`)) return;
    futtat(() => recordAbszenciaNow(employeeId, dayType, note), `${cimke} rögzítve.`);
  }

  function visszavon() {
    startTransition(async () => {
      try {
        const uzenet = await undoUtolsoJelenlet(employeeId);
        setUtolsoMuvelet(null);
        await load();
        toast.success(uzenet);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nem sikerült visszavonni.");
      }
    });
  }

  return (
    <Shell onBack={onBack}>
      <Header employeeName={employeeName} onBack={onBack} />

      {/* Állapotsor: eddig semmi nem mondta meg, hogy bent van-e, ezért
          fordulhatott elő, hogy ugyanazt a gombot kétszer nyomták meg. */}
      <div
        className={cn(
          "flex items-center gap-3 rounded-xl border-2 bg-[var(--mob-card)] px-3 py-2.5",
          bent ? "border-[var(--mob-accent)]" : "border-[var(--mob-border)]"
        )}
      >
        <span
          className={cn(
            "size-3 shrink-0 rounded-full",
            bent ? "bg-[var(--mob-accent)]" : "bg-[var(--mob-muted)]"
          )}
        />
        <div className="min-w-0">
          <p className="text-sm font-bold">
            {loading
              ? "Betöltés…"
              : abszencia
                ? abszencia.day_type === "szabadsag"
                  ? "Ma szabadságon vagy"
                  : "Ma betegszabadságon vagy"
                : bent
                  ? "Bent vagy"
                  : "Kint vagy"}
          </p>
          {!loading && !abszencia && (
            <p className="text-xs text-[var(--mob-muted)]">
              {bent
                ? `${nyitottSzakasz?.arrival_time} óta`
                : utolsoTavozas
                  ? `utolsó távozás ${utolsoTavozas}`
                  : "ma még nincs bejegyzésed"}
              {ledolgozott > 0 && ` · ma eddig ${formatDiff(ledolgozott).replace("+", "")}`}
            </p>
          )}
        </div>
      </div>

      {!loading && !abszencia && munkak.length > 0 && (
        <Card className="border border-[var(--mob-border)] bg-[var(--mob-card)] ring-0">
          <CardContent className="py-3">
            <p className="mb-2 text-[11px] font-bold tracking-wide text-[var(--mob-muted)] uppercase">
              A mai napod
            </p>
            <NapIdovonal sessions={sessions} />
            <div className="mt-2 space-y-0.5 text-[11px] text-[var(--mob-muted)] tabular-nums">
              {munkak.map((s) => (
                <div key={s.id}>
                  {s.arrival_time ?? "—"} – {s.departure_time ?? "…"}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {utolsoMuvelet && (
        <button
          type="button"
          onClick={visszavon}
          disabled={pending}
          className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-left text-xs text-amber-800"
        >
          <Undo2 className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{utolsoMuvelet}</span>
          <span className="font-bold">Visszavonom</span>
        </button>
      )}

      {/* A megjegyzés a GOMBOK FÖLÖTT van: korábban alattuk volt, ezért soha
          senki nem írt bele — a gomb megnyomása után már késő volt. */}
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Megjegyzés (nem kötelező)"
        className="border-[var(--mob-border)] bg-[var(--mob-card)] text-[var(--mob-text)]"
      />

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => futtat(() => recordArrivalNow(employeeId, note), "Érkezés rögzítve.")}
          disabled={pending || loading || bent || abszencia !== null}
          className="flex flex-col items-center gap-1 rounded-xl border-2 border-[var(--mob-accent)] bg-[var(--mob-accent)] py-6 text-white transition-colors disabled:border-[var(--mob-border)] disabled:bg-[var(--mob-tile)] disabled:text-[var(--mob-muted)]"
        >
          <span className="text-base font-bold">Érkezés</span>
          <span className="text-[11px] font-semibold opacity-90">
            {abszencia ? "ma távollét" : bent ? "már bent vagy" : "koppints"}
          </span>
        </button>
        <button
          type="button"
          onClick={() => futtat(() => recordDepartureNow(employeeId, note), "Távozás rögzítve.")}
          disabled={pending || loading || !bent}
          className="flex flex-col items-center gap-1 rounded-xl border-2 border-destructive bg-destructive py-6 text-white transition-colors disabled:border-[var(--mob-border)] disabled:bg-[var(--mob-tile)] disabled:text-[var(--mob-muted)]"
        >
          <span className="text-base font-bold">Távozás</span>
          <span className="text-[11px] font-semibold opacity-90">
            {bent ? "koppints" : "nem vagy bent"}
          </span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          onClick={() => abszenciat("szabadsag")}
          disabled={pending || loading}
          className="border-[var(--mob-border)] bg-[var(--mob-card)] text-[var(--mob-text)]"
        >
          Szabadság
        </Button>
        <Button
          variant="outline"
          onClick={() => abszenciat("beteg")}
          disabled={pending || loading}
          className="border-[var(--mob-border)] bg-[var(--mob-card)] text-[var(--mob-text)]"
        >
          Betegszabadság
        </Button>
      </div>
      <p className="text-center text-[10px] text-[var(--mob-muted)]">
        A szabadság és a betegszabadság az egész napra szól, és rákérdez, mielőtt rögzíti.
      </p>
    </Shell>
  );
}

function FeladatokScreen({
  employeeName,
  onBack,
}: {
  employeeName: string;
  onBack: () => void;
}) {
  return (
    <Shell onBack={onBack}>
      <Header employeeName={employeeName} onBack={onBack} />
      <FeladatokMobilCsempe />
    </Shell>
  );
}

// --- Profil ---

// Budaházi Zoltán kérése (2026-09-20): a Profil CSAK két dolgot mutat — hány
// nap szabadság vehető még ki, és az előlegek egyenlege az elfogadással. A
// korábbi szerepkör- és bérezés-blokk lekerült: a bér a telefonra nem való,
// és a Dolgozók modul úgyis nyilvántartja.
function ProfilScreen({
  employeeId,
  employeeName,
  elolegek,
  keret,
  loading,
  onReload,
  onBack,
}: {
  employeeId: string;
  employeeName: string;
  elolegek: EmployeeElolegekOsszesito | null;
  keret: SzabadsagKeret | null;
  loading: boolean;
  onReload: () => Promise<void>;
  onBack: () => void;
}) {
  const [pending, startTransition] = useTransition();

  const honapok = useMemo(() => {
    if (!elolegek) return [];
    const groups: { key: string; label: string; tetelek: EmployeeElolegekOsszesito["tetelek"] }[] = [];
    for (const t of elolegek.tetelek) {
      const [yearStr, monthStr] = t.date.split("-");
      const key = `${yearStr}-${monthStr}`;
      let group = groups.find((g) => g.key === key);
      if (!group) {
        group = { key, label: `${HU_MONTHS[Number(monthStr) - 1]} ${yearStr}`, tetelek: [] };
        groups.push(group);
      }
      group.tetelek.push(t);
    }
    return groups;
  }, [elolegek]);

  function accept(id: string, osszeg: number) {
    if (
      !window.confirm(
        `Elfogadod a(z) ${ft(osszeg)} előleget?\n\nAz elfogadás a nevedet és a pontos időpontot rögzíti, és utólag nem vonható vissza.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        await acceptAdvance(id, employeeId, employeeName);
        await onReload();
        toast.success("Előleg elfogadva.");
      } catch {
        toast.error("Nem sikerült elfogadni.");
      }
    });
  }

  return (
    <Shell onBack={onBack}>
      <Header employeeName={employeeName} onBack={onBack} />

      {loading ? (
        <p className="text-sm text-[var(--mob-muted)]">Betöltés…</p>
      ) : (
        <div className="flex flex-col gap-4">
          {keret && (
            <Card className="border border-[var(--mob-border)] bg-[var(--mob-card)] ring-0">
              <CardContent className="py-4">
                <p className="text-xs text-[var(--mob-muted)]">Kivehető szabadság</p>
                <p className="text-3xl font-bold text-[var(--mob-accent)]">{keret.maradek} nap</p>
                <p className="mt-1 text-[11px] text-[var(--mob-muted)]">
                  {keret.fordulonap} óta {keret.felhasznalt} napot vettél ki.
                </p>
              </CardContent>
            </Card>
          )}

          <div className="rounded-xl bg-[var(--mob-text)] p-4 text-[var(--mob-bg)]">
            <p className="text-xs opacity-70">Aktuális, el nem számolt előleg</p>
            <p className="text-2xl font-bold text-[var(--mob-accent)]">
              {ft(elolegek?.osszesen ?? 0)}
            </p>
          </div>

          {honapok.length === 0 && (
            <p className="text-sm text-[var(--mob-muted)]">Nincs rögzített előleged.</p>
          )}

          {honapok.map((honap) => (
            <div key={honap.key} className="flex flex-col gap-2">
              <p className="text-xs font-semibold tracking-wide text-[var(--mob-muted)] uppercase">
                {honap.label}
              </p>
              {honap.tetelek.map((t) => (
                <Card key={t.id} className="border border-[var(--mob-border)] bg-[var(--mob-card)] ring-0">
                  <CardContent className="flex flex-col gap-2 py-4">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-base font-semibold">{ft(t.amount)}</p>
                        <p className="text-xs text-[var(--mob-muted)]">{t.date}</p>
                        {/* Az adminisztrátor megjegyzése eddig sehol nem
                            jelent meg a telefonon, pedig a lekérdezés lehozta. */}
                        {t.note && <p className="text-xs text-[var(--mob-muted)]">{t.note}</p>}
                      </div>
                      {t.acceptedAt ? (
                        <span className="shrink-0 rounded-full bg-[var(--mob-accent)]/15 px-2.5 py-1 text-xs font-semibold text-[var(--mob-positive)]">
                          Elfogadva
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                          Megerősítésre vár
                        </span>
                      )}
                    </div>
                    {t.acceptedAt ? (
                      <p className="text-xs text-[var(--mob-muted)]">
                        Elfogadva: {t.acceptedAt} · {t.acceptedBy}
                      </p>
                    ) : (
                      t.amount > 0 && (
                        <Button
                          size="sm"
                          disabled={pending}
                          onClick={() => accept(t.id, t.amount)}
                          className="bg-[var(--mob-accent)] text-white hover:bg-[var(--mob-accent)]/90"
                        >
                          ELFOGADOM
                        </Button>
                      )
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}

// A sofőr napi fuvar-nézete — a "Fuvarok" csempe tartalma, a
// "fuvarozas_sajat" jog mögött (lásd lib/auth/permissions.ts).
function FuvarokScreen({
  employeeId,
  employeeName,
  onBack,
}: {
  employeeId: string;
  employeeName: string;
  onBack: () => void;
}) {
  return (
    <Shell onBack={onBack}>
      <Header employeeName={employeeName} onBack={onBack} />
      <SoforFuvarNap employeeId={employeeId} />
    </Shell>
  );
}

// Telepi Készlet képernyő: a készlet típusonként csempékben (nagy számok,
// egy pillantás), a műveletek pedig alul, mindig kéznél. A vegyes halom
// (Vegyes EUR / Vegyes) csempéje kiemelve — rákoppintva nyílik a
// szétválogatás, külön gomb nélkül. A leltár és a szétválogatás saját, ujjra
// méretezett párbeszédet kap (keszlet-mobil.tsx); a Be/Ki rögzítés a desktop
// Készlet modullal közös MovementForm, rögzített iránnyal.
const VEGYES_FORRASOK = ["Vegyes EUR", "Vegyes"];

// Telephelyek közti mozgatás célja a telepi nézetről: a másik két telep,
// Nyíregyházát is beleértve. A forrás mindig a kiválasztott saját telep — a
// cél telepen a mennyiség csak az átvétel után kerül készletbe.
const MOZGATAS_CELOK: Record<KeszletSite, string[]> = {
  Szakoly: ["Balkány", "Nyíregyháza"],
  Balkány: ["Szakoly", "Nyíregyháza"],
};
const VEGYES_EUR_CELOK = ["EUR világos", "EUR szürke", "EUR törött"];

function KeszletScreen({
  employeeName,
  canEdit,
  onBack,
}: {
  employeeName: string;
  canEdit: boolean;
  onBack: () => void;
}) {
  const [site, setSite] = useState<KeszletSite>("Szakoly");
  const [loading, setLoading] = useState(true);
  const [types, setTypes] = useState<string[]>([]);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [incoming, setIncoming] = useState<IncomingRow[]>([]);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [szetvalogatas, setSzetvalogatas] = useState<string | null>(null);
  const [rogzites, setRogzites] = useState<Direction | null>(null);

  const load = useCallback(async () => {
    const snap = await getSiteSnapshot(site);
    setTypes(snap.types);
    setStock(snap.stock);
    setIncoming(snap.incoming);
  }, [site]);

  useEffect(() => {
    let mounted = true;
    load().finally(() => {
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [load]);

  // A képernyőn csak az látszik, amiből van készlet — a telepen sok típus
  // aktív, de a legtöbbje általában üres. A 0 darabos típusok a leltárban és
  // a rögzítő űrlapon továbbra is elérhetők, így új típus is bevihető.
  const vegyesek = VEGYES_FORRASOK.filter((v) => (stock[v] ?? 0) !== 0);
  const tobbi = Object.entries(stock).filter(([t, q]) => !VEGYES_FORRASOK.includes(t) && q !== 0);
  // Szétválogatás céljai: a telepen aktív típusok — a Vegyes EUR csak a három
  // EUR-válogatásra bomlik, a Vegyes bármire, ami itt aktív.
  const celok = (forras: string) =>
    types.filter(
      (t) => !VEGYES_FORRASOK.includes(t) && (forras === "Vegyes" || VEGYES_EUR_CELOK.includes(t))
    );

  return (
    <Shell onBack={onBack}>
      <Header employeeName={employeeName} onBack={onBack} />

      <div className="grid grid-cols-2 gap-2">
        {KESZLET_SITES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSite(s)}
            className={cn(
              "rounded-xl border-2 py-3 text-sm font-semibold transition-colors",
              site === s
                ? "border-[var(--mob-accent)] bg-[var(--mob-tile)] text-[var(--mob-text)]"
                : "border-[var(--mob-border)] text-[var(--mob-muted)] hover:bg-[var(--mob-tile)]"
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-[var(--mob-muted)]">Betöltés…</p>
      ) : (
        <EditPermissionProvider canEdit={canEdit}>
          <BejovoSzallitmanyok rows={incoming} onAccepted={load} />

          {vegyesek.map((forras) => {
            const celLista = celok(forras);
            const nyithato = canEdit && celLista.length > 0 && stock[forras] > 0;
            return (
              <button
                key={forras}
                type="button"
                disabled={!nyithato}
                onClick={() => setSzetvalogatas(forras)}
                className={cn(
                  "flex items-center justify-between rounded-xl border-2 px-3 py-2.5 text-left",
                  nyithato
                    ? "border-[var(--mob-accent)] bg-[var(--mob-card)]"
                    : "border-[var(--mob-border)] bg-[var(--mob-card)]"
                )}
              >
                <div>
                  <div className="text-xs text-[var(--mob-muted)]">{forras}</div>
                  <div className="text-2xl font-bold tabular-nums text-[var(--mob-positive)]">
                    {stock[forras]} db
                  </div>
                </div>
                {nyithato && (
                  <span className="flex items-center gap-1 text-sm font-semibold text-[var(--mob-accent)]">
                    Szétválogatás
                    <ChevronRight className="h-4 w-4" />
                  </span>
                )}
              </button>
            );
          })}

          {tobbi.length === 0 && vegyesek.length === 0 ? (
            <p className="text-sm text-[var(--mob-muted)]">
              Jelenleg nincs készlet ezen a telephelyen. Új típus a Beérkezés gombbal vagy a
              leltárban vihető be.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {tobbi.map(([t, q]) => (
                <div
                  key={t}
                  className="rounded-xl border border-[var(--mob-border)] bg-[var(--mob-tile)] px-2.5 py-2"
                >
                  <div className="text-[11px] leading-tight text-[var(--mob-muted)]">{t}</div>
                  <div className="text-xl font-bold tabular-nums">{q}</div>
                </div>
              ))}
            </div>
          )}

          {canEdit && (
            <div className="sticky bottom-0 -mx-1 grid grid-cols-2 gap-2 rounded-xl border border-[var(--mob-border)] bg-[var(--mob-card)] p-2">
              <Button size="sm" onClick={() => setRogzites("be")}>
                Beérkezés
              </Button>
              <Button size="sm" onClick={() => setRogzites("ki")}>
                Kiadás
              </Button>
              <Button size="sm" variant="outline" onClick={() => setRogzites("mozgatas")}>
                Mozgatás másik telepre
              </Button>
              <Button size="sm" variant="outline" onClick={() => setInventoryOpen(true)}>
                Leltár
              </Button>
            </div>
          )}

          <Dialog open={rogzites !== null} onOpenChange={(nyitva) => !nyitva && setRogzites(null)}>
            <DialogContent className="max-w-sm p-0">
              <DialogHeader className="sr-only">
                <DialogTitle>Mozgás rögzítése</DialogTitle>
              </DialogHeader>
              {rogzites && (
                <MovementForm
                  site={site}
                  types={types}
                  otherSites={MOZGATAS_CELOK[site]}
                  fixedDirection={rogzites}
                  onRecorded={async () => {
                    await load();
                    setRogzites(null);
                  }}
                />
              )}
            </DialogContent>
          </Dialog>

          {szetvalogatas && (
            <MobilSzetvalogatas
              site={site}
              source={szetvalogatas}
              keszlet={stock[szetvalogatas] ?? 0}
              celok={celok(szetvalogatas)}
              open
              onOpenChange={(nyitva) => !nyitva && setSzetvalogatas(null)}
              onRecorded={load}
            />
          )}

          {/* Friss csatolás minden megnyitáskor: így a párbeszéd üres állapotról
              indul, és nem kell effektben nullázni. */}
          {inventoryOpen && (
            <MobilLeltar
              site={site}
              types={types}
              keszlet={stock}
              open
              onOpenChange={setInventoryOpen}
              onRecorded={load}
            />
          )}
        </EditPermissionProvider>
      )}
    </Shell>
  );
}

export function ErkezesSajatView({
  employeeId,
  employeeName,
  keszletPermission,
  fuvarozasPermission,
  elolegekPermission,
}: {
  employeeId: string;
  employeeName: string;
  keszletPermission: ModulePermission;
  fuvarozasPermission: ModulePermission;
  elolegekPermission: ModulePermission;
}) {
  const [screen, setScreen] = useState<Screen>("home");
  const [elolegek, setElolegek] = useState<EmployeeElolegekOsszesito | null>(null);
  const [keret, setKeret] = useState<SzabadsagKeret | null>(null);
  const [profilLoading, setProfilLoading] = useState(true);

  // A Profil adatait a gyökér tölti be, nem a képernyő: az elfogadásra váró
  // előleg sávjának minden képernyőn látszania kell, nem csak a Profilon.
  const loadProfil = useCallback(async () => {
    const [e, k] = await Promise.all([
      elolegekPermission.view ? getEmployeeElolegek(employeeId) : Promise.resolve(null),
      getSzabadsagKeret(employeeId).catch(() => null),
    ]);
    setElolegek(e);
    setKeret(k);
  }, [employeeId, elolegekPermission.view]);

  useEffect(() => {
    let mounted = true;
    loadProfil().finally(() => {
      if (mounted) setProfilLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [loadProfil]);

  // Csak a POZITÍV, még nem nyugtázott tétel vár elfogadásra: a negatív
  // sorok a bérkártyáról szinkronizált levonások, azokat nem kell okézni.
  const fuggoEloleg = useMemo(
    () => (elolegek?.tetelek ?? []).filter((t) => !t.acceptedAt && t.amount > 0).length,
    [elolegek]
  );

  const savErtek = useMemo(
    () => ({ fuggo: fuggoEloleg, onOpen: () => setScreen("profil") }),
    [fuggoEloleg]
  );

  let tartalom: React.ReactNode;
  if (screen === "jelenlet") {
    tartalom = (
      <JelenletiScreen
        employeeId={employeeId}
        employeeName={employeeName}
        onBack={() => setScreen("home")}
      />
    );
  } else if (screen === "feladatok") {
    tartalom = <FeladatokScreen employeeName={employeeName} onBack={() => setScreen("home")} />;
  } else if (screen === "keszlet" && keszletPermission.view) {
    tartalom = (
      <KeszletScreen
        employeeName={employeeName}
        canEdit={keszletPermission.edit}
        onBack={() => setScreen("home")}
      />
    );
  } else if (screen === "fuvarok" && fuvarozasPermission.view) {
    tartalom = (
      <FuvarokScreen
        employeeId={employeeId}
        employeeName={employeeName}
        onBack={() => setScreen("home")}
      />
    );
  } else if (screen === "profil") {
    tartalom = (
      <ProfilScreen
        employeeId={employeeId}
        employeeName={employeeName}
        elolegek={elolegek}
        keret={keret}
        loading={profilLoading}
        onReload={loadProfil}
        onBack={() => setScreen("home")}
      />
    );
  } else {
    tartalom = (
      <HomeScreen
        employeeName={employeeName}
        showKeszlet={keszletPermission.view}
        showFuvarok={fuvarozasPermission.view}
        showProfil
        onSelect={setScreen}
      />
    );
  }

  return <ElolegSavContext.Provider value={savErtek}>{tartalom}</ElolegSavContext.Provider>;
}
