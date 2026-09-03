"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
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
  addPurchase,
  deletePurchase,
  getHaviSnapshot,
  getKasszaMovements,
  type KasszaMovementRow,
  type PurchaseRow,
} from "@/lib/keszlet/actions";

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
  const { datePart, weekdayPart } = todayLabel();

  const load = useCallback(async () => {
    const snap = await getHaviSnapshot();
    setPurchases(snap.purchases);
    setTodayKey(snap.todayKey);
    setKassza(snap.kassza);
    setTodayExpense(snap.todayExpense);
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

  async function recordDay() {
    const entries = Object.entries(todayQty).filter(([, v]) => Number(v) > 0);
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
        });
      }
      setTodayQty({});
      await load();
      toast.success("Vétel rögzítve.");
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
  const todayPurchases = purchases.filter((p) => p.day_key === todayKey);
  const pastPurchases = purchases.filter((p) => p.day_key !== todayKey);

  const pastGroups: { dayKey: string; totals: Record<string, number> }[] = [];
  for (const p of pastPurchases) {
    let group = pastGroups.find((g) => g.dayKey === p.day_key);
    if (!group) {
      group = { dayKey: p.day_key, totals: {} };
      pastGroups.push(group);
    }
    group.totals[p.type] = (group.totals[p.type] ?? 0) + p.qty;
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Betöltés…</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.5fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Ma, {weekdayPart} — gyors rögzítés
          </CardTitle>
          <p className="text-xs text-muted-foreground">{datePart}</p>
        </CardHeader>
        <CardContent className="space-y-4">
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
          <Button onClick={recordDay} disabled={submitting} size="lg" className="w-full">
            {submitting ? "Mentés…" : "Vétel — készpénzből fizetve"}
          </Button>

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
                    {p.pending && (
                      <Badge className="bg-warning/15 text-warning hover:bg-warning/15">
                        Kifizetésre vár
                      </Badge>
                    )}
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

        {pending.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Kifizetésre vár</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {pending.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm"
                >
                  <span>
                    {p.type} · {p.qty} db
                  </span>
                  <span className="font-medium tabular-nums">
                    {p.total.toLocaleString("hu-HU")} Ft
                  </span>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Nyitvatartáson túl/hétvégén leadott tétel — a darabszám már a készletben van,
                a kassza csak a tényleges kifizetéskor csökken.
              </p>
            </CardContent>
          </Card>
        )}

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
    </div>
  );
}
