"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InventoryDialog } from "@/components/keszlet/inventory-dialog";
import { toast } from "sonner";
import {
  getNyiregyhazaFoSnapshot,
  recordSzetvalogatas,
  type EventRow,
} from "@/lib/keszlet/actions";

const KIND_LABEL: Record<EventRow["kind"], string> = {
  csere: "Csere",
  szet: "Szétválogatás",
  "havi-zaras": "Havi zárás",
  mozgas: "Mozgás",
};

const KIND_CLASS: Record<EventRow["kind"], string> = {
  csere: "bg-violet-100 text-violet-700 hover:bg-violet-100",
  szet: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  "havi-zaras": "bg-muted text-muted-foreground hover:bg-muted",
  mozgas: "bg-muted text-muted-foreground hover:bg-muted",
};

export function NyiregyhazaFoTab() {
  const [loading, setLoading] = useState(true);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [events, setEvents] = useState<EventRow[]>([]);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [quickSplitQty, setQuickSplitQty] = useState("");
  const [quickSplitSubmitting, setQuickSplitSubmitting] = useState(false);

  const load = useCallback(async () => {
    const snap = await getNyiregyhazaFoSnapshot();
    setStock(snap.stock);
    setEvents(snap.events);
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  async function handleQuickSplit(target: "vilagos" | "szurke") {
    const qty = Number(quickSplitQty);
    if (!qty || qty <= 0) {
      toast.error("Adj meg egy darabszámot.");
      return;
    }
    if (qty > (stock["Vegyes EUR"] ?? 0)) {
      toast.error("A megadott darabszám meghaladja az elérhető Vegyes EUR mennyiséget.");
      return;
    }
    setQuickSplitSubmitting(true);
    try {
      await recordSzetvalogatas({
        vilagos: target === "vilagos" ? qty : 0,
        szurke: target === "szurke" ? qty : 0,
        torott: 0,
      });
      setQuickSplitQty("");
      await load();
      toast.success(
        target === "vilagos"
          ? `${qty} db átkerült Fehérbe.`
          : `${qty} db átkerült Szürkébe.`
      );
    } catch {
      toast.error("Nem sikerült rögzíteni.");
    } finally {
      setQuickSplitSubmitting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Betöltés…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setInventoryOpen(true)} variant="outline">
          📋 Leltár indítása
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Object.entries(stock).map(([type, qty]) => (
          <Card key={type}>
            <CardContent className="space-y-3 py-4">
              <div>
                <div className="text-xs text-muted-foreground">{type}</div>
                <div className="mt-1 text-2xl font-bold tabular-nums">{qty}</div>
              </div>
              {type === "Vegyes EUR" && (
                <div className="space-y-1.5 border-t pt-3">
                  <Input
                    type="number"
                    placeholder="db"
                    value={quickSplitQty}
                    onChange={(e) => setQuickSplitQty(e.target.value)}
                    className="h-8"
                  />
                  <div className="grid grid-cols-2 gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={quickSplitSubmitting}
                      onClick={() => handleQuickSplit("vilagos")}
                      className="border-neutral-300 bg-neutral-50 text-neutral-700 hover:bg-neutral-100"
                    >
                      Fehér
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={quickSplitSubmitting}
                      onClick={() => handleQuickSplit("szurke")}
                      className="border-slate-400 bg-slate-100 text-slate-700 hover:bg-slate-200"
                    >
                      Szürke
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Legutóbbi mozgások</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dátum</TableHead>
                <TableHead>Esemény</TableHead>
                <TableHead>Részletek</TableHead>
                <TableHead>Hatás</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-muted-foreground">{e.date}</TableCell>
                  <TableCell>
                    <Badge className={KIND_CLASS[e.kind]}>{KIND_LABEL[e.kind]}</Badge>
                  </TableCell>
                  <TableCell>{e.details}</TableCell>
                  <TableCell className="text-muted-foreground">{e.effect}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <InventoryDialog
        site="Nyíregyháza"
        types={Object.keys(stock)}
        currentStock={stock}
        open={inventoryOpen}
        onOpenChange={setInventoryOpen}
        onRecorded={load}
      />
    </div>
  );
}
