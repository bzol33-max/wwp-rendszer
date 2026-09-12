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
import { Package, X } from "lucide-react";
import { toast } from "sonner";
import {
  getNyiregyhazaFoSnapshot,
  getSiteSnapshot,
  getOsszkeszlet,
  getOsszkeszletHavibontas,
  recordSzetvalogatas,
  deleteMovement,
  deleteMovementEvent,
  type EventRow,
  type MovementRow,
  type OsszkeszletRow,
  type OsszkeszletHaviRow,
} from "@/lib/keszlet/actions";
import { getCurrentUser } from "@/lib/current-user";
import { useCanEdit } from "@/components/auth/edit-permission-context";

type SiteKey = "Nyíregyháza" | "Balkány" | "Szakoly" | "Összkészlet";

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

const SITE_ORDER = ["Nyíregyháza", "Balkány", "Szakoly"];
const SITE_OPACITY_CLASS = ["bg-foreground/55", "bg-foreground/30", "bg-foreground/15"];

function siteShares(bySite: Record<string, number>, total: number) {
  return SITE_ORDER.filter((s) => s in bySite).map((site, i) => ({
    site,
    qty: bySite[site],
    pct: total > 0 ? (bySite[site] / total) * 100 : 0,
    opacityClass: SITE_OPACITY_CLASS[i] ?? "bg-foreground/15",
  }));
}

// Kis oszlopdiagram — típusonként külön skálázva (a magasság csak az adott
// típus saját Be/Ki értékeihez viszonyít, más típussal nem összevethető).
function MiniMonthlyChart({ months }: { months: { label: string; be: number; ki: number }[] }) {
  const max = Math.max(1, ...months.flatMap((m) => [m.be, m.ki]));
  const colWidth = 240 / Math.max(1, months.length);
  const barW = 8;
  const maxH = 40;
  return (
    <svg viewBox="0 0 240 46" className="h-[46px] w-full">
      <line x1={0} y1={44} x2={240} y2={44} stroke="var(--border)" strokeWidth={1} />
      {months.map((m, i) => {
        const center = colWidth * (i + 0.5);
        const beH = m.be > 0 ? Math.max(2, Math.round((m.be / max) * maxH)) : 0;
        const kiH = m.ki > 0 ? Math.max(2, Math.round((m.ki / max) * maxH)) : 0;
        return (
          <g key={m.label + i}>
            {beH > 0 && <rect x={center - barW - 1} y={44 - beH} width={barW} height={beH} rx={2} fill="var(--success)" />}
            {kiH > 0 && <rect x={center + 1} y={44 - kiH} width={barW} height={kiH} rx={2} fill="var(--destructive)" />}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Csempés stílusú telephely-nézet — a Készlet modul saját fülén (Nyíregyháza/
 * Balkány/Szakoly/Összkészlet, ahogy eddig is) ugyanez a komponens fut,
 * a `site` prop dönti el melyiket mutatja. Asztalon és mobilon is ugyanez a
 * komponens, a reszponzív osztályok (lg:) döntik el az elrendezést.
 */
export function TelephelyekView({ site: active }: { site: SiteKey }) {
  const canEdit = useCanEdit();
  const [loading, setLoading] = useState(true);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [types, setTypes] = useState<string[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [ossz, setOssz] = useState<OsszkeszletRow[]>([]);
  const [osszHavi, setOsszHavi] = useState<OsszkeszletHaviRow[]>([]);
  const [inventoryOpen, setInventoryOpen] = useState(false);

  const load = useCallback(async () => {
    if (active === "Összkészlet") {
      const [rows, havi] = await Promise.all([getOsszkeszlet(), getOsszkeszletHavibontas()]);
      setOssz(rows);
      setOsszHavi(havi);
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
      {loading ? (
        <p className="text-sm text-muted-foreground">Betöltés…</p>
      ) : isSummary ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Mozgások — típusonként</CardTitle>
            </CardHeader>
            <CardContent>
              {ossz.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nincs aktivált típus egyik telephelyen sem.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {ossz.map((r) => {
                    const shares = siteShares(r.bySite, r.total);
                    const havi = osszHavi.find((h) => h.type === r.type);
                    const months = havi?.months ?? [];
                    const lastMonth = months[months.length - 1];
                    return (
                      <div key={r.type} className="flex flex-col gap-3 rounded-xl border p-3.5">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                            <Package className="h-4 w-4" />
                          </div>
                          <div className="truncate text-sm font-medium">{r.type}</div>
                        </div>

                        <div>
                          <div className="text-2xl leading-none font-bold">
                            {r.total} <span className="text-sm font-normal text-muted-foreground">db</span>
                          </div>
                          <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-muted">
                            {shares.map((s) => (
                              <div key={s.site} className={`h-full ${s.opacityClass}`} style={{ width: `${s.pct}%` }} />
                            ))}
                          </div>
                          <div className="mt-1 flex justify-between text-[10.5px] text-muted-foreground">
                            {shares.map((s) => (
                              <span key={s.site}>
                                {s.site.slice(0, 3)}. {s.qty}
                              </span>
                            ))}
                          </div>
                        </div>

                        {months.length > 0 && (
                          <div className="border-t pt-2.5">
                            <MiniMonthlyChart months={months} />
                            <div className="grid" style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}>
                              {months.map((m, i) => (
                                <div key={i} className="text-center text-[10px] text-muted-foreground">
                                  {m.label}
                                </div>
                              ))}
                            </div>
                            {lastMonth && (
                              <div className="mt-1.5 flex gap-3 text-xs">
                                <span className="font-semibold text-success">Be {lastMonth.be}</span>
                                <span className="font-semibold text-destructive">Ki {lastMonth.ki}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Mozgások — típusonként, havi bontásban</CardTitle>
            </CardHeader>
            <CardContent>
              {osszHavi.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nincs rögzített mozgás.</p>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Típus</TableHead>
                        {osszHavi[0].months.map((m, i) => (
                          <TableHead key={i} className="text-right">
                            {m.label}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {osszHavi.map((row) => (
                        <TableRow key={row.type}>
                          <TableCell className="font-medium">{row.type}</TableCell>
                          {row.months.map((m, i) => (
                            <TableCell key={i} className="text-right tabular-nums">
                              <span className="font-medium text-success">{m.be}</span>
                              {" / "}
                              <span className="font-medium text-destructive">{m.ki}</span>
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Zöld = Be, piros = Ki. Minden szám kizárólag a saját sorának típusára vonatkozik.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
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

          <MovementForm
            site={active}
            types={types}
            otherSites={OTHER_SITES[active]}
            onRecorded={load}
          />

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
