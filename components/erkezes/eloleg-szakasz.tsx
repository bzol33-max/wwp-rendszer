"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HU_MONTHS, elolegBontas, ft, type ElolegTetel } from "@/lib/dolgozok/shared";

const HO_ROVID = [
  "jan", "febr", "márc", "ápr", "máj", "jún",
  "júl", "aug", "szept", "okt", "nov", "dec",
] as const;

function napCimke(iso: string): string {
  const [, ho, nap] = iso.split("-").map(Number);
  return `${HO_ROVID[ho - 1]}. ${nap}.`;
}

/** Egy tétel a kinyitott hónap alatt: dátum, megjegyzés, összeg. */
function TetelSor({ tetel }: { tetel: ElolegTetel }) {
  const negativ = tetel.amount < 0;
  return (
    <div className="grid grid-cols-[52px_1fr_auto] items-baseline gap-2 border-t border-dotted border-[var(--mob-border)] bg-[var(--mob-card)] py-1.5 pr-3 pl-5 text-[11.5px]">
      <span className="text-[10.5px] text-[var(--mob-muted)]">{napCimke(tetel.date)}</span>
      <span className="truncate text-[var(--mob-muted)]">
        {tetel.note ?? (negativ ? "visszafizetés" : "előleg")}
        {!tetel.acceptedAt && (
          <b className="ml-1 rounded bg-[var(--mob-tile)] px-1 text-[9px] font-bold text-[var(--mob-negative)]">
            elfogadásra vár
          </b>
        )}
      </span>
      <span
        className={cn(
          "text-right font-bold tabular-nums",
          negativ && "text-[var(--mob-negative)]"
        )}
      >
        {ft(tetel.amount)}
      </span>
    </div>
  );
}

/**
 * Az előleg szakasz a dolgozói Profil oldalon. Felül az össz tartozás, utána
 * a még el nem fogadott tételek (azokért nem kell semmit kinyitni), majd a
 * "Részletek" — alapból ÖSSZECSUKVA, Budaházi Zoltán kérése (2026-10-04).
 *
 * A részletekben év → hónap bontás: hónaponként a felvett (+) és a
 * visszafizetett (−) összeg, jobbra a hónap VÉGI tartozás teljes összeggel.
 * A hónapra koppintva nyílnak ki a tételei, így a visszakövetés megmarad.
 * Az idei év nyitva indul, a korábbiak csukva.
 */
export function ElolegSzakasz({
  osszesen,
  tetelek,
  pending,
  onAccept,
}: {
  osszesen: number;
  tetelek: ElolegTetel[];
  pending: boolean;
  onAccept: (id: string, osszeg: number) => void;
}) {
  const [reszletek, setReszletek] = useState(false);
  const evek = elolegBontas(tetelek);
  const [nyitottEv, setNyitottEv] = useState<number | null>(evek[0]?.ev ?? null);
  const [nyitottHonap, setNyitottHonap] = useState<string | null>(null);
  const varakozo = tetelek.filter((t) => !t.acceptedAt);

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--mob-border)] bg-[var(--mob-card)]">
      <div className="bg-[var(--mob-text)] px-3 py-3 text-[var(--mob-bg)]">
        <p className="text-[10.5px] opacity-70">Összes el nem számolt előleg</p>
        <p className="text-[25px] leading-tight font-extrabold text-[var(--mob-accent)]">
          {ft(osszesen)}
        </p>
      </div>

      {varakozo.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-2 border-t border-[var(--mob-border)] px-3 py-2"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <b className="text-[13px]">{ft(t.amount)}</b>
            <i className="truncate text-[10.5px] not-italic text-[var(--mob-muted)]">
              {napCimke(t.date)}
              {t.note ? ` · ${t.note}` : ""}
            </i>
          </span>
          <Button
            size="sm"
            disabled={pending}
            onClick={() => onAccept(t.id, t.amount)}
            className="shrink-0 bg-[var(--mob-accent)] text-white hover:bg-[var(--mob-accent)]/90"
          >
            ELFOGADOM
          </Button>
        </div>
      ))}

      {tetelek.length === 0 ? (
        <p className="border-t border-[var(--mob-border)] px-3 py-3 text-xs text-[var(--mob-muted)]">
          Nincs rögzített előleged.
        </p>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setReszletek((v) => !v)}
            className="flex w-full items-center gap-1.5 border-t border-[var(--mob-border)] px-3 py-2.5 text-left"
          >
            {reszletek ? (
              <ChevronDown className="size-3.5 text-[var(--mob-muted)]" />
            ) : (
              <ChevronRight className="size-3.5 text-[var(--mob-muted)]" />
            )}
            <span className="flex-1 text-[11px] font-bold tracking-wide text-[var(--mob-muted)] uppercase">
              Részletek
            </span>
            <span className="text-[10.5px] text-[var(--mob-muted)]">{tetelek.length} tétel</span>
          </button>

          {reszletek &&
            evek.map((ev) => {
              const evNyitva = nyitottEv === ev.ev;
              return (
                <div key={ev.ev}>
                  <button
                    type="button"
                    onClick={() => setNyitottEv(evNyitva ? null : ev.ev)}
                    className="flex w-full items-center gap-2 border-t border-[var(--mob-border)] bg-[var(--mob-tile)]/55 px-3 py-2 text-left text-xs"
                  >
                    {evNyitva ? (
                      <ChevronDown className="size-3 text-[var(--mob-muted)]" />
                    ) : (
                      <ChevronRight className="size-3 text-[var(--mob-muted)]" />
                    )}
                    <span className="flex-1 font-extrabold">{ev.ev}</span>
                    {ev.felvett > 0 && (
                      <span className="text-[11.5px] font-bold text-[var(--mob-positive)]">
                        +{ev.felvett.toLocaleString("hu-HU")}
                      </span>
                    )}
                    {ev.vissza < 0 && (
                      <span className="text-[11.5px] font-bold text-[var(--mob-negative)]">
                        {ft(ev.vissza)}
                      </span>
                    )}
                  </button>

                  {evNyitva &&
                    ev.honapok.map((h) => {
                      const hoNyitva = nyitottHonap === h.kulcs;
                      return (
                        <div key={h.kulcs} className={cn(hoNyitva && "bg-[var(--mob-tile)]/35")}>
                          <button
                            type="button"
                            onClick={() => setNyitottHonap(hoNyitva ? null : h.kulcs)}
                            className="flex w-full items-center justify-between gap-2 border-t border-[var(--mob-border)] px-3 py-2 text-left"
                          >
                            <span className="flex flex-col gap-px">
                              <span className="flex items-center gap-1 text-[12.5px] font-semibold">
                                {hoNyitva ? (
                                  <ChevronDown className="size-3 text-[var(--mob-muted)]" />
                                ) : (
                                  <ChevronRight className="size-3 text-[var(--mob-muted)]" />
                                )}
                                {HU_MONTHS[h.honap - 1]}
                              </span>
                              <span className="flex gap-2 pl-4 text-[10.5px] font-bold">
                                {h.felvett > 0 && (
                                  <i className="not-italic text-[var(--mob-positive)]">
                                    +{h.felvett.toLocaleString("hu-HU")}
                                  </i>
                                )}
                                {h.vissza < 0 && (
                                  <i className="not-italic text-[var(--mob-negative)]">
                                    {ft(h.vissza)}
                                  </i>
                                )}
                              </span>
                            </span>
                            <b className="text-[13px] font-extrabold tabular-nums">
                              {ft(h.zaroEgyenleg)}
                            </b>
                          </button>
                          {hoNyitva && h.tetelek.map((t) => <TetelSor key={t.id} tetel={t} />)}
                        </div>
                      );
                    })}
                </div>
              );
            })}

          {reszletek && (
            <p className="border-t border-[var(--mob-border)] px-3 py-2 text-[10px] text-[var(--mob-muted)]">
              A jobb oldali összeg a hónap végi tartozás. A hónapra koppintva látszanak a
              tételei.
            </p>
          )}
        </>
      )}
    </div>
  );
}
