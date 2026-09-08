"use client";

import { useCallback, useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { FeladatCommentsDialog } from "@/components/jelenlet/feladat-comments-dialog";
import { logout } from "@/lib/auth/actions";
import { getSites, listFeladatok } from "@/lib/jelenlet/actions";
import type { Feladat, Site } from "@/lib/jelenlet/shared";
import { MaiErkezesTile } from "@/components/erkezes/mai-erkezes-tile";
import { FeladatRogzitesTile } from "@/components/erkezes/feladat-rogzites-tile";
import { HaviOsszesitoTile } from "@/components/erkezes/havi-osszesito-tile";
import { TelephelyFeladatokTile } from "@/components/erkezes/telephely-feladatok-tile";

// Elrendezés: felül 3, azonos méretű kis csempe (Mai érkezés, Feladat
// rögzítése, Havi összesítő), alatta a három telephelyhez egy-egy nagy,
// álló téglalap csempe az odaadott feladatokkal.
export function ErkezesSajatView({
  employeeId,
  employeeName,
}: {
  employeeId: string;
  employeeName: string;
}) {
  const [sites, setSites] = useState<Site[]>([]);
  const [feladatok, setFeladatok] = useState<Feladat[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [selected, setSelected] = useState<Feladat | null>(null);

  const loadTasks = useCallback(async () => {
    const [siteRows, taskRows] = await Promise.all([getSites(), listFeladatok()]);
    setSites(siteRows);
    setFeladatok(taskRows);
  }, []);

  useEffect(() => {
    setLoadingTasks(true);
    loadTasks().finally(() => setLoadingTasks(false));
  }, [loadTasks]);

  const openTasks = feladatok.filter((f) => !f.done);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 bg-muted/40 px-4 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">{employeeName}</h1>
          <p className="text-xs text-muted-foreground">Jelenlét</p>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
            Kijelentkezés
          </button>
        </form>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <MaiErkezesTile employeeId={employeeId} />
        <FeladatRogzitesTile sites={sites} onCreated={loadTasks} />
        <HaviOsszesitoTile employeeId={employeeId} />
      </div>

      <div className="flex flex-col gap-3">
        {loadingTasks ? (
          <p className="text-sm text-muted-foreground">Betöltés…</p>
        ) : (
          sites.map((s) => (
            <TelephelyFeladatokTile
              key={s.id}
              siteName={s.name}
              feladatok={openTasks.filter((f) => f.site_id === s.id)}
              onSelect={setSelected}
            />
          ))
        )}
      </div>

      <FeladatCommentsDialog
        feladat={selected}
        open={selected !== null}
        onOpenChange={(o) => !o && setSelected(null)}
        onChanged={loadTasks}
        showDoneToggle
      />
    </div>
  );
}
