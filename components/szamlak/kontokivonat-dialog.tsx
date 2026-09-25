"use client";

import { useRef, useState } from "react";
import { UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  fogadjaElParositasokat,
  olvasKivonatFajlt,
  parositKivonatTranzakciokat,
} from "@/lib/szamlak/kontokivonat";
import type {
  KivonatFajl,
  KivonatKonyvelesEredmeny,
  KivonatParositas,
  KivonatTranzakcio,
} from "@/lib/szamlak/kontokivonat-constants";

function formatOsszeg(n: number, penznem: string) {
  return `${Number(n).toLocaleString("de-DE", { maximumFractionDigits: 2 })} ${penznem}`;
}

function rovidDatum(iso: string | null): string {
  return iso ? iso.slice(5, 10).replace("-", ".") : "—";
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function eredmenyUzenet(res: KivonatKonyvelesEredmeny): string {
  const reszek = [];
  if (res.sikeres) reszek.push(`${res.sikeres} számla fizetve-nek jelölve`);
  if (res.reszfizetes) reszek.push(`${res.reszfizetes} részfizetés felírva (a számla nyitott maradt)`);
  if (res.datumFrissitve) reszek.push(`${res.datumFrissitve} számla fizetési dátuma pontosítva`);
  if (res.marKonyvelt) reszek.push(`${res.marKonyvelt} utalás már le volt könyvelve`);
  return reszek.length ? `${reszek.join(", ")}.` : "Nem történt változás.";
}

/** Egy banki utalás kártyája: a javasolt számlákkal (review / dátum esetén bejelölhetően) és a könyvelés gombbal. */
function ParositasKartya({
  parositas,
  onKonyvelve,
}: {
  parositas: KivonatParositas;
  onKonyvelve: () => void;
}) {
  const [folyamatban, setFolyamatban] = useState(false);
  const [kivalasztott, setKivalasztott] = useState<Set<string>>(() => new Set(parositas.kivalasztottIdk));
  const { tranzakcio, allapot } = parositas;
  const auto = allapot === "auto";
  const datum = allapot === "datum";
  const resz = allapot === "resz";
  const bejelolheto = allapot === "review" || (datum && parositas.mod !== "memo");
  const konyvelheto = allapot === "auto" || allapot === "review" || datum || resz;

  // A hátralékkal számolunk: egy részben fizetett számlából csak a maradékot
  // fedezheti ez az utalás (a már fizetetteknél a hátralék a teljes bruttó).
  const kivalasztottOsszeg = parositas.szamlak
    .filter((sz) => kivalasztott.has(sz.id))
    .reduce((s, sz) => s + Math.round(sz.hatralek * 100), 0);
  const osszegEgyezik = kivalasztottOsszeg === Math.round(tranzakcio.osszeg * 100);

  async function konyvel() {
    if (kivalasztott.size === 0) return;
    setFolyamatban(true);
    try {
      const res = await fogadjaElParositasokat([{ tranzakcio, szamlaIdk: [...kivalasztott] }]);
      toast.success(eredmenyUzenet(res));
      onKonyvelve();
    } catch {
      toast.error("Nem sikerült könyvelni.");
    } finally {
      setFolyamatban(false);
    }
  }

  function toggle(id: string) {
    setKivalasztott((prev) => {
      const uj = new Set(prev);
      if (uj.has(id)) uj.delete(id);
      else uj.add(id);
      return uj;
    });
  }

  const szegely =
    allapot === "auto"
      ? "border-l-success"
      : allapot === "review" || resz
        ? "border-l-warning"
        : datum
          ? "border-l-primary"
          : "border-l-border";

  return (
    <div
      className={`grid grid-cols-1 gap-2 rounded-md border-l-4 bg-card p-3 text-sm shadow-sm sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-4 ${szegely}`}
    >
      <div className="min-w-0">
        <div className="truncate font-medium" title={tranzakcio.partnerNev}>
          {tranzakcio.partnerNev || "—"}
        </div>
        <div className="text-xs text-muted-foreground">{tranzakcio.datum}</div>
        {tranzakcio.memo && (
          <div className="mt-1 inline-block max-w-full truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            &quot;{tranzakcio.memo}&quot;
          </div>
        )}
        {parositas.megjegyzes && <div className="mt-1 text-xs italic text-muted-foreground">{parositas.megjegyzes}</div>}
        {parositas.szamlak.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {parositas.szamlak.map((sz) => (
              <label
                key={sz.id}
                className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${
                  kivalasztott.has(sz.id) ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                } ${bejelolheto ? "cursor-pointer" : ""}`}
                title={sz.fizetesiHatarido ? `Határidő: ${sz.fizetesiHatarido}` : undefined}
              >
                {bejelolheto && (
                  <input
                    type="checkbox"
                    className="h-3 w-3"
                    checked={kivalasztott.has(sz.id)}
                    onChange={() => toggle(sz.id)}
                  />
                )}
                {sz.szamlaszam} ({formatOsszeg(sz.hatralek, tranzakcio.penznem)})
                {sz.fizetettOsszeg > 0 && !sz.fizetveDatum && (
                  <span className="text-muted-foreground">
                    · hátralék a {formatOsszeg(sz.brutto, tranzakcio.penznem)}-ból
                  </span>
                )}
                {datum && sz.fizetveDatum && (
                  <span className="text-muted-foreground">
                    · fizetve {rovidDatum(sz.fizetveDatum)} → {rovidDatum(tranzakcio.datum)}
                  </span>
                )}
              </label>
            ))}
          </div>
        )}
        {bejelolheto && !resz && kivalasztott.size > 0 && !osszegEgyezik && (
          <div className="mt-1 text-[11px] text-warning">
            A bejelöltek összege {formatOsszeg(kivalasztottOsszeg / 100, tranzakcio.penznem)} — nem egyezik az utalással.
          </div>
        )}
      </div>
      <div className="text-right text-base font-semibold tabular-nums sm:text-left">
        {formatOsszeg(tranzakcio.osszeg, tranzakcio.penznem)}
      </div>
      <div className="flex justify-end gap-2">
        {konyvelheto && (
          <Button
            size="sm"
            variant={auto ? "default" : "secondary"}
            disabled={folyamatban || kivalasztott.size === 0}
            onClick={konyvel}
          >
            {auto ? "Elfogad" : resz ? "Részfizetés könyvelése" : datum ? "Dátum frissítése" : `Könyvel (${kivalasztott.size})`}
          </Button>
        )}
      </div>
    </div>
  );
}

function Szakasz({
  cim,
  badgeClass,
  lista,
  onKonyvelve,
  osszecsukott,
  leiras,
  tomeges,
}: {
  cim: string;
  badgeClass: string;
  lista: KivonatParositas[];
  onKonyvelve: (kulcsok: string[]) => void;
  osszecsukott?: boolean;
  leiras?: string;
  tomeges?: { cimke: string; tetelek: KivonatParositas[] };
}) {
  const [folyamatban, setFolyamatban] = useState(false);
  if (lista.length === 0) return null;

  async function mindet() {
    if (!tomeges || tomeges.tetelek.length === 0) return;
    setFolyamatban(true);
    try {
      const res = await fogadjaElParositasokat(
        tomeges.tetelek.map((p) => ({ tranzakcio: p.tranzakcio, szamlaIdk: p.kivalasztottIdk }))
      );
      toast.success(eredmenyUzenet(res));
      onKonyvelve(tomeges.tetelek.map((p) => p.tranzakcio.kulcs));
    } catch {
      toast.error("Nem sikerült könyvelni.");
    } finally {
      setFolyamatban(false);
    }
  }

  const tartalom = lista.map((p) => (
    <ParositasKartya key={p.tranzakcio.kulcs} parositas={p} onKonyvelve={() => onKonyvelve([p.tranzakcio.kulcs])} />
  ));
  const fejlec = (
    <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
      {cim}
      <Badge className={badgeClass}>{lista.length}</Badge>
      {tomeges && tomeges.tetelek.length > 0 && (
        <Button
          size="sm"
          className="ml-auto h-7"
          disabled={folyamatban}
          onClick={(e) => {
            e.preventDefault();
            mindet();
          }}
        >
          {tomeges.cimke} ({tomeges.tetelek.length})
        </Button>
      )}
    </span>
  );
  if (osszecsukott) {
    return (
      <details className="flex flex-col gap-2">
        <summary className="cursor-pointer list-none">{fejlec}</summary>
        <div className="mt-2 flex flex-col gap-2">{tartalom}</div>
      </details>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {fejlec}
      {leiras && <p className="text-xs text-muted-foreground">{leiras}</p>}
      {tartalom}
    </div>
  );
}

/** Pénznemenkénti összeg egy sorban (a forint elöl) — vegyes devizás kivonatnál is pontos. */
function osszegekSzovege(tetelek: KivonatParositas[]): string {
  const map = new Map<string, number>();
  for (const p of tetelek) {
    const penznem = ["FT", "HUF"].includes(p.tranzakcio.penznem.trim().toUpperCase()) ? "Ft" : p.tranzakcio.penznem;
    map.set(penznem, (map.get(penznem) ?? 0) + p.tranzakcio.osszeg);
  }
  const lista = [...map.entries()].sort((a, b) => (a[0] === "Ft" ? -1 : b[0] === "Ft" ? 1 : 0));
  return lista.length > 0 ? lista.map(([penznem, osszeg]) => formatOsszeg(osszeg, penznem)).join(" + ") : "—";
}

/** Egy szám a összefoglaló négyes dobozból. */
function OsszefoglaloDoboz({
  cimke,
  darab,
  also,
  szinOsztaly,
}: {
  cimke: string;
  darab: number;
  also?: string;
  szinOsztaly: string;
}) {
  return (
    <div className={`flex flex-col gap-0.5 rounded-lg px-3 py-2 ${szinOsztaly}`}>
      <span className="text-xs">{cimke}</span>
      <span className="text-lg font-semibold tabular-nums">{darab}</span>
      {also && <span className="text-[11px] tabular-nums opacity-80">{also}</span>}
    </div>
  );
}

/** Egy sor a jóváhagyó listában: mi történik ezzel az utalással. */
function OsszefoglaloSor({
  parositas,
  jelolt,
  onToggle,
}: {
  parositas: KivonatParositas;
  jelolt: boolean;
  onToggle: () => void;
}) {
  const { tranzakcio: t, allapot, szamlak, kivalasztottIdk } = parositas;
  const erintett = szamlak.filter((sz) => kivalasztottIdk.includes(sz.id));
  const szamlaszamok = erintett.map((sz) => sz.szamlaszam).join(", ");
  const marad = allapot === "resz" && erintett[0] ? erintett[0].hatralek - t.osszeg : 0;
  const muvelet =
    allapot === "auto"
      ? { szoveg: "fizetve lesz", osztaly: "text-success" }
      : allapot === "resz"
        ? { szoveg: `részfizetés, marad ${formatOsszeg(marad, t.penznem)}`, osztaly: "text-warning" }
        : { szoveg: `fizetési dátum ${t.datum}`, osztaly: "text-primary" };

  return (
    <label className="flex cursor-pointer items-start gap-2 px-3 py-2 hover:bg-muted/40">
      <input type="checkbox" className="mt-1 h-3.5 w-3.5 shrink-0" checked={jelolt} onChange={onToggle} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium" title={t.partnerNev}>
            {t.partnerNev || "—"}
          </span>
          <span className="shrink-0 text-sm tabular-nums">{formatOsszeg(t.osszeg, t.penznem)}</span>
        </span>
        <span className={`block truncate text-[11px] ${muvelet.osztaly}`}>
          {rovidDatum(t.datum)} · {szamlaszamok || "—"} → {muvelet.szoveg}
        </span>
      </span>
    </label>
  );
}

/**
 * A feltöltés utáni jóváhagyó képernyő: felül a számok, alatta tételesen, mi
 * mivel párosult, és egyetlen gomb, ami az összes jelöltet lekönyveli. Amit
 * kiveszel a jelölésből, az érintetlen marad; a kézi ellenőrzést kérő tételek
 * alább, kártyánként intézhetők.
 */
function JovahagyoOsszefoglalo({
  fajlok,
  osszesTetel,
  konyvelheto,
  reviewDarab,
  marKonyveltDarab,
  egyebDarab,
  onKonyvelve,
}: {
  fajlok: KivonatFajl[];
  osszesTetel: number;
  konyvelheto: KivonatParositas[];
  reviewDarab: number;
  marKonyveltDarab: number;
  egyebDarab: number;
  onKonyvelve: (kulcsok: string[]) => void;
}) {
  const [kihagyott, setKihagyott] = useState<Set<string>>(new Set());
  const [folyamatban, setFolyamatban] = useState(false);

  const jeloltek = konyvelheto.filter((p) => !kihagyott.has(p.tranzakcio.kulcs));
  const auto = konyvelheto.filter((p) => p.allapot === "auto");
  const resz = konyvelheto.filter((p) => p.allapot === "resz");
  const datum = konyvelheto.filter((p) => p.allapot === "datum");
  const datumok = fajlok.flatMap((f) => [f.datumtol, f.datumig]).filter((d): d is string => !!d).sort();

  async function konyvel() {
    if (jeloltek.length === 0) return;
    setFolyamatban(true);
    try {
      const res = await fogadjaElParositasokat(
        jeloltek.map((p) => ({ tranzakcio: p.tranzakcio, szamlaIdk: p.kivalasztottIdk }))
      );
      toast.success(eredmenyUzenet(res));
      onKonyvelve(jeloltek.map((p) => p.tranzakcio.kulcs));
    } catch {
      toast.error("Nem sikerült könyvelni.");
    } finally {
      setFolyamatban(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-3">
      <div className="text-xs text-muted-foreground">
        {fajlok.length} fájl · {osszesTetel} bevételi tétel
        {datumok.length > 0 && ` · ${datumok[0]} – ${datumok[datumok.length - 1]}`}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <OsszefoglaloDoboz
          cimke="Fizetve lesz"
          darab={auto.length}
          also={osszegekSzovege(auto)}
          szinOsztaly="bg-success/10 text-success"
        />
        <OsszefoglaloDoboz
          cimke="Részfizetés"
          darab={resz.length}
          also={osszegekSzovege(resz)}
          szinOsztaly="bg-warning/10 text-warning"
        />
        <OsszefoglaloDoboz
          cimke="Dátum pontosítva"
          darab={datum.length}
          also={osszegekSzovege(datum)}
          szinOsztaly="bg-primary/10 text-primary"
        />
        <OsszefoglaloDoboz
          cimke="Kézi / kimarad"
          darab={reviewDarab + egyebDarab}
          also={marKonyveltDarab > 0 ? `${marKonyveltDarab} már könyvelve` : undefined}
          szinOsztaly="bg-muted text-muted-foreground"
        />
      </div>

      {konyvelheto.length === 0 ? (
        <div className="py-2 text-center text-sm text-muted-foreground">
          Nincs több könyvelendő tétel ebből a kivonatból.
        </div>
      ) : (
        <>
          <div className="text-xs text-muted-foreground">
            A jelölt tételek könyvelődnek. Amit kiveszel, az érintetlen marad.
          </div>
          <div className="max-h-64 divide-y overflow-y-auto rounded-lg border">
            {konyvelheto.map((p) => (
              <OsszefoglaloSor
                key={p.tranzakcio.kulcs}
                parositas={p}
                jelolt={!kihagyott.has(p.tranzakcio.kulcs)}
                onToggle={() =>
                  setKihagyott((prev) => {
                    const uj = new Set(prev);
                    if (uj.has(p.tranzakcio.kulcs)) uj.delete(p.tranzakcio.kulcs);
                    else uj.add(p.tranzakcio.kulcs);
                    return uj;
                  })
                }
              />
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{jeloltek.length} tétel jelölve</span>
            <Button disabled={folyamatban || jeloltek.length === 0} onClick={konyvel}>
              {folyamatban ? "Könyvelés…" : `Rendben, könyvelés (${jeloltek.length})`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

const FORRAS_CIM: Record<KivonatFajl["forras"], string> = {
  "unicredit-xlsx": "UniCredit",
  "cib-pdf": "CIB",
};

export function KontokivonatDialog({ onChanged }: { onChanged: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [allapotSzoveg, setAllapotSzoveg] = useState<string | null>(null);
  const [fajlok, setFajlok] = useState<KivonatFajl[]>([]);
  const [parositasok, setParositasok] = useState<KivonatParositas[] | null>(null);
  // Az ebben a párbeszédben lekönyvelt utalások (egyedi kulcs alapján) eltűnnek
  // a teendők közül — egy újrafeltöltéskor a szerver "Már könyvelve"-ként adja vissza őket.
  const [konyveltek, setKonyveltek] = useState<Set<string>>(new Set());

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const lista = [...(e.target.files ?? [])];
    e.target.value = "";
    if (lista.length === 0) return;

    setOpen(true);
    setFajlok([]);
    setParositasok(null);
    setKonyveltek(new Set());
    try {
      const beolvasottak: KivonatFajl[] = [];
      const tranzakciok: KivonatTranzakcio[] = [];
      for (const [i, file] of lista.entries()) {
        setAllapotSzoveg(`Beolvasás: ${file.name} (${i + 1}/${lista.length})…`);
        try {
          const res = await olvasKivonatFajlt(await fileToBase64(file), file.name);
          const { tranzakciok: t, ...osszesito } = res;
          beolvasottak.push(osszesito);
          tranzakciok.push(...t);
        } catch {
          toast.error(`Nem sikerült beolvasni: ${file.name}`);
        }
      }
      setFajlok(beolvasottak);
      setAllapotSzoveg("Párosítás a számlákkal…");
      setParositasok(await parositKivonatTranzakciokat(tranzakciok));
    } catch {
      toast.error("Nem sikerült feldolgozni a kontókivonatot — ellenőrizd a fájlformátumot.");
      setOpen(false);
    } finally {
      setAllapotSzoveg(null);
    }
  }

  function markKonyvelve(kulcsok: string[]) {
    setKonyveltek((prev) => new Set([...prev, ...kulcsok]));
    onChanged();
  }

  const osszes = parositasok ?? [];
  const hatralevo = osszes.filter((p) => !konyveltek.has(p.tranzakcio.kulcs));
  const autoLista = hatralevo.filter((p) => p.allapot === "auto");
  const reszLista = hatralevo.filter((p) => p.allapot === "resz");
  const datumLista = hatralevo.filter((p) => p.allapot === "datum");
  const reviewLista = hatralevo.filter((p) => p.allapot === "review");
  const marKonyveltLista = osszes.filter((p) => p.allapot === "konyvelt");
  const egyebLista = osszes.filter((p) => p.allapot === "egyeb");

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.pdf"
        multiple
        className="hidden"
        onChange={handleFiles}
      />
      <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
        <UploadIcon className="h-3.5 w-3.5" /> Kontókivonat feltöltés
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        {/* A dialógus portálba renderel, a lap wrapper-én kívül — a modul színeit (.szamlak) itt külön meg kell kapnia. */}
        <DialogContent className="szamlak max-h-[85vh] overflow-y-auto bg-background sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Kontókivonat párosítás</DialogTitle>
          </DialogHeader>

          {allapotSzoveg && <div className="py-8 text-center text-sm text-muted-foreground">{allapotSzoveg}</div>}

          {!allapotSzoveg && parositasok && (
            <div className="flex flex-col gap-5">
              {/* Jóváhagyó összefoglaló: mi mivel párosult, és egy gomb az egészre. */}
              <JovahagyoOsszefoglalo
                fajlok={fajlok}
                osszesTetel={osszes.length}
                konyvelheto={[...autoLista, ...reszLista, ...datumLista]}
                reviewDarab={reviewLista.length}
                marKonyveltDarab={marKonyveltLista.length}
                egyebDarab={egyebLista.length}
                onKonyvelve={markKonyvelve}
              />

              <Szakasz
                cim="Kézi ellenőrzés szükséges"
                badgeClass="bg-warning/15 text-warning hover:bg-warning/15"
                lista={reviewLista}
                onKonyvelve={markKonyvelve}
                leiras="Ezeknél az összeg vagy a közlemény nem egyértelmű — jelöld be, melyik számlát fedezi az utalás."
              />

              <details className="flex flex-col gap-2">
                <summary className="cursor-pointer list-none text-sm font-semibold text-muted-foreground">
                  Részletek tételenként
                </summary>
                <div className="mt-2 flex flex-col gap-5">
                  <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                    {fajlok.map((f) => (
                      <div key={f.fajlNev} className="flex flex-wrap gap-x-2">
                        <span className="font-medium text-foreground">{f.fajlNev}</span>
                        <span>
                          {FORRAS_CIM[f.forras]} ·{" "}
                          {f.datumtol && f.datumig ? `${f.datumtol} – ${f.datumig}` : "nincs bevétel"} · {f.bevetelSzam}{" "}
                          bevétel ({f.kihagyottKiadas} kiadás, {f.kihagyottKartya} kártyás, {f.kihagyottSajat} saját
                          átvezetés kihagyva)
                        </span>
                      </div>
                    ))}
                  </div>

                  <Szakasz
                    cim="Automatikusan párosítva"
                    badgeClass="bg-success/15 text-success hover:bg-success/15"
                    lista={autoLista}
                    onKonyvelve={markKonyvelve}
                  />
                  <Szakasz
                    cim="Részfizetés"
                    badgeClass="bg-warning/15 text-warning hover:bg-warning/15"
                    lista={reszLista}
                    onKonyvelve={markKonyvelve}
                    leiras="Az utalás kisebb, mint a közleményben szereplő számla hátraléka. Könyveléskor csak a hátralék csökken, a számla nyitott marad — a következő utalás zárja majd le."
                  />
                  <Szakasz
                    cim="Fizetés dátumának pontosítása"
                    badgeClass="bg-primary/15 text-primary hover:bg-primary/15"
                    lista={datumLista}
                    onKonyvelve={markKonyvelve}
                    leiras="Ezek a számlák már fizetettként szerepelnek, de banki utalással még nem voltak igazolva. A fizetés dátuma az utalás értéknapja lesz."
                  />
                  <Szakasz
                    cim="Már könyvelve"
                    badgeClass="bg-muted text-muted-foreground hover:bg-muted"
                    lista={marKonyveltLista}
                    onKonyvelve={markKonyvelve}
                    osszecsukott
                  />
                  <Szakasz
                    cim="Nem vevői befizetés / nincs hozzá számla"
                    badgeClass="bg-muted text-muted-foreground hover:bg-muted"
                    lista={egyebLista}
                    onKonyvelve={markKonyvelve}
                    osszecsukott
                  />
                </div>
              </details>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
