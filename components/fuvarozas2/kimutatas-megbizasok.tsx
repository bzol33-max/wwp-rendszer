"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatFt, formatNap, JellegBadge } from "@/components/fuvarozas2/kozos";
import { ForrasJel, TetelErtek } from "@/components/fuvarozas2/forras-jel";
import type { KimutatasMegbizas } from "@/lib/fuvarozas2/kimutatas";

// A Kimutatás megbízásonkénti táblája (5. fázis): bérfuvarnál eredmény,
// saját fuvarnál belső költség (és Ft/raklap) — külön oszlopban, soha nem
// egy közös számban. Az oszlopfejlécre kattintva rendez.

type Kulcs = "nap" | "jarmu" | "km" | "uzemanyag" | "utdij" | "napi" | "koltseg" | "bevetel" | "eredmeny" | "belso";

const ERTEK: Record<Kulcs, (m: KimutatasMegbizas) => number | string> = {
  nap: (m) => m.nap,
  jarmu: (m) => m.jarmuKod,
  km: (m) => m.km.ertek,
  uzemanyag: (m) => m.uzemanyag?.ft ?? -1,
  utdij: (m) => m.utdij?.ft ?? -1,
  napi: (m) => m.napiFix.ft,
  koltseg: (m) => m.koltsegFt,
  bevetel: (m) => m.bevetelFt ?? -1,
  eredmeny: (m) => m.eredmenyFt ?? Number.NEGATIVE_INFINITY,
  belso: (m) => m.belsoKoltsegFt ?? -1,
};

type Rend = { k: Kulcs; le: boolean };

function Fej({ k, rend, setRend, children, jobb = true }: {
  k: Kulcs; rend: Rend; setRend: (f: (r: Rend) => Rend) => void; children: React.ReactNode; jobb?: boolean;
}) {
  return (
    <th className={cn("px-3 py-2 font-medium", jobb && "text-right")}>
      <button
        type="button"
        className="inline-flex items-center gap-0.5 hover:text-foreground"
        onClick={() => setRend((r) => ({ k, le: r.k === k ? !r.le : k !== "nap" && k !== "jarmu" }))}
      >
        {children}
        <span className="text-[10px]">{rend.k === k ? (rend.le ? "▼" : "▲") : ""}</span>
      </button>
    </th>
  );
}

export function KimutatasMegbizasok({ megbizasok, kezdoJelleg = "mind", sajatKmDij, sajatKmDijForras }: {
  megbizasok: KimutatasMegbizas[];
  kezdoJelleg?: "mind" | "ber" | "sajat";
  /** A saját fuvar „díja lett volna” alapja: rakott km × ennyi Ft (beállítás: sajat_fuvar_km_dij_ft). */
  sajatKmDij?: number;
  sajatKmDijForras?: "berfuvar_atlag" | "beallitas";
}) {
  const [rend, setRend] = useState<Rend>({ k: "nap", le: false });
  const [jelleg, setJelleg] = useState<"mind" | "ber" | "sajat">(kezdoJelleg);
  const sorok = useMemo(() => {
    const f = ERTEK[rend.k];
    return megbizasok
      .filter((m) => jelleg === "mind" || m.jelleg === jelleg)
      .sort((a, b) => {
        const x = f(a), y = f(b);
        const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
        return rend.le ? -c : c;
      });
  }, [megbizasok, rend, jelleg]);

  if (megbizasok.length === 0) {
    return <p className="px-3 py-4 text-sm text-muted-foreground">Ebben az időszakban nincs kocsihoz rendelt megbízás.</p>;
  }

  return (
    <div>
      <div className="flex items-center gap-1 px-3 pb-2 text-sm">
        {(["mind", "ber", "sajat"] as const).map((j) => (
          <button key={j} type="button" onClick={() => setJelleg(j)}
            className={cn("rounded-md px-2 py-0.5", jelleg === j ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60")}>
            {j === "mind" ? "Mind" : j === "ber" ? "Bérfuvar" : "Saját"}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">{sorok.length} megbízás</span>
      </div>
      {jelleg === "sajat" ? <SajatUtnaplo sorok={sorok} sajatKmDij={sajatKmDij} forras={sajatKmDijForras} /> : <>
      {/* Telefonon kártyák: a 11 oszlopos táblából 390 px-en csak kettő látszott. */}
      <ul className="flex flex-col divide-y divide-foreground/5 sm:hidden">
        {sorok.map((m) => <MegbizasKartya key={m.id} m={m} />)}
      </ul>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[72rem] text-sm [&_td]:whitespace-nowrap">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <Fej rend={rend} setRend={setRend} k="nap" jobb={false}>Nap</Fej>
              <Fej rend={rend} setRend={setRend} k="jarmu" jobb={false}>Kocsi · fuvar</Fej>
              <Fej rend={rend} setRend={setRend} k="km">Km</Fej>
              <th className="px-3 py-2 text-right font-medium">Üres (odaút)</th>
              <Fej rend={rend} setRend={setRend} k="uzemanyag">Üzemanyag</Fej>
              <Fej rend={rend} setRend={setRend} k="utdij">Útdíj</Fej>
              <Fej rend={rend} setRend={setRend} k="napi">Napi fix</Fej>
              <th className="px-3 py-2 text-right font-medium">Kézi egyéb</th>
              <Fej rend={rend} setRend={setRend} k="koltseg">Költség</Fej>
              <Fej rend={rend} setRend={setRend} k="bevetel">Bevétel</Fej>
              <Fej rend={rend} setRend={setRend} k="eredmeny">Eredmény (bér)</Fej>
              <Fej rend={rend} setRend={setRend} k="belso">Belső költség (saját)</Fej>
            </tr>
          </thead>
          <tbody>
            {sorok.map((m) => (
              <tr key={m.id} className="border-t border-foreground/5 align-top">
                <td className="px-3 py-2 tabular-nums">{formatNap(m.nap)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{m.jarmuKod}</span>
                    <JellegBadge jelleg={m.jelleg} />
                    <Link href={`/fuvarozas2/megbizasok/${m.id}`} className="text-xs text-muted-foreground hover:underline">#{m.id}</Link>
                  </div>
                  <div className="max-w-[18rem] truncate text-xs text-muted-foreground" title={`${m.felrako ?? "?"} → ${m.lerako ?? "?"}`}>
                    {m.partner ? `${m.partner} · ` : ""}{m.felrako ?? "?"} → {m.lerako ?? "?"}
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {m.km.ertek.toLocaleString("hu-HU")} <ForrasJel forras={m.km.forras} />
                  {m.liter ? <div className="text-[10px] text-muted-foreground">{m.liter.ertek} l</div> : null}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{m.uresKmBecsles.toLocaleString("hu-HU")} <ForrasJel forras="becsles" /></td>
                <td className="px-3 py-2 text-right tabular-nums"><TetelErtek tetel={m.uzemanyag} /></td>
                <td className="px-3 py-2 text-right tabular-nums"><TetelErtek tetel={m.utdij} /></td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground"><TetelErtek tetel={m.napiFix} /></td>
                <td className="px-3 py-2 text-right tabular-nums"><TetelErtek tetel={m.keziEgyeb} /></td>
                <td className="px-3 py-2 text-right tabular-nums">{formatFt(m.koltsegFt)} <ForrasJel forras={m.koltsegForras} /></td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {m.jelleg === "ber" ? (
                    <>
                      {m.bevetelFt != null ? formatFt(m.bevetelFt) : <span className="text-[var(--f2-amb)]">nincs árfolyam</span>} <ForrasJel forras="teny" />
                      {m.keziBevetelFt ? <div className="text-[10px] text-muted-foreground">benne kézi pótdíj: {formatFt(m.keziBevetelFt)}</div> : null}
                      {m.bevetelEur != null ? (
                        <div className="text-[10px] text-muted-foreground" title={m.atvaltas?.cimke}>
                          {m.bevetelEur.toLocaleString("hu-HU")} EUR{m.atvaltas ? ` × ${m.atvaltas.arfolyam.toLocaleString("hu-HU")} (${m.atvaltas.arfolyamNap})` : ""}
                        </div>
                      ) : null}
                    </>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className={cn("px-3 py-2 text-right font-semibold tabular-nums",
                  m.eredmenyFt == null ? "text-muted-foreground" : m.eredmenyFt < 0 ? "text-[var(--f2-red)]" : "text-[var(--f2-mint)]")}>
                  {m.jelleg === "ber" ? formatFt(m.eredmenyFt) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {m.jelleg === "sajat" ? (
                    <>
                      <span className="font-semibold text-primary">{formatFt(m.belsoKoltsegFt)}</span>
                      {m.ftPerRaklap != null ? <div className="text-[10px] text-muted-foreground">{formatFt(m.ftPerRaklap)}/raklap ({m.raklapDb} db)</div> : null}
                      {m.elkerultKoltsegFt ? (
                        <div className="text-[10px] text-muted-foreground" title="Tájékoztató: ennyibe került volna bérbe kiadva (rakott km × km-díj) — semmilyen eredménybe nem számít bele.">
                          elkerült: {formatFt(m.elkerultKoltsegFt)}
                        </div>
                      ) : null}
                    </>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>}
    </div>
  );
}

/**
 * Saját fuvarok útnaplója (Budaházi Zoltán, 2026-10-19: „hol találom, mikor
 * hová mentünk saját áruval, egy-egy útnak mennyi lett volna a díja?”). Saját
 * fuvarnál a megbízó mindig a Well-Worn Pallet; a „kinek” az áru címzettje.
 * Díja lett volna = rakott km × a bérfuvarjaink átlagos Ft/km-e (90 nap; ha
 * nincs adat, a beállítás) — csak
 * tájékoztató, az eredménybe nem számít.
 */
function SajatUtnaplo({ sorok, sajatKmDij, forras }: { sorok: KimutatasMegbizas[]; sajatKmDij?: number; forras?: "berfuvar_atlag" | "beallitas" }) {
  if (sorok.length === 0) return <p className="px-3 py-4 text-sm text-muted-foreground">Ebben az időszakban nem volt saját fuvar.</p>;
  const ossz = sorok.reduce((a, m) => ({
    km: a.km + Math.round(m.rakottKmBecsles), koltseg: a.koltseg + (m.belsoKoltsegFt ?? m.koltsegFt), dij: a.dij + (m.elkerultKoltsegFt ?? 0),
  }), { km: 0, koltseg: 0, dij: 0 });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-x-6 gap-y-1 px-3 text-sm">
        <span><b>{sorok.length}</b> út</span>
        <span><b>{ossz.km.toLocaleString("hu-HU")}</b> rakott km</span>
        <span>költségünk <b>{formatFt(ossz.koltseg)}</b></span>
        <span>díja lett volna <b className="text-primary">{formatFt(ossz.dij)}</b></span>
        {sajatKmDij ? <span className="text-xs text-muted-foreground">(rakott km × {sajatKmDij.toLocaleString("hu-HU")} Ft{forras === "berfuvar_atlag" ? " — a bérfuvarjaink 90 napos átlaga" : ""})</span> : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Nap</th>
              <th className="px-3 py-2 font-medium">Honnan → hova</th>
              <th className="px-3 py-2 font-medium">Kitől → kinek</th>
              <th className="px-3 py-2 font-medium">Kocsi</th>
              <th className="px-3 py-2 text-right font-medium">Rakott km</th>
              <th className="px-3 py-2 text-right font-medium">Költségünk</th>
              <th className="px-3 py-2 text-right font-medium">Díja lett volna</th>
            </tr>
          </thead>
          <tbody>
            {sorok.map((m) => (
              <tr key={m.id} className="border-t border-foreground/5 align-top">
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                  <Link href={`/fuvarozas2/megbizasok/${m.id}`} className="hover:underline">{formatNap(m.nap)}</Link>
                </td>
                <td className="px-3 py-2">{m.felrako ?? "?"} → {m.lerako ?? "?"}</td>
                <td className="px-3 py-2">{m.kitolKinek ?? m.partner ?? <span className="text-muted-foreground">—</span>}</td>
                <td className="whitespace-nowrap px-3 py-2">{m.jarmuKod}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{Math.round(m.rakottKmBecsles).toLocaleString("hu-HU")}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                  {formatFt(m.belsoKoltsegFt ?? m.koltsegFt)}
                  {m.ftPerRaklap != null ? <div className="text-[10px] text-muted-foreground">{formatFt(m.ftPerRaklap)}/raklap</div> : null}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-primary">{m.elkerultKoltsegFt ? formatFt(m.elkerultKoltsegFt) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Sor({ cim, children }: { cim: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-muted-foreground">{cim}</span>
      <span className="whitespace-nowrap text-right tabular-nums">{children}</span>
    </div>
  );
}

/** Egy megbízás telefonos kártyája — ugyanazok a számok, mint a tábla sorában. */
function MegbizasKartya({ m }: { m: KimutatasMegbizas }) {
  return (
    <li className="flex flex-col gap-1 px-3 py-3 text-sm">
      <div className="flex items-center gap-1.5">
        <span className="tabular-nums text-muted-foreground">{formatNap(m.nap)}</span>
        <span className="font-medium">{m.jarmuKod}</span>
        <JellegBadge jelleg={m.jelleg} />
        <Link href={`/fuvarozas2/megbizasok/${m.id}`} className="ml-auto text-xs text-muted-foreground hover:underline">#{m.id}</Link>
      </div>
      <div className="truncate text-xs text-muted-foreground">{m.partner ? `${m.partner} · ` : ""}{m.felrako ?? "?"} → {m.lerako ?? "?"}</div>
      <Sor cim="Km">{m.km.ertek.toLocaleString("hu-HU")} <ForrasJel forras={m.km.forras} />{m.liter ? <span className="text-xs text-muted-foreground"> · {m.liter.ertek} l</span> : null}</Sor>
      <Sor cim="Üzemanyag"><TetelErtek tetel={m.uzemanyag} /></Sor>
      <Sor cim="Útdíj"><TetelErtek tetel={m.utdij} /></Sor>
      <Sor cim="Napi fix"><TetelErtek tetel={m.napiFix} /></Sor>
      {m.keziEgyeb ? <Sor cim="Kézi egyéb"><TetelErtek tetel={m.keziEgyeb} /></Sor> : null}
      <Sor cim="Költség">{formatFt(m.koltsegFt)} <ForrasJel forras={m.koltsegForras} /></Sor>
      {m.jelleg === "ber" ? (
        <>
          <Sor cim="Bevétel">
            {m.bevetelFt != null ? formatFt(m.bevetelFt) : <span className="text-[var(--f2-amb)]">nincs árfolyam</span>} <ForrasJel forras="teny" />
          </Sor>
          {m.bevetelEur != null ? (
            <div className="text-right text-[10px] text-muted-foreground" title={m.atvaltas?.cimke}>
              {m.bevetelEur.toLocaleString("hu-HU")} EUR{m.atvaltas ? ` × ${m.atvaltas.arfolyam.toLocaleString("hu-HU")} (${m.atvaltas.arfolyamNap})` : ""}
            </div>
          ) : null}
          <Sor cim="Eredmény (bér)">
            <span className={cn("font-semibold", m.eredmenyFt == null ? "text-muted-foreground" : m.eredmenyFt < 0 ? "text-[var(--f2-red)]" : "text-[var(--f2-mint)]")}>
              {formatFt(m.eredmenyFt)}
            </span>
          </Sor>
        </>
      ) : (
        <>
          <Sor cim="Belső költség (saját)">
            <span className="font-semibold text-primary">{formatFt(m.belsoKoltsegFt)}</span>
            {m.ftPerRaklap != null ? <span className="text-xs text-muted-foreground"> · {formatFt(m.ftPerRaklap)}/raklap</span> : null}
          </Sor>
          {m.elkerultKoltsegFt ? <Sor cim="Elkerült (tájékoztató)"><span className="text-muted-foreground">{formatFt(m.elkerultKoltsegFt)}</span></Sor> : null}
        </>
      )}
    </li>
  );
}
