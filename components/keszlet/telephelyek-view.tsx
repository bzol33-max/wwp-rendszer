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
import { X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  getNyiregyhazaFoSnapshot,
  getSiteSnapshot,
  getOsszkeszlet,
  getOsszkeszletMovements,
  recordSzetvalogatas,
  deleteMovement,
  deleteMovementEvent,
  type EventRow,
  type MovementRow,
  type OsszkeszletRow,
  type OsszkeszletMovementRow,
} from "@/lib/keszlet/actions";
import { getCurrentUser } from "@/lib/current-user";
import { useCanEdit } from "@/components/auth/edit-permission-context";

const SITES = ["Nyíregyháza", "Balkány", "Szakoly", "Összkészlet"] as const;
type SiteKey = (typeof SITES)[number];

const OTHER_SITES: Record<string, string[]> = {
  "Nyíregyháza": ["Szakoly", "Balkány"],
  "Balkány": ["Szakoly", "Nyíregyháza"],
  "Szakoly": ["Balkány", "Nyíregyháza"],
};

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

function Tile({ name, qty }: { name: string; qty: number }) {
  return (
    <div className="min-w-0 rounded-lg border bg-muted/30 px-2.5 py-2 text-center">
      <div className="truncate text-[11px] font-medium text-muted-foreground">{name}</div>
      <div className="text-lg font-bold tabular-nums">{qty}</div>
    </div>
  );
}

/**
 * Egységes, csempés "Telephelyek" nézet — Nyíregyháza / Balkány / Szakoly /
 * Összkészlet egy közös sablonban, felül telephely-váltóval (a korábbi 4
 * külön fül helyett). Asztalon és mobilon is ugyanez a komponens fut, a
 * reszponzív osztályok (lg:) döntik el az elrendezést.
 */
export function TelephelyekView() {
  const canEdit = useCanEdit();
  const [active, setActive] = useState<SiteKey>("Nyíregyháza");
  const [loading, setLoading] = useState(true);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [types, setTypes] = useState<string[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [ossz, setOssz] = useState<OsszkeszletRow[]>([]);
  const [osszMovements, setOsszMovements] = useState<OsszkeszletMovementRow[]>([]);
  const [inventoryOpen, setInventoryOpen] = useState(false);

  const load = useCallback(async () => {
    if (active === "Összkészlet") {
      const [rows, mv] = await Promise.all([getOsszkeszlet(), getOsszkeszletMovements()]);
      setOssz(rows);
      setOsszMovements(mv);
      return;
    }
    if (active === "Nyíregyháza") {
      const snap = await getNyiregyhazaFoSnapshot();
      setStock(snap.stock);
      setEvents(snap.events);
      setTypes(Object.keys(snap.stock));
      return;
    }
    const snap = await getSiteSnapshot(active);
    setStock(snap.stock);
    setMovements(snap.movements);
    setTypes(snap.types);
  }, [active]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  async function handleVegyesSplit(vilagos: number, szurke: number) {
    try {
      await recordSzetvalogatas({
        site: active,
        vilagos,
        szurke,
        createdBy: getCurrentUser() || undefined,
      });
      await load();
      toast.success("Szétválogatás rögzítve.");
    } catch {
      toast.error("Nem sikerült rögzíteni.");
    }
  }

  async function handleDeleteMovement(id: string) {
    try {
      await deleteMovement(id);
      await load();
      toast.success("Mozgás törölve.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nem sikerült törölni.");
    }
  }

  async function handleDeleteEvent(id: string) {
    try {
      await deleteMovementEvent(id);
      await load();
      toast.success("Mozgás törölve.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nem sikerült törölni.");
    }
  }

  const isSummary = active === "Összkészlet";
  const isNyiregyhaza = active === "Nyíregyháza";
  const tileEntries = Object.entries(stock).filter(([t]) => t !== "Vegyes EUR");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {SITES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setActive(s)}
            className={cn(
              "min-h-9 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors max-md:min-h-11",
              active === s
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
      ) : isSummary ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Összkészlet — típusonként, telephelyenkénti bontásban</CardTitle>
            </CardHeader>
            <CardContent>
              {ossz.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nincs aktivált típus egyik telephelyen sem.</p>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
                  {ossz.map((r) => (
                    <div key={r.type} className="rounded-lg border bg-muted/30 px-3 py-3">
                      <div className="truncate text-xs font-medium text-muted-foreground">{r.type}</div>
                      <div className="text-2xl font-bold tabular-nums">{r.total}</div>
                      <div className="mt-1.5 space-y-0.5">
                        {["Nyíregyháza", "Balkány", "Szakoly"]
                          .filter((s) => s in r.bySite)
                          .map((s) => (
                            <div key={s} className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                              <span className="truncate">{s}</span>
                              <span className="shrink-0 font-medium tabular-nums text-foreground">{r.bySite[s]}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Mozgások — összes telephely (be/ki, mozgatás nélkül)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dátum/idő</TableHead>
                    <TableHead>Telephely</TableHead>
                    <TableHead>Típus</TableHead>
                    <TableHead>Irány</TableHead>
                    <TableHead>Partner</TableHead>
                    <TableHead className="text-right">Db</TableHead>
                    <TableHead>Ki</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {osszMovements.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        Nincs rögzített mozgás.
                      </TableCell>
                    </TableRow>
                  )}
                  {osszMovements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-muted-foreground">{m.date}</TableCell>
                      <TableCell>{m.site}</TableCell>
                      <TableCell>{m.type}</TableCell>
                      <TableCell>
                        {m.direction === "be" ? (
                          <Badge className="bg-success/15 text-success hover:bg-success/15">Be</Badge>
                        ) : (
                          <Badge variant="destructive" className="bg-destructive/10 text-destructive hover:bg-destructive/10">
                            Ki
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{m.partner}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {m.direction === "be" ? "+" : "−"}
                        {m.qty}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{m.created_by ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
          <MovementForm
            site={active}
            types={types}
            otherSites={OTHER_SITES[active]}
            onRecorded={load}
          />

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Jelenlegi készlet — {active}</CardTitle>
                {canEdit && (
                  <Button size="sm" variant="outline" onClick={() => setInventoryOpen(true)}>
                    Leltár indítása
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
                {tileEntries.map(([type, qty]) => (
                  <Tile key={type} name={type} qty={qty} />
                ))}
              </div>
              {"Vegyes EUR" in stock &&
                (canEdit ? (
                  <VegyesSplitRow qty={stock["Vegyes EUR"]} onSubmit={handleVegyesSplit} />
                ) : (
                  <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
                    <span>Vegyes EUR</span>
                    <span className="font-semibold tabular-nums">{stock["Vegyes EUR"]}</span>
                  </div>
                ))}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm">Legutóbbi mozgások</CardTitle>
            </CardHeader>
            <CardContent>
              {isNyiregyhaza ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dátum/idő</TableHead>
                      <TableHead>Esemény</TableHead>
                      <TableHead>Részletek</TableHead>
                      <TableHead>Hatás</TableHead>
                      <TableHead>Ki</TableHead>
                      {canEdit && <TableHead className="w-8" />}
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
                        <TableCell className="text-muted-foreground">{e.created_by ?? "—"}</TableCell>
                        {canEdit && (
                          <TableCell>
                            {e.kind === "mozgas" && (
                              <button
                                type="button"
                                onClick={() => handleDeleteEvent(e.id)}
                                title="Törlés (hibás rögzítés)"
                                className="text-destructive/70 hover:text-destructive"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dátum/idő</TableHead>
                      <TableHead>Típus</TableHead>
                      <TableHead>Irány</TableHead>
                      <TableHead>Partner / cél</TableHead>
                      <TableHead className="text-right">Db</TableHead>
                      <TableHead>Ki</TableHead>
                      {canEdit && <TableHead className="w-8" />}
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
                          {m.direction === "mozgatas_be" && (
                            <Badge className="bg-success/15 text-success hover:bg-success/15">Bejövő mozgatás</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {m.direction === "mozgatas" && `→ ${m.target_site}`}
                          {m.direction === "mozgatas_be" && `← ${m.target_site}`}
                          {m.direction !== "mozgatas" && m.direction !== "mozgatas_be" && m.partner}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {m.direction === "be" || m.direction === "mozgatas_be" ? "+" : "−"}
                          {m.qty}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{m.created_by ?? "—"}</TableCell>
                        {canEdit && (
                          <TableCell>
                            <button
                              type="button"
                              onClick={() => handleDeleteMovement(m.id)}
                              title="Törlés (hibás rögzítés)"
                              className="text-destructive/70 hover:text-destructive"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <InventoryDialog
            site={active}
            types={types}
            currentStock={stock}
            open={inventoryOpen}
            onOpenChange={setInventoryOpen}
            onRecorded={load}
          />
        </div>
      )}
    </div>
  );
}
