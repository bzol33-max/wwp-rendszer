"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarPlus, Check, Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createSzabadsagIgeny, visszavonSzabadsagIgeny } from "@/lib/jelenlet/actions";
import { munkanapok, type SzabadsagIgeny } from "@/lib/jelenlet/shared";

const HO_ROVID = ["jan", "febr", "márc", "ápr", "máj", "jún", "júl", "aug", "szept", "okt", "nov", "dec"];

function datumCimke(iso: string): string {
  const [, ho, nap] = iso.split("-").map(Number);
  return `${HO_ROVID[ho - 1]}. ${nap}.`;
}

function szakaszCimke(tol: string, ig: string): string {
  return tol === ig ? datumCimke(tol) : `${datumCimke(tol)} – ${datumCimke(ig)}`;
}

function AllapotJel({ igeny }: { igeny: SzabadsagIgeny }) {
  const stilus =
    igeny.allapot === "jovahagyva"
      ? "bg-[var(--mob-positive)] text-white"
      : igeny.allapot === "kert"
        ? "border border-[var(--mob-border)] bg-[var(--mob-tile)] text-[var(--mob-muted)]"
        : "bg-[var(--mob-negative)] text-white";
  const szoveg =
    igeny.allapot === "jovahagyva"
      ? "Jóváhagyva"
      : igeny.allapot === "kert"
        ? "Elbírálás alatt"
        : igeny.allapot === "elutasitva"
          ? "Elutasítva"
          : "Visszavonva";
  const Ikon = igeny.allapot === "jovahagyva" ? Check : igeny.allapot === "kert" ? Clock : X;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
        stilus
      )}
    >
      <Ikon className="size-2.5" strokeWidth={3} />
      {szoveg}
    </span>
  );
}

/**
 * A dolgozó beírja a telefonján, mikor szeretne szabadságra menni. A kért nap
 * NEM fogyasztja a keretet, csak a jóváhagyás után — ezért a kártya külön
 * mutatja a kivehető napokat és azt, ami épp elbírálás alatt van.
 *
 * Az űrlap zárva indul, egy gomb nyitja: a Profil többi része (kivehető
 * szabadság, előlegek) így nem csúszik le a képernyőről.
 */
export function SzabadsagKeres({
  employeeId,
  igenyek,
  onReload,
}: {
  employeeId: string;
  igenyek: SzabadsagIgeny[];
  onReload: () => Promise<void>;
}) {
  const [nyitva, setNyitva] = useState(false);
  const [tol, setTol] = useState("");
  const [ig, setIg] = useState("");
  const [megjegyzes, setMegjegyzes] = useState("");
  const [pending, startTransition] = useTransition();

  const napok = tol && ig ? munkanapok(tol, ig).length : 0;
  // A lezárt (elutasított, visszavont) kéréseket nem visszük a végtelenbe:
  // a nyitottak és a jóváhagyottak mellett az utolsó néhány lezárt elég.
  const lathato = [
    ...igenyek.filter((i) => i.allapot === "kert" || i.allapot === "jovahagyva"),
    ...igenyek.filter((i) => i.allapot === "elutasitva" || i.allapot === "visszavonva").slice(0, 3),
  ];

  function bekuld() {
    startTransition(async () => {
      try {
        await createSzabadsagIgeny({ employeeId, tol, ig, megjegyzes: megjegyzes || null });
        setTol("");
        setIg("");
        setMegjegyzes("");
        setNyitva(false);
        await onReload();
        toast.success("Elküldve, jóváhagyásra vár.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nem sikerült elküldeni.");
      }
    });
  }

  function visszavon(igeny: SzabadsagIgeny) {
    if (!window.confirm(`Visszavonod? ${szakaszCimke(igeny.tol, igeny.ig)}`)) return;
    startTransition(async () => {
      try {
        await visszavonSzabadsagIgeny({ igenyId: igeny.id, employeeId });
        await onReload();
        toast.success("Visszavonva.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nem sikerült visszavonni.");
      }
    });
  }

  return (
    <div className="rounded-xl border border-[var(--mob-border)] bg-[var(--mob-card)] p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Szabadság kérése</p>
        {!nyitva && (
          <Button
            size="sm"
            onClick={() => setNyitva(true)}
            className="bg-[var(--mob-accent)] text-white hover:bg-[var(--mob-accent)]/90"
          >
            <CalendarPlus className="size-3.5" />
            Kérem
          </Button>
        )}
      </div>

      {nyitva && (
        <div className="mt-3 flex flex-col gap-2 border-t border-[var(--mob-border)] pt-3">
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[10px] font-semibold tracking-wide text-[var(--mob-muted)] uppercase">
                Ettől
              </span>
              <Input
                type="date"
                value={tol}
                onChange={(e) => {
                  setTol(e.target.value);
                  // Egy nap a leggyakoribb — a "meddig" magától követi.
                  if (!ig || ig < e.target.value) setIg(e.target.value);
                }}
                className="h-11 border-[var(--mob-border)] bg-[var(--mob-card)]"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[10px] font-semibold tracking-wide text-[var(--mob-muted)] uppercase">
                Eddig
              </span>
              <Input
                type="date"
                value={ig}
                onChange={(e) => setIg(e.target.value)}
                className="h-11 border-[var(--mob-border)] bg-[var(--mob-card)]"
              />
            </label>
          </div>
          <Input
            value={megjegyzes}
            onChange={(e) => setMegjegyzes(e.target.value)}
            placeholder="Megjegyzés (nem kötelező)"
            className="h-11 border-[var(--mob-border)] bg-[var(--mob-card)]"
          />
          <p className="text-[11px] text-[var(--mob-muted)]">
            {tol && ig
              ? napok === 0
                ? "A megadott napokra csak hétvége vagy ünnep esik — abból nem fogy szabadság."
                : `${napok} munkanap. A hétvége és az ünnep nem számol bele.`
              : "A hétvége és az ünnep nem számol bele."}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 border-[var(--mob-border)]"
              onClick={() => {
                setNyitva(false);
                setTol("");
                setIg("");
                setMegjegyzes("");
              }}
            >
              Mégse
            </Button>
            <Button
              className="flex-1 bg-[var(--mob-accent)] text-white hover:bg-[var(--mob-accent)]/90"
              disabled={pending || !tol || !ig || napok === 0}
              onClick={bekuld}
            >
              {pending ? "Küldés…" : "Elküldöm"}
            </Button>
          </div>
        </div>
      )}

      {lathato.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5 border-t border-[var(--mob-border)] pt-3">
          {lathato.map((i) => (
            <div key={i.id} className="rounded-lg bg-[var(--mob-tile)] px-2.5 py-2">
              <div className="flex items-center gap-2">
                <span className="flex-1 text-xs font-semibold">
                  {szakaszCimke(i.tol, i.ig)}
                  <span className="font-normal text-[var(--mob-muted)]">
                    {" "}
                    · {munkanapok(i.tol, i.ig).length} nap
                    {i.tipus === "beteg" && " · betegszabadság"}
                  </span>
                </span>
                <AllapotJel igeny={i} />
              </div>
              {i.allapot === "elutasitva" && i.dontes_oka && (
                <p className="mt-0.5 text-[11px] text-[var(--mob-negative)]">{i.dontes_oka}</p>
              )}
              {i.allapot === "kert" && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => visszavon(i)}
                  className="mt-0.5 text-[11px] font-semibold text-[var(--mob-muted)] underline disabled:opacity-50"
                >
                  Visszavonom
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
