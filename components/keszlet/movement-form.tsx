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
import { recordMovements, type Direction } from "@/lib/keszlet/actions";
import { getCurrentUser } from "@/lib/current-user";
import { useCanEdit } from "@/components/auth/edit-permission-context";

type Sor = { key: number; type: string; qty: string; targetSite: string };

const DIRECTION_OPTIONS: readonly [Direction, string][] = [
  ["be", "Beérkezés"],
  ["ki", "Kiszállítás"],
  ["mozgatas", "Telephelyek közti mozgatás"],
];

let nextKey = 1;
function ujSor(type: string, targetSite: string): Sor {
  return { key: nextKey++, type, qty: "", targetSite };
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
}: {
  site: string;
  types: string[];
  otherSites: string[];
  onRecorded: () => void | Promise<void>;
  /** Korlátozott (mobil) nézeteken kikapcsolható, ha csak Be/Ki rögzítés kell. */
  allowTransfer?: boolean;
}) {
  const canEdit = useCanEdit();
  const [direction, setDirection] = useState<Direction>("be");
  const [sorok, setSorok] = useState<Sor[]>([ujSor(types[0] ?? "", otherSites[0] ?? "")]);
  const [partner, setPartner] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
    const items: { type: string; qty: number; targetSite?: string }[] = [];
    for (const s of sorok) {
      const n = Number(s.qty);
      if (!s.qty && sorok.length === 1) {
        toast.error("Adj meg érvényes darabszámot.");
        return;
      }
      if (!s.qty) continue; // üresen hagyott sor kihagyva, ha van másik kitöltött
      if (!n || n <= 0) {
        toast.error(`Érvénytelen darabszám ehhez: ${s.type || "típus"}.`);
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
      items.push({ type: s.type, qty: n, targetSite: direction === "mozgatas" ? s.targetSite : undefined });
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
        createdBy: getCurrentUser() || undefined,
      });
      setSorok([ujSor(types[0] ?? "", otherSites[0] ?? "")]);
      setPartner("");
      await onRecorded();
      toast.success(
        items.length > 1 ? `${items.length} típus rögzítve.` : "Mozgás rögzítve."
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
        <CardTitle className="text-sm">Mozgás rögzítése</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
                {label}
              </button>
            )
          )}
        </div>

        <div className="space-y-2">
          {sorok.map((sor, i) => (
            <div
              key={sor.key}
              className={cn(
                "grid items-end gap-2",
                direction === "mozgatas"
                  ? "grid-cols-1 sm:grid-cols-[1fr_5.5rem_1fr_auto]"
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
              <div className={cn("space-y-1.5", direction !== "mozgatas" && "w-24")}>
                {i === 0 && <Label>Darabszám</Label>}
                <Input
                  type="number"
                  placeholder="pl. 33"
                  value={sor.qty}
                  onChange={(e) => updateSor(sor.key, { qty: e.target.value })}
                />
              </div>
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

        {direction !== "mozgatas" && (
          <div className="space-y-1.5">
            <Label>Partner</Label>
            <Input
              placeholder="Partner neve"
              value={partner}
              onChange={(e) => setPartner(e.target.value)}
            />
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
