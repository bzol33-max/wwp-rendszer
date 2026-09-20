"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCanEdit } from "@/components/auth/edit-permission-context";
import { cn } from "@/lib/utils";
import { UjFeladatGomb } from "@/components/jelenlet/feladat-rogzites-tile";
import { MaiJelenletSav } from "@/components/jelenlet/mai-jelenlet-sav";
import { HaviNaploDialog } from "@/components/jelenlet/havi-naplo-dialog";
import { TelephelyFeladatokTile } from "@/components/jelenlet/telephely-feladatok-tile";
import { FeladatCommentsDialog } from "@/components/jelenlet/feladat-comments-dialog";
import {
  getMaiKeszSzamok,
  getNyitottNapok,
  getSites,
  lezarJelenletSession,
  listFeladatok,
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

// A nyitva maradt napok sávja. Ezek azok a napok, ahol a dolgozó elfelejtette
// a távozást (vagy az érkezést) rögzíteni — a nap hossza ismeretlen, ezért a
// heti és a havi egyenlegből is kimarad, amíg le nem zárod. Egy időpont
// beírásával itt helyben rendezhető.
function NyitottNapokSav({
  napok,
  canEdit,
  onReload,
}: {
  napok: NyitottNap[];
  canEdit: boolean;
  onReload: () => void | Promise<void>;
}) {
  const [nyitva, setNyitva] = useState(false);
  const [idok, setIdok] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  if (napok.length === 0) return null;

  function lezar(nap: NyitottNap) {
    const ido = idok[nap.session_id];
    if (!ido) {
      toast.error("Add meg a távozás időpontját.");
      return;
    }
    startTransition(async () => {
      try {
        await lezarJelenletSession(nap.session_id, ido);
        await onReload();
        toast.success("Nap lezárva.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nem sikerült menteni.");
      }
    });
  }

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <p className="flex-1 text-sm">
          <b>
            {napok.length === 1 ? "1 nyitott nap" : `${napok.length} nyitott nap`}
          </b>{" "}
          — {napok.slice(0, 2).map((n) => `${n.employee_name} ${n.work_date}`).join(", ")}
          {napok.length > 2 && ` és még ${napok.length - 2}`}
        </p>
        <Button size="xs" variant="outline" onClick={() => setNyitva((v) => !v)}>
          {nyitva ? "Elrejtem" : "Javítom"}
        </Button>
      </div>
      {nyitva && (
        <div className="mt-2 space-y-1.5 border-t border-amber-200 pt-2">
          {napok.map((n) => (
            <div key={n.session_id} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="min-w-[190px]">
                <b>{n.employee_name}</b> · {n.work_date} ·{" "}
                <span className="tabular-nums">
                  {n.arrival_time ?? "nincs érkezés"} – {n.departure_time ?? "nincs távozás"}
                </span>
              </span>
              {canEdit && (
                <>
                  <Input
                    type="time"
                    value={idok[n.session_id] ?? ""}
                    onChange={(e) => setIdok((v) => ({ ...v, [n.session_id]: e.target.value }))}
                    className="h-7 w-28 bg-white"
                  />
                  <Button size="xs" disabled={pending} onClick={() => lezar(n)}>
                    {n.arrival_time ? "Távozás beírása" : "Érkezés beírása"}
                  </Button>
                </>
              )}
            </div>
          ))}
          <p className="text-[11px] text-amber-800">
            A hiányzó érkezésű sort a havi naplóban tudod rendbe tenni vagy törölni.
          </p>
        </div>
      )}
    </div>
  );
}

// Elrendezés: vékony jelenlét-sáv a mai nappal, alatta telephelyenként egy
// sűrű feladatlista (8-10 tétel is elfér), legalul az ütemezett (még nem
// esedékes) feladatok. A feladatrögzítő a fejléc gombja mögött van.
export function JelenletView() {
  const canEdit = useCanEdit();
  const [sites, setSites] = useState<Site[]>([]);
  const [feladatok, setFeladatok] = useState<Feladat[]>([]);
  const [nyitottNapok, setNyitottNapok] = useState<NyitottNap[]>([]);
  const [keszMa, setKeszMa] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Feladat | null>(null);
  const [haviNyitva, setHaviNyitva] = useState(false);

  const load = useCallback(async () => {
    const [siteRows, taskRows, nyitott, kesz] = await Promise.all([
      getSites(),
      listFeladatok(),
      getNyitottNapok().catch(() => [] as NyitottNap[]),
      getMaiKeszSzamok().catch(() => ({}) as Record<number, number>),
    ]);
    setSites(siteRows);
    setFeladatok(taskRows);
    setNyitottNapok(nyitott);
    setKeszMa(kesz);
  }, []);

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
            <Link
              href="/jelenlet/archivum"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Archívum
            </Link>
            <UjFeladatGomb sites={sites} canEdit={canEdit} onCreated={load} />
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
              siteName={s.name}
              feladatok={aktualis.filter((f) => f.site_id === s.id)}
              keszMa={keszMa[s.id] ?? 0}
              onSelect={setSelected}
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
