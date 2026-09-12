"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
import { AlertTriangle, Check, ChevronDown, Pencil, X } from "lucide-react";
import {
  addFuvar,
  approveFuvar,
  deleteFuvar,
  getAktivFuvarokUtkozeshez,
  getArchivFuvarok,
  getElokeszitettFuvarok,
  getFolyamatbanSajatFuvarok,
  getFolyamatbanValodiSajatFuvarok,
  getKimutatasJarmuFuvarok,
  getPostazasiCimJavaslat,
  getSzamlaPostaFuvarok,
  setFuvarPoziciszam,
  setFuvarFizetesiHatarido,
  setFuvarFuvardij,
  setFuvarPostazasiCim,
  setFuvarPostazva,
  setFuvarSzamlaSzam,
  setFuvarTeljesitve,
  szinkronizalSzamlaSzamokat,
  updateFuvarStatus,
} from "@/lib/fuvarozas/megbizasok";
import { calculateTollForAddresses, getGazolajAr } from "@/lib/fuvarozas/actions";
import {
  FUVAR_STATUSZ_LABEL,
  type FuvardijPenznem,
  type FuvarRow,
  type FuvarTipus,
  type KimutatasJarmuSor,
  type UtkozesJelolt,
} from "@/lib/fuvarozas/fuvar-constants";
import { getCurrentUser } from "@/lib/current-user";
import { talalVaros, varosNev } from "@/lib/fuvarozas/varos";
import { Kapcsolatok } from "@/components/fuvarozas/kapcsolatok";
import {
  SAJAT_JARMUVEK,
  JARMU_SZIN_DOT_CLASS,
  jarmuLabel,
  resolveJarmu,
  type SajatJarmu,
} from "@/lib/fuvarozas/vehicles";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const SAJAT_TELEP_PARTNER = "Telephelyek közti szállítás";
/** A saját fuvaroknak (tipus='ber') nincs mindig valódi külső megrendelőjük — az Archív és a Kimutatás fülön ez alatt a "cég" alatt jelennek meg. */
const SAJAT_CEG_NEV = "Well-worn Pallet";

function eredmeny(row: FuvarRow): number | null {
  if (row.fuvardij == null || row.koltseg == null) return null;
  // A "koltseg" mező mindig Ft — EUR-os fuvardíjnál a kettő nem vonható ki
  // egymásból (a rendszer nem vált át HUF-ra), ezért ilyenkor nincs Eredmény.
  if (row.fuvardij_penznem !== "Ft") return null;
  return row.fuvardij - row.koltseg;
}

/** A fuvardíj (vagy bármilyen összeg) megjelenítése a mező pénznemével — Ft vagy EUR. */
function formatOsszeg(osszeg: number, penznem: FuvardijPenznem): string {
  return penznem === "EUR" ? `${osszeg.toLocaleString("hu-HU")} €` : `${osszeg.toLocaleString("hu-HU")} Ft`;
}

/**
 * Jármű-ütközések (kettős beosztás) keresése: két fuvar ütközik, ha
 * ugyanahhoz a járműhöz van rendelve (resolveJarmu-val egyeztetve, mert a
 * "jarmu" mező szabad szöveg), és a [datum, lerakas_datum] dátumtartományuk
 * átfedi egymást — egy kocsi fizikailag nem lehet egyszerre két helyen. A
 * visszaadott Map minden ütköző fuvar id-jéhez a VELE ütköző többi fuvart
 * rendeli, hogy a figyelmeztetés meg tudja mondani, mivel ütközik.
 */
function talalJarmuUtkozeseket(sorok: UtkozesJelolt[]): Map<string, UtkozesJelolt[]> {
  const csoportok = new Map<string, UtkozesJelolt[]>();
  for (const s of sorok) {
    const jarmu = s.jarmu ? resolveJarmu(s.jarmu) : null;
    if (!jarmu) continue;
    const lista = csoportok.get(jarmu.sofor) ?? [];
    lista.push(s);
    csoportok.set(jarmu.sofor, lista);
  }
  const utkozesek = new Map<string, UtkozesJelolt[]>();
  for (const lista of csoportok.values()) {
    for (let i = 0; i < lista.length; i++) {
      for (let j = i + 1; j < lista.length; j++) {
        const a = lista[i];
        const b = lista[j];
        const aVeg = a.lerakas_datum ?? a.datum;
        const bVeg = b.lerakas_datum ?? b.datum;
        if (a.datum <= bVeg && b.datum <= aVeg) {
          utkozesek.set(a.id, [...(utkozesek.get(a.id) ?? []), b]);
          utkozesek.set(b.id, [...(utkozesek.get(b.id) ?? []), a]);
        }
      }
    }
  }
  return utkozesek;
}

/** Figyelmeztető ikon, ha egy fuvar más(ok)ra átfedő időszakban ugyanarra a járműre van beosztva — a tooltip felsorolja, mivel ütközik. */
function JarmuUtkozesJel({ masokkal }: { masokkal: UtkozesJelolt[] }) {
  const reszletek = masokkal
    .map((m) => {
      const datumSzoveg = m.lerakas_datum && m.lerakas_datum !== m.datum ? `${m.datum} – ${m.lerakas_datum}` : m.datum;
      return `${m.megrendelo ?? "—"}: ${varosNev(m.felrako)} → ${varosNev(m.lerako)} (${datumSzoveg})`;
    })
    .join("\n");
  return (
    <span
      title={`Ütközés — ugyanez a jármű egy másik, átfedő időszakú fuvarra is be van osztva:\n${reszletek}`}
      className="inline-flex shrink-0 items-center text-destructive"
    >
      <AlertTriangle className="h-3.5 w-3.5" />
    </span>
  );
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

/**
 * Egy sor a lista táblázatban inline szerkeszthető, szám típusú mezője
 * (pl. fuvardíj, fizetési határidő) — ugyanaz a minta, mint a SzovegCell-nél,
 * csak numerikus inputtal és a hívó által megadott megjelenítési formátummal
 * (pl. "X Ft", "X nap"). Arra kell, hogy ha a Drive-automatika egy a
 * megbízás dokumentumában ténylegesen szereplő adatot (fuvardíj, fizetési
 * határidő) mégsem ismert fel, az ellenőrzést végző kolléga a dokumentum
 * alapján közvetlenül a listában pótolhassa.
 */
function SzamCell({
  value,
  onSave,
  format,
  placeholder,
}: {
  value: number | null;
  onSave: (value: number | null) => Promise<void>;
  format: (n: number) => string;
  placeholder: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value != null ? String(value) : "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setText(value != null ? String(value) : "");
  }, [value]);

  async function persist() {
    const szam = text.trim() ? Number(text) : null;
    if (szam != null && !Number.isFinite(szam)) {
      toast.error("Érvénytelen szám.");
      return;
    }
    setSaving(true);
    try {
      await onSave(szam);
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
          type="number"
          className="h-7 w-[100px] text-xs"
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
      className={`text-left hover:underline ${value != null ? "" : "text-muted-foreground"}`}
      onClick={() => setEditing(true)}
    >
      {value != null ? format(value) : placeholder}
    </button>
  );
}

/**
 * A Fuvardíj mező összetett inline szerkesztő cellája: az összeg (SzamCell)
 * mellett egy kattintható Ft/EUR pénznem-jelölő — mert a legtöbb megbízás
 * Ft-ban van, de van EUR-os is (pl. Duvenbeck), és ezt eddig sehol nem
 * lehetett kézzel jelölni/javítani, csak Ft-ként (vagy sehogy) tárolni.
 */
function FuvardijCell({
  fuvardij,
  penznem,
  onSave,
}: {
  fuvardij: number | null;
  penznem: FuvardijPenznem;
  onSave: (fuvardij: number | null, penznem: FuvardijPenznem) => Promise<void>;
}) {
  const [penznemSaving, setPenznemSaving] = useState(false);

  async function togglePenznem() {
    const uj: FuvardijPenznem = penznem === "Ft" ? "EUR" : "Ft";
    setPenznemSaving(true);
    try {
      await onSave(fuvardij, uj);
    } catch {
      toast.error("Nem sikerült menteni.");
    } finally {
      setPenznemSaving(false);
    }
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <SzamCell
        value={fuvardij}
        placeholder="fuvardíj megadása"
        format={(n) => formatOsszeg(n, penznem)}
        onSave={(v) => onSave(v, penznem)}
      />
      <button
        type="button"
        title="Pénznem váltása (Ft / EUR)"
        disabled={penznemSaving}
        onClick={togglePenznem}
        className="rounded px-1 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        {penznem}
      </button>
    </div>
  );
}

/**
 * A Számla/Posta nézet "Postázva" jelölője: azonnal (optimista frissítéssel)
 * pipálható, hogy a fuvar dokumentációja (számla + megbízás) ténylegesen
 * postára lett-e adva a megrendelőnek.
 */
function PostazvaCella({
  id,
  postazva,
  onToggle,
}: {
  id: string;
  postazva: boolean;
  onToggle: (id: string, value: boolean) => void | Promise<void>;
}) {
  const [checked, setChecked] = useState(postazva);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setChecked(postazva);
  }, [postazva]);

  async function handleChange(value: boolean) {
    setChecked(value);
    setSaving(true);
    try {
      await onToggle(id, value);
    } catch {
      setChecked(!value);
      toast.error("Nem sikerült menteni.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Checkbox
      checked={checked}
      disabled={saving}
      onCheckedChange={(v) => handleChange(v === true)}
    />
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
                {row.felrako
                  ? `${varosNev(row.felrako)} → ${varosNev(row.lerako)}`
                  : varosNev(row.lerako)}
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
                {row.fuvardij != null ? formatOsszeg(row.fuvardij, row.fuvardij_penznem) : null}
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
              <ReszletSor label="Számla sorszáma">{row.szamla_szam}</ReszletSor>
              <ReszletSor label="Postázási cím">{row.postazasi_cim}</ReszletSor>
              <ReszletSor label="Postázva">{row.postazva ? "Igen" : null}</ReszletSor>
              <ReszletSor label="Teljesítve">
                {row.teljesitve ? "Igen (kézzel, a tervezett dátum előtt)" : null}
              </ReszletSor>
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
  /** Üres, ha a lerakás a felrakással azonos napra esik — csak akkor kell kitölteni, ha eltér. */
  lerakasDatum: string;
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
  fuvardijPenznem: FuvardijPenznem;
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
    lerakasDatum: "",
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
    fuvardijPenznem: "Ft",
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
    datum: row.datum_iso,
    lerakasDatum: row.lerakas_datum_iso ?? "",
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
    fuvardijPenznem: row.fuvardij_penznem,
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
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
        <div className="flex flex-col gap-1.5">
          <Label title="Csak akkor add meg, ha a lerakás más napra esik, mint a felrakás (pl. éjszakázás egy saját telephelyen).">
            Lerakás dátuma (ha eltér)
          </Label>
          <Input
            type="date"
            value={form.lerakasDatum}
            onChange={(e) => onChange({ lerakasDatum: e.target.value })}
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
          <Label>Fuvardíj</Label>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              value={form.fuvardij}
              onChange={(e) => onChange({ fuvardij: e.target.value })}
            />
            <button
              type="button"
              title="Pénznem váltása (Ft / EUR)"
              onClick={() => onChange({ fuvardijPenznem: form.fuvardijPenznem === "Ft" ? "EUR" : "Ft" })}
              className="shrink-0 rounded px-2 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {form.fuvardijPenznem}
            </button>
          </div>
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
        fuvardijPenznem: minimal ? undefined : form.fuvardijPenznem,
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

/**
 * Ha a teljes, szabad szöveges cím (pl. "HU-DC WABERERS, Budapest (BILK),
 * Európa u. 6. 'H' Épület" — cégnévvel/raktárkóddal kezdve, irányítószám
 * nélkül) nem geokódolható, próbáljuk meg csak az "irányítószám + város"
 * részét (pl. "1239 Budapest") — ugyanazzal a heurisztikával, amivel a
 * táblázat is kinyeri a városnevet (talalVaros, lásd lib/fuvarozas/varos.ts). Ez csak
 * városközépponti pontosságot ad, de a teljes cím hiányában ez a legjobb
 * elérhető közelítés.
 */
function zipVarosFallback(value: string | null | undefined): string | null {
  if (!value) return null;
  const parts = value
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const talalt = talalVaros(parts);
  if (!talalt?.city) return null;
  const fallback = [talalt.zip, talalt.city].filter(Boolean).join(" ");
  return fallback || null;
}

async function szamitottUtKoltseg(
  felrako: string | null | undefined,
  lerako: string | null | undefined
): Promise<number | null> {
  const from = felrako?.trim();
  const to = lerako?.trim();
  if (!from || !to) return null;
  // A "->" elválasztó (nem sima szóköz) kell, különben pl. "Nyíregyháza Ipari
  // Park" -> "Debrecen" és "Nyíregyháza" -> "Ipari Park Debrecen" ugyanarra
  // a kulcsra futna, és tévesen megosztanák a gyorsítótárazott költséget.
  const key = `${from}->${to}`;

  if (koltsegCache.has(key)) return koltsegCache.get(key) ?? null;
  const inFlight = koltsegInFlight.get(key);
  if (inFlight) return inFlight;

  const promise = koltsegSorbaAllit(async () => {
    try {
      let result = await calculateTollForAddresses([from, to]);
      if (!result.ok) {
        // A teljes cím (gyakran cégnévvel/raktárkóddal, irányítószám nélkül)
        // nem geokódolható — próbáljuk meg csak a városával.
        const fromFallback = zipVarosFallback(from);
        const toFallback = zipVarosFallback(to);
        if ((fromFallback && fromFallback !== from) || (toFallback && toFallback !== to)) {
          result = await calculateTollForAddresses([fromFallback ?? from, toFallback ?? to]);
        }
      }
      if (!result.ok) return null;
      const gazolajAr = await getGazolajAr();
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

/** A Saját fuvarok fül szerkesztő ablaka — a felvitelnél is használt mezőkkel (dátum, partner, felrakó, lerakó, kocsi). */
function SajatFuvarSzerkesztoDialog({
  row,
  onClose,
  onSaved,
}: {
  row: FuvarRow | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  return (
    <Dialog open={row != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {row && <SajatFuvarSzerkesztoForm key={row.id} row={row} onClose={onClose} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}

function SajatFuvarSzerkesztoForm({
  row,
  onClose,
  onSaved,
}: {
  row: FuvarRow;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(formFromRow(row));
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
      await approveFuvar({
        id: row.id,
        tipus: "ber",
        datum: form.datum,
        felrako: form.felrako,
        lerako: form.lerako,
        megrendelo: form.megrendelo || undefined,
        jarmu: form.jarmu || undefined,
        // A minimál űrlap ezeket nem szerkeszti — a meglévő értékkel visszük tovább, hogy a mentés ne írja felül üresre.
        idopont: row.idopont ?? undefined,
        aru: row.aru ?? undefined,
        mennyiseg: row.mennyiseg ?? undefined,
        suly: row.suly ?? undefined,
        sofor: row.sofor ?? undefined,
        alvallalkozo: row.alvallalkozo ?? undefined,
        fuvardij: row.fuvardij ?? undefined,
        fuvardijPenznem: row.fuvardij_penznem,
        koltseg: row.koltseg ?? undefined,
        megjegyzes: row.megjegyzes ?? undefined,
        pozicioszam: row.pozicioszam ?? undefined,
        pozicioszamNincs: row.pozicioszam_nincs,
        postazasiCim: row.postazasi_cim ?? undefined,
        lerakasDatum: row.lerakas_datum_iso ?? undefined,
      });
      await onSaved();
      onClose();
      toast.success("Fuvar módosítva.");
    } catch {
      toast.error("Nem sikerült menteni.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Saját fuvar szerkesztése</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <MinimalFuvarFields form={form} onChange={patch} />
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Mentés…" : "Mentés"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Mégse
          </Button>
        </div>
      </form>
    </>
  );
}

/**
 * "Saját fuvarok" fül (tipus='ber') aktív listája — csak a folyamatban
 * lévők (lásd getFolyamatbanValodiSajatFuvarok); a teljesítettek (kézzel
 * "Kész"-re jelölve, vagy a dátumuk elmúlt) innen eltűnnek és az Archívba
 * kerülnek. A sorok szerkeszthetők (ceruza ikon — lásd
 * SajatFuvarSzerkesztoDialog).
 */
function ValodiSajatFuvarLista({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<FuvarRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reszletek, setReszletek] = useState<FuvarRow | null>(null);
  const [szerkesztett, setSzerkesztett] = useState<FuvarRow | null>(null);
  const [utkozesek, setUtkozesek] = useState<Map<string, UtkozesJelolt[]>>(new Map());

  const load = useCallback(async () => {
    const [data, utkozesSorok] = await Promise.all([
      getFolyamatbanValodiSajatFuvarok(),
      getAktivFuvarokUtkozeshez().catch(() => [] as UtkozesJelolt[]),
    ]);
    setRows(data);
    setUtkozesek(talalJarmuUtkozeseket(utkozesSorok));
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

  async function handleTeljesitve(id: string) {
    await setFuvarTeljesitve(id, true);
    await load();
    toast.success("Fuvar teljesítve — átkerült az Archívba.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Saját fuvarok — folyamatban</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dátum</TableHead>
                <TableHead>Partner</TableHead>
                <TableHead>Honnan → Hová</TableHead>
                <TableHead>Kocsi</TableHead>
                <TableHead
                  className="text-right"
                  title="A fel- és lerakó városok alapján automatikusan számított útdíj+üzemanyag költség."
                >
                  Költség (számított)
                </TableHead>
                <TableHead
                  className="w-16 text-center"
                  title="Ha a fuvar ténylegesen befejeződött, itt azonnal átrakható az Archívba."
                >
                  Kész
                </TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Nincs jelenleg folyamatban lévő saját fuvar.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
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
                  <TableCell>{row.megrendelo ?? "—"}</TableCell>
                  <TableCell>
                    {row.felrako
                      ? `${varosNev(row.felrako)} → ${varosNev(row.lerako)}`
                      : varosNev(row.lerako)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {row.jarmu ? <JarmuJelolo value={row.jarmu} /> : "—"}
                      {utkozesek.has(row.id) && <JarmuUtkozesJel masokkal={utkozesek.get(row.id)!} />}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <KoltsegCell felrako={row.felrako} lerako={row.lerako} />
                  </TableCell>
                  <TableCell className="text-center">
                    <button
                      type="button"
                      onClick={() => handleTeljesitve(row.id)}
                      title="Teljesítve — áthelyezés az Archívba"
                      className="rounded p-1 text-muted-foreground hover:bg-success/15 hover:text-success"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSzerkesztett(row)}
                        title="Szerkesztés"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(row.id)}
                        title="Törlés"
                        className="text-destructive/70 hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      <FuvarDetailModal row={reszletek} onClose={() => setReszletek(null)} />
      <SajatFuvarSzerkesztoDialog row={szerkesztett} onClose={() => setSzerkesztett(null)} onSaved={load} />
    </Card>
  );
}

/** A Bér fuvarok fül szerkesztő ablaka — a jóváhagyáskor is használt teljes mezőkészlettel (FuvarFields), a "Lerakás dátuma" mezővel együtt — ez teszi lehetővé egy tévesen rögzített dátum utólagos javítását. */
function BerFuvarSzerkesztoDialog({
  row,
  onClose,
  onSaved,
}: {
  row: FuvarRow | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  return (
    <Dialog open={row != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        {row && <BerFuvarSzerkesztoForm key={row.id} row={row} onClose={onClose} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}

function BerFuvarSzerkesztoForm({
  row,
  onClose,
  onSaved,
}: {
  row: FuvarRow;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(formFromRow(row));
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
      await approveFuvar({
        id: row.id,
        tipus: "sajat",
        datum: form.datum,
        lerakasDatum: form.lerakasDatum || undefined,
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
        fuvardijPenznem: form.fuvardijPenznem,
        koltseg: form.koltseg ? Number(form.koltseg) : undefined,
        megjegyzes: form.megjegyzes || undefined,
        pozicioszam: form.pozicioszam || undefined,
        pozicioszamNincs: form.pozicioszamNincs,
        postazasiCim: form.postazasiCim || undefined,
      });
      await onSaved();
      onClose();
      toast.success("Fuvar módosítva.");
    } catch {
      toast.error("Nem sikerült menteni.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Bér fuvar szerkesztése</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <FuvarFields form={form} onChange={patch} />
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Mentés…" : "Mentés"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Mégse
          </Button>
        </div>
      </form>
    </>
  );
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
  const [szerkesztett, setSzerkesztett] = useState<FuvarRow | null>(null);
  const [utkozesek, setUtkozesek] = useState<Map<string, UtkozesJelolt[]>>(new Map());

  const load = useCallback(async () => {
    const [data, utkozesSorok] = await Promise.all([
      getFolyamatbanSajatFuvarok(),
      getAktivFuvarokUtkozeshez().catch(() => [] as UtkozesJelolt[]),
    ]);
    setRows(data);
    setUtkozesek(talalJarmuUtkozeseket(utkozesSorok));
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

  async function handleTeljesitve(id: string) {
    await setFuvarTeljesitve(id, true);
    await load();
    toast.success("Fuvar teljesítve — átkerült a Számla/Posta fülre.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Bér fuvarok — folyamatban</CardTitle>
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
                <TableHead
                  className="w-16 text-center"
                  title="Ha a fuvar a rögzített (tervezett) dátum előtt már ténylegesen befejeződött, itt azonnal átrakható a Számla/Posta fülre."
                >
                  Kész
                </TableHead>
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground">
                    Nincs jelenleg folyamatban lévő bér fuvar. (A lerakás dátuma után a fuvar a
                    Számla/Posta fülön folytatódik.)
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
                        {row.felrako ? varosNev(row.felrako) : "—"} {row.date}
                      </span>
                      <span>
                        → {varosNev(row.lerako)} {row.lerakas_datum ?? row.date}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="align-top text-right tabular-nums">
                    <FuvardijCell
                      fuvardij={row.fuvardij}
                      penznem={row.fuvardij_penznem}
                      onSave={async (v, p) => {
                        await setFuvarFuvardij(row.id, v, p);
                        await load();
                      }}
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <SzamCell
                      value={row.fizetesi_hatarido_nap}
                      placeholder="nap"
                      format={(n) => `${n} nap`}
                      onSave={async (v) => {
                        await setFuvarFizetesiHatarido(row.id, v);
                        await load();
                      }}
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex items-center gap-1">
                      {row.jarmu ? <JarmuJelolo value={row.jarmu} /> : "—"}
                      {utkozesek.has(row.id) && <JarmuUtkozesJel masokkal={utkozesek.get(row.id)!} />}
                    </div>
                  </TableCell>
                  <TableCell className="align-top text-right tabular-nums">
                    <KoltsegCell felrako={row.felrako} lerako={row.lerako} />
                  </TableCell>
                  <TableCell className="align-top text-center">
                    <button
                      type="button"
                      onClick={() => handleTeljesitve(row.id)}
                      title="Teljesítve — áthelyezés a Számla/Posta fülre"
                      className="rounded p-1 text-muted-foreground hover:bg-success/15 hover:text-success"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSzerkesztett(row)}
                        title="Szerkesztés"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(row.id)}
                        title="Törlés"
                        className="text-destructive/70 hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      <FuvarDetailModal row={reszletek} onClose={() => setReszletek(null)} />
      <BerFuvarSzerkesztoDialog row={szerkesztett} onClose={() => setSzerkesztett(null)} onSaved={load} />
    </Card>
  );
}

/**
 * Számla/Posta fül: a Bér fuvarok listája számlázási/postázási fókusszal —
 * ugyanaz az adat, mint a "Bér fuvarok" fülön (az ott is megmarad), de itt a
 * Honnan → Hová csak a városnevet mutatja (a teljes cím helyett), nincs
 * Státusz oszlop, és van egy inline szerkeszthető "Postázási cím" mező
 * (hová kell postázni a kiállított számlát ennél a megbízásnál), valamint
 * egy "Postázva" jelölő (pipálható, ha a fuvar dokumentációja ténylegesen
 * postára lett adva).
 */
function SzamlaPostaLista({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<FuvarRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reszletek, setReszletek] = useState<FuvarRow | null>(null);
  // "Postázva"-ra kattintva a sor 5 percig még itt marad (sötétzölden,
  // visszavonható), utána automatikusan (időalapon) eltűnik innen és
  // átkerül az Archív fülre — ehhez ütemezünk egy késleltetett újratöltést.
  const archivalasIdozitokRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const load = useCallback(async () => {
    // A Számlázz.hu-ból behúzott fuvarszámlák alapján automatikusan
    // kitöltjük a "Számla szám" mezőt, mielőtt betöltjük a listát — így ha
    // időközben új számla érkezett, azonnal látszik, nem kell a legfeljebb
    // 15 perces automata körre várni.
    try {
      await szinkronizalSzamlaSzamokat();
    } catch {
      // Csendben hagyjuk — a listát ettől még be kell tölteni, a
      // párosítás legközelebb (pl. a következő automata körben) újra megpróbálódik.
    }
    const data = await getSzamlaPostaFuvarok();
    setRows(data);
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load, refreshKey]);

  useEffect(() => {
    const idozitok = archivalasIdozitokRef.current;
    return () => {
      idozitok.forEach((t) => clearTimeout(t));
    };
  }, []);

  async function handleDelete(id: string) {
    await deleteFuvar(id);
    await load();
    toast.success("Fuvar törölve.");
  }

  async function handlePostazva(id: string, ertek: boolean) {
    await setFuvarPostazva(id, ertek);
    await load();

    const korabbi = archivalasIdozitokRef.current.get(id);
    if (korabbi) {
      clearTimeout(korabbi);
      archivalasIdozitokRef.current.delete(id);
    }
    if (ertek) {
      archivalasIdozitokRef.current.set(
        id,
        setTimeout(() => {
          archivalasIdozitokRef.current.delete(id);
          load();
        }, 5 * 60 * 1000 + 2000)
      );
    }
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
                <TableHead>Számla szám</TableHead>
                <TableHead>Postázási cím</TableHead>
                <TableHead
                  className="text-center"
                  title="A fuvar dokumentációja (számla + megbízás) postára lett adva a megrendelőnek."
                >
                  Postázva
                </TableHead>
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-muted-foreground">
                    Még nincs rögzített bér fuvar.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={
                    row.postazva
                      ? "bg-success/25 hover:bg-success/30"
                      : row.szamla_szam
                        ? "bg-success/10 hover:bg-success/15"
                        : ""
                  }
                >
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
                    <FuvardijCell
                      fuvardij={row.fuvardij}
                      penznem={row.fuvardij_penznem}
                      onSave={async (v, p) => {
                        await setFuvarFuvardij(row.id, v, p);
                        await load();
                      }}
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <SzamCell
                      value={row.fizetesi_hatarido_nap}
                      placeholder="nap"
                      format={(n) => `${n} nap`}
                      onSave={async (v) => {
                        await setFuvarFizetesiHatarido(row.id, v);
                        await load();
                      }}
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    {row.jarmu ? <JarmuJelolo value={row.jarmu} /> : "—"}
                  </TableCell>
                  <TableCell className="align-top">
                    <SzovegCell
                      value={row.szamla_szam}
                      placeholder="számlaszám megadása"
                      onSave={async (v) => {
                        await setFuvarSzamlaSzam(row.id, v);
                        await load();
                      }}
                    />
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
                  <TableCell className="align-top text-center">
                    <PostazvaCella id={row.id} postazva={row.postazva} onToggle={handlePostazva} />
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

/** A "Saját fuvarok" fül (tipus='ber'): kézi rögzítő űrlap + az aktív (folyamatban lévő) lista. */
function SajatFuvarokTab() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="flex flex-col gap-4">
      <FuvarForm
        tipus="ber"
        onSaved={() => setRefreshKey((k) => k + 1)}
        minimal
        titleOverride="Új saját fuvar"
      />
      <ValodiSajatFuvarLista refreshKey={refreshKey} />
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
        lerakasDatum: form.lerakasDatum || undefined,
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
        fuvardijPenznem: form.fuvardijPenznem,
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

/**
 * Archív fül: a postázott és az 5 perces visszavonási ablakon már túljutott
 * bér fuvarok, csak megtekintésre — egy "Visszaállítás" gombbal, ha mégis
 * vissza kellene kerülnie a Számla/Posta listába (pl. tévedésből lett
 * bepipálva "Postázva").
 */
/** Egy archív fuvar minden mezőjét egyetlen, kis-és-ékezet-érzéketlen szövegbe
 *  fűzi össze, hogy a kereső bármelyik kulcsszóra (cég, útvonal, rendszám,
 *  pozíciószám, számlaszám, stb.) rá tudjon találni. */
function archivKeresoSzoveg(row: FuvarRow): string {
  return [
    row.megrendelo,
    row.pozicioszam,
    row.felrako,
    row.lerako,
    row.szamla_szam,
    row.jarmu,
    row.sofor,
    row.aru,
    row.megjegyzes,
    row.date,
    row.erkezett_datum,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function ArchivFuvarSor({
  row,
  onVisszaallitas,
  mutatMegrendelot,
}: {
  row: FuvarRow;
  onVisszaallitas: (id: string, tipus: FuvarTipus) => void;
  mutatMegrendelot: boolean;
}) {
  return (
    <TableRow>
      <TableCell className="text-muted-foreground">{row.erkezett_datum ?? row.date}</TableCell>
      {mutatMegrendelot && (
        <TableCell className="max-w-[140px] whitespace-normal break-words leading-tight">
          {row.tipus === "ber" ? row.megrendelo?.trim() || SAJAT_CEG_NEV : row.megrendelo ?? "—"}
        </TableCell>
      )}
      <TableCell>{row.pozicioszam ?? "—"}</TableCell>
      <TableCell>
        {row.felrako ? `${varosNev(row.felrako)} → ${varosNev(row.lerako)}` : varosNev(row.lerako)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {row.fuvardij != null ? formatOsszeg(row.fuvardij, row.fuvardij_penznem) : "—"}
      </TableCell>
      <TableCell className="text-muted-foreground">{row.szamla_szam ?? "—"}</TableCell>
      <TableCell className="text-muted-foreground">
        {row.postazva_at ? new Date(row.postazva_at).toLocaleDateString("hu-HU") : "—"}
      </TableCell>
      <TableCell>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:underline"
          onClick={() => onVisszaallitas(row.id, row.tipus)}
        >
          Visszaállítás
        </button>
      </TableCell>
    </TableRow>
  );
}

function ArchivCsoportTablazat({
  rows,
  onVisszaallitas,
  mutatMegrendelot = false,
}: {
  rows: FuvarRow[];
  onVisszaallitas: (id: string, tipus: FuvarTipus) => void;
  mutatMegrendelot?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Dátum</TableHead>
            {mutatMegrendelot && <TableHead>Megrendelő</TableHead>}
            <TableHead>Hiv. szám</TableHead>
            <TableHead>Honnan → Hová</TableHead>
            <TableHead className="text-right">Fuvardíj</TableHead>
            <TableHead>Számla szám</TableHead>
            <TableHead>Postázva</TableHead>
            <TableHead className="w-28"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <ArchivFuvarSor
              key={row.id}
              row={row}
              onVisszaallitas={onVisszaallitas}
              mutatMegrendelot={mutatMegrendelot}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Egy összecsukható cégcsoport az Archív fülön — kereséskor mindig nyitva, egyébként a felhasználó nyitja/csukja. */
function ArchivCegCsoport({
  cim,
  cimClassName,
  rows,
  onVisszaallitas,
  open,
  onToggle,
  mutatMegrendelot,
}: {
  cim: string;
  cimClassName?: string;
  rows: FuvarRow[];
  onVisszaallitas: (id: string, tipus: FuvarTipus) => void;
  open: boolean;
  onToggle: () => void;
  mutatMegrendelot?: boolean;
}) {
  return (
    <div className="rounded-md border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-muted/50"
      >
        <span className="flex items-center gap-2">
          <span className={cimClassName ?? "text-sm font-medium"}>{cim}</span>
          <Badge variant="secondary">{rows.length} megbízás</Badge>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t">
          <ArchivCsoportTablazat rows={rows} onVisszaallitas={onVisszaallitas} mutatMegrendelot={mutatMegrendelot} />
        </div>
      )}
    </div>
  );
}

/**
 * Cégnév-aliasok — amikor a Drive-automatika ugyanazt a partnert eltérő,
 * TARTALMILAG is eltérő (nem csak kis/nagybetűs vagy szóköz-) néven olvassa
 * ki különböző megbízásokból (pl. "RBT" / "RBT Europe" / önmagában
 * "EUROPE" — mind ugyanaz a partner), itt vonható össze egy közös,
 * megjelenítendő névre. Csak pontos (whitespace/kis-nagybetű-normalizált)
 * egyezésre illeszkedik, nem részleges/tartalmazó egyezésre — bővíthető,
 * ha újabb ilyen, megerősített esetet találunk.
 */
const CEG_ALIAS_CSOPORTOK: { kanonikus: string; alias: string[] }[] = [
  { kanonikus: "RBT Europe", alias: ["rbt", "rbt europe", "europe"] },
];

function ceglNevKanonikusan(nyersNev: string): string {
  const norm = nyersNev.toLowerCase();
  const csoport = CEG_ALIAS_CSOPORTOK.find((c) => c.alias.includes(norm));
  return csoport?.kanonikus ?? nyersNev;
}

const ARCHIV_EGYEB_KULCS = "__egyeb";

function ArchivLista() {
  const [rows, setRows] = useState<FuvarRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [kereso, setKereso] = useState("");
  const [nyitottCsoportok, setNyitottCsoportok] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const data = await getArchivFuvarok();
    setRows(data);
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  function toggleCsoport(kulcs: string) {
    setNyitottCsoportok((prev) => {
      const next = new Set(prev);
      if (next.has(kulcs)) {
        next.delete(kulcs);
      } else {
        next.add(kulcs);
      }
      return next;
    });
  }

  async function handleVisszaallitas(id: string, tipus: FuvarTipus) {
    if (tipus === "ber") {
      // A saját fuvaroknak nincs postázási munkafolyamatuk — a "Visszaállítás"
      // itt a lezárt/számlázott státuszt vonja vissza "Úton"-ra.
      await updateFuvarStatus(id, "uton");
    } else {
      await setFuvarPostazva(id, false);
    }
    await load();
    toast.success(
      tipus === "ber" ? "Visszaállítva — a Saját fuvarok fülön folytatódik." : "Visszaállítva a Számla/Posta listába."
    );
  }

  const keresoNorm = kereso.trim().toLowerCase();
  const szurtRows = keresoNorm
    ? rows.filter((row) => archivKeresoSzoveg(row).includes(keresoNorm))
    : rows;

  // Cégenkénti csoportosítás. A csoportosítás kulcsa kis-nagybetűtől és a
  // szóközöktől (elejétől/végétől, több egymás utánitól) FÜGGETLEN — a
  // Drive-automatika ugyanazt a partnert néha eltérő írásmóddal olvassa ki
  // (pl. "RBT", "rbt Europe", "  EUROPE") —, plusz a CEG_ALIAS_CSOPORTOK
  // listával a ténylegesen ugyanazt jelentő, de tartalmilag is eltérő
  // neveket (pl. "RBT" / "RBT Europe" / "EUROPE" mind ugyanaz a partner)
  // egy közös, kanonikus névre vonjuk össze.
  //
  // A saját fuvarok közös "Well-worn Pallet" csoportja mindig önálló,
  // névvel jelölt mappát kap; a bér fuvaroknál (megrendelő szerint) csak
  // azok a partnerek, akiktől legalább 2 fuvar van — az 1 megbízásos
  // partnerek egy közös "Egyéb" mappába kerülnek, hogy ne legyen tucatnyi
  // egysoros "csoport" a listában.
  const csoportok = new Map<string, { cim: string; rows: FuvarRow[] }>();
  for (const row of szurtRows) {
    const nyersNev =
      row.tipus === "ber" ? SAJAT_CEG_NEV : row.megrendelo?.trim().replace(/\s+/g, " ") || "(nincs megrendelő)";
    const kanonikusNev = row.tipus === "ber" ? nyersNev : ceglNevKanonikusan(nyersNev);
    const kulcs = kanonikusNev.toLowerCase();
    const csoport = csoportok.get(kulcs);
    if (csoport) {
      csoport.rows.push(row);
    } else {
      csoportok.set(kulcs, { cim: kanonikusNev, rows: [row] });
    }
  }
  const sajatKulcs = SAJAT_CEG_NEV.toLowerCase();
  const nevesCsoportok = [...csoportok.entries()]
    .filter(([kulcs, csoport]) => kulcs === sajatKulcs || csoport.rows.length >= 2)
    .sort(([kulcsA, a], [kulcsB, b]) =>
      kulcsA === sajatKulcs ? -1 : kulcsB === sajatKulcs ? 1 : a.cim.localeCompare(b.cim, "hu")
    );
  const egyebSorok = [...csoportok.entries()]
    .filter(([kulcs, csoport]) => kulcs !== sajatKulcs && csoport.rows.length < 2)
    .flatMap(([, csoport]) => csoport.rows);

  return (
    <Card>
      <CardHeader className="gap-3">
        <CardTitle className="text-sm">Archív</CardTitle>
        <Input
          placeholder="Keresés: cég, útvonal, rendszám, pozíciószám, számlaszám…"
          value={kereso}
          onChange={(e) => setKereso(e.target.value)}
          className="max-w-md"
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!loading && szurtRows.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">
            {kereso ? "Nincs a keresésnek megfelelő archivált fuvar." : "Még nincs archivált fuvar."}
          </p>
        )}
        {nevesCsoportok.map(([kulcs, { cim, rows: lista }]) => (
          <ArchivCegCsoport
            key={kulcs}
            cim={cim}
            rows={lista}
            onVisszaallitas={handleVisszaallitas}
            open={keresoNorm.length > 0 || nyitottCsoportok.has(kulcs)}
            onToggle={() => toggleCsoport(kulcs)}
            mutatMegrendelot={kulcs === sajatKulcs}
          />
        ))}
        {egyebSorok.length > 0 && (
          <ArchivCegCsoport
            key={ARCHIV_EGYEB_KULCS}
            cim="Egyéb (1 megbízásos partnerek)"
            cimClassName="text-sm font-medium text-muted-foreground"
            rows={egyebSorok}
            onVisszaallitas={handleVisszaallitas}
            open={keresoNorm.length > 0 || nyitottCsoportok.has(ARCHIV_EGYEB_KULCS)}
            onToggle={() => toggleCsoport(ARCHIV_EGYEB_KULCS)}
            mutatMegrendelot
          />
        )}
      </CardContent>
    </Card>
  );
}

/** A hét hétfője/vasárnapja (kliens-időzóna, csak megjelenítés-szűréshez, nem tárolt adathoz). */
function aktualisHetHatarok(): { kezdetISO: string; vegISO: string; cimke: string } {
  const ma = new Date();
  const nap = ma.getDay();
  const elToljHetfoig = nap === 0 ? 6 : nap - 1;
  const hetfo = new Date(ma.getFullYear(), ma.getMonth(), ma.getDate() - elToljHetfoig);
  const vasarnap = new Date(hetfo.getTime() + 6 * 86400000);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const honapNap = (d: Date) => d.toLocaleDateString("hu-HU", { month: "short", day: "numeric" });
  return { kezdetISO: iso(hetfo), vegISO: iso(vasarnap), cimke: `${honapNap(hetfo)} – ${honapNap(vasarnap)}` };
}

/** "2026-09" -> "2026. szeptember" — csak megjelenítésre. */
function formatHonapCimke(honapKulcs: string): string {
  const [ev, ho] = honapKulcs.split("-").map(Number);
  return new Date(ev, ho - 1, 1).toLocaleDateString("hu-HU", { year: "numeric", month: "long" });
}

/** Egy sor a heti mini-listákban (Aktuális hét): dátum, útvonal, díj. */
function KimutatasHetiSor({ sor, koltseg }: { sor: KimutatasJarmuSor; koltseg?: number }) {
  const dij =
    sor.tipus === "ber"
      ? koltseg != null
        ? `${koltseg.toLocaleString("hu-HU")} Ft`
        : "…"
      : sor.fuvardij != null
        ? formatOsszeg(sor.fuvardij, sor.fuvardij_penznem)
        : "—";
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="shrink-0 text-muted-foreground">{sor.datum.slice(5)}</span>
      <span className="flex-1 truncate">
        {sor.felrako ? `${varosNev(sor.felrako)} → ${varosNev(sor.lerako)}` : varosNev(sor.lerako)}
      </span>
      <span className="shrink-0 tabular-nums">{dij}</span>
    </div>
  );
}

/** Egy hónap összecsukható mappája: zárva a 4 összesítő szám, nyitva a fuvarok listája (Megbízó, Honnan → Hová, Díj). */
function HonapMappa({
  cim,
  berDarab,
  berOsszegFt,
  berOsszegEur,
  sajatDarab,
  sajatOsszeg,
  sorok,
  koltsegek,
  open,
  onToggle,
}: {
  cim: string;
  berDarab: number;
  berOsszegFt: number;
  berOsszegEur: number;
  sajatDarab: number;
  sajatOsszeg: number;
  sorok: KimutatasJarmuSor[];
  koltsegek: Map<string, number>;
  open: boolean;
  onToggle: () => void;
}) {
  const rendezett = [...sorok].sort((a, b) => b.datum.localeCompare(a.datum));
  return (
    <div className="rounded-md border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/50"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
          {cim}
        </span>
        <span className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>
            Bér fuvarok: <strong className="text-foreground">{berDarab} db</strong>,{" "}
            {berOsszegFt.toLocaleString("hu-HU")} Ft
            {berOsszegEur ? ` + ${berOsszegEur.toLocaleString("hu-HU")} €` : ""}
          </span>
          <span>
            Saját fuvarok: <strong className="text-foreground">{sajatDarab} db</strong>,{" "}
            {sajatOsszeg.toLocaleString("hu-HU")} Ft
          </span>
        </span>
      </button>
      {open && (
        <div className="overflow-x-auto border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dátum</TableHead>
                <TableHead>Megbízó</TableHead>
                <TableHead>Honnan → Hová</TableHead>
                <TableHead className="text-right">Díj</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rendezett.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="text-muted-foreground">{s.datum}</TableCell>
                  <TableCell>{s.tipus === "ber" ? s.megrendelo?.trim() || SAJAT_CEG_NEV : s.megrendelo ?? "—"}</TableCell>
                  <TableCell>
                    {s.felrako ? `${varosNev(s.felrako)} → ${varosNev(s.lerako)}` : varosNev(s.lerako)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {s.tipus === "ber"
                      ? koltsegek.get(s.id) != null
                        ? `${koltsegek.get(s.id)!.toLocaleString("hu-HU")} Ft`
                        : "…"
                      : s.fuvardij != null
                        ? formatOsszeg(s.fuvardij, s.fuvardij_penznem)
                        : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/**
 * Egy jármű kártyája a Kimutatás fülön: felül sofőr — rendszám, alatta az
 * aktuális hét saját/bér fuvar listája (mindkettő összegével), majd
 * összecsukható havi mappák (db+összeg zárva, teljes fuvarlista nyitva). A
 * saját fuvarok (tipus='ber') díja a Saját fuvarok fülön is használt,
 * számított útdíj+üzemanyag becslés (szamitottUtKoltseg) — nincs mindig
 * valódi fuvardíjuk, ezt vesszük annak.
 */
function JarmuKimutatasCard({ jarmu, sorok }: { jarmu: SajatJarmu; sorok: KimutatasJarmuSor[] }) {
  const [koltsegek, setKoltsegek] = useState<Map<string, number>>(new Map());
  const [nyitottHonapok, setNyitottHonapok] = useState<Set<string>>(new Set());

  useEffect(() => {
    let elveszett = false;
    const sajatSorok = sorok.filter((s) => s.tipus === "ber");
    Promise.all(
      sajatSorok.map(async (s) => ({ id: s.id, koltseg: await szamitottUtKoltseg(s.felrako, s.lerako) }))
    ).then((eredmenyek) => {
      if (elveszett) return;
      setKoltsegek((prev) => {
        const next = new Map(prev);
        for (const { id, koltseg } of eredmenyek) {
          if (koltseg != null) next.set(id, koltseg);
        }
        return next;
      });
    });
    return () => {
      elveszett = true;
    };
  }, [sorok]);

  function toggleHonap(honap: string) {
    setNyitottHonapok((prev) => {
      const next = new Set(prev);
      if (next.has(honap)) {
        next.delete(honap);
      } else {
        next.add(honap);
      }
      return next;
    });
  }

  const het = aktualisHetHatarok();
  const hetiSorok = sorok.filter((s) => s.datum >= het.kezdetISO && s.datum <= het.vegISO);
  const hetiSajat = hetiSorok.filter((s) => s.tipus === "ber").sort((a, b) => a.datum.localeCompare(b.datum));
  const hetiBer = hetiSorok.filter((s) => s.tipus === "sajat").sort((a, b) => a.datum.localeCompare(b.datum));
  const hetiSajatOsszeg = hetiSajat.reduce((sum, s) => sum + (koltsegek.get(s.id) ?? 0), 0);
  const hetiBerOsszegFt = hetiBer
    .filter((s) => s.fuvardij_penznem === "Ft")
    .reduce((sum, s) => sum + (s.fuvardij ?? 0), 0);
  const hetiBerOsszegEur = hetiBer
    .filter((s) => s.fuvardij_penznem === "EUR")
    .reduce((sum, s) => sum + (s.fuvardij ?? 0), 0);

  const honapok = new Map<string, KimutatasJarmuSor[]>();
  for (const s of sorok) {
    const honap = s.datum.slice(0, 7);
    const lista = honapok.get(honap) ?? [];
    lista.push(s);
    honapok.set(honap, lista);
  }
  const honapLista = [...honapok.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${JARMU_SZIN_DOT_CLASS[jarmu.szin]}`} />
          {jarmuLabel(jarmu)}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-medium text-muted-foreground">Aktuális hét ({het.cimke})</h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1 rounded-md border p-2">
              <span className="text-xs font-medium text-muted-foreground">Saját fuvarok</span>
              {hetiSajat.length === 0 && <span className="text-xs text-muted-foreground">Nincs erre a hétre.</span>}
              {hetiSajat.map((s) => (
                <KimutatasHetiSor key={s.id} sor={s} koltseg={koltsegek.get(s.id)} />
              ))}
              <div className="mt-1 border-t pt-1 text-right text-xs font-medium">
                Összesen: {hetiSajatOsszeg.toLocaleString("hu-HU")} Ft
              </div>
            </div>
            <div className="flex flex-col gap-1 rounded-md border p-2">
              <span className="text-xs font-medium text-muted-foreground">Bér fuvarok</span>
              {hetiBer.length === 0 && <span className="text-xs text-muted-foreground">Nincs erre a hétre.</span>}
              {hetiBer.map((s) => (
                <KimutatasHetiSor key={s.id} sor={s} />
              ))}
              <div className="mt-1 border-t pt-1 text-right text-xs font-medium">
                Összesen: {hetiBerOsszegFt.toLocaleString("hu-HU")} Ft
                {hetiBerOsszegEur ? ` + ${hetiBerOsszegEur.toLocaleString("hu-HU")} €` : ""}
              </div>
            </div>
          </div>
          <div className="text-right text-sm font-medium">
            Mindkettő összesen: {(hetiSajatOsszeg + hetiBerOsszegFt).toLocaleString("hu-HU")} Ft
            {hetiBerOsszegEur ? ` + ${hetiBerOsszegEur.toLocaleString("hu-HU")} €` : ""}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-medium text-muted-foreground">Havi bontás</h4>
          {honapLista.length === 0 && <p className="text-xs text-muted-foreground">Még nincs adat.</p>}
          <div className="flex flex-col gap-2">
            {honapLista.map(([honap, lista]) => {
              const sajat = lista.filter((s) => s.tipus === "ber");
              const ber = lista.filter((s) => s.tipus === "sajat");
              const sajatOsszeg = sajat.reduce((sum, s) => sum + (koltsegek.get(s.id) ?? 0), 0);
              const berOsszegFt = ber
                .filter((s) => s.fuvardij_penznem === "Ft")
                .reduce((sum, s) => sum + (s.fuvardij ?? 0), 0);
              const berOsszegEur = ber
                .filter((s) => s.fuvardij_penznem === "EUR")
                .reduce((sum, s) => sum + (s.fuvardij ?? 0), 0);
              return (
                <HonapMappa
                  key={honap}
                  cim={formatHonapCimke(honap)}
                  berDarab={ber.length}
                  berOsszegFt={berOsszegFt}
                  berOsszegEur={berOsszegEur}
                  sajatDarab={sajat.length}
                  sajatOsszeg={sajatOsszeg}
                  sorok={lista}
                  koltsegek={koltsegek}
                  open={nyitottHonapok.has(honap)}
                  onToggle={() => toggleHonap(honap)}
                />
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Kimutatás fül: három kártya, egy-egy a saját járműveknek (SAJAT_JARMUVEK)
 * — a "jarmu" mező szabad szöveges tartalmát resolveJarmu egyezteti a
 * jármű-listával (rendszám vagy sofőrnév alapján is), hogy a régebbi,
 * eltérő formátumú bejegyzések is a megfelelő kártyához kerüljenek.
 */
function KimutatasView() {
  const [sorok, setSorok] = useState<KimutatasJarmuSor[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await getKimutatasJarmuFuvarok();
    setSorok(data);
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  if (loading) return <p className="text-sm text-muted-foreground">Betöltés…</p>;

  const jarmuSorok = new Map<string, KimutatasJarmuSor[]>();
  for (const s of sorok) {
    const jarmu = s.jarmu ? resolveJarmu(s.jarmu) : null;
    if (!jarmu) continue;
    const lista = jarmuSorok.get(jarmu.sofor) ?? [];
    lista.push(s);
    jarmuSorok.set(jarmu.sofor, lista);
  }

  return (
    <div className="flex flex-col gap-4">
      {SAJAT_JARMUVEK.map((jarmu) => (
        <JarmuKimutatasCard key={jarmu.sofor} jarmu={jarmu} sorok={jarmuSorok.get(jarmu.sofor) ?? []} />
      ))}
    </div>
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

const MEGBIZASOK_TABS = ["sajat", "ber", "kapcsolatok", "szamla-posta", "archiv", "kimutatas"] as const;
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
        <TabsTrigger value="kimutatas">Kimutatás</TabsTrigger>
      </TabsList>
      <TabsContent value="sajat" className="mt-4">
        <div className="flex flex-col gap-4">
          <Card className="bg-muted/40">
            <CardContent className="py-4 text-sm text-muted-foreground">
              A bér fuvarok mindig megbízásból (a Drive „Fuvarmegbizások” mappájában érkező
              dokumentumból) indulnak — nincs kézi rögzítés. Itt csak a még folyamatban lévők
              (a lerakás dátuma még nem múlt el) látszanak; a lerakás után a fuvar a
              Számla/Posta fülön folytatódik, onnan pedig postázás után 5 perccel az Archívba kerül.
            </CardContent>
          </Card>
          <BerFuvarLista refreshKey={0} />
        </div>
      </TabsContent>
      <TabsContent value="ber" className="mt-4">
        <SajatFuvarokTab />
      </TabsContent>
      <TabsContent value="kapcsolatok" className="mt-4">
        <Kapcsolatok />
      </TabsContent>
      <TabsContent value="szamla-posta" className="mt-4">
        <SzamlaPostaLista refreshKey={0} />
      </TabsContent>
      <TabsContent value="archiv" className="mt-4">
        <ArchivLista />
      </TabsContent>
      <TabsContent value="kimutatas" className="mt-4">
        <KimutatasView />
      </TabsContent>
    </Tabs>
  );
}
