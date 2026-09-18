"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getArchivumHonapok,
  getArchivumSnapshot,
  type ArchivumHonap,
  type ArchivumSnapshot,
} from "@/lib/keszlet/actions";

const SITE_ORDER = ["Nyíregyháza", "Balkány", "Szakoly"];

function ft(n: number) {
  return `${n.toLocaleString("hu-HU")} Ft`;
}

/**
 * Archívum fül — egy hónap összesítője típusonként és telephelyenként
 * (nyitó / be / ki / záró), alatta a nyíregyházi felvásárlás és a kassza.
 *
 * Nincs mögötte havi zárás: minden szám a nyers tételekből számolódik, ezért
 * egy utólag javított vagy törölt tétel a korábbi hónapok összesítőjében is
 * azonnal helyesen jelenik meg.
 */
export function ArchivumView() {
  const [honapok, setHonapok] = useState<ArchivumHonap[]>([]);
  const [monthKey, setMonthKey] = useState<string>("");
  const [snap, setSnap] = useState<ArchivumSnapshot | null>(null);
  // Nincs külön "töltés" állapot: amíg a betöltött hónap nem a kiválasztott,
  // addig töltünk. (Így az effektus nem hív szinkron setState-et.)
  const betoltes = !snap || snap.monthKey !== monthKey;

  useEffect(() => {
    let mounted = true;
    getArchivumHonapok()
      .then((rows) => {
        if (!mounted) return;
        setHonapok(rows);
        setMonthKey((prev) => prev || rows[0]?.monthKey || "");
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!monthKey) return;
    let mounted = true;
    getArchivumSnapshot(monthKey)
      .then((rows) => {
        if (mounted) setSnap(rows);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [monthKey]);

  const felvasarlasOsszeg = snap?.felvasarlas.reduce((s, r) => s + r.total, 0) ?? 0;
  const felvasarlasDb = snap?.felvasarlas.reduce((s, r) => s + r.qty, 0) ?? 0;
  const aktualisHonap = honapok[0]?.monthKey === monthKey;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={monthKey} onValueChange={(v) => v && setMonthKey(v)}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Válassz hónapot" />
          </SelectTrigger>
          <SelectContent>
            {honapok.map((h) => (
              <SelectItem key={h.monthKey} value={h.monthKey}>
                {h.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {aktualisHonap && (
          <span className="text-xs text-muted-foreground">
            Ez a hónap még folyamatban van — a záró adatok napról napra változnak.
          </span>
        )}
      </div>

      {betoltes || !snap ? (
        <p className="text-sm text-muted-foreground">Betöltés…</p>
      ) : (
        <>
          {SITE_ORDER.filter((site) => snap.keszlet.some((r) => r.site === site)).map((site) => (
            <Card key={site}>
              <CardHeader>
                <CardTitle className="text-sm">Készlet — {site}</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Típus</TableHead>
                      <TableHead className="text-right">Nyitó</TableHead>
                      <TableHead className="text-right">Be</TableHead>
                      <TableHead className="text-right">Ki</TableHead>
                      <TableHead className="text-right">Záró</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {snap.keszlet
                      .filter((r) => r.site === site)
                      .map((r) => (
                        <TableRow key={r.type}>
                          <TableCell className="font-medium">{r.type}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {r.nyito}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium text-success">
                            {r.be > 0 ? `+${r.be}` : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium text-destructive">
                            {r.ki > 0 ? `−${r.ki}` : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-bold">{r.zaro}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Felvásárlás — Nyíregyháza</CardTitle>
            </CardHeader>
            <CardContent>
              {snap.felvasarlas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ebben a hónapban nem volt felvásárlás.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Típus</TableHead>
                      <TableHead className="text-right">Db</TableHead>
                      <TableHead className="text-right">Összeg</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {snap.felvasarlas.map((r) => (
                      <TableRow key={r.type}>
                        <TableCell className="font-medium">{r.type}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.qty}</TableCell>
                        <TableCell className="text-right tabular-nums">{ft(r.total)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell className="font-semibold">Összesen</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {felvasarlasDb}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {ft(felvasarlasOsszeg)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Kassza</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border px-3 py-2.5">
                  <div className="text-xs text-muted-foreground">Bevétel</div>
                  <div className="text-lg font-bold tabular-nums text-success">
                    {ft(snap.kassza.bevetel)}
                  </div>
                </div>
                <div className="rounded-lg border px-3 py-2.5">
                  <div className="text-xs text-muted-foreground">Kiadás</div>
                  <div className="text-lg font-bold tabular-nums text-destructive">
                    {ft(snap.kassza.kiadas)}
                  </div>
                </div>
                <div className="rounded-lg border px-3 py-2.5">
                  <div className="text-xs text-muted-foreground">Egyenleg a hónap végén</div>
                  <div className="text-lg font-bold tabular-nums">{ft(snap.kassza.zaroEgyenleg)}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            A Be és a Ki a telephelyek közti mozgatást is tartalmazza. A mozgatás a cél
            telepen az átvétel napjával számít, az úton lévő (még át nem vett) tétel
            egyik telephely számaiban sem szerepel.
          </p>
        </>
      )}
    </div>
  );
}
