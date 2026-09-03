"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { VegyesSplitRow } from "@/components/keszlet/vegyes-split-row";
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

  const load = useCallback(async () => {
    const snap = await getNyiregyhazaFoSnapshot();
    setStock(snap.stock);
    setEvents(snap.events);
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  async function handleVegyesSplit(vilagos: number, szurke: number) {
    try {
      await recordSzetvalogatas({ site: "Nyíregyháza", vilagos, szurke });
      await load();
      toast.success("Szétválogatás rögzítve.");
    } catch {
      toast.error("Nem sikerült rögzíteni.");
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
          {Object.entries(stock).map(([type, qty]) =>
            type === "Vegyes EUR" ? (
              <VegyesSplitRow key={type} qty={qty} onSubmit={handleVegyesSplit} />
            ) : (
              <div
                key={type}
                className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm"
              >
                <span>{type}</span>
                <span className="font-semibold tabular-nums">{qty}</span>
              </div>
            )
          )}
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
