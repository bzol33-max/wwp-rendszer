"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  elvetMuveletJavaslatot, jovahagyMuveletet, kuldSegednek, mentTudast, torolTudast, ujBeszelgetes,
  type SegedTudas, type SegedUzenet,
} from "@/lib/fuvarozas2/seged/seged";
import type { SegedMuvelet } from "@/lib/fuvarozas2/seged/muveletek";
import type { Jelzes } from "@/lib/fuvarozas2/ma";

// A Megbízások oldal beépített segédje (2026-09-26) — a jobb oldali oszlopban,
// a kocsi-panel helyén. Mobilon összecsukva indul (a lista legyen elöl).
//
// 2. rész: a segéd műveletet javasol, végrehajtani csak ez a felület tudja —
// a „Jóváhagyom” gomb. Amíg nincs jóváhagyva, semmi nem történt.

const GYORS_KERDESEK = [
  "Mi a mai teendő?",
  "Hol van a héten üres nap, és merre keressek fuvart?",
  "Mennyibe kerül Szakoly → Budapest 40 tonnával?",
  "Melyik fuvarnak nincs még számlája?",
];

/** **félkövér** és #123 fuvarlink egy sorban. */
function Sor({ szoveg }: { szoveg: string }) {
  const reszek = szoveg.split(/(\*\*[^*]+\*\*|#\d{1,6}\b)/g);
  return (
    <>
      {reszek.map((r, i) => {
        if (/^\*\*[^*]+\*\*$/.test(r)) return <b key={i}>{r.slice(2, -2)}</b>;
        if (/^#\d{1,6}$/.test(r)) {
          return (
            <Link key={i} href={`/fuvarozas2/megbizasok?reszlet=${r.slice(1)}`} className="font-semibold text-[var(--f2-blue)] hover:underline">
              {r}
            </Link>
          );
        }
        return <Fragment key={i}>{r}</Fragment>;
      })}
    </>
  );
}

/** Egyszerű jelölés: bekezdés, felsorolás, címsor. */
function Szoveg({ tartalom }: { tartalom: string }) {
  const sorok = tartalom.split("\n");
  return (
    <div className="flex flex-col gap-1">
      {sorok.map((s, i) => {
        const t = s.trim();
        if (!t) return <div key={i} className="h-1" />;
        const cim = t.match(/^#{1,4}\s+(.*)$/);
        if (cim) return <div key={i} className="pt-1 font-bold"><Sor szoveg={cim[1]} /></div>;
        const pont = t.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
        if (pont) return <div key={i} className="flex gap-1.5 pl-1"><span className="text-muted-foreground">•</span><span><Sor szoveg={pont[1]} /></span></div>;
        return <p key={i}><Sor szoveg={t} /></p>;
      })}
    </div>
  );
}

export function Seged({
  kezdoUzenetek, kezdoTudas, teendok, kezdoMuveletek, kezdoUtolsoMuveletek,
}: {
  kezdoUzenetek: SegedUzenet[];
  kezdoTudas: SegedTudas[];
  teendok: Jelzes[];
  /** Jóváhagyásra váró műveletek (újratöltés után is megmaradnak). */
  kezdoMuveletek: SegedMuvelet[];
  kezdoUtolsoMuveletek: SegedMuvelet[];
}) {
  const router = useRouter();
  const [uzenetek, setUzenetek] = useState(kezdoUzenetek);
  const [tudas, setTudas] = useState(kezdoTudas);
  const [javaslatok, setJavaslatok] = useState<string[]>([]);
  const [muveletek, setMuveletek] = useState(kezdoMuveletek);
  const [utolsok, setUtolsok] = useState(kezdoUtolsoMuveletek);
  const [muveletNyitva, setMuveletNyitva] = useState(false);
  const [bemenet, setBemenet] = useState("");
  const [mobilNyitva, setMobilNyitva] = useState(false);
  const [tudasNyitva, setTudasNyitva] = useState(false);
  const [ujSzabaly, setUjSzabaly] = useState("");
  const [pending, start] = useTransition();
  const aljRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    aljRef.current?.scrollIntoView({ block: "nearest" });
  }, [uzenetek.length, pending]);

  function kuld(szoveg: string) {
    const t = szoveg.trim();
    if (!t || pending) return;
    setBemenet("");
    setMobilNyitva(true);
    setUzenetek((u) => [...u, { id: `helyi-${Date.now()}`, szerep: "user", tartalom: t, eszkozok: [] }]);
    start(async () => {
      const r = await kuldSegednek(t);
      if (!r.ok) {
        toast.error(r.hiba);
        setUzenetek((u) => [...u, { id: `hiba-${Date.now()}`, szerep: "assistant", tartalom: `Hiba: ${r.hiba}`, eszkozok: [] }]);
        return;
      }
      setUzenetek((u) => [...u, r.uzenet]);
      if (r.javaslatok.length) setJavaslatok((j) => [...j, ...r.javaslatok]);
      if (r.muveletek.length) setMuveletek((m) => [...m, ...r.muveletek]);
    });
  }

  /** Innen fut le a művelet — a lista utána frissül (router.refresh). */
  function jovahagyMuvelet(m: SegedMuvelet) {
    start(async () => {
      const r = await jovahagyMuveletet(m.id);
      setMuveletek((x) => x.filter((y) => y.id !== m.id));
      if (r.ok) {
        setUtolsok((x) => [r.muvelet, ...x].slice(0, 10));
        toast.success(r.muvelet.eredmeny ?? "Megtörtént");
        router.refresh();
      } else {
        setUtolsok((x) => [{ ...m, allapot: "hiba" as const, eredmeny: r.hiba }, ...x].slice(0, 10));
        toast.error(r.hiba);
      }
    });
  }

  function elvetMuvelet(m: SegedMuvelet) {
    start(async () => {
      await elvetMuveletJavaslatot(m.id);
      setMuveletek((x) => x.filter((y) => y.id !== m.id));
      setUtolsok((x) => [{ ...m, allapot: "elvetve" as const, eredmeny: null }, ...x].slice(0, 10));
    });
  }

  function jovahagy(szoveg: string) {
    start(async () => {
      setTudas(await mentTudast(szoveg, "seged_javaslat"));
      setJavaslatok((j) => j.filter((x) => x !== szoveg));
      toast.success("Megjegyeztem");
    });
  }

  return (
    <section className="flex flex-col rounded-2xl border border-foreground/10 bg-card" aria-label="Segéd">
      <button
        type="button"
        onClick={() => setMobilNyitva((n) => !n)}
        className="flex min-h-11 items-center justify-between gap-2 px-4 py-2.5 text-left lg:pointer-events-none"
        aria-expanded={mobilNyitva}
      >
        <span className="text-base font-bold">Segéd</span>
        <span className="text-xs text-muted-foreground lg:hidden">{mobilNyitva ? "bezár ▴" : "megnyit ▾"}</span>
      </button>

      <div className={cn("flex-col gap-3 px-4 pb-4", mobilNyitva ? "flex" : "hidden", "lg:flex")}>
        {teendok.length > 0 && uzenetek.length === 0 ? (
          <div className="flex flex-col gap-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Teendők</div>
            {teendok.slice(0, 6).map((j) => (
              <button
                key={j.kulcs}
                type="button"
                disabled={pending}
                onClick={() => kuld(`Nézd meg ezt a teendőt, és mondd meg, mit csináljak: ${j.szoveg}`)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left text-sm",
                  j.sulyossag === "sulyos" ? "border-[var(--f2-red)]/40 text-[var(--f2-red)]" : j.sulyossag === "figyelmeztetes" ? "border-[var(--f2-amb)]/40" : "border-foreground/10"
                )}
              >
                {j.szoveg}
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex max-h-[60vh] min-h-24 flex-col gap-2.5 overflow-y-auto text-sm" aria-live="polite">
          {uzenetek.length === 0 ? (
            <p className="text-muted-foreground">
              Kérdezz bármit a fuvarokról, a kocsikról, a tervről vagy egy árról. A rendszer adataiból válaszolok. Módosítani is tudok, de csak javaslatot teszek — semmi nem történik, amíg jóvá nem hagyod.
            </p>
          ) : null}
          {uzenetek.map((u) => (
            <div
              key={u.id}
              className={cn(
                "rounded-xl px-3 py-2",
                u.szerep === "user" ? "self-end bg-[var(--f2-mint)] text-white" : "self-start bg-muted"
              )}
            >
              {u.szerep === "user" ? <p className="whitespace-pre-wrap">{u.tartalom}</p> : <Szoveg tartalom={u.tartalom} />}
            </div>
          ))}
          {pending ? <div className="self-start rounded-xl bg-muted px-3 py-2 text-muted-foreground">Nézem…</div> : null}
          <div ref={aljRef} />
        </div>

        {muveletek.map((m) => (
          <div key={m.id} className="flex flex-col gap-2 rounded-xl border-2 border-[var(--f2-amb)]/60 bg-[var(--f2-amb-l)]/40 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-1.5">
              <b>Ezt fogom tenni</b>
              {m.levelbol ? <span className="rounded-full bg-[var(--f2-amb)]/20 px-2 py-0.5 text-[11px] font-semibold">levél szövegéből</span> : null}
            </div>
            <span>{m.osszefoglalo}</span>
            <div className="flex gap-2">
              <button type="button" disabled={pending} onClick={() => jovahagyMuvelet(m)} className="rounded-lg bg-[var(--f2-amb)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-45">
                Jóváhagyom
              </button>
              <button type="button" disabled={pending} onClick={() => elvetMuvelet(m)} className="rounded-lg border border-foreground/15 px-3 py-1.5 text-xs font-semibold disabled:opacity-45">
                Elvetem
              </button>
            </div>
          </div>
        ))}

        {javaslatok.map((j) => (
          <div key={j} className="flex flex-col gap-2 rounded-xl border border-[var(--f2-mint)]/50 px-3 py-2 text-sm">
            <span><b>Megjegyezzem?</b> {j}</span>
            <div className="flex gap-2">
              <button type="button" disabled={pending} onClick={() => jovahagy(j)} className="rounded-lg bg-[var(--f2-mint)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-45">Megjegyzem</button>
              <button type="button" onClick={() => setJavaslatok((x) => x.filter((y) => y !== j))} className="rounded-lg border border-foreground/15 px-3 py-1.5 text-xs font-semibold">Nem</button>
            </div>
          </div>
        ))}

        {uzenetek.length === 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {GYORS_KERDESEK.map((k) => (
              <button key={k} type="button" disabled={pending} onClick={() => kuld(k)} className="rounded-full border border-foreground/15 px-3 py-1.5 text-xs">
                {k}
              </button>
            ))}
          </div>
        ) : null}

        <form
          onSubmit={(e) => { e.preventDefault(); kuld(bemenet); }}
          className="flex flex-col gap-2"
        >
          <textarea
            value={bemenet}
            onChange={(e) => setBemenet(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); kuld(bemenet); } }}
            rows={2}
            placeholder="Kérdezz, vagy másolj be egy levelet…"
            className="w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm"
            aria-label="Üzenet a segédnek"
          />
          <div className="flex items-center gap-2">
            <button type="submit" disabled={pending || !bemenet.trim()} className="rounded-lg bg-[var(--f2-mint)] px-3 py-2 text-sm font-bold text-white disabled:opacity-45">
              Küldés
            </button>
            {uzenetek.length > 0 ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => start(async () => { await ujBeszelgetes(); setUzenetek([]); setJavaslatok([]); setMuveletek([]); })}
                className="text-xs font-semibold text-muted-foreground hover:underline"
              >
                Új beszélgetés
              </button>
            ) : null}
            {utolsok.length > 0 ? (
              <button type="button" onClick={() => setMuveletNyitva((n) => !n)} className="ml-auto text-xs font-semibold text-[var(--f2-blue)] hover:underline">
                Mit tett ({utolsok.length})
              </button>
            ) : null}
            <button type="button" onClick={() => setTudasNyitva((n) => !n)} className={cn("text-xs font-semibold text-[var(--f2-blue)] hover:underline", utolsok.length === 0 && "ml-auto")}>
              Megtanult szabályok ({tudas.length})
            </button>
          </div>
        </form>

        {muveletNyitva ? (
          <div className="flex flex-col gap-1.5 rounded-xl bg-muted/60 p-3 text-xs">
            {utolsok.map((m) => (
              <div key={m.id} className="flex items-start gap-2">
                <span
                  className={cn(
                    "mt-0.5 shrink-0 font-bold",
                    m.allapot === "jovahagyva" ? "text-[var(--f2-mint)]" : m.allapot === "hiba" ? "text-[var(--f2-red)]" : "text-muted-foreground"
                  )}
                >
                  {m.allapot === "jovahagyva" ? "✓" : m.allapot === "hiba" ? "!" : "–"}
                </span>
                <span className="flex-1">
                  {m.osszefoglalo}
                  {m.eredmeny ? <span className="text-muted-foreground"> — {m.eredmeny}</span> : null}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {tudasNyitva ? (
          <div className="flex flex-col gap-1.5 rounded-xl bg-muted/60 p-3 text-sm">
            {tudas.length === 0 ? <span className="text-muted-foreground">Még semmit nem tanított neki senki.</span> : null}
            {tudas.map((t) => (
              <div key={t.id} className="flex items-start gap-2">
                <span className="flex-1">{t.szoveg}</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => start(async () => setTudas(await torolTudast(t.id)))}
                  className="text-xs font-semibold text-[var(--f2-red)] hover:underline"
                  aria-label={`Törlés: ${t.szoveg}`}
                >
                  törlés
                </button>
              </div>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const s = ujSzabaly.trim();
                if (!s) return;
                start(async () => { setTudas(await mentTudast(s)); setUjSzabaly(""); });
              }}
              className="mt-1 flex gap-2"
            >
              <input
                value={ujSzabaly}
                onChange={(e) => setUjSzabaly(e.target.value)}
                placeholder="Új szabály, pl. „EUCARGO: 45 nap fizetés”"
                className="min-w-0 flex-1 rounded-lg border border-foreground/15 bg-background px-3 py-1.5 text-sm"
              />
              <button type="submit" disabled={pending || !ujSzabaly.trim()} className="rounded-lg border border-foreground/15 px-3 py-1.5 text-xs font-semibold disabled:opacity-45">Hozzáad</button>
            </form>
          </div>
        ) : null}
      </div>
    </section>
  );
}
