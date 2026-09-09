"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOsszkeszlet, type OsszkeszletRow } from "@/lib/keszlet/actions";

const SITE_ORDER = ["Nyíregyháza", "Balkány", "Szakoly"] as const;

export function OsszkeszletTab() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<OsszkeszletRow[]>([]);

  const load = useCallback(async () => {
    setRows(await getOsszkeszlet());
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Betöltés…</p>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Összkészlet — típusonként, telephelyenkénti bontásban</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nincs aktivált típus egyik telephelyen sem.</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
            {rows.map((r) => (
              <div key={r.type} className="rounded-lg border bg-muted/30 px-3 py-3">
                <div className="truncate text-xs font-medium text-muted-foreground">{r.type}</div>
                <div className="text-2xl font-bold tabular-nums">{r.total}</div>
                <div className="mt-1.5 space-y-0.5">
                  {SITE_ORDER.filter((site) => site in r.bySite).map((site) => (
                    <div
                      key={site}
                      className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground"
                    >
                      <span className="truncate">{site}</span>
                      <span className="shrink-0 font-medium tabular-nums text-foreground">
                        {r.bySite[site]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
