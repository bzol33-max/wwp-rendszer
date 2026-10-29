"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useCanEdit } from "@/components/auth/edit-permission-context";
import { ajanlatElvesztve, ajanlatMegnyerve, ajanlatMegnyeresElotoltes, allitTimocomAllapotot, type MegnyeresElotoltes } from "@/lib/fuvarozas2/timocom";
import { dijSzambol } from "@/lib/fuvarozas2/ajanlat-megbizas-alap";

// Tervezés · A hét (2026-10-14): az ajánlat állapota közvetlenül a listán
// állítható — nem kell átmenni a Timocom-lapra. Ugyanaz az akció, mint ott.
// 2026-10-16 (1. hullám C): „Megnyertük” → bérfuvar a kocsira, „Nem nyertük”.

/** Résből nyitva: a rés kocsija, napja és a rés-sor „Mennyit kérj” ára. */
export type MegnyeresJavaslat = { jarmuKod?: string | null; felrakasNap?: string | null; dijFt?: number | null };

export function AjanlatGombok({ id, allapot, javaslat }: { id: string; allapot: string; javaslat?: MegnyeresJavaslat }) {
  const canEdit = useCanEdit();
  const router = useRouter();
  const [fut, startTransition] = useTransition();
  const [urlap, setUrlap] = useState(false);
  if (!canEdit) return null;
  const allit = (x: "nyitott" | "ajanlva" | "elvetve", uzenet: string) =>
    startTransition(async () => {
      const r = await allitTimocomAllapotot(id, x);
      if (!r.ok) {
        toast.error("Nem sikerült menteni.");
        return;
      }
      toast.success(uzenet);
      router.refresh();
    });
  const gomb = "rounded-md border px-2 py-0.5 text-[11px] font-medium hover:bg-muted disabled:opacity-50";
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="inline-flex flex-wrap justify-end gap-1">
        {allapot !== "ajanlva" ? (
          <button type="button" disabled={fut} className={gomb} onClick={() => allit("ajanlva", "Megjelölve: ajánlat kiment")}>Ajánlatot adtam</button>
        ) : (
          <button type="button" disabled={fut} className={gomb} onClick={() => allit("nyitott", "Visszatéve a nyitottak közé")}>Mégis nyitott</button>
        )}
        <button type="button" disabled={fut} className={gomb} onClick={() => allit("elvetve", "Ajánlat elvetve")}>Elvetem</button>
        <EredmenyGombok id={id} allapot={allapot} kicsi nyitva={urlap} setNyitva={setUrlap} />
      </span>
      {urlap ? <MegnyeresUrlap id={id} javaslat={javaslat} kicsi onBezar={() => setUrlap(false)} /> : null}
    </span>
  );
}

/**
 * „Megnyertük” + „Nem nyertük” gombpár (az ajánlat-kártyán és a listákon).
 * A „Megnyertük” a hívó által mutatott űrlapot nyitja (`setNyitva`).
 */
export function EredmenyGombok({ id, allapot, kicsi, nyitva, setNyitva }: {
  id: string; allapot: string; kicsi?: boolean; nyitva: boolean; setNyitva: (x: boolean) => void;
}) {
  const canEdit = useCanEdit();
  const router = useRouter();
  const [fut, startTransition] = useTransition();
  if (!canEdit || allapot === "nyert") return null;
  const gomb = kicsi
    ? "rounded-md border px-2 py-0.5 text-[11px] font-medium hover:bg-muted disabled:opacity-50"
    : "rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50";
  const elveszt = () =>
    startTransition(async () => {
      const r = await ajanlatElvesztve(id);
      if (!r.ok) { toast.error(r.hiba); return; }
      toast.success("Megjelölve: nem nyertük");
      router.refresh();
    });
  return (
    <>
      <button type="button" disabled={fut} aria-expanded={nyitva}
        className={`${gomb} border-primary text-primary`} onClick={() => setNyitva(!nyitva)}>
        Megnyertük
      </button>
      {allapot !== "vesztett" ? <button type="button" disabled={fut} className={gomb} onClick={elveszt}>Nem nyertük</button> : null}
    </>
  );
}

/** A „Megnyertük” kis űrlapja: kocsi, felrakás nap, díj + pénznem. */
export function MegnyeresUrlap({ id, javaslat, kicsi, onBezar }: { id: string; javaslat?: MegnyeresJavaslat; kicsi?: boolean; onBezar: () => void }) {
  const router = useRouter();
  const [elo, setElo] = useState<MegnyeresElotoltes | null>(null);
  const [kocsi, setKocsi] = useState(javaslat?.jarmuKod ?? "");
  const [nap, setNap] = useState(javaslat?.felrakasNap ?? "");
  const [dij, setDij] = useState(javaslat?.dijFt ? String(javaslat.dijFt) : "");
  const [penznem, setPenznem] = useState<"HUF" | "EUR">("HUF");
  const [fut, startTransition] = useTransition();

  // Egyszer töltjük be (a kocsik listája és a javasolt ár); amit a rés már
  // megadott (kocsi/nap/ár), azt nem írja felül.
  const resDij = javaslat?.dijFt ?? null;
  useEffect(() => {
    let el = false;
    ajanlatMegnyeresElotoltes(id).then((e) => {
      if (el || !e) return;
      setElo(e);
      setKocsi((k) => k || e.kocsik[0]?.kod || "");
      setNap((n) => n || e.felrakasNap || "");
      if (!resDij && e.dij != null) { setDij((d) => d || String(e.dij)); setPenznem(e.penznem); }
    }).catch(() => { if (!el) toast.error("Az előtöltés nem sikerült — töltsd ki kézzel."); });
    return () => { el = true; };
  }, [id, resDij]);

  const kuld = () => {
    const osszeg = dijSzambol(dij);
    if (!kocsi) { toast.error("Válassz kocsit."); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nap)) { toast.error("Add meg a felrakás napját."); return; }
    if (osszeg == null) { toast.error("A díj nem szám."); return; }
    startTransition(async () => {
      const r = await ajanlatMegnyerve(id, { jarmuKod: kocsi, felrakasNap: nap, dij: osszeg, penznem });
      if (!r.ok) { toast.error(r.hiba, { duration: 10000 }); return; }
      if (r.marMegvolt) toast.info(r.uzenet);
      else toast.success(r.uzenet, { action: { label: "Megnyitom", onClick: () => router.push(`/fuvarozas2/megbizasok?reszlet=${r.megbizasId}`) } });
      onBezar();
      router.refresh();
    });
  };

  const mezo = "rounded-md border bg-background px-2 py-1 text-sm";
  const kocsik = elo?.kocsik ?? (kocsi ? [{ kod: kocsi, sofor: kocsi }] : []);
  return (
    <div className={`flex flex-col gap-2 rounded-lg border bg-muted/40 p-2 text-left ${kicsi ? "w-full max-w-[340px]" : ""}`}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-[11px] text-muted-foreground">Kocsi
          <select className={mezo} value={kocsi} onChange={(e) => setKocsi(e.target.value)} disabled={fut}>
            {!kocsi ? <option value="">—</option> : null}
            {kocsik.map((k) => <option key={k.kod} value={k.kod}>{k.sofor} · {k.kod}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-[11px] text-muted-foreground">Felrakás
          <input type="date" className={mezo} value={nap} onChange={(e) => setNap(e.target.value)} disabled={fut} />
        </label>
        <label className="flex flex-col text-[11px] text-muted-foreground">Díj
          <span className="flex gap-1">
            <input inputMode="decimal" className={`${mezo} w-28 tabular-nums`} value={dij} onChange={(e) => setDij(e.target.value)} disabled={fut} placeholder="pl. 180000" />
            <select className={mezo} value={penznem} onChange={(e) => setPenznem(e.target.value === "EUR" ? "EUR" : "HUF")} disabled={fut}>
              <option value="HUF">Ft</option>
              <option value="EUR">EUR</option>
            </select>
          </span>
        </label>
      </div>
      {javaslat?.dijFt ? <p className="text-[11px] text-muted-foreground">Díj: a rés „Mennyit kérj” ára (+20%).</p>
        : elo?.dijForras ? <p className="text-[11px] text-muted-foreground">Díj: {elo.dijForras}.</p> : null}
      <div className="flex gap-2">
        <button type="button" disabled={fut} onClick={kuld}
          className="rounded-md bg-primary px-3 py-1 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {fut ? "Létrehozom…" : "Megbízás létrehozása"}
        </button>
        <button type="button" disabled={fut} onClick={onBezar} className="rounded-md border px-3 py-1 text-sm hover:bg-muted">Mégse</button>
      </div>
    </div>
  );
}

/** A megnyert ajánlat megbízására mutató hivatkozás. */
export function MegbizasLink({ megbizasId }: { megbizasId: string }) {
  return <Link href={`/fuvarozas2/megbizasok?reszlet=${megbizasId}`} className="underline">megbízás #{megbizasId}</Link>;
}
