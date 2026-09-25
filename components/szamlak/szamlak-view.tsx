"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon, InfoIcon, SearchIcon } from "lucide-react";
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
  keresJavaslatok,
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
  type KeresesJavaslatok,
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
 * A lapon belül megjelenő, szűrt számlalista. Minden nézetben vevőnként
 * csoportosít (2026-09-25, a felhasználó kérése): a cégek ábécésorrendben,
 * a cégen belül a számlák időrendben (kiállítás dátuma szerint, a legrégebbi
 * elöl). Korábban dialógusban nyílt.
 */
function SzamlaLista({
  cim,
  szuro,
  onChanged,
}: {
  cim: string;
  szuro: SzamlaListaSzuro;
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

  // Vevőnkénti csoportok: a cégek ábécésorrendben, a cégen belül a számlák
  // időrendben (kiállítás dátuma, majd sorszám szerint). A nyitott listákból a
  // régen kifizetett sorok kimaradnak — az épp most, még visszavonható módon
  // fizetettre jelöltek a helyükön maradnak.
  const csoportok: { vevoNev: string; sorok: SzamlaRow[]; nyitott: Osszeg[] }[] = [];
  {
    const map = new Map<string, SzamlaRow[]>();
    for (const r of rows) {
      if (szuro.csakNyitott && r.fizetve && !visszavonhato(r.fizetve_datum)) continue;
      map.set(r.vevo_nev, [...(map.get(r.vevo_nev) ?? []), r]);
    }
    for (const [vevoNev, sorok] of map) {
      const idorendben = [...sorok].sort(
        (a, b) =>
          (a.kiallitas_datum ?? "").localeCompare(b.kiallitas_datum ?? "") ||
          a.szamlaszam.localeCompare(b.szamlaszam, "hu", { numeric: true })
      );
      const nyitottak = idorendben
        .filter((r) => !r.fizetve)
        .map((r) => ({ penznem: r.penznem, osszeg: szamlaHatralek(r) }));
      csoportok.push({ vevoNev, sorok: idorendben, nyitott: nyitottak });
    }
    csoportok.sort((a, b) => a.vevoNev.localeCompare(b.vevoNev, "hu", { sensitivity: "base" }));
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
          {cim}{" "}
          <span className="font-normal text-muted-foreground">
            ({rows.length} számla · {csoportok.length} cég)
          </span>
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
            {!loading && csoportok.length === 0 && (
              <TableRow>
                <TableCell colSpan={oszlopSzam} className="text-center text-muted-foreground">
                  Nincs ilyen számla.
                </TableCell>
              </TableRow>
            )}
            {csoportok.map((c) => [
              <TableRow key={`cs-${c.vevoNev}`} className="bg-muted/40 hover:bg-muted/40">
                <TableCell colSpan={oszlopSzam} className="text-xs font-semibold">
                  {c.vevoNev}
                  <span className="ml-2 font-normal text-muted-foreground">
                    {c.sorok.length} számla
                    {c.nyitott.length > 0
                      ? ` · ${c.nyitott.length} nyitott: ${osszegLista(c.nyitott)
                          .map((o) => formatOsszeg(o.osszeg, o.penznem))
                          .join(" + ")}`
                      : " · nincs nyitott"}
                  </span>
                </TableCell>
              </TableRow>,
              ...c.sorok.map(sor),
            ])}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

type MappaDef = {
  kulcs: string;
  cim: string;
  kategoria: SzamlaKategoria;
  alkategoria: SzamlaAlkategoria | null;
};

const MAPPAK: MappaDef[] = [
  { kulcs: "fuvar", cim: "Fuvar", kategoria: "fuvar", alkategoria: null },
  { kulcs: "fabrika", cim: "Fabrika", kategoria: "raklap", alkategoria: "fabrika" },
  { kulcs: "keter", cim: "Keter", kategoria: "raklap", alkategoria: "keter" },
  { kulcs: "egyeb", cim: "Egyéb", kategoria: "raklap", alkategoria: "egyeb" },
];

type Nezet = "teendok" | "lista" | "kifizetve" | "bevetel" | "kereses";

// Külön "Vevők" fül nincs: minden lista vevőnként csoportosít (2026-09-25).
const FULEK: { kulcs: Nezet; cim: string }[] = [
  { kulcs: "teendok", cim: "Teendők" },
  { kulcs: "lista", cim: "Számlalista" },
  { kulcs: "kifizetve", cim: "Kifizetve" },
  { kulcs: "bevetel", cim: "Bevétel" },
];

/** Egy pötty a mappasorban (és a keresés-törlő pöttyhöz is). */
function Potty({
  aktiv,
  onClick,
  children,
}: {
  aktiv: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={aktiv}
      className={`flex min-h-8 items-center gap-1 rounded-full border px-3 text-xs transition-colors ${
        aktiv ? "border-primary bg-accent font-medium text-accent-foreground" : "bg-card hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Kereső a fejlécben: gépelés közben javaslatokat mutat (számlák és vevők),
 * és mindenre keres — sorszám, vevő, hivatkozási szám, tételszöveg, összeg.
 * Enterrel az összes találat listája nyílik.
 */
function Kereso({ onTalalat }: { onTalalat: (szuro: SzamlaListaSzuro, cim: string) => void }) {
  const [szoveg, setSzoveg] = useState("");
  const [javaslatok, setJavaslatok] = useState<KeresesJavaslatok | null>(null);
  const [nyitva, setNyitva] = useState(false);
  const [kijelolt, setKijelolt] = useState(0);
  const dobozRef = useRef<HTMLDivElement>(null);

  // Gépelés közben, késleltetve kérdezzük le a javaslatokat — minden leütésre
  // nem indítunk kört, és a régi válasz nem írhatja felül az újabbat.
  useEffect(() => {
    const minta = szoveg.trim();
    let ervenyes = true;
    const idozito = setTimeout(async () => {
      if (minta.length < 2) {
        setJavaslatok(null);
        return;
      }
      try {
        const eredmeny = await keresJavaslatok(minta);
        if (ervenyes) {
          setJavaslatok(eredmeny);
          setKijelolt(0);
        }
      } catch {
        if (ervenyes) setJavaslatok(null);
      }
    }, minta.length < 2 ? 0 : 200);
    return () => {
      ervenyes = false;
      clearTimeout(idozito);
    };
  }, [szoveg]);

  // Kattintás a kereső dobozon kívül: zárjuk a legördülőt.
  useEffect(() => {
    function kint(e: MouseEvent) {
      if (dobozRef.current && !dobozRef.current.contains(e.target as Node)) setNyitva(false);
    }
    document.addEventListener("mousedown", kint);
    return () => document.removeEventListener("mousedown", kint);
  }, []);

  const sorok: { kulcs: string; valaszt: () => void; tartalom: React.ReactNode }[] = [];
  if (javaslatok) {
    for (const sz of javaslatok.szamlak) {
      sorok.push({
        kulcs: `sz-${sz.id}`,
        valaszt: () => valasztas({ kereses: sz.szamlaszam }, `${sz.szamlaszam} — ${sz.vevo_nev}`),
        tartalom: (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{sz.vevo_nev}</span>
              <span className="block truncate font-mono text-[11px] text-muted-foreground">{sz.szamlaszam}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-sm tabular-nums">
                {formatOsszeg(sz.fizetve ? sz.brutto : Number(sz.brutto) - Number(sz.fizetett_osszeg), sz.penznem)}
              </span>
              <span className={`block text-[11px] ${sz.fizetve ? "text-success" : "text-muted-foreground"}`}>
                {sz.fizetve ? "fizetve" : (sz.fizetesi_hatarido ?? "nincs határidő")}
              </span>
            </span>
          </>
        ),
      });
    }
    for (const v of javaslatok.vevok) {
      sorok.push({
        kulcs: `v-${v.vevo_nev}`,
        valaszt: () => valasztas({ vevoNev: v.vevo_nev, limit: 5000 }, `${v.vevo_nev} — minden számla`),
        tartalom: (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{v.vevo_nev}</span>
              <span className="block text-[11px] text-muted-foreground">vevő</span>
            </span>
            <span className="shrink-0 text-right text-[11px] text-muted-foreground">
              {v.nyitott_darab > 0 ? `${v.nyitott_darab} nyitott · ${formatOsszeg(v.nyitott_osszeg, v.penznem)}` : "nincs nyitott"}
            </span>
          </>
        ),
      });
    }
    if (javaslatok.szamlaOsszes > javaslatok.szamlak.length) {
      sorok.push({
        kulcs: "mind",
        valaszt: () => mindenTalalat(),
        tartalom: (
          <span className="text-sm text-primary">Összes találat megjelenítése ({javaslatok.szamlaOsszes})</span>
        ),
      });
    }
  }

  function valasztas(szuro: SzamlaListaSzuro, cim: string) {
    setNyitva(false);
    onTalalat({ limit: 5000, ...szuro }, cim);
  }

  function mindenTalalat() {
    const minta = szoveg.trim();
    if (minta.length < 2) return;
    valasztas({ kereses: minta }, `Keresés: „${minta}”`);
  }

  return (
    <div ref={dobozRef} className="relative w-full sm:w-72">
      <div className="flex h-9 items-center gap-2 rounded-lg border bg-card px-3">
        <SearchIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          type="search"
          value={szoveg}
          placeholder="Keresés: cég, sorszám, összeg…"
          onChange={(e) => {
            setSzoveg(e.target.value);
            setNyitva(true);
          }}
          onFocus={() => setNyitva(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setKijelolt((k) => Math.min(k + 1, Math.max(sorok.length - 1, 0)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setKijelolt((k) => Math.max(k - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (nyitva && sorok[kijelolt]) sorok[kijelolt].valaszt();
              else mindenTalalat();
            } else if (e.key === "Escape") {
              setNyitva(false);
            }
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      {nyitva && szoveg.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-10 z-50 overflow-hidden rounded-lg border bg-popover shadow-md">
          {sorok.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {javaslatok ? "Nincs találat." : "Keresés…"}
            </div>
          ) : (
            <div className="max-h-72 divide-y overflow-y-auto">
              {sorok.map((sor, i) => (
                <button
                  key={sor.kulcs}
                  type="button"
                  onMouseEnter={() => setKijelolt(i)}
                  onClick={sor.valaszt}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left ${i === kijelolt ? "bg-muted" : ""}`}
                >
                  {sor.tartalom}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
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
  // Füles elrendezés (2026-09-25): felül a nézetek, alattuk a mappák a
  // kintlévőségükkel és az állapot-számok; a kereső a fejlécben.
  const [nezet, setNezet] = useState<Nezet>("teendok");
  const [mappa, setMappa] = useState<MappaDef | null>(null);
  const [hatarido, setHatarido] = useState<"lejart" | "het" | null>(null);
  const [keresesSzuro, setKeresesSzuro] = useState<SzamlaListaSzuro | null>(null);
  const [keresesCim, setKeresesCim] = useState("");
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

  const mappaSorok = MAPPAK.map((def) => {
    const sorok = osszesito.filter((o) => o.kategoria === def.kategoria && (o.alkategoria ?? null) === def.alkategoria);
    return {
      def,
      nyitott: osszegLista(sorok.map((o) => ({ penznem: o.penznem, osszeg: o.nyitott_osszeg }))),
      nyitottDarab: sorok.reduce((n, o) => n + Number(o.nyitott_darab), 0),
      lejartDarab: sorok.reduce((n, o) => n + Number(o.lejart_darab), 0),
    };
  }).filter((m) => m.nyitottDarab > 0);

  const mindOsszeg = osszegLista(fejlec.map((f) => ({ penznem: f.penznem, osszeg: f.nyitott_osszeg })));
  const lejartOsszeg = osszegLista(fejlec.map((f) => ({ penznem: f.penznem, osszeg: f.lejart_osszeg })));
  const hetOsszeg = osszegLista(fejlec.map((f) => ({ penznem: f.penznem, osszeg: f.het_osszeg })));
  const fejlecDarab = (mezo: "nyitott_darab" | "lejart_darab" | "het_darab") =>
    fejlec.reduce((n, f) => n + Number(f[mezo]), 0);

  // A lista nézet szűrője — a hivatkozása stabil, különben a SzamlaLista
  // minden újrarajzolásnál újratöltene.
  const listaSzuro: SzamlaListaSzuro = useMemo(() => {
    if (nezet === "kereses" && keresesSzuro) return keresesSzuro;
    return {
      kategoria: mappa?.kategoria,
      alkategoria: mappa ? mappa.alkategoria : undefined,
      ...(nezet === "kifizetve"
        ? { csakFizetve: true, fizetveIdei: true, limit: 5000 }
        : { csakNyitott: true, limit: 2000, hatarido: nezet === "lista" && hatarido ? hatarido : undefined }),
    };
  }, [mappa, nezet, hatarido, keresesSzuro]);

  const listaCim =
    nezet === "kereses"
      ? keresesCim
      : nezet === "kifizetve"
        ? `Kifizetve (idén)${mappa ? ` · ${mappa.cim}` : ""}`
        : `${hatarido === "lejart" ? "Lejárt" : hatarido === "het" ? "7 napon belül esedékes" : "Nyitott számlák"}${mappa ? ` · ${mappa.cim}` : ""}`;

  function valtsFul(uj: Nezet) {
    setNezet(uj);
    if (uj !== "lista") setHatarido(null);
    if (uj !== "kereses") setKeresesSzuro(null);
  }

  function allapotra(h: "lejart" | "het" | null) {
    setHatarido(h);
    setKeresesSzuro(null);
    setNezet("lista");
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
    <div className="flex flex-col gap-3">
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

      {/* Fülek + kereső */}
      <div className="flex flex-wrap items-end justify-between gap-2 border-b">
        <div className="-mb-px flex flex-wrap">
          {FULEK.map((f) => (
            <button
              key={f.kulcs}
              type="button"
              onClick={() => valtsFul(f.kulcs)}
              aria-pressed={nezet === f.kulcs}
              className={`min-h-9 px-3 pb-2 text-sm transition-colors ${
                nezet === f.kulcs
                  ? "border-b-2 border-primary font-medium text-primary"
                  : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.cim}
              {f.kulcs === "kifizetve" && kifizetettDarab > 0 && (
                <span className="ml-1 text-xs text-muted-foreground">{kifizetettDarab}</span>
              )}
            </button>
          ))}
          {nezet === "kereses" && (
            <span className="min-h-9 border-b-2 border-primary px-3 pb-2 text-sm font-medium text-primary">
              Találatok
            </span>
          )}
        </div>
        <div className="mb-2 w-full sm:w-auto">
          <Kereso
            onTalalat={(szuro, cim) => {
              setKeresesSzuro(szuro);
              setKeresesCim(cim);
              setMappa(null);
              setHatarido(null);
              setNezet("kereses");
            }}
          />
        </div>
      </div>

      {/* Mappák a kintlévőségükkel, jobbra az állapot-számok */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <Potty
            aktiv={mappa === null}
            onClick={() => {
              setMappa(null);
              if (nezet === "teendok" || nezet === "bevetel") setNezet("lista");
            }}
          >
            Mind
            <span className="tabular-nums text-muted-foreground">
              {formatOsszeg(mindOsszeg[0].osszeg, mindOsszeg[0].penznem)}
            </span>
          </Potty>
          {mappaSorok.map(({ def, nyitott, lejartDarab }) => (
            <Potty
              key={def.kulcs}
              aktiv={mappa?.kulcs === def.kulcs}
              onClick={() => {
                setMappa(def);
                setKeresesSzuro(null);
                // A Teendők és a Bevétel nem mappa-függő — mappára kattintva a lista jön.
                if (nezet === "teendok" || nezet === "bevetel" || nezet === "kereses") setNezet("lista");
              }}
            >
              {def.cim}
              <span className="tabular-nums text-muted-foreground">
                {formatOsszeg(nyitott[0].osszeg, nyitott[0].penznem)}
              </span>
              {lejartDarab > 0 && <span className="text-destructive">· {lejartDarab} lejárt</span>}
            </Potty>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <button type="button" onClick={() => allapotra(null)} className="hover:underline">
            nyitott <span className="font-semibold tabular-nums">{fejlecDarab("nyitott_darab")}</span> ·{" "}
            <span className="tabular-nums">{formatOsszeg(mindOsszeg[0].osszeg, mindOsszeg[0].penznem)}</span>
          </button>
          <button type="button" onClick={() => allapotra("lejart")} className="text-destructive hover:underline">
            lejárt <span className="font-semibold tabular-nums">{fejlecDarab("lejart_darab")}</span> ·{" "}
            <span className="tabular-nums">{formatOsszeg(lejartOsszeg[0].osszeg, lejartOsszeg[0].penznem)}</span>
          </button>
          <button type="button" onClick={() => allapotra("het")} className="text-warning hover:underline">
            7 nap <span className="font-semibold tabular-nums">{fejlecDarab("het_darab")}</span> ·{" "}
            <span className="tabular-nums">{formatOsszeg(hetOsszeg[0].osszeg, hetOsszeg[0].penznem)}</span>
          </button>
        </div>
      </div>

      {nezet === "teendok" && <TeendokLista refreshKey={refreshKey} onChanged={loadOsszesito} />}

      {(nezet === "lista" || nezet === "kifizetve" || nezet === "kereses") && (
        <SzamlaLista
          // A fül/mappa/keresés váltás friss listát töltsön, ne a korábbi sorokat mutassa.
          key={`${nezet}-${mappa?.kulcs ?? "mind"}-${hatarido ?? "nyitott"}-${keresesCim}-${refreshKey}`}
          cim={listaCim}
          szuro={listaSzuro}
          onChanged={loadOsszesito}
        />
      )}

      {nezet === "bevetel" && <SzamlaBevetelDiagram havi={havi} statisztika={statisztika} />}
    </div>
  );
}
