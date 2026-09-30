"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { frissitsDriveBol } from "@/lib/fuvarozas/drive-sync";
import { felszabaditFuvarDokumentumot } from "@/lib/fuvarozas/megbizasok";
import { modositBerFuvart, ujBerFuvar } from "@/lib/fuvarozas2/megbizasok";
import { berFuvarHiba, type BerFuvarAdat } from "@/lib/fuvarozas2/berfuvar";
import { SAJAT_JARMUVEK, jarmuLabel } from "@/lib/fuvarozas/vehicles";

// A régi Fuvarozás bérfuvar-eszközei a Megbízások oldalon (2026-09-30, a régi
// oldal kivezetése előtt): Drive-frissítés, kézi új bérfuvar, a bérfuvar
// minden mezőjének szerkesztése, újraolvasás a Drive-iratból.

/** Azonnal átnézi a Drive-mappát új fuvarmegbízásokért (az óránkénti automatika helyett). */
export function DriveFrissitesGomb() {
  const router = useRouter();
  const [fut, setFut] = useState(false);

  async function frissit() {
    setFut(true);
    try {
      const e = await frissitsDriveBol();
      if (e.hibak.length > 0) {
        toast.error(`Hiba történt: ${e.hibak[0]}`);
      } else if (!e.ujFuvarok && !e.potoltSorok && !e.osszefuzottDokumentumok && !e.levaltottRegiSorok && !e.elutasitottIratok && !e.helyesbitettMegrendelok) {
        toast.success("Nincs új fuvarmegbízás a Drive-ban.");
      } else {
        const reszek = [`${e.ujFuvarok} új fuvar felvéve`];
        if (e.osszefuzottDokumentumok > 0) reszek.push(`${e.osszefuzottDokumentumok} dokumentum meglévő fuvarhoz fűzve`);
        if (e.levaltottRegiSorok > 0) reszek.push(`${e.levaltottRegiSorok} régi sor leváltva`);
        if (e.elutasitottIratok > 0) reszek.push(`${e.elutasitottIratok} irat kihagyva (hiányos)`);
        if (e.helyesbitettMegrendelok > 0) reszek.push(`${e.helyesbitettMegrendelok} megrendelő helyesbítve`);
        reszek.push(`${e.potoltSorok} sor pótolva`);
        toast.success(`${reszek.join(", ")}.`);
      }
      // A figyelmeztetés nem hiba (pl. a régi soron már számla van) — embernek kell eldöntenie.
      for (const uzenet of e.figyelmeztetesek.slice(0, 3)) toast.warning(uzenet, { duration: 15000 });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nem sikerült a Drive-frissítés.");
    } finally {
      setFut(false);
    }
  }

  return (
    <button
      type="button"
      onClick={frissit}
      disabled={fut}
      title="Azonnal megnézi a Drive-mappát új fuvarmegbízásokért, ahelyett hogy az óránkénti automatikára várnánk."
      className="inline-flex items-center gap-1.5 rounded-lg border border-foreground/15 bg-card px-2.5 py-1 text-xs font-semibold hover:bg-muted disabled:opacity-60"
    >
      <span aria-hidden className={fut ? "inline-block animate-spin" : "inline-block"}>↻</span>
      {fut ? "Frissítés…" : "Frissítés"}
    </button>
  );
}

/** Hibás beolvasásnál: a sor törlődik, és a Drive-iratot a jelenlegi olvasó újra beolvassa. */
export function UjraolvasasGomb({ id, utanaHref }: { id: string; utanaHref: string }) {
  const router = useRouter();
  const [fut, setFut] = useState(false);

  async function ujraolvas() {
    if (!window.confirm("A sor törlődik, és a Drive-irat a jelenlegi olvasóval újra beolvasásra kerül. Folytatod?")) return;
    setFut(true);
    try {
      await felszabaditFuvarDokumentumot(id);
      const e = await frissitsDriveBol();
      if (e.ujFuvarok > 0) toast.success("Az irat újra beolvasva — az új sor a Beérkezett csoportban van.");
      else toast.warning("Az irat felszabadítva, de a szinkron nem vett fel új sort: " + (e.figyelmeztetesek[0] ?? e.hibak[0] ?? "nézd meg a Drive-import naplót."));
      router.push(utanaHref, { scroll: false });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nem sikerült az újraolvasás.");
    } finally {
      setFut(false);
    }
  }

  return (
    <button
      type="button"
      onClick={ujraolvas}
      disabled={fut}
      title="Újraolvasás a Drive-iratból (a sor törlődik, és újra beolvassuk)"
      className="rounded-lg border border-foreground/15 bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-60"
    >
      {fut ? "Újraolvasás…" : "↻ Újraolvasás az iratból"}
    </button>
  );
}

const mezo = "w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm disabled:opacity-50";
const cimke = "flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

/**
 * A bérfuvar összes mezője (a régi szerkesztő FuvarFields-ének bérfuvaros
 * változata). `id` null → új bérfuvar. Mentés után a részletre lép.
 */
export function BerFuvarUrlap({ id, kezdo, megseHref, reszletHref }: {
  id: string | null;
  kezdo: BerFuvarAdat;
  megseHref: string;
  /** Mentés után ide lépünk; `{id}` helyére kerül az azonosító. */
  reszletHref: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [a, setA] = useState<BerFuvarAdat>(kezdo);
  const hiba = berFuvarHiba(a);
  const valtozott = JSON.stringify(a) !== JSON.stringify(kezdo);
  const allit = (k: keyof BerFuvarAdat) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setA({ ...a, [k]: e.target.value });
  const kocsik = SAJAT_JARMUVEK.map(jarmuLabel);
  const hivHianyzik = !a.pozicioszam.trim() && !a.pozicioszamNincs;

  function ment() {
    start(async () => {
      try {
        let celId: string;
        if (id) {
          const r = await modositBerFuvart(id, a);
          if (!r.ok) { toast.error(r.hiba); return; }
          celId = id;
        } else {
          const r = await ujBerFuvar(a);
          if (!r.ok) { toast.error(r.hiba); return; }
          celId = r.id;
        }
        toast.success(id ? "Bérfuvar módosítva." : "Bérfuvar rögzítve.");
        router.push(reszletHref.replace("{id}", celId), { scroll: false });
        router.refresh();
      } catch {
        toast.error("Nem sikerült menteni.");
      }
    });
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); ment(); }}
      className="flex flex-col gap-3 rounded-2xl border border-[var(--f2-blue)] bg-card p-4"
    >
      <h3 className="text-base font-bold">{id ? "Bérfuvar szerkesztése" : "Új bérfuvar (kézi felvétel)"}</h3>
      <div className="grid grid-cols-2 gap-2.5">
        <label className={cimke}>Dátum (felrakás)<input type="date" className={mezo} value={a.datum} onChange={allit("datum")} /></label>
        <label className={cimke} title="Csak akkor add meg, ha a lerakás más napra esik, mint a felrakás.">Lerakás dátuma (ha eltér)<input type="date" className={mezo} value={a.lerakasDatum} onChange={allit("lerakasDatum")} /></label>
        <label className={cimke}>Felrakó<input className={mezo} value={a.felrako} onChange={allit("felrako")} placeholder="pl. Szakoly" /></label>
        <label className={cimke}>Lerakó<input className={mezo} value={a.lerako} onChange={allit("lerako")} placeholder="pl. Budapest" /></label>
        <label className={cimke}>Időpont<input className={mezo} value={a.idopont} onChange={allit("idopont")} placeholder="pl. 06:00" /></label>
        <label className={cimke}>Megrendelő<input className={mezo} value={a.megrendelo} onChange={allit("megrendelo")} placeholder="partner neve" /></label>
        <div className="col-span-2 flex flex-col gap-1">
          <label className={cimke}>Hiv. szám (fuvarszám / pozíciószám)
            <input className={mezo} value={a.pozicioszam} disabled={a.pozicioszamNincs} onChange={(e) => setA({ ...a, pozicioszam: e.target.value, pozicioszamNincs: false })} placeholder="a megbízó által adott szám" />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={a.pozicioszamNincs} onChange={(e) => setA({ ...a, pozicioszamNincs: e.target.checked, pozicioszam: e.target.checked ? "" : a.pozicioszam })} />
            Ennél a megbízónál nincs ilyen szám
          </label>
          {hivHianyzik ? <span className="text-xs font-semibold text-[var(--f2-red)]">Ellenőrizd — hiányzik a hiv. szám (a számlához kell).</span> : null}
        </div>
        <label className={cimke}>Kocsi
          <select className={mezo} value={a.jarmu} onChange={allit("jarmu")}>
            <option value="">— kocsi nélkül —</option>
            {a.jarmu && !kocsik.includes(a.jarmu) ? <option value={a.jarmu}>{a.jarmu}</option> : null}
            {kocsik.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label className={cimke}>Sofőr<input className={mezo} value={a.sofor} onChange={allit("sofor")} /></label>
        <label className={cimke}>Fuvardíj
          <span className="flex items-center gap-1">
            <input inputMode="decimal" className={mezo} value={a.fuvardij} onChange={allit("fuvardij")} placeholder="pl. 240 000" />
            <button type="button" title="Pénznem váltása (Ft / EUR)" onClick={() => setA({ ...a, fuvardijPenznem: a.fuvardijPenznem === "Ft" ? "EUR" : "Ft" })}
              className="shrink-0 rounded-md border border-foreground/15 px-2 py-2 text-xs font-bold normal-case text-foreground hover:bg-muted">
              {a.fuvardijPenznem}
            </button>
          </span>
        </label>
        <label className={cimke}>Költség (Ft)<input inputMode="decimal" className={mezo} value={a.koltseg} onChange={allit("koltseg")} /></label>
        <label className={cimke}>Áru<input className={mezo} value={a.aru} onChange={allit("aru")} /></label>
        <label className={cimke}>Mennyiség<input className={mezo} value={a.mennyiseg} onChange={allit("mennyiseg")} placeholder="pl. 600 db EUR raklap" /></label>
        <label className={cimke}>Súly<input className={mezo} value={a.suly} onChange={allit("suly")} placeholder="pl. 24 t" /></label>
        <label className={cimke}>Postázási cím<input className={mezo} value={a.postazasiCim} onChange={allit("postazasiCim")} placeholder="hová postázzuk a számlát" /></label>
        <label className={`${cimke} col-span-2`}>Megjegyzés<textarea rows={2} className={mezo} value={a.megjegyzes} onChange={allit("megjegyzes")} /></label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending || !!hiba || (!!id && !valtozott)} className="rounded-lg bg-[var(--f2-blue)] px-4 py-2 text-sm font-bold text-white disabled:opacity-45">
          {pending ? "Mentés…" : id ? "Mentés" : "Bérfuvar rögzítése"}
        </button>
        <Link href={megseHref} scroll={false} className="rounded-lg border border-foreground/15 px-3 py-2 text-sm font-semibold hover:bg-muted">Mégse</Link>
        {hiba ? <span className="text-xs text-muted-foreground">{hiba}</span> : null}
      </div>
      {id ? <p className="text-xs text-muted-foreground">A mentés az állapotot nem változtatja (a jóváhagyás, teljesítés külön gomb); a naplóba bekerül, mely mezők változtak.</p> : null}
    </form>
  );
}
