"use client";

// Vezetői mobil (terv: 4 fül — Ma · Fuvar · Cég · Rendszer).
//
// A nézet elve: NEM a normál működést mutatja, hanem az eltéréseket. A „Ma"
// tetején a jelzések állnak (mi vár döntésre), alatta kocsinként egy sor —
// ha minden rendben, az egy sor. A Fuvar fül szegmensei azt adják, amit
// telefonról tényleg meg lehet tenni: holnap átnézése, ellenőrzésre várók
// jóváhagyása, levelek elintézése, és a napló (ki mit tett).
//
// Minden gomb ugyanazokat a szerver-akciókat hívja, mint az asztali nézet
// (valtAllapot, setLevelAllapot, kerCsatolmanyt) — nincs mobil-külön logika.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import type { MaAdat } from "@/lib/fuvarozas2/ma";
import type { MegbizasSor } from "@/lib/fuvarozas2/megbizasok";
import type { LevelSor } from "@/lib/fuvarozas2/levelek";
import type { NaploSor } from "@/lib/fuvarozas2/naplo";
import { valtAllapot } from "@/lib/fuvarozas2/megbizasok";
import { setLevelAllapot, kerCsatolmanyt } from "@/lib/fuvarozas2/levelek";

const ALLAPOT_ROVID: Record<string, string> = {
  ellenorzesre_var: "ellenőrzésre vár",
  tervezett: "tervezett",
  folyamatban: "folyamatban",
  teljesitve: "fotóra vár",
  szamlazhato: "számlázható",
  szamlazva: "számlázva",
  email_elment: "e-mail elment",
  postazva: "postázva",
  lezart: "lezárt",
};

function ft(n: number | null | undefined, p = "Ft") {
  return n == null ? "—" : `${new Intl.NumberFormat("hu-HU").format(n)} ${p}`;
}
function napRovid(nap: string | null | undefined) {
  if (!nap) return "";
  const [, m, d] = nap.split("-");
  return `${m}.${d}.`;
}
function ora(t: string | null | undefined) {
  if (!t) return "";
  let s = t.trim().replace(" ", "T");
  if (/[+-]\d{2}$/.test(s)) s += ":00";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("hu-HU", { timeZone: "Europe/Budapest", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function Cim({ children, alcim }: { children: React.ReactNode; alcim?: string }) {
  return (
    <div>
      <h1 className="text-xl font-bold">{children}</h1>
      {alcim ? <div className="text-sm text-[var(--m-muted)]">{alcim}</div> : null}
    </div>
  );
}

function Szegmensek<T extends string>({ ertek, valt, elemek }: { ertek: T; valt: (e: T) => void; elemek: { kulcs: T; label: string; darab?: number }[] }) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {elemek.map((e) => (
        <button key={e.kulcs} type="button" onClick={() => valt(e.kulcs)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${ertek === e.kulcs ? "bg-[var(--m-mint)] text-[#0f2a22]" : "border border-[var(--m-line)] text-[var(--m-muted)]"}`}>
          {e.label}{e.darab ? ` ${e.darab}` : ""}
        </button>
      ))}
    </div>
  );
}

function Ures({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl bg-[var(--m-surf)] p-4 text-sm text-[var(--m-muted)]">{children}</div>;
}

/** Egy megbízás egy sorban — partner, útvonal, állapot. Kattintva a teljes nézet. */
function MegbizasSorKartya({ s, jobb, gyerek }: { s: MegbizasSor; jobb?: string; gyerek?: React.ReactNode }) {
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
        <span className="shrink-0 text-xs font-semibold text-[var(--m-muted)]">{jobb ?? ALLAPOT_ROVID[s.allapot] ?? s.allapot}</span>
      </Link>
      {gyerek}
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

// ---------------------------------------------------------------------------
// Fuvar — Holnap · Ellenőrzés · Levelek · Napló
// ---------------------------------------------------------------------------

type FuvarSzakasz = "holnap" | "ellenorzes" | "levelek" | "naplo";

export function VezetoiFuvar({
  holnap, kocsiNelkulHolnap, ellenorzesre, levelek, naplo,
}: {
  holnap: { kod: string; cimke: string; sofor: string | null; sorok: MegbizasSor[] }[];
  kocsiNelkulHolnap: MegbizasSor[];
  ellenorzesre: MegbizasSor[];
  levelek: LevelSor[];
  naplo: NaploSor[];
}) {
  const [szakasz, setSzakasz] = useState<FuvarSzakasz>("holnap");
  const router = useRouter();
  const [pending, start] = useTransition();
  const fut = (nev: string, fn: () => Promise<unknown>) =>
    start(async () => {
      try { await fn(); toast.success(nev); router.refresh(); }
      catch (e) { toast.error(e instanceof Error ? e.message : "Nem sikerült"); }
    });

  return (
    <div className="flex flex-col gap-4">
      <Cim>Fuvar</Cim>
      <Szegmensek
        ertek={szakasz}
        valt={setSzakasz}
        elemek={[
          { kulcs: "holnap", label: "Holnap" },
          { kulcs: "ellenorzes", label: "Ellenőrzés", darab: ellenorzesre.length },
          { kulcs: "levelek", label: "Levelek", darab: levelek.length },
          { kulcs: "naplo", label: "Napló" },
        ]}
      />

      {szakasz === "holnap" ? (
        <div className="flex flex-col gap-2">
          {holnap.map((k) => (
            <div key={k.kod} className="flex flex-col gap-2 rounded-2xl bg-[var(--m-surf)] p-3">
              <div className="flex items-baseline justify-between gap-2">
                <div className="truncate text-sm font-bold">{k.cimke}</div>
                <div className="shrink-0 text-xs text-[var(--m-muted)]">{k.sofor ?? "nincs sofőr"}</div>
              </div>
              {k.sorok.length === 0 ? (
                <div className="text-xs text-[var(--m-amb)]">holnap még üres</div>
              ) : k.sorok.map((s) => (
                <Link key={s.id} href={`/fuvarozas2/megbizasok/${s.id}`} className="rounded-xl bg-[var(--m-surf2)] p-2">
                  <div className="truncate text-xs font-semibold">{s.partner_nev ?? "(nincs megbízó)"}</div>
                  <div className="truncate text-xs text-[var(--m-muted)]">{s.felrako ?? "—"} → {s.lerako ?? "—"}</div>
                </Link>
              ))}
            </div>
          ))}
          {kocsiNelkulHolnap.length > 0 ? (
            <>
              <div className="text-xs font-semibold uppercase text-[var(--m-red)]">Holnap kocsi nélkül ({kocsiNelkulHolnap.length})</div>
              {kocsiNelkulHolnap.map((s) => <MegbizasSorKartya key={s.id} s={s} />)}
            </>
          ) : null}
          <Link href="/fuvarozas2/tervezes" className="rounded-xl bg-[var(--m-surf)] p-3 text-sm underline">Heti tervezés, üres slotok →</Link>
        </div>
      ) : null}

      {szakasz === "ellenorzes" ? (
        <div className="flex flex-col gap-2">
          {ellenorzesre.length === 0 ? <Ures>Nincs ellenőrzésre váró megbízás.</Ures> : null}
          {ellenorzesre.map((s) => (
            <MegbizasSorKartya key={s.id} s={s} jobb={ft(s.fuvardij, s.fuvardij_penznem)}
              gyerek={
                <>
                  {s.hianylista.length > 0 ? (
                    <div className="text-xs text-[var(--m-amb)]">hiányzik: {s.hianylista.map((h) => String(h)).join(", ")}</div>
                  ) : null}
                  <div className="flex gap-2">
                    <button type="button" disabled={pending || !s.jarmu_kod}
                      onClick={() => fut("Jóváhagyva", () => valtAllapot(s.id, "tervezett"))}
                      className="flex-1 rounded-xl bg-[var(--m-mint)] py-2.5 text-sm font-semibold text-[#0f2a22] disabled:opacity-50">
                      {s.jarmu_kod ? "Jóváhagyom ✓" : "kocsi kell hozzá"}
                    </button>
                    <Link href={`/fuvarozas2/megbizasok/${s.id}`} className="flex-1 rounded-xl border border-[var(--m-line)] py-2.5 text-center text-sm font-semibold">Megnyit</Link>
                  </div>
                </>
              }
            />
          ))}
        </div>
      ) : null}

      {szakasz === "levelek" ? (
        <div className="flex flex-col gap-2">
          {levelek.length === 0 ? <Ures>Nincs nyitott levél.</Ures> : null}
          {levelek.map((l) => (
            <div key={l.id} className="flex flex-col gap-2 rounded-2xl bg-[var(--m-surf)] p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold">{l.partner_nev ?? l.felado_nev ?? l.felado}</div>
                  <div className="truncate text-xs text-[var(--m-muted)]">{l.targy ?? "(nincs tárgy)"}</div>
                </div>
                <span className="shrink-0 text-xs font-semibold text-[var(--m-muted)]">{l.kezi_osztaly ?? l.osztaly}</span>
              </div>
              <div className="line-clamp-2 text-xs text-[var(--m-muted)]">{l.snippet ?? ""}</div>
              <div className="text-xs text-[var(--m-muted)]">
                {ora(l.erkezett)}
                {l.hivatkozas ? ` · ${l.hivatkozas}` : ""}
                {l.csatolmany_nevek.length > 0 ? ` · ${l.csatolmany_nevek.length} csatolmány` : ""}
              </div>
              <div className="flex gap-2">
                {l.drive_url ? (
                  <a href={l.drive_url} target="_blank" rel="noreferrer" className="flex-1 rounded-xl border border-[var(--m-line)] py-2.5 text-center text-sm font-semibold">Irat</a>
                ) : l.csatolmany_nevek.length > 0 && !l.csatolmany_kell ? (
                  <button type="button" disabled={pending} onClick={() => fut("Csatolmány kérve", () => kerCsatolmanyt(l.id))}
                    className="flex-1 rounded-xl border border-[var(--m-line)] py-2.5 text-sm font-semibold disabled:opacity-50">Csatolmányt kérek</button>
                ) : null}
                <button type="button" disabled={pending} onClick={() => fut("Elintézve", () => setLevelAllapot(l.id, "feldolgozva"))}
                  className="flex-1 rounded-xl bg-[var(--m-mint)] py-2.5 text-sm font-semibold text-[#0f2a22] disabled:opacity-50">Elintézve ✓</button>
                <button type="button" disabled={pending} onClick={() => fut("Elvetve", () => setLevelAllapot(l.id, "elvetve"))}
                  className="rounded-xl border border-[var(--m-line)] px-3 py-2.5 text-sm font-semibold disabled:opacity-50">✕</button>
              </div>
            </div>
          ))}
          <Link href="/fuvarozas2/levelek" className="rounded-xl bg-[var(--m-surf)] p-3 text-sm underline">Teljes levél-nézet →</Link>
        </div>
      ) : null}

      {szakasz === "naplo" ? (
        <div className="flex flex-col gap-1">
          {naplo.length === 0 ? <Ures>Még nincs esemény.</Ures> : null}
          {naplo.map((n) => (
            <Link key={n.id} href={`/fuvarozas2/megbizasok/${n.megbizas_id}`} className="rounded-xl bg-[var(--m-surf)] px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-xs font-semibold">{n.esemeny}{n.allapot_utan ? ` → ${ALLAPOT_ROVID[n.allapot_utan] ?? n.allapot_utan}` : ""}</span>
                <span className="shrink-0 text-[11px] text-[var(--m-muted)]">{ora(n.mikor)}</span>
              </div>
              <div className="truncate text-[11px] text-[var(--m-muted)]">
                {[n.partner_nev, n.hivatkozas, n.jarmu_kod, n.ki ?? n.forras].filter(Boolean).join(" · ")}
              </div>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
