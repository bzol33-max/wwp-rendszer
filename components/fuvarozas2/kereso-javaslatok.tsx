"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { SZAKASZOK, javaslatok, type KeresoIndex } from "@/lib/fuvarozas2/munkaasztal";

// A munkaasztal keresője gépelés közbeni javaslatokkal (Budaházi Zoltán,
// 2026-09-25). Fuvarra kattintva a fuvar nyílik meg; cégre, városra, kocsira,
// számra vagy hónapra kattintva arra keres. Az Enter kijelölés nélkül a
// mostani teljes keresést adja (a form elküldése).

type Elem = { kulcs: string; href: string };

function hrefKereses(q: string, jelleg?: "ber" | "sajat"): string {
  const p = new URLSearchParams({ q });
  if (jelleg) p.set("jelleg", jelleg);
  return `/fuvarozas2/megbizasok?${p}`;
}

function formatNap(iso: string | null): string {
  return iso ? `${iso.slice(5, 7)}.${iso.slice(8, 10)}.` : "";
}

export function KeresoJavaslatok({ index, kezdo, jelleg }: { index: KeresoIndex; kezdo: string; jelleg?: "ber" | "sajat" }) {
  const router = useRouter();
  const [q, setQ] = useState(kezdo);
  const [nyitva, setNyitva] = useState(false);
  const [kijelolt, setKijelolt] = useState(-1);
  const formRef = useRef<HTMLFormElement>(null);

  const talalat = useMemo(() => javaslatok(index, q), [index, q]);
  const elemek: Elem[] = [
    ...talalat.fuvarok.map((f) => {
      const p = new URLSearchParams({ szakasz: f.szakasz, reszlet: f.id });
      if (jelleg) p.set("jelleg", jelleg);
      return { kulcs: `f${f.id}`, href: `/fuvarozas2/megbizasok?${p}` };
    }),
    ...talalat.csoportok.flatMap((cs) => cs.elemek.map((e) => ({ kulcs: `${cs.cim}:${e.q}`, href: hrefKereses(e.q, jelleg) }))),
  ];
  const lathato = nyitva && elemek.length > 0;

  function valaszt(i: number) {
    const e = elemek[i];
    if (!e) return;
    setNyitva(false);
    router.push(e.href);
  }

  function billentyu(ev: React.KeyboardEvent<HTMLInputElement>) {
    if (ev.key === "ArrowDown" && elemek.length) {
      ev.preventDefault();
      setNyitva(true);
      setKijelolt((k) => (k + 1) % elemek.length);
    } else if (ev.key === "ArrowUp" && elemek.length) {
      ev.preventDefault();
      setKijelolt((k) => (k <= 0 ? elemek.length - 1 : k - 1));
    } else if (ev.key === "Enter" && lathato && kijelolt >= 0) {
      ev.preventDefault();
      valaszt(kijelolt);
    } else if (ev.key === "Escape") {
      setNyitva(false);
      setKijelolt(-1);
    }
  }

  let sorszam = -1;
  const sor = (kulcs: string, tartalom: React.ReactNode) => {
    sorszam++;
    const i = sorszam;
    return (
      <li key={kulcs} role="option" aria-selected={i === kijelolt}>
        <button
          type="button"
          // A mousedown elvenné a fókuszt a mezőtől, és a lista a kattintás előtt bezárna.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => valaszt(i)}
          onMouseEnter={() => setKijelolt(i)}
          className={cn("flex w-full min-h-11 flex-col items-start rounded-md px-2.5 py-1.5 text-left", i === kijelolt ? "bg-muted" : "hover:bg-muted")}
        >
          {tartalom}
        </button>
      </li>
    );
  };

  return (
    <form ref={formRef} action="/fuvarozas2/megbizasok" className="relative flex flex-col gap-1">
      <input
        type="search"
        name="q"
        value={q}
        onChange={(e) => { setQ(e.target.value); setNyitva(true); setKijelolt(-1); }}
        onFocus={() => setNyitva(true)}
        onBlur={() => setNyitva(false)}
        onKeyDown={billentyu}
        placeholder="Keresés mindenben…"
        autoComplete="off"
        role="combobox"
        aria-expanded={lathato}
        aria-controls="munkaasztal-javaslatok"
        aria-label="Keresés: cég, város, rendszám, sofőr, hivatkozás, számlaszám, hónap"
        className="w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm"
      />
      {jelleg ? <input type="hidden" name="jelleg" value={jelleg} /> : null}
      <span className="px-1 text-[11px] text-muted-foreground">cég · város · rendszám · sofőr · hivatkozás · számlaszám · hónap</span>
      {lathato ? (
        <ul
          id="munkaasztal-javaslatok"
          role="listbox"
          className="absolute left-0 top-11 z-30 max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-foreground/10 bg-card p-1.5 shadow-lg"
        >
          {talalat.fuvarok.length ? (
            <>
              <li className="px-2.5 pb-0.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" role="presentation">Fuvar</li>
              {talalat.fuvarok.map((f) =>
                sor(`f${f.id}`, (
                  <>
                    <span className="w-full truncate text-sm font-semibold">{f.cim}</span>
                    <span className="w-full truncate text-xs text-muted-foreground">
                      {f.ut} · {formatNap(f.nap)} · {SZAKASZOK.find((s) => s.kulcs === f.szakasz)?.cimke}
                    </span>
                  </>
                ))
              )}
            </>
          ) : null}
          {talalat.csoportok.map((cs) => (
            <li key={cs.cim} role="presentation">
              <div className="px-2.5 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{cs.cim}</div>
              <ul role="presentation">
                {cs.elemek.map((e) => sor(`${cs.cim}:${e.q}`, <span className="w-full truncate text-sm">{e.cimke}</span>))}
              </ul>
            </li>
          ))}
          <li role="presentation" className="px-2.5 pb-1 pt-2 text-[11px] text-muted-foreground">Enter: teljes keresés „{q.trim()}”</li>
        </ul>
      ) : null}
    </form>
  );
}
