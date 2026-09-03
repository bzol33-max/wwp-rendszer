"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  addKasszaMovement,
  addPendingPurchase,
  addPurchase,
  deletePurchase,
  getHaviSnapshot,
  getKasszaMovements,
  payPendingSeller,
  updatePendingPurchase,
  type KasszaMovementRow,
  type PurchaseRow,
} from "@/lib/keszlet/actions";
import { kbNav } from "@/lib/keszlet/kbnav";

function todayLabel() {
  const raw = new Date().toLocaleDateString("hu-HU", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  // "2026. szeptember 3., csütörtök" -> "ma, csütörtök (2026. szeptember 3.)"
  const [datePart, weekdayPart] = raw.split(", ");
  return { datePart, weekdayPart };
}

function todayDateInputValue() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const TYPE_TILE_COLORS = [
  {
    border: "border-amber-300/60",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    text: "text-amber-700 dark:text-amber-400",
  },
  {
    border: "border-blue-300/60",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    text: "text-blue-700 dark:text-blue-400",
  },
  {
    border: "border-emerald-300/60",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    text: "text-emerald-700 dark:text-emerald-400",
  },
  {
    border: "border-violet-300/60",
    bg: "bg-violet-50 dark:bg-violet-950/30",
    text: "text-violet-700 dark:text-violet-400",
  },
  {
    border: "border-rose-300/60",
    bg: "bg-rose-50 dark:bg-rose-950/30",
    text: "text-rose-700 dark:text-rose-400",
  },
  {
    border: "border-cyan-300/60",
    bg: "bg-cyan-50 dark:bg-cyan-950/30",
    text: "text-cyan-700 dark:text-cyan-400",
  },
];

function typeTileColor(index: number) {
  return TYPE_TILE_COLORS[index % TYPE_TILE_COLORS.length];
}

function dayGroupLabel(dayKey: string) {
  return new Date(`${dayKey}T00:00:00`).toLocaleDateString("hu-HU", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

export function NyiregyhazaHaviTab() {
  const [loading, setLoading] = useState(true);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [typeCounters, setTypeCounters] = useState<
    { type: string; monthlyQty: number; dailyQty: number }[]
  >([]);
  const [todayKey, setTodayKey] = useState("");
  const [kassza, setKassza] = useState(0);
  const [todayExpense, setTodayExpense] = useState(0);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [todayQty, setTodayQty] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [kasszaDesc, setKasszaDesc] = useState("");
  const [kasszaAmount, setKasszaAmount] = useState("");
  const [kasszaDetailOpen, setKasszaDetailOpen] = useState(false);
  const [kasszaDetailLoading, setKasszaDetailLoading] = useState(false);
  const [kasszaMovements, setKasszaMovements] = useState<KasszaMovementRow[]>([]);
  const [customPriceOpen, setCustomPriceOpen] = useState(false);
  const [customPrices, setCustomPrices] = useState<Record<string, string>>({});
  const [pendingAddOpen, setPendingAddOpen] = useState(false);
  const [pendingSeller, setPendingSeller] = useState("");
  const [pendingDate, setPendingDate] = useState(todayDateInputValue());
  const [pendingQtyMap, setPendingQtyMap] = useState<Record<string, string>>({});
  const [pendingSubmitting, setPendingSubmitting] = useState(false);
  const [pendingListOpen, setPendingListOpen] = useState(false);
  const [pendingSellerLocked, setPendingSellerLocked] = useState(false);
  const [pendingEditRow, setPendingEditRow] = useState<PurchaseRow | null>(null);
  const [pendingEditType, setPendingEditType] = useState("");
  const [pendingEditQty, setPendingEditQty] = useState("");
  const [pendingEditDate, setPendingEditDate] = useState("");
  const { datePart, weekdayPart } = todayLabel();

  const load = useCallback(async () => {
    const snap = await getHaviSnapshot();
    setPurchases(snap.purchases);
    setTodayKey(snap.todayKey);
    setKassza(snap.kassza);
    setTodayExpense(snap.todayExpense);
    setTypeCounters(snap.typeCounters);
    const priceMap: Record<string, number> = {};
    for (const p of snap.prices) if (p.default_price) priceMap[p.name] = p.default_price;
    setPrices(priceMap);
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const currentEntryTotal = useMemo(() => {
    return Object.entries(todayQty).reduce((sum, [type, qtyStr]) => {
      const qty = Number(qtyStr) || 0;
      return sum + qty * (prices[type] ?? 0);
    }, 0);
  }, [todayQty, prices]);

  function getEntries() {
    return Object.entries(todayQty).filter(([, v]) => Number(v) > 0);
  }

  async function recordDay(method: "keszpenz" | "atutalas" = "keszpenz") {
    const entries = getEntries();
    if (entries.length === 0) {
      toast.error("Adj meg legalább egy típust darabszámmal.");
      return;
    }
    setSubmitting(true);
    try {
      for (const [type, qtyStr] of entries) {
        await addPurchase({
          type,
          qty: Number(qtyStr),
          unitPrice: prices[type] ?? 0,
          method,
        });
      }
      setTodayQty({});
      await load();
      toast.success(
        method === "atutalas" ? "Vétel rögzítve — átutalással." : "Vétel rögzítve."
      );
    } catch {
      toast.error("Nem sikerült menteni.");
    } finally {
      setSubmitting(false);
    }
  }

  function openCustomPrice() {
    const entries = getEntries();
    if (entries.length === 0) {
      toast.error("Adj meg legalább egy típust darabszámmal.");
      return;
    }
    const initial: Record<string, string> = {};
    for (const [type] of entries) {
      initial[type] = String(prices[type] ?? "");
    }
    setCustomPrices(initial);
    setCustomPriceOpen(true);
  }

  async function recordCustomPrice() {
    const entries = getEntries();
    setSubmitting(true);
    try {
      for (const [type, qtyStr] of entries) {
        const unitPrice = Number(customPrices[type]) || 0;
        await addPurchase({
          type,
          qty: Number(qtyStr),
          unitPrice,
          method: "keszpenz",
        });
      }
      setTodayQty({});
      setCustomPriceOpen(false);
      await load();
      toast.success("Vétel rögzítve — egyedi áron.");
    } catch {
      toast.error("Nem sikerült menteni.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deletePurchase(id);
      await load();
      toast.success("Tétel törölve.");
    } catch {
      toast.error("Nem sikerült törölni.");
    }
  }

  function getPendingEntries() {
    return Object.entries(pendingQtyMap).filter(([, v]) => Number(v) > 0);
  }

  const pendingAddTotal = useMemo(() => {
    return Object.entries(pendingQtyMap).reduce((sum, [type, qtyStr]) => {
      const qty = Number(qtyStr) || 0;
      return sum + qty * (prices[type] ?? 0);
    }, 0);
  }, [pendingQtyMap, prices]);

  function openPendingAdd() {
    setPendingSeller("");
    setPendingSellerLocked(false);
    setPendingDate(todayDateInputValue());
    setPendingQtyMap({});
    setPendingAddOpen(true);
  }

  function openPendingAddForSeller(seller: string) {
    setPendingSeller(seller);
    setPendingSellerLocked(true);
    setPendingDate(todayDateInputValue());
    setPendingQtyMap({});
    setPendingAddOpen(true);
  }

  async function submitPendingAdd() {
    const entries = getPendingEntries();
    if (!pendingSeller.trim() || entries.length === 0) {
      toast.error("Adj meg nevet, és legalább egy típust darabszámmal.");
      return;
    }
    setPendingSubmitting(true);
    try {
      for (const [type, qtyStr] of entries) {
        await addPendingPurchase({
          seller: pendingSeller.trim(),
          type,
          qty: Number(qtyStr),
          date: pendingDate,
        });
      }
      setPendingAddOpen(false);
      await load();
      toast.success("Kifizetésre váró tétel(ek) rögzítve.");
    } catch {
      toast.error("Nem sikerült menteni.");
    } finally {
      setPendingSubmitting(false);
    }
  }

  function openPendingEdit(row: PurchaseRow) {
    setPendingEditRow(row);
    setPendingEditType(row.type);
    setPendingEditQty(String(row.qty));
    setPendingEditDate(row.day_key);
  }

  async function submitPendingEdit() {
    if (!pendingEditRow) return;
    const qty = Number(pendingEditQty);
    if (!pendingEditType || !qty) {
      toast.error("Adj meg típust és darabszámot.");
      return;
    }
    setPendingSubmitting(true);
    try {
      await updatePendingPurchase(pendingEditRow.id, {
        type: pendingEditType,
        qty,
        date: pendingEditDate,
      });
      setPendingEditRow(null);
      await load();
      toast.success("Tétel módosítva.");
    } catch {
      toast.error("Nem sikerült módosítani.");
    } finally {
      setPendingSubmitting(false);
    }
  }

  async function handlePaySeller(seller: string) {
    try {
      await payPendingSeller(seller);
      await load();
      toast.success(`${seller} kifizetve.`);
    } catch {
      toast.error("Nem sikerült kifizetni.");
    }
  }

  async function openKasszaDetail() {
    setKasszaDetailOpen(true);
    setKasszaDetailLoading(true);
    try {
      setKasszaMovements(await getKasszaMovements());
    } finally {
      setKasszaDetailLoading(false);
    }
  }

  async function recordKassza() {
    const amount = Number(kasszaAmount);
    if (!kasszaDesc.trim() || !amount) {
      toast.error("Adj meg leírást és összeget.");
      return;
    }
    await addKasszaMovement(kasszaDesc, amount);
    setKasszaDesc("");
    setKasszaAmount("");
    await load();
    toast.success("Kassza-mozgás rögzítve.");
  }

  const pending = purchases.filter((p) => p.pending);
  const settled = purchases.filter((p) => !p.pending);
  const todayPurchases = settled.filter((p) => p.day_key === todayKey);
  const pastPurchases = settled.filter((p) => p.day_key !== todayKey);

  const pastGroups: { dayKey: string; totals: Record<string, number> }[] = [];
  for (const p of pastPurchases) {
    let group = pastGroups.find((g) => g.dayKey === p.day_key);
    if (!group) {
      group = { dayKey: p.day_key, totals: {} };
      pastGroups.push(group);
    }
    group.totals[p.type] = (group.totals[p.type] ?? 0) + p.qty;
  }

  const pendingGroups: { seller: string; entries: PurchaseRow[]; total: number }[] = [];
  for (const p of pending) {
    let group = pendingGroups.find((g) => g.seller === p.seller);
    if (!group) {
      group = { seller: p.seller, entries: [], total: 0 };
      pendingGroups.push(group);
    }
    group.entries.push(p);
    group.total += p.total;
  }
  for (const g of pendingGroups) {
    g.entries.sort((a, b) => a.day_key.localeCompare(b.day_key));
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Betöltés…</p>;
  }

  return (
    <div className="space-y-5">
      {typeCounters.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2.5">
            {typeCounters.map((c, i) => {
              const color = typeTileColor(i);
              return (
                <div
                  key={`havi-${c.type}`}
                  className={`rounded-lg border px-4 py-2.5 ${color.border} ${color.bg}`}
                >
                  <div className={`text-xs font-medium ${color.text}`}>
                    {c.type} — havi
                  </div>
                  <div className={`text-2xl font-bold tabular-nums ${color.text}`}>
                    {c.monthlyQty} db
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            {typeCounters.map((c, i) => {
              const color = typeTileColor(i);
              return (
                <div
                  key={`napi-${c.type}`}
                  className={`rounded-lg border px-3 py-1.5 ${color.border} ${color.bg}`}
                >
                  <div className={`text-[11px] font-medium ${color.text}`}>
                    {c.type} — mai
                  </div>
                  <div className={`text-base font-semibold tabular-nums ${color.text}`}>
                    {c.dailyQty} db
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.5fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Ma, {weekdayPart} — gyors rögzítés
          </CardTitle>
          <p className="text-xs text-muted-foreground">{datePart}</p>
        </CardHeader>
        <CardContent className="space-y-4" data-kbnav-group>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.keys(prices).map((t) => (
              <div key={t} className="space-y-1.5">
                <Label className="text-xs">{t}</Label>
                <Input
                  type="number"
                  placeholder="db"
                  value={todayQty[t] ?? ""}
                  onChange={(e) =>
                    setTodayQty((prev) => ({ ...prev, [t]: e.target.value }))
                  }
                  data-kbnav-item
                  onKeyDown={kbNav}
                />
                <p className="text-[11px] text-muted-foreground">
                  {prices[t] ? `${prices[t]} Ft/db` : "—"}
                </p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Aktuális kifizetés</span>
            <span className="font-semibold tabular-nums">
              {currentEntryTotal.toLocaleString("hu-HU")} Ft
            </span>
          </div>
          <Button
            onClick={() => recordDay("keszpenz")}
            disabled={submitting}
            size="lg"
            className="w-full"
            data-kbnav-submit
          >
            {submitting ? "Mentés…" : "Vétel — készpénzből fizetve"}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={() => recordDay("atutalas")}
              disabled={submitting}
              className="w-full bg-blue-600 text-white hover:bg-blue-700"
            >
              Vétel — átutalással
            </Button>
            <Button
              onClick={openCustomPrice}
              disabled={submitting}
              className="w-full bg-violet-600 text-white hover:bg-violet-700"
            >
              Vétel — egyedi áron
            </Button>
          </div>

          <h3 className="pt-2 text-sm font-medium">Havi felvásárlások</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dátum</TableHead>
                <TableHead>Típus</TableHead>
                <TableHead className="text-right">Db</TableHead>
                <TableHead className="text-right">Egységár</TableHead>
                <TableHead className="text-right">Összeg</TableHead>
                <TableHead></TableHead>
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {todayPurchases.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Ma még nincs rögzített vétel.
                  </TableCell>
                </TableRow>
              )}
              {todayPurchases.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-muted-foreground">{p.date}</TableCell>
                  <TableCell>{p.type}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.qty}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.unit_price} Ft</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {p.total.toLocaleString("hu-HU")} Ft
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {p.pending && (
                        <Badge className="bg-warning/15 text-warning hover:bg-warning/15">
                          Kifizetésre vár
                        </Badge>
                      )}
                      {p.payment_method === "atutalas" && (
                        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
                          Átutalással
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => handleDelete(p.id)}
                      title="Törlés (hibás rögzítés)"
                      className="text-destructive/70 hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {pastGroups.length > 0 && (
            <div className="space-y-3 pt-2">
              <h3 className="text-sm font-medium">Korábbi napok</h3>
              {pastGroups.map((g) => (
                <div key={g.dayKey} className="rounded-md border px-3 py-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    {dayGroupLabel(g.dayKey)}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {Object.entries(g.totals).map(([type, qty]) => (
                      <span key={type}>
                        {type}: <span className="font-medium tabular-nums">{qty} db</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-5">
        <Card
          className="cursor-pointer border-warning/30 bg-warning/5 transition-colors hover:bg-warning/10"
          onClick={openKasszaDetail}
        >
          <CardHeader>
            <CardTitle className="text-xs font-medium text-warning">
              Kassza egyenleg
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-warning">
              {kassza.toLocaleString("hu-HU")} Ft
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Kattints a tételes bevétel/kifizetés listáért
            </p>
          </CardContent>
        </Card>

        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-xs font-medium text-primary">
              Mai kiadás
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">
              {todayExpense.toLocaleString("hu-HU")} Ft
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">Kifizetésre váró tételek</CardTitle>
            <div className="flex items-center gap-2">
              {pendingGroups.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPendingListOpen((v) => !v)}
                >
                  Lista ({pendingGroups.length})
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={openPendingAdd}>
                + Új tétel
              </Button>
            </div>
          </CardHeader>
          {(pendingGroups.length === 0 || pendingListOpen) && (
            <CardContent className="space-y-3">
              {pendingGroups.length === 0 && (
                <p className="text-xs text-muted-foreground">Nincs kifizetésre váró tétel.</p>
              )}
              {pendingGroups.map((g) => (
                <div key={g.seller} className="rounded-md border px-3 py-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{g.seller}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums">
                        {g.total.toLocaleString("hu-HU")} Ft
                      </span>
                      <button
                        type="button"
                        onClick={() => openPendingAddForSeller(g.seller)}
                        title="Új dátumra felvétel"
                        className="rounded-md border p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <Button size="sm" onClick={() => handlePaySeller(g.seller)}>
                        Kifizetés
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {g.entries.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center justify-between rounded-md bg-muted/30 px-2.5 py-1.5 text-xs"
                    >
                      <span className="text-muted-foreground">
                        {dayGroupLabel(e.day_key)} · {e.type} ·{" "}
                        <span className="font-medium text-foreground">{e.qty} db</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-medium tabular-nums">
                          {e.total.toLocaleString("hu-HU")} Ft
                        </span>
                        <button
                          type="button"
                          onClick={() => openPendingEdit(e)}
                          title="Módosítás"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(e.id)}
                          title="Törlés"
                          className="text-destructive/70 hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Nyitvatartáson túl/hétvégén leadott tétel — a darabszám azonnal a készletben van,
                a kassza csak a "Kifizetés" gombra kattintva, a tényleges kifizetéskor csökken.
              </p>
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Egyéb kassza-mozgás</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Leírás (pl. számla kifizetése)"
              value={kasszaDesc}
              onChange={(e) => setKasszaDesc(e.target.value)}
            />
            <Input
              type="number"
              placeholder="Összeg (Ft), negatív ha kiadás"
              value={kasszaAmount}
              onChange={(e) => setKasszaAmount(e.target.value)}
            />
            <Button variant="outline" className="w-full" onClick={recordKassza}>
              Rögzítés
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={kasszaDetailOpen} onOpenChange={setKasszaDetailOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Kassza mozgások</DialogTitle>
          </DialogHeader>
          {kasszaDetailLoading ? (
            <p className="text-sm text-muted-foreground">Betöltés…</p>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <h4 className="mb-2 text-xs font-medium text-success">Bevétel</h4>
                <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
                  {kasszaMovements.filter((m) => m.amount > 0).length === 0 && (
                    <p className="text-xs text-muted-foreground">Nincs tétel.</p>
                  )}
                  {kasszaMovements
                    .filter((m) => m.amount > 0)
                    .map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between rounded-md border bg-success/5 px-2.5 py-1.5 text-sm"
                      >
                        <span className="truncate pr-2 text-muted-foreground">
                          {m.date} · {m.description}
                        </span>
                        <span className="shrink-0 font-medium tabular-nums text-success">
                          +{m.amount.toLocaleString("hu-HU")} Ft
                        </span>
                      </div>
                    ))}
                </div>
              </div>
              <div>
                <h4 className="mb-2 text-xs font-medium text-destructive">Kifizetés</h4>
                <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
                  {kasszaMovements.filter((m) => m.amount < 0).length === 0 && (
                    <p className="text-xs text-muted-foreground">Nincs tétel.</p>
                  )}
                  {kasszaMovements
                    .filter((m) => m.amount < 0)
                    .map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between rounded-md border bg-destructive/5 px-2.5 py-1.5 text-sm"
                      >
                        <span className="truncate pr-2 text-muted-foreground">
                          {m.date} · {m.description}
                        </span>
                        <span className="shrink-0 font-medium tabular-nums text-destructive">
                          {m.amount.toLocaleString("hu-HU")} Ft
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={customPriceOpen} onOpenChange={setCustomPriceOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Vétel — egyedi áron</DialogTitle>
          </DialogHeader>
          <div className="space-y-3" data-kbnav-group>
            {getEntries().map(([type, qtyStr]) => (
              <div key={type} className="flex items-center justify-between gap-3">
                <div className="text-sm">
                  <div className="font-medium">{type}</div>
                  <div className="text-xs text-muted-foreground">{qtyStr} db</div>
                </div>
                <Input
                  type="number"
                  className="w-28 text-right"
                  value={customPrices[type] ?? ""}
                  onChange={(e) =>
                    setCustomPrices((prev) => ({ ...prev, [type]: e.target.value }))
                  }
                  data-kbnav-item
                  onKeyDown={kbNav}
                />
              </div>
            ))}
            <Button
              onClick={recordCustomPrice}
              disabled={submitting}
              className="w-full bg-violet-600 text-white hover:bg-violet-700"
              data-kbnav-submit
            >
              {submitting ? "Mentés…" : "Rögzítés egyedi áron"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={pendingAddOpen} onOpenChange={setPendingAddOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Kifizetésre váró tétel felvétele</DialogTitle>
          </DialogHeader>
          <div className="space-y-3" data-kbnav-group>
            <div className="space-y-1.5">
              <Label className="text-xs">Név</Label>
              <Input
                value={pendingSeller}
                onChange={(e) => setPendingSeller(e.target.value)}
                placeholder="Ki hozta"
                disabled={pendingSellerLocked}
                data-kbnav-item
                onKeyDown={kbNav}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Dátum</Label>
              <Input
                type="date"
                value={pendingDate}
                onChange={(e) => setPendingDate(e.target.value)}
                data-kbnav-item
                onKeyDown={kbNav}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Típusok és darabszámok</Label>
              <div className="grid grid-cols-2 gap-3">
                {Object.keys(prices).map((t) => (
                  <div key={t} className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">{t}</Label>
                    <Input
                      type="number"
                      placeholder="db"
                      value={pendingQtyMap[t] ?? ""}
                      onChange={(e) =>
                        setPendingQtyMap((prev) => ({ ...prev, [t]: e.target.value }))
                      }
                      data-kbnav-item
                      onKeyDown={kbNav}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Összeg</span>
              <span className="font-semibold tabular-nums">
                {pendingAddTotal.toLocaleString("hu-HU")} Ft
              </span>
            </div>
            <Button
              onClick={submitPendingAdd}
              disabled={pendingSubmitting}
              className="w-full"
              data-kbnav-submit
            >
              {pendingSubmitting ? "Mentés…" : "Rögzítés"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingEditRow !== null}
        onOpenChange={(open) => !open && setPendingEditRow(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Tétel módosítása — {pendingEditRow?.seller}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3" data-kbnav-group>
            <div className="space-y-1.5">
              <Label className="text-xs">Dátum</Label>
              <Input
                type="date"
                value={pendingEditDate}
                onChange={(e) => setPendingEditDate(e.target.value)}
                data-kbnav-item
                onKeyDown={kbNav}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Típus</Label>
              <Select
                value={pendingEditType}
                onValueChange={(v) => v && setPendingEditType(v)}
              >
                <SelectTrigger className="w-full" data-kbnav-item onKeyDown={kbNav}>
                  <SelectValue placeholder="Válassz típust" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(prices).map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Darabszám</Label>
              <Input
                type="number"
                value={pendingEditQty}
                onChange={(e) => setPendingEditQty(e.target.value)}
                placeholder="db"
                data-kbnav-item
                onKeyDown={kbNav}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Összeg</span>
              <span className="font-semibold tabular-nums">
                {(
                  (Number(pendingEditQty) || 0) * (prices[pendingEditType] ?? 0)
                ).toLocaleString("hu-HU")}{" "}
                Ft
              </span>
            </div>
            <Button
              onClick={submitPendingEdit}
              disabled={pendingSubmitting}
              className="w-full"
              data-kbnav-submit
            >
              {pendingSubmitting ? "Mentés…" : "Módosítás mentése"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
