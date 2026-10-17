"use client";

// Hét nézet B1 (docs/het-b1-terv.md): bejegyzés felvitele (a B3 terv ablaka) és törlése.

import { useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BEJEGYZES_TIPUSOK, ellenorizBejegyzes, type BejegyzesTipus } from "@/lib/fuvarozas2/bejegyzes-alap";
import { ujBejegyzes, torolBejegyzes } from "@/lib/fuvarozas2/bejegyzes-actions";
import { kocsiSzin } from "@/lib/fuvarozas2/kocsi-szin";
import { BejegyzesIkon } from "@/components/fuvarozas2/bejegyzes-ikon";

export type FelvitelKocsi = { kod: string; sofor: string; szin: string | null };

const NAPNEV = ["vasárnap", "hétfő", "kedd", "szerda", "csütörtök", "péntek", "szombat"];
const HONAP = ["január", "február", "március", "április", "május", "június", "július", "augusztus", "szeptember", "október", "november", "december"];
const hosszuNap = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : `${NAPNEV[d.getUTCDay()]}, ${HONAP[d.getUTCMonth()]} ${d.getUTCDate()}.`;
};
const mezo = "h-11 w-full rounded-xl bg-background px-3 text-sm ring-1 ring-foreground/15 outline-none focus:ring-2 focus:ring-[var(--kc)]";

export function BejegyzesFelvitel({
  kocsik, kocsiKod, nap, vegez, mod, szerk,
}: {
  /** A `fuvarozas` modul szerkesztési joga (a szerver-akció is ezt kéri). */
  szerk: boolean;
  kocsik: FelvitelKocsi[];
  kocsiKod?: string;
  nap: string;
  /** A becslő szerint aznap mikor és hol végez a kocsi — tájékoztatás az ablakban. */
  vegez?: { ido: string; varos: string } | null;
  /** „gomb”: a lap tetején; „cella”: egy szabad cellában. */
  mod: "gomb" | "cella";
}) {
  const router = useRouter();
  const [nyitva, setNyitva] = useState(false);
  const [fut, inditas] = useTransition();
  const [kod, setKod] = useState(kocsiKod ?? kocsik[0]?.kod ?? "");
  const [datum, setDatum] = useState(nap);
  const [tipus, setTipus] = useState<BejegyzesTipus>("szerviz");
  const [egeszNap, setEgeszNap] = useState(false);
  const [tol, setTol] = useState("08:00");
  const [ig, setIg] = useState("10:00");
  const [hely, setHely] = useState("");
  const [megj, setMegj] = useState("");
  const [heti, setHeti] = useState(false);
  const [hetiIg, setHetiIg] = useState("");
  const [hiba, setHiba] = useState<string | null>(null);

  if (!szerk) return mod === "cella" ? <div className="rounded-lg px-2 py-1 text-xs text-muted-foreground/70">szabad</div> : null;

  const kocsi = kocsik.find((k) => k.kod === kod);
  const sz = kocsiSzin(kocsi?.szin);
  const valtozok = { "--kc": sz.c, "--kl": sz.l, "--kd": sz.d } as CSSProperties;
  const ugyanaz = kod === kocsiKod && datum === nap;

  const nyit = () => {
    setKod(kocsiKod ?? kocsik[0]?.kod ?? ""); setDatum(nap); setHiba(null); setNyitva(true);
  };
  const ment = () => {
    const be = { jarmuKod: kod, tipus, nap: datum, egeszNap, tol, ig, hely, megjegyzes: megj, ismetles: heti ? "heti" : "nincs", ismetlesIg: hetiIg };
    const e = ellenorizBejegyzes(be);
    if (!e.ok) { setHiba(e.hiba); return; }
    inditas(async () => {
      const r = await ujBejegyzes(be).catch((x) => ({ ok: false as const, hiba: x instanceof Error ? x.message : "Nem sikerült menteni." }));
      if (!r.ok) { setHiba(r.hiba); return; }
      toast.success(`Bejegyzés mentve · ${hosszuNap(datum)}`);
      setNyitva(false); setHely(""); setMegj(""); setHeti(false); setHetiIg("");
      router.refresh();
    });
  };

  return (
    <>
      {mod === "gomb" ? (
        <button type="button" onClick={nyit}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-card px-3.5 text-sm font-medium ring-1 ring-foreground/15 hover:bg-muted">
          <span aria-hidden>＋</span> Bejegyzés
        </button>
      ) : (
        <button type="button" onClick={nyit} title="Bejegyzés erre a napra (szerviz, gumis, mosás …)"
          className="group flex w-full items-center justify-between rounded-lg px-2 py-1 text-left text-xs text-muted-foreground/70 hover:bg-muted/60 hover:text-foreground">
          <span>szabad</span>
          <span className="opacity-0 transition-opacity group-hover:opacity-100" aria-hidden>＋</span>
          <span className="sr-only">bejegyzés felvitele</span>
        </button>
      )}
      <Dialog open={nyitva} onOpenChange={setNyitva}>
        <DialogContent className="fuvarozas2 max-h-[92vh] overflow-y-auto sm:max-w-lg" style={valtozok}>
          <DialogHeader>
            <DialogTitle>Bejegyzés</DialogTitle>
            <DialogDescription>Nem fuvar — szerviz, gumis, mosás … A kocsi aznap ennyi időre foglalt.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 text-sm">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Kocsi">
              {kocsik.map((k) => {
                const s = kocsiSzin(k.szin);
                const aktiv = k.kod === kod;
                return (
                  <button key={k.kod} type="button" role="radio" aria-checked={aktiv} onClick={() => setKod(k.kod)}
                    className={cn("flex h-10 items-center gap-2 rounded-xl px-3 ring-1", aktiv ? "font-semibold ring-2" : "ring-foreground/15 hover:bg-muted")}
                    style={aktiv ? { background: s.l, color: s.d, boxShadow: `inset 0 0 0 2px ${s.c}` } : undefined}>
                    <span className="grid size-6 place-items-center rounded-lg text-xs font-bold text-white" style={{ background: s.c }}>{k.sofor.slice(0, 1).toUpperCase()}</span>
                    {k.sofor}
                  </button>
                );
              })}
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Nap · {hosszuNap(datum)}</span>
              <input type="date" className={mezo} value={datum} onChange={(e) => setDatum(e.target.value)} />
            </label>
            <div>
              <div className="mb-1.5 text-xs text-muted-foreground">Mi lesz?</div>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Típus">
                {BEJEGYZES_TIPUSOK.map((t) => {
                  const aktiv = t.kod === tipus;
                  return (
                    <button key={t.kod} type="button" role="radio" aria-checked={aktiv} onClick={() => setTipus(t.kod)}
                      className={cn("flex min-h-11 items-center gap-2 rounded-xl px-3 text-left", aktiv ? "bg-[var(--kl)] font-semibold text-[var(--kd)] ring-2 ring-[var(--kc)]" : "bg-muted/60 ring-1 ring-foreground/10 hover:bg-muted")}>
                      <BejegyzesIkon tipus={t.kod} className="size-4 shrink-0" />{t.nev}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">tól</span>
                <input type="time" className={mezo} value={tol} disabled={egeszNap} onChange={(e) => setTol(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">ig (kb.)</span>
                <input type="time" className={mezo} value={ig} disabled={egeszNap} onChange={(e) => setIg(e.target.value)} />
              </label>
              <label className="col-span-2 flex min-h-11 items-center gap-2">
                <input type="checkbox" className="size-4 accent-[var(--kc)]" checked={egeszNap} onChange={(e) => setEgeszNap(e.target.checked)} /> egész nap
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">hol</span>
              <input className={mezo} value={hely} maxLength={120} placeholder="pl. DAF szerviz, Nyíregyháza" onChange={(e) => setHely(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">megjegyzés</span>
              <input className={mezo} value={megj} maxLength={500} placeholder="pl. olajcsere, fékbetét" onChange={(e) => setMegj(e.target.value)} />
            </label>
            {new Date(`${datum}T12:00:00Z`).getUTCDay() === 0 ? (
              <p className="rounded-xl bg-[var(--f2-amb-l)] px-3 py-2 text-xs text-[#5a3806]">Vasárnap — a Hét táblán nem jelenik meg (vasárnapi oszlop nincs).</p>
            ) : null}
            {ugyanaz && vegez ? (
              <p className="rounded-xl bg-[var(--f2-amb-l)] px-3 py-2 text-xs text-[#5a3806]">
                A becslő szerint aznap ~{vegez.ido}-kor végez · {vegez.varos}.
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex min-h-11 items-center gap-2">
                <input type="checkbox" className="size-4 accent-[var(--kc)]" checked={heti} onChange={(e) => setHeti(e.target.checked)} /> hetente ismétlődik
              </label>
              {heti ? (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  eddig (üres: nincs vége)
                  <input type="date" className={cn(mezo, "w-40")} value={hetiIg} min={datum} onChange={(e) => setHetiIg(e.target.value)} />
                </label>
              ) : null}
            </div>
            {hiba ? <p className="rounded-xl bg-[var(--f2-red-l)] px-3 py-2 text-[var(--f2-red)]" role="alert">{hiba}</p> : null}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setNyitva(false)} className="h-11 rounded-xl px-4 ring-1 ring-foreground/15 hover:bg-muted">Mégse</button>
              <button type="button" onClick={ment} disabled={fut} className="h-11 rounded-xl bg-[var(--kc)] px-5 font-semibold text-white disabled:opacity-60">
                {fut ? "Mentés…" : "Mentés"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function BejegyzesTorles({ id, cimke, ismetlodo, szerk }: { id: string; cimke: string; ismetlodo: boolean; szerk: boolean }) {
  const router = useRouter();
  const [fut, inditas] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  if (!szerk) return null;
  const torol = async () => {
    const kerdes = ismetlodo ? `Törlöd a(z) „${cimke}” bejegyzést? Ismétlődő — az összes alkalma törlődik.` : `Törlöd a(z) „${cimke}” bejegyzést?`;
    if (!(await confirm(kerdes, { title: "Bejegyzés törlése", confirmLabel: "Törlés" }))) return;
    inditas(async () => {
      const r = await torolBejegyzes(id).catch(() => ({ ok: false }));
      if (!r.ok) { toast.error("Nem sikerült törölni."); return; }
      router.refresh();
    });
  };
  return (
    <>
      <button type="button" onClick={torol} disabled={fut} title="Bejegyzés törlése" aria-label={`${cimke} törlése`}
        className="-my-1 -mr-1 ml-auto grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground opacity-60 hover:bg-foreground/10 hover:opacity-100">
        <X className="size-3.5" aria-hidden />
      </button>
      {confirmDialog}
    </>
  );
}
