"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { kocsiraAdom, mentSajatFuvart, torolElokeszitettet, visszaveszem, type SajatFuvarAdat, type SajatFuvarSegedlet } from "@/lib/fuvarozas2/sajat-fuvar";

// Saját fuvar előkészítése (2026-09-25): előre beírod, módosítod, és ha
// minden biztos, „Kocsira adom” — onnantól megy a sofőrnek. Kötelező:
// dátum, kocsi, honnan, hová.

function hianyzik(a: SajatFuvarAdat): string[] {
  const h: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.datum)) h.push("dátum");
  if (!a.jarmuKod) h.push("kocsi");
  if (!a.honnan.trim()) h.push("honnan");
  if (!a.hova.trim()) h.push("hová");
  return h;
}

const mezo = "w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm";
const cimke = "flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

export function SajatFuvarUrlap({
  id, kezdo, segedlet, listaHref, reszletHref, kocsiraHref,
}: {
  id: string | null;
  kezdo: SajatFuvarAdat;
  segedlet: SajatFuvarSegedlet;
  /** Ahová törlés után visszatérünk. */
  listaHref: string;
  /** Mentés után ide lépünk (az új sor részlete); `{id}` helyére kerül az azonosító. */
  reszletHref: string;
  /** A „Kocsira adom” után ide lépünk (a Folyamatban lista, a sor részletével). */
  kocsiraHref: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [a, setA] = useState<SajatFuvarAdat>(kezdo);
  const hiany = hianyzik(a);
  const valtozott = JSON.stringify(a) !== JSON.stringify(kezdo);

  const allit = (k: keyof SajatFuvarAdat) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setA({ ...a, [k]: e.target.value });

  function ment(utana?: "kocsira") {
    start(async () => {
      const r = await mentSajatFuvart(id, a);
      if (!r.ok) { toast.error(r.hiba); return; }
      if (utana === "kocsira") {
        const k = await kocsiraAdom(r.id);
        if (!k.ok) { toast.error(k.hiba); router.push(reszletHref.replace("{id}", r.id)); router.refresh(); return; }
        toast.success("Kocsira adva — a sofőr appjában megjelent");
        router.push(kocsiraHref.replace("{id}", r.id));
        router.refresh();
        return;
      } else {
        toast.success(id ? "Mentve" : "Előkészítve — a sofőr még nem látja");
      }
      router.push(reszletHref.replace("{id}", r.id));
      router.refresh();
    });
  }

  function torol() {
    if (!id) return;
    start(async () => {
      const r = await torolElokeszitettet(id);
      if (!r.ok) { toast.error(r.hiba); return; }
      toast.success("Törölve");
      router.push(listaHref);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[var(--f2-mint)] bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">{id ? "Előkészített saját fuvar" : "Új saját fuvar"}</h2>
        <span className="text-xs text-muted-foreground">a sofőr még nem látja</span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <label className={cimke}>Dátum<input id="sf-datum" type="date" className={mezo} value={a.datum} onChange={allit("datum")} /></label>
        <label className={cimke}>Kocsi
          <select id="sf-kocsi" className={mezo} value={a.jarmuKod ?? ""} onChange={(e) => setA({ ...a, jarmuKod: e.target.value || null })}>
            <option value="">— válassz —</option>
            {segedlet.jarmuvek.map((j) => <option key={j.kod} value={j.kod}>{j.cimke}</option>)}
          </select>
        </label>
        <label className={`${cimke} col-span-2`}>Honnan<input id="sf-honnan" list="sf-helyek" className={mezo} value={a.honnan} onChange={allit("honnan")} placeholder="telephely vagy cím" /></label>
        <label className={`${cimke} col-span-2`}>Hová<input id="sf-hova" list="sf-helyek" className={mezo} value={a.hova} onChange={allit("hova")} placeholder="cím" /></label>
        <label className={`${cimke} col-span-2`}>Kitől (nem kötelező)<input id="sf-kitol" list="sf-partnerek" className={mezo} value={a.kitol ?? ""} onChange={allit("kitol")} placeholder="ki adja az árut" /></label>
        <label className={`${cimke} col-span-2`}>Kinek (nem kötelező)<input id="sf-kinek" list="sf-partnerek" className={mezo} value={a.kinek ?? ""} onChange={allit("kinek")} placeholder="pl. FABRIKA + 2000 Kft." /></label>
        <label className={`${cimke} col-span-2`}>Megjegyzés<textarea id="sf-megj" rows={2} className={mezo} value={a.megjegyzes ?? ""} onChange={allit("megjegyzes")} /></label>
      </div>
      <datalist id="sf-helyek">
        {segedlet.helyek.map((h) => <option key={h.cim} value={h.cim} label={h.nev ?? undefined} />)}
      </datalist>
      <datalist id="sf-partnerek">
        {segedlet.partnerek.map((p) => <option key={p} value={p} />)}
      </datalist>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || hiany.length > 0}
          onClick={() => ment("kocsira")}
          className="rounded-lg bg-[var(--f2-mint)] px-3 py-2 text-sm font-bold text-white disabled:opacity-45"
        >
          Kocsira adom
        </button>
        <button
          type="button"
          disabled={pending || (!!id && !valtozott) || !/^\d{4}-\d{2}-\d{2}$/.test(a.datum)}
          onClick={() => ment()}
          className="rounded-lg border border-foreground/15 px-3 py-2 text-sm font-semibold disabled:opacity-45"
        >
          {id ? "Mentés" : "Mentés előkészítésbe"}
        </button>
        {id ? (
          <button type="button" disabled={pending} onClick={torol} className="ml-auto text-xs font-semibold text-[var(--f2-red)] disabled:opacity-45">
            Törlés
          </button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {hiany.length > 0 ? `A „Kocsira adom”-hoz még kell: ${hiany.join(", ")}.` : "Minden megvan — kocsira adható."}
      </p>
    </div>
  );
}

/** A kocsira adott, még el nem indult saját fuvar visszavétele előkészítésbe. */
export function VisszaveszemGomb({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => {
        const r = await visszaveszem(id);
        if (!r.ok) { toast.error(r.hiba); return; }
        toast.success("Visszavéve előkészítésbe — a sofőr már nem látja");
        router.refresh();
      })}
      className="self-start rounded-lg border border-foreground/15 bg-card px-3 py-1.5 text-xs font-semibold disabled:opacity-45"
    >
      Visszaveszem előkészítésbe (módosításhoz)
    </button>
  );
}
