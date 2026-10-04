"use client";

// A sofőr napi fuvar-nézete a dolgozói mobilon (/erkezes → Fuvarok).
//
// Budaházi Zoltán 2026-09-22-i kérése szerint ez a nézet SZÁNDÉKOSAN kopár:
// két csempe, semmi több — az aktuális megbízás és a következő.
//
// 2026-09-23 óta a sofőr NEM kapja meg e-mailben a teljes megbízást: ami
// kell belőle, az itt van. Budaházi Zoltán 8 megbízás átnézése után
// választotta ki: időpont/időablak, az összes lerakó, a rakodóhely cégneve,
// dátum, pozíciószám, referencia, helyszíni kontakt, áru, jármű-előírás és
// a megbízás PDF. Az aktuális csempe ezért "menetjegy" (az S4 terv):
// honnan → hová, perforáció, kódok, a jegy talpán a soros megálló a
// gombokkal. Az adatok forrása: lib/fuvarozas/sofor-adatok.ts.
//
// Ami szándékosan NEM jelenik meg: az ügyintéző, a raklapcsere, a
// papír-teendők, az értesítési kötelezettségek, a megbízók szabad szöveges
// utasításai, és a pénz (fuvardíj, költség, számla).
//
// A gombok mindig CSAK a soron következő megállón vannak: előbb a felrakónál,
// és amint ott indulást jelölt, átkerülnek a lerakóhoz. Ha a megbízás utolsó
// megállója is kész, a csempe helyére a következő megbízás lép.
//
// A sorrend és a kész/nem kész állapot a GPS lap idővonalából jön (lásd
// lib/fuvarozas/sofor.ts getSoforNap) — a sofőr ugyanazt látja, mint a
// diszpécser. Pénz (fuvardíj, költség, számla) szándékosan nem jelenik meg.

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Camera,
  Check,
  ChevronDown,
  FileText,
  LocateFixed,
  MessageSquareWarning,
  Navigation,
  Phone,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getSoforNap,
  jelezGondot,
  jelolMegerkeztem,
  jelolVarakozast,
  markMegalloKesz,
  rogzitMegalloHelyet,
  type SoforFuvarBlokk,
  type SoforMegalloSor,
  type SoforNap,
} from "@/lib/fuvarozas/sofor";
import { budapestNapISO, kovetkezoMunkanapISO } from "@/lib/fuvarozas/idozona";
import { kontaktNev, kontaktTelefon } from "@/lib/fuvarozas/sofor-adatok";
import { feltoltOldalakat, feltoltesUzenet } from "@/lib/fuvarozas/fuvarlevel-feltoltes";

const IDO_OPCIOK: Intl.DateTimeFormatOptions = {
  timeZone: "Europe/Budapest",
  hour: "2-digit",
  minute: "2-digit",
};

function formatIdo(d: Date): string {
  return new Date(d).toLocaleTimeString("hu-HU", IDO_OPCIOK);
}

const TIPUS_CIMKE = { felrako: "Felrakó", lerako: "Lerakó" } as const;

/** Helyszíni kontakt az előnézetben: ha van benne szám, hívható (06-tal, lásd kontaktTelefon). */
function KontaktSor({ kontakt }: { kontakt: string }) {
  const telefon = kontaktTelefon(kontakt);
  if (!telefon) return <span className="text-xs">{kontakt}</span>;
  return (
    <a href={`tel:${telefon}`} className="flex w-fit items-center gap-1 text-sm font-semibold text-[var(--mob-positive)]">
      <Phone className="h-3.5 w-3.5 shrink-0" />
      {[kontaktNev(kontakt), telefon].filter(Boolean).join(" · ")}
    </a>
  );
}

/** A megadott nap utáni nap ISO-ban, naptári léptetéssel (hónap-/évfordulón is jó). */
function kovetkezoNapISO(napISO: string): string {
  const [ev, ho, nap] = napISO.split("-").map(Number);
  const d = new Date(Date.UTC(ev, ho - 1, nap + 1, 12));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

const DOK_CIMKE: Record<string, string> = {
  megbizas: "Megbízás",
  rakomanylista: "Rakománylista",
  fuvarlevel: "Fuvarlevél fotó",
  egyeb: "Irat",
};

function navigacioUrl(cim: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(cim)}`;
}

/**
 * "Rossz a cím? Itt vagyok." — ha a cím geokódolása bizonytalan, a GPS-
 * felismerés nem tud ide érkezést jelölni. A sofőr a rakodóhelyen állva egy
 * koppintással a kocsi pozícióját rögzíti a cím valódi helyeként; onnantól
 * minden ugyanide szóló fuvar magától felismerhető. Sok saját fuvaron csak
 * városnév van, ezért ez a szótár az egyetlen módja, hogy a rendszer valaha
 * megtanulja a telephelyet.
 */
function HelyGomb({ m, pending, onHely }: { m: SoforMegalloSor; pending: boolean; onHely: () => void }) {
  if (m.kesz || m.helyRogzitve || !m.helyBizonytalan) return null;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onHely}
      className="flex w-fit items-center gap-1.5 rounded-md bg-[var(--mob-tile)] px-2 py-1 text-xs font-medium text-[var(--mob-muted)]"
      title="A rendszer nem találja pontosan ezt a címet a térképen. Ha a rakodóhelyen állsz, koppints: a kocsi mostani helyét jegyezzük fel a címhez."
    >
      <LocateFixed className="h-3.5 w-3.5" />
      Itt vagyok
    </button>
  );
}

/**
 * A megálló két lépése: Megérkeztem és Indulok. Csak a soron következő
 * megállón jelennek meg — a felrakónál, majd az indulás jelölése után a
 * lerakónál. Ami megvan, az zöld, órával jelölt sorrá alakul; ez a nyugtázás.
 *
 * Adat: a fuvar_megallo_allapot meglévő mezőit írják (kezi_erkezes, illetve
 * kesz + kesz_at), migráció nélkül.
 */
function LepesGombok({
  m,
  pending,
  onErkezes,
  onIndulok,
}: {
  m: SoforMegalloSor;
  pending: boolean;
  onErkezes: () => void;
  onIndulok: () => void;
}) {
  const erkezett = Boolean(m.keziErkezes);
  return (
    <div className="flex flex-col gap-1.5">
      {erkezett ? (
        <div className="flex h-11 items-center justify-between rounded-md border border-[var(--mob-positive)]/30 bg-[var(--mob-positive)]/10 px-3 text-sm font-medium text-[var(--mob-positive)]">
          <span className="flex items-center gap-1.5">
            <Check className="h-4 w-4 shrink-0" />
            Megérkeztem
          </span>
          <span className="shrink-0 tabular-nums">{formatIdo(m.keziErkezes!)}</span>
        </div>
      ) : (
        <Button
          disabled={pending}
          onClick={onErkezes}
          className="h-12 w-full justify-center bg-[var(--mob-accent)] text-base font-semibold text-white hover:bg-[var(--mob-accent)]/90"
        >
          Megérkeztem
        </Button>
      )}
      <Button
        disabled={pending}
        onClick={onIndulok}
        className={cn(
          "h-12 w-full justify-center text-base font-semibold",
          erkezett
            ? "bg-[var(--mob-accent)] text-white hover:bg-[var(--mob-accent)]/90"
            : "border border-[var(--mob-border)] bg-[var(--mob-card)] text-[var(--mob-muted)] hover:bg-[var(--mob-tile)]"
        )}
      >
        Indulok
      </Button>
    </div>
  );
}

/**
 * A csempe fejlécének két jelölése (Budaházi Zoltán, 2026-09-22):
 *
 *  - "Saját fuvar": a saját raklapunkat visszük. Más munka, mint a bér
 *    fuvar — nincs külső megbízó, akinek a kapuban szólni kell.
 *  - "Felpakolva": minden felrakó megállója kész. A sofőr így a csempe
 *    tetejéről látja, hol tart, anélkül hogy végigolvasná a megállókat.
 */
function Jelolok({ blokk }: { blokk: SoforFuvarBlokk }) {
  const felrakok = blokk.megallok.filter((m) => m.tipus === "felrako");
  const felpakolt = felrakok.length > 0 && felrakok.every((m) => m.kesz);
  if (!blokk.sajatFuvar && !felpakolt) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {blokk.sajatFuvar && (
        <span className="rounded-full bg-[var(--mob-tile)] px-2 py-0.5 text-[11px] font-semibold">
          Saját fuvar
        </span>
      )}
      {felpakolt && (
        <span className="flex items-center gap-1 rounded-full bg-[var(--mob-positive)]/15 px-2 py-0.5 text-[11px] font-semibold text-[var(--mob-positive)]">
          <Check className="h-3 w-3" />
          Felpakolva
        </span>
      )}
    </span>
  );
}

/** A "Nem kaptam papírt" jelölések (fuvar-azonosítók) a telefonon — csak kényelmi, nem üzleti adat. */
const PAPIR_NEM_KELL_KULCS = "sofor-papir-nem-kaptam";

function papirNemKellOlvas(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(PAPIR_NEM_KELL_KULCS) ?? "[]");
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function papirNemKellIr(idk: string[]) {
  try {
    window.localStorage.setItem(PAPIR_NEM_KELL_KULCS, JSON.stringify(idk.slice(-50)));
  } catch {
    // privát mód / tiltott tároló — a kártya legfeljebb újra megjelenik
  }
}

/**
 * Minden megállója kész — a papír-kártya ilyenkor kint van, amíg a sofőr a
 * „Kész, ez minden”-t (vagy saját fuvarnál a „Nem kaptam”-ot) meg nem nyomja.
 * Az első fotó után sem tűnik el: a papír gyakran többoldalas (2026-09-28).
 */
function papirraVar(blokk: SoforFuvarBlokk): boolean {
  return blokk.megallok.length > 0 && blokk.megallok.every((m) => m.kesz);
}

function fotoOldalak(blokk: SoforFuvarBlokk): number {
  return blokk.dokumentumok.filter((d) => d.tipus === "fuvarlevel").length;
}

/**
 * Lerakás után a papír lefotózása — eddig egy csukott "Részletek" sor mögött
 * volt, és semmi nem kérte (Budaházi Zoltán, 2026-09-24):
 *  - bér fuvar: az aláírt fuvarlevél / CMR — enélkül nem számlázunk;
 *  - saját fuvar: az átvevő által aláírt (leigazolt) szállítólevél — ettől
 *    zárul le a fuvar (Budaházi Zoltán, 2026-10-04). Ha nincs papír, a
 *    "Nem kaptam" gomb eltünteti a kártyát; a fuvar ilyenkor az irodában
 *    zárható le kézzel.
 */
function PapirKeres({
  blokk,
  pending,
  haladas,
  onFoto,
  onKesz,
}: {
  blokk: SoforFuvarBlokk;
  pending: boolean;
  /** „3/10” feltöltés közben. */
  haladas: string | null;
  onFoto: (fuvarId: string, fajlok: File[]) => void;
  onKesz: (fuvarId: string) => void;
}) {
  const kamera = useRef<HTMLInputElement>(null);
  const tar = useRef<HTMLInputElement>(null);
  const utvonal = utvonalVarosok(blokk).map((m) => m.varos).join(" → ");
  const oldalak = fotoOldalak(blokk);
  const valaszt = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fajlok = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (fajlok.length) onFoto(blokk.fuvarId, fajlok);
  };
  const papirNev = blokk.sajatFuvar ? "Szállítólevél" : "Fuvarlevél";
  return (
    <div className="flex flex-col gap-2 rounded-2xl border-2 border-amber-500 bg-amber-50 px-4 py-3 text-amber-950">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-800">
        Lerakva · {blokk.megrendelo ?? (blokk.sajatFuvar ? "Saját fuvar" : "Megbízás")}
      </span>
      <span className="text-sm">{utvonal}</span>
      {oldalak === 0 ? (
        <>
          <span className="text-base font-bold leading-tight">
            {blokk.sajatFuvar ? "Fotózd le az aláírt szállítólevelet." : "Fotózd le az aláírt fuvarlevelet (CMR)."}
          </span>
          <span className="text-xs">
            {blokk.sajatFuvar ? "Ettől zárul le a fuvar. " : "Enélkül nem tudjuk kiszámlázni a fuvart. "}Minden oldalt külön fotózz le.
          </span>
        </>
      ) : (
        <>
          <span className="text-base font-bold leading-tight">✓ {oldalak} oldal feltöltve</span>
          <span className="text-xs">Ha van még oldal, fotózd le azt is. Ha mind megvan, nyomd meg a „Kész”-t.</span>
        </>
      )}
      <input ref={kamera} type="file" accept="image/*" capture="environment" className="hidden" onChange={valaszt} />
      <input ref={tar} type="file" accept="image/*" multiple className="hidden" onChange={valaszt} />
      {haladas ? <span className="text-sm font-semibold">Feltöltés {haladas}…</span> : null}
      <Button
        disabled={pending}
        onClick={() => kamera.current?.click()}
        className="h-12 w-full justify-center bg-amber-600 text-base font-semibold text-white hover:bg-amber-600/90"
      >
        <Camera className="h-5 w-5" />
        {oldalak === 0 ? `${papirNev} fotó` : "+ Még egy oldal"}
      </Button>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => tar.current?.click()}
          className="h-11 flex-1 border-amber-400 bg-transparent text-amber-900"
        >
          Több kép a fotótárból
        </Button>
        {oldalak > 0 ? (
          <Button
            disabled={pending}
            onClick={() => onKesz(blokk.fuvarId)}
            className="h-11 flex-1 bg-emerald-700 text-white hover:bg-emerald-700/90"
          >
            Kész, ez minden
          </Button>
        ) : blokk.sajatFuvar ? (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => onKesz(blokk.fuvarId)}
            className="h-11 flex-1 border-amber-400 bg-transparent text-amber-900"
          >
            Nem kaptam
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** ISO nap → "szept. 24." */
function napFelirat(nap: string | null): string | null {
  if (!nap) return null;
  const d = new Date(`${nap}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("hu-HU", { month: "short", day: "numeric", timeZone: "Europe/Budapest" });
}

/** "szept. 24. · 8:00–15:00" — ami megvan belőle. */
function mikor(m: SoforMegalloSor): string | null {
  return [napFelirat(m.nap), m.ido].filter(Boolean).join(" · ") || null;
}

/** A megbízás PDF-je: a "megbizas" típusú irat, ha van, különben az első irat. */
function megbizasPdf(blokk: SoforFuvarBlokk) {
  return blokk.dokumentumok.find((d) => d.tipus === "megbizas") ?? blokk.dokumentumok.find((d) => d.tipus !== "fuvarlevel") ?? null;
}

function iratMegnyitasa(id: string) {
  window.open(`/api/fuvarozas/dokumentum/${id}`, "_blank", "noopener,noreferrer");
}

/** A megállók városai sorban, az egymás utáni ismétlődés nélkül ("Sopron → Miskolc → Debrecen"). */
function utvonalVarosok(blokk: SoforFuvarBlokk): SoforMegalloSor[] {
  return blokk.megallok.filter((m, i, t) => i === 0 || t[i - 1].varos !== m.varos);
}

/** Egy kód a menetjegy rácsában. Üres értéknél nem jelenik meg. */
function JegyAdat({ cimke, ertek, mono }: { cimke: string; ertek: string | null | undefined; mono?: boolean }) {
  if (!ertek?.trim()) return null;
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--mob-muted)]">{cimke}</span>
      <span className={cn("break-words", mono ? "font-mono text-[15px] font-bold" : "text-xs")}>{ertek}</span>
    </div>
  );
}

/**
 * Az AKTUÁLIS megbízás csempéje — "menetjegy" (Budaházi Zoltán választása,
 * 2026-09-23, S4 terv). Budaházi Zoltán eddig e-mailben küldte el a
 * sofőrnek a teljes megbízást; ez a csempe váltja ki. Csak az van rajta,
 * amit ő kiválasztott:
 *
 *  - fent HONNAN → HOVÁ nagyban, napokkal és időablakkal; több lerakónál
 *    alatta a teljes útvonal, a kész megálló pipával;
 *  - a perforáció alatt a kódok: pozíciószám, referencia, áru, jármű;
 *  - a jegy talpán a SOROS megálló: a rakodóhely cége, címe, a helyszíni
 *    kontakt, a Navigáció és a Megbízás PDF gomb, és a lépésgombok.
 *
 * A papír-teendők (fuvarlevél fotó, gond jelzése) és a többi irat egy
 * alapból csukott "Részletek" sor mögött maradnak.
 */
function AktualisMegbizas({
  blokk,
  aktivMegalloIndex,
  pending,
  onErkezes,
  onIndulok,
  onHely,
  onFoto,
  onGond,
}: {
  blokk: SoforFuvarBlokk;
  aktivMegalloIndex: number | null;
  pending: boolean;
  onErkezes: (fuvarId: string, megalloIndex: number) => void;
  onIndulok: (m: SoforMegalloSor) => void;
  onHely: (m: SoforMegalloSor) => void;
  onFoto: (fuvarId: string, fajlok: File[]) => void;
  onGond: (fuvarId: string) => void;
}) {
  const fotoInput = useRef<HTMLInputElement>(null);
  const [reszletekNyitva, setReszletekNyitva] = useState(false);

  const honnan = blokk.megallok.find((m) => m.tipus === "felrako") ?? null;
  const hova = [...blokk.megallok].reverse().find((m) => m.tipus === "lerako") ?? null;
  const aktiv = blokk.megallok.find((m) => m.megalloIndex === aktivMegalloIndex) ?? null;
  const utvonal = utvonalVarosok(blokk);
  const pdf = megbizasPdf(blokk);
  const telefon = kontaktTelefon(aktiv?.kontakt);
  const tobbiIrat = blokk.dokumentumok.filter((d) => d.id !== pdf?.id);

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border-2 border-[var(--mob-accent)] bg-[var(--mob-card)]">
      <div className="flex flex-col gap-3 px-4 pb-3 pt-3">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold">
            {blokk.megrendelo ?? (blokk.sajatFuvar ? "Saját fuvar" : "Megbízás")}
          </span>
          <Jelolok blokk={blokk} />
        </div>
        {blokk.masRendszam && (
          <span className="flex items-center gap-1 text-[11px] font-medium text-[var(--mob-negative)]">
            <AlertTriangle className="h-3.5 w-3.5" />
            A megbízáson más rendszám áll: {blokk.masRendszam}
          </span>
        )}

        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
          <div className="flex min-w-0 flex-col">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--mob-muted)]">Honnan</span>
            <span className={cn("truncate text-[22px] font-bold leading-tight", honnan?.kesz && "text-[var(--mob-muted)]")}>
              {honnan?.varos ?? "—"}
            </span>
            {honnan && mikor(honnan) && <span className="text-[11px] text-[var(--mob-muted)]">{mikor(honnan)}</span>}
          </div>
          <Truck className="mb-5 h-6 w-6 text-[var(--mob-accent)]" />
          <div className="flex min-w-0 flex-col items-end text-right">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--mob-muted)]">Hová</span>
            <span className="truncate text-[22px] font-bold leading-tight">{hova?.varos ?? "—"}</span>
            {hova && mikor(hova) && (
              <span className="text-[11px] font-semibold text-amber-800">{mikor(hova)}</span>
            )}
          </div>
        </div>

        {utvonal.length > 2 && (
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
            {utvonal.map((m, i) => (
              <span key={m.megalloIndex} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-[var(--mob-muted)]">→</span>}
                <span
                  className={cn(
                    "flex items-center gap-0.5",
                    m.kesz && "text-[var(--mob-muted)]",
                    m.megalloIndex === aktivMegalloIndex && "font-bold"
                  )}
                >
                  {m.kesz && <Check className="h-3 w-3 text-[var(--mob-positive)]" />}
                  {m.varos}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Perforáció: a jegy kódjai innen lefelé. */}
      <div className="relative mx-3.5 border-t-2 border-dashed border-[var(--mob-border)]">
        <span className="absolute -left-[26px] -top-[11px] h-5 w-5 rounded-full bg-[var(--mob-bg)]" />
        <span className="absolute -right-[26px] -top-[11px] h-5 w-5 rounded-full bg-[var(--mob-bg)]" />
      </div>

      {(blokk.pozicioszam || blokk.referencia || blokk.aru || blokk.jarmuEloiras) && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 px-4 py-3">
          <JegyAdat cimke="Pozíciószám" ertek={blokk.pozicioszam} mono />
          <JegyAdat cimke="Referencia" ertek={blokk.referencia} mono />
          <JegyAdat cimke="Áru" ertek={blokk.aru} />
          <JegyAdat cimke="Jármű" ertek={blokk.jarmuEloiras} />
        </div>
      )}

      {aktiv && (
        <div className="flex flex-col gap-2 border-t border-[var(--mob-border)] bg-[var(--mob-tile)]/40 px-4 py-3">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--mob-muted)]">
            {[TIPUS_CIMKE[aktiv.tipus], mikor(aktiv)].filter(Boolean).join(" · ")}
          </span>
          <div className="flex flex-col">
            {aktiv.ceg && <span className="text-sm font-semibold">{aktiv.ceg}</span>}
            <span className={cn(aktiv.ceg ? "text-xs text-[var(--mob-muted)]" : "text-sm font-semibold")}>{aktiv.cim}</span>
          </div>
          {aktiv.rakomany && <span className="text-sm font-semibold">{aktiv.tipus === "felrako" ? "Fel: " : "Le: "}{aktiv.rakomany}</span>}
          {aktiv.kontakt &&
            (telefon ? (
              <a
                href={`tel:${telefon}`}
                className="flex w-fit items-center gap-1.5 text-sm font-semibold text-[var(--mob-positive)]"
              >
                <Phone className="h-4 w-4 shrink-0" />
                {[kontaktNev(aktiv.kontakt), telefon].filter(Boolean).join(" · ")}
              </a>
            ) : (
              <span className="flex items-center gap-1.5 text-sm">
                <Phone className="h-4 w-4 shrink-0 text-[var(--mob-muted)]" />
                {aktiv.kontakt}
              </span>
            ))}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="h-10 border-[var(--mob-border)] bg-[var(--mob-card)]"
              onClick={() => window.open(navigacioUrl(aktiv.cim), "_blank", "noopener,noreferrer")}
            >
              <Navigation className="h-4 w-4" />
              Navigáció
            </Button>
            {pdf && (
              <Button
                variant="outline"
                size="sm"
                className="h-10 border-[var(--mob-border)] bg-[var(--mob-card)]"
                onClick={() => iratMegnyitasa(pdf.id)}
                title={pdf.fajlnev ?? undefined}
              >
                <FileText className="h-4 w-4" />
                Megbízás PDF
              </Button>
            )}
            <HelyGomb m={aktiv} pending={pending} onHely={() => onHely(aktiv)} />
          </div>
          <LepesGombok
            m={aktiv}
            pending={pending}
            onErkezes={() => onErkezes(aktiv.fuvarId, aktiv.megalloIndex)}
            onIndulok={() => onIndulok(aktiv)}
          />
        </div>
      )}

      <button
        type="button"
        onClick={() => setReszletekNyitva((v) => !v)}
        className="flex items-center justify-between gap-2 border-t border-[var(--mob-border)] px-4 py-2.5 text-left text-xs font-medium text-[var(--mob-muted)]"
      >
        Fuvarlevél fotó, gond jelzése, iratok
        <ChevronDown className={cn("h-4 w-4 transition-transform", reszletekNyitva && "rotate-180")} />
      </button>

      {reszletekNyitva && (
        <div className="flex flex-wrap gap-2 border-t border-[var(--mob-border)] px-4 py-3">
          <input
            ref={fotoInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const fajlok = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (fajlok.length) onFoto(blokk.fuvarId, fajlok);
            }}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            className="h-9 border-[var(--mob-border)]"
            onClick={() => fotoInput.current?.click()}
            title="Fuvarlevél / CMR lefotózása"
          >
            <Camera className="h-4 w-4" />
            Fuvarlevél fotó
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            className="h-9 border-[var(--mob-border)]"
            onClick={() => onGond(blokk.fuvarId)}
            title="Gond van a fuvarral — üzenet a diszpécsernek"
          >
            <MessageSquareWarning className="h-4 w-4" />
            Gond van
          </Button>
          {tobbiIrat.map((d) => (
            <Button
              key={d.id}
              size="sm"
              variant="outline"
              className="h-9 border-[var(--mob-border)]"
              onClick={() => iratMegnyitasa(d.id)}
              title={d.fajlnev ?? undefined}
            >
              <FileText className="h-4 w-4" />
              {DOK_CIMKE[d.tipus ?? "egyeb"] ?? "Irat"}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Egy MÉG NEM AKTUÁLIS megbízás csempéje — ugyanez szolgálja ki a "Ezután
 * következik" és a "Holnap" sorokat is. Csukva: megbízó, a teljes útvonal
 * városai, a lerakók száma és a pozíciószám. Rákoppintva kinyílik —
 * megállók a rakodóhely cégével, címével, időablakával, és a kódok —, hogy
 * még indulás előtt megnézhesse, mire készüljön.
 *
 * Gomb sosincs rajta: amíg az aktuálissal nem végzett, ezen nincs dolga.
 */
function MegbizasElonezet({ blokk, cimke }: { blokk: SoforFuvarBlokk; cimke: string }) {
  const [nyitva, setNyitva] = useState(false);
  const utvonal = utvonalVarosok(blokk);
  const lerakoDarab = blokk.megallok.filter((m) => m.tipus === "lerako").length;
  const pdf = megbizasPdf(blokk);
  const alsoSor = [lerakoDarab > 1 ? `${lerakoDarab} lerakó` : null, blokk.pozicioszam ? `Poz. ${blokk.pozicioszam}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-dashed border-[var(--mob-border)] bg-[var(--mob-card)]/60">
      <button
        type="button"
        onClick={() => setNyitva((v) => !v)}
        className="flex items-center justify-between gap-2 px-3 py-3 text-left"
      >
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--mob-muted)]">
            {cimke}
          </span>
          <span className="truncate text-sm font-semibold">
            {blokk.megrendelo ?? (blokk.sajatFuvar ? "Saját fuvar" : "Megbízás")}
          </span>
          {utvonal.length > 1 && <span className="text-base">{utvonal.map((m) => m.varos).join(" → ")}</span>}
          {alsoSor && <span className="text-[11px] text-[var(--mob-muted)]">{alsoSor}</span>}
          <Jelolok blokk={blokk} />
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-[var(--mob-muted)] transition-transform",
            nyitva && "rotate-180"
          )}
        />
      </button>

      {nyitva && (
        <div className="flex flex-col border-t border-[var(--mob-border)]">
          {blokk.megallok.map((m) => (
            <div
              key={m.megalloIndex}
              className="flex flex-col border-b border-[var(--mob-border)] px-3 py-2.5 last:border-b-0"
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--mob-muted)]">
                {[TIPUS_CIMKE[m.tipus], mikor(m)].filter(Boolean).join(" · ")}
              </span>
              <span className="text-base font-bold leading-tight">{m.varos}</span>
              {m.ceg && <span className="text-sm font-semibold">{m.ceg}</span>}
              <span className="text-xs text-[var(--mob-muted)]">{m.cim}</span>
              {m.rakomany && <span className="text-xs font-semibold">{m.tipus === "felrako" ? "Fel: " : "Le: "}{m.rakomany}</span>}
              {m.kontakt && <KontaktSor kontakt={m.kontakt} />}
            </div>
          ))}

          {(blokk.referencia || blokk.aru || blokk.jarmuEloiras || pdf) && (
            <div className="flex flex-col gap-2.5 border-t border-[var(--mob-border)] px-3 py-3">
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                <JegyAdat cimke="Referencia" ertek={blokk.referencia} mono />
                <JegyAdat cimke="Áru" ertek={blokk.aru} />
                <JegyAdat cimke="Jármű" ertek={blokk.jarmuEloiras} />
              </div>
              {pdf && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 w-fit border-[var(--mob-border)]"
                  onClick={() => iratMegnyitasa(pdf.id)}
                  title={pdf.fajlnev ?? undefined}
                >
                  <FileText className="h-4 w-4" />
                  Megbízás PDF
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SoforFuvarNap({ employeeId }: { employeeId: string }) {
  const napISO = budapestNapISO();
  // A „holnap” a következő munkanap: pénteken és szombaton a hétfő, hogy a
  // sofőr a hétvégén is lássa, mivel indul (2026-09-26, mint az /m/holnap).
  const holnapISO = kovetkezoMunkanapISO(napISO);
  const holnapCimke = holnapISO === kovetkezoNapISO(napISO) ? "Holnap" : "Hétfő";
  const [nap, setNap] = useState<SoforNap | null>(null);
  const [holnap, setHolnap] = useState<SoforNap | null>(null);
  // Melyik napra van betöltött adat — ebből SZÁMOLJUK a "betöltés" állapotot,
  // nem külön setState-tel az effektben (react-hooks/set-state-in-effect).
  const [betoltottNap, setBetoltottNap] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [haladas, setHaladas] = useState<{ fuvarId: string; szoveg: string } | null>(null);
  // Csak kliensen olvasható; a lista a betöltés UTÁN jelenik meg, így a
  // szerveres első képpel nem ütközik.
  const [nemKaptam, setNemKaptam] = useState<string[]>(() =>
    typeof window === "undefined" ? [] : papirNemKellOlvas()
  );

  const load = useCallback(async () => {
    const [ma, holnapi] = await Promise.all([
      getSoforNap(employeeId, napISO),
      getSoforNap(employeeId, holnapISO),
    ]);
    setNap(ma);
    setHolnap(holnapi);
    setBetoltottNap(napISO);
  }, [employeeId, napISO, holnapISO]);

  // A lekérés async függvényben, await UTÁN állít state-et — így az effekt
  // teste nem hív setState-et szinkronban (react-hooks/set-state-in-effect).
  useEffect(() => {
    let ervenyes = true;
    (async () => {
      try {
        const [ma, holnapi] = await Promise.all([
          getSoforNap(employeeId, napISO),
          getSoforNap(employeeId, holnapISO),
        ]);
        if (!ervenyes) return;
        setNap(ma);
        setHolnap(holnapi);
      } catch {
        if (ervenyes) toast.error("Nem sikerült betölteni a fuvarokat.");
      } finally {
        if (ervenyes) setBetoltottNap(napISO);
      }
    })();
    return () => {
      ervenyes = false;
    };
  }, [employeeId, napISO, holnapISO]);

  const loading = betoltottNap !== napISO;

  function erkezes(fuvarId: string, megalloIndex: number) {
    startTransition(async () => {
      try {
        await jelolMegerkeztem(fuvarId, megalloIndex);
        await load();
        toast.success("Érkezés rögzítve.");
      } catch {
        toast.error("Nem sikerült rögzíteni.");
      }
    });
  }

  // Az "Indulok" zárja le a megállót: késznek jelöli (ez az a jelölés, amit a
  // GPS lap és a diszpécser idővonala is mutat), és ezzel lépnek át a gombok a
  // következő megállóra. Ha egy korábbi körből maradt nyitott várakozás ezen a
  // megállón, azt is lezárja, hogy ne maradjon félbe.
  function indulok(m: SoforMegalloSor) {
    startTransition(async () => {
      try {
        if (m.varakozasKezdete && !m.varakozasVege) {
          await jelolVarakozast(m.fuvarId, m.megalloIndex, "befejez");
        }
        const { fuvarLezarva } = await markMegalloKesz(m.fuvarId, m.megalloIndex);
        await load();
        toast.success(fuvarLezarva ? "Fuvar lezárva. Fotózd le a papírt." : "Indulás rögzítve.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Nem sikerült rögzíteni.");
      }
    });
  }

  function hely(m: SoforMegalloSor) {
    if (!window.confirm(`A kocsi mostani helyét jegyezzük fel ehhez a címhez?\n\n${m.cim}\n\nCsak akkor koppints Igent, ha a rakodóhelyen állsz.`)) return;
    startTransition(async () => {
      try {
        await rogzitMegalloHelyet(m.fuvarId, m.megalloIndex);
        await load();
        toast.success("Hely rögzítve. Mostantól a rendszer ide várja ezt a címet.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Nem sikerült rögzíteni a helyet.");
      }
    });
  }

  function foto(fuvarId: string, fajlok: File[]) {
    startTransition(async () => {
      const eredmeny = await feltoltOldalakat(fuvarId, fajlok, (kesz, osszes) =>
        setHaladas(osszes > 1 ? { fuvarId, szoveg: `${Math.min(kesz + 1, osszes)}/${osszes}` } : { fuvarId, szoveg: "" })
      );
      setHaladas(null);
      await load().catch(() => undefined);
      const u = feltoltesUzenet(eredmeny);
      if (u.ok) toast.success(u.szoveg);
      else toast.error(u.szoveg);
    });
  }

  function gond(fuvarId: string) {
    const szoveg = window.prompt("Mi a gond? Röviden, a diszpécser ezt kapja meg:");
    if (!szoveg?.trim()) return;
    startTransition(async () => {
      try {
        await jelezGondot(fuvarId, szoveg);
        toast.success("Elküldve a diszpécsernek.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Nem sikerült elküldeni.");
      }
    });
  }

  function papirNemKaptam(fuvarId: string) {
    const uj = [...nemKaptam.filter((id) => id !== fuvarId), fuvarId];
    setNemKaptam(uj);
    papirNemKellIr(uj);
  }

  const blokkok = nap?.fuvarok ?? [];
  // A lerakott, de még papír-fotó nélküli fuvarok — a lista tetején, amíg
  // le nem fotózza (saját fuvarnál: vagy a "Nem kaptam"-ot nem nyomja).
  const papirKeresek = blokkok.filter(
    (b) => papirraVar(b) && !nemKaptam.includes(b.fuvarId)
  );
  // Az aktív megbízás az, amelyikben a soron következő (első nem kész) megálló
  // van; a soron következő megálló kapja a gombokat. Amit befejezett, az
  // eltűnik: a következő megbízás lép a helyére, és utána a rá következő.
  const kovetkezo = nap?.kovetkezo ?? null;
  const aktivIndex = kovetkezo ? blokkok.findIndex((b) => b.fuvarId === kovetkezo.fuvarId) : -1;
  const aktivBlokk = aktivIndex >= 0 ? blokkok[aktivIndex] : null;

  // A képernyőn PONTOSAN KÉT megbízás van: az aktuális és a következő
  // (Budaházi Zoltán, 2026-09-22). A következő elsősorban a mai sorban utána
  // álló fuvar; ha ma nincs több, akkor a holnapi első. Így a sofőr mindig
  // lát egy lépést előre, de sosem kap listát.
  //
  // A holnapi nap a le nem zárt MAI fuvarokat is tartalmazza (átcsúsznak),
  // ezért azokat kiszűrjük — különben ugyanaz a fuvar kétszer szerepelne.
  const maiIdk = new Set(blokkok.map((b) => b.fuvarId));
  const holnapElso = (holnap?.fuvarok ?? []).find((b) => !maiIdk.has(b.fuvarId)) ?? null;
  const maiKovetkezo = aktivIndex >= 0 ? blokkok[aktivIndex + 1] ?? null : null;
  const kovetkezoBlokk = maiKovetkezo ?? holnapElso;
  const kovetkezoCimke = maiKovetkezo ? "Ezután következik" : holnapCimke;

  if (loading && !nap) {
    return <p className="text-sm text-[var(--mob-muted)]">Betöltés…</p>;
  }
  if (!nap) {
    return (
      <p className="text-sm text-[var(--mob-muted)]">
        Nincs hozzád rendelt jármű. Szólj az adminisztrátornak.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {nap.hiba && (
        <span className="flex items-center gap-1 text-xs text-[var(--mob-negative)]">
          <AlertTriangle className="h-3.5 w-3.5" />
          {nap.hiba}
        </span>
      )}

      {papirKeresek.map((b) => (
        <PapirKeres
          key={b.fuvarId}
          blokk={b}
          pending={pending}
          haladas={haladas?.fuvarId === b.fuvarId ? haladas.szoveg || "" : null}
          onFoto={foto}
          onKesz={papirNemKaptam}
        />
      ))}

      {blokkok.length === 0 ? (
        <p className="text-sm text-[var(--mob-muted)]">Mára nincs fuvarod.</p>
      ) : !aktivBlokk ? (
        <p className="rounded-xl border border-[var(--mob-border)] bg-[var(--mob-card)] px-3 py-4 text-sm text-[var(--mob-muted)]">
          Mára végeztél — minden megállót lezártál.
        </p>
      ) : (
        <>
          <AktualisMegbizas
            blokk={aktivBlokk}
            aktivMegalloIndex={kovetkezo?.megalloIndex ?? null}
            pending={pending}
            onErkezes={erkezes}
            onIndulok={indulok}
            onHely={hely}
            onFoto={foto}
            onGond={gond}
          />
        </>
      )}

      {kovetkezoBlokk && <MegbizasElonezet blokk={kovetkezoBlokk} cimke={kovetkezoCimke} />}
    </div>
  );
}
