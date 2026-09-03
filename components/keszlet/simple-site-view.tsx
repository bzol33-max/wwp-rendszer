"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { InventoryDialog } from "@/components/keszlet/inventory-dialog";
import { MovementForm } from "@/components/keszlet/movement-form";
import {
  getSiteSnapshot,
  type MovementRow,
} from "@/lib/keszlet/actions";

type Site = "Szakoly" | "Balkány";

const OTHER_SITES: Record<Site, string[]> = {
  Szakoly: ["Balkány", "Nyíregyháza"],
  Balkány: ["Szakoly", "Nyíregyháza"],
};

export function SimpleSiteView({ site }: { site: Site }) {
  const [loading, setLoading] = useState(true);
  const [types, setTypes] = useState<string[]>([]);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [inventoryOpen, setInventoryOpen] = useState(false);

  const load = useCallback(async () => {
    const snap = await getSiteSnapshot(site);
    setTypes(snap.types);
    setStock(snap.stock);
    setMovements(snap.movements);
  }, [site]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Betöltés…</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
      <MovementForm site={site} types={types} otherSites={OTHER_SITES[site]} onRecorded={load} />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Jelenlegi készlet — {site}</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setInventoryOpen(true)}>
              Leltár indítása
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            {Object.entries(stock).map(([t, q]) => (
              <div
                key={t}
                className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm"
              >
                <span>{t}</span>
                <span className="font-semibold tabular-nums">{q}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Csak az itt aktivált típusok jelennek meg — telephelyenként állítható.
          </p>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-sm">Legutóbbi mozgások — {site}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dátum</TableHead>
                <TableHead>Típus</TableHead>
                <TableHead>Irány</TableHead>
                <TableHead>Partner / cél</TableHead>
                <TableHead className="text-right">Db</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-muted-foreground">{m.date}</TableCell>
                  <TableCell>{m.type}</TableCell>
                  <TableCell>
                    {m.direction === "be" && (
                      <Badge className="bg-success/15 text-success hover:bg-success/15">Be</Badge>
                    )}
                    {m.direction === "ki" && (
                      <Badge variant="destructive" className="bg-destructive/10 text-destructive hover:bg-destructive/10">
                        Ki
                      </Badge>
                    )}
                    {m.direction === "mozgatas" && (
                      <Badge className="bg-warning/15 text-warning hover:bg-warning/15">Mozgatás</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {m.direction === "mozgatas" ? `→ ${m.target_site}` : m.partner}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {m.direction === "be" ? "+" : "−"}
                    {m.qty}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
    </div>
  );
}
