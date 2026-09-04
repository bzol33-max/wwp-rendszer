"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { X } from "lucide-react";
import {
  addFuvar,
  deleteFuvar,
  getFuvarok,
  updateFuvarStatus,
  FUVAR_STATUSZ_LABEL,
  FUVAR_STATUSZOK,
  type FuvarRow,
  type FuvarStatusz,
  type FuvarTipus,
} from "@/lib/fuvarozas/megbizasok";
import { getCurrentUser } from "@/lib/current-user";

const STATUSZ_BADGE_CLASS: Record<FuvarStatusz, string> = {
  uj: "bg-muted text-muted-foreground hover:bg-muted",
  tervezett: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  uton: "bg-primary/15 text-primary hover:bg-primary/15",
  lezarva: "bg-success/15 text-success hover:bg-success/15",
  szamlazva: "bg-success/25 text-success hover:bg-success/25",
  problemas: "bg-destructive/15 text-destructive hover:bg-destructive/15",
  torolt: "bg-muted text-muted-foreground hover:bg-muted",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function eredmeny(row: FuvarRow): number | null {
  if (row.fuvardij == null || row.koltseg == null) return null;
  return row.fuvardij - row.koltseg;
}

function FuvarForm({
  tipus,
  onSaved,
}: {
  tipus: FuvarTipus;
  onSaved: () => void | Promise<void>;
}) {
  const [datum, setDatum] = useState(todayISO());
  const [felrako, setFelrako] = useState("");
  const [lerako, setLerako] = useState("");
  const [megrendelo, setMegrendelo] = useState("");
  const [aru, setAru] = useState("");
  const [jarmu, setJarmu] = useState("");
  const [alvallalkozo, setAlvallalkozo] = useState("");
  const [fuvardij, setFuvardij] = useState("");
  const [koltseg, setKoltseg] = useState("");
  const [megjegyzes, setMegjegyzes] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setDatum(todayISO());
    setFelrako("");
    setLerako("");
    setMegrendelo("");
    setAru("");
    setJarmu("");
    setAlvallalkozo("");
    setFuvardij("");
    setKoltseg("");
    setMegjegyzes("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!felrako.trim() || !lerako.trim()) {
      toast.error("Add meg a felrakó és lerakó helyet.");
      return;
    }
    setSaving(true);
    try {
      await addFuvar({
        tipus,
        datum,
        felrako,
        lerako,
        megrendelo: megrendelo || undefined,
        aru: aru || undefined,
        jarmu: jarmu || undefined,
        alvallalkozo: alvallalkozo || undefined,
        fuvardij: fuvardij ? Number(fuvardij) : undefined,
        koltseg: koltseg ? Number(koltseg) : undefined,
        megjegyzes: megjegyzes || undefined,
        createdBy: getCurrentUser() || undefined,
      });
      reset();
      await onSaved();
      toast.success("Fuvar rögzítve.");
    } catch {
      toast.error("Nem sikerült menteni.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          Új {tipus === "sajat" ? "saját" : "bér"} fuvar
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label>Dátum</Label>
              <Input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Felrakó</Label>
              <Input
                placeholder="pl. Szakoly"
                value={felrako}
                onChange={(e) => setFelrako(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Lerakó</Label>
              <Input
                placeholder="pl. Budapest"
                value={lerako}
                onChange={(e) => setLerako(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label>Megrendelő</Label>
              <Input
                placeholder="partner neve"
                value={megrendelo}
                onChange={(e) => setMegrendelo(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Áru</Label>
              <Input
                placeholder="pl. 600 db EUR raklap"
                value={aru}
                onChange={(e) => setAru(e.target.value)}
              />
            </div>
            {tipus === "sajat" ? (
              <div className="flex flex-col gap-1.5">
                <Label>Jármű (rendszám)</Label>
                <Input
                  placeholder="pl. ABC-123"
                  value={jarmu}
                  onChange={(e) => setJarmu(e.target.value)}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label>Alvállalkozó</Label>
                <Input
                  placeholder="fuvarozó partner neve"
                  value={alvallalkozo}
                  onChange={(e) => setAlvallalkozo(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label>Fuvardíj (Ft)</Label>
              <Input
                type="number"
                value={fuvardij}
                onChange={(e) => setFuvardij(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{tipus === "sajat" ? "Költség (Ft)" : "Alvállalkozói díj (Ft)"}</Label>
              <Input type="number" value={koltseg} onChange={(e) => setKoltseg(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Megjegyzés</Label>
              <Input value={megjegyzes} onChange={(e) => setMegjegyzes(e.target.value)} />
            </div>
          </div>

          <Button type="submit" disabled={saving} className="self-start">
            {saving ? "Mentés…" : "Fuvar rögzítése"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function FuvarList({ tipus, refreshKey }: { tipus: FuvarTipus; refreshKey: number }) {
  const [rows, setRows] = useState<FuvarRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await getFuvarok(tipus);
    setRows(data);
  }, [tipus]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load, refreshKey]);

  async function handleStatusChange(id: string, statusz: FuvarStatusz) {
    await updateFuvarStatus(id, statusz);
    await load();
  }

  async function handleDelete(id: string) {
    await deleteFuvar(id);
    await load();
    toast.success("Fuvar törölve.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          {tipus === "sajat" ? "Saját fuvarok" : "Bér fuvarok"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dátum</TableHead>
                <TableHead>Honnan → Hová</TableHead>
                <TableHead>Megrendelő</TableHead>
                <TableHead>{tipus === "sajat" ? "Jármű" : "Alvállalkozó"}</TableHead>
                <TableHead className="text-right">Fuvardíj</TableHead>
                <TableHead className="text-right">Eredmény</TableHead>
                <TableHead>Státusz</TableHead>
                <TableHead>Ki</TableHead>
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    Még nincs rögzített fuvar.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => {
                const res = eredmeny(row);
                return (
                  <TableRow key={row.id}>
                    <TableCell className="text-muted-foreground">{row.date}</TableCell>
                    <TableCell>
                      {row.felrako} → {row.lerako}
                    </TableCell>
                    <TableCell>{row.megrendelo ?? "—"}</TableCell>
                    <TableCell>
                      {tipus === "sajat" ? row.jarmu ?? "—" : row.alvallalkozo ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.fuvardij != null ? `${row.fuvardij.toLocaleString("hu-HU")} Ft` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {res != null ? (
                        <span className={res < 0 ? "text-destructive" : "text-success"}>
                          {res.toLocaleString("hu-HU")} Ft
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={row.statusz}
                        onValueChange={(v) => v && handleStatusChange(row.id, v as FuvarStatusz)}
                      >
                        <SelectTrigger className="h-7 w-[130px] text-xs">
                          <SelectValue>
                            <Badge className={`${STATUSZ_BADGE_CLASS[row.statusz]} text-xs`}>
                              {FUVAR_STATUSZ_LABEL[row.statusz]}
                            </Badge>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {FUVAR_STATUSZOK.filter((s) => s !== "torolt").map((s) => (
                            <SelectItem key={s} value={s}>
                              {FUVAR_STATUSZ_LABEL[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.created_by ?? "—"}
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => handleDelete(row.id)}
                        title="Törlés"
                        className="text-destructive/70 hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function FuvarTypeView({ tipus }: { tipus: FuvarTipus }) {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="flex flex-col gap-4">
      <FuvarForm tipus={tipus} onSaved={() => setRefreshKey((k) => k + 1)} />
      <FuvarList tipus={tipus} refreshKey={refreshKey} />
    </div>
  );
}

export function Megbizasok() {
  return (
    <Tabs defaultValue="sajat">
      <TabsList>
        <TabsTrigger value="sajat">Saját fuvarok</TabsTrigger>
        <TabsTrigger value="ber">Bér fuvarok</TabsTrigger>
      </TabsList>
      <TabsContent value="sajat" className="mt-4">
        <FuvarTypeView tipus="sajat" />
      </TabsContent>
      <TabsContent value="ber" className="mt-4">
        <FuvarTypeView tipus="ber" />
      </TabsContent>
    </Tabs>
  );
}
