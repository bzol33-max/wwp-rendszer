"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  approveFuvar,
  deleteFuvar,
  getElokeszitettFuvarok,
  getFuvarok,
  updateFuvarStatus,
} from "@/lib/fuvarozas/megbizasok";
import {
  FUVAR_STATUSZ_LABEL,
  FUVAR_STATUSZOK,
  type FuvarRow,
  type FuvarStatusz,
  type FuvarTipus,
} from "@/lib/fuvarozas/fuvar-constants";
import { getCurrentUser } from "@/lib/current-user";
import { SAJAT_JARMUVEK, jarmuLabel } from "@/lib/fuvarozas/vehicles";

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

const SAJAT_TELEP_PARTNER = "Well-Worn Pallet Kft.";

function eredmeny(row: FuvarRow): number | null {
  if (row.fuvardij == null || row.koltseg == null) return null;
  return row.fuvardij - row.koltseg;
}

type FormState = {
  tipus: FuvarTipus;
  datum: string;
  idopont: string;
  felrako: string;
  lerako: string;
  megrendelo: string;
  aru: string;
  mennyiseg: string;
  suly: string;
  jarmu: string;
  sofor: string;
  alvallalkozo: string;
  fuvardij: string;
  koltseg: string;
  megjegyzes: string;
};

function emptyForm(tipus: FuvarTipus): FormState {
  return {
    tipus,
    datum: todayISO(),
    idopont: "",
    felrako: "",
    lerako: "",
    megrendelo: "",
    aru: "",
    mennyiseg: "",
    suly: "",
    jarmu: "",
    sofor: "",
    alvallalkozo: "",
    fuvardij: "",
    koltseg: "",
    megjegyzes: "",
  };
}

function formFromRow(row: FuvarRow): FormState {
  return {
    tipus: row.tipus,
    datum: todayISO(), // a szerver "mon. DD" formátumot ad vissza, dátum-inputhoz nem használható újra
    idopont: row.idopont ?? "",
    felrako: row.felrako ?? "",
    lerako: row.lerako,
    megrendelo: row.megrendelo ?? "",
    aru: row.aru ?? "",
    mennyiseg: row.mennyiseg ?? "",
    suly: row.suly ?? "",
    jarmu: row.jarmu ?? "",
    sofor: row.sofor ?? "",
    alvallalkozo: row.alvallalkozo ?? "",
    fuvardij: row.fuvardij != null ? String(row.fuvardij) : "",
    koltseg: row.koltseg != null ? String(row.koltseg) : "",
    megjegyzes: row.megjegyzes ?? "",
  };
}

function FuvarFields({
  form,
  onChange,
}: {
  form: FormState;
  onChange: (patch: Partial<FormState>) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label>Dátum</Label>
          <Input
            type="date"
            value={form.datum}
            onChange={(e) => onChange({ datum: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Időpont</Label>
          <Input
            placeholder="pl. 06:00"
            value={form.idopont}
            onChange={(e) => onChange({ idopont: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Felrakó</Label>
          <Input
            placeholder="pl. Szakoly"
            value={form.felrako}
            onChange={(e) => onChange({ felrako: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Lerakó</Label>
          <Input
            placeholder="pl. Budapest"
            value={form.lerako}
            onChange={(e) => onChange({ lerako: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label>Megrendelő</Label>
          <Input
            placeholder="partner neve"
            value={form.megrendelo}
            onChange={(e) => onChange({ megrendelo: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Áru</Label>
          <Input value={form.aru} onChange={(e) => onChange({ aru: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Mennyiség</Label>
          <Input
            placeholder="pl. 600 db EUR raklap"
            value={form.mennyiseg}
            onChange={(e) => onChange({ mennyiseg: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Súly</Label>
          <Input
            placeholder="pl. 24 t"
            value={form.suly}
            onChange={(e) => onChange({ suly: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        {form.tipus === "sajat" ? (
          <>
            <div className="flex flex-col gap-1.5">
              <Label>Jármű (rendszám)</Label>
              <Input
                placeholder="pl. ABC-123"
                value={form.jarmu}
                onChange={(e) => onChange({ jarmu: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Sofőr</Label>
              <Input value={form.sofor} onChange={(e) => onChange({ sofor: e.target.value })} />
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Alvállalkozó</Label>
            <Input
              placeholder="fuvarozó partner neve"
              value={form.alvallalkozo}
              onChange={(e) => onChange({ alvallalkozo: e.target.value })}
            />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label>Fuvardíj (Ft)</Label>
          <Input
            type="number"
            value={form.fuvardij}
            onChange={(e) => onChange({ fuvardij: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>{form.tipus === "sajat" ? "Költség (Ft)" : "Alvállalkozói díj (Ft)"}</Label>
          <Input
            type="number"
            value={form.koltseg}
            onChange={(e) => onChange({ koltseg: e.target.value })}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Megjegyzés</Label>
        <Input
          value={form.megjegyzes}
          onChange={(e) => onChange({ megjegyzes: e.target.value })}
        />
      </div>
    </div>
  );
}

function MinimalFuvarFields({
  form,
  onChange,
}: {
  form: FormState;
  onChange: (patch: Partial<FormState>) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
      <div className="flex flex-col gap-1.5">
        <Label>Dátum</Label>
        <Input
          type="date"
          value={form.datum}
          onChange={(e) => onChange({ datum: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Partner</Label>
        <Input
          placeholder="partner neve"
          value={form.megrendelo}
          disabled={form.megrendelo === SAJAT_TELEP_PARTNER}
          onChange={(e) => onChange({ megrendelo: e.target.value })}
        />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Checkbox
            checked={form.megrendelo === SAJAT_TELEP_PARTNER}
            onCheckedChange={(checked) =>
              onChange({ megrendelo: checked === true ? SAJAT_TELEP_PARTNER : "" })
            }
          />
          Saját telepek közti szállítás
        </label>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Felrakó</Label>
        <Input
          placeholder="pl. Szakoly"
          value={form.felrako}
          onChange={(e) => onChange({ felrako: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Lerakó</Label>
        <Input
          placeholder="pl. Budapest"
          value={form.lerako}
          onChange={(e) => onChange({ lerako: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Kocsi</Label>
        <Select value={form.jarmu} onValueChange={(v) => v && onChange({ jarmu: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Válassz kocsit" />
          </SelectTrigger>
          <SelectContent>
            {SAJAT_JARMUVEK.map((j) => (
              <SelectItem key={j.sofor} value={jarmuLabel(j)}>
                {jarmuLabel(j)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function FuvarForm({
  tipus,
  onSaved,
  minimal,
  titleOverride,
}: {
  tipus: FuvarTipus;
  onSaved: () => void | Promise<void>;
  minimal?: boolean;
  titleOverride?: string;
}) {
  const [form, setForm] = useState<FormState>(emptyForm(tipus));
  const [saving, setSaving] = useState(false);

  function patch(p: Partial<FormState>) {
    setForm((f) => ({ ...f, ...p }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.felrako.trim() || !form.lerako.trim()) {
      toast.error("Add meg a felrakó és lerakó helyet.");
      return;
    }
    setSaving(true);
    try {
      await addFuvar({
        tipus,
        datum: form.datum,
        idopont: minimal ? undefined : form.idopont || undefined,
        felrako: form.felrako,
        lerako: form.lerako,
        megrendelo: form.megrendelo || undefined,
        aru: minimal ? undefined : form.aru || undefined,
        mennyiseg: minimal ? undefined : form.mennyiseg || undefined,
        suly: minimal ? undefined : form.suly || undefined,
        jarmu: form.jarmu || undefined,
        sofor: minimal ? undefined : form.sofor || undefined,
        alvallalkozo: minimal ? undefined : form.alvallalkozo || undefined,
        fuvardij: minimal ? undefined : form.fuvardij ? Number(form.fuvardij) : undefined,
        koltseg: minimal ? undefined : form.koltseg ? Number(form.koltseg) : undefined,
        megjegyzes: minimal ? undefined : form.megjegyzes || undefined,
        createdBy: getCurrentUser() || undefined,
      });
      setForm(emptyForm(tipus));
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
          {titleOverride ?? `Új ${tipus === "sajat" ? "saját" : "bér"} fuvar`}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {minimal ? (
            <MinimalFuvarFields form={form} onChange={patch} />
          ) : (
            <FuvarFields form={form} onChange={patch} />
          )}
          <Button type="submit" disabled={saving} className="self-start">
            {saving ? "Mentés…" : "Fuvar rögzítése"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function FuvarList({
  tipus,
  refreshKey,
  titleOverride,
  showJarmu,
}: {
  tipus: FuvarTipus;
  refreshKey: number;
  titleOverride?: string;
  /** Melyik oszlopot mutassa a jármű-oszlopban — alapból tipus alapján dől el. */
  showJarmu?: boolean;
}) {
  const jarmuOszlop = showJarmu ?? tipus === "sajat";
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
          {titleOverride ?? (tipus === "sajat" ? "Saját fuvarok" : "Bér fuvarok")}
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
                <TableHead>{jarmuOszlop ? "Kocsi" : "Alvállalkozó"}</TableHead>
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
                    <TableCell className="text-muted-foreground">
                      {row.date}
                      {!row.ellenorzott && (
                        <Badge className="ml-1.5 bg-warning/20 text-warning hover:bg-warning/20">
                          Ellenőrzés szükséges
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.felrako ? `${row.felrako} → ${row.lerako}` : row.lerako}
                    </TableCell>
                    <TableCell>{row.megrendelo ?? "—"}</TableCell>
                    <TableCell>
                      {jarmuOszlop ? row.jarmu ?? "—" : row.alvallalkozo ?? "—"}
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

function FuvarTypeView({
  tipus,
  minimal,
  formTitle,
  listTitle,
  showJarmu,
}: {
  tipus: FuvarTipus;
  minimal?: boolean;
  formTitle?: string;
  listTitle?: string;
  showJarmu?: boolean;
}) {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="flex flex-col gap-4">
      <FuvarForm
        tipus={tipus}
        onSaved={() => setRefreshKey((k) => k + 1)}
        minimal={minimal}
        titleOverride={formTitle}
      />
      <FuvarList
        tipus={tipus}
        refreshKey={refreshKey}
        titleOverride={listTitle}
        showJarmu={showJarmu}
      />
    </div>
  );
}

function ElokeszitettCard({
  row,
  onDone,
}: {
  row: FuvarRow;
  onDone: () => void | Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(formFromRow(row));
  const [saving, setSaving] = useState(false);

  function patch(p: Partial<FormState>) {
    setForm((f) => ({ ...f, ...p }));
  }

  async function handleApprove() {
    setSaving(true);
    try {
      await approveFuvar({
        id: row.id,
        tipus: form.tipus,
        datum: form.datum,
        idopont: form.idopont || undefined,
        felrako: form.felrako,
        lerako: form.lerako,
        megrendelo: form.megrendelo || undefined,
        aru: form.aru || undefined,
        mennyiseg: form.mennyiseg || undefined,
        suly: form.suly || undefined,
        jarmu: form.jarmu || undefined,
        sofor: form.sofor || undefined,
        alvallalkozo: form.alvallalkozo || undefined,
        fuvardij: form.fuvardij ? Number(form.fuvardij) : undefined,
        koltseg: form.koltseg ? Number(form.koltseg) : undefined,
        megjegyzes: form.megjegyzes || undefined,
      });
      await onDone();
      toast.success("Fuvar jóváhagyva.");
    } catch {
      toast.error("Nem sikerült jóváhagyni.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReject() {
    await deleteFuvar(row.id);
    await onDone();
    toast.success("Tétel elutasítva.");
  }

  return (
    <Card className="border-warning/30 bg-warning/5">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">
            A rendszer ezt a fuvart készítette elő. Ellenőrzés szükséges.
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select
              value={form.tipus}
              onValueChange={(v) => v && patch({ tipus: v as FuvarTipus })}
            >
              <SelectTrigger className="h-7 w-[110px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sajat">Saját</SelectItem>
                <SelectItem value="ber">Bér</SelectItem>
              </SelectContent>
            </Select>
            {row.dokumentum_url && (
              <a
                href={row.dokumentum_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                eredeti dokumentum
              </a>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <FuvarFields form={form} onChange={patch} />
        <div className="mt-4 flex gap-2">
          <Button size="sm" disabled={saving} onClick={handleApprove}>
            Jóváhagy
          </Button>
          <Button size="sm" variant="outline" disabled={saving} onClick={handleReject}>
            Elutasít
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ElokeszitettView() {
  const [rows, setRows] = useState<FuvarRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await getElokeszitettFuvarok();
    setRows(data);
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  if (loading) return <p className="text-sm text-muted-foreground">Betöltés…</p>;

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nincs ellenőrzésre váró, automatikusan előkészített fuvar.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {rows.map((row) => (
        <ElokeszitettCard key={row.id} row={row} onDone={load} />
      ))}
    </div>
  );
}

export function Megbizasok() {
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    getElokeszitettFuvarok().then((rows) => setPendingCount(rows.length));
  }, []);

  return (
    <Tabs defaultValue="sajat">
      <TabsList>
        <TabsTrigger value="sajat">Bér fuvarok</TabsTrigger>
        <TabsTrigger value="ber">Saját fuvarok</TabsTrigger>
        <TabsTrigger value="elokeszitett">
          Ellenőrzésre vár{pendingCount ? ` (${pendingCount})` : ""}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="sajat" className="mt-4">
        <FuvarTypeView tipus="sajat" />
      </TabsContent>
      <TabsContent value="ber" className="mt-4">
        <FuvarTypeView
          tipus="ber"
          minimal
          formTitle="Új saját fuvar"
          listTitle="Saját fuvarok"
          showJarmu
        />
      </TabsContent>
      <TabsContent value="elokeszitett" className="mt-4">
        <ElokeszitettView />
      </TabsContent>
    </Tabs>
  );
}
