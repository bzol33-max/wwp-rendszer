"use client";

// A sofőr napi fuvar-nézete a dolgozói mobilon (/erkezes → Fuvarok).
//
// A sorrend és a kész/nem kész állapot a GPS lap idővonalából jön (lásd
// lib/fuvarozas/sofor.ts getSoforNap) — a sofőr ugyanazt látja, mint a
// diszpécser. A nézet fuvaronkénti blokkokra tagol: a Duvenbeck ingázó
// körein ugyanaz a telephely az egyik fuvar lerakója és a következő
// felrakója, sima megálló-listában ez "fel-le-le-le" káosznak látszik.
//
// Pénz (fuvardíj, költség, számla) szándékosan nem jelenik meg itt.

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, Camera, Check, ChevronLeft, ChevronRight, Clock, Copy, FileText, Hash, LocateFixed, MapPin, MessageSquareWarning, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  feltoltFuvarlevelFoto,
  getSoforNap,
  jelezGondot,
  jelolMegerkeztem,
  markMegalloKesz,
  rogzitMegalloHelyet,
  rogzitPozicioszamot,
  type SoforFuvarBlokk,
  type SoforMegalloSor,
  type SoforNap,
} from "@/lib/fuvarozas/sofor";
import { getKovetkezoNapokElonezet, type KovetkezoNap } from "@/lib/fuvarozas/actions";
import { budapestNapISO } from "@/lib/fuvarozas/idozona";

const IDO_OPCIOK: Intl.DateTimeFormatOptions = {
  timeZone: "Europe/Budapest",
  hour: "2-digit",
  minute: "2-digit",
};

function formatIdo(d: Date): string {
  return new Date(d).toLocaleTimeString("hu-HU", IDO_OPCIOK);
}

function formatNap(napISO: string): string {
  const [ev, ho, nap] = napISO.split("-").map(Number);
  return new Date(Date.UTC(ev, ho - 1, nap, 12)).toLocaleDateString("hu-HU", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    weekday: "short",
  });
}

function napEltolva(napISO: string, delta: number): string {
  const [ev, ho, nap] = napISO.split("-").map(Number);
  const d = new Date(Date.UTC(ev, ho - 1, nap + delta, 12));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** "tegnap 07:10" / "holnap 08:00" — egy többnapos fuvar átcsúszó pontjához. */
function formatIdoNappal(d: Date, napElteres: number): string {
  const ido = formatIdo(d);
  if (napElteres === 0) return ido;
  if (napElteres === -1) return `tegnap ${ido}`;
  if (napElteres === 1) return `holnap ${ido}`;
  return `${napElteres > 0 ? "+" : ""}${napElteres} nap ${ido}`;
}

const TIPUS_CIMKE = { felrako: "Felrakó", lerako: "Lerakó" } as const;

const DOK_CIMKE: Record<string, string> = {
  megbizas: "Megbízás",
  rakomanylista: "Rakománylista",
  fuvarlevel: "Fuvarlevél fotó",
  egyeb: "Irat",
};

/** A feltöltött kép leghosszabb oldala pixelben — a telefon 4000 px-es, 5-8 MB-os fotója így ~300-600 KB lesz. */
const FOTO_MAX_OLDAL_PX = 1600;
const FOTO_JPEG_MINOSEG = 0.82;

/**
 * A fotó kicsinyítése a telefonon, feltöltés előtt. Mobilnetről egy 8 MB-os
 * kép lassú és a szerver-akció korlátjába is beleütközne; egy fuvarlevél
 * 1600 px-en tökéletesen olvasható. Ha a böngésző nem tudja (nincs canvas),
 * az eredeti megy.
 */
async function kicsinyitFotot(fajl: File): Promise<Blob> {
  try {
    const kep = await createImageBitmap(fajl);
    const arany = Math.min(1, FOTO_MAX_OLDAL_PX / Math.max(kep.width, kep.height));
    if (arany === 1 && fajl.size < 1_500_000) return fajl;
    const vaszon = document.createElement("canvas");
    vaszon.width = Math.round(kep.width * arany);
    vaszon.height = Math.round(kep.height * arany);
    const ctx = vaszon.getContext("2d");
    if (!ctx) return fajl;
    ctx.drawImage(kep, 0, 0, vaszon.width, vaszon.height);
    const blob = await new Promise<Blob | null>((ok) => vaszon.toBlob(ok, "image/jpeg", FOTO_JPEG_MINOSEG));
    return blob ?? fajl;
  } catch {
    return fajl;
  }
}

/**
 * Az időablak állapota. A Duvenbeck-megbízásokon ez óra:perc pontos, és ez a
 * VALÓDI határidő — a dátum csak a nap. Ezért kap saját, színes jelzést.
 */
function ablakAllapot(m: SoforMegalloSor, most: number): "lejart" | "most" | "jovo" | null {
  if (m.kesz) return null;
  if (!m.ablakIg && !m.ablakTol) return null;
  if (m.ablakIg && most > new Date(m.ablakIg).getTime()) return "lejart";
  if (m.ablakTol && most < new Date(m.ablakTol).getTime()) return "jovo";
  return "most";
}

function AblakSor({ m, most }: { m: SoforMegalloSor; most: number }) {
  if (!m.ablakTol && !m.ablakIg) return null;
  const allapot = ablakAllapot(m, most);
  const szoveg = [m.ablakTol ? formatIdo(m.ablakTol) : "?", m.ablakIg ? formatIdo(m.ablakIg) : "?"].join("–");
  return (
    <span
      className={cn(
        "flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        allapot === "lejart" && "bg-[var(--mob-negative)]/15 text-[var(--mob-negative)]",
        allapot === "most" && "bg-[var(--mob-accent)]/15 text-[var(--mob-positive)]",
        (allapot === "jovo" || allapot === null) && "bg-[var(--mob-tile)] text-[var(--mob-muted)]"
      )}
      title="A megbízásban megadott időablak"
    >
      <Clock className="h-3.5 w-3.5" />
      {szoveg}
      {allapot === "lejart" && " · lejárt"}
    </span>
  );
}

function navigacioUrl(cim: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(cim)}`;
}

/** "Érkezés 08:12" a sofőr Megérkeztem koppintásából. */
function ErkezesJel({ m }: { m: SoforMegalloSor }) {
  if (!m.keziErkezes) return null;
  return (
    <span className="flex items-center gap-1 text-xs text-[var(--mob-muted)]" title="A Megérkeztem koppintás ideje">
      <MapPin className="h-3.5 w-3.5" />
      Érkezés {formatIdo(m.keziErkezes)}
    </span>
  );
}

/**
 * "Rossz a cím? Itt vagyok." — ha a cím geokódolása bizonytalan, a GPS-
 * felismerés nem tud ide érkezést jelölni. A sofőr a rakodóhelyen állva egy
 * koppintással a kocsi pozícióját rögzíti a cím valódi helyeként; onnantól
 * minden ugyanide szóló fuvar magától felismerhető.
 */
function HelyGomb({ m, pending, onHely }: { m: SoforMegalloSor; pending: boolean; onHely: () => void }) {
  if (m.kesz) return null;
  if (m.helyRogzitve) {
    return (
      <span className="flex items-center gap-1 text-[11px] text-[var(--mob-muted)]" title="Ehhez a címhez a helyszínről rögzített koordináta tartozik">
        <LocateFixed className="h-3.5 w-3.5" />
        Hely rögzítve
      </span>
    );
  }
  if (!m.helyBizonytalan) return null;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onHely}
      className="flex items-center gap-1 rounded-md bg-[var(--mob-negative)]/10 px-2 py-1 text-[11px] font-medium text-[var(--mob-negative)]"
      title="A rendszer nem találja pontosan ezt a címet a térképen. Ha a rakodóhelyen állsz, koppints: a kocsi mostani helyét jegyezzük fel a címhez."
    >
      <LocateFixed className="h-3.5 w-3.5" />
      Bizonytalan cím · itt vagyok
    </button>
  );
}

/** A soron következő megálló nagy kártyán — vezetés közben ez az egyetlen, amit el kell olvasni. */
function KovetkezoKartya({
  m,
  blokk,
  most,
  pending,
  onKesz,
  onErkezes,
  onHely,
}: {
  m: SoforMegalloSor;
  blokk: SoforFuvarBlokk;
  most: number;
  pending: boolean;
  onKesz: () => void;
  onErkezes: () => void;
  onHely: () => void;
}) {
  return (
    <Card className="border-2 border-[var(--mob-accent)] bg-[var(--mob-card)] ring-0">
      <CardContent className="flex flex-col gap-2 pt-4">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-[var(--mob-muted)]">
          <span>Következő · {TIPUS_CIMKE[m.tipus]}</span>
          {!m.becslesElavult && <span>{formatIdoNappal(m.idopont, m.napElteres)}</span>}
        </div>
        <p className="text-xl font-semibold leading-tight">{m.varos}</p>
        <p className="text-sm text-[var(--mob-muted)]">{m.cim}</p>
        <div className="flex flex-wrap items-center gap-2">
          <AblakSor m={m} most={most} />
          <ErkezesJel m={m} />
          <HelyGomb m={m} pending={pending} onHely={onHely} />
        </div>
        {blokk.megrendelo && <p className="text-sm">{blokk.megrendelo}</p>}
        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            className="flex-1 border-[var(--mob-border)]"
            onClick={() => window.open(navigacioUrl(m.cim), "_blank", "noopener,noreferrer")}
          >
            <Navigation className="h-4 w-4" />
            Navigáció
          </Button>
          {!m.keziErkezes && (
            <Button variant="outline" disabled={pending} onClick={onErkezes} className="flex-1 border-[var(--mob-border)]">
              <MapPin className="h-4 w-4" />
              Megérkeztem
            </Button>
          )}
        </div>
        <Button
          disabled={pending}
          onClick={onKesz}
          className="w-full bg-[var(--mob-accent)] text-white hover:bg-[var(--mob-accent)]/90"
        >
          {m.tipus === "felrako" ? "FELRAKVA" : "LERAKVA"}
        </Button>
      </CardContent>
    </Card>
  );
}

function MegalloSor({
  m,
  sorszam,
  kovetkezoE,
  most,
  pending,
  onKesz,
  onErkezes,
  onHely,
}: {
  m: SoforMegalloSor;
  sorszam: string;
  kovetkezoE: boolean;
  most: number;
  pending: boolean;
  onKesz: () => void;
  onErkezes: () => void;
  onHely: () => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 border-t border-[var(--mob-border)] px-3 py-2 first:border-t-0",
        kovetkezoE && "bg-[var(--mob-tile)]/60"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--mob-muted)]">{sorszam}</span>
          <span className="truncate text-sm font-semibold">{m.varos}</span>
          <span className="truncate text-xs text-[var(--mob-muted)]">{m.cim}</span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {!m.becslesElavult && (
            <span className="text-xs tabular-nums text-[var(--mob-muted)]">{formatIdoNappal(m.idopont, m.napElteres)}</span>
          )}
          {m.kesz ? (
            <span
              className="flex items-center gap-1 text-xs font-semibold text-[var(--mob-positive)]"
              title={
                m.keszForras === "kezi"
                  ? `Kézzel jelölve${m.keszBy ? ` — ${m.keszBy}` : ""}`
                  : "A GPS szerint már elhagyta ezt a pontot"
              }
            >
              <Check className="h-3.5 w-3.5" />
              {m.tipus === "felrako" ? "Felrakva" : "Lerakva"}
              {m.keszForras === "gps" && " (GPS)"}
            </span>
          ) : m.eppenItt ? (
            <span className="flex items-center gap-1 text-xs font-semibold text-[var(--mob-accent)]">
              <MapPin className="h-3.5 w-3.5" />
              Itt áll
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <AblakSor m={m} most={most} />
          <ErkezesJel m={m} />
          <HelyGomb m={m} pending={pending} onHely={onHely} />
        </div>
        {!m.kesz && (
          <div className="flex shrink-0 gap-1">
            {!m.keziErkezes && !kovetkezoE && (
              <Button size="sm" variant="outline" disabled={pending} onClick={onErkezes} className="h-9 border-[var(--mob-border)]" title="Megérkeztem">
                <MapPin className="h-4 w-4" />
              </Button>
            )}
            <Button
              size="sm"
              variant={kovetkezoE ? "default" : "outline"}
              disabled={pending}
              onClick={onKesz}
              className={cn(
                "h-9",
                kovetkezoE
                  ? "bg-[var(--mob-accent)] text-white hover:bg-[var(--mob-accent)]/90"
                  : "border-[var(--mob-border)]"
              )}
            >
              {m.tipus === "felrako" ? "Felrakva" : "Lerakva"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Egy fuvar blokkja. A fejlécben a Reise ID (Duvenbeck Út ID) áll kiemelten:
 * a kapuban ezt kérik, és ez a számlázási kulcs is, ezért koppintásra
 * vágólapra másolható.
 */
function FuvarBlokk({
  blokk,
  kovetkezo,
  most,
  pending,
  onKesz,
  onErkezes,
  onHely,
  onFoto,
  onGond,
  onPozicioszam,
}: {
  blokk: SoforFuvarBlokk;
  kovetkezo: { fuvarId: string; megalloIndex: number } | null;
  most: number;
  pending: boolean;
  onKesz: (fuvarId: string, megalloIndex: number) => void;
  onErkezes: (fuvarId: string, megalloIndex: number) => void;
  onHely: (m: SoforMegalloSor) => void;
  onFoto: (fuvarId: string, fajl: File) => void;
  onGond: (fuvarId: string) => void;
  onPozicioszam: (fuvarId: string) => void;
}) {
  const fotoInput = useRef<HTMLInputElement>(null);
  const honnan = blokk.megallok.find((m) => m.tipus === "felrako")?.varos;
  const hova = [...blokk.megallok].reverse().find((m) => m.tipus === "lerako")?.varos;
  const hivatkozas = blokk.reiseId ?? blokk.pozicioszam;
  let lerakoSorszam = 0;

  return (
    <div className="flex flex-col rounded-xl border border-[var(--mob-border)] bg-[var(--mob-card)]">
      <div className="flex flex-col gap-1 px-3 pb-2 pt-3">
        <div className="flex items-start justify-between gap-2">
          <span className="truncate text-sm font-semibold">{blokk.megrendelo ?? "Ismeretlen megbízó"}</span>
          {blokk.csuszo && (
            <span className="shrink-0 rounded-full bg-[var(--mob-tile)] px-2 py-0.5 text-[10px] font-semibold text-[var(--mob-muted)]">
              Korábbról csúszik
            </span>
          )}
        </div>
        {honnan && hova && (
          <span className="text-xs text-[var(--mob-muted)]">
            {honnan} – {hova}
          </span>
        )}
        {!hivatkozas && (
          <button
            type="button"
            disabled={pending}
            onClick={() => onPozicioszam(blokk.fuvarId)}
            className="flex w-fit items-center gap-1.5 rounded-md bg-[var(--mob-negative)]/10 px-2 py-1 text-xs font-medium text-[var(--mob-negative)]"
            title="A megbízásról nem sikerült kiolvasni a pozíciószámot. Ha a kapuban megkapod, írd be — a számlára is ez kerül."
          >
            <Hash className="h-3.5 w-3.5" />
            Nincs pozíciószám · beírom
          </button>
        )}
        {hivatkozas && (
          <button
            type="button"
            onClick={() => {
              navigator.clipboard
                ?.writeText(hivatkozas)
                .then(() => toast.success("Másolva."))
                .catch(() => toast.error("Nem sikerült másolni."));
            }}
            className="flex w-fit items-center gap-1.5 rounded-md bg-[var(--mob-tile)] px-2 py-1 text-sm font-semibold tabular-nums"
            title="Koppints a vágólapra másoláshoz — a kapuban ezt a számot kérik"
          >
            {blokk.reiseId ? "Út ID" : "Poz"} {hivatkozas}
            <Copy className="h-3.5 w-3.5 text-[var(--mob-muted)]" />
          </button>
        )}
        {(blokk.aru || blokk.mennyiseg || blokk.suly) && (
          <span className="text-xs text-[var(--mob-muted)]">
            {[blokk.mennyiseg, blokk.aru, blokk.suly].filter(Boolean).join(" · ")}
          </span>
        )}
        {blokk.megjegyzes && <span className="text-xs text-[var(--mob-muted)]">{blokk.megjegyzes}</span>}
        {blokk.masRendszam && (
          <span className="flex items-center gap-1 text-xs font-medium text-[var(--mob-negative)]">
            <AlertTriangle className="h-3.5 w-3.5" />
            A megbízáson más rendszám áll: {blokk.masRendszam}
          </span>
        )}
      </div>

      <div className="flex flex-col">
        {blokk.megallok.map((m) => {
          if (m.tipus === "lerako") lerakoSorszam++;
          const sorszam =
            m.tipus === "lerako" && blokk.megallok.filter((x) => x.tipus === "lerako").length > 1
              ? `${TIPUS_CIMKE.lerako} ${lerakoSorszam}`
              : TIPUS_CIMKE[m.tipus];
          return (
            <MegalloSor
              key={m.megalloIndex}
              m={m}
              sorszam={sorszam}
              kovetkezoE={kovetkezo?.fuvarId === m.fuvarId && kovetkezo?.megalloIndex === m.megalloIndex}
              most={most}
              pending={pending}
              onKesz={() => onKesz(m.fuvarId, m.megalloIndex)}
              onErkezes={() => onErkezes(m.fuvarId, m.megalloIndex)}
              onHely={() => onHely(m)}
            />
          );
        })}
      </div>

      {/* A Duvenbeckhez KETTŐ irat tartozik: a megbízás (TA…) az utasításokkal
          és az időablakokkal, a rakománylista (FRALI…) a kapuban kért tiszta
          címekkel és referenciákkal. Ezért nem egy "Dokumentum" gomb van. */}
      <div className="flex flex-wrap gap-2 border-t border-[var(--mob-border)] px-3 py-2">
        {/* Fuvarlevél fotó: a lerakásnál lefotózott CMR/fuvarlevél a Drive-ba
            kerül és a fuvarhoz kötődik — a Számla/Posta oldal aznap látja. */}
        <input
          ref={fotoInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const fajl = e.target.files?.[0];
            e.target.value = "";
            if (fajl) onFoto(blokk.fuvarId, fajl);
          }}
        />
        <Button size="sm" variant="outline" disabled={pending} className="h-9 border-[var(--mob-border)]" onClick={() => fotoInput.current?.click()} title="Fuvarlevél / CMR lefotózása">
          <Camera className="h-4 w-4" />
          Fuvarlevél fotó
        </Button>
        <Button size="sm" variant="outline" disabled={pending} className="h-9 border-[var(--mob-border)]" onClick={() => onGond(blokk.fuvarId)} title="Gond van a fuvarral — üzenet a diszpécsernek">
          <MessageSquareWarning className="h-4 w-4" />
          Gond van
        </Button>
        {blokk.dokumentumok.length === 0 ? (
          <span className="self-center text-xs text-[var(--mob-muted)]">Nincs irat a fuvarhoz.</span>
        ) : (
          blokk.dokumentumok.map((d) => (
            <Button
              key={d.id}
              size="sm"
              variant="outline"
              className="h-9 border-[var(--mob-border)]"
              onClick={() => window.open(`/api/fuvarozas/dokumentum/${d.id}`, "_blank", "noopener,noreferrer")}
              title={d.fajlnev ?? undefined}
            >
              <FileText className="h-4 w-4" />
              {DOK_CIMKE[d.tipus ?? "egyeb"] ?? "Irat"}
              {d.verzio !== null && ` v${d.verzio}`}
            </Button>
          ))
        )}
      </div>
    </div>
  );
}

function KovetkezoNapokDoboz({ napok }: { napok: KovetkezoNap[] }) {
  const nemUresek = napok.filter((n) => n.megallok.length > 0);
  if (nemUresek.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[var(--mob-border)] bg-[var(--mob-card)] p-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--mob-muted)]">Következő napok</span>
      {nemUresek.map((n) => (
        <div key={n.napISO} className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold">{formatNap(n.napISO)}</span>
          {n.megallok.map((m, i) => (
            <div key={i} className="flex items-center gap-2 pl-2 text-xs">
              <span className="w-7 shrink-0 text-[var(--mob-muted)]">{m.tipus === "felrako" ? "Fel" : "Le"}</span>
              <span className="truncate">{m.cim}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function SoforFuvarNap({ employeeId }: { employeeId: string }) {
  const maiNapISO = budapestNapISO();
  const [napISO, setNapISO] = useState(maiNapISO);
  const [nap, setNap] = useState<SoforNap | null>(null);
  const [kovetkezoNapok, setKovetkezoNapok] = useState<KovetkezoNap[]>([]);
  // Melyik napra van betöltött adat — ebből SZÁMOLJUK a "betöltés" állapotot,
  // nem külön setState-tel az effektben (react-hooks/set-state-in-effect).
  const [betoltottNap, setBetoltottNap] = useState<string | null>(null);
  // A betöltés pillanata — az időablak állapotát ehhez mérjük, hogy a
  // renderben ne kelljen Date.now()-t hívni (react-hooks/purity).
  const [most, setMost] = useState(() => Date.now());
  const [pending, startTransition] = useTransition();
  const maiNap = napISO === maiNapISO;

  const load = useCallback(async () => {
    const eredmeny = await getSoforNap(employeeId, napISO);
    setNap(eredmeny);
    setMost(Date.now());
    setBetoltottNap(napISO);
  }, [employeeId, napISO]);

  // A lekérés async függvényben, await UTÁN állít state-et — így az effekt
  // teste nem hív setState-et szinkronban (react-hooks/set-state-in-effect).
  // Az `ervenyes` zászló a napváltáskor elszálló, régi válaszokat dobja el.
  useEffect(() => {
    let ervenyes = true;
    (async () => {
      try {
        const eredmeny = await getSoforNap(employeeId, napISO);
        if (!ervenyes) return;
        setNap(eredmeny);
        setMost(Date.now());
      } catch {
        if (ervenyes) toast.error("Nem sikerült betölteni a fuvarokat.");
      } finally {
        if (ervenyes) setBetoltottNap(napISO);
      }
    })();
    return () => {
      ervenyes = false;
    };
  }, [employeeId, napISO]);

  const loading = betoltottNap !== napISO;

  useEffect(() => {
    getKovetkezoNapokElonezet(3)
      .then((terkep) => {
        setKovetkezoNapok(nap?.sofor ? (terkep[nap.sofor] ?? []) : []);
      })
      .catch(() => setKovetkezoNapok([]));
  }, [nap?.sofor]);

  function kesz(fuvarId: string, megalloIndex: number) {
    startTransition(async () => {
      try {
        await markMegalloKesz(fuvarId, megalloIndex);
        await load();
        toast.success("Rögzítve.");
      } catch {
        toast.error("Nem sikerült rögzíteni.");
      }
    });
  }

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

  function foto(fuvarId: string, fajl: File) {
    startTransition(async () => {
      try {
        const kicsi = await kicsinyitFotot(fajl);
        const form = new FormData();
        form.append("foto", kicsi, "fuvarlevel.jpg");
        await feltoltFuvarlevelFoto(fuvarId, form);
        await load();
        toast.success("Fuvarlevél feltöltve.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Nem sikerült feltölteni a fotót.");
      }
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

  function pozicioszam(fuvarId: string) {
    const szam = window.prompt("Pozíciószám / hivatkozási szám, ahogy a kapuban kaptad:");
    if (!szam?.trim()) return;
    startTransition(async () => {
      try {
        await rogzitPozicioszamot(fuvarId, szam);
        await load();
        toast.success("Pozíciószám rögzítve.");
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

  const blokkok = nap?.fuvarok ?? [];
  const kovetkezoHivatkozas = nap?.kovetkezo ?? null;
  const kovetkezoBlokk = kovetkezoHivatkozas
    ? blokkok.find((b) => b.fuvarId === kovetkezoHivatkozas.fuvarId)
    : undefined;
  const kovetkezoMegallo = kovetkezoBlokk?.megallok.find((m) => m.megalloIndex === kovetkezoHivatkozas?.megalloIndex);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-sm font-semibold">
            {formatNap(napISO)}
            {maiNap && " · ma"}
          </span>
          {nap && <span className="text-xs text-[var(--mob-muted)]">{nap.jarmuLabel}</span>}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="outline"
            className="border-[var(--mob-border)]"
            title="Előző nap"
            onClick={() => setNapISO((n) => napEltolva(n, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            size="icon-sm"
            variant="outline"
            className="border-[var(--mob-border)]"
            title="Következő nap"
            disabled={maiNap}
            onClick={() => setNapISO((n) => napEltolva(n, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading && !nap ? (
        <p className="text-sm text-[var(--mob-muted)]">Betöltés…</p>
      ) : !nap ? (
        <p className="text-sm text-[var(--mob-muted)]">
          Nincs hozzád rendelt jármű. Szólj az adminisztrátornak.
        </p>
      ) : (
        <>
          {nap.hiba && (
            <span className="flex items-center gap-1 text-xs text-[var(--mob-negative)]">
              <AlertTriangle className="h-3.5 w-3.5" />
              {nap.hiba}
            </span>
          )}

          {blokkok.length === 0 ? (
            <p className="text-sm text-[var(--mob-muted)]">Erre a napra nincs fuvarod.</p>
          ) : (
            <>
              {maiNap && kovetkezoMegallo && kovetkezoBlokk && (
                <KovetkezoKartya
                  m={kovetkezoMegallo}
                  blokk={kovetkezoBlokk}
                  most={most}
                  pending={pending}
                  onKesz={() => kesz(kovetkezoMegallo.fuvarId, kovetkezoMegallo.megalloIndex)}
                  onErkezes={() => erkezes(kovetkezoMegallo.fuvarId, kovetkezoMegallo.megalloIndex)}
                  onHely={() => hely(kovetkezoMegallo)}
                />
              )}
              {blokkok.map((b) => (
                <FuvarBlokk
                  key={b.fuvarId}
                  blokk={b}
                  kovetkezo={kovetkezoHivatkozas}
                  most={most}
                  pending={pending}
                  onKesz={kesz}
                  onErkezes={erkezes}
                  onHely={hely}
                  onFoto={foto}
                  onGond={gond}
                  onPozicioszam={pozicioszam}
                />
              ))}
            </>
          )}

          {maiNap && <KovetkezoNapokDoboz napok={kovetkezoNapok} />}
        </>
      )}
    </div>
  );
}
