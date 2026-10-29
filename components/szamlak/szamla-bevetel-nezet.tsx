"use client";

import { useEffect, useState, type ReactNode } from "react";
import { getSzamlaBevetelAttekintes } from "@/lib/szamlak/actions";
import {
  SZAMLA_BEVETEL_MAPPAK,
  type SzamlaBevetelAttekintes,
  type SzamlaBevetelMappa,
  type SzamlaBevetelVevo,
} from "@/lib/szamlak/szamla-constants";

const HONAP_NEV = [
  "Január", "Február", "Március", "Április", "Május", "Június",
  "Július", "Augusztus", "Szeptember", "Október", "November", "December",
];

const MAPPA_DEF: Record<SzamlaBevetelMappa, { nev: string; szin: string }> = {
  fuvar: { nev: "Fuvar", szin: "#0A84FF" },
  fabrika: { nev: "Fabrika", szin: "#AF52DE" },
  keter: { nev: "Keter", szin: "#30B0C7" },
  egyeb: { nev: "Egyéb", szin: "#A1A1A6" },
};

const SZIN_KEK = "#0A84FF";
const SZIN_ZOLD = "#34C759";
const SZIN_NARANCS = "#FF9500";
const TXT_1 = "text-[#1D1D1F]";
const TXT_2 = "text-[#48484A]";
const TXT_3 = "text-[#6E6E73]";

function formatFt(n: number): string {
  return `${Math.round(n).toLocaleString("hu-HU")} Ft`;
}

/** Millió Ft-ban egy tizedessel, pl. "12,2 M Ft". */
function formatM(n: number): string {
  return `${(n / 1_000_000).toLocaleString("hu-HU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M Ft`;
}

function szazalek(resz: number, egesz: number): number {
  return egesz > 0 ? (resz / egesz) * 100 : 0;
}

function Kartya({ szin, cim, children }: { szin?: string; cim?: string; children: ReactNode }) {
  return (
    <div
      className="relative overflow-hidden rounded-xl bg-card p-4"
      style={{ boxShadow: "var(--shadow-card), var(--hi)" }}
    >
      {szin && <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: szin }} />}
      {cim && <div className={`mb-3 text-sm font-semibold ${TXT_1}`}>{cim}</div>}
      {children}
    </div>
  );
}

function Ures({ szoveg }: { szoveg: string }) {
  return <div className={`py-4 text-center text-xs ${TXT_3}`}>{szoveg}</div>;
}

function Csempe({ szin, cim, ertek, alatta }: { szin: string; cim: string; ertek: ReactNode; alatta?: ReactNode }) {
  return (
    <Kartya szin={szin}>
      <div className={`text-xs font-medium ${TXT_3}`}>{cim}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${TXT_1}`}>{ertek}</div>
      <div className={`mt-0.5 min-h-4 text-xs tabular-nums ${TXT_2}`}>{alatta}</div>
    </Kartya>
  );
}

function VevoLista({
  sorok,
  cimke,
  szin,
  datumCim,
  datum,
  ures,
}: {
  sorok: SzamlaBevetelVevo[];
  cimke: string;
  szin: string;
  datumCim: string;
  datum: (v: SzamlaBevetelVevo) => string;
  ures: string;
}) {
  if (sorok.length === 0) return <Ures szoveg={ures} />;
  return (
    <div className="space-y-2">
      {sorok.map((v) => (
        <div key={v.vevo_nev} className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold"
              style={{ color: szin, background: `${szin}1A` }}
            >
              {cimke}
            </span>
            <span className={`truncate text-sm font-semibold ${TXT_1}`} title={v.vevo_nev}>
              {v.vevo_nev}
            </span>
          </div>
          <div className={`text-xs tabular-nums ${TXT_3}`}>
            {datumCim} {datum(v)} · eddig <span title={formatFt(v.osszeg)}>{formatM(v.osszeg)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Számlák · Bevétel fül (redesign 1): kulcsszám-csempék, havi összetétel
 * mappánként, mappa-kártyák és új/elmaradó vevők. Saját maga tölti az adatot
 * (getSzamlaBevetelAttekintes), a refreshKey változására újratölt.
 */
export function SzamlaBevetelNezet({ refreshKey }: { refreshKey: number }) {
  const [adat, setAdat] = useState<SzamlaBevetelAttekintes | null>(null);
  const [hiba, setHiba] = useState(false);

  useEffect(() => {
    let aktiv = true;
    getSzamlaBevetelAttekintes()
      .then((a) => {
        if (!aktiv) return;
        setAdat(a);
        setHiba(false);
      })
      .catch(() => {
        if (aktiv) setHiba(true);
      });
    return () => {
      aktiv = false;
    };
  }, [refreshKey]);

  if (hiba) return <Ures szoveg="A bevétel-adatok nem tölthetők be." />;
  if (!adat) return <Ures szoveg="Betöltés…" />;

  const utolsoHonap = adat.honapok.length;
  const idoszak = `${adat.ev} jan–${HONAP_NEV[utolsoHonap - 1]?.toLowerCase() ?? ""}`;
  const eurOsszes = adat.eur.reduce((s, e) => s + e.osszeg, 0);
  const eurDarab = adat.eur.reduce((s, e) => s + e.darab, 0);
  const eurMappa = (m: SzamlaBevetelMappa) => adat.eur.find((e) => e.mappa === m);
  const eurFmt = (n: number) => `${Math.round(n).toLocaleString("hu-HU")} EUR`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Csempe
          szin={SZIN_KEK}
          cim={`Számlázva · ${idoszak} (HUF)`}
          ertek={<span title={formatFt(adat.ytdOsszes)}>{formatM(adat.ytdOsszes)}</span>}
          alatta={eurDarab > 0 ? `+ ${eurFmt(eurOsszes)} külön (${eurDarab} számla)` : undefined}
        />
        <Csempe
          szin={SZIN_ZOLD}
          cim="Befolyt · ugyanaz az időszak"
          ertek={<span title={formatFt(adat.ytdBefolyt)}>{formatM(adat.ytdBefolyt)}</span>}
          alatta={
            adat.ytdOsszes > 0
              ? `a számlázott ${szazalek(adat.ytdBefolyt, adat.ytdOsszes).toFixed(0)}%-a`
              : undefined
          }
        />
        <Csempe
          szin={MAPPA_DEF.fuvar.szin}
          cim="Fuvar · Raklap"
          ertek={
            <>
              <span title={formatFt(adat.ytdFuvar)}>{formatM(adat.ytdFuvar)}</span>
              <span className={`mx-1.5 ${TXT_3}`}>·</span>
              <span title={formatFt(adat.ytdRaklap)}>{formatM(adat.ytdRaklap)}</span>
            </>
          }
          alatta={
            adat.ytdOsszes > 0
              ? `${szazalek(adat.ytdFuvar, adat.ytdOsszes).toFixed(0)}% · ${szazalek(adat.ytdRaklap, adat.ytdOsszes).toFixed(0)}%`
              : undefined
          }
        />
        <Csempe
          szin={MAPPA_DEF.fabrika.szin}
          cim="Fabrika + Keter aránya"
          ertek={adat.fabrikaKeterSzazalek === null ? "—" : `${adat.fabrikaKeterSzazalek.toFixed(1).replace(".", ",")}%`}
          alatta="a számlázott összegből"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Kartya cim="Összetétel havonta">
          <div className={`mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs ${TXT_2}`}>
            {SZAMLA_BEVETEL_MAPPAK.map((m) => (
              <span key={m} className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: MAPPA_DEF[m].szin }} />
                {MAPPA_DEF[m].nev}
              </span>
            ))}
          </div>
          {adat.ytdOsszes <= 0 ? (
            <Ures szoveg="Az idei évben még nincs számlázott összeg." />
          ) : (
            <div className="space-y-2">
              {adat.honapok.map((h) => {
                const folyo = h.honap === utolsoHonap;
                return (
                  <div key={h.honap} className={`flex items-center gap-3 ${folyo ? "opacity-70" : ""}`}>
                    <div className={`w-24 shrink-0 text-xs ${TXT_2}`}>
                      {HONAP_NEV[h.honap - 1]}
                      {folyo && <span className={`ml-1 ${TXT_3}`}>(folyó)</span>}
                    </div>
                    <div className="flex h-[30px] min-w-0 flex-1 overflow-hidden rounded-md bg-[#F2F2F7]">
                      {SZAMLA_BEVETEL_MAPPAK.map((m) => {
                        const sz = szazalek(h.mappak[m], h.osszes);
                        if (sz <= 0) return null;
                        return (
                          <div
                            key={m}
                            className="flex items-center justify-center text-xs font-medium tabular-nums text-white"
                            style={{ width: `${sz}%`, background: MAPPA_DEF[m].szin }}
                            title={`${MAPPA_DEF[m].nev}: ${formatFt(h.mappak[m])}`}
                          >
                            {sz >= 8 ? `${sz.toFixed(0)}%` : ""}
                          </div>
                        );
                      })}
                    </div>
                    <div className="w-28 shrink-0 text-right tabular-nums">
                      <div className={`text-sm font-bold ${TXT_1}`} title={formatFt(h.osszes)}>
                        {formatM(h.osszes)}
                      </div>
                      <div className="text-xs" style={{ color: SZIN_ZOLD }} title={formatFt(h.befolyt)}>
                        befolyt {(h.befolyt / 1_000_000).toLocaleString("hu-HU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {adat.datumNelkuliKifizetett > 0 && (
            <div className={`mt-3 text-xs ${TXT_3}`}>
              {adat.datumNelkuliKifizetett} kifizetett számlának nincs dátuma, ezért a befolyt összegben nem szerepel.
            </div>
          )}
        </Kartya>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {SZAMLA_BEVETEL_MAPPAK.map((m) => {
              const maxHavi = Math.max(1, ...adat.honapok.map((h) => h.mappak[m]));
              const eur = eurMappa(m);
              return (
                <Kartya key={m}>
                  <div className={`flex items-center gap-2 text-sm font-semibold ${TXT_1}`}>
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: MAPPA_DEF[m].szin }} />
                    {MAPPA_DEF[m].nev}
                  </div>
                  <div className={`mt-1 text-lg font-bold tabular-nums ${TXT_1}`} title={formatFt(adat.ytdMappak[m])}>
                    {formatM(adat.ytdMappak[m])}
                  </div>
                  <div className={`text-xs tabular-nums ${TXT_2}`}>
                    {adat.ytdOsszes > 0 ? `a teljes ${szazalek(adat.ytdMappak[m], adat.ytdOsszes).toFixed(0)}%-a` : "—"}
                    {eur && <span className={TXT_3}> · + {eurFmt(eur.osszeg)}</span>}
                  </div>
                  <div className="mt-2 flex h-10 items-end gap-1">
                    {adat.honapok.map((h) => (
                      <div
                        key={h.honap}
                        className="flex-1 rounded-sm"
                        style={{
                          height: `${Math.max(4, (h.mappak[m] / maxHavi) * 100)}%`,
                          background: MAPPA_DEF[m].szin,
                          opacity: h.honap === utolsoHonap ? 0.4 : 1,
                        }}
                        title={`${HONAP_NEV[h.honap - 1]}: ${formatFt(h.mappak[m])}`}
                      />
                    ))}
                  </div>
                </Kartya>
              );
            })}
          </div>

          <Kartya cim="Új és elmaradó vevők">
            {adat.ujVevok.length === 0 && adat.elmaradoVevok.length === 0 ? (
              <Ures szoveg="Nincs új vagy elmaradó vevő." />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <VevoLista
                  sorok={adat.ujVevok}
                  cimke="Új vevő"
                  szin={SZIN_KEK}
                  datumCim="első számla"
                  datum={(v) => v.elso_datum}
                  ures="Nincs új vevő."
                />
                <VevoLista
                  sorok={adat.elmaradoVevok}
                  cimke="90+ napja nincs számla"
                  szin={SZIN_NARANCS}
                  datumCim="utolsó számla"
                  datum={(v) => v.utolso_datum}
                  ures="Nincs elmaradó vevő."
                />
              </div>
            )}
          </Kartya>
        </div>
      </div>
    </div>
  );
}
