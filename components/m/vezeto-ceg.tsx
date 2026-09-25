"use client";

// Vezetői mobil — „Cég" fül: a mai Áttekintés három füle egy helyen
// (Nyíregyháza · Készlet · Számlák). Ugyanazokat a lekérdezéseket használja,
// mint az /attekintes (lib/attekintes/actions.ts), tehát ugyanazt a számot
// mutatja — csak tömörebben, és a vezetői mobil témájában.
//
// Szándékosan CSAK OLVAS: felvásárlást rögzíteni, készletet mozgatni,
// számlát fizetve jelölni a saját modulokban lehet, oda visz a lábjegyzet-link.

import { useState } from "react";
import Link from "next/link";
import type { FelvasarlasTipusSor, HaviKasszaOsszesito, KasszaKiadasTetel, KeszletFulAdatok } from "@/lib/attekintes/actions";
import { szamlaHatralek, type SzamlaRow } from "@/lib/szamlak/szamla-constants";

type Szakasz = "nyiregyhaza" | "keszlet" | "szamlak";

function ft(n: number | null | undefined, p = "Ft") {
  return n == null ? "—" : `${new Intl.NumberFormat("hu-HU").format(Math.round(n))} ${p}`;
}
/** A "2026.09.03." alakú magyar dátumból ISO — a lejárt/esedékes bontáshoz. */
function isoDatum(d: string | null): string | null {
  const m = /^(\d{4})\.(\d{2})\.(\d{2})/.exec(d ?? "");
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function Doboz({ cim, children }: { cim: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-[var(--m-surf)] p-3">
      <div className="text-xs font-semibold uppercase text-[var(--m-muted)]">{cim}</div>
      {children}
    </div>
  );
}

export function VezetoiCeg({
  tipusok, kassza, havi, maiKiadasok, keszlet, szamlak, ma,
}: {
  tipusok: FelvasarlasTipusSor[];
  kassza: number;
  havi: HaviKasszaOsszesito;
  maiKiadasok: KasszaKiadasTetel[];
  keszlet: KeszletFulAdatok;
  szamlak: SzamlaRow[];
  /** Mai nap ISO-ban (szerverről, Europe/Budapest) — a lejárt számlák szűréséhez. */
  ma: string;
}) {
  const [szakasz, setSzakasz] = useState<Szakasz>("nyiregyhaza");

  const lejart = szamlak.filter((s) => {
    const d = isoDatum(s.fizetesi_hatarido);
    return d != null && d < ma;
  });
  const penznemenkent = new Map<string, number>();
  for (const s of szamlak) penznemenkent.set(s.penznem, (penznemenkent.get(s.penznem) ?? 0) + szamlaHatralek(s));
  const kovetkezo = [...szamlak]
    .sort((a, b) => (isoDatum(a.fizetesi_hatarido) ?? "9999").localeCompare(isoDatum(b.fizetesi_hatarido) ?? "9999"))
    .slice(0, 12);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">Cég</h1>
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {([
          { k: "nyiregyhaza", l: "Nyíregyháza" },
          { k: "keszlet", l: "Készlet" },
          { k: "szamlak", l: `Számlák${lejart.length ? ` ${lejart.length}` : ""}` },
        ] as const).map((e) => (
          <button key={e.k} type="button" onClick={() => setSzakasz(e.k)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${szakasz === e.k ? "bg-[var(--m-mint)] text-[#0f2a22]" : "border border-[var(--m-line)] text-[var(--m-muted)]"}`}>
            {e.l}
          </button>
        ))}
      </div>

      {szakasz === "nyiregyhaza" ? (
        <div className="flex flex-col gap-2">
          <Doboz cim="Kassza">
            <div className="text-2xl font-bold">{ft(kassza)}</div>
            <div className="text-xs text-[var(--m-muted)]">e hónapban be {ft(havi.bevetel)} · ki {ft(havi.kiadas)}</div>
          </Doboz>
          <Doboz cim="Mai felvásárlás">
            {tipusok.length === 0 ? (
              <div className="text-sm text-[var(--m-muted)]">Ma még nem volt felvásárlás.</div>
            ) : (
              <div className="flex flex-col gap-1">
                {tipusok.map((t) => (
                  <div key={t.tipus} className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{t.tipus}</span>
                    <span className="shrink-0 font-semibold">{t.qty} db</span>
                  </div>
                ))}
              </div>
            )}
          </Doboz>
          <Doboz cim={`Mai kiadás (${maiKiadasok.length})`}>
            {maiKiadasok.length === 0 ? (
              <div className="text-sm text-[var(--m-muted)]">Ma nem ment ki pénz a kasszából.</div>
            ) : (
              <div className="flex flex-col gap-1">
                {maiKiadasok.slice(0, 15).map((k) => (
                  <div key={k.id} className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-[var(--m-muted)]">{k.description}</span>
                    <span className="shrink-0 font-semibold">{ft(k.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </Doboz>
          <Link href="/felvasarlas" className="rounded-xl bg-[var(--m-surf)] p-3 text-sm underline">Felvásárlás rögzítése →</Link>
        </div>
      ) : null}

      {szakasz === "keszlet" ? (
        <div className="flex flex-col gap-2">
          <Doboz cim="Telephelyek">
            <div className="flex flex-col gap-1">
              {keszlet.telepek.map((t) => (
                <div key={t.nev} className="flex items-baseline justify-between gap-2 text-sm">
                  <span>{t.nev}</span>
                  <span className="font-semibold">{new Intl.NumberFormat("hu-HU").format(t.osszes)} db</span>
                </div>
              ))}
            </div>
          </Doboz>
          <Doboz cim="Típusonként">
            <div className="flex flex-col gap-1">
              {keszlet.tipusok.map((t) => (
                <div key={t.tipus} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">{t.tipus}</span>
                  <span className="shrink-0 font-semibold">{new Intl.NumberFormat("hu-HU").format(t.osszes)} db</span>
                </div>
              ))}
            </div>
          </Doboz>
          {keszlet.uton.length > 0 ? (
            <Doboz cim={`Úton (${keszlet.uton.length})`}>
              <div className="flex flex-col gap-1">
                {keszlet.uton.map((u) => (
                  <div key={u.id} className="text-xs text-[var(--m-muted)]">
                    <b className="text-[var(--m-txt)]">{u.qty} db</b> {u.tipus} · {u.honnan ?? "—"} → {u.hova}
                  </div>
                ))}
              </div>
            </Doboz>
          ) : null}
          <Link href="/keszlet" className="rounded-xl bg-[var(--m-surf)] p-3 text-sm underline">Készlet modul →</Link>
        </div>
      ) : null}

      {szakasz === "szamlak" ? (
        <div className="flex flex-col gap-2">
          <Doboz cim="Kintlévőség">
            <div className="flex flex-col gap-1">
              {[...penznemenkent.entries()].map(([p, o]) => (
                <div key={p} className="flex items-baseline justify-between gap-2">
                  <span className="text-sm text-[var(--m-muted)]">{szamlak.filter((s) => s.penznem === p).length} nyitott számla</span>
                  <span className="text-lg font-bold">{ft(o, p)}</span>
                </div>
              ))}
              {szamlak.length === 0 ? <div className="text-sm text-[var(--m-muted)]">Nincs nyitott számla.</div> : null}
            </div>
            {lejart.length > 0 ? (
              <div className="rounded-xl bg-[var(--m-red-d)] px-3 py-2 text-sm font-semibold text-[var(--m-red)]">
                {lejart.length} lejárt · {ft(lejart.reduce((a, s) => a + (s.penznem === "Ft" ? szamlaHatralek(s) : 0), 0))}
              </div>
            ) : null}
          </Doboz>
          <Doboz cim="Esedékesség szerint">
            <div className="flex flex-col gap-2">
              {kovetkezo.map((s) => {
                const d = isoDatum(s.fizetesi_hatarido);
                const kesik = d != null && d < ma;
                return (
                  <div key={s.id} className="flex items-start justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{s.vevo_nev}</div>
                      <div className="truncate text-xs text-[var(--m-muted)]">{s.szamlaszam} · {s.fizetesi_hatarido ?? "—"}</div>
                    </div>
                    <span className={`shrink-0 font-semibold ${kesik ? "text-[var(--m-red)]" : ""}`}>{ft(szamlaHatralek(s), s.penznem)}</span>
                  </div>
                );
              })}
            </div>
          </Doboz>
          <Link href="/szamlak" className="rounded-xl bg-[var(--m-surf)] p-3 text-sm underline">Számlák modul →</Link>
        </div>
      ) : null}
    </div>
  );
}
