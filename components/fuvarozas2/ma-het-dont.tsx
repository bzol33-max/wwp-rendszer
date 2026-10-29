import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { MaVaszon } from "@/lib/fuvarozas2/ma-vaszon";
import type { TervezesHet } from "@/lib/fuvarozas2/tervezes-het";
import type { BejovoSor } from "@/lib/fuvarozas2/tervezo";
import { varosNev } from "@/lib/fuvarozas/varos";
import { napCimke as relNap } from "@/lib/fuvarozas2/kocsi-sav-alap";
import { ftSzoveg, napNevHosszu } from "@/lib/fuvarozas2/ma-het-alap";
import { NyugtaGomb, VisszavonGomb } from "@/components/fuvarozas2/elteres-nyugta";
import { AjanlatLista, hetLink, ResReszlet } from "@/components/fuvarozas2/tervezes-het";
import { HetOsszegzes } from "@/components/fuvarozas2/het-osszegzes";
import { BejovoGombok, KocsiraGomb } from "@/components/fuvarozas2/ma-het-gombok";
import { FO_GOMB, MASODLAGOS_GOMB } from "@/components/fuvarozas2/ma-het-stilus";

// Ma + hét lap (redesign 5): a jobb panel három füle. Szerver-komponensek; a
// gombok a meglévő szerver-akciókat hívják (ma-het-gombok.tsx, elteres-nyugta.tsx,
// ajanlat-gombok.tsx), új adatforrás nincs.

const MEDDO = "text-[#6E6E73]";
const ALAP = "/fuvarozas2";
const reszlet = (id: string) => `/fuvarozas2/megbizasok?reszlet=${id}`;
const km = (x: number) => Math.round(x).toLocaleString("hu-HU");
const hoNap = (iso: string) => `${iso.slice(5, 7)}.${iso.slice(8, 10)}.`;

function Csoport({ cim, db, children }: { cim: string; db: number; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2" aria-label={cim}>
      <div className="flex items-baseline justify-between px-1">
        <h3 className="text-sm font-semibold">{cim}</h3>
        <span className={cn("text-[13px] tabular-nums", MEDDO)}>{db}</span>
      </div>
      {children}
    </section>
  );
}

function Tetel({ cim, href, also, piros, children }: { cim: string; href?: string | null; also?: ReactNode; piros?: boolean; children?: ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1.5 rounded-xl bg-white p-3 shadow-[var(--shadow-card)]", piros && "ring-2 ring-[var(--f2-red)]")}>
      {href ? <Link href={href} className="text-sm font-semibold hover:underline">{cim}</Link> : <div className="text-sm font-semibold">{cim}</div>}
      {also ? <div className={cn("text-[13px]", MEDDO)}>{also}</div> : null}
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

const MINOSITES: Record<string, string> = {
  veszteseges: "text-[var(--f2-red)]",
  hatareset: "text-[var(--f2-amb)]",
  ajanlott: "text-foreground",
};
const MINOSITES_NEV: Record<string, string> = { veszteseges: "veszteséges", hatareset: "határeset", ajanlott: "ajánlott" };

// ───────────────────────── Most dönts ─────────────────────────

/** A „Most dönts” darabszáma — a fül jelvényéhez (ugyanazokból a listákból, mint a tartalom). */
export function dontLista(adat: MaVaszon, het: TervezesHet | null, bejovo: BejovoSor[]) {
  const elteresBadge = adat.elteresek.map((e) => e.badge);
  const kockazat = adat.kocsik.flatMap((k) =>
    (k.jelzesek ?? [])
      .filter((j) => !elteresBadge.some((b) => j.szoveg.startsWith(b)))
      .map((j) => ({ kocsi: k.kod ?? k.cimke, sofor: k.sofor ?? k.cimke, szin: j.szin, szoveg: j.szoveg }))
  );
  const hatarido = [...bejovo].sort((a, b) => a.felrakasNap.localeCompare(b.felrakasNap));
  const ismert = new Set(adat.kocsiNelkul.map((s) => s.id));
  const kocsiraVar = [
    ...adat.kocsiNelkul.map((s) => ({ id: s.id, partner: s.partner, utvonal: s.utvonal, nap: s.nap })),
    ...(het?.kiosztatlan.flat() ?? [])
      .filter((f, i, t) => !ismert.has(f.id) && t.findIndex((x) => x.id === f.id) === i)
      .map((f) => ({ id: f.id, partner: f.cim, utvonal: `${f.felVaros} → ${f.leVaros}`, nap: f.felNap as string | null })),
  ];
  const resek = [...(het?.resek ?? [])].filter((r) => r.nap >= (het?.ma ?? "")).sort((a, b) => b.km - a.km);
  // Elvinni való: a Ma-vászon listája, a hét legjobb helyével kiegészítve (★ = útba eső).
  const legjobbById = new Map<string, NonNullable<TervezesHet["elvinni"][number][number]["legjobb"]>>();
  for (const nap of het?.elvinni ?? []) for (const e of nap) if (e.legjobb && !legjobbById.has(e.id)) legjobbById.set(e.id, e.legjobb);
  const javaslat = adat.elvinni
    .map((e) => ({ ...e, legjobb: legjobbById.get(e.id) ?? null }))
    .sort((a, b) => Number(!!b.legjobb?.utbaEso) - Number(!!a.legjobb?.utbaEso));
  const db = adat.elteresek.length + kockazat.length + hatarido.length + kocsiraVar.length + resek.length + javaslat.length;
  return { kockazat, hatarido, kocsiraVar, resek, javaslat, db };
}

export function MostDonts({ adat, het, bejovo, szerk, fuvarozas }: {
  adat: MaVaszon;
  het: TervezesHet | null;
  bejovo: BejovoSor[];
  szerk: boolean;
  fuvarozas: boolean;
}) {
  const l = dontLista(adat, het, bejovo);
  const hetParam = het && !het.ezAHet ? het.hetKezdet : null;
  const ajanlatDb = (kulcs: string) => het?.ajanlatok.filter((a) => a.illik?.res.kulcs === kulcs).length ?? 0;
  if (l.db === 0 && adat.nyugtazott.length === 0) {
    return <p className={cn("px-1 py-6 text-center text-sm", MEDDO)}>Most nincs teendő.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {adat.elteresek.length ? (
        <Csoport cim="Élő · most" db={adat.elteresek.length}>
          {adat.elteresek.map((e) => (
            <Tetel key={e.kulcs} cim={e.cim} href={e.href} piros={e.szin === "red"}
              also={<>{e.badge}{e.sorok[0] ? ` · ${e.sorok[0]}` : ""}</>}>
              {adat.nyugtazhat ? <NyugtaGomb kulcs={e.kulcs} szin={e.szin} cimke="Megnéztem" className={MASODLAGOS_GOMB} /> : null}
            </Tetel>
          ))}
        </Csoport>
      ) : null}

      {l.kockazat.length ? (
        <Csoport cim="Ma–holnap kockázat" db={l.kockazat.length}>
          {l.kockazat.map((x, i) => (
            <Tetel key={`${x.kocsi}-${i}`} cim={x.szoveg} href={`/fuvarozas2/kocsi/${encodeURIComponent(x.kocsi)}`} piros={x.szin === "red"} also={x.sofor}>
              {fuvarozas && /nincs fuvar/i.test(x.szoveg) ? <Link href="/fuvarozas2/timocom" className={MASODLAGOS_GOMB}>Ajánlat</Link> : null}
            </Tetel>
          ))}
        </Csoport>
      ) : null}

      {fuvarozas && l.hatarido.length ? (
        <Csoport cim="Határidős" db={l.hatarido.length}>
          {l.hatarido.map((s) => {
            const m = s.magaban?.minosites ?? null;
            const jo = s.legjobb;
            return (
              <Tetel key={s.id} cim={`${s.partner ?? "(nincs megbízó)"}${s.hivatkozas ? ` · ${s.hivatkozas}` : ""}`} href={`/fuvarozas2/tervezes?m=${s.id}`}
                also={
                  <>
                    {varosNev(s.felrako ?? "") || "?"} → {varosNev(s.lerako ?? "") || "?"} · {napNevHosszu(s.felrakasNap).toLowerCase()} {hoNap(s.felrakasNap)}
                    {s.fuvardij ? ` · ${new Intl.NumberFormat("hu-HU").format(Math.round(s.fuvardij))} ${s.penznem}` : " · nincs díj"}
                    {m ? <span className={cn("font-semibold", MINOSITES[m])}> · magában {MINOSITES_NEV[m]}</span> : null}
                    {s.allapot === "tervezett" ? " · kocsi nélkül" : ""}
                  </>
                }>
                {szerk ? <BejovoGombok id={s.id} allapot={s.allapot} kocsiKod={jo?.kod ?? null} cimke={jo ? `${jo.sofor} ${napNevHosszu(s.felrakasNap).toLowerCase()}` : ""} /> : null}
                <Link href={`/fuvarozas2/tervezes?m=${s.id}`} className={MASODLAGOS_GOMB}>Ajánlat</Link>
              </Tetel>
            );
          })}
        </Csoport>
      ) : null}

      {l.kocsiraVar.length ? (
        <Csoport cim="Kocsira vár" db={l.kocsiraVar.length}>
          {l.kocsiraVar.map((s) => (
            <Tetel key={s.id} cim={s.partner} href={reszlet(s.id)} also={<>{s.utvonal}{s.nap ? ` · ${relNap(s.nap, adat.ma)}` : ""}</>}>
              {fuvarozas && szerk ? <Link href={reszlet(s.id)} className={FO_GOMB}>Kocsira adom</Link> : null}
            </Tetel>
          ))}
        </Csoport>
      ) : null}

      {fuvarozas && l.resek.length ? (
        <Csoport cim="Rések" db={l.resek.length}>
          {l.resek.map((r) => {
            const db = ajanlatDb(r.kulcs);
            return (
              <Tetel key={r.kulcs} cim={`${r.sofor} · ${relNap(r.nap, adat.ma)}: ${r.honnan} → ${r.haza ? "haza" : r.hova}`}
                also={`${km(r.km)} km üres ≈ ${ftSzoveg(r.ft)}${db ? ` · ${db} illő ajánlat` : ""}`}>
                <Link href={hetLink(hetParam, r.kulcs, ALAP)} scroll={false} className={FO_GOMB}>Mit tegyek vele?</Link>
              </Tetel>
            );
          })}
        </Csoport>
      ) : null}

      {l.javaslat.length ? (
        <Csoport cim="Javaslat · elvinni való" db={l.javaslat.length}>
          {l.javaslat.map((e) => {
            const j = e.legjobb;
            const hatar = e.legkesobb ? (e.legkesobb < adat.ma ? `lejárt ${hoNap(e.legkesobb)}` : `határidő ${hoNap(e.legkesobb)}`) : "bármikor";
            return (
              <Tetel key={e.id} cim={`${j?.utbaEso ? "★ " : ""}${e.utvonal}`} href={`/fuvarozas2/megbizasok?elvinni=${e.id}`}
                piros={e.surgosseg === "piros"}
                also={
                  <>
                    {j ? `${j.cimke.split(" (")[0]}${j.utan ? ` · ${j.utan} után` : ""} · ${hoNap(j.nap)} · +${j.km} km${j.utbaEso ? " · útba esik" : ""} · ` : ""}
                    <span className={e.surgosseg === "piros" ? "font-semibold text-[var(--f2-red)]" : e.surgosseg === "sarga" ? "font-semibold text-[var(--f2-amb)]" : ""}>{hatar}</span>
                  </>
                }>
                {szerk && j ? <KocsiraGomb id={e.id} jarmuKod={j.jarmuKod} nap={j.nap} cimke={j.cimke.split(" (")[0]} /> : null}
              </Tetel>
            );
          })}
        </Csoport>
      ) : null}

      {adat.nyugtazott.length ? (
        <details className="px-1">
          <summary className={cn("cursor-pointer text-[13px]", MEDDO)}>{adat.nyugtazott.length} nyugtázva ma</summary>
          <div className="mt-1.5 flex flex-col gap-1">
            {adat.nyugtazott.map((e) => (
              <div key={e.kulcs} className={cn("flex items-baseline gap-2 text-xs", MEDDO)}>
                <span className="shrink-0 font-semibold">{e.badge}</span>
                <span className="min-w-0 flex-1 truncate">{e.cim}</span>
                <span className="shrink-0">{e.nyugtazta ?? "—"} · {e.mikor}</span>
                {adat.nyugtazhat ? <VisszavonGomb kulcs={e.kulcs} /> : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

// ───────────────────────── Ajánlatok ─────────────────────────

export function AjanlatokTab({ het }: { het: TervezesHet }) {
  const hetParam = het.ezAHet ? null : het.hetKezdet;
  const friss = het.ajanlatok.filter((a) => a.allapot !== "ajanlva" && !a.regi);
  const regi = het.ajanlatok.filter((a) => a.allapot !== "ajanlva" && a.regi);
  const kiment = het.ajanlatok.filter((a) => a.allapot === "ajanlva");
  const doboz = "rounded-xl bg-white shadow-[var(--shadow-card)]";
  return (
    <div className="flex flex-col gap-3">
      <section className={doboz}>
        <div className="flex items-baseline gap-2 px-4 pt-3 pb-1">
          <h3 className="text-sm font-semibold">Bejövő ajánlatok</h3>
          <span className="rounded-full bg-muted px-2 text-xs">{friss.length}</span>
          <span className={cn("ml-auto text-xs", MEDDO)}>24 óránál régebbi: lent</span>
        </div>
        {friss.length ? <AjanlatLista lista={friss} het={hetParam} alap={ALAP} /> : <p className={cn("px-4 pb-3 text-sm", MEDDO)}>Nincs friss nyitott ajánlat.</p>}
        {regi.length ? (
          <details className="border-t">
            <summary className={cn("cursor-pointer px-4 py-2 text-[13px]", MEDDO)}>Régebbi ajánlatok ({regi.length}) — valószínűleg már elkeltek</summary>
            <AjanlatLista lista={regi} het={hetParam} alap={ALAP} />
          </details>
        ) : null}
      </section>
      {kiment.length ? (
        <section className={doboz}>
          <div className="flex items-baseline gap-2 px-4 pt-3 pb-1">
            <h3 className="text-sm font-semibold">Kiment ajánlataink</h3>
            <span className="rounded-full bg-muted px-2 text-xs">{kiment.length}</span>
            <span className={cn("ml-auto text-xs", MEDDO)}>válaszra vár</span>
          </div>
          <AjanlatLista lista={kiment} het={hetParam} alap={ALAP} />
        </section>
      ) : null}
      <Link href="/fuvarozas2/timocom" className="rounded-xl border border-dashed border-foreground/25 px-4 py-3 text-sm hover:bg-muted/50">
        <b>Ajánlat beillesztése</b>
        <div className={cn("text-[13px]", MEDDO)}>Timocom szöveg vagy „→ WWP” gomb</div>
      </Link>
    </div>
  );
}

// ───────────────────────── Rés ─────────────────────────

export function ResTab({ het, szerk }: { het: TervezesHet; szerk: boolean }) {
  const hetParam = het.ezAHet ? null : het.hetKezdet;
  return (
    <div className="flex flex-col gap-3">
      <p className={cn("rounded-xl px-3 py-2 text-sm font-semibold", het.resek.length ? "bg-[var(--f2-amb-l)] text-[var(--f2-amb)]" : "bg-white shadow-[var(--shadow-card)]")}>
        {het.resek.length ? `${het.resek.length} rés · ${km(het.uresKmOssz)} km üres${het.ezAHet ? " (mától)" : ""}` : "nincs 100 km-nél hosszabb üres út"}
      </p>
      {het.resek.length ? (
        <ul className="flex flex-col gap-2">
          {het.resek.map((r) => (
            <li key={r.kulcs}>
              <Link
                href={hetLink(hetParam, r.kulcs, ALAP)}
                scroll={false}
                className={cn("block rounded-xl bg-white px-3 py-2 ring-2", het.kijelolt?.kulcs === r.kulcs ? "ring-[var(--f2-red)]" : "ring-[var(--f2-red)]/40 hover:ring-[var(--f2-red)]")}
              >
                <div className="text-sm font-semibold">{r.sofor} · {relNap(r.nap, het.ma)}: {r.honnan} → {r.haza ? "haza" : r.hova}</div>
                <div className={cn("text-[13px]", MEDDO)}>{km(r.km)} km üres ≈ {ftSzoveg(r.ft)}</div>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <ResReszlet adat={het} szerkeszthet={szerk} />
      <p className={cn("px-1 text-xs", MEDDO)}>Rés: 100 km-nél hosszabb üres út két fuvar között vagy hazafelé (légvonal × 1,3). Kattints rá: lent látod, mi illik bele és kit érdemes hívni.</p>
      {het.osszegzes ? (
        <details>
          <summary className={cn("cursor-pointer px-1 text-[13px]", MEDDO)}>Heti / havi összefoglaló</summary>
          <div className="mt-2"><HetOsszegzes adat={het.osszegzes} /></div>
        </details>
      ) : null}
    </div>
  );
}
