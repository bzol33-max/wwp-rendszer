"use client";

// Szabina Posta lapja (B változat, 2026-10-04): kártyánként a megbízó, a
// számlaszám és a postázási cím, alatta egy nagy „Postázva” gomb. Koppintásra
// AZONNAL rögzül (postázva → lezárt, naplózva), a kártya bezöldül, és egy
// percig visszavonható; utána eltűnik a listából, és a „Ma postázott” alá
// kerül. Azonnal írunk, nem a perc végén: ha közben bezárja az appot, a
// postázás akkor se vesszen el.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { valtAllapot, type MegbizasSor } from "@/lib/fuvarozas2/megbizasok";

const ARCHIV_MS = 60_000;

function nap(t: string | null | undefined) {
  if (!t) return "";
  const d = new Date(t.trim().replace(" ", "T"));
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("hu-HU", { timeZone: "Europe/Budapest", month: "2-digit", day: "2-digit" });
}

function ora(t: string | null | undefined) {
  if (!t) return "";
  const d = new Date(t.trim().replace(" ", "T"));
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString("hu-HU", { timeZone: "Europe/Budapest", hour: "2-digit", minute: "2-digit" });
}

async function lepes(id: string, hova: "postazva" | "szamlazva"): Promise<string> {
  const r = await valtAllapot(id, hova);
  if (!r.ok) throw new Error(r.hiba);
  return r.allapot;
}

export function PostaKartyak({ varnak, maPostazott }: { varnak: MegbizasSor[]; maPostazott: MegbizasSor[] }) {
  const router = useRouter();
  // id → a pipálás utáni állapot ("lezart", vagy "postazva", ha a partner
  // miatt nem zárult le); amíg itt van, a kártya zöld és visszavonható.
  const [zold, setZold] = useState<Record<string, string>>({});
  const [elrejtve, setElrejtve] = useState<Set<string>>(new Set());
  const [folyamatban, setFolyamatban] = useState<string | null>(null);
  const idozitok = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const t = idozitok.current;
    return () => t.forEach((x) => clearTimeout(x));
  }, []);

  async function postazva(s: MegbizasSor) {
    setFolyamatban(s.id);
    try {
      const utana = await lepes(s.id, "postazva");
      setZold((z) => ({ ...z, [s.id]: utana }));
      idozitok.current.set(
        s.id,
        setTimeout(() => {
          idozitok.current.delete(s.id);
          setElrejtve((e) => new Set(e).add(s.id));
          setZold((z) => {
            const uj = { ...z };
            delete uj[s.id];
            return uj;
          });
          router.refresh();
        }, ARCHIV_MS)
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nem sikerült");
    } finally {
      setFolyamatban(null);
    }
  }

  async function visszavon(s: MegbizasSor) {
    setFolyamatban(s.id);
    try {
      // Lezárt → postázva (16. él), majd postázva → számlázva (17. él).
      if (zold[s.id] === "lezart") await lepes(s.id, "postazva");
      await lepes(s.id, "szamlazva");
      const t = idozitok.current.get(s.id);
      if (t) clearTimeout(t);
      idozitok.current.delete(s.id);
      setZold((z) => {
        const uj = { ...z };
        delete uj[s.id];
        return uj;
      });
      toast.success("Visszavonva");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nem sikerült visszavonni");
    } finally {
      setFolyamatban(null);
    }
  }

  const lathato = varnak.filter((s) => !elrejtve.has(s.id));
  const nyitottDb = lathato.filter((s) => !zold[s.id]).length;
  const maLista = [...maPostazott.filter((m) => !varnak.some((v) => v.id === m.id)), ...varnak.filter((s) => elrejtve.has(s.id))];

  return (
    <div className="flex flex-col gap-3 pt-1">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">Posta</h1>
        <span className="text-sm text-[var(--at-muted)]">{nyitottDb} feladandó</span>
      </div>

      {lathato.length === 0 ? (
        <div className="rounded-xl border border-[var(--at-border)] bg-[var(--at-card)] p-4 text-sm text-[var(--at-muted)]">
          Nincs feladandó papír.
        </div>
      ) : null}

      {lathato.map((s) => {
        const kesz = !!zold[s.id];
        return (
          <div
            key={s.id}
            className={`flex flex-col gap-1 rounded-xl border p-3 transition-colors ${
              kesz
                ? "border-[var(--at-positive)] bg-[color-mix(in_srgb,var(--at-positive)_12%,white)]"
                : "border-[var(--at-border)] bg-[var(--at-card)]"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className={`min-w-0 truncate text-base font-semibold ${kesz ? "text-[var(--at-positive)]" : ""}`}>
                {s.partner_nev ?? "(nincs megbízó)"}
              </span>
              <span className="shrink-0 text-xs text-[var(--at-muted)]">{s.szamla_szam}</span>
            </div>
            <div className="text-sm text-[var(--at-muted)]">{s.postazasi_cim ?? "nincs postázási cím a törzsben"}</div>
            <div className="text-xs text-[var(--at-muted)]">
              {[s.hivatkozas, nap(s.lerakas_nap)].filter(Boolean).join(" · ")}
            </div>
            <button
              type="button"
              disabled={folyamatban === s.id}
              onClick={() => (kesz ? visszavon(s) : postazva(s))}
              className={`mt-2 w-full rounded-lg py-3 text-sm font-semibold disabled:opacity-60 ${
                kesz
                  ? "border border-[var(--at-positive)] text-[var(--at-positive)]"
                  : "bg-[var(--at-accent)] text-white"
              }`}
            >
              {folyamatban === s.id ? "…" : kesz ? "Visszavonás" : "Postázva"}
            </button>
            {kesz ? (
              <div className="text-center text-xs text-[var(--at-positive)]">Postázva — 1 perc múlva az archívba kerül</div>
            ) : null}
          </div>
        );
      })}

      {maLista.length > 0 ? (
        <div className="mt-3 flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-[var(--at-muted)]">Ma postázott · {maLista.length}</h2>
          <div className="rounded-xl border border-[var(--at-border)] bg-[var(--at-card)]">
            {maLista.map((s, i) => (
              <div
                key={s.id}
                className={`flex items-center justify-between gap-2 px-3 py-2 text-sm ${i > 0 ? "border-t border-[var(--at-border)]" : ""}`}
              >
                <span className="min-w-0 truncate">{s.partner_nev ?? "(nincs megbízó)"}</span>
                <span className="shrink-0 text-xs text-[var(--at-muted)]">
                  {s.szamla_szam} {ora(s.postazva_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
