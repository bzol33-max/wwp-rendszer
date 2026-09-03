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
import { SzetvalogatasDialog } from "@/components/keszlet/szetvalogatas-dialog";
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

const ACTIVE_TYPES = ["EUR világos", "EUR szürke", "Vegyes EUR"];

export function NyiregyhazaFoTab() {
  const [loading, setLoading] = useState(true);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [events, setEvents] = useState<EventRow[]>([]);
  const [szetOpen, setSzetOpen] = useState(false);
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

  async function handleSzet(result: { vilagos: number; szurke: number; torott: number }) {
    try {
      await recordSzetvalogatas(result);
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
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setSzetOpen(true)} variant="outline">
          ✂️ Szétválogatás (Vegyes EUR)
        </Button>
        <Button onClick={() => setInventoryOpen(true)} variant="outline">
          📋 Leltár indítása
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Object.entries(stock).map(([type, qty]) => (
          <Card key={type}>
            <CardContent className="py-4">
              <div className="text-xs text-muted-foreground">{type}</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">{qty}</div>
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

      <SzetvalogatasDialog
        open={szetOpen}
        onOpenChange={setSzetOpen}
        vegyesAvailable={stock["Vegyes EUR"] ?? 0}
        onConfirm={handleSzet}
      />
      <InventoryDialog
        site="Nyíregyháza"
        types={ACTIVE_TYPES}
        currentStock={stock}
        open={inventoryOpen}
        onOpenChange={setInventoryOpen}
        onRecorded={load}
      />
    </div>
  );
}
