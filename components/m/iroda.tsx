"use client";

// Iroda (Szabina) mobil teendői — a terv 07/08 vászna.
//   Posta: melyik fuvar papírját kell feladni — Szabina viszi postára és
//     jelöli „Feladva ✓” (a korábbi külön „Papír megjött” lépés megszűnt).
//   Számla: mit kell kiszámlázni, és melyik számla e-mailje megy ki.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { MegbizasSor } from "@/lib/fuvarozas2/megbizasok";
import { setSzamlaSzam, valtAllapot } from "@/lib/fuvarozas2/megbizasok";

function ora(t: string | null | undefined) {
  if (!t) return "";
  let s = t.trim().replace(" ", "T");
  if (/[+-]\d{2}$/.test(s)) s += ":00";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("hu-HU", { timeZone: "Europe/Budapest", month: "2-digit", day: "2-digit" });
}
function ft(n: number | null | undefined, p = "Ft") {
  return n == null ? "—" : `${new Intl.NumberFormat("hu-HU").format(n)} ${p}`;
}

function Gomb({ children, onClick, primary, disabled }: { children: React.ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`flex-1 rounded-xl py-3 text-sm font-semibold disabled:opacity-50 ${primary ? "bg-[var(--m-mint)] text-[#0f2a22]" : "border border-[var(--m-line)] text-[var(--m-txt)]"}`}>
      {children}
    </button>
  );
}

function Fej({ s, jobb }: { s: MegbizasSor; jobb?: string }) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-base font-bold">{s.partner_nev ?? "(nincs megbízó)"}</div>
          <div className="truncate text-xs text-[var(--m-muted)]">{[s.hivatkozas, s.jarmu_kod, ora(s.lerakas_nap)].filter(Boolean).join(" · ") || "—"}</div>
        </div>
        {jobb ? <span className="shrink-0 text-sm font-semibold">{jobb}</span> : null}
      </div>
      <div className="truncate text-xs text-[var(--m-muted)]">{s.felrako ?? "—"} → {s.lerako ?? "—"}</div>
    </>
  );
}

/**
 * Posta (Szabina): a számla e-mailje kiment, a papírt postára kell adni. A
 * „Feladva ✓” zárja a lépést — külön „Papír megjött” jelölés nincs
 * (Budaházi Zoltán, 2026-09-24): a feladott papír a kézben volt.
 */
export function PostaLista({ sorok }: { sorok: MegbizasSor[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const fut = (nev: string, fn: () => Promise<unknown>) =>
    start(async () => { try { await fn(); toast.success(nev); router.refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : "Nem sikerült"); } });
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h1 className="text-xl font-bold">Posta</h1>
        <div className="text-sm text-[var(--m-muted)]">{sorok.length} fuvar papírját kell feladni</div>
      </div>
      {sorok.length === 0 ? <div className="rounded-xl bg-[var(--m-surf)] p-4 text-sm text-[var(--m-muted)]">Nincs feladandó papír.</div> : null}
      {sorok.map((s) => (
        <div key={s.id} className="flex flex-col gap-2 rounded-2xl bg-[var(--m-surf)] p-4">
          <Fej s={s} jobb={s.szamla_szam ?? undefined} />
          <div className="text-xs text-[var(--m-muted)]">{s.postazasi_cim ?? "nincs postázási cím a törzsben"}</div>
          <Gomb primary disabled={pending} onClick={() => fut("Feladva", () => valtAllapot(s.id, "postazva"))}>Feladva ✓</Gomb>
        </div>
      ))}
    </div>
  );
}

export function SzamlaPostaLista({ szamlazhato, emailre }: { szamlazhato: MegbizasSor[]; emailre: MegbizasSor[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [szamok, setSzamok] = useState<Record<string, string>>({});
  const fut = (nev: string, fn: () => Promise<unknown>) =>
    start(async () => { try { await fn(); toast.success(nev); router.refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : "Nem sikerült"); } });
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">Számla</h1>
        <div className="text-sm text-[var(--m-muted)]">{szamlazhato.length} számlázható · {emailre.length} e-mail</div>
      </div>

      <Szakasz cim="Számlázható" ures="Nincs számlázható fuvar.">
        {szamlazhato.map((s) => (
          <div key={s.id} className="flex flex-col gap-2 rounded-2xl bg-[var(--m-surf)] p-4">
            <Fej s={s} jobb={ft(s.fuvardij, s.fuvardij_penznem)} />
            <div className="text-xs text-[var(--m-muted)]">a számlára: <b className="text-[var(--m-txt)]">{s.hivatkozas ?? "—"}</b>{s.fizetesi_hatarido_nap != null ? ` · ${s.fizetesi_hatarido_nap} nap` : ""}</div>
            <div className="flex gap-2">
              <input value={szamok[s.id] ?? ""} onChange={(e) => setSzamok({ ...szamok, [s.id]: e.target.value })}
                placeholder="számlaszám" inputMode="text"
                className="min-w-0 flex-1 rounded-xl border border-[var(--m-line)] bg-[var(--m-surf2)] px-3 text-sm" />
              <Gomb primary disabled={pending || !(szamok[s.id] ?? "").trim()} onClick={() => fut("Számlázva", () => setSzamlaSzam(s.id, szamok[s.id]))}>Kész</Gomb>
            </div>
          </div>
        ))}
      </Szakasz>

      <Szakasz cim="Számla e-mail kimegy" ures="Nincs kiküldendő számla-e-mail.">
        {emailre.map((s) => (
          <div key={s.id} className="flex flex-col gap-2 rounded-2xl bg-[var(--m-surf)] p-4">
            <Fej s={s} jobb={s.szamla_szam ?? undefined} />
            <Gomb disabled={pending} onClick={() => fut("E-mail elment", () => valtAllapot(s.id, "email_elment"))}>E-mail elment ✓</Gomb>
          </div>
        ))}
      </Szakasz>
    </div>
  );
}

function Szakasz({ cim, ures, children }: { cim: string; ures: string; children: React.ReactNode }) {
  const van = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-semibold uppercase text-[var(--m-muted)]">{cim}</div>
      {van ? children : <div className="rounded-xl bg-[var(--m-surf)] p-3 text-sm text-[var(--m-muted)]">{ures}</div>}
    </div>
  );
}
