"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  getHaviSnapshot,
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

export function NyiregyhazaHaviTab() {
  const [loading, setLoading] = useState(true);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [kassza, setKassza] = useState(0);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [todayQty, setTodayQty] = useState<Record<string, string>>({});
  const [seller, setSeller] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [kasszaDesc, setKasszaDesc] = useState("");
  const [kasszaAmount, setKasszaAmount] = useState("");
  const { datePart, weekdayPart } = todayLabel();

  const load = useCallback(async () => {
    const snap = await getHaviSnapshot();
    setPurchases(snap.purchases);
    setKassza(snap.kassza);
    const priceMap: Record<string, number> = {};
    for (const p of snap.prices) if (p.default_price) priceMap[p.name] = p.default_price;
    setPrices(priceMap);
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const todayTotal = useMemo(() => {
    return Object.entries(todayQty).reduce((sum, [type, qtyStr]) => {
      const qty = Number(qtyStr) || 0;
      return sum + qty * (prices[type] ?? 0);
    }, 0);
  }, [todayQty, prices]);

  async function recordDay() {
    const entries = Object.entries(todayQty).filter(([, v]) => Number(v) > 0);
    if (entries.length === 0 || !seller.trim()) {
      toast.error("Adj meg legalább egy típust darabszámmal, és az eladót.");
      return;
    }
    setSubmitting(true);
    try {
      for (const [type, qtyStr] of entries) {
        await addPurchase({
          type,
          qty: Number(qtyStr),
          unitPrice: prices[type] ?? 0,
          seller,
        });
      }
      setTodayQty({});
      setSeller("");
      await load();
      toast.success("Vétel rögzítve.");
    } catch {
      toast.error("Nem sikerült menteni.");
    } finally {
      setSubmitting(false);
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
          <div className="space-y-1.5">
            <Label>Eladó</Label>
            <Input placeholder="Név" value={seller} onChange={(e) => setSeller(e.target.value)} />
          </div>
          <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Mai kiadás összesen</span>
            <span className="font-semibold tabular-nums">
              {todayTotal.toLocaleString("hu-HU")} Ft
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
                <TableHead>Eladó</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchases.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-muted-foreground">{p.date}</TableCell>
                  <TableCell>{p.type}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.qty}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.unit_price} Ft</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {p.total.toLocaleString("hu-HU")} Ft
                  </TableCell>
                  <TableCell>
                    {p.seller}
                    {p.pending && (
                      <Badge className="ml-2 bg-warning/15 text-warning hover:bg-warning/15">
                        Kifizetésre vár
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-5">
        <Card className="border-warning/30 bg-warning/5">
          <CardHeader>
            <CardTitle className="text-xs font-medium text-warning">
              Kassza egyenleg
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-warning">
              {kassza.toLocaleString("hu-HU")} Ft
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
                    {p.type} · {p.qty} db · {p.seller}
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
    </div>
  );
}
