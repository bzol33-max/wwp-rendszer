"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  getArchivumEv,
  getArchivumEvKimutatas,
  getArchivumHonapok,
  getArchivumSnapshot,
  type ArchivumEvKimutatas,
  type ArchivumEvRow,
  type ArchivumHonap,
  type ArchivumSnapshot,
} from "@/lib/keszlet/actions";
import { ArchivumEv } from "@/components/keszlet/archivum-ev";

const SITE_ORDER = ["Nyíregyháza", "Balkány", "Szakoly"];

function ft(n: number | null) {
  return n === null ? "—" : `${n.toLocaleString("hu-HU")} Ft`;
}

function honapNev(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("hu-HU", { month: "short" }).replace(/\.$/, "");
}

function honapHosszu(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m - 1, 1)
    .toLocaleDateString("hu-HU", { year: "numeric", month: "long" })
    .replace(/\.$/, "");
}

/**
 * Nyíregyháza archív — a felvásárlás havi összesítője.
 *
 * Nyitó nézet: az adott év minden hónapja egy táblázatban (típusonként
 * darabszám, alul havi összesen és összeg). Onnan egy hónapra kattintva
 * annak részletei: felvásárlás típusonként, plusz a készlet (nyitó/be/ki/
 * záró) és a kassza.
 *
 * Nincs mögötte havi zárás: minden szám a nyers tételekből számolódik. A
 * rendszer indulása előtti hónapok a régi rendszerből átvett, havi szintű
 * adatok (felvasarlas_archivum) — ezek csak itt jelennek meg, a mai
 * készletet és kasszát nem érintik.
 */
export function ArchivumView() {
  const [honapok, setHonapok] = useState<ArchivumHonap[]>([]);
  const [ev, setEv] = useState<string>("");
  const [nezet, setNezet] = useState<string>("ev");
  const [evRows, setEvRows] = useState<ArchivumEvRow[] | null>(null);
  const [kimutatas, setKimutatas] = useState<ArchivumEvKimutatas | null>(null);
  const [snap, setSnap] = useState<ArchivumSnapshot | null>(null);

  useEffect(() => {
    let mounted = true;
    getArchivumHonapok()
      .then((rows) => {
        if (!mounted) return;
        setHonapok(rows);
        setEv((prev) => prev || rows[0]?.monthKey.slice(0, 4) || "");
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!ev) return;
    let mounted = true;
    getArchivumEv(Number(ev))
      .then((rows) => {
        if (mounted) setEvRows(rows);
      })
      .catch(() => {});
    getArchivumEvKimutatas(Number(ev))
      .then((k) => {
        if (mounted) setKimutatas(k);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [ev]);

  useEffect(() => {
    if (nezet === "ev") return;
    let mounted = true;
    getArchivumSnapshot(nezet)
      .then((rows) => {
        if (mounted) setSnap(rows);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [nezet]);

  const evek = useMemo(
    () => Array.from(new Set(honapok.map((h) => h.monthKey.slice(0, 4)))),
    [honapok]
  );
  const evHonapjai = useMemo(
    () =>
      honapok
        .filter((h) => h.monthKey.startsWith(ev))
        .map((h) => h.monthKey)
        .sort(),
    [honapok, ev]
  );

  // A havi nézethez: a hónap felvásárlásának forintösszege, és hogy van-e
  // egyáltalán élő kassza-adat (a régi, archív hónapokban nincs).
  const felvasarlasOsszeg = snap?.felvasarlas.reduce((sum, r) => sum + (r.total ?? 0), 0) ?? 0;
  const vanEloKassza =
    !!snap &&
    (snap.kassza.bevetel !== 0 || snap.kassza.kiadas !== 0 || snap.kassza.zaroEgyenleg !== 0);


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={ev}
          onValueChange={(v) => {
            if (!v) return;
            setEv(v);
            // Évváltásnál vissza az éves nézetre — a havi fülek is cserélődnek.
            setNezet("ev");
          }}
        >
          <SelectTrigger className="w-28">
            <SelectValue placeholder="Év" />
          </SelectTrigger>
          <SelectContent>
            {evek.map((e) => (
              <SelectItem key={e} value={e}>
                {e}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Tabs value={nezet} onValueChange={(v) => v && setNezet(v)}>
          <TabsList>
            <TabsTrigger value="ev">Év összesen</TabsTrigger>
            {evHonapjai.map((mk) => (
              <TabsTrigger key={mk} value={mk}>
                {honapNev(mk)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {nezet === "ev" ? (
        !evRows ? (
          <p className="text-sm text-muted-foreground">Betöltés…</p>
        ) : (
          <ArchivumEv ev={ev} honapok={evHonapjai} rows={evRows} kimutatas={kimutatas} />
        )
      ) : !snap || snap.monthKey !== nezet ? (
        <p className="text-sm text-muted-foreground">Betöltés…</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                Felvásárlás — {honapHosszu(snap.monthKey)}
                {snap.felvasarlas.some((r) => r.archiv) && (
                  <Badge className="bg-muted text-muted-foreground hover:bg-muted">
                    régi rendszerből
                  </Badge>
                )}
              </CardTitle>
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
                        {snap.felvasarlas.reduce((s, r) => s + r.qty, 0)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {ft(snap.felvasarlas.reduce((s, r) => s + (r.total ?? 0), 0))}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

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

          {snap.befizetes.db > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Befizetés és egyenleg — régi rendszer</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border px-3 py-2.5">
                    <div className="text-xs text-muted-foreground">
                      Befizetés ({snap.befizetes.db} alkalom)
                    </div>
                    <div className="text-lg font-bold tabular-nums text-success">
                      {ft(snap.befizetes.osszeg)}
                    </div>
                  </div>
                  <div className="rounded-lg border px-3 py-2.5">
                    <div className="text-xs text-muted-foreground">Felvásárlás</div>
                    <div className="text-lg font-bold tabular-nums text-destructive">
                      {ft(felvasarlasOsszeg)}
                    </div>
                  </div>
                  <div className="rounded-lg border px-3 py-2.5">
                    <div className="text-xs text-muted-foreground">Egyenleg</div>
                    <div className="text-lg font-bold tabular-nums">
                      {ft(snap.befizetes.osszeg - felvasarlasOsszeg)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {vanEloKassza && (
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
          )}

          <p className="text-xs text-muted-foreground">
            A készlet Be és Ki oszlopa a telephelyek közti mozgatást is tartalmazza. A mozgatás a
            cél telepen az átvétel napjával számít, az úton lévő tétel egyik telephely számaiban
            sem szerepel.
          </p>
        </>
      )}
    </div>
  );
}
