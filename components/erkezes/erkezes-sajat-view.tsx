"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowLeft, CalendarClock, ClipboardList, LogOut, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { logout } from "@/lib/auth/actions";
import { EditPermissionProvider } from "@/components/auth/edit-permission-context";
import {
  getTodayJelenletek,
  recordAbszenciaNow,
  recordArrivalNow,
  recordDepartureNow,
} from "@/lib/jelenlet/actions";
import type { JelenletSession } from "@/lib/jelenlet/shared";
import { FeladatokMobilCsempe } from "@/components/erkezes/feladatok-mobil-csempe";
import { getSiteSnapshot } from "@/lib/keszlet/actions";
import { MovementForm } from "@/components/keszlet/movement-form";
import { InventoryDialog } from "@/components/keszlet/inventory-dialog";

type Screen = "home" | "jelenlet" | "feladatok" | "keszlet";
type ModulePermission = { view: boolean; edit: boolean };

const KESZLET_SITES = ["Szakoly", "Balkány"] as const;
type KeszletSite = (typeof KESZLET_SITES)[number];

function Header({
  employeeName,
  onBack,
}: {
  employeeName: string;
  onBack?: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center justify-center rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <div>
          <h1 className="text-base font-semibold">{employeeName}</h1>
          <p className="text-xs text-muted-foreground">Jelenlét</p>
        </div>
      </div>
      <form action={logout}>
        <button
          type="submit"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
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
  onSelect,
}: {
  employeeName: string;
  showKeszlet: boolean;
  onSelect: (screen: Screen) => void;
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 bg-muted/40 px-4 py-4">
      <Header employeeName={employeeName} />
      <div className="flex flex-1 flex-col gap-3 pt-4">
        <button
          type="button"
          onClick={() => onSelect("jelenlet")}
          className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-border bg-card py-10 transition-colors active:bg-muted"
        >
          <CalendarClock className="h-7 w-7" />
          <span className="text-base font-semibold">Jelenléti</span>
        </button>
        <button
          type="button"
          onClick={() => onSelect("feladatok")}
          className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-border bg-card py-10 transition-colors active:bg-muted"
        >
          <ClipboardList className="h-7 w-7" />
          <span className="text-base font-semibold">Feladatok</span>
        </button>
        {showKeszlet && (
          <button
            type="button"
            onClick={() => onSelect("keszlet")}
            className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-border bg-card py-10 transition-colors active:bg-muted"
          >
            <Package className="h-7 w-7" />
            <span className="text-base font-semibold">Készlet</span>
          </button>
        )}
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
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const rows = await getTodayJelenletek();
    setSessions(rows.filter((r) => r.employee_id === employeeId));
  }, [employeeId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  function run(action: (n?: string) => Promise<void>, successMsg: string) {
    startTransition(async () => {
      try {
        await action(note);
        setNote("");
        await load();
        toast.success(successMsg);
      } catch {
        toast.error("Nem sikerült rögzíteni.");
      }
    });
  }

  // Több szakasz is lehet aznap (pl. hazament, majd visszajött) — a
  // gombok alatt a legutóbbi érkezés/távozás időpontja jelenik meg.
  const lastArrival = [...sessions].reverse().find((s) => s.arrival_time)?.arrival_time ?? null;
  const lastDeparture = [...sessions].reverse().find((s) => s.departure_time)?.departure_time ?? null;
  const todaySzabadsag = sessions.some((s) => s.day_type === "szabadsag");
  const todayBeteg = sessions.some((s) => s.day_type === "beteg");

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 bg-muted/40 px-4 py-4">
      <Header employeeName={employeeName} onBack={onBack} />

      <Card>
        <CardContent className="grid grid-cols-2 gap-3 pt-4">
          <button
            type="button"
            onClick={() => run((n) => recordAbszenciaNow(employeeId, "szabadsag", n), "Szabadság rögzítve.")}
            disabled={pending || loading}
            className="flex flex-col items-center gap-1 rounded-xl border-2 border-blue-500 bg-blue-500/10 py-3 text-blue-600 transition-colors active:bg-blue-500/20 disabled:opacity-50"
          >
            <span className="text-sm font-semibold">Szabadság</span>
            <span className="text-xs">{todaySzabadsag ? "Rögzítve" : "Koppints"}</span>
          </button>
          <button
            type="button"
            onClick={() => run((n) => recordAbszenciaNow(employeeId, "beteg", n), "Betegszabadság rögzítve.")}
            disabled={pending || loading}
            className="flex flex-col items-center gap-1 rounded-xl border-2 border-amber-500 bg-amber-500/10 py-3 text-amber-600 transition-colors active:bg-amber-500/20 disabled:opacity-50"
          >
            <span className="text-sm font-semibold">Betegszabadság</span>
            <span className="text-xs">{todayBeteg ? "Rögzítve" : "Koppints"}</span>
          </button>
          <button
            type="button"
            onClick={() => run((n) => recordArrivalNow(employeeId, n), "Érkezés rögzítve.")}
            disabled={pending || loading}
            className="flex flex-col items-center gap-1 rounded-xl border-2 border-success bg-success/10 py-6 text-success transition-colors active:bg-success/20 disabled:opacity-50"
          >
            <span className="text-base font-semibold">Érkezés</span>
            <span className="text-xs">{lastArrival ? `Rögzítve: ${lastArrival}` : "Koppints"}</span>
          </button>
          <button
            type="button"
            onClick={() => run((n) => recordDepartureNow(employeeId, n), "Távozás rögzítve.")}
            disabled={pending || loading}
            className="flex flex-col items-center gap-1 rounded-xl border-2 border-destructive bg-destructive/10 py-6 text-destructive transition-colors active:bg-destructive/20 disabled:opacity-50"
          >
            <span className="text-base font-semibold">Távozás</span>
            <span className="text-xs">{lastDeparture ? `Rögzítve: ${lastDeparture}` : "Koppints"}</span>
          </button>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Megjegyzés (opcionális)"
            className="col-span-2"
          />
        </CardContent>
      </Card>
    </div>
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
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 bg-muted/40 px-4 py-4">
      <Header employeeName={employeeName} onBack={onBack} />
      <FeladatokMobilCsempe />
    </div>
  );
}

// Leltár + Be/Ki mozgás rögzítés Szakolyra és Balkányra — a meglévő
// MovementForm/InventoryDialog komponensek adják a logikát (allowTransfer
// kikapcsolva, mert ezen a korlátozott mobil nézeten csak Be/Ki kell, nem
// telephelyek közti mozgatás), a szerkesztési jogot a "keszlet_sajat" modul
// dönti el (NEM a teljes "keszlet" modulét, hogy ez a dolgozó ne kapjon
// hozzáférést a desktop Készlet oldalhoz/Nyíregyházához is).
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
  const [inventoryOpen, setInventoryOpen] = useState(false);

  const load = useCallback(async () => {
    const snap = await getSiteSnapshot(site);
    setTypes(snap.types);
    setStock(snap.stock);
  }, [site]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 bg-muted/40 px-4 py-4">
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
                ? "border-primary bg-accent text-accent-foreground"
                : "border-border text-muted-foreground hover:bg-muted"
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Betöltés…</p>
      ) : (
        <EditPermissionProvider canEdit={canEdit}>
          <MovementForm site={site} types={types} otherSites={[]} onRecorded={load} allowTransfer={false} />

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Jelenlegi készlet — {site}</CardTitle>
              {canEdit && (
                <Button size="sm" variant="outline" onClick={() => setInventoryOpen(true)}>
                  Leltár indítása
                </Button>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {Object.entries(stock).map(([t, q]) => (
                <div
                  key={t}
                  className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm"
                >
                  <span>{t}</span>
                  <span className="font-semibold tabular-nums">{q}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <InventoryDialog
            site={site}
            types={types}
            currentStock={stock}
            open={inventoryOpen}
            onOpenChange={setInventoryOpen}
            onRecorded={load}
          />
        </EditPermissionProvider>
      )}
    </div>
  );
}

export function ErkezesSajatView({
  employeeId,
  employeeName,
  keszletPermission,
}: {
  employeeId: string;
  employeeName: string;
  keszletPermission: ModulePermission;
}) {
  const [screen, setScreen] = useState<Screen>("home");

  if (screen === "jelenlet") {
    return (
      <JelenletiScreen
        employeeId={employeeId}
        employeeName={employeeName}
        onBack={() => setScreen("home")}
      />
    );
  }
  if (screen === "feladatok") {
    return <FeladatokScreen employeeName={employeeName} onBack={() => setScreen("home")} />;
  }
  if (screen === "keszlet" && keszletPermission.view) {
    return (
      <KeszletScreen
        employeeName={employeeName}
        canEdit={keszletPermission.edit}
        onBack={() => setScreen("home")}
      />
    );
  }
  return (
    <HomeScreen
      employeeName={employeeName}
      showKeszlet={keszletPermission.view}
      onSelect={setScreen}
    />
  );
}
