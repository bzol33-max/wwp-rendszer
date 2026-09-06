"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  getSzamlaLista,
  getSzamlaOsszesito,
  getSzamlaSzinkronAllapot,
  jeloltFizetve,
  visszavonFizetve,
  type SzamlaAllapot,
  type SzamlaEgyebCegSor,
  type SzamlaLejaratLista,
  type SzamlaListaSzuro,
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

/** Az 5 perces visszavonási ablakon belül van-e még a "Fizetve" jelölés. */
function visszavonhato(fizetveDatum: string | null): boolean {
  if (!fizetveDatum) return false;
  return Date.now() - new Date(fizetveDatum).getTime() < 5 * 60 * 1000;
}

/** Egy csempére kattintva megnyíló, teljes (szűrt) számlalista. */
function SzamlaListaDialog({
  cim,
  szuro,
  onOpenChange,
  onChanged,
}: {
  cim: string | null;
  szuro: SzamlaListaSzuro | null;
  onOpenChange: (nyitva: boolean) => void;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<SzamlaRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!szuro) return;
    setLoading(true);
    try {
      const data = await getSzamlaLista(szuro);
      setRows(data);
    } finally {
      setLoading(false);
    }
  }, [szuro]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [szuro]);

  async function handleFizetve(id: string) {
    await jeloltFizetve(id);
    await load();
    onChanged();
    toast.success("Számla fizetve-nek jelölve.");
  }

  async function handleVisszavon(id: string) {
    await visszavonFizetve(id);
    await load();
    onChanged();
  }

  const ma = new Date().toISOString().slice(0, 10);

  return (
    <Dialog open={szuro !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{cim}</DialogTitle>
        </DialogHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sorszám</TableHead>
                <TableHead>Vevő</TableHead>
                <TableHead>Hiv. szám</TableHead>
                <TableHead>Kiállítás</TableHead>
                <TableHead>Fizetési határidő</TableHead>
                <TableHead className="text-right">Összeg</TableHead>
                <TableHead>Állapot</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    Nincs ilyen számla.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => {
                const lejart = !row.fizetve && !!row.fizetesi_hatarido && row.fizetesi_hatarido < ma;
                return (
                  <TableRow key={row.id}>
                    <TableCell className="text-muted-foreground">{row.szamlaszam}</TableCell>
                    <TableCell>{row.vevo_nev}</TableCell>
                    <TableCell>{row.rendelesszam ?? "—"}</TableCell>
                    <TableCell>{row.kiallitas_datum}</TableCell>
                    <TableCell className={lejart ? "font-medium text-destructive" : ""}>
                      {row.fizetesi_hatarido ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatOsszeg(row.brutto, row.penznem)}
                    </TableCell>
                    <TableCell>
                      {row.fizetve ? (
                        <Badge className="bg-success/15 text-success hover:bg-success/15 text-xs">Fizetve</Badge>
                      ) : lejart ? (
                        <Badge className="bg-destructive/15 text-destructive hover:bg-destructive/15 text-xs">
                          Lejárt
                        </Badge>
                      ) : (
                        <Badge className="bg-muted text-muted-foreground hover:bg-muted text-xs">Nyitott</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.fizetve ? (
                        visszavonhato(row.fizetve_datum) && (
                          <button
                            type="button"
                            className="text-xs text-muted-foreground hover:underline"
                            onClick={() => handleVisszavon(row.id)}
                          >
                            Visszavon
                          </button>
                        )
                      ) : (
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={() => handleFizetve(row.id)}
                        >
                          Fizetve
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OsszesitoCsempek({
  sorok,
  onValaszt,
}: {
  sorok: SzamlaOsszesitoSor[];
  onValaszt: (s: SzamlaOsszesitoSor) => void;
}) {
  // A "Raklap — Egyéb" alkategóriát külön, cégenkénti bontásban mutatjuk
  // (lásd EgyebCegCsempe) — itt kihagyjuk, hogy ne szerepeljen duplán.
  const megjelenitett = sorok.filter((s) => s.alkategoria !== "egyeb");
  if (megjelenitett.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {megjelenitett.map((s, i) => (
        <Card
          key={i}
          size="sm"
          className="cursor-pointer transition-colors hover:bg-muted/50"
          onClick={() => onValaszt(s)}
        >
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

/** A "Raklap — Egyéb" alkategória cégenkénti bontása — egy csempén belül, soronként egy vevő, kattinthatóan. */
function EgyebCegCsempe({
  sorok,
  onValaszt,
}: {
  sorok: SzamlaEgyebCegSor[];
  onValaszt: (s: SzamlaEgyebCegSor) => void;
}) {
  if (sorok.length === 0) return null;
  return (
    <Card size="sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Raklap — Egyéb (cégenként)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5 pt-0">
        {sorok.map((s, i) => (
          <button
            type="button"
            key={i}
            onClick={() => onValaszt(s)}
            className="flex items-baseline justify-between gap-3 border-b border-border/50 py-1 text-left text-sm last:border-0 hover:bg-muted/50"
          >
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
          </button>
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
  const [listaCim, setListaCim] = useState<string | null>(null);
  const [listaSzuro, setListaSzuro] = useState<SzamlaListaSzuro | null>(null);

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

      <OsszesitoCsempek
        sorok={osszesito}
        onValaszt={(s) => {
          setListaCim(
            `${KATEGORIA_LABEL[s.kategoria]}${s.alkategoria ? ` — ${ALKATEGORIA_LABEL[s.alkategoria]}` : ""} (${s.penznem})`
          );
          setListaSzuro({ kategoria: s.kategoria, alkategoria: s.alkategoria, penznem: s.penznem });
        }}
      />

      <EgyebCegCsempe
        sorok={egyebCegek}
        onValaszt={(s) => {
          setListaCim(`Raklap — Egyéb — ${s.vevo_nev} (${s.penznem})`);
          setListaSzuro({ kategoria: "raklap", alkategoria: "egyeb", vevoNev: s.vevo_nev, penznem: s.penznem });
        }}
      />

      <LejaratCsempek refreshKey={refreshKey} onChanged={loadOsszesito} />

      <SzamlaListaDialog
        cim={listaCim}
        szuro={listaSzuro}
        onOpenChange={(nyitva) => {
          if (!nyitva) setListaSzuro(null);
        }}
        onChanged={loadOsszesito}
      />
    </div>
  );
}
