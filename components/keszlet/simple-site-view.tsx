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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InventoryDialog } from "@/components/keszlet/inventory-dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  addMovement,
  getSiteSnapshot,
  type Direction,
  type MovementRow,
} from "@/lib/keszlet/actions";

type Site = "Szakoly" | "Balkány";

const OTHER_SITE: Record<Site, string> = {
  Szakoly: "Balkány",
  Balkány: "Szakoly",
};

export function SimpleSiteView({ site }: { site: Site }) {
  const [loading, setLoading] = useState(true);
  const [types, setTypes] = useState<string[]>([]);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [movements, setMovements] = useState<MovementRow[]>([]);

  const [direction, setDirection] = useState<Direction>("be");
  const [type, setType] = useState<string>("");
  const [qty, setQty] = useState("");
  const [partner, setPartner] = useState("");
  const [targetSite, setTargetSite] = useState(OTHER_SITE[site]);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const snap = await getSiteSnapshot(site);
    setTypes(snap.types);
    setStock(snap.stock);
    setMovements(snap.movements);
    setType((prev) => prev || snap.types[0] || "");
  }, [site]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  async function submit() {
    const n = Number(qty);
    if (!n || n <= 0) {
      toast.error("Adj meg érvényes darabszámot.");
      return;
    }
    if (direction !== "mozgatas" && !partner.trim()) {
      toast.error("A partner megadása kötelező.");
      return;
    }
    setSubmitting(true);
    try {
      await addMovement({
        site,
        type,
        direction,
        qty: n,
        partner: direction === "mozgatas" ? undefined : partner,
        targetSite: direction === "mozgatas" ? targetSite : undefined,
      });
      setQty("");
      setPartner("");
      await load();
      toast.success("Mozgás rögzítve.");
    } catch {
      toast.error("Nem sikerült menteni. Próbáld újra.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Betöltés…</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Mozgás rögzítése</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["be", "Beérkezés"],
                ["ki", "Kiszállítás"],
                ["mozgatas", "Telephelyek közti mozgatás"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setDirection(value)}
                className={cn(
                  "rounded-md border px-2 py-2 text-xs font-medium transition-colors",
                  direction === value
                    ? "border-primary bg-accent text-accent-foreground"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Típus</Label>
              <Select value={type} onValueChange={(v) => v && setType(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {types.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Darabszám</Label>
              <Input
                type="number"
                placeholder="pl. 33"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
          </div>

          {direction !== "mozgatas" ? (
            <div className="space-y-1.5">
              <Label>Partner</Label>
              <Input
                placeholder="Partner neve"
                value={partner}
                onChange={(e) => setPartner(e.target.value)}
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Hová</Label>
              <Select value={targetSite} onValueChange={(v) => v && setTargetSite(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={OTHER_SITE[site]}>{OTHER_SITE[site]}</SelectItem>
                  <SelectItem value="Nyíregyháza">Nyíregyháza</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <Button onClick={submit} disabled={submitting} className="w-full sm:w-auto">
            {submitting ? "Mentés…" : "Mentés"}
          </Button>
        </CardContent>
      </Card>

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
