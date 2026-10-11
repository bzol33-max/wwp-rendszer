"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCanEdit } from "@/components/auth/edit-permission-context";
import { allitTimocomAllapotot, rogzitTimocomAjanlatot, type TimocomSor } from "@/lib/fuvarozas2/timocom";
import { dekodolHash, konyvjelzoKod, type TimocomHely } from "@/lib/fuvarozas2/timocom-ajanlat";

/** Ár kiírása; pénznem nélkül „pénznem?” (nem feltételezünk EUR-t). */
function arCimke(ar: { osszeg: number; penznem: string | null }) {
  return `${ar.osszeg.toLocaleString("hu-HU")} ${ar.penznem ?? "(pénznem?)"}`;
}

// Timocom → WWP: a könyvjelző-gomb telepítése, a #d=… adat és a kézi
// beillesztés befogadása, az ajánlat kártyája és a korábbiak listája.

function napHo(d: string | null): string {
  return d ? `${d.slice(5, 7)}.${d.slice(8, 10)}.` : "?";
}

function helySav(h: TimocomHely): string {
  const nap = h.datumTol === h.datumIg || !h.datumIg ? napHo(h.datumTol) : `${napHo(h.datumTol)}–${napHo(h.datumIg)}`;
  const ido = h.idoTol ? ` ${h.idoTol}${h.idoIg && h.idoIg !== h.idoTol ? `–${h.idoIg}` : ""}` : "";
  return `${nap}${ido}`;
}

/** A gomb telepítése + a # adat / beillesztés befogadása. */
export function TimocomBefogado({ vanAktiv }: { vanAktiv: boolean }) {
  const canEdit = useCanEdit();
  const router = useRouter();
  const gomb = useRef<HTMLAnchorElement>(null);
  const [szoveg, setSzoveg] = useState("");
  const [fut, startTransition] = useTransition();
  const [nyitva, setNyitva] = useState(!vanAktiv);
  const feldolgozva = useRef(false);

  // A React a javascript: hivatkozást nem engedi propként — a DOM-ba írjuk.
  useEffect(() => {
    gomb.current?.setAttribute("href", konyvjelzoKod(window.location.origin));
  }, []);

  function rogzit(be: Parameters<typeof rogzitTimocomAjanlatot>[0]) {
    startTransition(async () => {
      try {
        const r = await rogzitTimocomAjanlatot(be);
        if (!r.ok) { toast.error(r.hiba); return; }
        toast.success(r.uj ? "Ajánlat rögzítve." : "Az ajánlat már megvolt — frissítve.");
        setSzoveg("");
        router.replace(`/fuvarozas2/timocom?id=${r.id}`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Nem sikerült rögzíteni.");
      }
    });
  }

  // A gomb #d=… adattal nyit: egyszer feldolgozzuk, és a # részt eltüntetjük.
  useEffect(() => {
    if (feldolgozva.current) return;
    const be = dekodolHash(window.location.hash);
    if (!window.location.hash.includes("d=")) return;
    feldolgozva.current = true;
    history.replaceState(null, "", window.location.pathname + window.location.search);
    if (!be) { toast.error("A Timocom-gomb adata hibás — kattints újra a gombra."); return; }
    if (!canEdit) { toast.error("Nincs szerkesztési jogod a Fuvarozáshoz."); return; }
    rogzit(be);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base">Ajánlat behozása</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setNyitva((x) => !x)}>{nyitva ? "Elrejt" : "Gomb / beillesztés"}</Button>
      </CardHeader>
      {fut ? <CardContent className="pt-0 text-sm text-muted-foreground">Feldolgozás…</CardContent> : null}
      {nyitva ? (
        <CardContent className="grid gap-4 text-sm md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <p className="font-medium">1 · Böngésző-gomb (egyszer kell beállítani)</p>
            <p className="text-muted-foreground">
              Húzd ezt a gombot a Chrome könyvjelzősávjába (ha nem látszik: Cmd+Shift+B). Utána a Timocom fuvarkeresőjében nyiss meg egy ajánlatot,
              és kattints a sávban a „→ WWP” gombra — új fülön itt nyílik meg, kiolvasva.
            </p>
            <div>
              <a
                ref={gomb}
                onClick={(e) => { e.preventDefault(); toast.info("Ne kattints rá itt — húzd a könyvjelzősávba, és a Timocomban használd."); }}
                className="inline-flex cursor-grab items-center rounded-md border border-primary bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm"
              >
                → WWP
              </a>
            </div>
            <p className="text-xs text-muted-foreground">
              A gomb csak a nyitott ajánlatot olvassa, csak amikor rákattintasz; a Timocomban nem kattint és nem ír semmit (a kapcsolattartó részt kinyitja, ha csukva van).
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-medium">2 · Vagy beillesztés</p>
            <textarea
              value={szoveg}
              onChange={(e) => setSzoveg(e.target.value)}
              placeholder={"A Timocom ajánlat részletpanelje kijelölve és bemásolva (Létrehozva … Külső megjegyzések)"}
              rows={6}
              disabled={!canEdit || fut}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
            <div>
              <Button size="sm" disabled={!canEdit || fut || szoveg.trim().length < 20} onClick={() => rogzit({ szoveg })}>Beolvasás</Button>
            </div>
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}

const ALLAPOT: Record<string, string> = { nyitott: "nyitott", ajanlva: "ajánlat kiment", elvetve: "elvetve", hozzarendelve: "hozzárendelve", lejart: "lejárt" };

export function TimocomAjanlatKartya({ sor }: { sor: TimocomSor }) {
  const a = sor.ajanlat;
  const canEdit = useCanEdit();
  const router = useRouter();
  const [fut, startTransition] = useTransition();
  const allit = (x: "nyitott" | "ajanlva" | "elvetve") =>
    startTransition(async () => {
      await allitTimocomAllapotot(sor.id, x);
      router.refresh();
    });
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">
              {a.helyek.length ? `${a.helyek[0].varos} → ${a.helyek[a.helyek.length - 1].varos}` : "Ajánlat"}
              {a.tavKm ? <span className="ml-2 text-sm font-normal text-muted-foreground">{a.tavKm} km (Timocom)</span> : null}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {a.megbizo ?? "?"}{a.megbizoCim ? ` · ${a.megbizoCim}` : ""}{a.tcId ? ` · TC ID ${a.tcId}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{ALLAPOT[sor.allapot] ?? sor.allapot}</Badge>
            {a.url ? <a href={a.url} target="_blank" rel="noreferrer" className="text-sm underline">Timocomban ↗</a> : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {a.figyelmeztetesek.length ? (
          <ul className="flex flex-col gap-1">
            {a.figyelmeztetesek.map((f) => (
              <li key={f} className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">{f}</li>
            ))}
          </ul>
        ) : null}
        <table className="w-full text-sm">
          <tbody>
            {a.helyek.map((h, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="w-20 py-1 font-medium">{h.tipus === "fel" ? "Felrakó" : h.tipus === "le" ? "Lerakó" : "Megálló"}</td>
                <td className="py-1">{h.orszag !== "HU" ? `${h.orszag}, ` : ""}{[h.irsz, h.varos].filter(Boolean).join(" ")}</td>
                <td className="py-1 text-right tabular-nums text-muted-foreground">{helySav(h)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          <div><span className="text-muted-foreground">Áru:</span> {a.aru ?? "—"}{a.kiegeszito ? ` · ${a.kiegeszito}` : ""}</div>
          <div><span className="text-muted-foreground">Méret:</span> {a.hosszM != null ? `${a.hosszM} m` : "—"} · {a.sulyT != null ? `${a.sulyT} t` : "—"}</div>
          <div><span className="text-muted-foreground">Jármű:</span> {[a.jarmuTipus, a.felepitmeny].filter(Boolean).join(" · ") || "—"}</div>
          <div><span className="text-muted-foreground">Tulajdonság:</span> {a.tulajdonsagok ?? "—"}</div>
          <div><span className="text-muted-foreground">Ár:</span> {a.ar ? arCimke(a.ar) : "nincs megadva"}{a.fizetesiHataridoNap ? ` · fizetés ${a.fizetesiHataridoNap} nap` : ""}</div>
          <div>
            <span className="text-muted-foreground">Kapcsolat:</span> {a.kapcsolatNev ?? "—"}
            {a.telefonok.map((t) => <a key={t} href={`tel:${t}`} className="ml-2 underline">{t}</a>)}
          </div>
          {a.megjegyzes ? <div className="sm:col-span-2"><span className="text-muted-foreground">Megjegyzés:</span> {a.megjegyzes}</div> : null}
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            {sor.allapot !== "ajanlva" ? <Button size="sm" variant="outline" disabled={fut} onClick={() => allit("ajanlva")}>Ajánlatot adtam</Button> : null}
            {sor.allapot !== "elvetve" ? <Button size="sm" variant="outline" disabled={fut} onClick={() => allit("elvetve")}>Elvetem</Button> : null}
            {sor.allapot !== "nyitott" ? <Button size="sm" variant="ghost" disabled={fut} onClick={() => allit("nyitott")}>Vissza nyitottra</Button> : null}
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">Lent a Kalkulátor a megállókkal kitöltve: válaszd ki a kocsit, és kapcsold be a telephelyről indulást, ha onnan menne.</p>
      </CardContent>
    </Card>
  );
}

export function TimocomLista({ sorok, aktivId }: { sorok: TimocomSor[]; aktivId: string | null }) {
  if (!sorok.length) return null;
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Behozott Timocom-ajánlatok</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr><th className="py-1">Útvonal</th><th>Felrakás</th><th>Megbízó</th><th>Ár</th><th>Állapot</th></tr>
          </thead>
          <tbody>
            {sorok.map((s) => {
              const a = s.ajanlat;
              const fel = a.helyek[0];
              return (
                <tr key={s.id} className={`border-t ${s.id === aktivId ? "bg-muted/60" : ""}`}>
                  <td className="py-1">
                    <Link href={`/fuvarozas2/timocom?id=${s.id}`} className="underline">
                      {a.helyek.length ? `${a.helyek[0].varos} → ${a.helyek[a.helyek.length - 1].varos}` : "?"}
                    </Link>
                    {a.figyelmeztetesek.some((f) => /ADR|Hulladék|Felépítmény|Hossz|Súly/.test(f)) ? <span className="ml-1 text-amber-600" title={a.figyelmeztetesek.join("\n")}>⚠</span> : null}
                  </td>
                  <td className="tabular-nums">{fel ? helySav(fel) : "?"}</td>
                  <td>{a.megbizo ?? "?"}</td>
                  <td>{a.ar ? arCimke(a.ar) : "—"}</td>
                  <td>{ALLAPOT[s.allapot] ?? s.allapot}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
