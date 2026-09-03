"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
  getAllTypesAdmin,
  updateTypePrice,
  setTypeSiteActive,
  type TypeAdminRow,
} from "@/lib/keszlet/actions";
import { SITES } from "@/lib/nav";

export default function TipusokAdminPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TypeAdminRow[]>([]);
  const [priceInputs, setPriceInputs] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    const data = await getAllTypesAdmin();
    setRows(data);
    const inputs: Record<number, string> = {};
    for (const r of data) inputs[r.id] = r.default_price?.toString() ?? "";
    setPriceInputs(inputs);
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  async function savePrice(id: number) {
    const raw = priceInputs[id] ?? "";
    const price = raw.trim() === "" ? null : Number(raw);
    if (price !== null && (Number.isNaN(price) || price < 0)) {
      toast.error("Érvénytelen ár.");
      return;
    }
    try {
      await updateTypePrice(id, price);
      await load();
      toast.success("Ár mentve.");
    } catch {
      toast.error("Nem sikerült menteni.");
    }
  }

  async function toggleSite(typeId: number, site: string, active: boolean) {
    // Optimista frissítés, hogy ne ugráljon a pipa.
    setRows((prev) =>
      prev.map((r) =>
        r.id === typeId
          ? {
              ...r,
              sites: active ? [...r.sites, site] : r.sites.filter((s) => s !== site),
            }
          : r
      )
    );
    try {
      await setTypeSiteActive(typeId, site, active);
    } catch {
      toast.error("Nem sikerült menteni.");
      await load();
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Típusok és árak" subtitle="Admin beállítás" />
        <p className="text-sm text-muted-foreground">Betöltés…</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Típusok és árak"
        subtitle="Minden raklap- és eszköztípus, irányár, és hogy melyik telephelyen aktív"
      />

      <Card>
        <CardContent className="pt-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Típus</TableHead>
                <TableHead className="w-36">Ár (Ft/db)</TableHead>
                {SITES.map((s) => (
                  <TableHead key={s} className="text-center">
                    {s}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      className="h-8 w-28"
                      placeholder="—"
                      value={priceInputs[r.id] ?? ""}
                      onChange={(e) =>
                        setPriceInputs((prev) => ({ ...prev, [r.id]: e.target.value }))
                      }
                      onBlur={() => savePrice(r.id)}
                    />
                  </TableCell>
                  {SITES.map((s) => (
                    <TableCell key={s} className="text-center">
                      <Checkbox
                        checked={r.sites.includes(s)}
                        onCheckedChange={(checked) => toggleSite(r.id, s, checked === true)}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
