"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { setLevelOsztaly, setLevelAllapot, kerCsatolmanyt, takaritsLeveleket, type LevelSor, type FigyeloAllapot } from "@/lib/fuvarozas2/levelek";
import { OSZTALY_CIMKE, TEENDO_OSZTALYOK, type LevelOsztaly } from "@/lib/fuvarozas2/level-osztalyozo";
import { formatIdo } from "@/components/fuvarozas2/kozos";
import { cn } from "@/lib/utils";

const SZIN: Partial<Record<LevelOsztaly, string>> = {
  megbizas: "bg-[var(--f2-mint)] text-white",
  modositas: "bg-[var(--f2-red-l)] text-[var(--f2-red)]",
  adatkeres: "bg-[var(--f2-amb-l)] text-[var(--f2-amb)]",
  okmanykeres: "bg-[var(--f2-amb)] text-white",
  papirok: "bg-[var(--f2-blue-l)] text-[var(--f2-blue)]",
  fizetes: "bg-[var(--f2-mint-l)] text-[var(--f2-mint)]",
};

export function LevelekNezet({
  levelek, allapot, szerkeszthet, aktivSzuro, takarithato,
}: {
  levelek: LevelSor[]; allapot: FigyeloAllapot & { beallitva: boolean; osszesen: number; mai: number; eletjelPerce: number | null };
  szerkeszthet: boolean; aktivSzuro: string;
  /** Hány nyitott levél nem teendő — ennyit vetne el a takarítás. */
  takarithato: number;
}) {
  // A percek a szerveren számolódnak (getFigyeloAllapot) — a render tiszta marad.
  const percek = allapot.eletjelPerce;
  const el = percek !== null && percek < 20;
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Gmail-figyelő</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <span className="flex items-center gap-2">
            <span className={cn("size-2.5 rounded-full", el ? "bg-[var(--f2-mint)]" : "bg-[var(--f2-red)]")} />
            {el ? `fut · utolsó életjel ${percek} perce` : allapot.beallitva ? `NEM fut — utolsó életjel ${percek} perce` : "még nincs beállítva"}
          </span>
          <span className="text-muted-foreground">{allapot.osszesen} levél · ma {allapot.mai}</span>
          {!allapot.beallitva ? (
            <span className="text-muted-foreground">A beállítás: <code className="rounded bg-muted px-1">docs/gmail-fuvar-figyelo.gs</code> a Google-fiókban (5 perc).</span>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-1">
        {[
          { k: "teendo", c: "Teendő" },
          { k: "uj", c: "Új" },
          { k: "megbizas", c: "Megbízás" },
          { k: "mind", c: "Mind" },
        ].map((f) => (
          <Link key={f.k} href={`/fuvarozas2/levelek?szuro=${f.k}`}
            className={cn("rounded-md px-3 py-1 text-sm", aktivSzuro === f.k ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60")}>{f.c}</Link>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">{levelek.length} levél</span>
        {szerkeszthet && takarithato > 0 ? <TakaritasGomb darab={takarithato} /> : null}
      </div>

      {levelek.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Nincs levél ebben a nézetben.</p> : null}
      <div className="flex flex-col gap-2">
        {levelek.map((l) => <LevelKartya key={l.id} l={l} szerkeszthet={szerkeszthet} />)}
      </div>
    </div>
  );
}

function LevelKartya({ l, szerkeszthet }: { l: LevelSor; szerkeszthet: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [nyitva, setNyitva] = useState(false);
  const osztaly = (l.kezi_osztaly ?? l.osztaly) as LevelOsztaly;
  const fut = (nev: string, fn: () => Promise<unknown>) =>
    start(async () => { await fn(); toast.success(nev); router.refresh(); });
  return (
    <div className={cn("rounded-xl bg-card p-3 text-sm ring-1 ring-foreground/10", l.allapot === "elvetve" && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", SZIN[osztaly] ?? "bg-muted text-muted-foreground")}>
          {OSZTALY_CIMKE[osztaly]}
        </span>
        {l.kezi_osztaly ? <span className="text-xs text-muted-foreground">(kézzel átsorolva)</span> : <span className="text-xs text-muted-foreground">{l.bizalom}%</span>}
        <span className="font-medium">{l.felado_nev || l.felado}</span>
        <span className="text-xs text-muted-foreground">{l.felado}</span>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">{formatIdo(l.erkezett)}</span>
      </div>
      <div className="mt-1 font-medium">{l.targy ?? "(nincs tárgy)"}</div>
      <div className="line-clamp-2 text-muted-foreground">{l.snippet}</div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {l.partner_nev ? <span>{l.partner_nev}</span> : null}
        {l.hivatkozas ? <span>hiv.: {l.hivatkozas}</span> : null}
        {l.rendszam ? <span>{l.rendszam}</span> : null}
        {l.csatolmany_nevek.length > 0 ? <span>📎 {l.csatolmany_nevek.join(", ")}</span> : null}
        {l.csatolmany_megjott_at ? <span className="text-[var(--f2-mint)]">Drive-ba került</span> : l.csatolmany_kell ? <span className="text-[var(--f2-amb)]">csatolmányra vár</span> : null}
        {l.allapot !== "uj" ? <span>{l.allapot}{l.allapot_by ? ` · ${l.allapot_by}` : ""}</span> : null}
        <button className="underline" onClick={() => setNyitva(!nyitva)}>{nyitva ? "kevesebb" : "miért ez?"}</button>
      </div>
      {nyitva ? <div className="mt-1 rounded-lg bg-muted/40 px-2 py-1 text-xs text-muted-foreground">{l.indoklas.join(" · ")}</div> : null}

      {szerkeszthet ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {l.gmail_thread_id ? (
            <Button size="xs" variant="outline" render={<a href={`https://mail.google.com/mail/u/0/#inbox/${l.gmail_thread_id}`} target="_blank" rel="noreferrer" />}>Megnyitás Gmailben</Button>
          ) : null}
          {l.drive_url ? <Button size="xs" variant="outline" render={<a href={l.drive_url} target="_blank" rel="noreferrer" />}>Irat a Drive-on</Button> : null}
          {!l.csatolmany_megjott_at && l.csatolmany_nevek.length > 0 && !l.csatolmany_kell ? (
            <Button size="xs" variant="secondary" disabled={pending} onClick={() => fut("Kérve — a figyelő 5 percen belül feltölti", () => kerCsatolmanyt(l.id))}>Irat a Drive-ba</Button>
          ) : null}
          {osztaly !== "megbizas" ? (
            <Button size="xs" variant="secondary" disabled={pending} onClick={() => fut("Megbízásnak jelölve", () => setLevelOsztaly(l.id, "megbizas"))}>Ez megbízás</Button>
          ) : null}
          {TEENDO_OSZTALYOK.includes(osztaly) && osztaly !== "egyeb" ? (
            <Button size="xs" variant="secondary" disabled={pending} onClick={() => fut("Nem teendő", () => setLevelOsztaly(l.id, "egyeb"))}>Nem teendő</Button>
          ) : null}
          {l.allapot === "uj" ? (
            <Button size="xs" disabled={pending} onClick={() => fut("Kész", () => setLevelAllapot(l.id, "feldolgozva"))}>Kész</Button>
          ) : (
            <Button size="xs" variant="outline" disabled={pending} onClick={() => fut("Visszatéve", () => setLevelAllapot(l.id, "uj"))}>Vissza a teendők közé</Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Takarítás: a nem teendős nyitott leveleket (hírlevél, számla, Timocom,
 * egyéb) elveti — a fuvaros leveleket nem bántja, és nem töröl, csak
 * „elvetve" állapotba teszi, tehát a Mind nézetben visszakereshető.
 */
function TakaritasGomb({ darab }: { darab: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [kerdez, setKerdez] = useState(false);
  if (!kerdez) {
    return (
      <button type="button" onClick={() => setKerdez(true)}
        className="rounded-md border border-foreground/15 px-3 py-1 text-xs font-medium hover:bg-muted">
        Takarítás ({darab})
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1 rounded-md bg-[var(--f2-amb-l)] px-2 py-1 text-xs text-[var(--f2-amb)]">
      {darab} nem teendős levél elvetése?
      <Button size="xs" disabled={pending} onClick={() =>
        start(async () => {
          const r = await takaritsLeveleket();
          toast.success(`${r.elvetve} levél elvetve`);
          setKerdez(false);
          router.refresh();
        })
      }>Igen</Button>
      <Button size="xs" variant="ghost" onClick={() => setKerdez(false)}>Mégse</Button>
    </span>
  );
}
