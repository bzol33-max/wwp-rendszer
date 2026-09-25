"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon, InfoIcon } from "lucide-react";
import { useCanEdit } from "@/components/auth/edit-permission-context";
import { PageHeader } from "@/components/layout/page-header";
import { KontokivonatDialog } from "@/components/szamlak/kontokivonat-dialog";
import { SzamlaBevetelDiagram } from "@/components/szamlak/szamla-bevetel-diagram";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  reszbenFizetve,
  szamlaHatralek,
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

/** Amennyi a listában megjelenik: nyitott számlánál a hátralék (a banki részfizetések levonva). */
function sorOsszeg(row: SzamlaRow): number {
  return row.fizetve ? Number(row.brutto) : szamlaHatralek(row);
}

/** "részben fizetve" sor a számla összege alatt — csak ha jött rá részfizetés. */
function ReszfizetesJelzes({ row }: { row: SzamlaRow }) {
  if (!reszbenFizetve(row)) return null;
  return (
    <div className="text-[11px] font-normal text-primary">
      részben fizetve · {formatOsszeg(row.fizetett_osszeg, row.penznem)} / {formatOsszeg(row.brutto, row.penznem)}
    </div>
  );
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

/**
 * A lapon belül megjelenő, szűrt számlalista (a bal oldali sáv nézetéhez) —
 * "csoportos" módban vevőnként csoportosítva. Korábban dialógusban nyílt; a
 * B-elrendezésben (2026-09-25) a jobb hasáb tartalma, dialógus nélkül.
 */
function SzamlaLista({
  cim,
  szuro,
  csoportos,
  onChanged,
}: {
  cim: string;
  szuro: SzamlaListaSzuro;
  csoportos: boolean;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<SzamlaRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await getSzamlaLista(szuro));
    } finally {
      setLoading(false);
    }
  }, [szuro]);

  useEffect(() => {
    load();
  }, [load]);

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
      const nyitottak = sorok.filter((r) => !r.fizetve).map((r) => ({ penznem: r.penznem, osszeg: szamlaHatralek(r) }));
      csoportok.push({ vevoNev, sorok, nyitott: nyitottak });
    }
    const nyitottOsszeg = (c: (typeof csoportok)[number]) => c.nyitott.reduce((s, o) => s + o.osszeg, 0);
    csoportok.sort((a, b) => nyitottOsszeg(b) - nyitottOsszeg(a));
  }

  const osszegSor = osszegLista(
    rows.filter((r) => !r.fizetve).map((r) => ({ penznem: r.penznem, osszeg: szamlaHatralek(r) }))
  );

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
        <TableCell className="whitespace-nowrap text-right tabular-nums">
          {formatOsszeg(sorOsszeg(row), row.penznem)}
          <ReszfizetesJelzes row={row} />
        </TableCell>
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
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">
          {cim} <span className="font-normal text-muted-foreground">({rows.length})</span>
        </span>
        {!szuro.csakFizetve && (
          <span className="text-xs text-muted-foreground">
            hátralék{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {osszegSor.map((o) => formatOsszeg(o.osszeg, o.penznem)).join(" + ")}
            </span>
          </span>
        )}
      </div>
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
    </div>
  );
}

/** A jobb hasáb tetején futó számcsík egy mezője. */
function CsikMezo({
  cimke,
  darab,
  osszegek,
  szin,
  aktiv,
  onClick,
}: {
  cimke: string;
  darab: number;
  osszegek: Osszeg[];
  szin?: string;
  aktiv: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={aktiv}
      className={`flex min-w-0 flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-muted/50 ${aktiv ? "bg-muted/60" : ""}`}
    >
      <span className={`text-xs ${szin ?? "text-muted-foreground"}`}>
        {cimke} <span className="text-muted-foreground">· {darab}</span>
      </span>
      <span className={`truncate text-base font-bold tabular-nums ${szin ?? ""}`}>
        {formatOsszeg(osszegek[0].osszeg, osszegek[0].penznem)}
      </span>
      {osszegek.slice(1).map((o) => (
        <span key={o.penznem} className={`truncate text-xs font-semibold tabular-nums ${szin ?? ""}`}>
          + {formatOsszeg(o.osszeg, o.penznem)}
        </span>
      ))}
    </button>
  );
}

/**
 * A jobb hasáb fejléce: Nyitott / Lejárt / 7 napon belül — egy csíkban, a
 * pénznemenkénti összegekkel. Kattintásra a lista nézetre vált a megfelelő
 * szűrővel (a korábbi csempék funkciója).
 */
function SzamCsik({
  fejlec,
  hatarido,
  aktivLista,
  onValaszt,
}: {
  fejlec: SzamlaFejlecSor[];
  hatarido: "lejart" | "het" | null;
  aktivLista: boolean;
  onValaszt: (hatarido: "lejart" | "het" | null) => void;
}) {
  const osszeg = (mezo: "nyitott_osszeg" | "lejart_osszeg" | "het_osszeg") =>
    osszegLista(fejlec.map((f) => ({ penznem: f.penznem, osszeg: f[mezo] })));
  const darab = (mezo: "nyitott_darab" | "lejart_darab" | "het_darab") =>
    fejlec.reduce((n, f) => n + Number(f[mezo]), 0);

  return (
    <div className="grid grid-cols-1 divide-y overflow-hidden rounded-xl border bg-card sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      <CsikMezo
        cimke="Nyitott"
        darab={darab("nyitott_darab")}
        osszegek={osszeg("nyitott_osszeg")}
        aktiv={aktivLista && hatarido === null}
        onClick={() => onValaszt(null)}
      />
      <CsikMezo
        cimke="Lejárt"
        darab={darab("lejart_darab")}
        osszegek={osszeg("lejart_osszeg")}
        szin="text-destructive"
        aktiv={aktivLista && hatarido === "lejart"}
        onClick={() => onValaszt("lejart")}
      />
      <CsikMezo
        cimke="7 napon belül"
        darab={darab("het_darab")}
        osszegek={osszeg("het_osszeg")}
        szin="text-warning"
        aktiv={aktivLista && hatarido === "het"}
        onClick={() => onValaszt("het")}
      />
    </div>
  );
}

type MappaDef = {
  kulcs: string;
  cim: string;
  kategoria: SzamlaKategoria;
  alkategoria: SzamlaAlkategoria | null;
  /** Az Egyéb sok kis vevőt fog össze — a listája vevőnként csoportosítva nyílik. */
  csoportos: boolean;
};

const MAPPAK: MappaDef[] = [
  { kulcs: "fuvar", cim: "Fuvar", kategoria: "fuvar", alkategoria: null, csoportos: false },
  { kulcs: "fabrika", cim: "Fabrika", kategoria: "raklap", alkategoria: "fabrika", csoportos: false },
  { kulcs: "keter", cim: "Keter", kategoria: "raklap", alkategoria: "keter", csoportos: false },
  { kulcs: "egyeb", cim: "Egyéb", kategoria: "raklap", alkategoria: "egyeb", csoportos: true },
];

type Nezet = "teendok" | "lista" | "vevok" | "kifizetve" | "bevetel";

const NEZET_CIM: Record<Nezet, string> = {
  teendok: "Teendők",
  lista: "Minden számla",
  vevok: "Vevők",
  kifizetve: "Kifizetve",
  bevetel: "Bevétel",
};

function SavGomb({ aktiv, onClick, children }: { aktiv: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={aktiv}
      className={`flex min-h-8 w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
        aktiv ? "bg-accent font-medium text-accent-foreground" : "hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Bal oldali sáv: fent a nézetek, alatta a mappák a kintlévőségükkel — a
 * korábbi kategória-csempék funkciója. Egy mappára kattintva a lista nézet
 * nyílik az adott mappára szűrve (az Egyéb vevőnként csoportosítva).
 */
function OldalSav({
  nezet,
  mappa,
  osszesito,
  kifizetettDarab,
  statisztika,
  onNezet,
  onMappa,
}: {
  nezet: Nezet;
  mappa: MappaDef | null;
  osszesito: SzamlaOsszesitoSor[];
  kifizetettDarab: number;
  statisztika: SzamlaKiemeltStatisztika;
  onNezet: (nezet: Nezet) => void;
  onMappa: (mappa: MappaDef | null) => void;
}) {
  const mappaSorok = MAPPAK.map((def) => {
    const sorok = osszesito.filter((s) => s.kategoria === def.kategoria && (s.alkategoria ?? null) === def.alkategoria);
    return {
      def,
      nyitott: osszegLista(sorok.map((s) => ({ penznem: s.penznem, osszeg: s.nyitott_osszeg }))),
      nyitottDarab: sorok.reduce((n, s) => n + Number(s.nyitott_darab), 0),
      lejartDarab: sorok.reduce((n, s) => n + Number(s.lejart_darab), 0),
    };
  }).filter((m) => m.nyitottDarab > 0);

  return (
    <nav className="flex flex-col gap-2 rounded-xl border bg-card p-2 lg:sticky lg:top-4 lg:self-start">
      <div className="flex flex-wrap gap-1 lg:flex-col">
        {(["teendok", "lista", "vevok", "kifizetve", "bevetel"] as Nezet[]).map((n) => (
          <span key={n} className="min-w-[8rem] flex-1 lg:min-w-0">
            <SavGomb aktiv={nezet === n} onClick={() => onNezet(n)}>
              <span className={n === "kifizetve" ? "text-success" : ""}>{NEZET_CIM[n]}</span>
              {n === "kifizetve" && <span className="text-xs tabular-nums text-success">{kifizetettDarab}</span>}
            </SavGomb>
          </span>
        ))}
      </div>

      {mappaSorok.length > 0 && (
        <>
          <div className="border-t pt-1.5 text-[11px] uppercase tracking-wide text-muted-foreground lg:px-2">Mappa</div>
          <div className="flex flex-wrap gap-1 lg:flex-col">
            <span className="min-w-[6rem] flex-1 lg:min-w-0">
              <SavGomb aktiv={mappa === null} onClick={() => onMappa(null)}>
                Mind
              </SavGomb>
            </span>
            {mappaSorok.map(({ def, nyitott, lejartDarab }) => (
              <span key={def.kulcs} className="min-w-[8rem] flex-1 lg:min-w-0">
                <SavGomb aktiv={mappa?.kulcs === def.kulcs} onClick={() => onMappa(def)}>
                  <span className="truncate">
                    {def.cim}
                    {lejartDarab > 0 && <span className="ml-1 text-xs text-destructive">· {lejartDarab} lejárt</span>}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatOsszeg(nyitott[0].osszeg, nyitott[0].penznem)}
                  </span>
                </SavGomb>
              </span>
            ))}
          </div>
        </>
      )}

      {statisztika.legnagyobbNyitottVevo && (
        <div className="border-t px-2 pt-1.5 text-[11px] leading-snug text-muted-foreground">
          Legnagyobb tartozó:{" "}
          <span className="font-medium text-foreground">{statisztika.legnagyobbNyitottVevo}</span> ·{" "}
          {formatOsszeg(statisztika.legnagyobbNyitottVevoOsszegHuf, "Ft")}
        </div>
      )}
    </nav>
  );
}

/** Egy mini-táblázat a Teendők egy szakaszához (Következő 10 / Lejárt). */
function TeendoTabla({
  cim,
  sorok,
  lejartStilus,
  ures,
  alkategoriaval,
  onFizetve,
  onVisszavon,
}: {
  cim: string;
  sorok: SzamlaRow[];
  lejartStilus: boolean;
  ures: string;
  alkategoriaval: boolean;
  onFizetve: (id: string) => void;
  onVisszavon: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className={`text-xs font-semibold ${lejartStilus ? "text-destructive" : "text-muted-foreground"}`}>{cim}</div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sorszám</TableHead>
              <TableHead>Vevő</TableHead>
              <TableHead>Határidő</TableHead>
              <TableHead className="text-right">Összeg</TableHead>
              <TableHead className="w-24"></TableHead>
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
                <TableCell className="whitespace-nowrap text-muted-foreground">{row.szamlaszam}</TableCell>
                <TableCell className="max-w-[11rem]">
                  <div className="truncate" title={row.vevo_nev}>
                    {row.vevo_nev}
                  </div>
                  {alkategoriaval && row.alkategoria && (
                    <div className="text-[10px] text-muted-foreground">{ALKATEGORIA_LABEL[row.alkategoria]}</div>
                  )}
                </TableCell>
                <TableCell
                  className={`whitespace-nowrap ${!row.fizetve && lejartStilus ? "font-medium text-destructive" : ""}`}
                >
                  {row.fizetesi_hatarido ?? "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {formatOsszeg(sorOsszeg(row), row.penznem)}
                  <ReszfizetesJelzes row={row} />
                </TableCell>
                <TableCell>
                  <FizetveCella row={row} onFizetve={onFizetve} onVisszavon={onVisszavon} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/**
 * Kétoszlopos Teendők blokk: bal oldalt Fuvar, jobb oldalt Raklap (minden más
 * kimenő számla) — mindkettőben felül a következő 10 lejárat, alatta az összes lejárt.
 */
function TeendokLista({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const [fuvar, setFuvar] = useState<SzamlaTeendok | null>(null);
  const [raklap, setRaklap] = useState<SzamlaTeendok | null>(null);

  const load = useCallback(async () => {
    const [f, r] = await Promise.all([getSzamlaTeendok("fuvar"), getSzamlaTeendok("raklap")]);
    setFuvar(f);
    setRaklap(r);
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const { fizetve, visszavon } = useFizetveJeloles(
    (id, f, d) => {
      const alkalmaz = (a: SzamlaTeendok | null) => {
        if (!a) return a;
        const sorok = (lista: SzamlaRow[]) =>
          lista.map((r) => (r.id === id ? { ...r, fizetve: f, fizetve_datum: d } : r));
        return { kovetkezo: sorok(a.kovetkezo), lejart: sorok(a.lejart) };
      };
      setFuvar(alkalmaz);
      setRaklap(alkalmaz);
    },
    load,
    onChanged
  );

  const oszlopok: { kategoria: SzamlaKategoria; adat: SzamlaTeendok | null }[] = [
    { kategoria: "fuvar", adat: fuvar },
    { kategoria: "raklap", adat: raklap },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {oszlopok.map(({ kategoria, adat }) => (
        <div key={kategoria} className="flex min-w-0 flex-col gap-4 rounded-lg border p-4">
          <div className="text-sm font-semibold">{KATEGORIA_LABEL[kategoria]}</div>
          <TeendoTabla
            cim="Következő 10 lejárat"
            sorok={adat?.kovetkezo ?? []}
            lejartStilus={false}
            ures="Nincs közelgő esedékesség."
            alkategoriaval={kategoria === "raklap"}
            onFizetve={fizetve}
            onVisszavon={visszavon}
          />
          <TeendoTabla
            cim={`Lejárt (${adat?.lejart.length ?? 0})`}
            sorok={adat?.lejart ?? []}
            lejartStilus
            ures="Nincs lejárt számla."
            alkategoriaval={kategoria === "raklap"}
            onFizetve={fizetve}
            onVisszavon={visszavon}
          />
        </div>
      ))}
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
  // B-elrendezés (2026-09-25): bal oldali sáv a nézetekkel és a mappákkal,
  // jobbra a számcsík és a kiválasztott nézet. A lap a Teendőkön nyílik.
  const [nezet, setNezet] = useState<Nezet>("teendok");
  const [mappa, setMappa] = useState<MappaDef | null>(null);
  const [hatarido, setHatarido] = useState<"lejart" | "het" | null>(null);
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

  const kifizetettDarab = kifizetettOsszesito.reduce((sum, k) => sum + k.darab, 0);

  // A lista nézet szűrője — a hivatkozása stabil, különben a SzamlaLista
  // minden újrarajzolásnál újratöltene.
  const listaSzuro: SzamlaListaSzuro = useMemo(
    () => ({
      kategoria: mappa?.kategoria,
      alkategoria: mappa ? mappa.alkategoria : undefined,
      ...(nezet === "kifizetve"
        ? { csakFizetve: true, fizetveIdei: true, limit: 5000 }
        : { csakNyitott: true, hatarido: nezet === "lista" && hatarido ? hatarido : undefined }),
    }),
    [mappa, nezet, hatarido]
  );

  // Vevőnkénti bontás: a "Vevők" nézetben mindig, a mappák közül az Egyébnél
  // (sok kis vevő) a lista nézetben is.
  const csoportos = nezet === "vevok" || (nezet === "lista" && !!mappa?.csoportos);

  const listaCim =
    nezet === "kifizetve"
      ? `Kifizetve (idén)${mappa ? ` · ${mappa.cim}` : ""}`
      : nezet === "vevok"
        ? `Vevők${mappa ? ` · ${mappa.cim}` : ""}`
        : `${hatarido === "lejart" ? "Lejárt" : hatarido === "het" ? "7 napon belül esedékes" : "Nyitott számlák"}${mappa ? ` · ${mappa.cim}` : ""}`;

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

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <OldalSav
          nezet={nezet}
          mappa={mappa}
          osszesito={osszesito}
          kifizetettDarab={kifizetettDarab}
          statisztika={statisztika}
          onNezet={(n) => {
            setNezet(n);
            if (n !== "lista") setHatarido(null);
          }}
          onMappa={(m) => {
            setMappa(m);
            // A Teendők és a Bevétel nézet nem mappa-függő — mappára kattintva a listát mutatjuk.
            if (nezet === "teendok" || nezet === "bevetel") setNezet("lista");
          }}
        />

        <div className="flex min-w-0 flex-col gap-4">
          <SzamCsik
            fejlec={fejlec}
            hatarido={hatarido}
            aktivLista={nezet === "lista"}
            onValaszt={(h) => {
              setHatarido(h);
              setNezet("lista");
            }}
          />

          {nezet === "teendok" && <TeendokLista refreshKey={refreshKey} onChanged={loadOsszesito} />}

          {(nezet === "lista" || nezet === "vevok" || nezet === "kifizetve") && (
            <SzamlaLista
              // A nézet/mappa váltás friss listát töltsön, ne a korábbi sorokat mutassa.
              key={`${nezet}-${mappa?.kulcs ?? "mind"}-${hatarido ?? "nyitott"}-${refreshKey}`}
              cim={listaCim}
              szuro={listaSzuro}
              csoportos={csoportos}
              onChanged={loadOsszesito}
            />
          )}

          {nezet === "bevetel" && <SzamlaBevetelDiagram havi={havi} statisztika={statisztika} />}
        </div>
      </div>
    </div>
  );
}
