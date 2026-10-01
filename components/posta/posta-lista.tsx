"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { FuvarRow } from "@/lib/fuvarozas/fuvar-constants";
import { varosNev } from "@/lib/fuvarozas/varos";
import { setFuvarPostazasiCim, setFuvarPostazva } from "@/lib/fuvarozas/megbizasok";

/** Ennyi ideig marad zölden a listában a „Postázva” jelölés után (visszavonható). */
const ZOLD_MS = 60_000;

export type MaPostazott = { id: string; megrendelo: string | null; pozicioszam: string | null; felrako: string | null; lerako: string | null; szamla_szam: string | null; mikor: string };

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
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-dashed border-[var(--mob-border)] p-3 active:bg-[var(--mob-tile)]">
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
      className="border-[var(--mob-border)] bg-[var(--mob-card)] text-sm text-[var(--mob-text)]"
    />
  );
}

function PostaCsempe({
  row,
  onPostazva,
  zold,
  onVissza,
}: {
  row: FuvarRow;
  onPostazva: (id: string) => void;
  /** Most jelölték postázottnak: zöld, egy percig visszavonható, utána eltűnik. */
  zold: boolean;
  onVissza: (id: string) => void;
}) {
  return (
    <div className={`rounded-xl border p-4 shadow-sm transition-colors ${zold ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40" : "border-[var(--mob-border)] bg-[var(--mob-card)]"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{row.megrendelo ?? "—"}</div>
          <div className="text-xs text-[var(--mob-muted)]">
            {row.erkezett_datum ?? row.date}
            {row.pozicioszam ? ` · ${row.pozicioszam}` : ""}
          </div>
        </div>
      </div>

      {/* Melyik kocsi vitte, és honnan hová — csak a városok, hogy a
          csempe telefonon egy pillantással olvasható maradjon. */}
      <div className="mt-2 flex flex-col gap-0.5 text-sm">
        <div>
          {row.felrako ? varosNev(row.felrako) || row.felrako : "?"}
          {" → "}
          {varosNev(row.lerako) || row.lerako}
        </div>
        <div className="text-xs text-[var(--mob-muted)]">{row.jarmu ?? "kocsi nincs megadva"}</div>
      </div>

      <div className="mt-3 flex flex-col gap-1">
        <div className="text-[11px] font-medium tracking-wide text-[var(--mob-muted)] uppercase">
          Postázási cím
        </div>
        <PostazasiCimMezo id={row.id} initialValue={row.postazasi_cim} />
      </div>

      <div className="mt-3">
        {zold ? <VisszavonGomb id={row.id} onVissza={onVissza} felirat="Postázva ✓ — visszavonás" /> : <PostazvaCheckbox id={row.id} onPostazva={onPostazva} />}
      </div>
    </div>
  );
}

/** A „Postázva” jelölés visszavonása (véletlen pipa). */
function VisszavonGomb({ id, onVissza, felirat }: { id: string; onVissza: (id: string) => void; felirat: string }) {
  const [saving, setSaving] = useState(false);
  return (
    <button
      type="button"
      disabled={saving}
      onClick={async () => {
        setSaving(true);
        try {
          await setFuvarPostazva(id, false);
          onVissza(id);
          toast.success("Visszavonva — a fuvar újra postázásra vár.");
        } catch {
          toast.error("Nem sikerült visszavonni, próbáld újra.");
        } finally {
          setSaving(false);
        }
      }}
      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-emerald-500 px-3 text-sm font-medium text-emerald-700 active:bg-emerald-100 disabled:opacity-60 dark:text-emerald-300"
    >
      <span>{saving ? "Visszavonás…" : felirat}</span>
      <span className="text-xs underline">vissza</span>
    </button>
  );
}

export function PostaLista({ initialRows, maPostazott = [] }: { initialRows: FuvarRow[]; maPostazott?: MaPostazott[] }) {
  const router = useRouter();
  // Az épp postázottnak jelölt sorok: zölden maradnak ZOLD_MS-ig, utána
  // kikerülnek a listából (Budaházi Zoltán, 2026-10-01 — egy véletlen pipa
  // így látszik, és visszavonható).
  const [zold, setZold] = useState<Map<string, FuvarRow>>(new Map());
  const [eltunt, setEltunt] = useState<Set<string>>(new Set());
  const idozitok = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const t = idozitok.current;
    return () => { for (const x of t.values()) window.clearTimeout(x); };
  }, []);

  function handlePostazva(id: string) {
    const r = initialRows.find((x) => x.id === id);
    if (!r) return;
    setZold((prev) => new Map(prev).set(id, r));
    idozitok.current.set(id, window.setTimeout(() => {
      idozitok.current.delete(id);
      setZold((prev) => { const uj = new Map(prev); uj.delete(id); return uj; });
      setEltunt((e) => new Set(e).add(id));
      router.refresh(); // a „Ma feladva” lista is frissüljön
    }, ZOLD_MS));
  }
  function handleVissza(id: string) {
    const t = idozitok.current.get(id);
    if (t) window.clearTimeout(t);
    idozitok.current.delete(id);
    setZold((prev) => { const uj = new Map(prev); uj.delete(id); return uj; });
    setEltunt((e) => { const uj = new Set(e); uj.delete(id); return uj; });
    router.refresh();
  }

  // A szerver lista + a zölden tartott sorok (ha egy frissítés közben már
  // kiesett a szerver listából), minus ami lejárt.
  const lathato = [
    ...initialRows.filter((r) => !eltunt.has(r.id) && !(zold.has(r.id) ? false : maPostazott.some((m) => m.id === r.id))),
    ...[...zold.values()].filter((r) => !initialRows.some((x) => x.id === r.id)),
  ];
  const maFeladva = maPostazott.filter((m) => !zold.has(m.id));

  return (
    <div className="flex flex-col gap-3">
      {lathato.length === 0 ? (
        <p className="text-sm text-[var(--mob-muted)]">Nincs postázásra váró fuvar.</p>
      ) : (
        lathato.map((row) => (
          <PostaCsempe key={row.id} row={row} onPostazva={handlePostazva} zold={zold.has(row.id)} onVissza={handleVissza} />
        ))
      )}

      {maFeladva.length > 0 ? (
        <details className="rounded-xl border border-[var(--mob-border)] bg-[var(--mob-card)] p-3">
          <summary className="cursor-pointer text-sm font-medium">Ma feladva ({maFeladva.length}) — véletlen jelölés visszavonása</summary>
          <div className="mt-2 flex flex-col gap-2">
            {maFeladva.map((m) => (
              <div key={m.id} className="flex flex-col gap-1 border-t border-[var(--mob-border)] pt-2 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{m.megrendelo ?? "—"}</span>
                  <span className="text-xs text-[var(--mob-muted)]">{m.mikor}</span>
                </div>
                <div className="text-xs text-[var(--mob-muted)]">
                  {m.pozicioszam ? `${m.pozicioszam} · ` : ""}{m.felrako ? varosNev(m.felrako) || m.felrako : "?"} → {varosNev(m.lerako) || m.lerako}
                  {m.szamla_szam ? ` · ${m.szamla_szam}` : " · nincs számla"}
                </div>
                <VisszavonGomb id={m.id} onVissza={handleVissza} felirat="Postázva — visszavonás" />
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
