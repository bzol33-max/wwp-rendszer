"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { useCanEdit } from "@/components/auth/edit-permission-context";
import { cn } from "@/lib/utils";
import { MaiJelenletSav } from "@/components/jelenlet/mai-jelenlet-sav";
import { HaviNaploDialog } from "@/components/jelenlet/havi-naplo-dialog";
import { NyitottNapokSav } from "@/components/jelenlet/nyitott-napok-sav";
import { TelephelyFeladatokTile } from "@/components/jelenlet/telephely-feladatok-tile";
import { FeladatCommentsDialog } from "@/components/jelenlet/feladat-comments-dialog";
import { CsapatLap } from "@/components/jelenlet/csapat-lap";
import {
  getNyitottNapok,
  getSites,
  listFeladatok,
  listFrissenKeszFeladatok,
  type NyitottNap,
} from "@/lib/jelenlet/actions";
import {
  REPEAT_LABELS,
  URGENCY_COLORS,
  URGENCY_LABELS,
  URGENCY_LEVELS,
  marLathato,
  todayIso,
  type Feladat,
  type Site,
} from "@/lib/jelenlet/shared";

// Redesign 6: 768 px-től az új „Csapat” lap, alatta a régi (mobil) nézet. Csak az
// egyik ágat rendereljük, és szerveren/hidratáláskor semmit — különben az asztali
// böngésző a mobil ág lekérdezéseit is elindítaná, mielőtt átváltunk.
function useNezet(): "asztal" | "mobil" | null {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(min-width: 768px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => (window.matchMedia("(min-width: 768px)").matches ? "asztal" : "mobil"),
    () => null
  );
}

export function JelenletView() {
  const nezet = useNezet();
  if (nezet === null) return null;
  return nezet === "asztal" ? <CsapatLap /> : <JelenletMobilView />;
}

// Elrendezés: vékony jelenlét-sáv a mai nappal, alatta telephelyenként egy
// sűrű feladatlista (8-10 tétel is elfér), legalul az ütemezett (még nem
// esedékes) feladatok. A feladatrögzítő a fejléc gombja mögött van.
function JelenletMobilView() {
  const canEdit = useCanEdit();
  const [sites, setSites] = useState<Site[]>([]);
  const [feladatok, setFeladatok] = useState<Feladat[]>([]);
  const [nyitottNapok, setNyitottNapok] = useState<NyitottNap[]>([]);
  const [keszFeladatok, setKeszFeladatok] = useState<Feladat[]>([]);
  // Hány napig maradjon látható egy elvégzett feladat a telephely
  // oszlopának alján, mielőtt csak az archívumban lenne meg.
  const [keszNapok, setKeszNapok] = useState(3);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Feladat | null>(null);
  const [haviNyitva, setHaviNyitva] = useState(false);

  const load = useCallback(async () => {
    const [siteRows, taskRows, nyitott, kesz] = await Promise.all([
      getSites(),
      listFeladatok(),
      getNyitottNapok().catch(() => [] as NyitottNap[]),
      listFrissenKeszFeladatok(keszNapok).catch(() => [] as Feladat[]),
    ]);
    setSites(siteRows);
    setFeladatok(taskRows);
    setNyitottNapok(nyitott);
    setKeszFeladatok(kesz);
  }, [keszNapok]);

  useEffect(() => {
    let mounted = true;
    load().finally(() => {
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [load]);

  // Ami esedékes (vagy 3 napon belül az lesz), az a telephely listájába
  // kerül; a távolabbi ismétlődő példányok az "Ütemezett" sorba.
  const { aktualis, utemezett } = useMemo(() => {
    const ma = todayIso();
    return {
      aktualis: feladatok.filter((f) => marLathato(f.task_date, ma)),
      utemezett: feladatok.filter((f) => !marLathato(f.task_date, ma)),
    };
  }, [feladatok]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Jelenléti/üzenőfal"
        subtitle="Napi érkezés és feladatok"
        actions={
          <div className="flex items-center gap-2">
            {/* Meddig maradjon látható egy elvégzett feladat. A nap munkája
                így nem tűnik el nyomtalanul a képernyőről. */}
            <div className="flex items-center gap-1 rounded-lg border bg-card px-2 py-1">
              <span className="text-[11px] text-muted-foreground">Kész látszik:</span>
              {KESZ_VALASZTAS.map((v) => (
                <button
                  key={v.napok}
                  type="button"
                  onClick={() => {
                    setKeszNapok(v.napok);
                    setLoading(true);
                  }}
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
                    keszNapok === v.napok
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {v.cimke}
                </button>
              ))}
            </div>
            <Link
              href="/jelenlet/szabadsag"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Szabadság
            </Link>
            <Link
              href="/jelenlet/archivum"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Archívum
            </Link>
          </div>
        }
      />

      <NyitottNapokSav napok={nyitottNapok} canEdit={canEdit} onReload={load} />

      <MaiJelenletSav onOpenHonap={() => setHaviNyitva(true)} />

      {loading ? (
        <p className="text-sm text-muted-foreground">Betöltés…</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {sites.map((s) => (
            <TelephelyFeladatokTile
              key={s.id}
              siteId={s.id}
              siteName={s.name}
              feladatok={aktualis.filter((f) => f.site_id === s.id)}
              keszFeladatok={keszFeladatok.filter((f) => f.site_id === s.id)}
              maIso={todayIso()}
              canEdit={canEdit}
              onSelect={setSelected}
              onChanged={load}
            />
          ))}
        </div>
      )}

      {/* Jelmagyarázat: a színkód csak akkor ér valamit, ha meg is lehet
          fejteni. Ugyanaz az öt szín, ami a sorok bal szélén fut végig. */}
      {!loading && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-muted-foreground">
          {URGENCY_LEVELS.map((szint) => (
            <span key={szint} className="inline-flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-full", URGENCY_COLORS[szint])} />
              {URGENCY_LABELS[szint]}
            </span>
          ))}
        </div>
      )}

      {utemezett.length > 0 && (
        <div className="rounded-xl border bg-card p-3">
          <p className="mb-2 text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
            Ütemezett — {LATHATO_SZOVEG}
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
            {utemezett.map((f) => (
              <span key={f.id} className="inline-flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", URGENCY_COLORS[f.urgency])} />
                {f.description} ({f.site_name}) — {f.task_date}
                {f.repeat_freq !== "egyszeri" && ` · ${REPEAT_LABELS[f.repeat_freq]}`}
              </span>
            ))}
          </div>
        </div>
      )}

      <HaviNaploDialog open={haviNyitva} onOpenChange={setHaviNyitva} />

      <FeladatCommentsDialog
        feladat={selected}
        open={selected !== null}
        onOpenChange={(o) => !o && setSelected(null)}
        onChanged={load}
        showDoneToggle
        canEdit={canEdit}
        paletta="jelenlet"
      />
    </div>
  );
}

const LATHATO_SZOVEG = "3 nappal az esedékesség előtt jelenik meg";

const KESZ_VALASZTAS = [
  { napok: 1, cimke: "ma" },
  { napok: 3, cimke: "3 nap" },
  { napok: 7, cimke: "egy hét" },
] as const;
