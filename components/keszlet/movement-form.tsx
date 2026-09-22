"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getPartnerJavaslatok, recordMovements, type Direction } from "@/lib/keszlet/actions";
import { useCanEdit } from "@/components/auth/edit-permission-context";

type Sor = { key: number; type: string; qty: string; targetSite: string; unitPrice: string };

const DIRECTION_OPTIONS: readonly [Direction, string][] = [
  ["be", "Beérkezés"],
  ["ki", "Kiszállítás"],
  ["mozgatas", "Telephelyek közti mozgatás"],
];

const AFA_KULCS = 0.27;

let nextKey = 1;
function ujSor(type: string, targetSite: string): Sor {
  return { key: nextKey++, type, qty: "", targetSite, unitPrice: "" };
}

/**
 * Megosztott "Mozgás rögzítése" kártya (Beérkezés / Kiszállítás / Telephelyek
 * közti mozgatás) — Nyíregyháza, Szakoly és Balkány fülön egységesen ugyanez
 * a komponens rögzíti a mozgásokat, hogy mindhárom telepről lehessen a másik
 * kettő felé átszállítani. Egy mentésen belül több típus (soronként külön
 * darabszámmal) is rögzíthető, ugyanahhoz a partnerhez; mozgatásnál a cél
 * telephely is SORONKÉNT eltérő lehet (pl. egy típus Szakolyra, egy másik
 * Balkányra, egy mentésben).
 */
export function MovementForm({
  site,
  types,
  otherSites,
  onRecorded,
  allowTransfer = true,
  allowSale = false,
  fixedDirection,
}: {
  site: string;
  types: string[];
  otherSites: string[];
  onRecorded: () => void | Promise<void>;
  /** Korlátozott (mobil) nézeteken kikapcsolható, ha csak Be/Ki rögzítés kell. */
  allowTransfer?: boolean;
  /**
   * Ha meg van adva, az irány rögzített és a választósáv eltűnik — a telepi
   * mobil nézet külön "Beérkezés" és "Kiadás" gombbal nyitja meg az űrlapot,
   * ott már eldőlt, melyikről van szó. A komponenst a hívó minden
   * megnyitáskor újra csatolja, ezért elég a kezdőértéknek adni.
   */
  fixedDirection?: Direction;
  /**
   * Eladás (helyben, készpénzért): a Kiszállítás / Eladás irányhoz soronként
   * Ft/db ár is megadható, és az ellenérték a kasszába kerül. Csak
   * Nyíregyházán van bekapcsolva — kassza is csak ott van.
   */
  allowSale?: boolean;
}) {
  const canEdit = useCanEdit();
  const [direction, setDirection] = useState<Direction>(fixedDirection ?? "be");
  const [sorok, setSorok] = useState<Sor[]>([ujSor(types[0] ?? "", otherSites[0] ?? "")]);
  const [partner, setPartner] = useState("");
  // Partnernév-javaslatok: a lista egyszer töltődik le (számlák vevői +
  // korábban beírt partnerek), a szűrés gépelés közben itt történik.
  const [partnerek, setPartnerek] = useState<string[]>([]);
  const [javaslatNyitva, setJavaslatNyitva] = useState(false);
  const [afa, setAfa] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Legfeljebb 8 találat: a névvel kezdődők előre, utána a névben bárhol
  // egyezők. Két karaktertől ajánlunk, hogy ne az egész lista ugorjon fel.
  const javaslatok = (() => {
    const keresett = partner.trim().toLowerCase();
    if (keresett.length < 2) return [];
    if (partnerek.some((n) => n.toLowerCase() === keresett)) return [];
    const eleje = partnerek.filter((n) => n.toLowerCase().startsWith(keresett));
    const benne = partnerek.filter(
      (n) => !n.toLowerCase().startsWith(keresett) && n.toLowerCase().includes(keresett)
    );
    return [...eleje, ...benne].slice(0, 8);
  })();

  // Az árak csak a Kiszállítás / Eladás irányban jelennek meg.
  const eladasLehet = allowSale && direction === "ki";
  const netto = eladasLehet
    ? sorok.reduce((sum, s) => sum + (Number(s.qty) || 0) * (Number(s.unitPrice) || 0), 0)
    : 0;
  const brutto = afa ? Math.round(netto * (1 + AFA_KULCS)) : netto;

  useEffect(() => {
    let mounted = true;
    getPartnerJavaslatok()
      .then((nevek) => {
        if (mounted) setPartnerek(nevek);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setSorok((prev) =>
      prev.map((s) => (s.type && types.includes(s.type) ? s : { ...s, type: types[0] ?? "" }))
    );
  }, [types]);

  useEffect(() => {
    setSorok((prev) =>
      prev.map((s) =>
        s.targetSite && otherSites.includes(s.targetSite)
          ? s
          : { ...s, targetSite: otherSites[0] ?? "" }
      )
    );
  }, [otherSites]);

  function updateSor(key: number, patch: Partial<Sor>) {
    setSorok((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function addSor() {
    // Alapértelmezésben egy még nem használt típust ajánl fel, ha van ilyen.
    const hasznaltak = new Set(sorok.map((s) => s.type));
    const kovetkezo = types.find((t) => !hasznaltak.has(t)) ?? types[0] ?? "";
    setSorok((prev) => [...prev, ujSor(kovetkezo, otherSites[0] ?? "")]);
  }

  function removeSor(key: number) {
    setSorok((prev) => (prev.length > 1 ? prev.filter((s) => s.key !== key) : prev));
  }

  async function submit() {
    const items: { type: string; qty: number; targetSite?: string; unitPrice?: number }[] = [];
    for (const s of sorok) {
      const n = Number(s.qty);
      const ar = s.unitPrice === "" ? undefined : Number(s.unitPrice);
      if (eladasLehet && ar !== undefined && (!Number.isInteger(ar) || ar < 0)) {
        toast.error(`Érvénytelen egységár ehhez: ${s.type || "típus"}.`);
        return;
      }
      if (!s.qty && sorok.length === 1) {
        toast.error("Adj meg érvényes darabszámot.");
        return;
      }
      if (!s.qty) continue; // üresen hagyott sor kihagyva, ha van másik kitöltött
      if (!Number.isInteger(n) || n <= 0) {
        toast.error(`Érvénytelen darabszám ehhez: ${s.type || "típus"}. Csak egész szám adható meg.`);
        return;
      }
      if (!s.type) {
        toast.error("Válassz típust minden sorhoz.");
        return;
      }
      if (direction === "mozgatas" && !s.targetSite) {
        toast.error(`Válaszd ki, hová megy ez a tétel: ${s.type}.`);
        return;
      }
      items.push({
        type: s.type,
        qty: n,
        targetSite: direction === "mozgatas" ? s.targetSite : undefined,
        unitPrice: eladasLehet ? ar : undefined,
      });
    }
    if (items.length === 0) {
      toast.error("Adj meg legalább egy típust és darabszámot.");
      return;
    }
    if (direction !== "mozgatas" && !partner.trim()) {
      toast.error("A partner megadása kötelező.");
      return;
    }
    setSubmitting(true);
    try {
      await recordMovements({
        site,
        direction,
        items,
        partner: direction === "mozgatas" ? undefined : partner,
        afa: eladasLehet ? afa : undefined,
      });
      setSorok([ujSor(types[0] ?? "", otherSites[0] ?? "")]);
      setPartner("");
      setAfa(false);
      await onRecorded();
      toast.success(
        netto > 0
          ? `Eladás rögzítve — ${brutto.toLocaleString("hu-HU")} Ft a kasszába.`
          : items.length > 1
            ? `${items.length} típus rögzítve.`
            : "Mozgás rögzítve."
      );
    } catch {
      toast.error("Nem sikerült menteni. Próbáld újra.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          {fixedDirection
            ? (DIRECTION_OPTIONS.find(([value]) => value === fixedDirection)?.[1] ?? "Mozgás rögzítése")
            : "Mozgás rögzítése"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!fixedDirection && (
        <div className={cn("grid gap-2", allowTransfer ? "grid-cols-3" : "grid-cols-2")}>
          {DIRECTION_OPTIONS.filter(([value]) => allowTransfer || value !== "mozgatas").map(
            ([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setDirection(value)}
                className={cn(
                  "rounded-md border px-2 py-2 text-xs font-medium transition-colors max-md:min-h-11",
                  direction === value
                    ? "border-primary bg-accent text-accent-foreground"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                {allowSale && value === "ki" ? "Kiszállítás / Eladás" : label}
              </button>
            )
          )}
        </div>
        )}

        <div className="space-y-2">
          {sorok.map((sor, i) => (
            <div
              key={sor.key}
              className={cn(
                "grid items-end gap-2",
                direction === "mozgatas"
                  ? "grid-cols-1 sm:grid-cols-[1fr_5.5rem_1fr_auto]"
                  : eladasLehet
                    ? "grid-cols-[1fr_5rem_6rem_auto]"
                    : "grid-cols-[1fr_auto_auto]"
              )}
            >
              <div className="space-y-1.5">
                {i === 0 && <Label>Típus</Label>}
                <Select value={sor.type} onValueChange={(v) => v && updateSor(sor.key, { type: v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {types.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div
                className={cn("space-y-1.5", direction !== "mozgatas" && !eladasLehet && "w-24")}
              >
                {i === 0 && <Label>Darabszám</Label>}
                <Input
                  type="number"
                  placeholder="pl. 33"
                  value={sor.qty}
                  onChange={(e) => updateSor(sor.key, { qty: e.target.value })}
                />
              </div>
              {eladasLehet && (
                <div className="space-y-1.5">
                  {i === 0 && <Label>Ft/db</Label>}
                  <Input
                    type="number"
                    placeholder="—"
                    value={sor.unitPrice}
                    onChange={(e) => updateSor(sor.key, { unitPrice: e.target.value })}
                  />
                </div>
              )}
              {direction === "mozgatas" && (
                <div className="space-y-1.5">
                  {i === 0 && <Label>Hová</Label>}
                  <Select
                    value={sor.targetSite}
                    onValueChange={(v) => v && updateSor(sor.key, { targetSite: v })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {otherSites.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={sorok.length === 1}
                onClick={() => removeSor(sor.key)}
                title="Sor törlése"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addSor}
            disabled={sorok.length >= types.length}
            className="w-full sm:w-auto"
          >
            <Plus className="h-3.5 w-3.5" />
            Típus hozzáadása
          </Button>
        </div>

        {eladasLehet && (
          // Az ár üresen hagyható: akkor ez sima kiszállítás, pénzmozgás nélkül.
          <div className="space-y-2 rounded-md border bg-muted/30 px-3 py-2.5">
            <label className="flex items-center gap-2 text-sm max-md:min-h-11">
              <input
                type="checkbox"
                checked={afa}
                onChange={(e) => setAfa(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              + ÁFA (27%)
            </label>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{afa ? "Nettó" : "Eladási összeg"}</span>
              <span className="font-medium tabular-nums">
                {netto.toLocaleString("hu-HU")} Ft
              </span>
            </div>
            {afa && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Fizetendő (bruttó)</span>
                <span className="font-semibold tabular-nums">
                  {brutto.toLocaleString("hu-HU")} Ft
                </span>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              {netto > 0
                ? `A készletből levonjuk, ${brutto.toLocaleString("hu-HU")} Ft pedig bevételként a kasszába kerül.`
                : "Ár nélkül ez sima kiszállítás — a kassza nem változik."}
            </p>
          </div>
        )}

        {direction !== "mozgatas" && (
          <div className="space-y-1.5">
            <Label>{eladasLehet ? "Partner / vevő" : "Partner"}</Label>
            <div className="relative">
              <Input
                placeholder={eladasLehet ? "Kinek adtuk el" : "Partner neve"}
                value={partner}
                autoComplete="off"
                onChange={(e) => {
                  setPartner(e.target.value);
                  setJavaslatNyitva(true);
                }}
                onFocus={() => setJavaslatNyitva(true)}
                // Koppintásnál a blur előbb fut, mint a kattintás — kis
                // késleltetés nélkül a javaslat eltűnne a választás előtt.
                onBlur={() => window.setTimeout(() => setJavaslatNyitva(false), 150)}
              />
              {javaslatNyitva && javaslatok.length > 0 && (
                <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
                  {javaslatok.map((nev) => (
                    <li key={nev}>
                      <button
                        type="button"
                        className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                        onClick={() => {
                          setPartner(nev);
                          setJavaslatNyitva(false);
                        }}
                      >
                        {nev}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {!canEdit && (
          <p className="text-xs text-muted-foreground">
            Csak megtekintési jogosultságod van ehhez a modulhoz.
          </p>
        )}
        <Button
          onClick={submit}
          disabled={submitting || !canEdit}
          className="w-full sm:w-auto"
        >
          {submitting ? "Mentés…" : "Mentés"}
        </Button>
      </CardContent>
    </Card>
  );
}
