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
import { dolgozzFelKivonatot, fogadjaElParositasokat } from "@/lib/szamlak/kontokivonat";
import type { KivonatEredmeny, KivonatParositas } from "@/lib/szamlak/kontokivonat-constants";

function formatOsszeg(n: number, penznem: string) {
  return `${Number(n).toLocaleString("de-DE", { maximumFractionDigits: 2 })} ${penznem}`;
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

/** Egy banki utalás kártyája: a javasolt számlákkal (review esetén bejelölhetően) és a könyvelés gombbal. */
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
  const konyvelheto = allapot === "auto" || allapot === "review";

  const kivalasztottOsszeg = parositas.szamlak
    .filter((sz) => kivalasztott.has(sz.id))
    .reduce((s, sz) => s + Math.round(sz.brutto * 100), 0);
  const osszegEgyezik = kivalasztottOsszeg === Math.round(tranzakcio.osszeg * 100);

  async function konyvel() {
    if (kivalasztott.size === 0) return;
    setFolyamatban(true);
    try {
      const res = await fogadjaElParositasokat([{ tranzakcio, szamlaIdk: [...kivalasztott] }]);
      if (res.marKonyvelt > 0) toast.info("Ez az utalás már le volt könyvelve.");
      else toast.success(`${res.sikeres} számla fizetve-nek jelölve.`);
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
    allapot === "auto" ? "border-l-success" : allapot === "review" ? "border-l-warning" : "border-l-border";

  return (
    <div
      className={`grid grid-cols-1 gap-2 rounded-md border-l-4 bg-card p-3 text-sm shadow-sm sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-4 ${szegely}`}
    >
      <div className="min-w-0">
        <div className="truncate font-medium" title={tranzakcio.partnerNev}>
          {tranzakcio.partnerNev}
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
                } ${allapot === "review" ? "cursor-pointer" : ""}`}
                title={sz.fizetesiHatarido ? `Határidő: ${sz.fizetesiHatarido}` : undefined}
              >
                {allapot === "review" && (
                  <input
                    type="checkbox"
                    className="h-3 w-3"
                    checked={kivalasztott.has(sz.id)}
                    onChange={() => toggle(sz.id)}
                  />
                )}
                {sz.szamlaszam} ({formatOsszeg(sz.brutto, tranzakcio.penznem)})
              </label>
            ))}
          </div>
        )}
        {allapot === "review" && kivalasztott.size > 0 && !osszegEgyezik && (
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
            {auto ? "Elfogad" : `Könyvel (${kivalasztott.size})`}
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
}: {
  cim: string;
  badgeClass: string;
  lista: KivonatParositas[];
  onKonyvelve: (kulcs: string) => void;
  osszecsukott?: boolean;
}) {
  if (lista.length === 0) return null;
  const tartalom = lista.map((p) => (
    <ParositasKartya key={p.tranzakcio.kulcs} parositas={p} onKonyvelve={() => onKonyvelve(p.tranzakcio.kulcs)} />
  ));
  const fejlec = (
    <span className="flex items-center gap-2 text-sm font-semibold">
      {cim}
      <Badge className={badgeClass}>{lista.length}</Badge>
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
      {tartalom}
    </div>
  );
}

export function KontokivonatDialog({ onChanged }: { onChanged: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [feltoltve, setFeltoltve] = useState(false);
  const [eredmeny, setEredmeny] = useState<KivonatEredmeny | null>(null);
  // Az ebben a párbeszédben lekönyvelt utalások (egyedi kulcs alapján) eltűnnek
  // a teendők közül — egy újrafeltöltéskor a szerver "Már könyvelve"-ként adja vissza őket.
  const [konyveltek, setKonyveltek] = useState<Set<string>>(new Set());

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setOpen(true);
    setFeltoltve(true);
    setEredmeny(null);
    setKonyveltek(new Set());
    try {
      const base64 = await fileToBase64(file);
      const res = await dolgozzFelKivonatot(base64, file.name);
      setEredmeny(res);
    } catch {
      toast.error("Nem sikerült feldolgozni a kontókivonatot — ellenőrizd a fájlformátumot.");
      setOpen(false);
    } finally {
      setFeltoltve(false);
    }
  }

  function markKonyvelve(kulcsok: string[]) {
    setKonyveltek((prev) => new Set([...prev, ...kulcsok]));
    onChanged();
  }

  async function mindElfogadasa(autoParositasok: KivonatParositas[]) {
    const tetelek = autoParositasok.map((p) => ({ tranzakcio: p.tranzakcio, szamlaIdk: p.kivalasztottIdk }));
    if (tetelek.length === 0) return;
    try {
      const res = await fogadjaElParositasokat(tetelek);
      toast.success(
        `${res.sikeres} számla fizetve-nek jelölve.${res.marKonyvelt ? ` ${res.marKonyvelt} utalás már le volt könyvelve.` : ""}`
      );
      markKonyvelve(autoParositasok.map((p) => p.tranzakcio.kulcs));
    } catch {
      toast.error("Nem sikerült könyvelni.");
    }
  }

  const osszes = eredmeny?.parositasok ?? [];
  const hatralevo = osszes.filter((p) => !konyveltek.has(p.tranzakcio.kulcs));
  const autoLista = hatralevo.filter((p) => p.allapot === "auto");
  const reviewLista = hatralevo.filter((p) => p.allapot === "review");
  const marKonyveltLista = osszes.filter((p) => p.allapot === "konyvelt");
  const egyebLista = osszes.filter((p) => p.allapot === "egyeb");

  return (
    <>
      <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleFile} />
      <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
        <UploadIcon className="h-3.5 w-3.5" /> Kontókivonat feltöltés
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Kontókivonat párosítás</DialogTitle>
          </DialogHeader>

          {feltoltve && <div className="py-8 text-center text-sm text-muted-foreground">Feldolgozás…</div>}

          {!feltoltve && eredmeny && (
            <div className="flex flex-col gap-5">
              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                <div className="font-medium text-foreground">{eredmeny.fajlNev}</div>
                <div>
                  {eredmeny.tranzakcioSzam} tranzakció
                  {eredmeny.datumtol && eredmeny.datumig ? ` · ${eredmeny.datumtol} – ${eredmeny.datumig}` : ""}
                  {" · "}
                  {osszes.length} bevétel, {eredmeny.kihagyottKiadas} kiadás és {eredmeny.kihagyottKartya} kártyás tétel kihagyva
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  Automatikusan párosítva
                  <Badge className="bg-success/15 text-success hover:bg-success/15">{autoLista.length}</Badge>
                </div>
                {autoLista.length === 0 && (
                  <div className="text-sm text-muted-foreground">Nincs automatikusan párosítható tétel.</div>
                )}
                {autoLista.map((p) => (
                  <ParositasKartya
                    key={p.tranzakcio.kulcs}
                    parositas={p}
                    onKonyvelve={() => markKonyvelve([p.tranzakcio.kulcs])}
                  />
                ))}
              </div>

              <Szakasz
                cim="Kézi ellenőrzés szükséges"
                badgeClass="bg-warning/15 text-warning hover:bg-warning/15"
                lista={reviewLista}
                onKonyvelve={(k) => markKonyvelve([k])}
              />
              <Szakasz
                cim="Már könyvelve"
                badgeClass="bg-muted text-muted-foreground hover:bg-muted"
                lista={marKonyveltLista}
                onKonyvelve={(k) => markKonyvelve([k])}
                osszecsukott
              />
              <Szakasz
                cim="Nem vevői befizetés / nincs nyitott számla"
                badgeClass="bg-muted text-muted-foreground hover:bg-muted"
                lista={egyebLista}
                onKonyvelve={(k) => markKonyvelve([k])}
                osszecsukott
              />

              {autoLista.length > 0 && (
                <div className="sticky bottom-0 flex items-center justify-between border-t bg-background pt-3">
                  <div className="text-xs text-muted-foreground">
                    {autoLista.length} automatikus párosítás kész elfogadásra
                  </div>
                  <Button onClick={() => mindElfogadasa(autoLista)}>Mind elfogadása ({autoLista.length})</Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
