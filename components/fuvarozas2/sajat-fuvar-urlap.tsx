"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { duplikatumSor } from "@/lib/fuvarozas2/sajat-duplikatum";
import { kocsiraAdom, mentSajatFuvart, torolElokeszitettet, visszaveszem, type SajatFuvarAdat, type SajatFuvarSegedlet } from "@/lib/fuvarozas2/sajat-fuvar";

// Saját fuvar előkészítése (2026-09-25): előre beírod, módosítod, és ha
// minden biztos, „Kocsira adom” — onnantól megy a sofőrnek. Kötelező:
// dátum, kocsi, honnan, hová.
//
// Duplikátum-védelem (2026-10-06, #274/#295): ha ugyanaz a kocsi ±1 napon
// ugyanazt az utat már viszi, a szerver nem ment; itt megkérdezzük, és
// „Mégis mentem”-re `duplikatumOk`-kal küldjük újra.

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
  id, kezdo, segedlet, listaHref, reszletHref, kocsiraHref, bezarHref,
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
  /** Ha van: „× bezár” link a fejlécben (a Megbízások oldalon a lenyíló űrlap csukása). */
  bezarHref?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  const [a, setA] = useState<SajatFuvarAdat>(kezdo);
  const hiany = hianyzik(a);
  const valtozott = JSON.stringify(a) !== JSON.stringify(kezdo);

  const allit = (k: keyof SajatFuvarAdat) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setA({ ...a, [k]: e.target.value });

  // Kinek ↔ Hová (2026-11-19): a saját áru partnerét választva a címe beíródik,
  // címet írva a partner. Csak üres (vagy az előzőleg így kitöltött) mezőt ír felül.
  const kulcs = (x: string) => x.trim().toLowerCase();
  const sp = segedlet.sajatPartnerek;
  function kinekValt(v: string) {
    const p = sp.find((x) => kulcs(x.nev) === kulcs(v));
    const elozo = sp.find((x) => kulcs(x.nev) === kulcs(a.kinek ?? ""));
    const irhato = !a.hova.trim() || (!!elozo?.cim && kulcs(elozo.cim) === kulcs(a.hova));
    setA({ ...a, kinek: v, hova: p?.cim && irhato ? p.cim : a.hova });
  }
  function hovaValt(v: string) {
    const p = sp.find((x) => x.cim && kulcs(x.cim) === kulcs(v));
    const elozo = sp.find((x) => x.cim && kulcs(x.cim) === kulcs(a.hova));
    const irhato = !(a.kinek ?? "").trim() || (!!elozo && kulcs(elozo.nev) === kulcs(a.kinek ?? ""));
    setA({ ...a, hova: v, kinek: p && irhato ? p.nev : a.kinek });
  }

  // Kitől (2026-11-19): alapból mi vagyunk; ha beszállítót választasz, a Kinek mi leszünk,
  // és a Honnan a beszállító címe (ha üres, vagy az előző beszállító címe állt benne).
  const MI = "Well-Worn Pallet Kft.";
  const miVagyunk = (x: string | null | undefined) => /well.?worn/i.test(x ?? "");
  function kitolValt(v: string) {
    const p = sp.find((x) => kulcs(x.nev) === kulcs(v));
    const elozo = sp.find((x) => kulcs(x.nev) === kulcs(a.kitol ?? ""));
    const honnanIrhato = !a.honnan.trim() || (!!elozo?.cim && kulcs(elozo.cim) === kulcs(a.honnan));
    const kulso = !!v.trim() && !miVagyunk(v);
    setA({
      ...a,
      kitol: v,
      kinek: kulso ? MI : miVagyunk(a.kinek) ? "" : a.kinek,
      honnan: p?.cim && honnanIrhato ? p.cim : a.honnan,
    });
  }

  function ment(utana?: "kocsira") {
    start(async () => {
      let r = await mentSajatFuvart(id, a);
      if (!r.ok && r.duplikatumok?.length) {
        const mehet = await confirm(
          `Erre a napra (±1 nap) ugyanezzel a kocsival ugyanez az út már megvan:\n${r.duplikatumok.map((d) => `• ${duplikatumSor(d)}`).join("\n")}\n\nBiztosan új fuvar ez, nem ugyanaz?`,
          { title: "Már van ilyen fuvar", confirmLabel: "Mégis mentem" }
        );
        if (!mehet) return;
        r = await mentSajatFuvart(id, a, { duplikatumOk: true });
      }
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
    <div className="flex flex-col gap-3 rounded-2xl border border-primary bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">{id ? "Előkészített saját fuvar" : "Új saját fuvar"}</h2>
        <span className="ml-auto text-xs text-muted-foreground">a sofőr még nem látja</span>
        {bezarHref ? (
          <Link href={bezarHref} scroll={false} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
            × bezár
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <label className={cimke}>Dátum<input id="sf-datum" type="date" className={mezo} value={a.datum} onChange={allit("datum")} /></label>
        <label className={cimke}>Kocsi
          <select id="sf-kocsi" className={mezo} value={a.jarmuKod ?? ""} onChange={(e) => setA({ ...a, jarmuKod: e.target.value || null })}>
            <option value="">— válassz —</option>
            {segedlet.jarmuvek.map((j) => <option key={j.kod} value={j.kod}>{j.cimke}</option>)}
          </select>
        </label>
        <label className={cimke}>Honnan<input id="sf-honnan" list="sf-helyek" className={mezo} value={a.honnan} onChange={allit("honnan")} placeholder="telephely vagy cím" /></label>
        <label className={cimke}>Hová<input id="sf-hova" list="sf-hova-lista" className={mezo} value={a.hova} onChange={(e) => hovaValt(e.target.value)} placeholder="cím — a partnert kitölti" /></label>
        <label className={cimke}>Kitől<input id="sf-kitol" list="sf-kitol-lista" className={mezo} value={a.kitol ?? ""} onChange={(e) => kitolValt(e.target.value)} onFocus={(e) => e.target.select()} placeholder="Well-Worn Pallet Kft. — vagy beszállító" /></label>
        <label className={cimke}>Kinek<input id="sf-kinek" list="sf-partnerek" className={mezo} value={a.kinek ?? ""} onChange={(e) => kinekValt(e.target.value)} placeholder="saját partner — a címet kitölti" /></label>
        <label className={`${cimke} col-span-2`}>Megjegyzés<textarea id="sf-megj" rows={2} className={mezo} value={a.megjegyzes ?? ""} onChange={allit("megjegyzes")} /></label>
      </div>
      <datalist id="sf-helyek">
        {segedlet.helyek.map((h) => <option key={h.cim} value={h.cim} label={h.nev ?? undefined} />)}
      </datalist>
      <datalist id="sf-partnerek">
        {sp.map((p) => <option key={p.nev} value={p.nev} label={p.cim ?? undefined} />)}
      </datalist>
      <datalist id="sf-kitol-lista">
        <option value={MI} label="saját áru — mi visszük" />
        {sp.map((p) => <option key={p.nev} value={p.nev} label={p.cim ?? undefined} />)}
      </datalist>
      <datalist id="sf-hova-lista">
        {sp.filter((p) => p.cim).map((p) => <option key={`p-${p.nev}`} value={p.cim!} label={p.nev} />)}
        {segedlet.helyek.filter((h) => !sp.some((p) => p.cim === h.cim)).map((h) => <option key={h.cim} value={h.cim} label={h.nev ?? undefined} />)}
      </datalist>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || hiany.length > 0}
          onClick={() => ment("kocsira")}
          className="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground disabled:opacity-45"
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
      {confirmDialog}
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
