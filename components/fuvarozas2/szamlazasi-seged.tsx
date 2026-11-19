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
import { PAPIR_HIANY_SZOVEG } from "@/lib/megbizasok/papir-alap";
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

// --- A Számlázz.hu „Számla szerkesztés” oldalának mása (2026-11-19, S7 terv) ---
// Minden mező ott van, ahol a böngészőben: balra a számla adatai, jobbra a
// PARTNER, alul a Tételek. A kék keretes, számozott mezőket kell átmásolni
// (a szám a kitöltés sorrendje), a halvány mezők a Számlázz.hu alapértékei.

type UrlapMezo = { kulcs: string; ertek: string | null; auto?: boolean; hiany?: boolean };

function UMezo({ m, szam, kesz, onMasol, cimke, className }: { m: UrlapMezo; szam?: number; kesz: string[]; onMasol: (k: string, v: string) => void; cimke: string; className?: string }) {
  const megvan = kesz.includes(m.kulcs);
  if (m.auto) {
    return <div className={`flex h-7 items-center border border-foreground/15 bg-muted/40 px-2 text-[13px] text-muted-foreground ${className ?? ""}`}>{m.ertek ?? ""}</div>;
  }
  return (
    <div className={`flex items-center gap-1.5 ${className ?? ""}`}>
      {szam ? <span className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${megvan ? "bg-[var(--f2-mint)]" : "bg-primary"}`}>{megvan ? "✓" : szam}</span> : null}
      {m.ertek ? (
        <button
          type="button"
          title="Kattints a másoláshoz"
          aria-label={`${cimke} másolása`}
          onClick={() => onMasol(m.kulcs, m.ertek!)}
          className={`flex h-7 min-w-0 flex-1 items-center justify-between gap-2 border bg-background px-2 text-left text-[13px] font-semibold tabular-nums ${megvan ? "border-[var(--f2-mint)] ring-2 ring-[var(--f2-mint)]/25" : "border-primary ring-2 ring-primary/20 hover:bg-primary/5"}`}
        >
          <span className="truncate">{m.ertek}</span>
          {megvan ? <Check className="size-3.5 shrink-0 text-[var(--f2-mint)]" aria-hidden /> : <Copy className="size-3.5 shrink-0 text-primary" aria-hidden />}
        </button>
      ) : (
        <span className="flex h-7 flex-1 items-center border border-[var(--f2-amb)] bg-[var(--f2-amb-l)] px-2 text-xs font-semibold text-[var(--f2-amb)]">hiányzik</span>
      )}
    </div>
  );
}

function SzamlazzUrlap({ adat, kesz, onMasol }: { adat: SzamlazasiSeged; kesz: string[]; onMasol: (k: string, v: string) => void }) {
  // A sorszámok a kitöltés sorrendjében: partner → dátumok → tétel → e-mail.
  let n = 0;
  const sz = () => ++n;
  const cim = "mb-1 mt-2.5 block text-[13px] font-bold";
  const cimV = "mb-1 mt-2.5 block text-[13px]";
  const k = { kesz, onMasol };
  const deviza = adat.penznem === "HUF" ? "Ft" : adat.penznem;
  const nNev = sz(), nAdo = sz(), nEu = adat.vevo.euAdoszam ? sz() : 0, nIrsz = sz(), nTel = sz(), nCim = sz();
  const nTelj = sz(), nHat = sz(), nDev = adat.devizas ? sz() : 0, nRend = adat.rendelesszam.ertek || adat.rendelesszam.kotelezo ? sz() : 0;
  const nMegn = sz(), nReszlet = adat.reszlet ? sz() : 0, nAr = sz(), nMail = sz();
  return (
    <div className="overflow-hidden rounded-lg border bg-background font-[Arial,Helvetica,sans-serif] text-foreground">
      <div className="px-5 pt-4">
        <div className="flex items-end">
          <span className="w-40 pb-1.5 text-lg font-bold text-[#00c16e]">Számla</span>
          <span className="bg-muted px-3 py-2 text-xs text-muted-foreground">Díjbekérő · Előlegszámla · Szállítólevél · Nyugta</span>
        </div>
        <div className="mb-3 h-1 bg-[#00c16e]" />
        <div className="grid gap-8 md:grid-cols-2">
          <section>
            <div className="text-xs tracking-wide">SZÁMLAKIBOCSÁTÓ</div>
            <div className="mt-2 text-base font-bold text-[#4a5a85]">Well-worn Pallet Kft.</div>
            <span className={cim}>Bankszámlaszám</span>
            <UMezo m={{ kulcs: "bank", ertek: "UniCredit — alapérték", auto: true }} cimke="Bankszámlaszám" {...k} />
            <div className="grid grid-cols-2 gap-4">
              <div><span className={cim}>Számla típusa</span><UMezo m={{ kulcs: "tipus", ertek: "ahogy szoktad", auto: true }} cimke="Számla típusa" {...k} /></div>
              <div><span className={cim}>Számlaszám előtag</span><UMezo m={{ kulcs: "elotag", ertek: "WLLWR", auto: true }} cimke="Előtag" {...k} /></div>
            </div>
            <div className="mt-3 bg-muted/60 px-3 pb-4 pt-1">
              <div className="grid grid-cols-2 gap-4">
                <div><span className={cim}>Teljesítés</span><UMezo m={{ kulcs: "telj", ertek: adat.teljesites }} szam={nTelj} cimke="Teljesítés" {...k} /></div>
                <div><span className={cim}>Fizetési mód</span><UMezo m={{ kulcs: "mod", ertek: adat.fizetesiMod, auto: true }} cimke="Fizetési mód" {...k} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className={cim}>Keltezés</span>
                  <b className="text-[13px]">{adat.kiallitas}</b> <span className="text-[11px] text-muted-foreground">(ma)</span>
                  <div className="mt-1 text-[11px] text-muted-foreground">határidő-gomb: <b className="rounded bg-primary/15 px-1 text-primary">+{adat.hataridoNap}</b> <span>— {adat.hataridoForras}</span></div>
                </div>
                <div><span className={cim}>Fizetési határidő</span><UMezo m={{ kulcs: "hat", ertek: adat.hatarido }} szam={nHat} cimke="Fizetési határidő" {...k} /></div>
              </div>
              <span className={cimV}>Deviza</span>
              <UMezo m={{ kulcs: "penznem", ertek: deviza, auto: !adat.devizas }} szam={nDev || undefined} cimke="Deviza" className="w-32" {...k} />
              {adat.devizas ? <p className="mt-1 text-[11px] text-muted-foreground">Devizás: <b className="text-foreground">Árfolyam: MNB</b>, a teljesítés napjával ({adat.teljesites}).</p> : null}
              <span className={cimV}>Számla nyelve</span>
              <UMezo m={{ kulcs: "nyelv", ertek: "magyar", auto: true }} cimke="Számla nyelve" className="w-44" {...k} />
              <span className={cimV}>Rendelésszám</span>
              {nRend ? <UMezo m={{ kulcs: "rend", ertek: adat.rendelesszam.ertek }} szam={nRend} cimke="Rendelésszám" className="w-64" {...k} /> : <UMezo m={{ kulcs: "rend", ertek: "nem kell", auto: true }} cimke="Rendelésszám" className="w-64" {...k} />}
              {adat.rendelesszam.forras ? <div className="mt-1 text-[11px] text-muted-foreground">{adat.rendelesszam.forras}</div> : null}
              {!adat.rendelesszam.ertek && adat.rendelesszam.kotelezo ? (
                <div className="mt-1 text-[11px] text-[var(--f2-amb)]">Sem a megbízáson, sem a megbízó levelében nincs. <a href={`/fuvarozas2/megbizasok?reszlet=${adat.megbizasId}&szerk=1`} className="font-semibold underline">Beírom a megbízásba →</a></div>
              ) : null}
            </div>
          </section>
          <section>
            <div className="text-xs tracking-wide">PARTNER</div>
            <span className={cim}>Cégnév/név</span>
            <UMezo m={{ kulcs: "nev", ertek: adat.vevo.nev }} szam={nNev} cimke="Cégnév" {...k} />
            <div className="grid grid-cols-2 gap-3">
              <div><span className={cim}>Adószám</span><UMezo m={{ kulcs: "adoszam", ertek: adat.vevo.adoszam }} szam={nAdo} cimke="Adószám" {...k} /></div>
              <div><span className={cim}>Közösségi adószám</span><UMezo m={{ kulcs: "eu", ertek: adat.vevo.euAdoszam ?? "", auto: !adat.vevo.euAdoszam }} szam={nEu || undefined} cimke="Közösségi adószám" {...k} /></div>
            </div>
            <div className="mt-4 text-[13px] font-bold text-[#4a5a85]">Számlázási cím</div>
            <span className={cimV}>Ország</span>
            <UMezo m={{ kulcs: "orszag", ertek: "", auto: true }} cimke="Ország" {...k} />
            <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-3">
              <div><span className={cimV}>Irányítószám</span><UMezo m={{ kulcs: "irsz", ertek: adat.vevo.irsz }} szam={nIrsz} cimke="Irányítószám" {...k} /></div>
              <div><span className={cimV}>Település</span><UMezo m={{ kulcs: "telepules", ertek: adat.vevo.telepules }} szam={nTel} cimke="Település" {...k} /></div>
            </div>
            <span className={cimV}>Utca, házszám</span>
            <UMezo m={{ kulcs: "cim", ertek: adat.vevo.cim }} szam={nCim} cimke="Utca, házszám" {...k} />
            <div className="mt-1 text-[11px] text-muted-foreground">forrás: {adat.vevo.forras}</div>
            <div className="mt-4 border-t border-dashed border-foreground/40" />
            <span className={cim}>E-mail cím</span>
            <UMezo m={{ kulcs: "mail", ertek: adat.email }} szam={nMail} cimke="E-mail cím" {...k} />
            <div className="mt-1 text-[11px] text-muted-foreground">{adat.emailForras ? `(${adat.emailForras}) · ` : ""}csatolmány: a fuvarlevél-fotók ({adat.cmrDb} db)</div>
          </section>
        </div>
      </div>
      <div className="mt-4 bg-[#c9d3e3]/70 px-5 pb-4 pt-3">
        <div className="mb-1.5 text-base font-bold text-[#4a5a85]">Tételek</div>
        <div className="grid grid-cols-[minmax(0,3fr)_3.5rem_3.5rem_minmax(0,1.3fr)_4rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 text-xs">
          <span>Tétel neve</span><span>Menny.</span><span>Egys.</span><span>Nettó egységár</span><span>Áfa</span><span className="text-right">Nettó ár</span><span className="text-right">Bruttó ár</span>
          <UMezo m={{ kulcs: "megn", ertek: adat.megnevezes }} szam={nMegn} cimke="Tétel neve" {...k} />
          <UMezo m={{ kulcs: "menny", ertek: `${adat.mennyiseg}`, auto: true }} cimke="Mennyiség" {...k} />
          <UMezo m={{ kulcs: "egys", ertek: adat.egyseg, auto: true }} cimke="Egység" {...k} />
          <UMezo m={{ kulcs: "ar", ertek: adat.egysegar }} szam={nAr} cimke="Nettó egységár" {...k} />
          <UMezo m={{ kulcs: "afa", ertek: `${adat.afaKulcs}%`, auto: true }} cimke="Áfa" {...k} />
          <b className="text-right text-[13px] tabular-nums">{adat.osszeg?.netto ?? "—"}</b>
          <b className="text-right text-[13px] tabular-nums">{adat.osszeg ? `${adat.osszeg.brutto} ${deviza}` : "—"}</b>
        </div>
        {adat.reszlet ? (
          <div className="mt-2 max-w-xl"><span className="mb-1 block text-xs">Tétel megjegyzés</span><UMezo m={{ kulcs: "reszlet", ertek: adat.reszlet }} szam={nReszlet} cimke="Tétel megjegyzés" {...k} /></div>
        ) : null}
        {adat.osszeg ? <div className="mt-2 text-right text-xs text-muted-foreground">ellenőrizd: a Számlázz.hu-ban is nettó {adat.osszeg.netto} · áfa {adat.osszeg.afa} · bruttó <b className="text-foreground">{adat.osszeg.brutto} {deviza}</b> jön ki</div> : null}
      </div>
    </div>
  );
}


export function SzamlazasiSegedGomb({ megbizasId, elszamolasJog }: { megbizasId: string; elszamolasJog: boolean }) {
  const router = useRouter();
  const [nyitva, setNyitva] = useState(false);
  const [adat, setAdat] = useState<SzamlazasiSeged | null>(null);
  const [hiba, setHiba] = useState<string | null>(null);
  const [masolt, setMasolt] = useState<string | null>(null);
  const [kesz, setKesz] = useState<string[]>([]);
  const [szamlaSzam, setSzamlaSzamErtek] = useState("");
  const [toltes, startToltes] = useTransition();
  const [mentes, startMentes] = useTransition();

  function megnyit() {
    setNyitva(true);
    setHiba(null);
    setKesz([]);
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
    if (await vagolapra(ertek)) { setMasolt(kulcs); setKesz((k) => (k.includes(kulcs) ? k : [...k, kulcs])); }
    else toast.error("A másolás nem sikerült — jelöld ki és másold kézzel.");
  }

  const m = adat ? mezokbol(adat) : null;

  return (
    <>
      <Button size="sm" onClick={megnyit}>Számlázok</Button>
      <Dialog open={nyitva} onOpenChange={setNyitva}>
        <DialogContent className="fuvarozas2 max-h-[92vh] overflow-y-auto sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>Számlázási segéd</DialogTitle>
            <DialogDescription>{adat?.fejlec ?? ""} — a Számlázz.hu „Számla szerkesztés” oldalának mása: a kék, számozott mezőket másold át ugyanarra a helyre, a halványakhoz nem kell nyúlni.</DialogDescription>
          </DialogHeader>
          {toltes && !adat ? <p className="text-sm text-muted-foreground">Betöltés…</p> : null}
          {hiba ? <p className="text-sm text-[var(--f2-red)]">{hiba}</p> : null}
          {adat && m ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
              <SzamlazzUrlap adat={adat} kesz={kesz} onMasol={masol} />

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
                  {!adat.papirMegvan ? <span className="rounded-md bg-[var(--f2-amb-l)] px-2 py-1 text-xs font-medium text-[var(--f2-amb)]">{PAPIR_HIANY_SZOVEG} — a számla ettől kiállítható, de a papírt kérd be.</span> : null}
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
