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
import { MovementForm } from "@/components/keszlet/movement-form";
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
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
      <MovementForm
        site="Nyíregyháza"
        types={Object.keys(stock)}
        otherSites={["Szakoly", "Balkány"]}
        onRecorded={load}
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Jelenlegi készlet — Nyíregyháza</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setInventoryOpen(true)}>
              Leltár indítása
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {Object.entries(stock).map(([type, qty]) => (
            <div key={type} className="rounded-md border bg-muted/30 px-3 py-2">
              <div className="flex items-center justify-between text-sm">
                <span>{type}</span>
                <span className="font-semibold tabular-nums">{qty}</span>
              </div>
              {type === "Vegyes EUR" && (
                <div className="mt-2 space-y-1.5 border-t pt-2">
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
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
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
