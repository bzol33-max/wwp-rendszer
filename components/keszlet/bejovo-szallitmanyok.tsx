"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Truck } from "lucide-react";
import { toast } from "sonner";
import { acceptIncomingMovement, type IncomingRow } from "@/lib/keszlet/actions";
import { useCanEdit } from "@/components/auth/edit-permission-context";

/**
 * "Beérkező szállítmányok" — a telephelyek közti mozgatás cél oldala.
 *
 * A küldő telep készletéből a mennyiség azonnal lekerül (ami felment a
 * kocsira, az már nincs ott), a fogadóéba viszont csak az itteni átvétel
 * ("okézás") után kerül be. Addig a tétel úton van: itt látszik, de még
 * egyik telep készletében sincs benne.
 *
 * Ugyanez a kártya fut az asztali Készlet modulban és a dolgozói mobil
 * nézetben (/erkezes Készlet csempe) is.
 */
export function BejovoSzallitmanyok({
  rows,
  onAccepted,
}: {
  rows: IncomingRow[];
  onAccepted: () => void | Promise<void>;
}) {
  const canEdit = useCanEdit();
  const [folyamatban, setFolyamatban] = useState<string | null>(null);

  if (rows.length === 0) return null;

  async function atvesz(row: IncomingRow) {
    setFolyamatban(row.id);
    try {
      await acceptIncomingMovement(row.id);
      await onAccepted();
      toast.success(`Átvéve: ${row.qty} db ${row.type}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nem sikerült átvenni.");
    } finally {
      setFolyamatban(null);
    }
  }

  return (
    <Card className="border-warning/40 bg-warning/5 lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Truck className="h-4 w-4 text-warning" />
          Beérkező szállítmány ({rows.length})
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Úton lévő tételek másik telephelyről. A készletbe az átvétel után kerülnek.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2"
          >
            <div className="min-w-0 text-sm">
              <div className="font-medium">
                {row.qty} db {row.type}
              </div>
              <div className="text-xs text-muted-foreground">
                innen: {row.from_site ?? "ismeretlen telephely"} · {row.date}
                {row.created_by ? ` · ${row.created_by}` : ""}
              </div>
            </div>
            {canEdit && (
              <Button
                size="sm"
                disabled={folyamatban !== null}
                onClick={() => atvesz(row)}
              >
                {folyamatban === row.id ? "Átvétel…" : "Átvétel"}
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
