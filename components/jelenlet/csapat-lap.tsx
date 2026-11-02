"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCanEdit } from "@/components/auth/edit-permission-context";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { CsapatRacs, type RacsDolgozo } from "@/components/jelenlet/csapat-racs";
import { CsapatUzenofal } from "@/components/jelenlet/csapat-uzenofal";
import { HaviNaploDialog } from "@/components/jelenlet/havi-naplo-dialog";
import { NapSzerkeszto } from "@/components/jelenlet/nap-szerkeszto";
import { NyitottNapokSav } from "@/components/jelenlet/nyitott-napok-sav";
import {
  KeretDialog,
  RogzitoSor,
  datumCimke,
  szakaszCimke,
} from "@/components/jelenlet/szabadsag-view";
import {
  elutasitSzabadsagIgeny,
  getJelenletEmployees,
  getJelenletekIdoszak,
  getNapJelenletek,
  getNyitottNapok,
  getSzabadsagIgenyek,
  getSzabadsagMerlegek,
  getSzabadsagTavolletek,
  jovahagySzabadsagIgeny,
  rogzitSzabadsag,
  setSzabadsagKeret,
  type NyitottNap,
} from "@/lib/jelenlet/actions";
import {
  eltolIso,
  hetekNapjai,
  hetfoIso,
  maiLetszam,
  napDatumCimke,
  tartomanyEvei,
} from "@/lib/jelenlet/csapat-lap";
import {
  igenyUtkozesei,
  keretJovahagyasUtan,
  munkanapok,
  summarizeByDay,
  szabadsagRacs,
  todayIso,
  type JelenletEmployee,
  type JelenletSession,
  type SzabadsagIgeny,
  type SzabadsagMerleg,
  type TavolletNap,
} from "@/lib/jelenlet/shared";

type Adat = {
  merlegek: SzabadsagMerleg[];
  employees: JelenletEmployee[];
  sessions: JelenletSession[];
  maiSzakaszok: JelenletSession[];
  igenyek: SzabadsagIgeny[];
  tavolletek: TavolletNap[];
  nyitottNapok: NyitottNap[];
};

const URES: Adat = {
  merlegek: [],
  employees: [],
  sessions: [],
  maiSzakaszok: [],
  igenyek: [],
  tavolletek: [],
  nyitottNapok: [],
};

/**
 * A /jelenlet asztali nézete (redesign 6, K2): „Csapat” lap — a dolgozók × napok
 * rács a szabadsággal, a kérelmek helyben jóváhagyhatók, alatta a telephelyi
 * üzenőfal. Az éves hőtérkép, a keretek és közelgők listája a /jelenlet/szabadsag
 * oldalon maradt („Éves nézet ›”).
 */
export function CsapatLap() {
  const canEdit = useCanEdit();
  const ma = todayIso();
  const [hetfo, setHetfo] = useState(() => hetfoIso(todayIso()));
  const [hetDb, setHetDb] = useState<2 | 4>(4);
  const [adat, setAdat] = useState<Adat>(URES);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirm();

  const [napSzerk, setNapSzerk] = useState<string | null>(null);
  const [haviNyitva, setHaviNyitva] = useState(false);
  const [rogzitNyitva, setRogzitNyitva] = useState(false);
  const [keretSzerk, setKeretSzerk] = useState<SzabadsagMerleg | null>(null);

  const tol = hetfo;
  const ig = eltolIso(hetfo, hetDb * 7 - 1);
  const hetek = useMemo(() => hetekNapjai(hetfo, hetDb), [hetfo, hetDb]);

  // A gyors lapozásnál a lassabb, régebbi válasz ne írja felül az újabbat.
  const kerNo = useRef(0);
  const load = useCallback(async () => {
    const sorszam = ++kerNo.current;
    const evek = tartomanyEvei(tol, ig);
    const [merlegek, employees, sessions, maiSzakaszok, igenyLista, tavolletLista, nyitottNapok] =
      await Promise.all([
        getSzabadsagMerlegek(),
        getJelenletEmployees(),
        getJelenletekIdoszak(tol, ig),
        getNapJelenletek(todayIso()),
        Promise.all(evek.map((e) => getSzabadsagIgenyek(e))),
        Promise.all(evek.map((e) => getSzabadsagTavolletek(e))),
        getNyitottNapok().catch(() => [] as NyitottNap[]),
      ]);
    if (sorszam !== kerNo.current) return;
    // A függő kérelmeket minden év lekérdezése visszaadja: azonosító szerint egyesítjük.
    const igenyek = [...new Map(igenyLista.flat().map((i) => [i.id, i])).values()];
    setAdat({
      merlegek,
      employees,
      sessions,
      maiSzakaszok,
      igenyek,
      tavolletek: tavolletLista.flat(),
      nyitottNapok,
    });
  }, [tol, ig]);

  useEffect(() => {
    let mounted = true;
    load()
      .catch((e) => {
        if (mounted) toast.error(e instanceof Error ? e.message : "Nem sikerült betölteni.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [load]);

  const { merlegek, employees, sessions, igenyek, tavolletek } = adat;

  const dolgozok: RacsDolgozo[] = useMemo(() => {
    const aktivak = new Set(employees.map((e) => e.id));
    return merlegek.map((m) => ({ id: m.employeeId, name: m.name, aktiv: aktivak.has(m.employeeId) }));
  }, [merlegek, employees]);

  const merlegTerkep = useMemo(() => new Map(merlegek.map((m) => [m.employeeId, m])), [merlegek]);

  const racs = useMemo(
    () => szabadsagRacs(igenyek, dolgozok.map((d) => d.id), tavolletek),
    [igenyek, dolgozok, tavolletek]
  );

  const napok = useMemo(() => {
    const terkep = new Map<string, Map<string, ReturnType<typeof summarizeByDay>[number]>>();
    for (const d of dolgozok) {
      const sajat = summarizeByDay(sessions.filter((s) => s.employee_id === d.id));
      terkep.set(d.id, new Map(sajat.map((n) => [n.date, n])));
    }
    return terkep;
  }, [dolgozok, sessions]);

  const letszam = useMemo(
    () =>
      maiLetszam(
        dolgozok.map((d) => d.id),
        ma,
        adat.maiSzakaszok,
        racs
      ),
    [dolgozok, ma, adat.maiSzakaszok, racs]
  );

  const kerelmek = igenyek.filter((i) => i.allapot === "kert");

  function futtat(mit: () => Promise<void>, siker: string, utana?: () => void) {
    startTransition(async () => {
      try {
        await mit();
        await load();
        toast.success(siker);
        utana?.();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nem sikerült menteni.");
      }
    });
  }

  async function jovahagy(i: SzabadsagIgeny) {
    // Csak a ténylegesen felülírt napok: hétvégi/ünnepi munkát a jóváhagyás nem bánt.
    const szakaszNapjai = new Set(munkanapok(i.tol, i.ig));
    const munkasNapok = i.munka_napok.filter((d) => szakaszNapjai.has(d)).sort();
    if (
      munkasNapok.length > 0 &&
      !(await confirm(
        `${i.employee_name}: ${munkasNapok.length} napon már van rögzített munkaidő (${munkasNapok.map(datumCimke).join(", ")}).\n\nJóváhagyáskor ezek a munkaszakaszok törlődnek. Folytatod?`
      ))
    ) {
      return;
    }
    futtat(() => jovahagySzabadsagIgeny(i.id), "Szabadság jóváhagyva.");
  }

  function elutasit(i: SzabadsagIgeny) {
    const oka = window.prompt(
      `Miért nem jó? (a dolgozó telefonján meg fog jelenni — üresen is elutasítható)\n\n${i.employee_name}: ${szakaszCimke(i.tol, i.ig)}`,
      ""
    );
    // A Mégse null-t ad, az üres szöveg viszont vállalt döntés.
    if (oka === null) return;
    futtat(() => elutasitSzabadsagIgeny({ igenyId: i.id, oka }), "A kérés elutasítva.");
  }

  function kerelemSugo(i: SzabadsagIgeny): string {
    const sorok = [`${i.employee_name}: ${szakaszCimke(i.tol, i.ig)}`];
    if (i.tipus === "beteg") sorok.push("betegszabadság");
    const utkozes = igenyUtkozesei(i, igenyek);
    if (utkozes.length > 0) sorok.push(`ütközik: ${utkozes.map((u) => u.name).join(", ")}`);
    const utana = keretJovahagyasUtan(merlegTerkep.get(i.employee_id), i);
    if (utana !== null) {
      sorok.push(
        utana < 0
          ? `nincs rá elég keret — ${Math.abs(utana)} nappal több a maradéknál`
          : `jóváhagyás után marad: ${utana} nap`
      );
    }
    if (i.megjegyzes) sorok.push(`„${i.megjegyzes}”`);
    return sorok.join("\n");
  }

  const napCim = napDatumCimke(ma);

  return (
    <div className="flex flex-col gap-4">
      {/* --- fejléc --- */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[#6e6e73] tabular-nums">
            {napCim.charAt(0).toUpperCase() + napCim.slice(1)} · {letszam.bent} bent · {letszam.tavol} távol
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-[#1d1d1f]">Csapat · {hetDb} hét</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border bg-card p-0.5">
            {([2, 4] as const).map((db) => (
              <button
                key={db}
                type="button"
                onClick={() => setHetDb(db)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-sm font-semibold",
                  hetDb === db ? "bg-primary text-primary-foreground" : "text-[#48484a] hover:bg-muted"
                )}
              >
                {db} hét
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="icon-sm"
              variant="outline"
              aria-label="Előző hét"
              onClick={() => setHetfo(eltolIso(hetfo, -7))}
            >
              <ChevronLeft />
            </Button>
            <button
              type="button"
              onClick={() => setHetfo(hetfoIso(ma))}
              className="px-1 text-sm font-semibold text-[#48484a] hover:underline"
            >
              Ma
            </button>
            <Button
              size="icon-sm"
              variant="outline"
              aria-label="Következő hét"
              onClick={() => setHetfo(eltolIso(hetfo, 7))}
            >
              <ChevronRight />
            </Button>
          </div>
          {canEdit && <Button onClick={() => setRogzitNyitva(true)}>Szabadság rögzítése</Button>}
          <button
            type="button"
            onClick={() => setHaviNyitva(true)}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Havi napló
          </button>
          <Link href="/jelenlet/szabadsag" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Éves nézet ›
          </Link>
          <Link href="/jelenlet/archivum" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Archívum
          </Link>
        </div>
      </div>

      {/* --- kérelmek és nyitott napok --- */}
      {kerelmek.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#ffd9a0] bg-[#fff6e8] px-3 py-2">
          <span className="text-sm font-semibold text-[#1d1d1f]">{kerelmek.length} kérelem vár:</span>
          {kerelmek.map((i) => (
            <span
              key={i.id}
              title={kerelemSugo(i)}
              className="inline-flex items-center gap-2 rounded-full bg-white py-1 pr-1.5 pl-3 text-sm text-[#1d1d1f] shadow-[var(--shadow-card)]"
            >
              <span className="tabular-nums">
                {i.employee_name} · {szakaszCimke(i.tol, i.ig)} · {munkanapok(i.tol, i.ig).length} nap
              </span>
              {canEdit && (
                <>
                  <Button
                    size="xs"
                    disabled={pending}
                    className="bg-success text-success-foreground hover:bg-success/90"
                    onClick={() => jovahagy(i)}
                  >
                    <Check className="size-3" />
                    Jóváhagyom
                  </Button>
                  <Button size="xs" variant="outline" disabled={pending} onClick={() => elutasit(i)}>
                    <X className="size-3" />
                    Nem
                  </Button>
                </>
              )}
            </span>
          ))}
        </div>
      )}

      <NyitottNapokSav napok={adat.nyitottNapok} canEdit={canEdit} onReload={load} />

      {/* --- csapat-rács --- */}
      <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
        {loading ? (
          <p className="text-sm text-muted-foreground">Betöltés…</p>
        ) : dolgozok.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nincs aktív dolgozó.</p>
        ) : (
          <CsapatRacs
            hetek={hetek}
            ma={ma}
            dolgozok={dolgozok}
            racs={racs}
            napok={napok}
            merlegek={merlegTerkep}
            canEdit={canEdit}
            onCella={(_, iso) => setNapSzerk(iso)}
            onNev={() => setHaviNyitva(true)}
            onMarad={(id) => setKeretSzerk(merlegTerkep.get(id) ?? null)}
          />
        )}
      </div>

      <CsapatUzenofal />

      {/* --- dialógusok --- */}
      <Dialog open={napSzerk !== null} onOpenChange={(o) => !o && setNapSzerk(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{napSzerk ? napDatumCimke(napSzerk) : ""}</DialogTitle>
          </DialogHeader>
          {napSzerk && (
            <NapSzerkeszto employees={employees} workDate={napSzerk} sessions={sessions} onReload={load} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={rogzitNyitva} onOpenChange={setRogzitNyitva}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Szabadság rögzítése</DialogTitle>
          </DialogHeader>
          <RogzitoSor
            dialogban
            merlegek={merlegek}
            pending={pending}
            onRogzit={(a, utana) =>
              futtat(
                () => rogzitSzabadsag(a),
                "Szabadság rögzítve.",
                () => {
                  utana();
                  setRogzitNyitva(false);
                }
              )
            }
          />
        </DialogContent>
      </Dialog>

      <HaviNaploDialog
        open={haviNyitva}
        onOpenChange={(o) => {
          setHaviNyitva(o);
          // A naplóban javított napok a rácson is frissüljenek.
          if (!o) void load();
        }}
      />

      {keretSzerk && (
        <KeretDialog
          merleg={keretSzerk}
          pending={pending}
          onClose={() => setKeretSzerk(null)}
          onSave={(keret, fordulonap) =>
            // Csak sikeres mentés után zárul: hibánál a beírt érték megmarad.
            futtat(
              () => setSzabadsagKeret({ employeeId: keretSzerk.employeeId, keret, fordulonap }),
              "Keret mentve.",
              () => setKeretSzerk(null)
            )
          }
        />
      )}

      {confirmDialog}
    </div>
  );
}
