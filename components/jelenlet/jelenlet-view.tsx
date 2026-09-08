"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { useCanEdit } from "@/components/auth/edit-permission-context";
import { MaiErkezesTile } from "@/components/jelenlet/erkezes-widget";
import { FeladatRogzitesTile } from "@/components/jelenlet/feladat-rogzites-tile";
import { HaviOsszesitoAdminTile } from "@/components/jelenlet/havi-osszesito-admin-tile";
import { TelephelyFeladatokTile } from "@/components/jelenlet/telephely-feladatok-tile";
import { FeladatCommentsDialog } from "@/components/jelenlet/feladat-comments-dialog";
import { getSites, listFeladatok } from "@/lib/jelenlet/actions";
import type { Feladat, Site } from "@/lib/jelenlet/shared";

// Elrendezés: felül három azonos méretű csempe (Mai érkezés, Feladat
// rögzítése, Havi összesítő), alattuk telephelyenként egy-egy nagy, álló
// téglalap csempe az odaadott aktuális feladatokkal.
export function JelenletView() {
  const canEdit = useCanEdit();
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
    <div className="flex flex-col gap-5">
      <PageHeader title="Jelenléti/üzenőfal" subtitle="Napi érkezés és feladatok" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MaiErkezesTile />
        <FeladatRogzitesTile sites={sites} canEdit={canEdit} onCreated={loadTasks} />
        <HaviOsszesitoAdminTile />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
        canEdit={canEdit}
      />
    </div>
  );
}
