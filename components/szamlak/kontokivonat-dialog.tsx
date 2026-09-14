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

/** Egy párosítás-kártya (automatikus vagy kézi ellenőrzésre váró tétel) a review-listában. */
function ParositasKartya({
  parositas,
  onKonyvelve,
}: {
  parositas: KivonatParositas;
  onKonyvelve: () => void;
}) {
  const [folyamatban, setFolyamatban] = useState(false);
  const [kivalasztott, setKivalasztott] = useState<Set<string>>(
    () => new Set(parositas.allapot === "auto" ? parositas.szamlak.map((s) => s.id) : [])
  );

  const auto = parositas.allapot === "auto";

  async function konyvel(ids: string[]) {
    if (ids.length === 0) return;
    setFolyamatban(true);
    try {
      await fogadjaElParositasokat(ids);
      toast.success(`${ids.length} számla fizetve-nek jelölve.`);
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

  return (
    <div
      className={`grid grid-cols-1 gap-2 rounded-md border-l-4 bg-card p-3 text-sm shadow-sm sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-4 ${
        auto ? "border-l-success" : "border-l-warning"
      }`}
    >
      <div className="min-w-0">
        <div className="truncate font-medium" title={parositas.tranzakcio.partnerNev}>
          {parositas.tranzakcio.partnerNev}
        </div>
        <div className="text-xs text-muted-foreground">
          {parositas.tranzakcio.datum}
          {parositas.megjegyzes && <span className="italic"> · {parositas.megjegyzes}</span>}
        </div>
        {parositas.tranzakcio.memo && (
          <div className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            &quot;{parositas.tranzakcio.memo}&quot;
          </div>
        )}
        <div className="mt-1 flex flex-wrap gap-1">
          {parositas.szamlak.length === 0 && (
            <span className="text-xs text-destructive">nincs nyitott számla ehhez a vevőhöz</span>
          )}
          {parositas.szamlak.map((sz) => (
            <label
              key={sz.id}
              className={`flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${
                kivalasztott.has(sz.id) ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
              }`}
            >
              {!auto && (
                <input
                  type="checkbox"
                  className="h-3 w-3"
                  checked={kivalasztott.has(sz.id)}
                  onChange={() => toggle(sz.id)}
                />
              )}
              {sz.szamlaszam} ({formatOsszeg(sz.brutto, parositas.tranzakcio.penznem)})
            </label>
          ))}
        </div>
      </div>
      <div className="text-right text-base font-semibold tabular-nums sm:text-left">
        {formatOsszeg(parositas.tranzakcio.osszeg, parositas.tranzakcio.penznem)}
      </div>
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant={auto ? "default" : "secondary"}
          disabled={folyamatban || kivalasztott.size === 0}
          onClick={() => konyvel([...kivalasztott])}
        >
          {auto ? "Elfogad" : `Könyvel (${kivalasztott.size})`}
        </Button>
      </div>
    </div>
  );
}

export function KontokivonatDialog({ onChanged }: { onChanged: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [feltoltve, setFeltoltve] = useState(false);
  const [eredmeny, setEredmeny] = useState<KivonatEredmeny | null>(null);
  // A már lekönyvelt tranzakciók (azonosító alapján) eltűnnek a listából, hogy
  // ne lehessen ugyanazt a számlát véletlenül kétszer elfogadni.
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

  function markKonyvelve(azonositok: string[]) {
    setKonyveltek((prev) => new Set([...prev, ...azonositok]));
    onChanged();
  }

  async function mindElfogadasa(autoParositasok: KivonatParositas[]) {
    const ids = autoParositasok.flatMap((p) => p.szamlak.map((s) => s.id));
    if (ids.length === 0) return;
    try {
      const res = await fogadjaElParositasokat(ids);
      toast.success(`${res.sikeres} számla fizetve-nek jelölve.`);
      markKonyvelve(autoParositasok.map((p) => p.tranzakcio.azonosito));
    } catch {
      toast.error("Nem sikerült könyvelni.");
    }
  }

  const hatralevo = (eredmeny?.parositasok ?? []).filter(
    (p) => !konyveltek.has(p.tranzakcio.azonosito)
  );
  const autoLista = hatralevo.filter((p) => p.allapot === "auto");
  const reviewLista = hatralevo.filter((p) => p.allapot === "review");

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
                  {eredmeny.kihagyottKiadas} kiadás és {eredmeny.kihagyottKartya} kártyás tétel kihagyva
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
                    key={p.tranzakcio.azonosito}
                    parositas={p}
                    onKonyvelve={() => markKonyvelve([p.tranzakcio.azonosito])}
                  />
                ))}
              </div>

              {reviewLista.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    Kézi ellenőrzés szükséges
                    <Badge className="bg-warning/15 text-warning hover:bg-warning/15">{reviewLista.length}</Badge>
                  </div>
                  {reviewLista.map((p) => (
                    <ParositasKartya
                      key={p.tranzakcio.azonosito}
                      parositas={p}
                      onKonyvelve={() => markKonyvelve([p.tranzakcio.azonosito])}
                    />
                  ))}
                </div>
              )}

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
