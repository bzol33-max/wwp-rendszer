"use client";

// A sofőr napi fuvar-nézete a dolgozói mobilon (/erkezes → Fuvarok).
//
// Budaházi Zoltán 2026-09-22-i kérése szerint ez a nézet SZÁNDÉKOSAN kopár:
// két csempe, semmi több. Az aktuális megbízás csempéjén a felrakó és a
// lerakó együtt, alatta a következő megbízás egy soros előnézete.
//
// Ami KIKERÜLT és nem véletlenül hiányzik: időpont és időablak, Út ID /
// pozíciószám, áru és súly, a napváltó nyilak, a három napos előnézet. Ezek a
// diszpécsernek kellenek, nem a sofőrnek — ő vezet, és két dolgot akar tudni:
// hova menjen, és mit kell ott megnyomnia.
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  feltoltFuvarlevelFoto,
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
import { budapestNapISO } from "@/lib/fuvarozas/idozona";

const IDO_OPCIOK: Intl.DateTimeFormatOptions = {
  timeZone: "Europe/Budapest",
  hour: "2-digit",
  minute: "2-digit",
};

function formatIdo(d: Date): string {
  return new Date(d).toLocaleTimeString("hu-HU", IDO_OPCIOK);
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
 * Egy megálló az aktuális megbízás csempéjén. A gombokat CSAK az `aktiv`
 * megálló kapja meg — a többi csak azt mutatja, hova kell majd menni, illetve
 * hogy már megvolt.
 */
function MegalloSor({
  m,
  aktiv,
  pending,
  onErkezes,
  onIndulok,
  onHely,
}: {
  m: SoforMegalloSor;
  aktiv: boolean;
  pending: boolean;
  onErkezes: () => void;
  onIndulok: () => void;
  onHely: () => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 border-t border-[var(--mob-border)] px-3 py-3 first:border-t-0",
        aktiv && "bg-[var(--mob-tile)]/50"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--mob-muted)]">
            {TIPUS_CIMKE[m.tipus]}
          </span>
          <span className={cn("font-bold leading-tight", aktiv ? "text-xl" : "text-base")}>{m.varos}</span>
          <span className="text-xs text-[var(--mob-muted)]">{m.cim}</span>
        </div>
        {m.kesz && (
          <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-[var(--mob-positive)]">
            <Check className="h-4 w-4" />
            Kész
          </span>
        )}
      </div>

      {aktiv && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 border-[var(--mob-border)]"
              onClick={() => window.open(navigacioUrl(m.cim), "_blank", "noopener,noreferrer")}
            >
              <Navigation className="h-4 w-4" />
              Navigáció
            </Button>
            <HelyGomb m={m} pending={pending} onHely={onHely} />
          </div>
          <LepesGombok m={m} pending={pending} onErkezes={onErkezes} onIndulok={onIndulok} />
        </>
      )}
    </div>
  );
}

/** Egy címke–érték sor a megbízás részletei közt. Üres értéknél nem jelenik meg. */
function AdatSor({ cimke, ertek }: { cimke: string; ertek: string | null | undefined }) {
  if (!ertek?.trim()) return null;
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2 text-xs">
      <span className="font-semibold uppercase tracking-wide text-[var(--mob-muted)]">{cimke}</span>
      <span>{ertek}</span>
    </div>
  );
}

/**
 * Az AKTUÁLIS megbízás csempéje: a megbízó neve, alatta a fuvar megállói
 * (felrakó és lerakó egy csempében), a gombokkal a soron következőn.
 *
 * A megbízás papíradatai — kapcsolattartó, iratok, fuvarlevél fotó, gond
 * jelzése — egy alapból CSUKOTT "Részletek" sor mögött vannak: a nap 95%-ában
 * nincs rájuk szükség, de amikor kell, ne kelljen telefonálni értük.
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
  onFoto: (fuvarId: string, fajl: File) => void;
  onGond: (fuvarId: string) => void;
}) {
  const fotoInput = useRef<HTMLInputElement>(null);
  const [reszletekNyitva, setReszletekNyitva] = useState(false);

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border-2 border-[var(--mob-accent)] bg-[var(--mob-card)]">
      <div className="flex items-center justify-between gap-2 px-3 pb-1 pt-2.5">
        <span className="truncate text-sm font-semibold">{blokk.megrendelo ?? "Megbízás"}</span>
        {blokk.masRendszam && (
          <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-[var(--mob-negative)]">
            <AlertTriangle className="h-3.5 w-3.5" />
            {blokk.masRendszam}
          </span>
        )}
      </div>

      {blokk.megallok.map((m) => (
        <MegalloSor
          key={m.megalloIndex}
          m={m}
          aktiv={m.megalloIndex === aktivMegalloIndex}
          pending={pending}
          onErkezes={() => onErkezes(m.fuvarId, m.megalloIndex)}
          onIndulok={() => onIndulok(m)}
          onHely={() => onHely(m)}
        />
      ))}

      <button
        type="button"
        onClick={() => setReszletekNyitva((v) => !v)}
        className="flex items-center justify-between gap-2 border-t border-[var(--mob-border)] px-3 py-2.5 text-left text-xs font-medium text-[var(--mob-muted)]"
      >
        Részletek
        <ChevronDown className={cn("h-4 w-4 transition-transform", reszletekNyitva && "rotate-180")} />
      </button>

      {reszletekNyitva && (
        <div className="flex flex-col gap-2 border-t border-[var(--mob-border)] px-3 py-3">
          <AdatSor cimke="Megbízó" ertek={blokk.megrendelo} />
          <AdatSor cimke="Megjegyzés" ertek={blokk.megjegyzes} />
          {blokk.kapcsolat && (
            <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2 text-xs">
              <span className="font-semibold uppercase tracking-wide text-[var(--mob-muted)]">Telefon</span>
              <a
                href={`tel:${blokk.kapcsolat.telefon.replace(/\s+/g, "")}`}
                className="flex items-center gap-1.5 font-semibold text-[var(--mob-positive)]"
              >
                <Phone className="h-3.5 w-3.5 shrink-0" />
                {[blokk.kapcsolat.nev, blokk.kapcsolat.telefon].filter(Boolean).join(" · ")}
              </a>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
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
            {blokk.dokumentumok.map((d) => (
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
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A KÖVETKEZŐ megbízás csempéje — csak annyi, hogy a sofőr tudja, mi jön:
 * ki a megbízó, és honnan hová. Gomb nincs rajta, mert amíg az aktuálisat be
 * nem fejezte, nincs rajta dolga. Amint az aktuális elkészül, ez lép a
 * helyére teljes csempeként, és ide a rá következő kerül.
 */
function KovetkezoMegbizas({ blokk }: { blokk: SoforFuvarBlokk }) {
  const honnan = blokk.megallok.find((m) => m.tipus === "felrako")?.varos;
  const hova = [...blokk.megallok].reverse().find((m) => m.tipus === "lerako")?.varos;
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-dashed border-[var(--mob-border)] bg-[var(--mob-card)]/60 px-3 py-3">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--mob-muted)]">
        Ezután következik
      </span>
      <span className="truncate text-sm font-semibold">{blokk.megrendelo ?? "Megbízás"}</span>
      {honnan && hova && (
        <span className="text-base">
          {honnan} → {hova}
        </span>
      )}
    </div>
  );
}

export function SoforFuvarNap({ employeeId }: { employeeId: string }) {
  const napISO = budapestNapISO();
  const [nap, setNap] = useState<SoforNap | null>(null);
  // Melyik napra van betöltött adat — ebből SZÁMOLJUK a "betöltés" állapotot,
  // nem külön setState-tel az effektben (react-hooks/set-state-in-effect).
  const [betoltottNap, setBetoltottNap] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const eredmeny = await getSoforNap(employeeId, napISO);
    setNap(eredmeny);
    setBetoltottNap(napISO);
  }, [employeeId, napISO]);

  // A lekérés async függvényben, await UTÁN állít state-et — így az effekt
  // teste nem hív setState-et szinkronban (react-hooks/set-state-in-effect).
  useEffect(() => {
    let ervenyes = true;
    (async () => {
      try {
        const eredmeny = await getSoforNap(employeeId, napISO);
        if (!ervenyes) return;
        setNap(eredmeny);
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
        await markMegalloKesz(m.fuvarId, m.megalloIndex);
        await load();
        toast.success("Indulás rögzítve.");
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

  const blokkok = nap?.fuvarok ?? [];
  // Az aktív megbízás az, amelyikben a soron következő (első nem kész) megálló
  // van; a soron következő megálló kapja a gombokat. Amit befejezett, az
  // eltűnik: a következő megbízás lép a helyére, és utána a rá következő.
  const kovetkezo = nap?.kovetkezo ?? null;
  const aktivIndex = kovetkezo ? blokkok.findIndex((b) => b.fuvarId === kovetkezo.fuvarId) : -1;
  const aktivBlokk = aktivIndex >= 0 ? blokkok[aktivIndex] : null;
  const kovetkezoBlokk = aktivIndex >= 0 ? blokkok[aktivIndex + 1] ?? null : null;

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
          {kovetkezoBlokk && <KovetkezoMegbizas blokk={kovetkezoBlokk} />}
        </>
      )}
    </div>
  );
}
