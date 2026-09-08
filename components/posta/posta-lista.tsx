"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { FuvarRow } from "@/lib/fuvarozas/fuvar-constants";
import { setFuvarPostazasiCim, setFuvarPostazva } from "@/lib/fuvarozas/megbizasok";

/** Egy csempe "Postázva" jelölője — bepipálva a csempe azonnal eltűnik a listából. */
function PostazvaCheckbox({
  id,
  onPostazva,
}: {
  id: string;
  onPostazva: (id: string) => void;
}) {
  const [saving, setSaving] = useState(false);

  async function handleChange(value: boolean) {
    if (!value) return;
    setSaving(true);
    try {
      await setFuvarPostazva(id, true);
      onPostazva(id);
      toast.success("Postázva jelölve.");
    } catch {
      toast.error("Nem sikerült menteni, próbáld újra.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-dashed p-3 active:bg-muted">
      <Checkbox
        checked={false}
        disabled={saving}
        onCheckedChange={(v) => handleChange(v === true)}
      />
      <span className="text-sm font-medium">
        {saving ? "Mentés…" : "Postázva"}
      </span>
    </label>
  );
}

/** A postázási cím inline szerkesztése — elhagyva a mezőt (blur) mentődik. */
function PostazasiCimMezo({ id, initialValue }: { id: string; initialValue: string | null }) {
  const [value, setValue] = useState(initialValue ?? "");
  const [saving, setSaving] = useState(false);

  async function handleBlur() {
    if (value === (initialValue ?? "")) return;
    setSaving(true);
    try {
      await setFuvarPostazasiCim(id, value);
    } catch {
      toast.error("Nem sikerült menteni a postázási címet.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
      disabled={saving}
      placeholder="Postázási cím megadása"
      className="text-sm"
    />
  );
}

function PostaCsempe({
  row,
  onPostazva,
}: {
  row: FuvarRow;
  onPostazva: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{row.megrendelo ?? "—"}</div>
          <div className="text-xs text-muted-foreground">
            {row.erkezett_datum ?? row.date}
            {row.pozicioszam ? ` · ${row.pozicioszam}` : ""}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-1">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Postázási cím
        </div>
        <PostazasiCimMezo id={row.id} initialValue={row.postazasi_cim} />
      </div>

      <div className="mt-3">
        <PostazvaCheckbox id={row.id} onPostazva={onPostazva} />
      </div>
    </div>
  );
}

export function PostaLista({ initialRows }: { initialRows: FuvarRow[] }) {
  const [rows, setRows] = useState(initialRows);

  function handlePostazva(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nincs postázásra váró fuvar.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <PostaCsempe key={row.id} row={row} onPostazva={handlePostazva} />
      ))}
    </div>
  );
}
