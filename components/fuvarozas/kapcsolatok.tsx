"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { X } from "lucide-react";
import { deleteKapcsolat, getKapcsolatok, seedKapcsolatok } from "@/lib/fuvarozas/kapcsolatok";
import type { KapcsolatRow } from "@/lib/fuvarozas/kapcsolatok-constants";

export function Kapcsolatok() {
  const [rows, setRows] = useState<KapcsolatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    const data = await getKapcsolatok();
    setRows(data);
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  async function handleSeed() {
    setSeeding(true);
    try {
      const result = await seedKapcsolatok();
      if (result.skipped) {
        toast.error("Már vannak kapcsolatok — a feltöltés csak üres listánál fut le.");
      } else {
        toast.success(`${result.inserted} kapcsolat feltöltve.`);
      }
      await load();
    } catch {
      toast.error("Nem sikerült feltölteni.");
    } finally {
      setSeeding(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteKapcsolat(id);
    await load();
    toast.success("Kapcsolat törölve.");
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Kapcsolatok</CardTitle>
          {!loading && rows.length === 0 && (
            <Button size="sm" variant="outline" disabled={seeding} onClick={handleSeed}>
              {seeding ? "Feltöltés…" : "Feltöltés a megbízásokból"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cég</TableHead>
                <TableHead>Kapcsolattartó</TableHead>
                <TableHead>Telefon</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Még nincs rögzített kapcsolat.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.ceg}</TableCell>
                  <TableCell>{row.kapcsolattarto ?? "—"}</TableCell>
                  <TableCell className="whitespace-normal break-words">
                    {row.telefon ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-normal break-words">
                    {row.email ?? "—"}
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => handleDelete(row.id)}
                      title="Törlés"
                      className="text-destructive/70 hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
