"use client";

import { useCallback, useEffect, useState } from "react";
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
import { toast } from "sonner";
import {
  frissitesMost,
  getSzamlaEgyebCegenkent,
  getSzamlaLejaratLista,
  getSzamlaOsszesito,
  getSzamlaSzinkronAllapot,
  jeloltFizetve,
  type SzamlaAllapot,
  type SzamlaEgyebCegSor,
  type SzamlaLejaratLista,
} from "@/lib/szamlak/actions";
import {
  ALKATEGORIA_LABEL,
  KATEGORIA_LABEL,
  type SzamlaKategoria,
  type SzamlaOsszesitoSor,
  type SzamlaRow,
} from "@/lib/szamlak/szamla-constants";

function formatOsszeg(n: number, penznem: string) {
  return `${n.toLocaleString("hu-HU")} ${penznem}`;
}

function OsszesitoCsempek({ sorok }: { sorok: SzamlaOsszesitoSor[] }) {
  // A "Raklap — Egyéb" alkategóriát külön, cégenkénti bontásban mutatjuk
  // (lásd EgyebCegCsempe) — itt kihagyjuk, hogy ne szerepeljen duplán.
  const megjelenitett = sorok.filter((s) => s.alkategoria !== "egyeb");
  if (megjelenitett.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {megjelenitett.map((s, i) => (
        <Card key={i} size="sm">
          <CardContent className="flex flex-col gap-1 py-1">
            <div className="text-xs text-muted-foreground">
              {KATEGORIA_LABEL[s.kategoria]}
              {s.alkategoria ? ` — ${ALKATEGORIA_LABEL[s.alkategoria]}` : ""}
            </div>
            <div className="text-lg font-semibold tabular-nums">
              {formatOsszeg(s.nyitott_osszeg, s.penznem)}
            </div>
            <div className="text-xs text-muted-foreground">
              {s.nyitott_darab} nyitott számla
              {s.lejart_darab > 0 && (
                <span className="ml-1.5 font-medium text-destructive">
                  · {s.lejart_darab} lejárt ({formatOsszeg(s.lejart_osszeg, s.penznem)})
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** A "Raklap — Egyéb" alkategória cégenkénti bontása — egy csempén belül, soronként egy vevő. */
function EgyebCegCsempe({ sorok }: { sorok: SzamlaEgyebCegSor[] }) {
  if (sorok.length === 0) return null;
  return (
    <Card size="sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Raklap — Egyéb (cégenként)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5 pt-0">
        {sorok.map((s, i) => (
          <div key={i} className="flex items-baseline justify-between gap-3 border-b border-border/50 py-1 text-sm last:border-0">
            <span className="truncate">{s.vevo_nev}</span>
            <span className="shrink-0 text-right tabular-nums">
              <span className="font-medium">{formatOsszeg(s.nyitott_osszeg, s.penznem)}</span>
              <span className="ml-1.5 text-xs text-muted-foreground">{s.nyitott_darab} db</span>
              {s.lejart_darab > 0 && (
                <span className="ml-1.5 text-xs font-medium text-destructive">
                  · {s.lejart_darab} lejárt ({formatOsszeg(s.lejart_osszeg, s.penznem)})
                </span>
              )}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Kompakt, csempébe illő mini-táblázat egy lejárat-szakaszhoz (Következő / Lejárt). */
function LejaratMiniTabla({
  cim,
  sorok,
  lejartStilus,
  ures,
  onFizetve,
}: {
  cim: string;
  sorok: SzamlaRow[];
  lejartStilus: boolean;
  ures: string;
  onFizetve: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className={`text-sm font-semibold ${lejartStilus ? "text-destructive" : ""}`}>{cim}</div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sorszám</TableHead>
              <TableHead>Vevő</TableHead>
              <TableHead>Fizetési határidő</TableHead>
              <TableHead className="text-right">Összeg</TableHead>
              <TableHead className="w-24">Fizetve</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorok.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {ures}
                </TableCell>
              </TableRow>
            )}
            {sorok.map((row) => (
              <TableRow key={row.id} className={lejartStilus ? "bg-destructive/10 hover:bg-destructive/15" : ""}>
                <TableCell className="text-muted-foreground">{row.szamlaszam}</TableCell>
                <TableCell>{row.vevo_nev}</TableCell>
                <TableCell className={lejartStilus ? "font-medium text-destructive" : ""}>
                  {row.fizetesi_hatarido ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatOsszeg(row.brutto, row.penznem)}</TableCell>
                <TableCell>
                  <Button variant="secondary" size="sm" className="h-7 px-2 text-xs" onClick={() => onFizetve(row.id)}>
                    Fizetve?
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/** Két csempe (Fuvar / Raklap) a legközelebbi és a lejárt esedékességű, nyitott számlákról — gyors áttekintéshez. */
function LejaratCsempek({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const [fuvar, setFuvar] = useState<SzamlaLejaratLista | null>(null);
  const [raklap, setRaklap] = useState<SzamlaLejaratLista | null>(null);

  const load = useCallback(async () => {
    const [f, r] = await Promise.all([getSzamlaLejaratLista("fuvar"), getSzamlaLejaratLista("raklap")]);
    setFuvar(f);
    setRaklap(r);
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function handleFizetve(id: string) {
    await jeloltFizetve(id);
    await load();
    onChanged();
    toast.success("Számla fizetve-nek jelölve.");
  }

  const csempek: { kategoria: SzamlaKategoria; adat: SzamlaLejaratLista | null }[] = [
    { kategoria: "fuvar", adat: fuvar },
    { kategoria: "raklap", adat: raklap },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {csempek.map(({ kategoria, adat }) => (
        <Card key={kategoria}>
          <CardHeader>
            <CardTitle className="text-sm">{KATEGORIA_LABEL[kategoria]} — esedékesség szerint</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <LejaratMiniTabla
              cim="Következő 10 lejárat"
              sorok={adat?.kovetkezo ?? []}
              lejartStilus={false}
              ures="Nincs közelgő esedékesség."
              onFizetve={handleFizetve}
            />
            <LejaratMiniTabla
              cim={`Lejárt (${adat?.lejartOsszesen ?? 0})`}
              sorok={adat?.lejart ?? []}
              lejartStilus
              ures="Nincs lejárt számla."
              onFizetve={handleFizetve}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function SzamlakView() {
  const [osszesito, setOsszesito] = useState<SzamlaOsszesitoSor[]>([]);
  const [egyebCegek, setEgyebCegek] = useState<SzamlaEgyebCegSor[]>([]);
  const [allapot, setAllapot] = useState<SzamlaAllapot | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [frissitve, setFrissitve] = useState(false);

  const loadOsszesito = useCallback(async () => {
    const [o, ceg, a] = await Promise.all([
      getSzamlaOsszesito(),
      getSzamlaEgyebCegenkent(),
      getSzamlaSzinkronAllapot(),
    ]);
    setOsszesito(o);
    setEgyebCegek(ceg);
    setAllapot(a);
  }, []);

  useEffect(() => {
    loadOsszesito();
  }, [loadOsszesito, refreshKey]);

  async function handleFrissites() {
    setFrissitve(true);
    try {
      const eredmeny = await frissitesMost();
      setRefreshKey((k) => k + 1);
      if (eredmeny.hibak.length > 0) {
        toast.error(eredmeny.hibak[0]);
      } else {
        toast.success(
          `Frissítve — ${eredmeny.ujMegtalalt} új számla, ${eredmeny.pendingMegoldva} korábban hiányzó megoldva.`
        );
      }
    } catch {
      toast.error("Nem sikerült frissíteni.");
    } finally {
      setFrissitve(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="bg-muted/40">
        <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm text-muted-foreground">
          <span>
            A számlákat a cég a Számlázz.hu-ban állítja ki — ez a nézet onnan automatikusan behúzott
            kintlévőség-követő, nem számlázó felület.
            {allapot?.utolso_futas_at && (
              <> Legutóbbi szinkron: {new Date(allapot.utolso_futas_at).toLocaleString("hu-HU")}.</>
            )}
            {!!allapot?.pending_darab && (
              <> {allapot.pending_darab} sorszám még függőben (később kiadott/kihagyott).</>
            )}
            {!!allapot?.sztorno_darab && (
              <>
                {" "}
                {allapot.sztorno_darab} db rontott/sztornózott számla (és a törlő párja) automatikusan
                kiszűrve a listákból.
              </>
            )}
          </span>
          <Button variant="outline" size="sm" disabled={frissitve} onClick={handleFrissites}>
            {frissitve ? "Frissítés…" : "Frissítés most"}
          </Button>
        </CardContent>
      </Card>

      <OsszesitoCsempek sorok={osszesito} />

      <EgyebCegCsempe sorok={egyebCegek} />

      <LejaratCsempek refreshKey={refreshKey} onChanged={loadOsszesito} />
    </div>
  );
}
