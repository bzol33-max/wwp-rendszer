"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckIcon, InfoIcon } from "lucide-react";
import { useCanEdit } from "@/components/auth/edit-permission-context";
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
  getSzamlaFejlec,
  getSzamlaHaviBevetel,
  getSzamlaKiemeltStatisztika,
  getSzamlaLista,
  getSzamlaOsszesito,
  getSzamlaSzinkronAllapot,
  getSzamlaTeendok,
  jeloltFizetve,
  visszavonFizetve,
  type SzamlaAllapot,
  type SzamlaFejlecSor,
  type SzamlaKifizetettOsszesitoSor,
  type SzamlaListaSzuro,
  type SzamlaTeendok,
} from "@/lib/szamlak/actions";
import {
  ALKATEGORIA_LABEL,
  KATEGORIA_LABEL,
  type SzamlaAlkategoria,
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

/** A mai nap Budapesten, "YYYY-MM-DD" — a toISOString() UTC-je éjfél és 2 óra között még a tegnapot adná. */
function budapestMa(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Budapest" }).format(new Date());
}

/** Az 5 perces visszavonási ablakon belül van-e még a "Fizetve" jelölés. */
function visszavonhato(fizetveDatum: string | null): boolean {
  if (!fizetveDatum) return false;
  return Date.now() - new Date(fizetveDatum).getTime() < 5 * 60 * 1000;
}

function kategoriaCimke(row: Pick<SzamlaRow, "kategoria" | "alkategoria">): string {
  return row.alkategoria ? ALKATEGORIA_LABEL[row.alkategoria] : KATEGORIA_LABEL[row.kategoria];
}

type Osszeg = { penznem: string; osszeg: number };

/** Pénznemenkénti összegek egy sorba (a forint elöl), a nullák nélkül — ha minden nulla, "0 Ft". */
function osszegLista(osszegek: Osszeg[]): Osszeg[] {
  const map = new Map<string, number>();
  for (const o of osszegek) map.set(o.penznem, (map.get(o.penznem) ?? 0) + Number(o.osszeg));
  const lista = [...map.entries()]
    .filter(([, osszeg]) => osszeg !== 0)
    .map(([penznem, osszeg]) => ({ penznem, osszeg }))
    .sort((a, b) => (a.penznem === "Ft" || a.penznem === "HUF" ? -1 : b.penznem === "Ft" || b.penznem === "HUF" ? 1 : 0));
  return lista.length > 0 ? lista : [{ penznem: "Ft", osszeg: 0 }];
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

/**
 * "Fizetve" jelölés és visszavonás egy listában: a sor a helyén marad (pipa,
 * zöld), és csak az 5 perces visszavonási ablak leteltével tölti újra a listát
 * (ami a sort már a valós helyére teszi / kizárja).
 */
function useFizetveJeloles(
  frissitSort: (id: string, fizetve: boolean, fizetveDatum: string | null) => void,
  ujratolt: () => void,
  onChanged: () => void
) {
  const idozitokRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

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

  async function fizetve(id: string) {
    try {
      await jeloltFizetve(id);
    } catch {
      toast.error("Nem sikerült fizetve-nek jelölni.");
      return;
    }
    frissitSort(id, true, new Date().toISOString());
    onChanged();
    toast.success("Számla fizetve-nek jelölve.");
    torolIdozito(id);
    idozitokRef.current.set(
      id,
      setTimeout(() => {
        idozitokRef.current.delete(id);
        ujratolt();
      }, 5 * 60 * 1000)
    );
  }

  async function visszavon(id: string) {
    try {
      await visszavonFizetve(id);
    } catch {
      toast.error("Nem sikerült visszavonni.");
      return;
    }
    torolIdozito(id);
    frissitSort(id, false, null);
    onChanged();
  }

  return { fizetve, visszavon };
}

/** A sor utolsó cellája: "Fizetve?" gomb, vagy pipa + (5 percig) visszavonás. Csak szerkesztési joggal kattintható. */
function FizetveCella({
  row,
  onFizetve,
  onVisszavon,
}: {
  row: SzamlaRow;
  onFizetve: (id: string) => void;
  onVisszavon: (id: string) => void;
}) {
  const canEdit = useCanEdit();
  if (row.fizetve) {
    return (
      <div className="flex items-center gap-1 text-xs text-success">
        <CheckIcon className="h-3.5 w-3.5" /> Fizetve
        {canEdit && visszavonhato(row.fizetve_datum) && (
          <button type="button" className="text-muted-foreground hover:underline" onClick={() => onVisszavon(row.id)}>
            (Visszavon)
          </button>
        )}
      </div>
    );
  }
  if (!canEdit) return null;
  return (
    <Button variant="secondary" size="sm" className="h-7 px-2 text-xs" onClick={() => onFizetve(row.id)}>
      Fizetve?
    </Button>
  );
}

/** Egy csempére kattintva megnyíló, teljes (szűrt) számlalista — "csoportos" módban vevőnként csoportosítva. */
function SzamlaListaDialog({
  cim,
  szuro,
  csoportos,
  onOpenChange,
  onChanged,
}: {
  cim: string | null;
  szuro: SzamlaListaSzuro | null;
  csoportos: boolean;
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

  const { fizetve, visszavon } = useFizetveJeloles(
    (id, f, d) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, fizetve: f, fizetve_datum: d } : r))),
    load,
    onChanged
  );

  const ma = budapestMa();
  // A "Hiv. szám" (rendelésszám) gyakorlatilag sosem töltött — ha egy sorban sincs
  // adat, ne foglaljon helyet a fontosabb oszlopoktól (dátum, összeg).
  const vanRendelesszam = rows.some((row) => row.rendelesszam);
  const oszlopSzam = vanRendelesszam ? 7 : 6;

  // Vevőnkénti csoportok, a legnagyobb nyitott összegű cég elöl — csak a nyitott
  // (és az épp most, még visszavonható módon fizetettre jelölt) számlákkal, hogy a
  // sok kis vevő régi, kifizetett tételei ne takarják el a teendőket.
  const csoportok: { vevoNev: string; sorok: SzamlaRow[]; nyitott: Osszeg[] }[] = [];
  if (csoportos) {
    const map = new Map<string, SzamlaRow[]>();
    for (const r of rows) {
      if (r.fizetve && !visszavonhato(r.fizetve_datum)) continue;
      map.set(r.vevo_nev, [...(map.get(r.vevo_nev) ?? []), r]);
    }
    for (const [vevoNev, sorok] of map) {
      const nyitottak = sorok.filter((r) => !r.fizetve).map((r) => ({ penznem: r.penznem, osszeg: Number(r.brutto) }));
      csoportok.push({ vevoNev, sorok, nyitott: nyitottak });
    }
    const nyitottOsszeg = (c: (typeof csoportok)[number]) => c.nyitott.reduce((s, o) => s + o.osszeg, 0);
    csoportok.sort((a, b) => nyitottOsszeg(b) - nyitottOsszeg(a));
  }

  function sor(row: SzamlaRow) {
    const lejart = !row.fizetve && !!row.fizetesi_hatarido && row.fizetesi_hatarido < ma;
    return (
      <TableRow key={row.id}>
        <TableCell className="whitespace-nowrap text-muted-foreground">{row.szamlaszam}</TableCell>
        <TableCell className="max-w-[9rem] truncate" title={row.vevo_nev}>
          {row.vevo_nev}
        </TableCell>
        {vanRendelesszam && <TableCell>{row.rendelesszam ?? "—"}</TableCell>}
        <TableCell className="whitespace-nowrap">{row.kiallitas_datum}</TableCell>
        <TableCell className={`whitespace-nowrap ${lejart ? "font-medium text-destructive" : ""}`}>
          {row.fizetesi_hatarido ?? "—"}
        </TableCell>
        <TableCell className="whitespace-nowrap text-right tabular-nums">{formatOsszeg(row.brutto, row.penznem)}</TableCell>
        <TableCell>
          {!row.fizetve && lejart ? (
            <div className="flex flex-col items-start gap-1">
              <Badge className="bg-destructive/15 text-destructive hover:bg-destructive/15 text-xs">Lejárt</Badge>
              <FizetveCella row={row} onFizetve={fizetve} onVisszavon={visszavon} />
            </div>
          ) : (
            <FizetveCella row={row} onFizetve={fizetve} onVisszavon={visszavon} />
          )}
        </TableCell>
      </TableRow>
    );
  }

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
                <TableHead className="w-28">Állapot</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && (csoportos ? csoportok.length === 0 : rows.length === 0) && (
                <TableRow>
                  <TableCell colSpan={oszlopSzam} className="text-center text-muted-foreground">
                    Nincs ilyen számla.
                  </TableCell>
                </TableRow>
              )}
              {csoportos
                ? csoportok.map((c) => [
                    <TableRow key={`cs-${c.vevoNev}`} className="bg-muted/40 hover:bg-muted/40">
                      <TableCell colSpan={oszlopSzam} className="text-xs font-semibold">
                        {c.vevoNev}
                        <span className="ml-2 font-normal text-muted-foreground">
                          {c.nyitott.length > 0
                            ? `${c.nyitott.length} nyitott · ${osszegLista(c.nyitott)
                                .map((o) => formatOsszeg(o.osszeg, o.penznem))
                                .join(" + ")}`
                            : "nincs nyitott"}
                        </span>
                      </TableCell>
                    </TableRow>,
                    ...c.sorok.map(sor),
                  ])
                : rows.map(sor)}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Egy csempe összeg-sorai: az első (forint) nagyban, a többi pénznem alatta kisebben. */
function Osszegek({ lista, szin }: { lista: Osszeg[]; szin?: string }) {
  return (
    <>
      <div className={`text-lg font-bold tabular-nums sm:text-xl ${szin ?? ""}`}>
        {formatOsszeg(lista[0].osszeg, lista[0].penznem)}
      </div>
      {lista.slice(1).map((o) => (
        <div key={o.penznem} className={`text-sm font-semibold tabular-nums ${szin ?? ""}`}>
          + {formatOsszeg(o.osszeg, o.penznem)}
        </div>
      ))}
    </>
  );
}

/** A felső 3 szám: Nyitott / Lejárt / 7 napon belül esedékes — pénznemenként soronként. */
function FejlecSzamok({
  fejlec,
  statisztika,
  onMegnyit,
}: {
  fejlec: SzamlaFejlecSor[];
  statisztika: SzamlaKiemeltStatisztika;
  onMegnyit: (cim: string, szuro: SzamlaListaSzuro) => void;
}) {
  const nyitott = osszegLista(fejlec.map((f) => ({ penznem: f.penznem, osszeg: f.nyitott_osszeg })));
  const lejart = osszegLista(fejlec.map((f) => ({ penznem: f.penznem, osszeg: f.lejart_osszeg })));
  const het = osszegLista(fejlec.map((f) => ({ penznem: f.penznem, osszeg: f.het_osszeg })));
  const darab = (mezo: "nyitott_darab" | "lejart_darab" | "het_darab") =>
    fejlec.reduce((s, f) => s + Number(f[mezo]), 0);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Card
        size="sm"
        className="cursor-pointer transition-colors hover:bg-muted/50"
        onClick={() => onMegnyit(`Nyitott számlák (${darab("nyitott_darab")})`, { csakNyitott: true })}
      >
        <CardContent className="flex min-w-0 flex-col gap-0.5 py-1">
          <div className="text-xs text-muted-foreground">Nyitott ({darab("nyitott_darab")} számla)</div>
          <Osszegek lista={nyitott} />
          {statisztika.legnagyobbNyitottVevo && (
            <div className="truncate text-xs text-muted-foreground" title={statisztika.legnagyobbNyitottVevo}>
              Legnagyobb: {statisztika.legnagyobbNyitottVevo} ·{" "}
              {formatOsszeg(statisztika.legnagyobbNyitottVevoOsszegHuf, "Ft")}
            </div>
          )}
        </CardContent>
      </Card>
      <Card
        size="sm"
        className="cursor-pointer border-destructive/40 bg-destructive/5 transition-colors hover:bg-destructive/10"
        onClick={() => onMegnyit(`Lejárt számlák (${darab("lejart_darab")})`, { csakNyitott: true, hatarido: "lejart" })}
      >
        <CardContent className="flex min-w-0 flex-col gap-0.5 py-1">
          <div className="text-xs text-destructive">Lejárt ({darab("lejart_darab")} számla)</div>
          <Osszegek lista={lejart} szin="text-destructive" />
        </CardContent>
      </Card>
      <Card
        size="sm"
        className="cursor-pointer border-warning/40 bg-warning/5 transition-colors hover:bg-warning/10"
        onClick={() =>
          onMegnyit(`7 napon belül esedékes (${darab("het_darab")})`, { csakNyitott: true, hatarido: "het" })
        }
      >
        <CardContent className="flex min-w-0 flex-col gap-0.5 py-1">
          <div className="text-xs text-muted-foreground">7 napon belül esedékes ({darab("het_darab")} számla)</div>
          <Osszegek lista={het} />
        </CardContent>
      </Card>
    </div>
  );
}

type KategoriaCsempeDef = {
  kulcs: string;
  cim: string;
  felirat: string;
  kategoria: SzamlaKategoria;
  alkategoria: SzamlaAlkategoria | null;
  /** Az Egyéb sok kis vevőt fog össze — a listája vevőnként csoportosítva nyílik. */
  csoportos: boolean;
};

const KATEGORIA_CSEMPEK: KategoriaCsempeDef[] = [
  { kulcs: "fuvar", cim: "Fuvar", felirat: "Fuvar", kategoria: "fuvar", alkategoria: null, csoportos: false },
  { kulcs: "fabrika", cim: "Fabrika", felirat: "Raklap", kategoria: "raklap", alkategoria: "fabrika", csoportos: false },
  { kulcs: "keter", cim: "Keter", felirat: "Raklap", kategoria: "raklap", alkategoria: "keter", csoportos: false },
  { kulcs: "egyeb", cim: "Egyéb", felirat: "Raklap · vevőnként", kategoria: "raklap", alkategoria: "egyeb", csoportos: true },
];

/** 4 kategória-csempe (Fuvar / Fabrika / Keter / Egyéb), pénznemek egy csempén belül; nyitott tétel nélkül nem jelenik meg. */
function KategoriaCsempek({
  osszesito,
  onMegnyit,
}: {
  osszesito: SzamlaOsszesitoSor[];
  onMegnyit: (def: KategoriaCsempeDef) => void;
}) {
  const csempek = KATEGORIA_CSEMPEK.map((def) => {
    const sorok = osszesito.filter((s) => s.kategoria === def.kategoria && (s.alkategoria ?? null) === def.alkategoria);
    return {
      def,
      nyitott: osszegLista(sorok.map((s) => ({ penznem: s.penznem, osszeg: s.nyitott_osszeg }))),
      nyitottDarab: sorok.reduce((n, s) => n + Number(s.nyitott_darab), 0),
      lejartDarab: sorok.reduce((n, s) => n + Number(s.lejart_darab), 0),
    };
  }).filter((c) => c.nyitottDarab > 0);

  if (csempek.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {csempek.map(({ def, nyitott, nyitottDarab, lejartDarab }) => (
        <Card
          key={def.kulcs}
          size="sm"
          className={`cursor-pointer border-l-2 transition-colors hover:bg-muted/50 ${def.kategoria === "fuvar" ? "border-l-primary" : ""}`}
          style={def.kategoria === "raklap" ? { borderLeftColor: "#f97316" } : undefined}
          onClick={() => onMegnyit(def)}
        >
          <CardContent className="flex min-w-0 flex-col gap-0.5 py-1">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{def.felirat}</div>
            <div className="text-sm font-semibold">{def.cim}</div>
            {nyitott.map((o) => (
              <div key={o.penznem} className="text-base font-bold tabular-nums">
                {formatOsszeg(o.osszeg, o.penznem)}
              </div>
            ))}
            <div className="text-xs text-muted-foreground">
              {nyitottDarab} nyitott
              {lejartDarab > 0 && <span className="font-medium text-destructive"> · {lejartDarab} lejárt</span>}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Egyetlen "Teendők" lista a korábbi 4 tábla helyett: elöl a lejártak, utána a következő 10 esedékesség. */
function TeendokLista({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const [adat, setAdat] = useState<SzamlaTeendok | null>(null);

  const load = useCallback(async () => {
    setAdat(await getSzamlaTeendok());
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const { fizetve, visszavon } = useFizetveJeloles(
    (id, f, d) =>
      setAdat((a) => {
        if (!a) return a;
        const alkalmaz = (sorok: SzamlaRow[]) =>
          sorok.map((r) => (r.id === id ? { ...r, fizetve: f, fizetve_datum: d } : r));
        return { lejart: alkalmaz(a.lejart), kovetkezo: alkalmaz(a.kovetkezo) };
      }),
    load,
    onChanged
  );

  const szakaszok = [
    { kulcs: "lejart", cim: `Lejárt (${adat?.lejart.length ?? 0})`, sorok: adat?.lejart ?? [], lejart: true },
    { kulcs: "kovetkezo", cim: "Következő esedékességek", sorok: adat?.kovetkezo ?? [], lejart: false },
  ].filter((sz) => sz.sorok.length > 0);

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-2 text-sm font-semibold">Teendők</div>
      {adat && szakaszok.length === 0 ? (
        <div className="text-sm text-muted-foreground">Nincs lejárt vagy közelgő számla.</div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sorszám</TableHead>
                <TableHead>Vevő</TableHead>
                <TableHead>Kategória</TableHead>
                <TableHead>Fizetési határidő</TableHead>
                <TableHead className="text-right">Összeg</TableHead>
                <TableHead className="w-28">Fizetve</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {szakaszok.map((sz) => [
                <TableRow key={`fej-${sz.kulcs}`} className="hover:bg-transparent">
                  <TableCell
                    colSpan={6}
                    className={`pt-3 text-xs font-semibold ${sz.lejart ? "text-destructive" : "text-muted-foreground"}`}
                  >
                    {sz.cim}
                  </TableCell>
                </TableRow>,
                ...sz.sorok.map((row) => (
                  <TableRow
                    key={row.id}
                    className={
                      row.fizetve
                        ? "bg-success/10 hover:bg-success/15"
                        : sz.lejart
                          ? "bg-destructive/10 hover:bg-destructive/15"
                          : ""
                    }
                  >
                    <TableCell className="whitespace-nowrap text-muted-foreground">{row.szamlaszam}</TableCell>
                    <TableCell className="max-w-[12rem] truncate" title={row.vevo_nev}>
                      {row.vevo_nev}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{kategoriaCimke(row)}</TableCell>
                    <TableCell
                      className={`whitespace-nowrap ${!row.fizetve && sz.lejart ? "font-medium text-destructive" : ""}`}
                    >
                      {row.fizetesi_hatarido ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {formatOsszeg(row.brutto, row.penznem)}
                    </TableCell>
                    <TableCell>
                      <FizetveCella row={row} onFizetve={fizetve} onVisszavon={visszavon} />
                    </TableCell>
                  </TableRow>
                )),
              ])}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

const URES_STATISZTIKA: SzamlaKiemeltStatisztika = {
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
  const [fejlec, setFejlec] = useState<SzamlaFejlecSor[]>([]);
  const [allapot, setAllapot] = useState<SzamlaAllapot | null>(null);
  const [havi, setHavi] = useState<SzamlaHaviBevetelSor[]>([]);
  const [statisztika, setStatisztika] = useState<SzamlaKiemeltStatisztika>(URES_STATISZTIKA);
  const [kifizetettOsszesito, setKifizetettOsszesito] = useState<SzamlaKifizetettOsszesitoSor[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [frissitve, setFrissitve] = useState(false);
  const [listaCim, setListaCim] = useState<string | null>(null);
  const [listaSzuro, setListaSzuro] = useState<SzamlaListaSzuro | null>(null);
  const [listaCsoportos, setListaCsoportos] = useState(false);
  const canEdit = useCanEdit();

  const loadOsszesito = useCallback(async () => {
    const [o, a, f, h, s, k] = await Promise.all([
      getSzamlaOsszesito(),
      getSzamlaSzinkronAllapot(),
      getSzamlaFejlec(),
      getSzamlaHaviBevetel(),
      getSzamlaKiemeltStatisztika(),
      getKifizetettOsszesito(),
    ]);
    setOsszesito(o);
    setAllapot(a);
    setFejlec(f);
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

  function megnyitLista(cim: string, szuro: SzamlaListaSzuro, csoportos = false) {
    setListaCim(cim);
    setListaCsoportos(csoportos);
    setListaSzuro(szuro);
  }

  const kifizetettDarab = kifizetettOsszesito.reduce((sum, k) => sum + k.darab, 0);

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
            <Button
              variant="ghost"
              size="sm"
              className="text-success"
              title={kifizetettOsszesito.map((k) => formatOsszeg(k.osszeg, k.penznem)).join(" · ")}
              onClick={() => megnyitLista(`Kifizetve (${kifizetettDarab})`, { csakFizetve: true })}
            >
              <CheckIcon className="h-4 w-4" /> Kifizetve ({kifizetettDarab})
            </Button>
            {canEdit && (
              <>
                {/* A refreshKey az összesítőt ÉS a Teendők listát is újratölti. */}
                <KontokivonatDialog onChanged={() => setRefreshKey((k) => k + 1)} />
                <Button variant="outline" size="sm" disabled={frissitve} onClick={handleFrissites}>
                  {frissitve ? "Frissítés…" : "Frissítés most"}
                </Button>
              </>
            )}
          </>
        }
      />

      <FejlecSzamok fejlec={fejlec} statisztika={statisztika} onMegnyit={(cim, szuro) => megnyitLista(cim, szuro)} />

      <KategoriaCsempek
        osszesito={osszesito}
        onMegnyit={(def) =>
          megnyitLista(
            def.kategoria === "fuvar" ? "Fuvar" : `Raklap — ${def.cim}`,
            { kategoria: def.kategoria, alkategoria: def.alkategoria },
            def.csoportos
          )
        }
      />

      <TeendokLista refreshKey={refreshKey} onChanged={loadOsszesito} />

      <SzamlaBevetelDiagram havi={havi} statisztika={statisztika} />

      <SzamlaListaDialog
        cim={listaCim}
        szuro={listaSzuro}
        csoportos={listaCsoportos}
        onOpenChange={(nyitva) => {
          if (!nyitva) {
            setListaSzuro(null);
            // A listában tett "Fizetve" jelölések a Teendők listában is látszódjanak.
            setRefreshKey((k) => k + 1);
          }
        }}
        onChanged={loadOsszesito}
      />
    </div>
  );
}
