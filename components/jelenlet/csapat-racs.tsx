"use client";

import { cn } from "@/lib/utils";
import {
  NAP_BETUK,
  cella,
  hetCimke,
  maradCimke,
  type CellaTipus,
} from "@/lib/jelenlet/csapat-lap";
import type { DaySummary, RacsBejegyzes, SzabadsagMerleg } from "@/lib/jelenlet/shared";

export type RacsDolgozo = {
  id: string;
  name: string;
  /** Van jelenléti nyilvántartása (a cella kattintásra a nap-szerkesztőt nyitja). */
  aktiv: boolean;
};

const KERT_CSIKOS = {
  backgroundImage: "repeating-linear-gradient(135deg, #ffb340 0 4px, #ffdca8 4px 8px)",
};

const CELLA_STILUS: Record<CellaTipus, string> = {
  szabadsag: "bg-[#ff9500] font-bold text-white",
  kert: "font-bold text-[#1d1d1f]",
  beteg: "bg-[#af52de] font-bold text-white",
  ledolgozott: "bg-[#e3f5e8] font-semibold text-[#1d1d1f]",
  bent: "bg-success font-semibold text-white",
  nyitott: "border border-amber-400 bg-amber-100 font-bold text-amber-900",
  unnep: "bg-[#e5e5ea] font-bold text-[#48484a]",
  hetvege: "bg-[#ececf0]",
  hianyzik: "border border-dashed border-[#c7c7cc] text-[#6e6e73]",
  jovo: "bg-[#f5f5f7]",
  ures: "",
};

const NEV_OSZLOP = "w-[168px] shrink-0";
const MARAD_OSZLOP = "w-[76px] shrink-0";

/**
 * A Csapat lap rácsa: sorok = dolgozók, oszlopok = napok hetenként csoportosítva,
 * jobb szélen a „Marad” (kivehető / keret). Csak megjelenít — az adatot és a
 * dialógusokat a CsapatLap kezeli.
 */
export function CsapatRacs({
  hetek,
  ma,
  dolgozok,
  racs,
  napok,
  merlegek,
  canEdit,
  onCella,
  onNev,
  onMarad,
}: {
  hetek: string[][];
  ma: string;
  dolgozok: RacsDolgozo[];
  racs: Map<string, RacsBejegyzes[]>;
  napok: Map<string, Map<string, DaySummary>>;
  merlegek: Map<string, SzabadsagMerleg>;
  canEdit: boolean;
  onCella: (employeeId: string, iso: string) => void;
  onNev: (employeeId: string) => void;
  onMarad: (employeeId: string) => void;
}) {
  const maiHet = hetek.find((het) => het.includes(ma));

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[880px] flex-col gap-1">
        {/* hét-fejlécek */}
        <div className="flex items-end gap-3">
          <div className={NEV_OSZLOP} />
          {hetek.map((het) => (
            <div
              key={het[0]}
              className={cn(
                "min-w-0 flex-1 truncate rounded-md px-2 py-1 text-center text-xs font-semibold",
                het === maiHet ? "bg-primary text-primary-foreground" : "text-[#48484a]"
              )}
            >
              {hetCimke(het[0])}
            </div>
          ))}
          <div className={MARAD_OSZLOP} />
        </div>

        {/* nap-fejlécek */}
        <div className="flex items-end gap-3">
          <div className={NEV_OSZLOP} />
          {hetek.map((het) => (
            <div key={het[0]} className="grid min-w-0 flex-1 grid-cols-7 gap-[3px]">
              {het.map((iso, i) => (
                <div
                  key={iso}
                  className={cn(
                    "flex flex-col items-center text-xs leading-tight tabular-nums",
                    iso === ma ? "font-bold text-primary" : "text-[#6e6e73]"
                  )}
                >
                  <span>{NAP_BETUK[i]}</span>
                  <span className="font-semibold">{Number(iso.slice(8))}</span>
                </div>
              ))}
            </div>
          ))}
          <div className={cn(MARAD_OSZLOP, "pr-1 text-right text-xs font-semibold text-[#6e6e73]")}>
            Marad
          </div>
        </div>

        {/* dolgozók */}
        {dolgozok.map((d) => {
          const marad = maradCimke(merlegek.get(d.id));
          const sajatNapok = napok.get(d.id);
          const kattinthato = canEdit && d.aktiv;
          return (
            <div key={d.id} className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onNev(d.id)}
                title="Havi napló"
                className={cn(NEV_OSZLOP, "truncate text-left text-sm font-semibold text-[#1d1d1f] hover:underline")}
              >
                {d.name}
              </button>
              {hetek.map((het) => (
                <div key={het[0]} className="grid min-w-0 flex-1 grid-cols-7 gap-[3px]">
                  {het.map((iso) => {
                    const c = cella({
                      iso,
                      ma,
                      aktiv: d.aktiv,
                      bejegyzes: racs.get(iso)?.find((b) => b.employeeId === d.id),
                      nap: sajatNapok?.get(iso),
                    });
                    const osztaly = cn(
                      "flex h-[30px] min-w-0 items-center justify-center rounded-[7px] text-xs tabular-nums",
                      CELLA_STILUS[c.tipus],
                      iso === ma && "ring-2 ring-primary ring-inset",
                      kattinthato && "cursor-pointer hover:brightness-95"
                    );
                    const stilus = c.tipus === "kert" ? KERT_CSIKOS : undefined;
                    const cim = c.cim ? `${d.name} · ${iso} — ${c.cim}` : `${d.name} · ${iso}`;
                    return kattinthato ? (
                      <button
                        key={iso}
                        type="button"
                        title={cim}
                        style={stilus}
                        onClick={() => onCella(d.id, iso)}
                        className={osztaly}
                      >
                        {c.felirat}
                      </button>
                    ) : (
                      <span key={iso} title={cim} style={stilus} className={osztaly}>
                        {c.felirat}
                      </span>
                    );
                  })}
                </div>
              ))}
              <div className={cn(MARAD_OSZLOP, "text-right")}>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => onMarad(d.id)}
                    title={`${marad.cim} — keret beállítása`}
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-sm font-bold tabular-nums hover:bg-muted",
                      marad.keves ? "text-[#ff9500]" : "text-[#1d1d1f]"
                    )}
                  >
                    {marad.szoveg}
                  </button>
                ) : (
                  <span
                    title={marad.cim}
                    className={cn(
                      "px-1.5 text-sm font-bold tabular-nums",
                      marad.keves ? "text-[#ff9500]" : "text-[#1d1d1f]"
                    )}
                  >
                    {marad.szoveg}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* jelmagyarázat */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#48484a]">
        <Jel stilus="bg-[#ff9500]" szoveg="Szabadság" />
        <Jel stilus="" stiluskod={KERT_CSIKOS} szoveg="Kért" />
        <Jel stilus="bg-[#af52de]" szoveg="Beteg" />
        <Jel stilus="bg-[#e5e5ea]" szoveg="Hétvége / ünnep (Ü)" />
        <Jel stilus="bg-[#e3f5e8]" szoveg="Ledolgozott idő" />
        <Jel stilus="border border-amber-400 bg-amber-100" szoveg="Nyitott nap (!)" />
      </div>
    </div>
  );
}

function Jel({
  stilus,
  stiluskod,
  szoveg,
}: {
  stilus: string;
  stiluskod?: React.CSSProperties;
  szoveg: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-3 w-4 rounded-[4px]", stilus)} style={stiluskod} />
      {szoveg}
    </span>
  );
}
