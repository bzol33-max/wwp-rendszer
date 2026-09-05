"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ChevronDown, X } from "lucide-react";
import { addKapcsolat, deleteKapcsolat, getKapcsolatok, seedKapcsolatok } from "@/lib/fuvarozas/kapcsolatok";
import type { KapcsolatRow } from "@/lib/fuvarozas/kapcsolatok-constants";

type UjKapcsolatForm = {
  ceg: string;
  kapcsolattarto: string;
  telefon: string;
  email: string;
  megjegyzes: string;
};

function ujForm(): UjKapcsolatForm {
  return { ceg: "", kapcsolattarto: "", telefon: "", email: "", megjegyzes: "" };
}

function UjKapcsolatSor({
  onSaved,
  onCancel,
}: {
  onSaved: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<UjKapcsolatForm>(ujForm());
  const [saving, setSaving] = useState(false);

  function patch(p: Partial<UjKapcsolatForm>) {
    setForm((f) => ({ ...f, ...p }));
  }

  async function handleSave() {
    if (!form.ceg.trim()) {
      toast.error("A cég neve kötelező.");
      return;
    }
    setSaving(true);
    try {
      await addKapcsolat({
        ceg: form.ceg,
        kapcsolattarto: form.kapcsolattarto || undefined,
        telefon: form.telefon || undefined,
        email: form.email || undefined,
        megjegyzes: form.megjegyzes || undefined,
        forras: "kézi",
      });
      await onSaved();
      toast.success("Kapcsolat mentve.");
    } catch {
      toast.error("Nem sikerült menteni.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-2 rounded-md border bg-muted/30 p-3 sm:grid-cols-[repeat(4,minmax(0,1fr))_auto_auto]">
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Cég</Label>
        <Input value={form.ceg} onChange={(e) => patch({ ceg: e.target.value })} placeholder="Cég neve" />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Kapcsolattartó</Label>
        <Input
          value={form.kapcsolattarto}
          onChange={(e) => patch({ kapcsolattarto: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Telefon</Label>
        <Input value={form.telefon} onChange={(e) => patch({ telefon: e.target.value })} />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">E-mail</Label>
        <Input value={form.email} onChange={(e) => patch({ email: e.target.value })} />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Megjegyzés</Label>
        <Input value={form.megjegyzes} onChange={(e) => patch({ megjegyzes: e.target.value })} />
      </div>
      <div className="flex items-end gap-1.5">
        <Button size="sm" disabled={saving} onClick={handleSave}>
          {saving ? "Mentés…" : "Mentés"}
        </Button>
        <button
          type="button"
          onClick={onCancel}
          title="Mégse"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function CegCsoport({
  ceg,
  kapcsolatok,
  onDelete,
}: {
  ceg: string;
  kapcsolatok: KapcsolatRow[];
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-md border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium hover:bg-muted/50"
      >
        <span>
          {ceg} <span className="text-xs font-normal text-muted-foreground">({kapcsolatok.length})</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="flex flex-col divide-y border-t">
          {kapcsolatok.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-1 gap-x-3 gap-y-0.5 px-3 py-2 text-sm sm:grid-cols-[1fr_1fr_1fr_1fr_auto] sm:items-center"
            >
              <span>{row.kapcsolattarto ?? "—"}</span>
              <span className="whitespace-normal break-words text-muted-foreground">
                {row.telefon ?? "—"}
              </span>
              <span className="whitespace-normal break-words text-muted-foreground">
                {row.email ?? "—"}
              </span>
              <span className="whitespace-normal break-words text-muted-foreground">
                {row.megjegyzes ?? "—"}
              </span>
              <button
                type="button"
                onClick={() => onDelete(row.id)}
                title="Törlés"
                className="justify-self-end text-destructive/70 hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Kapcsolatok() {
  const [rows, setRows] = useState<KapcsolatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [ujSorNyitva, setUjSorNyitva] = useState(false);

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

  const csoportok = useMemo(() => {
    const map = new Map<string, KapcsolatRow[]>();
    for (const row of rows) {
      const lista = map.get(row.ceg) ?? [];
      lista.push(row);
      map.set(row.ceg, lista);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "hu"));
  }, [rows]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm">Kapcsolatok</CardTitle>
          <div className="flex items-center gap-2">
            {!loading && rows.length === 0 && (
              <Button size="sm" variant="outline" disabled={seeding} onClick={handleSeed}>
                {seeding ? "Feltöltés…" : "Feltöltés a megbízásokból"}
              </Button>
            )}
            {!ujSorNyitva && (
              <Button size="sm" onClick={() => setUjSorNyitva(true)}>
                + Új kapcsolat felvétele
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {ujSorNyitva && (
          <UjKapcsolatSor
            onCancel={() => setUjSorNyitva(false)}
            onSaved={async () => {
              setUjSorNyitva(false);
              await load();
            }}
          />
        )}

        {!loading && csoportok.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Még nincs rögzített kapcsolat.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {csoportok.map(([ceg, kapcsolatok]) => (
            <CegCsoport key={ceg} ceg={ceg} kapcsolatok={kapcsolatok} onDelete={handleDelete} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
