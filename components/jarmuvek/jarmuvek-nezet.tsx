"use client";

// Járművek modul (/jarmuvek) — járművek, pótkocsik, okmányok lejárattal és a
// sofőrök okmány-dátumai, egyszerű felvevő/szerkesztő űrlapokkal. A meglévő
// UI-elemekből (Card, Table, Dialog, Input, Badge) és színekből épül.

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useCanEdit } from "@/components/auth/edit-permission-context";
import { JARMU_SZIN_DOT_CLASS, JARMU_SZINEK, type JarmuSzin } from "@/lib/fuvarozas/vehicles";
import { mentJarmu, mentOkmany, mentPotkocsi, mentSoforProfil, torolOkmany } from "@/lib/jarmuvek/actions";
import {
  OKMANY_TIPUSOK,
  OKMANY_TIPUS_CIMKE,
  hatralevoNap,
  lejaratAllapot,
  type JarmuAdat,
  type JarmuBemenet,
  type JarmuvekOldal,
  type OkmanyAdat,
  type OkmanyBemenet,
  type PotkocsiAdat,
  type PotkocsiBemenet,
  type SoforProfilAdat,
  type SoforProfilBemenet,
  elsoSzabadSzin,
} from "@/lib/jarmuvek/tipusok";

const SZIN_CIMKE: Record<JarmuSzin, string> = { blue: "Kék", yellow: "Sárga", green: "Zöld", purple: "Lila" };
/** A Szerkesztés-gomb oszlopa telefonon a jobb szélre tapad — különben a széles táblában a képernyőn kívül volt. */
const MUVELET_OSZLOP = "max-md:sticky max-md:right-0 max-md:z-10 max-md:bg-card max-md:shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.15)]";
const VALASZTO = "h-8 max-md:h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base md:text-sm dark:bg-input/30";
const HAMAROSAN = "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300";

type Eredmeny = { ok: true } | { ok: false; hiba: string };

// ---------------------------------------------------------------------------
// Közös apróságok

function Datum({ datum, ma }: { datum: string | null; ma: string }) {
  if (!datum) return <span className="text-muted-foreground">—</span>;
  const allapot = lejaratAllapot(datum, ma);
  const szoveg = datum.replaceAll("-", ".") + ".";
  if (allapot === "lejart") {
    return <Badge variant="destructive" title={`Lejárt ${-hatralevoNap(datum, ma)} napja`}>{szoveg} · lejárt</Badge>;
  }
  if (allapot === "hamarosan") {
    const nap = hatralevoNap(datum, ma);
    return <Badge className={HAMAROSAN} title="30 napon belül lejár">{szoveg} · {nap === 0 ? "ma" : `${nap} nap`}</Badge>;
  }
  return <span className="tabular-nums">{szoveg}</span>;
}

function Mezo({ cimke, children, szeles }: { cimke: string; children: ReactNode; szeles?: boolean }) {
  return (
    <div className={`flex flex-col gap-1.5 ${szeles ? "sm:col-span-2" : ""}`}>
      <Label>{cimke}</Label>
      {children}
    </div>
  );
}

function UrlapDialog({
  cim,
  nyitva,
  onBezar,
  onMent,
  children,
  extraGomb,
}: {
  cim: string;
  nyitva: boolean;
  onBezar: () => void;
  onMent: () => Promise<Eredmeny>;
  children: ReactNode;
  extraGomb?: ReactNode;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function ment() {
    start(async () => {
      try {
        const r = await onMent();
        if (!r.ok) {
          toast.error(r.hiba);
          return;
        }
        toast.success("Mentve.");
        onBezar();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nem sikerült menteni.");
      }
    });
  }
  return (
    <Dialog open={nyitva} onOpenChange={(v) => !v && onBezar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{cim}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
        <DialogFooter className="gap-2 sm:justify-between">
          <div>{extraGomb}</div>
          <div className="flex gap-2">
            <DialogClose render={<Button variant="outline">Mégse</Button>} />
            <Button onClick={ment} disabled={pending}>
              {pending ? "Mentés…" : "Mentés"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Járművek

function jarmuUrlap(j: JarmuAdat | null, adat: JarmuvekOldal): JarmuBemenet {
  return {
    kod: j?.kod ?? "",
    cimke: j?.cimke ?? "",
    soforBecenev: j?.soforBecenev ?? "",
    vontatoRendszam: j?.vontatoRendszam ?? "",
    potkocsiId: j?.potkocsiId ?? "",
    irasvaltozatok: (j?.irasvaltozatok ?? []).join(", "),
    szin: j?.szin ?? elsoSzabadSzin(adat.jarmuvek.filter((x) => x.aktiv).map((x) => x.szin), JARMU_SZINEK),
    ecofleetObjectId: j?.ecofleetObjectId ?? "",
    soforId: j?.soforId ?? "",
    fogyasztasL100: j?.fogyasztasL100 != null ? String(j.fogyasztasL100) : String(adat.alapFogyasztasL100 ?? 28),
    euroOsztaly: j?.euroOsztaly ?? "",
    hugoKategoria: j?.hugoKategoria ?? "J5",
    ossztomegT: j?.ossztomegT != null ? String(j.ossztomegT) : "",
    alapTelephelyPontId: j?.alapTelephelyPontId ?? "",
    megjegyzes: j?.megjegyzes ?? "",
    aktiv: j?.aktiv ?? true,
  };
}

function JarmuDialog({ jarmu, adat, onBezar }: { jarmu: JarmuAdat | null; adat: JarmuvekOldal; onBezar: () => void }) {
  const [f, setF] = useState<JarmuBemenet>(() => jarmuUrlap(jarmu, adat));
  const allit = (k: keyof JarmuBemenet) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <UrlapDialog cim={jarmu ? `Jármű: ${jarmu.cimke}` : "Új jármű"} nyitva onBezar={onBezar} onMent={() => mentJarmu(jarmu?.id ?? null, f)}>
      <Mezo cimke="Kód (felvétel után nem módosítható)">
        <Input value={f.kod} onChange={allit("kod")} disabled={!!jarmu} placeholder="rendszám, vagy pl. JANI" />
      </Mezo>
      <Mezo cimke="Sofőr rövid neve (így látszik mindenhol)">
        <Input value={f.soforBecenev} onChange={allit("soforBecenev")} placeholder="pl. Gergő" />
      </Mezo>
      <Mezo cimke="Megjelenített címke">
        <Input value={f.cimke} onChange={allit("cimke")} placeholder="pl. AOPU-427/AOTY-474" />
      </Mezo>
      <Mezo cimke="Vontató rendszáma (üres: még nincs)">
        <Input value={f.vontatoRendszam} onChange={allit("vontatoRendszam")} placeholder="pl. ABC-123" />
      </Mezo>
      <Mezo cimke="Pótkocsi">
        <select className={VALASZTO} value={f.potkocsiId} onChange={allit("potkocsiId")}>
          <option value="">— nincs —</option>
          {adat.potkocsik.filter((p) => p.aktiv || p.id === f.potkocsiId).map((p) => (
            <option key={p.id} value={p.id}>{p.rendszam}{p.tipus ? ` · ${p.tipus}` : ""}</option>
          ))}
        </select>
      </Mezo>
      <Mezo cimke="Sofőr (Dolgozók törzsadat)">
        <select className={VALASZTO} value={f.soforId} onChange={allit("soforId")}>
          <option value="">— nincs hozzárendelve —</option>
          {adat.alkalmazottak.map((a) => (
            <option key={a.id} value={a.id}>{a.nev}</option>
          ))}
        </select>
      </Mezo>
      <Mezo cimke="Ecofleet azonosító (üres: nincs GPS)">
        <Input value={f.ecofleetObjectId} onChange={allit("ecofleetObjectId")} inputMode="numeric" />
      </Mezo>
      <Mezo cimke="Szín">
        <select className={VALASZTO} value={f.szin} onChange={allit("szin")}>
          {JARMU_SZINEK.map((s) => (
            <option key={s} value={s}>{SZIN_CIMKE[s]}</option>
          ))}
        </select>
      </Mezo>
      <Mezo cimke="Alap fogyasztás (l/100 km)">
        <Input value={f.fogyasztasL100} onChange={allit("fogyasztasL100")} inputMode="decimal" />
      </Mezo>
      <Mezo cimke="Euro-osztály">
        <Input value={f.euroOsztaly} onChange={allit("euroOsztaly")} placeholder="pl. EURO6" />
      </Mezo>
      <Mezo cimke="HU-GO kategória">
        <Input value={f.hugoKategoria} onChange={allit("hugoKategoria")} placeholder="J5" />
      </Mezo>
      <Mezo cimke="Össztömeg (t)">
        <Input value={f.ossztomegT} onChange={allit("ossztomegT")} inputMode="decimal" placeholder="40" />
      </Mezo>
      <Mezo cimke="Indulási telephely">
        <select className={VALASZTO} value={f.alapTelephelyPontId} onChange={allit("alapTelephelyPontId")}>
          <option value="">— a közös indulási pont —</option>
          {adat.telephelyek.map((t) => (
            <option key={t.id} value={t.id}>{t.nev}</option>
          ))}
        </select>
      </Mezo>
      <Mezo cimke="Rendszám-elírások (vesszővel)">
        <Input value={f.irasvaltozatok} onChange={allit("irasvaltozatok")} placeholder="pl. NZM-492" />
      </Mezo>
      <Mezo cimke="Megjegyzés" szeles>
        <Input value={f.megjegyzes} onChange={allit("megjegyzes")} />
      </Mezo>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <Checkbox checked={f.aktiv} onCheckedChange={(v) => setF({ ...f, aktiv: v === true })} />
        Aktív (inaktív jármű sehol nem jelenik meg)
      </label>
    </UrlapDialog>
  );
}

function kapacitas(p: { raklaphelyNormal: number | null; raklaphelyForgatott: number | null; raklapDbNormal: number | null; raklapDbForgatott: number | null } | undefined): string | null {
  if (!p || (p.raklaphelyNormal == null && p.raklapDbNormal == null)) return null;
  const hely = [p.raklaphelyNormal, p.raklaphelyForgatott].filter((x) => x != null).join(" / ");
  const db = [p.raklapDbNormal, p.raklapDbForgatott].filter((x) => x != null).join(" / ");
  return [hely ? `${hely} hely` : null, db ? `${db} EUR raklap` : null].filter(Boolean).join(" · ");
}

function JarmuvekKartya({ adat }: { adat: JarmuvekOldal }) {
  const szerk = useCanEdit() && adat.torzsKesz;
  const [szerkesztett, setSzerkesztett] = useState<JarmuAdat | "uj" | null>(null);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Járművek ({adat.jarmuvek.filter((j) => j.aktiv).length} aktív)</CardTitle>
        {szerk && <Button size="sm" onClick={() => setSzerkesztett("uj")}>Új jármű</Button>}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Jármű</TableHead>
              <TableHead>Vontató / pótkocsi</TableHead>
              <TableHead>Kapacitás</TableHead>
              <TableHead>Sofőr</TableHead>
              <TableHead>GPS</TableHead>
              <TableHead>Fogyasztás</TableHead>
              <TableHead>Euro</TableHead>
              <TableHead className={MUVELET_OSZLOP} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {adat.jarmuvek.map((j) => (
              <TableRow key={j.id} className={j.aktiv ? undefined : "opacity-50"}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${JARMU_SZIN_DOT_CLASS[j.szin]}`} />
                    <span className="font-medium">{j.soforBecenev ?? j.kod}</span>
                    <span className="text-muted-foreground">{j.kod}</span>
                    {!j.aktiv && <Badge variant="outline">inaktív</Badge>}
                  </div>
                </TableCell>
                <TableCell>{j.vontatoRendszam ?? <span className="text-muted-foreground">nincs rendszám</span>}{j.potkocsiRendszam ? ` / ${j.potkocsiRendszam}` : ""}</TableCell>
                <TableCell className="text-muted-foreground">{kapacitas(adat.potkocsik.find((p) => p.id === j.potkocsiId)) ?? "—"}</TableCell>
                <TableCell>{j.soforNev ?? <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell>{j.ecofleetObjectId ? <span className="tabular-nums">{j.ecofleetObjectId}</span> : <Badge variant="outline">nincs GPS</Badge>}</TableCell>
                <TableCell className="tabular-nums">{j.fogyasztasL100 != null ? `${j.fogyasztasL100.toLocaleString("hu-HU")} l/100` : "—"}</TableCell>
                <TableCell>{j.euroOsztaly ?? "—"}</TableCell>
                <TableCell className={`text-right ${MUVELET_OSZLOP}`}>
                  {szerk && <Button size="sm" variant="outline" onClick={() => setSzerkesztett(j)}>Szerkesztés</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      {szerkesztett && <JarmuDialog jarmu={szerkesztett === "uj" ? null : szerkesztett} adat={adat} onBezar={() => setSzerkesztett(null)} />}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Pótkocsik

function PotkocsiDialog({ potkocsi, onBezar }: { potkocsi: PotkocsiAdat | null; onBezar: () => void }) {
  const [f, setF] = useState<PotkocsiBemenet>(() => ({
    rendszam: potkocsi?.rendszam ?? "",
    tipus: potkocsi?.tipus ?? "Schmitz Mega",
    raklaphelyNormal: potkocsi ? String(potkocsi.raklaphelyNormal ?? "") : "33",
    raklaphelyForgatott: potkocsi ? String(potkocsi.raklaphelyForgatott ?? "") : "28",
    raklapDbNormal: potkocsi ? String(potkocsi.raklapDbNormal ?? "") : "660",
    raklapDbForgatott: potkocsi ? String(potkocsi.raklapDbForgatott ?? "") : "812",
    megjegyzes: potkocsi?.megjegyzes ?? "",
    aktiv: potkocsi?.aktiv ?? true,
  }));
  const allit = (k: keyof PotkocsiBemenet) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <UrlapDialog cim={potkocsi ? `Pótkocsi: ${potkocsi.rendszam}` : "Új pótkocsi"} nyitva onBezar={onBezar} onMent={() => mentPotkocsi(potkocsi?.id ?? null, f)}>
      <Mezo cimke="Rendszám"><Input value={f.rendszam} onChange={allit("rendszam")} /></Mezo>
      <Mezo cimke="Típus"><Input value={f.tipus} onChange={allit("tipus")} /></Mezo>
      <Mezo cimke="Raklaphely — normál"><Input value={f.raklaphelyNormal} onChange={allit("raklaphelyNormal")} inputMode="numeric" /></Mezo>
      <Mezo cimke="Raklaphely — forgatva"><Input value={f.raklaphelyForgatott} onChange={allit("raklaphelyForgatott")} inputMode="numeric" /></Mezo>
      <Mezo cimke="EUR raklap db — normál"><Input value={f.raklapDbNormal} onChange={allit("raklapDbNormal")} inputMode="numeric" /></Mezo>
      <Mezo cimke="EUR raklap db — forgatva"><Input value={f.raklapDbForgatott} onChange={allit("raklapDbForgatott")} inputMode="numeric" /></Mezo>
      <Mezo cimke="Megjegyzés" szeles><Input value={f.megjegyzes} onChange={allit("megjegyzes")} /></Mezo>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <Checkbox checked={f.aktiv} onCheckedChange={(v) => setF({ ...f, aktiv: v === true })} />
        Aktív
      </label>
    </UrlapDialog>
  );
}

function PotkocsikKartya({ adat }: { adat: JarmuvekOldal }) {
  const szerk = useCanEdit() && adat.torzsKesz;
  const [szerkesztett, setSzerkesztett] = useState<PotkocsiAdat | "uj" | null>(null);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Pótkocsik ({adat.potkocsik.length})</CardTitle>
        {szerk && <Button size="sm" onClick={() => setSzerkesztett("uj")}>Új pótkocsi</Button>}
      </CardHeader>
      <CardContent>
        {adat.potkocsik.length === 0 ? (
          <p className="text-sm text-muted-foreground">Még nincs pótkocsi rögzítve.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rendszám</TableHead>
                <TableHead>Típus</TableHead>
                <TableHead>Raklaphely (normál / forgatva)</TableHead>
                <TableHead>EUR raklap (normál / forgatva)</TableHead>
                <TableHead>Vontató</TableHead>
                <TableHead className={MUVELET_OSZLOP} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {adat.potkocsik.map((p) => (
                <TableRow key={p.id} className={p.aktiv ? undefined : "opacity-50"}>
                  <TableCell className="font-medium">{p.rendszam}</TableCell>
                  <TableCell>{p.tipus ?? "—"}</TableCell>
                  <TableCell className="tabular-nums">{p.raklaphelyNormal ?? "—"} / {p.raklaphelyForgatott ?? "—"}</TableCell>
                  <TableCell className="tabular-nums">{p.raklapDbNormal ?? "—"} / {p.raklapDbForgatott ?? "—"}</TableCell>
                  <TableCell>{adat.jarmuvek.filter((j) => j.potkocsiId === p.id).map((j) => j.soforBecenev ?? j.kod).join(", ") || "—"}</TableCell>
                  <TableCell className={`text-right ${MUVELET_OSZLOP}`}>
                    {szerk && <Button size="sm" variant="outline" onClick={() => setSzerkesztett(p)}>Szerkesztés</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {szerkesztett && <PotkocsiDialog potkocsi={szerkesztett === "uj" ? null : szerkesztett} onBezar={() => setSzerkesztett(null)} />}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Okmányok

function OkmanyDialog({ okmany, adat, onBezar }: { okmany: OkmanyAdat | null; adat: JarmuvekOldal; onBezar: () => void }) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [f, setF] = useState<OkmanyBemenet>(() => ({
    targy: okmany ? (okmany.jarmuId ? `jarmu:${okmany.jarmuId}` : `potkocsi:${okmany.potkocsiId}`) : "",
    tipus: okmany?.tipus ?? "kgfb",
    szam: okmany?.szam ?? "",
    partner: okmany?.partner ?? "",
    lejarat: okmany?.lejarat ?? "",
    megjegyzes: okmany?.megjegyzes ?? "",
  }));
  const allit = (k: keyof OkmanyBemenet) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function torol() {
    if (!okmany || !(await confirm("Törlöd ezt az okmányt? (Csak tévesen felvitt sornál.)", { confirmLabel: "Törlés" }))) return;
    const r = await torolOkmany(okmany.id);
    if (!r.ok) toast.error(r.hiba);
    else {
      toast.success("Törölve.");
      onBezar();
      router.refresh();
    }
  }

  return (
    <UrlapDialog
      cim={okmany ? "Okmány szerkesztése" : "Új okmány"}
      nyitva
      onBezar={onBezar}
      onMent={() => mentOkmany(okmany?.id ?? null, f)}
      extraGomb={okmany ? <Button type="button" variant="outline" className="text-destructive" onClick={torol}>Törlés</Button> : null}
    >
      <Mezo cimke="Jármű / pótkocsi">
        <select className={VALASZTO} value={f.targy} onChange={allit("targy")}>
          <option value="">— válassz —</option>
          {adat.jarmuvek.map((j) => (
            <option key={`j${j.id}`} value={`jarmu:${j.id}`}>{j.soforBecenev ? `${j.soforBecenev} — ` : ""}{j.cimke}</option>
          ))}
          {adat.potkocsik.map((p) => (
            <option key={`p${p.id}`} value={`potkocsi:${p.id}`}>Pótkocsi {p.rendszam}</option>
          ))}
        </select>
      </Mezo>
      <Mezo cimke="Típus">
        <select className={VALASZTO} value={f.tipus} onChange={allit("tipus")}>
          {OKMANY_TIPUSOK.map((t) => (
            <option key={t} value={t}>{OKMANY_TIPUS_CIMKE[t]}</option>
          ))}
        </select>
      </Mezo>
      <Mezo cimke="Szám (kötvény, szerződés)"><Input value={f.szam} onChange={allit("szam")} /></Mezo>
      <Mezo cimke="Partner (biztosító, lízingcég)"><Input value={f.partner} onChange={allit("partner")} /></Mezo>
      <Mezo cimke="Lejárat"><Input type="date" value={f.lejarat} onChange={allit("lejarat")} /></Mezo>
      <Mezo cimke="Megjegyzés"><Input value={f.megjegyzes} onChange={allit("megjegyzes")} /></Mezo>
      {confirmDialog}
    </UrlapDialog>
  );
}

function OkmanyokKartya({ adat }: { adat: JarmuvekOldal }) {
  const szerk = useCanEdit() && adat.torzsKesz;
  const [szerkesztett, setSzerkesztett] = useState<OkmanyAdat | "uj" | null>(null);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Okmányok és lejáratok ({adat.okmanyok.length})</CardTitle>
        {szerk && <Button size="sm" onClick={() => setSzerkesztett("uj")}>Új okmány</Button>}
      </CardHeader>
      <CardContent>
        {adat.okmanyok.length === 0 ? (
          <p className="text-sm text-muted-foreground">Még nincs okmány rögzítve (KGFB, casco, műszaki, tachográf-kalibrálás…).</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lejárat</TableHead>
                <TableHead>Jármű / pótkocsi</TableHead>
                <TableHead>Típus</TableHead>
                <TableHead>Szám</TableHead>
                <TableHead>Partner</TableHead>
                <TableHead className={MUVELET_OSZLOP} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {adat.okmanyok.map((o) => (
                <TableRow key={o.id}>
                  <TableCell><Datum datum={o.lejarat} ma={adat.ma} /></TableCell>
                  <TableCell className="font-medium">{o.targy}</TableCell>
                  <TableCell>{OKMANY_TIPUS_CIMKE[o.tipus]}</TableCell>
                  <TableCell>{o.szam ?? "—"}</TableCell>
                  <TableCell>{o.partner ?? "—"}</TableCell>
                  <TableCell className={`text-right ${MUVELET_OSZLOP}`}>
                    {szerk && <Button size="sm" variant="outline" onClick={() => setSzerkesztett(o)}>Szerkesztés</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {szerkesztett && <OkmanyDialog okmany={szerkesztett === "uj" ? null : szerkesztett} adat={adat} onBezar={() => setSzerkesztett(null)} />}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sofőrök

function SoforDialog({ sofor, adat, onBezar }: { sofor: SoforProfilAdat | null; adat: JarmuvekOldal; onBezar: () => void }) {
  const [alkalmazottId, setAlkalmazottId] = useState(sofor?.alkalmazottId ?? "");
  const [f, setF] = useState<SoforProfilBemenet>(() => ({
    jogositvanyLejar: sofor?.jogositvanyLejar ?? "",
    gkiLejar: sofor?.gkiLejar ?? "",
    tachokartyaSzam: sofor?.tachokartyaSzam ?? "",
    tachokartyaLejar: sofor?.tachokartyaLejar ?? "",
    adrLejar: sofor?.adrLejar ?? "",
    megjegyzes: sofor?.megjegyzes ?? "",
  }));
  const allit = (k: keyof SoforProfilBemenet) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <UrlapDialog
      cim={sofor ? `Sofőr: ${sofor.nev}` : "Sofőr okmányai"}
      nyitva
      onBezar={onBezar}
      onMent={async () => (alkalmazottId ? mentSoforProfil(alkalmazottId, f) : { ok: false, hiba: "Válaszd ki a dolgozót." })}
    >
      {!sofor && (
        <Mezo cimke="Dolgozó" szeles>
          <select className={VALASZTO} value={alkalmazottId} onChange={(e) => setAlkalmazottId(e.target.value)}>
            <option value="">— válassz —</option>
            {adat.alkalmazottak.filter((a) => !adat.soforok.some((s) => s.alkalmazottId === a.id)).map((a) => (
              <option key={a.id} value={a.id}>{a.nev}</option>
            ))}
          </select>
        </Mezo>
      )}
      <Mezo cimke="Jogosítvány lejárata"><Input type="date" value={f.jogositvanyLejar} onChange={allit("jogositvanyLejar")} /></Mezo>
      <Mezo cimke="GKI lejárata"><Input type="date" value={f.gkiLejar} onChange={allit("gkiLejar")} /></Mezo>
      <Mezo cimke="Tachográf-kártya száma"><Input value={f.tachokartyaSzam} onChange={allit("tachokartyaSzam")} /></Mezo>
      <Mezo cimke="Tachográf-kártya lejárata"><Input type="date" value={f.tachokartyaLejar} onChange={allit("tachokartyaLejar")} /></Mezo>
      <Mezo cimke="ADR lejárata"><Input type="date" value={f.adrLejar} onChange={allit("adrLejar")} /></Mezo>
      <Mezo cimke="Megjegyzés"><Input value={f.megjegyzes} onChange={allit("megjegyzes")} /></Mezo>
    </UrlapDialog>
  );
}

function SoforokKartya({ adat }: { adat: JarmuvekOldal }) {
  const szerk = useCanEdit() && adat.torzsKesz;
  const [szerkesztett, setSzerkesztett] = useState<SoforProfilAdat | "uj" | null>(null);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Sofőrök okmányai ({adat.soforok.length})</CardTitle>
        {szerk && <Button size="sm" variant="outline" onClick={() => setSzerkesztett("uj")}>Sofőr hozzáadása</Button>}
      </CardHeader>
      <CardContent>
        {adat.soforok.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nincs járműhöz rendelt sofőr — a jármű szerkesztésénél rendelhető hozzá.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Név</TableHead>
                <TableHead>Kocsi</TableHead>
                <TableHead>Jogosítvány</TableHead>
                <TableHead>GKI</TableHead>
                <TableHead>Tachográf-kártya</TableHead>
                <TableHead>ADR</TableHead>
                <TableHead className={MUVELET_OSZLOP} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {adat.soforok.map((s) => (
                <TableRow key={s.alkalmazottId}>
                  <TableCell className="font-medium">{s.nev}</TableCell>
                  <TableCell>{adat.jarmuvek.filter((j) => j.aktiv && j.soforId === s.alkalmazottId).map((j) => j.cimke).join(", ") || "—"}</TableCell>
                  <TableCell><Datum datum={s.jogositvanyLejar} ma={adat.ma} /></TableCell>
                  <TableCell><Datum datum={s.gkiLejar} ma={adat.ma} /></TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {s.tachokartyaSzam && <span className="text-muted-foreground">{s.tachokartyaSzam}</span>}
                      <Datum datum={s.tachokartyaLejar} ma={adat.ma} />
                    </div>
                  </TableCell>
                  <TableCell><Datum datum={s.adrLejar} ma={adat.ma} /></TableCell>
                  <TableCell className={`text-right ${MUVELET_OSZLOP}`}>
                    {szerk && <Button size="sm" variant="outline" onClick={() => setSzerkesztett(s)}>Szerkesztés</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {szerkesztett && <SoforDialog sofor={szerkesztett === "uj" ? null : szerkesztett} adat={adat} onBezar={() => setSzerkesztett(null)} />}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Az oldal

export function JarmuvekNezet({ adat }: { adat: JarmuvekOldal }) {
  const datumok = [
    ...adat.okmanyok.map((o) => o.lejarat),
    ...adat.soforok.flatMap((s) => [s.jogositvanyLejar, s.gkiLejar, s.tachokartyaLejar, s.adrLejar]),
  ];
  const lejart = datumok.filter((d) => lejaratAllapot(d, adat.ma) === "lejart").length;
  const hamarosan = datumok.filter((d) => lejaratAllapot(d, adat.ma) === "hamarosan").length;

  return (
    <div className="flex flex-col gap-4">
      {!adat.torzsKesz && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          A törzsadat-táblák (pótkocsik, okmányok, sofőr-profil) még nincsenek létrehozva — a következő indításkor a 031-es
          migráció létrehozza őket. Addig csak a járművek alapadatai látszanak, szerkeszteni nem lehet.
        </div>
      )}
      {(lejart > 0 || hamarosan > 0) && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {lejart > 0 && <Badge variant="destructive">{lejart} lejárt okmány</Badge>}
          {hamarosan > 0 && <Badge className={HAMAROSAN}>{hamarosan} lejár 30 napon belül</Badge>}
        </div>
      )}
      <JarmuvekKartya adat={adat} />
      <PotkocsikKartya adat={adat} />
      <OkmanyokKartya adat={adat} />
      <SoforokKartya adat={adat} />
    </div>
  );
}
