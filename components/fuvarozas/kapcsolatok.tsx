"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ChevronDown, Search, X } from "lucide-react";
import { addKapcsolat, deleteKapcsolat, getKapcsolatok } from "@/lib/fuvarozas/kapcsolatok";
import type { KapcsolatRow } from "@/lib/fuvarozas/kapcsolatok-constants";
import { normalizaltCegKulcs } from "@/lib/fuvarozas/fuvar-constants";

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
  open,
  onToggle,
}: {
  ceg: string;
  kapcsolatok: KapcsolatRow[];
  onDelete: (id: string) => void;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-md border">
      <button
        type="button"
        onClick={onToggle}
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
  const [ujSorNyitva, setUjSorNyitva] = useState(false);
  const [kereses, setKereses] = useState("");
  const [nyitottCegek, setNyitottCegek] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const data = await getKapcsolatok();
    setRows(data);
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  async function handleDelete(id: string) {
    await deleteKapcsolat(id);
    await load();
    toast.success("Kapcsolat törölve.");
  }

  const kereses_norm = kereses.trim().toLowerCase();

  const szurtRows = useMemo(() => {
    if (!kereses_norm) return rows;
    return rows.filter((row) =>
      [row.ceg, row.kapcsolattarto, row.telefon, row.email, row.megjegyzes, row.forras]
        .filter(Boolean)
        .some((mezo) => (mezo as string).toLowerCase().includes(kereses_norm))
    );
  }, [rows, kereses_norm]);

  // A cégenkénti csoportosítás kulcsa kis-nagybetűtől, a szóközöktől
  // (elejétől/végétől, több egymás utánitól), a kötőjelektől/pontoktól ÉS a
  // gyakori cégforma-toldalékoktól (kft/zrt/bt/nyrt/kkt) FÜGGETLEN — ugyanaz
  // a cég eltérő írásmóddal is bekerülhet (pl. "Flott Trans" vs.
  // "FLOTT-TRANS KFT", Gmail-ből származó adatnál), és enélkül ez szétszórná
  // egy partner kapcsolatait több külön mappára (ugyanaz a hibaosztály,
  // amit az Archív fülön is javítottunk). A mappa címeként az elsőként
  // látott, whitespace-normalizált írásmód marad látható.
  const csoportok = useMemo(() => {
    const map = new Map<string, { cim: string; rows: KapcsolatRow[] }>();
    for (const row of szurtRows) {
      const nyersNev = row.ceg.trim().replace(/\s+/g, " ");
      const kulcs = normalizaltCegKulcs(nyersNev);
      const csoport = map.get(kulcs);
      if (csoport) {
        csoport.rows.push(row);
      } else {
        map.set(kulcs, { cim: nyersNev, rows: [row] });
      }
    }
    return Array.from(map.entries()).sort((a, b) => a[1].cim.localeCompare(b[1].cim, "hu"));
  }, [szurtRows]);

  function toggleCeg(ceg: string) {
    setNyitottCegek((prev) => {
      const next = new Set(prev);
      if (next.has(ceg)) {
        next.delete(ceg);
      } else {
        next.add(ceg);
      }
      return next;
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm">Kapcsolatok</CardTitle>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={kereses}
              onChange={(e) => setKereses(e.target.value)}
              placeholder="Keresés — cég, név, telefon, e-mail…"
              className="pl-8"
            />
          </div>
          <div className="flex items-center gap-2">
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
            {kereses_norm ? "Nincs találat." : "Még nincs rögzített kapcsolat."}
          </p>
        )}

        <div className="flex flex-col gap-2">
          {csoportok.map(([kulcs, { cim, rows: kapcsolatok }]) => (
            <CegCsoport
              key={kulcs}
              ceg={cim}
              kapcsolatok={kapcsolatok}
              onDelete={handleDelete}
              open={kereses_norm.length > 0 || nyitottCegek.has(kulcs)}
              onToggle={() => toggleCeg(kulcs)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
