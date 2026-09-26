"use client";

// Sofőr mobil — egy nap (Ma / Holnap) a terv 03/04/06 vásznai szerint.
// Adat: lib/fuvarozas/sofor.ts getSoforNap (a szerver a sofőr saját
// kocsijára szűr). Gombok: a meglévő, tesztelt szerver-akciók — a régi
// jelölőket írják, az új modellt a 002/003 triggerek húzzák át.
//
// Gombnyomás térerő nélkül: a hívás újrapróbálkozik (5 kísérlet, növekvő
// várakozás), közben a gomb „küldés…” állapotban; a kliens-oldali
// sorbaállítás (IndexedDB, T10) az E8 körben jön.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { SoforNap, SoforMegalloSor, SoforFuvarBlokk } from "@/lib/fuvarozas/sofor";
import { jelolMegerkeztem, markMegalloKesz, jelolVarakozast, jelezGondot, rogzitPozicioszamot, feltoltFuvarlevelFoto } from "@/lib/fuvarozas/sofor";

async function ujraprobal<T>(fn: () => Promise<T>): Promise<T> {
  let hiba: unknown;
  for (let i = 0; i < 5; i++) {
    try { return await fn(); } catch (e) { hiba = e; await new Promise((r) => setTimeout(r, 1500 * (i + 1))); }
  }
  throw hiba;
}

function ora(d: Date | string | null | undefined) {
  if (!d) return "";
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? "" : x.toLocaleTimeString("hu-HU", { timeZone: "Europe/Budapest", hour: "2-digit", minute: "2-digit" });
}
function napNev(iso: string) {
  const d = new Date(`${iso}T12:00:00+02:00`);
  return d.toLocaleDateString("hu-HU", { timeZone: "Europe/Budapest", weekday: "long", month: "short", day: "numeric" });
}

export function SoforNapNezet({ nap, ma, cim }: { nap: SoforNap | null; ma: boolean; cim?: string }) {
  const felirat = cim ?? (ma ? "Ma" : "Holnap");
  if (!nap) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-bold">{felirat}</h1>
        <div className="rounded-xl bg-[var(--m-surf)] p-4 text-sm text-[var(--m-muted)]">Nincs kocsi a fiókodhoz rendelve.</div>
      </div>
    );
  }
  const kov = nap.kovetkezo;
  const kovMegallo = kov ? nap.fuvarok.flatMap((f) => f.megallok).find((m) => m.fuvarId === kov.fuvarId && m.megalloIndex === kov.megalloIndex) : null;
  const kovFuvar = kov ? nap.fuvarok.find((f) => f.fuvarId === kov.fuvarId) : null;
  const hatra = nap.fuvarok.flatMap((f) => f.megallok).filter((m) => !m.kesz).length;
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h1 className="text-xl font-bold">{felirat} · {napNev(nap.napISO)}</h1>
        <div className="text-sm text-[var(--m-muted)]">
          {nap.jarmuLabel} · {nap.fuvarok.length} megbízás{ma && hatra > 0 ? ` · ${hatra} megálló hátra` : ""}
        </div>
        {nap.hiba ? <div className="mt-1 text-xs text-[var(--m-amb)]">GPS: {nap.hiba}</div> : null}
      </div>

      {ma && kovMegallo && kovFuvar ? <KovetkezoKartya m={kovMegallo} f={kovFuvar} /> : null}

      {nap.fuvarok.length === 0 ? (
        <div className="rounded-xl bg-[var(--m-surf)] p-4 text-sm text-[var(--m-muted)]">Nincs megbízás erre a napra — a diszpécser még keresi.</div>
      ) : null}
      {nap.fuvarok.map((f) => <FuvarKartya key={f.fuvarId} f={f} ma={ma} />)}

      <p className="text-center text-xs text-[var(--m-muted)]">Térerő nélkül a gombok újrapróbálják magukat, amíg el nem mennek.</p>
    </div>
  );
}

function Pill({ children, szin = "mint" }: { children: React.ReactNode; szin?: "mint" | "amb" | "red" }) {
  const c = { mint: "bg-[var(--m-mint-d)] text-[var(--m-mint)]", amb: "bg-[var(--m-amb-d)] text-[var(--m-amb)]", red: "bg-[var(--m-red-d)] text-[var(--m-red)]" }[szin];
  return <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${c}`}>{children}</span>;
}

function Gomb({ children, onClick, primary, danger, disabled }: { children: React.ReactNode; onClick?: () => void; primary?: boolean; danger?: boolean; disabled?: boolean }) {
  const c = primary ? "bg-[var(--m-mint)] text-[#0f2a22]" : danger ? "border border-[var(--m-red)] text-[var(--m-red)]" : "border border-[var(--m-line)] text-[var(--m-txt)]";
  return <button type="button" onClick={onClick} disabled={disabled} className={`flex-1 rounded-xl py-3 text-sm font-semibold disabled:opacity-50 ${c}`}>{children}</button>;
}

function KovetkezoKartya({ m, f }: { m: SoforMegalloSor; f: SoforFuvarBlokk }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const fut = (nev: string, fn: () => Promise<unknown>) =>
    start(async () => {
      try { await ujraprobal(fn); toast.success(nev); router.refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : "Nem sikerült — próbáld újra."); }
    });
  const varakozik = !!m.varakozasKezdete && !m.varakozasVege;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[var(--m-mint)] bg-[var(--m-surf)] p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--m-muted)]">KÖVETKEZŐ</span>
        {m.ablakTol || m.ablakIg ? <Pill>ablak {ora(m.ablakTol)}{m.ablakIg ? `–${ora(m.ablakIg)}` : ""}</Pill> : m.eppenItt ? <Pill>itt állsz</Pill> : null}
      </div>
      <div className="text-lg font-bold">{m.tipus === "felrako" ? "Felrakó" : "Lerakó"} · {m.cim}</div>
      <div className="flex items-baseline gap-2">
        {!m.becslesElavult ? <span className="text-3xl font-bold">{ora(m.idopont)}</span> : null}
        <span className="text-sm text-[var(--m-muted)]">{f.megrendelo ?? ""}{f.reiseId ? ` · Út ID ${f.reiseId}` : f.pozicioszam ? ` · ${f.pozicioszam}` : ""}</span>
      </div>
      {varakozik ? <div className="rounded-xl bg-[var(--m-amb-d)] px-3 py-2 text-sm text-[var(--m-amb)]"><b>Várakozol</b> {ora(m.varakozasKezdete)} óta</div> : null}
      <div className="flex gap-2">
        <Gomb disabled={pending} onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(m.cim)}&travelmode=driving`, "_blank")}>Navigáció</Gomb>
        <Gomb disabled={pending || !!m.keziErkezes} onClick={() => fut("Megérkezés rögzítve", () => jelolMegerkeztem(m.fuvarId, m.megalloIndex))}>{m.keziErkezes ? `Megérkeztem ${ora(m.keziErkezes)}` : "Megérkeztem"}</Gomb>
      </div>
      <div className="flex gap-2">
        <Gomb disabled={pending} onClick={() => fut(varakozik ? "Várakozás vége" : "Várakozás rögzítve", () => jelolVarakozast(m.fuvarId, m.megalloIndex, varakozik ? "befejez" : "kezd"))}>{varakozik ? "Várakozás vége" : "Várakozom"}</Gomb>
        <Gomb primary disabled={pending} onClick={() => fut(m.tipus === "felrako" ? "Felrakva ✓" : "Lerakva ✓", () => markMegalloKesz(m.fuvarId, m.megalloIndex))}>{m.tipus === "felrako" ? "Felrakva ✓" : "Lerakva ✓"}</Gomb>
      </div>
    </div>
  );
}

function FuvarKartya({ f, ma }: { f: SoforFuvarBlokk; ma: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [gond, setGond] = useState(false);
  const [gondSzoveg, setGondSzoveg] = useState("");
  const [poz, setPoz] = useState("");
  const fotoRef = useRef<HTMLInputElement>(null);
  const kesz = f.megallok.every((m) => m.kesz);
  const utolsoLerakoKesz = f.megallok.filter((m) => m.tipus === "lerako").every((m) => m.kesz) && f.megallok.some((m) => m.tipus === "lerako");
  const fut = (nev: string, fn: () => Promise<unknown>) =>
    start(async () => {
      try { await ujraprobal(fn); toast.success(nev); router.refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : "Nem sikerült — próbáld újra."); }
    });
  const elso = f.megallok[0];
  const utolso = f.megallok[f.megallok.length - 1];
  return (
    <div className={`flex flex-col gap-2 rounded-2xl bg-[var(--m-surf)] p-4 ${kesz ? "opacity-70" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-[var(--m-muted)]">MEGBÍZÁS{f.csuszo ? " · korábbról" : ""}</span>
        {kesz ? <Pill>kész</Pill> : f.masRendszam ? <Pill szin="amb">a papíron: {f.masRendszam}</Pill> : null}
      </div>
      <div className="text-base font-bold">{elso?.varos ?? "—"} → {utolso?.varos ?? "—"}</div>
      <div className="text-sm text-[var(--m-muted)]">{f.megrendelo ?? "—"}{f.reiseId ? ` · Út ID ${f.reiseId}` : ""}{f.pozicioszam ? ` · ${f.pozicioszam}` : ""}</div>
      <div className="flex flex-col gap-1.5">
        {f.megallok.map((m) => (
          <div key={m.megalloIndex} className="flex items-start gap-2 rounded-xl bg-[var(--m-surf2)] px-3 py-2 text-sm">
            <span className={`mt-1 size-2.5 shrink-0 rounded-full ${m.kesz ? "bg-[var(--m-mint)]" : m.eppenItt ? "bg-[var(--m-amb)]" : "bg-[var(--m-line)]"}`} />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{m.tipus === "felrako" ? "Felrakó" : "Lerakó"} · {m.varos}</div>
              <div className="truncate text-xs text-[var(--m-muted)]">{m.cim}</div>
              <div className="text-xs text-[var(--m-muted)]">
                {m.ablakTol || m.ablakIg ? `ablak ${ora(m.ablakTol)}${m.ablakIg ? `–${ora(m.ablakIg)}` : ""} · ` : ""}
                {m.kesz ? `kész ${ora(m.idopont)}${m.keszForras === "gps" ? " (GPS)" : m.keszBy ? ` (${m.keszBy})` : ""}` : m.becslesElavult ? "" : `kb. ${ora(m.idopont)}`}
                {m.helyBizonytalan && !m.helyRogzitve ? " · cím bizonytalan" : ""}
              </div>
            </div>
          </div>
        ))}
      </div>
      {f.aru || f.mennyiseg || f.suly ? <div className="text-sm"><span className="text-[var(--m-muted)]">Áru:</span> {[f.aru, f.mennyiseg, f.suly].filter(Boolean).join(" · ")}</div> : null}
      {f.megjegyzes ? <div className="rounded-xl bg-[var(--m-amb-d)] px-3 py-2 text-sm text-[var(--m-amb)]">{f.megjegyzes}</div> : null}

      {ma ? (
        <>
          {utolsoLerakoKesz ? (
            <div className="flex flex-col gap-2 rounded-xl border border-[var(--m-mint)] p-3">
              <div className="text-sm font-bold">Fuvarlevél / CMR fotó</div>
              <div className="text-xs text-[var(--m-muted)]">A fotó a diszpécsernek szól — ettől lesz számlázható. Az eredeti papírt hozd haza.</div>
              <input ref={fotoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => {
                const fajl = e.target.files?.[0]; if (!fajl) return;
                const form = new FormData(); form.append("foto", fajl);
                fut("Fotó feltöltve", () => feltoltFuvarlevelFoto(f.fuvarId, form));
                e.target.value = "";
              }} />
              <Gomb primary disabled={pending} onClick={() => fotoRef.current?.click()}>{pending ? "küldés…" : "Fotó készítése"}</Gomb>
            </div>
          ) : null}
          {!f.pozicioszam && !f.reiseId ? (
            <div className="flex gap-2">
              <input value={poz} onChange={(e) => setPoz(e.target.value)} placeholder="Pozíciószám a papírról" className="min-w-0 flex-1 rounded-xl border border-[var(--m-line)] bg-[var(--m-surf2)] px-3 text-sm" />
              <Gomb disabled={pending || !poz.trim()} onClick={() => fut("Pozíciószám mentve", () => rogzitPozicioszamot(f.fuvarId, poz))}>Beírom</Gomb>
            </div>
          ) : null}
          {gond ? (
            <div className="flex flex-col gap-2">
              <textarea value={gondSzoveg} onChange={(e) => setGondSzoveg(e.target.value)} rows={2} placeholder="Mi a gond? (pl. nem engednek be, sérült áru, rossz cím)" className="rounded-xl border border-[var(--m-line)] bg-[var(--m-surf2)] px-3 py-2 text-sm" />
              <div className="flex gap-2">
                <Gomb onClick={() => setGond(false)}>Mégse</Gomb>
                <Gomb danger disabled={pending || !gondSzoveg.trim()} onClick={() => { fut("Jelezve a diszpécsernek", () => jelezGondot(f.fuvarId, gondSzoveg)); setGond(false); setGondSzoveg(""); }}>Küldés</Gomb>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              {f.dokumentumok.length > 0 ? <Gomb onClick={() => window.open(`/api/fuvarozas/dokumentum/${f.dokumentumok[0].id}`, "_blank")}>Megbízás PDF</Gomb> : null}
              <Gomb danger onClick={() => setGond(true)}>Gond van</Gomb>
            </div>
          )}
        </>
      ) : f.dokumentumok.length > 0 ? (
        <div className="flex gap-2"><Gomb onClick={() => window.open(`/api/fuvarozas/dokumentum/${f.dokumentumok[0].id}`, "_blank")}>Megbízás PDF</Gomb></div>
      ) : null}
    </div>
  );
}
