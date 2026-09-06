"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { X } from "lucide-react";
import {
  addFuvar,
  approveFuvar,
  deleteFuvar,
  getElokeszitettFuvarok,
  getFuvarok,
  getPostazasiCimJavaslat,
  setFuvarPoziciszam,
  setFuvarPostazasiCim,
  updateFuvarStatus,
} from "@/lib/fuvarozas/megbizasok";
import { calculateTollForAddresses, getGazolajAr } from "@/lib/fuvarozas/actions";
import {
  FUVAR_STATUSZ_LABEL,
  FUVAR_STATUSZOK,
  type FuvarRow,
  type FuvarStatusz,
  type FuvarTipus,
} from "@/lib/fuvarozas/fuvar-constants";
import { getCurrentUser } from "@/lib/current-user";
import { Kapcsolatok } from "@/components/fuvarozas/kapcsolatok";
import {
  SAJAT_JARMUVEK,
  JARMU_SZIN_DOT_CLASS,
  jarmuLabel,
  resolveJarmu,
} from "@/lib/fuvarozas/vehicles";

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

const SAJAT_TELEP_PARTNER = "Telephelyek közti szállítás";

function eredmeny(row: FuvarRow): number | null {
  if (row.fuvardij == null || row.koltseg == null) return null;
  return row.fuvardij - row.koltseg;
}

/**
 * Egy jármű-mező (a mai "Sofőr — címke" formátumtól a régebbi, csak
 * sofőrnevet vagy rendszámot tartalmazó bejegyzésekig) a hozzá tartozó
 * színes ponttal — mindenhol, ahol jármű szerepel a Fuvarozás fülön,
 * függetlenül a mező pontos szövegétől.
 */
function JarmuJelolo({ value }: { value: string }) {
  const j = resolveJarmu(value);
  return (
    <span className="inline-flex items-center gap-1.5">
      {j && <span className={`h-2 w-2 shrink-0 rounded-full ${JARMU_SZIN_DOT_CLASS[j.szin]}`} />}
      {value}
    </span>
  );
}

/**
 * A lista soraiban a hivatkozási szám (fuvarszám / pozíciószám / megbízási
 * szám) inline szerkeszthető cellája. Ha üres és nincs "nincs ilyen" jelölve,
 * piros figyelmeztetést mutat — kattintásra bárhonnan azonnal kitölthető
 * vagy "nincs"-re jelölhető, szerkesztő űrlap megnyitása nélkül.
 */
function PoziciszamCell({
  row,
  onSaved,
}: {
  row: FuvarRow;
  onSaved: () => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(row.pozicioszam ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(row.pozicioszam ?? "");
  }, [row.pozicioszam]);

  async function persist(pozicioszam: string | null, nincs: boolean) {
    setSaving(true);
    try {
      await setFuvarPoziciszam(row.id, { pozicioszam, nincs });
      await onSaved();
      setEditing(false);
    } catch {
      toast.error("Nem sikerült menteni.");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1">
        <Input
          autoFocus
          className="h-7 w-[140px] text-xs"
          placeholder="hiv. szám"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") persist(value || null, false);
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          <button
            type="button"
            className="text-primary hover:underline disabled:opacity-50"
            disabled={saving}
            onClick={() => persist(value || null, false)}
          >
            Mentés
          </button>
          <button
            type="button"
            className="text-muted-foreground hover:underline disabled:opacity-50"
            disabled={saving}
            onClick={() => persist(null, true)}
          >
            Nincs ilyen
          </button>
          <button
            type="button"
            className="text-muted-foreground hover:underline"
            onClick={() => setEditing(false)}
          >
            Mégse
          </button>
        </div>
      </div>
    );
  }

  if (row.pozicioszam) {
    return (
      <button
        type="button"
        title="Szerkesztés"
        className="text-left hover:underline"
        onClick={() => setEditing(true)}
      >
        {row.pozicioszam}
      </button>
    );
  }

  if (row.pozicioszam_nincs) {
    return (
      <button
        type="button"
        title="Szerkesztés"
        className="text-left text-muted-foreground hover:underline"
        onClick={() => setEditing(true)}
      >
        — (nincs ilyen)
      </button>
    );
  }

  return (
    <button
      type="button"
      title="Kattints a kitöltéshez"
      className="text-left text-xs font-medium text-destructive hover:underline"
      onClick={() => setEditing(true)}
    >
      ⚠️ ellenőrizd, hiányzik a hiv. szám
    </button>
  );
}

/** Egy sor a lista táblázatban inline szerkeszthető, szabad szöveges mező (pl. postázási cím). */
function SzovegCell({
  value,
  onSave,
  placeholder,
}: {
  value: string | null;
  onSave: (value: string | null) => Promise<void>;
  placeholder: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setText(value ?? "");
  }, [value]);

  async function persist() {
    setSaving(true);
    try {
      await onSave(text || null);
      setEditing(false);
    } catch {
      toast.error("Nem sikerült menteni.");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          autoFocus
          className="h-7 w-[220px] text-xs"
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") persist();
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <button
          type="button"
          className="text-xs text-primary hover:underline disabled:opacity-50"
          disabled={saving}
          onClick={persist}
        >
          Mentés
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      title="Szerkesztés"
      className={`text-left hover:underline ${value ? "" : "text-muted-foreground"}`}
      onClick={() => setEditing(true)}
    >
      {value ?? placeholder}
    </button>
  );
}

/** Egy sor a fuvar-részletek nézetben — csak akkor jelenik meg, ha van értéke. */
function ReszletSor({ label, children }: { label: string; children: ReactNode }) {
  if (children == null || children === "") return null;
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-1.5 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

/**
 * A dátumra kattintva megnyíló részletes megbízás-nézet — minden a fuvarhoz
 * rögzített adatot egy helyen mutat, plusz a forrás dokumentum linkjét, ha
 * PDF-importból származik.
 */
function FuvarDetailModal({
  row,
  onClose,
}: {
  row: FuvarRow | null;
  onClose: () => void;
}) {
  const res = row ? eredmeny(row) : null;
  return (
    <Dialog open={row != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {row && (
          <>
            <DialogHeader>
              <DialogTitle>
                {row.felrako ? `${row.felrako} → ${row.lerako}` : row.lerako}
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col">
              <ReszletSor label="Dátum">{row.date}</ReszletSor>
              <ReszletSor label="Beérkezés dátuma">{row.erkezett_datum}</ReszletSor>
              <ReszletSor label="Lerakás dátuma">{row.lerakas_datum}</ReszletSor>
              <ReszletSor label="Időpont">{row.idopont}</ReszletSor>
              <ReszletSor label="Megrendelő">{row.megrendelo}</ReszletSor>
              <ReszletSor label="Hiv. szám">
                {row.pozicioszam ?? (row.pozicioszam_nincs ? "— (nincs ilyen)" : null)}
              </ReszletSor>
              <ReszletSor label="Áru">{row.aru}</ReszletSor>
              <ReszletSor label="Mennyiség">{row.mennyiseg}</ReszletSor>
              <ReszletSor label="Súly">{row.suly}</ReszletSor>
              <ReszletSor label="Kocsi">{row.jarmu && <JarmuJelolo value={row.jarmu} />}</ReszletSor>
              <ReszletSor label="Sofőr">{row.sofor}</ReszletSor>
              <ReszletSor label="Alvállalkozó">{row.alvallalkozo}</ReszletSor>
              <ReszletSor label="Fuvardíj">
                {row.fuvardij != null ? `${row.fuvardij.toLocaleString("hu-HU")} Ft` : null}
              </ReszletSor>
              <ReszletSor label="Költség">
                {row.koltseg != null ? `${row.koltseg.toLocaleString("hu-HU")} Ft` : null}
              </ReszletSor>
              <ReszletSor label="Eredmény">
                {res != null && (
                  <span className={res < 0 ? "text-destructive" : "text-success"}>
                    {res.toLocaleString("hu-HU")} Ft
                  </span>
                )}
              </ReszletSor>
              <ReszletSor label="Fizetési határidő">
                {row.fizetesi_hatarido_nap != null ? `${row.fizetesi_hatarido_nap} nap` : null}
              </ReszletSor>
              <ReszletSor label="Státusz">{FUVAR_STATUSZ_LABEL[row.statusz]}</ReszletSor>
              <ReszletSor label="Postázási cím">{row.postazasi_cim}</ReszletSor>
              <ReszletSor label="Megjegyzés">{row.megjegyzes}</ReszletSor>
              <ReszletSor label="Rögzítette">{row.created_by}</ReszletSor>
            </div>
            {row.dokumentum_url && (
              <a
                href={row.dokumentum_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                Eredeti dokumentum megnyitása
              </a>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
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
  pozicioszam: string;
  pozicioszamNincs: boolean;
  postazasiCim: string;
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
    pozicioszam: "",
    pozicioszamNincs: false,
    postazasiCim: "",
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
    pozicioszam: row.pozicioszam ?? "",
    pozicioszamNincs: row.pozicioszam_nincs,
    postazasiCim: row.postazasi_cim ?? "",
  };
}

/**
 * A megbízó által adott hivatkozási szám (fuvarszám / pozíciószám /
 * megbízási szám — mind ugyanaz). Figyelmeztet, ha üres és nincs "nincs
 * ilyen szám" jelölve — ez a szám sok megbízónál kötelező a számlán, és a
 * beérkező számlák automatikus párosításához is ez az elsődleges kulcs.
 */
function PoziciszamMezo({
  pozicioszam,
  nincs,
  onChange,
}: {
  pozicioszam: string;
  nincs: boolean;
  onChange: (patch: { pozicioszam?: string; pozicioszamNincs?: boolean }) => void;
}) {
  const hianyzik = !pozicioszam.trim() && !nincs;
  return (
    <div className="flex flex-col gap-1.5">
      <Label>Hiv. szám (fuvarszám / pozíciószám)</Label>
      <Input
        placeholder="a megbízó által adott szám"
        value={pozicioszam}
        disabled={nincs}
        onChange={(e) => onChange({ pozicioszam: e.target.value, pozicioszamNincs: false })}
      />
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Checkbox
          checked={nincs}
          onCheckedChange={(checked) =>
            onChange({ pozicioszamNincs: checked === true, pozicioszam: checked === true ? "" : pozicioszam })
          }
        />
        Ennél a megbízónál nincs ilyen szám
      </label>
      {hianyzik && (
        <span className="text-xs font-medium text-destructive">
          ⚠️ ellenőrizd, hiányzik a hiv. szám
        </span>
      )}
    </div>
  );
}

/**
 * A megrendelő számára kiállított számla/eredeti dokumentumok postázási
 * címe (Számla/Posta fül). Csak Bér fuvaroknál értelmezett — új megbízás
 * jóváhagyásakor a rendszer automatikusan felajánlja az adott megrendelőnél
 * korábban már rögzített postázási címet (lásd getPostazasiCimJavaslat),
 * hogy ne kelljen ismert partnernél újra beírni; ha nincs ilyen javaslat és
 * a mező üres, figyelmeztet.
 */
function PostazasiCimMezo({
  postazasiCim,
  onChange,
}: {
  postazasiCim: string;
  onChange: (patch: { postazasiCim: string }) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>Postázási cím</Label>
      <Input
        placeholder="hová postázzuk a számlát"
        value={postazasiCim}
        onChange={(e) => onChange({ postazasiCim: e.target.value })}
      />
      {!postazasiCim.trim() && (
        <span className="text-xs font-medium text-destructive">
          ⚠️ ellenőrizd, hiányzik a postázási cím
        </span>
      )}
    </div>
  );
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
        <PoziciszamMezo
          pozicioszam={form.pozicioszam}
          nincs={form.pozicioszamNincs}
          onChange={onChange}
        />
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
              <Label>Kocsi</Label>
              <Select value={form.jarmu} onValueChange={(v) => v && onChange({ jarmu: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Válassz kocsit">
                    {form.jarmu && <JarmuJelolo value={form.jarmu} />}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SAJAT_JARMUVEK.map((j) => (
                    <SelectItem key={j.sofor} value={jarmuLabel(j)}>
                      <JarmuJelolo value={jarmuLabel(j)} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="flex flex-col gap-1.5 sm:col-span-3">
          <Label>Megjegyzés</Label>
          <Input
            value={form.megjegyzes}
            onChange={(e) => onChange({ megjegyzes: e.target.value })}
          />
        </div>
        <PostazasiCimMezo postazasiCim={form.postazasiCim} onChange={onChange} />
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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_repeat(4,minmax(0,1fr))]">
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
            <SelectValue placeholder="Válassz kocsit">
              {form.jarmu && <JarmuJelolo value={form.jarmu} />}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SAJAT_JARMUVEK.map((j) => (
              <SelectItem key={j.sofor} value={jarmuLabel(j)}>
                <JarmuJelolo value={jarmuLabel(j)} />
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
        pozicioszam: form.pozicioszam || undefined,
        pozicioszamNincs: form.pozicioszamNincs,
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

// Ugyanaz az átlagfogyasztás, mint a Kalkulátor fülön (toll-calculator.tsx) —
// itt is 30 l/100km-rel számolunk.
const KOLTSEG_ATLAG_FOGYASZTAS_L_PER_100KM = 30;

/**
 * A felrakó/lerakó cím alapján kiszámított útdíj+üzemanyag költség — a
 * Kalkulátor fülön már bevált géppel (calculateTollForAddresses +
 * getGazolajAr). Memóriabeli gyorsítótár (cím-pár -> költség) és
 * in-flight-dedup véd az ismételt/egyidejű táblázatsorok miatti felesleges
 * külső API-hívásoktól — csak a kliens élettartamáig érvényes, adatbázisba
 * sosem ír.
 */
const koltsegCache = new Map<string, number>();
const koltsegInFlight = new Map<string, Promise<number | null>>();

// A táblázat sok sora egyszerre mountol, és mindegyik saját geokódolás +
// útvonaltervezés hívást indítana — ez könnyen túlterhelheti/limitelheti a
// külső (ingyenes, hivatalos) útdíjkalkulátor API-t. Ezért legfeljebb ennyi
// számítás fut egyszerre; a többi sorban áll, amíg egy hely felszabadul.
const KOLTSEG_MAX_PARHUZAMOS = 4;
let koltsegFutoSzam = 0;
const koltsegVarosor: Array<() => void> = [];

function koltsegSorbaAllit<T>(feladat: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const futtat = () => {
      koltsegFutoSzam++;
      feladat()
        .then(resolve, reject)
        .finally(() => {
          koltsegFutoSzam--;
          const kovetkezo = koltsegVarosor.shift();
          if (kovetkezo) kovetkezo();
        });
    };
    if (koltsegFutoSzam < KOLTSEG_MAX_PARHUZAMOS) {
      futtat();
    } else {
      koltsegVarosor.push(futtat);
    }
  });
}

async function szamitottUtKoltseg(
  felrako: string | null | undefined,
  lerako: string | null | undefined
): Promise<number | null> {
  const from = felrako?.trim();
  const to = lerako?.trim();
  if (!from || !to) return null;
  const key = `${from} ${to}`;

  if (koltsegCache.has(key)) return koltsegCache.get(key) ?? null;
  const inFlight = koltsegInFlight.get(key);
  if (inFlight) return inFlight;

  const promise = koltsegSorbaAllit(async () => {
    try {
      const [result, gazolajAr] = await Promise.all([
        calculateTollForAddresses([from, to]),
        getGazolajAr(),
      ]);
      if (!result.ok) return null;
      const literek = (result.route.distanceKm * KOLTSEG_ATLAG_FOGYASZTAS_L_PER_100KM) / 100;
      const uzemanyagKoltseg = literek * gazolajAr.ar;
      const utdijKoltseg = result.route.tollHuf?.grossTotal ?? 0;
      const osszeg = Math.round(uzemanyagKoltseg + utdijKoltseg);
      koltsegCache.set(key, osszeg);
      return osszeg;
    } catch {
      return null;
    } finally {
      koltsegInFlight.delete(key);
    }
  });
  koltsegInFlight.set(key, promise);
  return promise;
}

/** A felrakó/lerakó városok alapján automatikusan számított útköltséget mutató cella. */
function KoltsegCell({
  felrako,
  lerako,
}: {
  felrako?: string | null;
  lerako?: string | null;
}) {
  const [koltseg, setKoltseg] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    let elveszett = false;
    setKoltseg(undefined);
    szamitottUtKoltseg(felrako, lerako).then((v) => {
      if (!elveszett) setKoltseg(v);
    });
    return () => {
      elveszett = true;
    };
  }, [felrako, lerako]);

  if (koltseg === undefined) {
    return <span className="text-muted-foreground">…</span>;
  }
  if (koltseg === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return <span className="tabular-nums">{koltseg.toLocaleString("hu-HU")} Ft</span>;
}

function FuvarList({
  tipus,
  refreshKey,
  titleOverride,
  showJarmu,
  partnerColumnLabel,
}: {
  tipus: FuvarTipus;
  refreshKey: number;
  titleOverride?: string;
  /** Melyik oszlopot mutassa a jármű-oszlopban — alapból tipus alapján dől el. */
  showJarmu?: boolean;
  partnerColumnLabel?: string;
}) {
  const jarmuOszlop = showJarmu ?? tipus === "sajat";
  const [rows, setRows] = useState<FuvarRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reszletek, setReszletek] = useState<FuvarRow | null>(null);

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
                <TableHead>{partnerColumnLabel ?? "Megrendelő"}</TableHead>
                <TableHead>{jarmuOszlop ? "Kocsi" : "Alvállalkozó"}</TableHead>
                <TableHead className="text-right" title="A fel- és lerakó városok alapján automatikusan számított útdíj+üzemanyag költség.">
                  Fuvardíj (számított)
                </TableHead>
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
                      <button
                        type="button"
                        title="Megbízás megnyitása"
                        className="hover:underline"
                        onClick={() => setReszletek(row)}
                      >
                        {row.date}
                      </button>
                    </TableCell>
                    <TableCell>
                      {row.felrako ? `${row.felrako} → ${row.lerako}` : row.lerako}
                    </TableCell>
                    <TableCell>{row.megrendelo ?? "—"}</TableCell>
                    <TableCell>
                      {jarmuOszlop ? (
                        row.jarmu ? (
                          <JarmuJelolo value={row.jarmu} />
                        ) : (
                          "—"
                        )
                      ) : (
                        row.alvallalkozo ?? "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <KoltsegCell felrako={row.felrako} lerako={row.lerako} />
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
      <FuvarDetailModal row={reszletek} onClose={() => setReszletek(null)} />
    </Card>
  );
}

/** Ismert telephely-kódok, amikhez a szövegben nincs irányítószám (pl. "Budapest (BILK)"). */
const ISMERT_IRSZ_KULCSSZO: Record<string, string> = {
  BILK: "1239",
};

/** Utcatípus-szavak — ezek jelenléte kizárja, hogy egy cím-darab városnév legyen. */
const UTCA_SZAVAK = /\b(utca|út|tér|krt\.?|körút|sor|dűlő|park|ipartelep|telep|fasor|köz|rakpart)\b/i;
const CEGFORMA_SZAVAK = /\b(kft\.?|zrt\.?|bt\.?|nyrt\.?|kkt\.?)\b/i;
// Csak eltávolításhoz (roviditettHelynev): a fenti záró \b a ponttal együtt
// nem illeszkedik szó vége után ("Kft." esetén csak a "Kft" részt törölné,
// és egy magányos pont maradna) — ez a változat a pontot is levágja.
const CEGFORMA_SZAVAK_STRIP = /\b(kft|zrt|bt|nyrt|kkt)\.?/gi;

/**
 * Egy felrakó/lerakó cím vesszővel tagolt részei közül megkeresi a
 * városnevet (és ha van, az irányítószámot) — akkor is, ha nincs
 * irányítószám a szövegben (pl. "Cégnév, Város, utca házszám" formátum,
 * ahol a "Város" rész önmagában áll, számok és utcatípus-szavak nélkül).
 * Sorrend: 1) irányítószám + városnév egy darabban, 2) ismert telephely-kód
 * (pl. "Budapest (BILK)"), 3) heurisztika — az első olyan darab, ami nem
 * szám, nem utcatípus-szó és nem cégforma-toldalék (3+ darabnál az elsőt,
 * jellemzően a cégnevet, kihagyva).
 */
function talalVaros(parts: string[]): { zip: string; city: string; idx: number } | null {
  for (let i = 0; i < parts.length; i++) {
    const m = parts[i].match(/(\d{4})\s+([^(]+)/);
    if (m) return { zip: m[1], city: m[2].trim(), idx: i };
  }

  for (let i = 0; i < parts.length; i++) {
    const kulcsszo = Object.keys(ISMERT_IRSZ_KULCSSZO).find((k) => parts[i].includes(k));
    if (kulcsszo) {
      return { zip: ISMERT_IRSZ_KULCSSZO[kulcsszo], city: parts[i].replace(/\(.*\)/, "").trim(), idx: i };
    }
  }

  const jeloltek = parts.length >= 3 ? parts.slice(1) : parts;
  for (const p of jeloltek) {
    if (!/\d/.test(p) && !UTCA_SZAVAK.test(p) && !CEGFORMA_SZAVAK.test(p)) {
      return { zip: "", city: p, idx: parts.indexOf(p) };
    }
  }

  return null;
}

/**
 * Egy felrakó/lerakó cím szövegének rövidített formája: "irányítószám város
 * partner" — az utca/házszám és a cégforma-toldalékok (Kft., Zrt., stb.),
 * valamint az "Magyarország" szó nélkül. Pl. "Unilever Magyarország Kft.,
 * 4300 Nyírbátor, Táncsics u. 2-4" -> "4300 Nyírbátor Unilever".
 */
function roviditettHelynev(value: string | null | undefined): string {
  if (!value) return "";
  const parts = value
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  const talalt = talalVaros(parts);
  const zip = talalt?.zip ?? "";
  const city = talalt?.city ?? "";
  const cityIdx = talalt?.idx ?? -1;

  let nev = parts.find((_, i) => i !== cityIdx) ?? "";
  nev = nev
    .replace(/\bMagyarország\b/gi, "")
    .replace(CEGFORMA_SZAVAK_STRIP, "")
    .replace(/\s+/g, " ")
    .trim();

  const hely = [zip, city].filter(Boolean).join(" ");
  return [hely, nev].filter(Boolean).join(" ").trim();
}

/** Egy felrakó/lerakó cím szövegéből csak a városnév (irányítószám és partner nélkül) — a Számla/Posta nézethez. */
function varosNev(value: string | null | undefined): string {
  if (!value) return "";
  const parts = value
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  return talalVaros(parts)?.city || value;
}

/**
 * A "Bér fuvarok" (tipus="sajat") lista — kizárólag a megbízás-specifikus 7
 * oszloppal: 1) Dátum = a megbízás beérkezési dátuma, 2) Megrendelő,
 * 3) Honnan → Hová a fel- és lerakás dátumával, 4) Fuvardíj,
 * 5) Fizetési határidő, 6) Kocsi, 7) Státusz. Ez szándékosan külön komponens
 * a generikus FuvarList-től, mert az oszlopkészlet itt jelentősen eltér.
 */
function BerFuvarLista({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<FuvarRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reszletek, setReszletek] = useState<FuvarRow | null>(null);

  const load = useCallback(async () => {
    const data = await getFuvarok("sajat");
    setRows(data);
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load, refreshKey]);

  async function handleDelete(id: string) {
    await deleteFuvar(id);
    await load();
    toast.success("Fuvar törölve.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Bér fuvarok</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dátum</TableHead>
                <TableHead>Megrendelő</TableHead>
                <TableHead>Hiv. szám</TableHead>
                <TableHead>Honnan → Hová</TableHead>
                <TableHead className="text-right">Fuvardíj</TableHead>
                <TableHead title="Fizetési határidő">FH</TableHead>
                <TableHead>Kocsi</TableHead>
                <TableHead
                  className="text-right"
                  title="A fel- és lerakó városok alapján automatikusan számított útdíj+üzemanyag költség."
                >
                  Költség
                </TableHead>
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    Még nincs rögzített bér fuvar.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="align-top text-muted-foreground">
                    <button
                      type="button"
                      title="Megbízás megnyitása"
                      className="hover:underline"
                      onClick={() => setReszletek(row)}
                    >
                      {row.erkezett_datum ?? row.date}
                    </button>
                  </TableCell>
                  <TableCell className="max-w-[120px] whitespace-normal break-words align-top leading-tight">
                    {row.megrendelo ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-[140px] whitespace-normal break-words align-top leading-tight">
                    <PoziciszamCell row={row} onSaved={load} />
                  </TableCell>
                  <TableCell className="max-w-[180px] whitespace-normal break-words align-top leading-tight">
                    <div className="flex flex-col gap-0.5">
                      <span>
                        {row.felrako ? roviditettHelynev(row.felrako) : "—"} {row.date}
                      </span>
                      <span>
                        → {roviditettHelynev(row.lerako)} {row.lerakas_datum ?? row.date}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="align-top text-right tabular-nums">
                    {row.fuvardij != null ? `${row.fuvardij.toLocaleString("hu-HU")} Ft` : "—"}
                  </TableCell>
                  <TableCell className="align-top">
                    {row.fizetesi_hatarido_nap != null ? `${row.fizetesi_hatarido_nap} nap` : "—"}
                  </TableCell>
                  <TableCell className="align-top">
                    {row.jarmu ? <JarmuJelolo value={row.jarmu} /> : "—"}
                  </TableCell>
                  <TableCell className="align-top text-right tabular-nums">
                    <KoltsegCell felrako={row.felrako} lerako={row.lerako} />
                  </TableCell>
                  <TableCell className="align-top">
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
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      <FuvarDetailModal row={reszletek} onClose={() => setReszletek(null)} />
    </Card>
  );
}

/**
 * Számla/Posta fül: a Bér fuvarok listája számlázási/postázási fókusszal —
 * ugyanaz az adat, mint a "Bér fuvarok" fülön (az ott is megmarad), de itt a
 * Honnan → Hová csak a városnevet mutatja (a teljes cím helyett), nincs
 * Státusz oszlop, és van egy új, inline szerkeszthető "Postázási cím" mező
 * (hová kell postázni a kiállított számlát ennél a megbízásnál).
 */
function SzamlaPostaLista({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<FuvarRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reszletek, setReszletek] = useState<FuvarRow | null>(null);

  const load = useCallback(async () => {
    const data = await getFuvarok("sajat");
    setRows(data);
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load, refreshKey]);

  async function handleDelete(id: string) {
    await deleteFuvar(id);
    await load();
    toast.success("Fuvar törölve.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Bér fuvarok — Számla/Posta</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dátum</TableHead>
                <TableHead>Megrendelő</TableHead>
                <TableHead>Hiv. szám</TableHead>
                <TableHead>Honnan → Hová</TableHead>
                <TableHead className="text-right">Fuvardíj</TableHead>
                <TableHead title="Fizetési határidő">FH</TableHead>
                <TableHead>Kocsi</TableHead>
                <TableHead>Postázási cím</TableHead>
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    Még nincs rögzített bér fuvar.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="align-top text-muted-foreground">
                    <button
                      type="button"
                      title="Megbízás megnyitása"
                      className="hover:underline"
                      onClick={() => setReszletek(row)}
                    >
                      {row.erkezett_datum ?? row.date}
                    </button>
                  </TableCell>
                  <TableCell className="max-w-[120px] whitespace-normal break-words align-top leading-tight">
                    {row.megrendelo ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-[140px] whitespace-normal break-words align-top leading-tight">
                    <PoziciszamCell row={row} onSaved={load} />
                  </TableCell>
                  <TableCell className="align-top">
                    {row.felrako ? `${varosNev(row.felrako)} → ${varosNev(row.lerako)}` : varosNev(row.lerako)}
                  </TableCell>
                  <TableCell className="align-top text-right tabular-nums">
                    {row.fuvardij != null ? `${row.fuvardij.toLocaleString("hu-HU")} Ft` : "—"}
                  </TableCell>
                  <TableCell className="align-top">
                    {row.fizetesi_hatarido_nap != null ? `${row.fizetesi_hatarido_nap} nap` : "—"}
                  </TableCell>
                  <TableCell className="align-top">
                    {row.jarmu ? <JarmuJelolo value={row.jarmu} /> : "—"}
                  </TableCell>
                  <TableCell className="align-top">
                    <SzovegCell
                      value={row.postazasi_cim}
                      placeholder="postázási cím megadása"
                      onSave={async (v) => {
                        await setFuvarPostazasiCim(row.id, v);
                        await load();
                      }}
                    />
                  </TableCell>
                  <TableCell className="align-top">
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
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      <FuvarDetailModal row={reszletek} onClose={() => setReszletek(null)} />
    </Card>
  );
}

function FuvarTypeView({
  tipus,
  minimal,
  formTitle,
  listTitle,
  showJarmu,
  partnerColumnLabel,
  noForm,
  noFormNote,
}: {
  tipus: FuvarTipus;
  minimal?: boolean;
  formTitle?: string;
  listTitle?: string;
  showJarmu?: boolean;
  partnerColumnLabel?: string;
  /** Ha true, nincs kézi rögzítő űrlap — csak lista + egy magyarázó kártya. */
  noForm?: boolean;
  noFormNote?: string;
}) {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="flex flex-col gap-4">
      {noForm ? (
        <Card className="bg-muted/40">
          <CardContent className="py-4 text-sm text-muted-foreground">{noFormNote}</CardContent>
        </Card>
      ) : (
        <FuvarForm
          tipus={tipus}
          onSaved={() => setRefreshKey((k) => k + 1)}
          minimal={minimal}
          titleOverride={formTitle}
        />
      )}
      <FuvarList
        tipus={tipus}
        refreshKey={refreshKey}
        partnerColumnLabel={partnerColumnLabel}
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

  // Ha a megrendelőnél már ismert postázási cím (korábbi jóváhagyott
  // megbízásból), automatikusan felajánljuk — de csak ha a mező még üres,
  // hogy egy a dokumentumból már kiolvasott/kézzel beírt értéket ne írjon
  // felül.
  useEffect(() => {
    const megrendelo = form.megrendelo;
    if (!megrendelo.trim()) return;
    let elveszett = false;
    getPostazasiCimJavaslat(megrendelo).then((javaslat) => {
      if (!elveszett && javaslat) {
        setForm((f) =>
          f.megrendelo === megrendelo && !f.postazasiCim.trim()
            ? { ...f, postazasiCim: javaslat }
            : f
        );
      }
    });
    return () => {
      elveszett = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.megrendelo]);

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
        pozicioszam: form.pozicioszam || undefined,
        pozicioszamNincs: form.pozicioszamNincs,
        postazasiCim: form.postazasiCim || undefined,
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

const MEGBIZASOK_TABS = ["sajat", "ber", "kapcsolatok", "szamla-posta", "archiv"] as const;
type MegbizasokTab = (typeof MEGBIZASOK_TABS)[number];

function isMegbizasokTab(v: string | null): v is MegbizasokTab {
  return !!v && (MEGBIZASOK_TABS as readonly string[]).includes(v);
}

// A kiválasztott alfület is a URL-ben (?mtab=...) tartjuk (a "tab" paramot a
// szülő /fuvarozas oldal Megbízások/Kalkulátor/GPS füle már használja), hogy
// böngésző-frissítéskor (F5) ez a fül se ugorjon vissza az alapértelmezettre.
export function Megbizasok() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("mtab");
  const [tab, setTab] = useState<MegbizasokTab>(isMegbizasokTab(urlTab) ? urlTab : "sajat");

  function handleTabChange(v: string) {
    if (!isMegbizasokTab(v)) return;
    setTab(v);
    const params = new URLSearchParams(searchParams.toString());
    params.set("mtab", v);
    router.replace(`/fuvarozas?${params.toString()}`, { scroll: false });
  }

  return (
    <Tabs value={tab} onValueChange={handleTabChange}>
      <TabsList>
        <TabsTrigger value="sajat">Bér fuvarok</TabsTrigger>
        <TabsTrigger value="ber">Saját fuvarok</TabsTrigger>
        <TabsTrigger value="kapcsolatok">Kapcsolatok</TabsTrigger>
        <TabsTrigger value="szamla-posta">Számla/Posta</TabsTrigger>
        <TabsTrigger value="archiv">Archív</TabsTrigger>
      </TabsList>
      <TabsContent value="sajat" className="mt-4">
        <div className="flex flex-col gap-4">
          <Card className="bg-muted/40">
            <CardContent className="py-4 text-sm text-muted-foreground">
              A bér fuvarok mindig megbízásból (a Drive „Fuvarmegbizások” mappájában érkező
              dokumentumból) indulnak — nincs kézi rögzítés.
            </CardContent>
          </Card>
          <BerFuvarLista refreshKey={0} />
        </div>
      </TabsContent>
      <TabsContent value="ber" className="mt-4">
        <FuvarTypeView
          tipus="ber"
          minimal
          formTitle="Új saját fuvar"
          listTitle="Saját fuvarok"
          showJarmu
          partnerColumnLabel="Partner"
        />
      </TabsContent>
      <TabsContent value="kapcsolatok" className="mt-4">
        <Kapcsolatok />
      </TabsContent>
      <TabsContent value="szamla-posta" className="mt-4">
        <SzamlaPostaLista refreshKey={0} />
      </TabsContent>
      <TabsContent value="archiv" className="mt-4">
        <Card className="bg-muted/40">
          <CardContent className="py-4 text-sm text-muted-foreground">
            Archív — hamarosan.
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
