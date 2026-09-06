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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  frissitesMost,
  getSzamlak,
  getSzamlaOsszesito,
  getSzamlaSzinkronAllapot,
  jeloltFizetve,
  visszavonFizetve,
  type SzamlaAllapot,
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

function OsszesitoCsempek({ sorok }: { sorok: SzamlaOsszesitoSor[] }) {
  if (sorok.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {sorok.map((s, i) => (
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

function SzamlaLista({ kategoria, refreshKey, onChanged }: {
  kategoria: SzamlaKategoria;
  refreshKey: number;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<SzamlaRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await getSzamlak(kategoria);
    setRows(data);
  }, [kategoria]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load, refreshKey]);

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
                Nincs ilyen kategóriájú számla.
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
  );
}

export function SzamlakView() {
  const [osszesito, setOsszesito] = useState<SzamlaOsszesitoSor[]>([]);
  const [allapot, setAllapot] = useState<SzamlaAllapot | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [frissitve, setFrissitve] = useState(false);

  const loadOsszesito = useCallback(async () => {
    const [o, a] = await Promise.all([getSzamlaOsszesito(), getSzamlaSzinkronAllapot()]);
    setOsszesito(o);
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
          </span>
          <Button variant="outline" size="sm" disabled={frissitve} onClick={handleFrissites}>
            {frissitve ? "Frissítés…" : "Frissítés most"}
          </Button>
        </CardContent>
      </Card>

      <OsszesitoCsempek sorok={osszesito} />

      <Tabs defaultValue="fuvar">
        <TabsList>
          <TabsTrigger value="fuvar">Fuvar</TabsTrigger>
          <TabsTrigger value="raklap">Raklap</TabsTrigger>
        </TabsList>
        <TabsContent value="fuvar" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Fuvar számlák</CardTitle>
            </CardHeader>
            <CardContent>
              <SzamlaLista kategoria="fuvar" refreshKey={refreshKey} onChanged={loadOsszesito} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="raklap" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Raklap számlák</CardTitle>
            </CardHeader>
            <CardContent>
              <SzamlaLista kategoria="raklap" refreshKey={refreshKey} onChanged={loadOsszesito} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
