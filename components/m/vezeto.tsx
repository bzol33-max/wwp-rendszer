"use client";

// Vezetői mobil — a /m „Ma” nézete a teljes Fuvarozás-jogú fióknak.
//
// A nézet elve: NEM a normál működést mutatja, hanem az eltéréseket. A
// tetején a jelzések állnak (mi vár döntésre), alatta kocsinként egy sor —
// ha minden rendben, az egy sor. (A Fuvar · Cég · Rendszer fül 2026-10-16-án
// megszűnt — docs/fuvarozas-1-hullam-terv.md D4; az asztali nézet a teljes.)

import Link from "next/link";
import type { MaAdat } from "@/lib/fuvarozas2/ma";
import type { MegbizasSor } from "@/lib/fuvarozas2/megbizasok";

const ALLAPOT_ROVID: Record<string, string> = {
  ellenorzesre_var: "ellenőrzésre vár",
  tervezett: "tervezett",
  folyamatban: "folyamatban",
  teljesitve: "visszaért — számlázni",
  szamlazhato: "visszaért — számlázni",
  szamlazva: "számlázva — postára",
  email_elment: "számlázva — postára",
  postazva: "kész",
  lezart: "kész",
};

function napRovid(nap: string | null | undefined) {
  if (!nap) return "";
  const [, m, d] = nap.split("-");
  return `${m}.${d}.`;
}
function Cim({ children, alcim }: { children: React.ReactNode; alcim?: string }) {
  return (
    <div>
      <h1 className="text-xl font-bold">{children}</h1>
      {alcim ? <div className="text-sm text-[var(--m-muted)]">{alcim}</div> : null}
    </div>
  );
}

/** Egy megbízás egy sorban — partner, útvonal, állapot. Kattintva a teljes nézet. */
function MegbizasSorKartya({ s }: { s: MegbizasSor }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-[var(--m-surf)] p-3">
      <Link href={`/fuvarozas2/megbizasok/${s.id}`} className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold">{s.partner_nev ?? "(nincs megbízó)"}</div>
          <div className="truncate text-xs text-[var(--m-muted)]">
            {[s.hivatkozas, s.jarmu_kod ?? "nincs kocsi", napRovid(s.lerakas_nap)].filter(Boolean).join(" · ")}
          </div>
          <div className="truncate text-xs text-[var(--m-muted)]">{s.felrako ?? "—"} → {s.lerako ?? "—"}</div>
        </div>
        <span className="shrink-0 text-xs font-semibold text-[var(--m-muted)]">{ALLAPOT_ROVID[s.allapot] ?? s.allapot}</span>
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ma
// ---------------------------------------------------------------------------

export function VezetoiMa({ adat }: { adat: MaAdat }) {
  const jelzesek = adat.jelzesek.filter((j) => j.darab > 0);
  const szin = (s: string) =>
    s === "sulyos" ? "bg-[var(--m-red-d)] text-[var(--m-red)]" : s === "figyelmeztetes" ? "bg-[var(--m-amb-d)] text-[var(--m-amb)]" : "bg-[var(--m-surf)] text-[var(--m-muted)]";
  return (
    <div className="flex flex-col gap-4">
      <Cim alcim={`${napRovid(adat.ma)} · ${adat.kocsik.length} kocsi`}>Ma</Cim>

      {jelzesek.length === 0 ? (
        <div className="rounded-xl bg-[var(--m-mint-d)] p-4 text-sm text-[var(--m-mint)]">Semmi nem vár döntésre.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {jelzesek.map((j) => (
            <Link key={j.kulcs} href={j.href} className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold ${szin(j.sulyossag)}`}>
              <span className="min-w-0 truncate">{j.szoveg}</span>
              <span className="shrink-0 text-lg">{j.darab}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="text-xs font-semibold uppercase text-[var(--m-muted)]">Kocsik</div>
        {adat.kocsik.map((k) => (
          <div key={k.kod} className="flex flex-col gap-2 rounded-2xl bg-[var(--m-surf)] p-3">
            <div className="flex items-baseline justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold">{k.cimke}</div>
                <div className="truncate text-xs text-[var(--m-muted)]">{k.sofor ?? "nincs sofőr"}</div>
              </div>
              <div className="shrink-0 text-xs text-[var(--m-muted)]">ma {k.ma.length} · holnap {k.holnap.length}</div>
            </div>
            {k.ma.length === 0 ? (
              <div className="text-xs text-[var(--m-amb)]">ma nincs fuvar</div>
            ) : (
              k.ma.map((s) => (
                <Link key={s.id} href={`/fuvarozas2/megbizasok/${s.id}`} className="rounded-xl bg-[var(--m-surf2)] p-2">
                  <div className="truncate text-xs font-semibold">{s.partner_nev ?? "(nincs megbízó)"}</div>
                  <div className="truncate text-xs text-[var(--m-muted)]">{s.felrako ?? "—"} → {s.lerako ?? "—"} · {ALLAPOT_ROVID[s.allapot] ?? s.allapot}</div>
                </Link>
              ))
            )}
          </div>
        ))}
      </div>

      {adat.kocsiNelkul.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="text-xs font-semibold uppercase text-[var(--m-red)]">Kocsi nélkül ({adat.kocsiNelkul.length})</div>
          {adat.kocsiNelkul.map((s) => <MegbizasSorKartya key={s.id} s={s} />)}
        </div>
      ) : null}
    </div>
  );
}
