"use client";

import { useEffect, useState } from "react";
import { Delete } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getSiteSnapshot, recordInventoryCount, recordSzetvalogatas } from "@/lib/keszlet/actions";

// A telepi mobil nézet saját, ujjra méretezett párbeszédei: nagy csempék és
// számbillentyűzet, mert a raktárban (kesztyűben, egy kézzel) a rendszer
// szám-beviteli mezője pontatlan. A desktop Készlet modul megosztott
// komponenseit (MovementForm, InventoryDialog) szándékosan nem érintik.

function Billentyuzet({
  ertek,
  onChange,
}: {
  ertek: string;
  onChange: (uj: string) => void;
}) {
  function nyom(gomb: string) {
    if (gomb === "torol") {
      onChange(ertek.slice(0, -1));
      return;
    }
    if (ertek.length >= 6) return;
    // Vezető nulla nem kell: "0" után rögtön a beírt számjegy jön.
    onChange(ertek === "0" ? gomb : ertek + gomb);
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => nyom(n)}
          className="rounded-xl border border-[var(--mob-border)] bg-[var(--mob-card)] py-3.5 text-xl font-semibold active:bg-[var(--mob-tile)]"
        >
          {n}
        </button>
      ))}
      <button
        type="button"
        onClick={() => nyom("torol")}
        className="col-span-2 flex items-center justify-center rounded-xl border border-[var(--mob-border)] bg-[var(--mob-card)] py-3.5 active:bg-[var(--mob-tile)]"
        aria-label="Törlés"
      >
        <Delete className="h-5 w-5" />
      </button>
    </div>
  );
}

function Csempe({
  cim,
  ertek,
  aktiv,
  onClick,
}: {
  cim: string;
  ertek?: number;
  aktiv: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border-2 px-2.5 py-2 text-left",
        aktiv
          ? "border-[var(--mob-accent)] bg-[var(--mob-tile)]"
          : "border-[var(--mob-border)] bg-[var(--mob-card)]"
      )}
    >
      <div className="text-[11px] leading-tight text-[var(--mob-muted)]">{cim}</div>
      <div className="text-lg font-bold tabular-nums">{ertek ? ertek : "–"}</div>
    </button>
  );
}

/**
 * Szétválogatás: a vegyes halomból (Vegyes EUR / Vegyes) típusokra bontás.
 * Előbb típust választasz a csempék közül, majd a billentyűzeten beírod a
 * darabszámot; a fejléc mutatja, mennyi maradt még szétválogatlanul.
 */
export function MobilSzetvalogatas({
  site,
  source,
  keszlet,
  celok,
  open,
  onOpenChange,
  onRecorded,
}: {
  site: string;
  source: string;
  keszlet: number;
  celok: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecorded: () => void | Promise<void>;
}) {
  const [valasztott, setValasztott] = useState<string | null>(null);
  const [ertekek, setErtekek] = useState<Record<string, number>>({});
  const [mentes, setMentes] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValasztott(null);
    setErtekek({});
  }, [open]);

  const osszes = Object.values(ertekek).reduce((s, q) => s + q, 0);
  const marad = keszlet - osszes;
  const beirt = valasztott ? String(ertekek[valasztott] ?? "") : "";

  function billentyu(uj: string) {
    if (!valasztott) return;
    setErtekek((prev) => {
      const kov = { ...prev };
      if (uj === "") delete kov[valasztott];
      else kov[valasztott] = Number(uj);
      return kov;
    });
  }

  async function mentsd() {
    const tetelek = Object.entries(ertekek)
      .filter(([, qty]) => qty > 0)
      .map(([type, qty]) => ({ type, qty }));
    if (tetelek.length === 0 || marad < 0) return;
    setMentes(true);
    try {
      await recordSzetvalogatas({ site, source, items: tetelek });
      await onRecorded();
      toast.success(`${osszes} db ${source} szétválogatva.`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nem sikerült rögzíteni.");
    } finally {
      setMentes(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">{source} szétválogatása</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg bg-[var(--mob-tile)] px-3 py-2 text-sm">
            <span className="text-[var(--mob-muted)]">Szétválogatva {osszes} db</span>
            <span className={cn("font-semibold tabular-nums", marad < 0 && "text-[var(--mob-negative)]")}>
              marad {marad} db
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {celok.map((cel) => (
              <Csempe
                key={cel}
                cim={cel}
                ertek={ertekek[cel]}
                aktiv={valasztott === cel}
                onClick={() => setValasztott(cel)}
              />
            ))}
          </div>

          {valasztott ? (
            <>
              <div className="flex items-center justify-between px-1 text-sm">
                <span className="font-medium">{valasztott}</span>
                <span className="text-xl font-bold tabular-nums">{beirt || "0"}</span>
              </div>
              <Billentyuzet ertek={beirt} onChange={billentyu} />
            </>
          ) : (
            <p className="px-1 text-sm text-[var(--mob-muted)]">
              Koppints arra a típusra, amiből kiválogattál, aztán írd be a darabszámot.
            </p>
          )}

          {marad < 0 && (
            <p className="text-xs text-[var(--mob-negative)]">
              Több van beírva, mint amennyi {source} a telepen van ({keszlet} db).
            </p>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={mentes}>
              Mégse
            </Button>
            <Button className="flex-1" onClick={mentsd} disabled={osszes === 0 || marad < 0 || mentes}>
              {mentes ? "Mentés…" : "Mentés"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Leltár: típust választasz a csempék közül (rajta a nyilvántartott darab),
 * beírod a megszámoltat, és a rendszer kiírja az eltérést. A korrekciót a
 * szerver számolja a friss készletből (recordInventoryCount) — itt csak az
 * látszik, amit a dolgozó lát.
 */
export function MobilLeltar({
  site,
  types,
  keszlet,
  open,
  onOpenChange,
  onRecorded,
}: {
  site: string;
  types: string[];
  keszlet: Record<string, number>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecorded: () => void | Promise<void>;
}) {
  const [friss, setFriss] = useState<Record<string, number> | null>(null);
  const [valasztott, setValasztott] = useState<string | null>(null);
  const [szamolt, setSzamolt] = useState("");
  const [kesz, setKesz] = useState<string[]>([]);
  const [mentes, setMentes] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValasztott(null);
    setSzamolt("");
    setKesz([]);
    setFriss(null);
    let mounted = true;
    getSiteSnapshot(site)
      .then((snap) => {
        if (mounted) setFriss(snap.stock);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [open, site]);

  const allomany = friss ?? keszlet;
  const nyilvantartott = valasztott ? (allomany[valasztott] ?? 0) : 0;
  const szamoltSzam = szamolt === "" ? null : Number(szamolt);
  const elteres = szamoltSzam === null ? 0 : szamoltSzam - nyilvantartott;

  async function rogzitsd() {
    if (!valasztott || szamoltSzam === null) return;
    setMentes(true);
    try {
      const eredmeny = await recordInventoryCount({
        site,
        type: valasztott,
        countedQty: szamoltSzam,
        accepted: true,
      });
      setFriss((prev) => ({ ...(prev ?? keszlet), [valasztott]: eredmeny.countedQty }));
      setKesz((prev) => (prev.includes(valasztott) ? prev : [...prev, valasztott]));
      toast.success(
        eredmeny.diff === 0
          ? `${valasztott}: nincs eltérés (${eredmeny.countedQty} db).`
          : `${valasztott}: készlet javítva ${eredmeny.countedQty} db-ra.`
      );
      setValasztott(null);
      setSzamolt("");
      await onRecorded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nem sikerült rögzíteni.");
    } finally {
      setMentes(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Leltár — {site}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {valasztott === null ? (
            <>
              <p className="px-1 text-sm text-[var(--mob-muted)]">
                Koppints arra a típusra, amit megszámoltál. Nem kell mindet végignézni.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {types.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setValasztott(t)}
                    className={cn(
                      "rounded-xl border-2 px-2.5 py-2 text-left",
                      kesz.includes(t)
                        ? "border-[var(--mob-accent)] bg-[var(--mob-tile)]"
                        : "border-[var(--mob-border)] bg-[var(--mob-card)]"
                    )}
                  >
                    <div className="text-[11px] leading-tight text-[var(--mob-muted)]">{t}</div>
                    <div className="text-lg font-bold tabular-nums">{allomany[t] ?? 0}</div>
                    {kesz.includes(t) && (
                      <div className="text-[10px] text-[var(--mob-accent)]">megszámolva</div>
                    )}
                  </button>
                ))}
              </div>
              <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
                Kész
              </Button>
            </>
          ) : (
            <>
              <div className="rounded-lg bg-[var(--mob-tile)] px-3 py-2">
                <div className="text-sm font-medium">{valasztott}</div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--mob-muted)]">Nyilvántartott: {nyilvantartott} db</span>
                  <span
                    className={cn(
                      "font-semibold tabular-nums",
                      elteres > 0 && "text-[var(--mob-positive)]",
                      elteres < 0 && "text-[var(--mob-negative)]"
                    )}
                  >
                    {szamoltSzam === null
                      ? "—"
                      : elteres === 0
                        ? "nincs eltérés"
                        : `${elteres > 0 ? "+" : "−"}${Math.abs(elteres)} db`}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between px-1 text-sm">
                <span className="text-[var(--mob-muted)]">Megszámolt</span>
                <span className="text-2xl font-bold tabular-nums">{szamolt || "0"}</span>
              </div>
              <Billentyuzet ertek={szamolt} onChange={setSzamolt} />

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setValasztott(null);
                    setSzamolt("");
                  }}
                  disabled={mentes}
                >
                  Vissza
                </Button>
                <Button className="flex-1" onClick={rogzitsd} disabled={szamoltSzam === null || mentes}>
                  {mentes ? "Mentés…" : "Rögzítés"}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
