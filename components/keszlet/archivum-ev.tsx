"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ArchivumEvKimutatas, ArchivumEvRow } from "@/lib/keszlet/actions";

function honapRovid(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("hu-HU", { month: "short" }).replace(/\.$/, "");
}

function napRovid(isoNap: string) {
  const [y, m, d] = isoNap.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("hu-HU", { month: "short", day: "numeric" });
}

function ezerFt(n: number) {
  // Diagram-címkéhez: 8 419 400 → "8,4 M"
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toLocaleString("hu-HU", { maximumFractionDigits: 1 })} M`;
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000).toLocaleString("hu-HU")} e`;
  return n.toLocaleString("hu-HU");
}

function ft(n: number) {
  return `${n.toLocaleString("hu-HU")} Ft`;
}

/** Egyszerű oszlopdiagram, pixelmagassággal (reszponzív szélesség, fix magasság). */
function Oszlopdiagram({
  adat,
  cimke,
}: {
  adat: { kulcs: string; also: string; ertek: number; kiemelt?: boolean }[];
  cimke: (n: number) => string;
}) {
  const max = Math.max(1, ...adat.map((a) => a.ertek));
  const MAX_PX = 110;
  return (
    <div className="flex items-end gap-1.5">
      {adat.map((a) => (
        <div key={a.kulcs} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <div className="text-[10px] tabular-nums text-muted-foreground">{cimke(a.ertek)}</div>
          <div
            className={cn("w-full rounded-t", a.kiemelt ? "bg-success" : "bg-foreground/25")}
            style={{ height: `${a.ertek > 0 ? Math.max(2, Math.round((a.ertek / max) * MAX_PX)) : 0}px` }}
          />
          <div className="text-[10px] text-muted-foreground">{a.also}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * Nyíregyháza archív — "Év összesen" nézet.
 *
 * Felül típusonként egy csempe (éves darabszám, forint, részarány), alatta a
 * kimutatások: havi felvásárlás, befizetés vs. felvásárlás (készpénz), napi
 * aktivitás és az átlagárak eltérései. Legalul a részletes típus × hónap
 * táblázat.
 */
export function ArchivumEv({
  ev,
  honapok,
  rows,
  kimutatas,
}: {
  ev: string;
  honapok: string[];
  rows: ArchivumEvRow[];
  kimutatas: ArchivumEvKimutatas | null;
}) {
  const adat = useMemo(() => {
    // Típusonkénti éves összeg (a sorrend a szerver szerinti típussorrend).
    const tipusok: { type: string; qty: number; total: number }[] = [];
    const cellak = new Map<string, { qty: number; total: number | null }>();
    for (const r of rows) {
      let t = tipusok.find((x) => x.type === r.type);
      if (!t) {
        t = { type: r.type, qty: 0, total: 0 };
        tipusok.push(t);
      }
      t.qty += r.qty;
      t.total += r.total ?? 0;
      cellak.set(`${r.type}|${r.monthKey}`, { qty: r.qty, total: r.total });
    }
    const osszDb = tipusok.reduce((s, t) => s + t.qty, 0);
    const osszFt = tipusok.reduce((s, t) => s + t.total, 0);

    const havi = honapok.map((mk) => {
      const sorok = rows.filter((r) => r.monthKey === mk);
      return {
        monthKey: mk,
        qty: sorok.reduce((s, r) => s + r.qty, 0),
        total: sorok.reduce((s, r) => s + (r.total ?? 0), 0),
      };
    });
    const maxHonap = havi.reduce((best, h) => (h.qty > (best?.qty ?? -1) ? h : best), havi[0]);

    // Átlagár: a 4 legnagyobb volumenű típusnál, havonta. A típus "szokásos"
    // ára a leggyakoribb havi átlagár; ettől eltérő hónap kiemelve.
    const fotipusok = [...tipusok].sort((a, b) => b.qty - a.qty).slice(0, 4);
    const atlagarak = fotipusok.map((t) => {
      const honaponkent = honapok.map((mk) => {
        const c = cellak.get(`${t.type}|${mk}`);
        return c && c.qty > 0 && c.total !== null ? Math.round(c.total / c.qty) : null;
      });
      const gyakorisag = new Map<number, number>();
      for (const a of honaponkent) if (a !== null) gyakorisag.set(a, (gyakorisag.get(a) ?? 0) + 1);
      const szokasos = [...gyakorisag.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      return { type: t.type, honaponkent, szokasos };
    });

    return { tipusok, cellak, osszDb, osszFt, havi, maxHonap, atlagarak };
  }, [rows, honapok]);

  // Készpénz: befizetés − felvásárlás havonta, halmozott egyenleggel.
  const penz = useMemo(() => {
    const sorok: {
      monthKey: string;
      befizetes: number;
      felvasarlas: number;
      egyenleg: number;
      halmozott: number;
    }[] = [];
    for (const mk of honapok) {
      const befizetes = kimutatas?.befizetes.find((b) => b.monthKey === mk)?.osszeg ?? 0;
      const felvasarlas = adat.havi.find((h) => h.monthKey === mk)?.total ?? 0;
      const egyenleg = befizetes - felvasarlas;
      const elozo = sorok[sorok.length - 1]?.halmozott ?? 0;
      sorok.push({ monthKey: mk, befizetes, felvasarlas, egyenleg, halmozott: elozo + egyenleg });
    }
    return sorok;
  }, [honapok, kimutatas, adat.havi]);

  const evLegjobbNap = kimutatas?.napok.reduce(
    (best, n) => (n.legjobbDb > (best?.legjobbDb ?? -1) ? n : best),
    kimutatas.napok[0]
  );

  if (adat.tipusok.length === 0) {
    return <p className="text-sm text-muted-foreground">Ebben az évben nincs rögzített felvásárlás.</p>;
  }

  return (
    <div className="space-y-5">
      {/* 1. Típus-csempék — ugyanaz a forma, mint a Havi/Mai számlálóknál. */}
      <div>
        <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            {ev} — felvásárlás típusonként
          </div>
          <div className="text-xs text-muted-foreground">
            összesen <span className="font-semibold text-foreground tabular-nums">{adat.osszDb.toLocaleString("hu-HU")} db</span>
            {" · "}
            <span className="font-semibold text-foreground tabular-nums">{ft(adat.osszFt)}</span>
          </div>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-1.5">
          {adat.tipusok.map((t) => (
            <div
              key={t.type}
              className="min-w-0 rounded-lg border border-emerald-300/60 bg-emerald-50 px-1.5 py-2 text-center dark:bg-emerald-950/30"
            >
              <div className="text-[11px] font-medium leading-tight text-emerald-700 dark:text-emerald-400">
                {t.type}
              </div>
              <div className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {t.qty.toLocaleString("hu-HU")}
              </div>
              <div className="text-[10px] tabular-nums text-muted-foreground">
                {ezerFt(t.total)} Ft · {adat.osszDb > 0 ? Math.round((t.qty / adat.osszDb) * 100) : 0}%
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* 2. Havi felvásárlás */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Havi felvásárlás (db)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Oszlopdiagram
              adat={adat.havi.map((h) => ({
                kulcs: h.monthKey,
                also: honapRovid(h.monthKey),
                ertek: h.qty,
                kiemelt: h.monthKey === adat.maxHonap?.monthKey,
              }))}
              cimke={(n) => n.toLocaleString("hu-HU")}
            />
            <p className="text-xs text-muted-foreground">
              Legerősebb hónap:{" "}
              <span className="font-medium text-foreground">
                {adat.maxHonap ? honapRovid(adat.maxHonap.monthKey) : "—"}
              </span>{" "}
              ({adat.maxHonap?.qty.toLocaleString("hu-HU")} db, {ft(adat.maxHonap?.total ?? 0)}). Havi átlag:{" "}
              <span className="font-medium text-foreground tabular-nums">
                {Math.round(adat.osszDb / Math.max(1, adat.havi.length)).toLocaleString("hu-HU")} db
              </span>
              .
            </p>
          </CardContent>
        </Card>

        {/* 3. Készpénz: befizetés vs felvásárlás */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Készpénz — befizetés és felvásárlás</CardTitle>
          </CardHeader>
          <CardContent>
            {!kimutatas ? (
              <p className="text-sm text-muted-foreground">Betöltés…</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hónap</TableHead>
                    <TableHead className="text-right">Befizetés</TableHead>
                    <TableHead className="text-right">Felvásárlás</TableHead>
                    <TableHead className="text-right">Egyenleg</TableHead>
                    <TableHead className="text-right">Halmozott</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {penz.map((p) => (
                    <TableRow key={p.monthKey}>
                      <TableCell className="font-medium">{honapRovid(p.monthKey)}</TableCell>
                      <TableCell className="text-right tabular-nums">{ezerFt(p.befizetes)}</TableCell>
                      <TableCell className="text-right tabular-nums">{ezerFt(p.felvasarlas)}</TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-medium tabular-nums",
                          p.egyenleg >= 0 ? "text-success" : "text-destructive"
                        )}
                      >
                        {p.egyenleg >= 0 ? "+" : ""}
                        {ezerFt(p.egyenleg)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {ezerFt(p.halmozott)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Befizetés = a telepre bevitt készpénz. Szeptembertől az élő kassza bevételei, a
              nyitóegyenleg és az eladások nélkül. Negatív egyenleg: a hónapban több ment ki
              felvásárlásra, mint amennyi befizetés jött.
            </p>
          </CardContent>
        </Card>

        {/* 4. Napi aktivitás */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Napi aktivitás</CardTitle>
          </CardHeader>
          <CardContent>
            {!kimutatas ? (
              <p className="text-sm text-muted-foreground">Betöltés…</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hónap</TableHead>
                    <TableHead className="text-right">Nyitott nap</TableHead>
                    <TableHead className="text-right">Napi átlag</TableHead>
                    <TableHead className="text-right">Legerősebb nap</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {kimutatas.napok.map((n) => (
                    <TableRow key={n.monthKey}>
                      <TableCell className="font-medium">{honapRovid(n.monthKey)}</TableCell>
                      <TableCell className="text-right tabular-nums">{n.aktivNapok}</TableCell>
                      <TableCell className="text-right tabular-nums">{n.atlagDb} db</TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          n === evLegjobbNap && "font-semibold text-success"
                        )}
                      >
                        {napRovid(n.legjobbNap)} · {n.legjobbDb} db
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Nyitott nap = hány napon volt felvásárlás. Zölddel az év legerősebb napja.
            </p>
          </CardContent>
        </Card>

        {/* 5. Átlagár és eltérések */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Átlagos felvásárlási ár (Ft/db)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Típus</TableHead>
                  {honapok.map((mk) => (
                    <TableHead key={mk} className="text-right">
                      {honapRovid(mk)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {adat.atlagarak.map((t) => (
                  <TableRow key={t.type}>
                    <TableCell className="font-medium">{t.type}</TableCell>
                    {t.honaponkent.map((a, i) => (
                      <TableCell
                        key={honapok[i]}
                        className={cn(
                          "text-right tabular-nums",
                          a !== null && t.szokasos !== null && a !== t.szokasos
                            ? "font-semibold text-warning"
                            : "text-muted-foreground"
                        )}
                      >
                        {a === null ? "—" : a.toLocaleString("hu-HU")}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-2 text-xs text-muted-foreground">
              A négy legnagyobb volumenű típus. Sárgával, ahol a havi átlagár eltér a típus szokásos
              árától — árváltozás vagy egyedi áras vétel.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 6. Részletes táblázat */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Részletes táblázat — típusonként, havonta (db)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Típus</TableHead>
                {honapok.map((mk) => (
                  <TableHead key={mk} className="text-right">
                    {honapRovid(mk)}
                  </TableHead>
                ))}
                <TableHead className="text-right">Összesen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adat.tipusok.map((t) => (
                <TableRow key={t.type}>
                  <TableCell className="font-medium">{t.type}</TableCell>
                  {honapok.map((mk) => {
                    const c = adat.cellak.get(`${t.type}|${mk}`);
                    return (
                      <TableCell key={mk} className="text-right tabular-nums">
                        {c ? c.qty : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right font-semibold tabular-nums">{t.qty}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-semibold">Összesen (db)</TableCell>
                {adat.havi.map((h) => (
                  <TableCell key={h.monthKey} className="text-right font-semibold tabular-nums">
                    {h.qty}
                  </TableCell>
                ))}
                <TableCell className="text-right font-bold tabular-nums">{adat.osszDb}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-semibold">Összeg</TableCell>
                {adat.havi.map((h) => (
                  <TableCell
                    key={h.monthKey}
                    className="text-right text-xs font-medium tabular-nums text-muted-foreground"
                  >
                    {h.total.toLocaleString("hu-HU")}
                  </TableCell>
                ))}
                <TableCell className="text-right text-xs font-bold tabular-nums">
                  {adat.osszFt.toLocaleString("hu-HU")}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
