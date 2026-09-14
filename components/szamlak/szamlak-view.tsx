"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckIcon, InfoIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { KontokivonatDialog } from "@/components/szamlak/kontokivonat-dialog";
import { SzamlaBevetelDiagram } from "@/components/szamlak/szamla-bevetel-diagram";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
  getKifizetettOsszesito,
  getSzamlaEgyebCegenkent,
  getSzamlaHaviBevetel,
  getSzamlaKiemeltStatisztika,
  getSzamlaLejaratLista,
  getSzamlaLista,
  getSzamlaOsszesito,
  getSzamlaSzinkronAllapot,
  jeloltFizetve,
  visszavonFizetve,
  type SzamlaAllapot,
  type SzamlaEgyebCegSor,
  type SzamlaKifizetettOsszesitoSor,
  type SzamlaLejaratLista,
  type SzamlaListaSzuro,
} from "@/lib/szamlak/actions";
import {
  ALKATEGORIA_LABEL,
  KATEGORIA_LABEL,
  type SzamlaHaviBevetelSor,
  type SzamlaKategoria,
  type SzamlaKiemeltStatisztika,
  type SzamlaOsszesitoSor,
  type SzamlaRow,
} from "@/lib/szamlak/szamla-constants";

// Ezres tagolás ponttal (pl. "1.314.234"), tizedesponttal a törtrésznél (EUR-nál előfordulhat).
// A adatbázis-rétegből (pg) a numerikus oszlopok stringként érkeznek — Number()
// nélkül a toLocaleString a stringen simán nem csinál semmit (nincs tagolás).
function formatOsszeg(n: number, penznem: string) {
  return `${Number(n).toLocaleString("de-DE", { maximumFractionDigits: 2 })} ${penznem}`;
}

/** Az 5 perces visszavonási ablakon belül van-e még a "Fizetve" jelölés. */
function visszavonhato(fizetveDatum: string | null): boolean {
  if (!fizetveDatum) return false;
  return Date.now() - new Date(fizetveDatum).getTime() < 5 * 60 * 1000;
}

/** Kis "i" infó gomb — egérrel ráhúzva (vagy érintésre) mutatja a szinkron-állapot szövegét. */
function SzinkronInfoGomb({ szoveg }: { szoveg: string }) {
  const [nyitva, setNyitva] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setNyitva(true)}
      onMouseLeave={() => setNyitva(false)}
    >
      <button
        type="button"
        aria-label="Szinkron infó"
        onClick={() => setNyitva((v) => !v)}
        className="flex h-6 w-6 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted"
      >
        <InfoIcon className="h-3.5 w-3.5" />
      </button>
      {nyitva && (
        <span className="absolute right-0 top-7 z-50 w-72 rounded-lg border bg-popover p-3 text-xs leading-relaxed text-popover-foreground shadow-md">
          {szoveg}
        </span>
      )}
    </span>
  );
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
  // A "Fizetve" jelölés az 5 perces visszavonási ablak végéig ne rendezze át
  // azonnal a listát — csak a sor jelölése változzon (pipa, zöld), a sorrend
  // maradjon, aztán a késleltetett load() hozza majd a valós (átrendezett)
  // állapotot.
  const idozitokRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

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

  useEffect(() => {
    const idozitok = idozitokRef.current;
    return () => {
      idozitok.forEach((t) => clearTimeout(t));
    };
  }, []);

  function torolIdozito(id: string) {
    const korabbi = idozitokRef.current.get(id);
    if (korabbi) {
      clearTimeout(korabbi);
      idozitokRef.current.delete(id);
    }
  }

  async function handleFizetve(id: string) {
    await jeloltFizetve(id);
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, fizetve: true, fizetve_datum: new Date().toISOString() } : r)));
    onChanged();
    toast.success("Számla fizetve-nek jelölve.");

    torolIdozito(id);
    idozitokRef.current.set(
      id,
      setTimeout(() => {
        idozitokRef.current.delete(id);
        load();
      }, 5 * 60 * 1000)
    );
  }

  async function handleVisszavon(id: string) {
    await visszavonFizetve(id);
    torolIdozito(id);
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, fizetve: false, fizetve_datum: null } : r)));
    onChanged();
  }

  const ma = new Date().toISOString().slice(0, 10);
  // A "Hiv. szám" (rendelésszám) gyakorlatilag sosem töltött — ha egy sorban sincs
  // adat, ne foglaljon helyet a fontosabb oszlopoktól (dátum, összeg), amik
  // hosszú cégnevek (pl. "Egyéb" kategória) mellett amúgy is könnyen kiszorulnak
  // a látható területről kis képernyőn.
  const vanRendelesszam = rows.some((row) => row.rendelesszam);

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
                {vanRendelesszam && <TableHead>Hiv. szám</TableHead>}
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
                  <TableCell colSpan={vanRendelesszam ? 8 : 7} className="text-center text-muted-foreground">
                    Nincs ilyen számla.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => {
                const lejart = !row.fizetve && !!row.fizetesi_hatarido && row.fizetesi_hatarido < ma;
                return (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{row.szamlaszam}</TableCell>
                    <TableCell className="max-w-[9rem] truncate" title={row.vevo_nev}>
                      {row.vevo_nev}
                    </TableCell>
                    {vanRendelesszam && <TableCell>{row.rendelesszam ?? "—"}</TableCell>}
                    <TableCell className="whitespace-nowrap">{row.kiallitas_datum}</TableCell>
                    <TableCell
                      className={`whitespace-nowrap ${lejart ? "font-medium text-destructive" : ""}`}
                    >
                      {row.fizetesi_hatarido ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {formatOsszeg(row.brutto, row.penznem)}
                    </TableCell>
                    <TableCell>
                      {row.fizetve ? (
                        <Badge className="gap-1 bg-success/15 text-success hover:bg-success/15 text-xs">
                          <CheckIcon className="h-3 w-3" /> Fizetve
                        </Badge>
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

type Csempe = {
  kulcs: string;
  cim: string;
  nyitottOsszeg: number;
  lejartOsszeg: number;
  penznem: string;
  nyitottDarab: number;
  lejartDarab: number;
  onClick: () => void;
};

/** Egységes stílusú összesítő csempesor — kategória/alkategória tételek ÉS az Egyéb cégenkénti bontása egy közös rácsban. */
function OsszesitoCsempek({ csempek }: { csempek: Csempe[] }) {
  if (csempek.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {csempek.map((c) => (
        <Card
          key={c.kulcs}
          size="sm"
          className="cursor-pointer transition-colors hover:bg-muted/50"
          onClick={c.onClick}
        >
          <CardContent className="flex min-w-0 flex-col gap-1 py-1">
            <div className="truncate text-xs text-muted-foreground">{c.cim}</div>
            <div className="text-base font-semibold tabular-nums sm:text-lg">
              {formatOsszeg(c.nyitottOsszeg, c.penznem)}
            </div>
            <div className="text-xs text-muted-foreground">
              {c.nyitottDarab} nyitott számla
              {c.lejartDarab > 0 && (
                <span className="ml-1.5 font-medium text-destructive">
                  · {c.lejartDarab} lejárt ({formatOsszeg(c.lejartOsszeg, c.penznem)})
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Összegzés pénznemenként egy adott szűrőre (pl. csak "fuvar", vagy minden sor). */
function osszegzesPenznemenkent(osszesito: SzamlaOsszesitoSor[], szuro?: (s: SzamlaOsszesitoSor) => boolean) {
  const map = new Map<string, number>();
  for (const s of osszesito) {
    if (szuro && !szuro(s)) continue;
    map.set(s.penznem, (map.get(s.penznem) ?? 0) + Number(s.nyitott_osszeg));
  }
  return [...map.entries()].filter(([, osszeg]) => osszeg !== 0);
}

/** Keskeny, egy-oszlopos csempesor (HUF/EUR, Fuvar/Raklap/Összes) — a fejléc diagram mellé, a felszabaduló hely a diagramé legyen. */
function OsszesitesKompakt({ osszesito }: { osszesito: SzamlaOsszesitoSor[] }) {
  if (osszesito.length === 0) return null;
  const osszesen = osszegzesPenznemenkent(osszesito);
  const fuvar = osszegzesPenznemenkent(osszesito, (s) => s.kategoria === "fuvar");
  const raklap = osszegzesPenznemenkent(osszesito, (s) => s.kategoria === "raklap");
  const penznemek = osszesen.map(([penznem]) => penznem);

  return (
    <div className="flex flex-col gap-3">
      {penznemek.map((penznem) => {
        const f = fuvar.find(([p]) => p === penznem)?.[1] ?? 0;
        const r = raklap.find(([p]) => p === penznem)?.[1] ?? 0;
        const o = osszesen.find(([p]) => p === penznem)?.[1] ?? 0;
        return (
          <div key={penznem} className="flex flex-col gap-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{penznem}</div>
            <div className="rounded-md border-l-2 border-l-primary bg-card px-2 py-1.5 shadow-sm">
              <div className="text-[9px] text-muted-foreground">Fuvar</div>
              <div className="text-sm font-bold tabular-nums">{formatOsszeg(f, penznem)}</div>
            </div>
            <div className="rounded-md border-l-2 bg-card px-2 py-1.5 shadow-sm" style={{ borderLeftColor: "#f97316" }}>
              <div className="text-[9px] text-muted-foreground">Raklap</div>
              <div className="text-sm font-bold tabular-nums">{formatOsszeg(r, penznem)}</div>
            </div>
            <div className="rounded-md border bg-muted/30 px-2 py-1.5">
              <div className="text-[9px] text-muted-foreground">Összes</div>
              <div className="text-sm font-bold tabular-nums">{formatOsszeg(o, penznem)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Kompakt, csempébe illő mini-táblázat egy lejárat-szakaszhoz (Következő / Lejárt). */
function LejaratMiniTabla({
  cim,
  sorok,
  lejartStilus,
  ures,
  onFizetve,
  onVisszavon,
}: {
  cim?: string;
  sorok: SzamlaRow[];
  lejartStilus: boolean;
  ures: string;
  onFizetve: (id: string) => void;
  onVisszavon: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {cim && <div className={`text-sm font-semibold ${lejartStilus ? "text-destructive" : ""}`}>{cim}</div>}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sorszám</TableHead>
              <TableHead>Vevő</TableHead>
              <TableHead>Fizetési határidő</TableHead>
              <TableHead className="text-right">Összeg</TableHead>
              <TableHead className="w-28">Fizetve</TableHead>
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
            {sorok.map((row) => {
              // A frissen fizetve-nek jelölt sor a helyén marad, zöld/pipa jelöléssel,
              // és 5 percig még visszavonható — nem tűnik el/rendeződik át azonnal.
              const frissFizetve = row.fizetve && visszavonhato(row.fizetve_datum);
              return (
                <TableRow
                  key={row.id}
                  className={
                    row.fizetve
                      ? "bg-success/10 hover:bg-success/15"
                      : lejartStilus
                        ? "bg-destructive/10 hover:bg-destructive/15"
                        : ""
                  }
                >
                  <TableCell className="text-muted-foreground">{row.szamlaszam}</TableCell>
                  <TableCell>{row.vevo_nev}</TableCell>
                  <TableCell className={!row.fizetve && lejartStilus ? "font-medium text-destructive" : ""}>
                    {row.fizetesi_hatarido ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatOsszeg(row.brutto, row.penznem)}</TableCell>
                  <TableCell>
                    {row.fizetve ? (
                      <div className="flex items-center gap-1 text-xs text-success">
                        <CheckIcon className="h-3.5 w-3.5" /> Fizetve
                        {frissFizetve && (
                          <button
                            type="button"
                            className="text-muted-foreground hover:underline"
                            onClick={() => onVisszavon(row.id)}
                          >
                            (Visszavon)
                          </button>
                        )}
                      </div>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => onFizetve(row.id)}
                      >
                        Fizetve?
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/** Egy lejárat-lista adott sorának helyben (átrendezés nélkül) frissítése. */
function frissitSorLejaratListaban(
  lista: SzamlaLejaratLista | null,
  id: string,
  frissit: (row: SzamlaRow) => SzamlaRow
): SzamlaLejaratLista | null {
  if (!lista) return lista;
  const alkalmaz = (sorok: SzamlaRow[]) => sorok.map((r) => (r.id === id ? frissit(r) : r));
  return { ...lista, kovetkezo: alkalmaz(lista.kovetkezo), lejart: alkalmaz(lista.lejart) };
}

/** Két csempe (Fuvar / Raklap) a legközelebbi és a lejárt esedékességű, nyitott számlákról — gyors áttekintéshez. */
function LejaratCsempek({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const [fuvar, setFuvar] = useState<SzamlaLejaratLista | null>(null);
  const [raklap, setRaklap] = useState<SzamlaLejaratLista | null>(null);
  // "Fizetve"-re kattintva a sor a helyén marad (pipa, zöld), és csak az 5 perces
  // visszavonási ablak leteltével tűnik el ténylegesen — addig időzítővel várunk
  // a valós (a sort már kizáró) újratöltéssel.
  const idozitokRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const load = useCallback(async () => {
    const [f, r] = await Promise.all([getSzamlaLejaratLista("fuvar"), getSzamlaLejaratLista("raklap")]);
    setFuvar(f);
    setRaklap(r);
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useEffect(() => {
    const idozitok = idozitokRef.current;
    return () => {
      idozitok.forEach((t) => clearTimeout(t));
    };
  }, []);

  function torolIdozito(id: string) {
    const korabbi = idozitokRef.current.get(id);
    if (korabbi) {
      clearTimeout(korabbi);
      idozitokRef.current.delete(id);
    }
  }

  async function handleFizetve(id: string) {
    await jeloltFizetve(id);
    const most = new Date().toISOString();
    setFuvar((f) => frissitSorLejaratListaban(f, id, (r) => ({ ...r, fizetve: true, fizetve_datum: most })));
    setRaklap((r0) => frissitSorLejaratListaban(r0, id, (r) => ({ ...r, fizetve: true, fizetve_datum: most })));
    onChanged();
    toast.success("Számla fizetve-nek jelölve.");

    torolIdozito(id);
    idozitokRef.current.set(
      id,
      setTimeout(() => {
        idozitokRef.current.delete(id);
        load();
      }, 5 * 60 * 1000)
    );
  }

  async function handleVisszavon(id: string) {
    await visszavonFizetve(id);
    torolIdozito(id);
    setFuvar((f) => frissitSorLejaratListaban(f, id, (r) => ({ ...r, fizetve: false, fizetve_datum: null })));
    setRaklap((r0) => frissitSorLejaratListaban(r0, id, (r) => ({ ...r, fizetve: false, fizetve_datum: null })));
    onChanged();
  }

  const csempek: { kategoria: SzamlaKategoria; adat: SzamlaLejaratLista | null }[] = [
    { kategoria: "fuvar", adat: fuvar },
    { kategoria: "raklap", adat: raklap },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {csempek.map(({ kategoria, adat }) => (
        <div key={`${kategoria}-kovetkezo`} className="rounded-lg border border-warning/40 bg-warning/5 p-4">
          <div className="mb-2 text-sm font-semibold">{KATEGORIA_LABEL[kategoria]} — Következő 10 lejárat</div>
          <LejaratMiniTabla
            sorok={adat?.kovetkezo ?? []}
            lejartStilus={false}
            ures="Nincs közelgő esedékesség."
            onFizetve={handleFizetve}
            onVisszavon={handleVisszavon}
          />
        </div>
      ))}
      {csempek.map(({ kategoria, adat }) => (
        <div key={`${kategoria}-lejart`} className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <div className="mb-2 text-sm font-semibold text-destructive">
            {KATEGORIA_LABEL[kategoria]} — Lejárt ({adat?.lejartOsszesen ?? 0})
          </div>
          <LejaratMiniTabla
            sorok={adat?.lejart ?? []}
            lejartStilus
            ures="Nincs lejárt számla."
            onFizetve={handleFizetve}
            onVisszavon={handleVisszavon}
          />
        </div>
      ))}
    </div>
  );
}

const URES_STATISZTIKA: SzamlaKiemeltStatisztika = {
  lejartOsszegHuf: 0,
  lejartDarabHuf: 0,
  evesYtdHuf: 0,
  haviAtlagHuf: 0,
  csucsHonap: null,
  csucsHonapOsszegHuf: 0,
  novekedesSzazalek: null,
  legnagyobbNyitottVevo: null,
  legnagyobbNyitottVevoOsszegHuf: 0,
};

export function SzamlakView() {
  const [osszesito, setOsszesito] = useState<SzamlaOsszesitoSor[]>([]);
  const [egyebCegek, setEgyebCegek] = useState<SzamlaEgyebCegSor[]>([]);
  const [allapot, setAllapot] = useState<SzamlaAllapot | null>(null);
  const [havi, setHavi] = useState<SzamlaHaviBevetelSor[]>([]);
  const [statisztika, setStatisztika] = useState<SzamlaKiemeltStatisztika>(URES_STATISZTIKA);
  const [kifizetettOsszesito, setKifizetettOsszesito] = useState<SzamlaKifizetettOsszesitoSor[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [frissitve, setFrissitve] = useState(false);
  const [listaCim, setListaCim] = useState<string | null>(null);
  const [listaSzuro, setListaSzuro] = useState<SzamlaListaSzuro | null>(null);

  const loadOsszesito = useCallback(async () => {
    const [o, a, e, h, s, k] = await Promise.all([
      getSzamlaOsszesito(),
      getSzamlaSzinkronAllapot(),
      getSzamlaEgyebCegenkent(),
      getSzamlaHaviBevetel(),
      getSzamlaKiemeltStatisztika(),
      getKifizetettOsszesito(),
    ]);
    setOsszesito(o);
    setAllapot(a);
    setEgyebCegek(e);
    setHavi(h);
    setStatisztika(s);
    setKifizetettOsszesito(k);
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

  const infoSzoveg = [
    "A számlákat a cég a Számlázz.hu-ban állítja ki — ez a nézet onnan automatikusan behúzott kintlévőség-követő, nem számlázó felület.",
    allapot?.utolso_futas_at
      ? `Legutóbbi szinkron: ${new Date(allapot.utolso_futas_at).toLocaleString("hu-HU")}.`
      : null,
    allapot?.pending_darab ? `${allapot.pending_darab} sorszám még függőben (később kiadott/kihagyott).` : null,
    allapot?.sztorno_darab
      ? `${allapot.sztorno_darab} db rontott/sztornózott számla (és a törlő párja) automatikusan kiszűrve a listákból.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Számlák"
        subtitle="Kintlévőség-követő — a Számlázz.hu-ban kiállított számlákat tükrözi vissza."
        actions={
          <>
            <SzinkronInfoGomb szoveg={infoSzoveg} />
            <KontokivonatDialog onChanged={loadOsszesito} />
            <Button variant="outline" size="sm" disabled={frissitve} onClick={handleFrissites}>
              {frissitve ? "Frissítés…" : "Frissítés most"}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[180px_1fr]">
        <OsszesitesKompakt osszesito={osszesito} />
        <SzamlaBevetelDiagram havi={havi} statisztika={statisztika} />
      </div>

      <OsszesitoCsempek
        csempek={osszesito.map((s) => {
          const cim = `${KATEGORIA_LABEL[s.kategoria]}${s.alkategoria ? ` — ${ALKATEGORIA_LABEL[s.alkategoria]}` : ""} (${s.penznem})`;
          return {
            kulcs: `${s.kategoria}-${s.alkategoria ?? "nincs"}-${s.penznem}`,
            cim,
            nyitottOsszeg: s.nyitott_osszeg,
            lejartOsszeg: s.lejart_osszeg,
            penznem: s.penznem,
            nyitottDarab: s.nyitott_darab,
            lejartDarab: s.lejart_darab,
            onClick: () => {
              setListaCim(cim);
              setListaSzuro({ kategoria: s.kategoria, alkategoria: s.alkategoria, penznem: s.penznem });
            },
          };
        })}
      />

      {egyebCegek.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Raklap — Egyéb (cégenkénti bontás)</h2>
          <OsszesitoCsempek
            csempek={egyebCegek.map((c) => ({
              kulcs: `egyeb-${c.vevo_nev}-${c.penznem}`,
              cim: `${c.vevo_nev} (${c.penznem})`,
              nyitottOsszeg: c.nyitott_osszeg,
              lejartOsszeg: c.lejart_osszeg,
              penznem: c.penznem,
              nyitottDarab: c.nyitott_darab,
              lejartDarab: c.lejart_darab,
              onClick: () => {
                setListaCim(`Raklap — Egyéb — ${c.vevo_nev} (${c.penznem})`);
                setListaSzuro({
                  kategoria: "raklap",
                  alkategoria: "egyeb",
                  vevoNev: c.vevo_nev,
                  penznem: c.penznem,
                });
              },
            }))}
          />
        </div>
      )}

      <LejaratCsempek refreshKey={refreshKey} onChanged={loadOsszesito} />

      <button
        type="button"
        onClick={() => {
          setListaCim(`Kifizetve (${kifizetettOsszesito.reduce((sum, k) => sum + k.darab, 0)})`);
          setListaSzuro({ csakFizetve: true });
        }}
        className="flex w-full items-center justify-between rounded-lg border border-success/40 bg-success/5 p-4 text-left transition-colors hover:bg-success/10"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-success">
          <CheckIcon className="h-4 w-4" /> Kifizetve ({kifizetettOsszesito.reduce((sum, k) => sum + k.darab, 0)})
        </span>
        <span className="text-xs text-muted-foreground">
          {kifizetettOsszesito.length > 0
            ? kifizetettOsszesito.map((k) => formatOsszeg(k.osszeg, k.penznem)).join(" · ")
            : "—"}
        </span>
      </button>

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
