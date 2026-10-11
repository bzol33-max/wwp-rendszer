"use client";

// Számlázási segéd (2026-10-11): a „Számlázok” gomb mögött a számla mezői a
// számla sorrendjében, mindegyik mellett másolás ikonnal — a Számlázz.hu-ba
// mezőnként átmásolható. Kiállítás után a számlaszám a meglévő
// setSzamlaSzam-mal kerül a megbízásra (számlázható → számlázva).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getSzamlazasiSeged, type SzamlazasiSeged } from "@/lib/fuvarozas2/szamlazasi-seged";
import { setSzamlaSzam } from "@/lib/fuvarozas2/megbizasok";
import { mindSzovegkent, type SegedMezo } from "@/lib/fuvarozas2/szamlazasi-seged-alap";

async function vagolapra(szoveg: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(szoveg);
    return true;
  } catch {
    // Régebbi böngésző / nem biztonságos környezet: rejtett szövegdoboz.
    try {
      const t = document.createElement("textarea");
      t.value = szoveg;
      t.style.position = "fixed";
      t.style.opacity = "0";
      document.body.appendChild(t);
      t.select();
      const ok = document.execCommand("copy");
      t.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function MasolGomb({ kulcs, ertek, cimke, masolt, onMasol }: { kulcs: string; ertek: string; cimke: string; masolt: string | null; onMasol: (k: string, v: string) => void }) {
  const kesz = masolt === kulcs;
  return (
    <button
      type="button"
      aria-label={`${cimke} másolása`}
      title="Másolás"
      onClick={() => onMasol(kulcs, ertek)}
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-md border transition-colors ${kesz ? "border-[var(--f2-mint)] bg-[var(--f2-mint)] text-white" : "border-border bg-background text-muted-foreground hover:border-[var(--f2-mint)] hover:text-[var(--f2-mint)]"}`}
    >
      {kesz ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
    </button>
  );
}

function Mezo({ m, masolt, onMasol }: { m: SegedMezo; masolt: string | null; onMasol: (k: string, v: string) => void }) {
  return (
    <div className="flex min-h-9 items-center gap-2">
      <span className="w-36 shrink-0 text-xs text-muted-foreground">{m.cimke}</span>
      {m.ertek ? (
        <>
          <span className="min-w-0 break-words text-sm font-semibold tabular-nums">{m.ertek}</span>
          {m.masolhato !== false ? <MasolGomb kulcs={m.kulcs} ertek={m.ertek} cimke={m.cimke} masolt={masolt} onMasol={onMasol} /> : null}
          {masolt === m.kulcs ? <span className="text-[11px] font-semibold text-[var(--f2-mint)]">másolva</span> : null}
        </>
      ) : (
        <span className="rounded-md bg-[var(--f2-amb-l)] px-2 py-0.5 text-xs font-semibold text-[var(--f2-amb)]">hiányzik</span>
      )}
      {m.megjegyzes ? <span className="text-[11px] text-muted-foreground">{m.megjegyzes}</span> : null}
    </div>
  );
}

function mezokbol(a: SzamlazasiSeged) {
  const vevo: SegedMezo[] = [
    { kulcs: "nev", cimke: "Név", ertek: a.vevo.nev },
    { kulcs: "irsz", cimke: "Irányítószám", ertek: a.vevo.irsz },
    { kulcs: "telepules", cimke: "Település", ertek: a.vevo.telepules },
    { kulcs: "cim", cimke: "Cím", ertek: a.vevo.cim },
    { kulcs: "adoszam", cimke: "Adószám", ertek: a.vevo.adoszam },
    ...(a.vevo.euAdoszam ? [{ kulcs: "eu", cimke: "Közösségi adószám", ertek: a.vevo.euAdoszam }] : []),
  ];
  const fizetes: SegedMezo[] = [
    { kulcs: "mod", cimke: "Fizetési mód", ertek: a.fizetesiMod },
    { kulcs: "rend", cimke: "Rendelésszám", ertek: a.rendelesszam.ertek ?? (a.rendelesszam.kotelezo ? null : "—"), masolhato: !!a.rendelesszam.ertek },
    { kulcs: "telj", cimke: "Teljesítés dátuma", ertek: a.teljesites },
    { kulcs: "kiall", cimke: "Kiállítás dátuma", ertek: a.kiallitas, megjegyzes: "ma — a Számlázz.hu alapból ezt adja", masolhato: false },
    { kulcs: "hat", cimke: "Fizetési határidő", ertek: a.hatarido },
  ];
  const tetel: SegedMezo[] = [
    { kulcs: "megn", cimke: "Megnevezés", ertek: a.megnevezes },
    ...(a.reszlet ? [{ kulcs: "reszlet", cimke: "Megállók (2. sor)", ertek: a.reszlet }] : []),
    { kulcs: "menny", cimke: "Mennyiség", ertek: `${a.mennyiseg}`, megjegyzes: a.egyseg },
    { kulcs: "ar", cimke: "Nettó egységár", ertek: a.egysegar },
    { kulcs: "penznem", cimke: "Pénznem", ertek: a.penznem },
    { kulcs: "afa", cimke: "Áfakulcs", ertek: `${a.afaKulcs}%`, masolhato: false },
  ];
  const kuldes: SegedMezo[] = [{ kulcs: "mail", cimke: "E-mail a számlának", ertek: a.email, megjegyzes: a.emailForras ? `(${a.emailForras})` : null }];
  return { vevo, fizetes, tetel, kuldes };
}

export function SzamlazasiSegedGomb({ megbizasId, elszamolasJog }: { megbizasId: string; elszamolasJog: boolean }) {
  const router = useRouter();
  const [nyitva, setNyitva] = useState(false);
  const [adat, setAdat] = useState<SzamlazasiSeged | null>(null);
  const [hiba, setHiba] = useState<string | null>(null);
  const [masolt, setMasolt] = useState<string | null>(null);
  const [szamlaSzam, setSzamlaSzamErtek] = useState("");
  const [toltes, startToltes] = useTransition();
  const [mentes, startMentes] = useTransition();

  function megnyit() {
    setNyitva(true);
    setHiba(null);
    startToltes(async () => {
      try {
        const a = await getSzamlazasiSeged(megbizasId);
        if (!a) setHiba("Ehhez a megbízáshoz nem készíthető számla (nem bérfuvar).");
        setAdat(a);
        if (a?.elozoSzamla) setSzamlaSzamErtek(a.elozoSzamla.szamlaszam.replace(/\d+$/, ""));
      } catch (e) {
        setHiba(e instanceof Error ? e.message : "Nem sikerült betölteni.");
      }
    });
  }

  async function masol(kulcs: string, ertek: string) {
    if (await vagolapra(ertek)) setMasolt(kulcs);
    else toast.error("A másolás nem sikerült — jelöld ki és másold kézzel.");
  }

  const m = adat ? mezokbol(adat) : null;

  return (
    <>
      <Button size="sm" onClick={megnyit} className="bg-[var(--f2-mint)] text-white hover:bg-[var(--f2-mint)]/90">Számlázok</Button>
      <Dialog open={nyitva} onOpenChange={setNyitva}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Számlázási segéd</DialogTitle>
            <DialogDescription>{adat?.fejlec ?? "mezőnként másold át a Számlázz.hu-ba, a számla sorrendjében"}</DialogDescription>
          </DialogHeader>
          {toltes && !adat ? <p className="text-sm text-muted-foreground">Betöltés…</p> : null}
          {hiba ? <p className="text-sm text-[var(--f2-red)]">{hiba}</p> : null}
          {adat && m ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="flex flex-col gap-5 rounded-lg border bg-background p-5">
                <div className="flex items-start justify-between gap-4 border-b pb-3 text-xs text-muted-foreground">
                  <span>Eladó: Well-worn Pallet Kft. — a Számlázz.hu tölti, nem kell másolni</span>
                  <span className="text-right"><b className="block text-base tracking-wider text-foreground">SZÁMLA</b>sorszámot a Számlázz.hu ad</span>
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                  <section className="flex flex-col">
                    <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Vevő</h3>
                    {m.vevo.map((x) => <Mezo key={x.kulcs} m={x} masolt={masolt} onMasol={masol} />)}
                    <span className="mt-1 text-[11px] text-muted-foreground">forrás: {adat.vevo.forras}</span>
                  </section>
                  <section className="flex flex-col">
                    <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Fizetés és dátumok</h3>
                    {m.fizetes.map((x) => <Mezo key={x.kulcs} m={x} masolt={masolt} onMasol={masol} />)}
                    {adat.rendelesszam.forras ? <span className="text-[11px] text-muted-foreground">rendelésszám: {adat.rendelesszam.forras}</span> : null}
                    {!adat.rendelesszam.ertek && adat.rendelesszam.kotelezo ? (
                      <span className="text-[11px] text-[var(--f2-amb)]">
                        Sem a megbízáson, sem a megbízó levelében nincs.{" "}
                        <a href={`/fuvarozas2/megbizasok?reszlet=${adat.megbizasId}&szerk=1`} className="font-semibold underline">Beírom a megbízásba (pozíciószám) →</a>
                      </span>
                    ) : null}
                    <span className="text-[11px] text-muted-foreground">határidő: {adat.hataridoNap} nap — {adat.hataridoForras}</span>
                  </section>
                </div>
                <section className="flex flex-col border-t pt-3">
                  <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Tétel</h3>
                  {m.tetel.map((x) => <Mezo key={x.kulcs} m={x} masolt={masolt} onMasol={masol} />)}
                  {adat.osszeg ? (
                    <div className="mt-2 flex flex-wrap items-baseline justify-end gap-x-6 gap-y-1 text-sm tabular-nums">
                      <span className="text-muted-foreground">nettó {adat.osszeg.netto}</span>
                      <span className="text-muted-foreground">áfa {adat.osszeg.afa}</span>
                      <span className="text-lg font-bold">{adat.osszeg.brutto} {adat.penznem === "HUF" ? "Ft" : adat.penznem}</span>
                    </div>
                  ) : null}
                  {adat.devizas ? (
                    <p className="mt-2 text-xs text-muted-foreground">Devizás számla: a Számlázz.hu-ban <b className="text-foreground">Árfolyam: MNB</b>, a teljesítés napjával ({adat.teljesites}). A forintos áfát és bruttót a Számlázz.hu írja a számla aljára.</p>
                  ) : null}
                </section>
                <section className="flex flex-col border-t pt-3">
                  <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Küldés</h3>
                  {m.kuldes.map((x) => <Mezo key={x.kulcs} m={x} masolt={masolt} onMasol={masol} />)}
                  <span className="text-[11px] text-muted-foreground">csatolmány: a fuvarlevél-fotók ({adat.cmrDb} db) — ehhez a fuvarhoz tartozót küldd</span>
                </section>
              </div>

              <div className="flex flex-col gap-3">
                <div className="rounded-lg border bg-background p-4">
                  <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Ellenőrzés kiállítás előtt</h3>
                  <ul className="flex flex-col gap-2 text-sm">
                    {adat.ellenorzes.map((e, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className={`mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${e.ok ? "bg-[var(--f2-mint)]" : e.blokkol ? "bg-[var(--f2-red)]" : "bg-[var(--f2-amb)]"}`}>{e.ok ? "✓" : "!"}</span>
                        <span>{e.szoveg}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-col gap-2 rounded-lg border bg-background p-4">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Kiállítás után</h3>
                  <label htmlFor="seged-szamlaszam" className="text-sm">Számlaszám a Számlázz.hu-ból</label>
                  <Input id="seged-szamlaszam" value={szamlaSzam} onChange={(e) => setSzamlaSzamErtek(e.target.value)} placeholder="WLLWR-2026-…" disabled={!elszamolasJog || mentes} />
                  <Button
                    disabled={!elszamolasJog || mentes || !adat.kiallithato || !/\d+$/.test(szamlaSzam.trim())}
                    onClick={() => startMentes(async () => {
                      const r = await setSzamlaSzam(adat.megbizasId, szamlaSzam.trim());
                      if (r.ok) { toast.success("Számlaszám mentve"); setNyitva(false); router.refresh(); } else toast.error(r.hiba);
                    })}
                  >
                    Kiállítva — számlaszám mentése
                  </Button>
                  {!adat.kiallithato ? <span className="text-xs text-[var(--f2-red)]">Előbb a piros tételeket kell rendezni.</span> : null}
                  {adat.elozoSzamla ? <span className="text-[11px] text-muted-foreground">legutóbbi számla ennek a megbízónak: {adat.elozoSzamla.szamlaszam} ({adat.elozoSzamla.kiallitas})</span> : null}
                </div>
                <Button variant="outline" onClick={() => masol("mind", mindSzovegkent([...m.vevo, ...m.fizetes, ...m.tetel, ...m.kuldes]))}>
                  {masolt === "mind" ? "Minden mező másolva" : "Mind másolása egyben (szövegként)"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
