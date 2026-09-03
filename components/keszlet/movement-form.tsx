"use client";

import { useEffect, useState } from "react";
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
import { recordMovement, type Direction } from "@/lib/keszlet/actions";

/**
 * Megosztott "Mozgás rögzítése" kártya (Beérkezés / Kiszállítás / Telephelyek
 * közti mozgatás) — Nyíregyháza, Szakoly és Balkány fülön egységesen ugyanez
 * a komponens rögzíti a mozgásokat, hogy mindhárom telepről lehessen a másik
 * kettő felé átszállítani.
 */
export function MovementForm({
  site,
  types,
  otherSites,
  onRecorded,
}: {
  site: string;
  types: string[];
  otherSites: string[];
  onRecorded: () => void | Promise<void>;
}) {
  const [direction, setDirection] = useState<Direction>("be");
  const [type, setType] = useState("");
  const [qty, setQty] = useState("");
  const [partner, setPartner] = useState("");
  const [targetSite, setTargetSite] = useState(otherSites[0] ?? "");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setType((prev) => (prev && types.includes(prev) ? prev : types[0] ?? ""));
  }, [types]);

  useEffect(() => {
    setTargetSite((prev) => (prev && otherSites.includes(prev) ? prev : otherSites[0] ?? ""));
  }, [otherSites]);

  async function submit() {
    const n = Number(qty);
    if (!n || n <= 0) {
      toast.error("Adj meg érvényes darabszámot.");
      return;
    }
    if (!type) {
      toast.error("Válassz típust.");
      return;
    }
    if (direction !== "mozgatas" && !partner.trim()) {
      toast.error("A partner megadása kötelező.");
      return;
    }
    if (direction === "mozgatas" && !targetSite) {
      toast.error("Válaszd ki, hová megy a szállítmány.");
      return;
    }
    setSubmitting(true);
    try {
      await recordMovement({
        site,
        type,
        direction,
        qty: n,
        partner: direction === "mozgatas" ? undefined : partner,
        targetSite: direction === "mozgatas" ? targetSite : undefined,
      });
      setQty("");
      setPartner("");
      await onRecorded();
      toast.success("Mozgás rögzítve.");
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
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["be", "Beérkezés"],
              ["ki", "Kiszállítás"],
              ["mozgatas", "Telephelyek közti mozgatás"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setDirection(value)}
              className={cn(
                "rounded-md border px-2 py-2 text-xs font-medium transition-colors",
                direction === value
                  ? "border-primary bg-accent text-accent-foreground"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Típus</Label>
            <Select value={type} onValueChange={(v) => v && setType(v)}>
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
          <div className="space-y-1.5">
            <Label>Darabszám</Label>
            <Input
              type="number"
              placeholder="pl. 33"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
        </div>

        {direction !== "mozgatas" ? (
          <div className="space-y-1.5">
            <Label>Partner</Label>
            <Input
              placeholder="Partner neve"
              value={partner}
              onChange={(e) => setPartner(e.target.value)}
            />
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label>Hová</Label>
            <Select value={targetSite} onValueChange={(v) => v && setTargetSite(v)}>
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

        <Button onClick={submit} disabled={submitting} className="w-full sm:w-auto">
          {submitting ? "Mentés…" : "Mentés"}
        </Button>
      </CardContent>
    </Card>
  );
}
