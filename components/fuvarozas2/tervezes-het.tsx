import { Fragment } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { HetAjanlat, TervezesHet } from "@/lib/fuvarozas2/tervezes-het";
import { fuvarJel, type HetiFuvar, type NapCella, type Res } from "@/lib/fuvarozas2/tervezes-het-alap";
import type { FuvarEredmeny, NapMerleg } from "@/lib/fuvarozas2/heti-utemterv-alap";
import type { TilalmiAblak } from "@/lib/fuvarozas2/kamionstop";
import { ledolgozosSzombat, munkaszunetiNap, torvenyesUnnep } from "@/lib/jelenlet/shared";
import { AutoFrissites } from "@/components/fuvarozas2/auto-frissites";
import { AjanlatGombok } from "@/components/fuvarozas2/ajanlat-gombok";

// Tervezés · A hét (az új terv 2. oldala): kocsinként a hét, a rések
// kiemelve, alul a kocsira váró fuvarok, mellette a bejött ajánlatok, alatta a kijelölt rés teendői.

const NAPNEV = ["V", "H", "K", "Sze", "Cs", "P", "Szo"];
const napCimke = (iso: string) => `${NAPNEV[new Date(`${iso}T12:00:00Z`).getUTCDay()]} ${iso.slice(5, 7)}.${iso.slice(8, 10)}.`;
const rovidNap = (iso: string) => NAPNEV[new Date(`${iso}T12:00:00Z`).getUTCDay()];
const ft = (x: number) => `${Math.round(x).toLocaleString("hu-HU")} Ft`;
const ezer = (x: number) => `${Math.round(x / 1000).toLocaleString("hu-HU")} e`;
const eur = (x: number) => Math.round(x).toLocaleString("hu-HU");
const ido = (perc: number) => `${Math.floor(perc / 60)} ó ${String(perc % 60).padStart(2, "0")} p`;
const hetLink = (het: string | null, res?: string) => {
  const p = new URLSearchParams();
  if (het) p.set("het", het);
  if (res) p.set("res", res);
  const q = p.toString();
  return `/fuvarozas2/tervezes${q ? `?${q}` : ""}${res ? "#res" : ""}`;
};

// --- Rács 2.0 (R1 kártya · R4 napi mérleg · R7 tartalék) — idők helyi „YYYY-MM-DDTHH:MM” szövegként ---
const NAPI_MAX_PERC = 540;
const hhmm = (t: string) => t.slice(11, 16);
/** Az idő a cella napjához képest: aznap csak „HH:MM”, más napon „Sze HH:MM”. */
const cellaIdo = (t: string, nap: string) => (t.slice(0, 10) === nap ? hhmm(t) : `${rovidNap(t.slice(0, 10))} ${hhmm(t)}`);
const vezetes = (p: number) => `${Math.floor(p / 60)}:${String(Math.round(p) % 60).padStart(2, "0")}`;
const km = (x: number) => Math.round(x).toLocaleString("hu-HU");
/** „HH:MM-tól/-től” — a rag a kimondott utolsó szám hangrendje szerint (18:15-től, 18:30-tól, 18:00-tól). */
function tolRag(hm: string) {
  const h = Number(hm.slice(0, 2)), m = Number(hm.slice(3, 5));
  const n = m || h;
  const mely = n === 0 || (n % 10 ? [3, 6, 8].includes(n % 10) : [20, 30].includes(n));
  return `${hm}-${mely ? "tól" : "től"}`;
}
const tilalomIdo = (t: string) => `${rovidNap(t.slice(0, 10)).toLowerCase()} ${hhmm(t)}`;
/** Nem munkanap-e (hétvége vagy munkaszüneti nap, ledolgozós szombat nélkül) — a fejléc halvány jelöléséhez. */
function nemMunkanap(iso: string): string | null {
  if (ledolgozosSzombat(iso)) return null;
  const unnep = munkaszunetiNap(iso);
  if (unnep) return unnep;
  const d = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return d === 6 ? "szombat" : d === 0 ? "vasárnap" : null;
}
const SAV_CSIK = { backgroundImage: "repeating-linear-gradient(135deg, var(--muted) 0 4px, transparent 4px 8px)" } as const;

function SzunetSav({ cimke, fej }: { cimke: string; fej?: boolean }) {
  const Tag = fej ? "th" : "td";
  return (
    <Tag className="w-5 px-0 py-2 align-top" style={SAV_CSIK} title={`Nem munkanap: ${cimke}`} aria-label={`Nem munkanap: ${cimke}`}>
      <span className={cn("mx-auto block whitespace-nowrap text-[10px] font-medium leading-5 text-muted-foreground [writing-mode:vertical-rl]", !fej && "opacity-60")}>{cimke}</span>
    </Tag>
  );
}

function TartalekJel({ e }: { e: FuvarEredmeny }) {
  const t = e.legszukebbTartalek;
  if (t == null) return null;
  const m = e.megallok.find((x) => x.tartalekPerc === t);
  const hova = m ? `a ${m.tipus === "felrako" ? "felrakásig" : "lerakásig"} (${m.varos})` : "a legszűkebb megállóig";
  const szoveg = t >= 0 ? `${t} perc tartalék ${hova}` : `${-t} perc késés ${hova}`;
  return (
    <span title={szoveg} aria-label={szoveg}
      className={cn("shrink-0 rounded-full px-1.5 text-[10px] font-semibold leading-4 tabular-nums",
        t >= 60 ? "bg-[var(--f2-mint-l)] text-[var(--f2-mint)] ring-1 ring-[var(--f2-mint)]/30"
          : t >= 0 ? "bg-[var(--f2-amb-l)] text-[var(--f2-amb)] ring-1 ring-[var(--f2-amb)]/30"
          : "bg-[var(--f2-red-l)] text-[var(--f2-red)] ring-1 ring-[var(--f2-red)]/30")}>
      {t < 0 ? "−" : "+"}{Math.abs(t)} p
    </span>
  );
}

/** R1 kártya: a fuvar a cella napján — `teljes`: az első (felrakó) nap, `utolso`: a lerakó nap, `kozep`: úton. */
function UtemKartya({ f, e, nap, szerep }: { f: HetiFuvar; e: FuvarEredmeny; nap: string; szerep: "teljes" | "utolso" | "kozep" }) {
  const jel = fuvarJel(f.allapot);
  const fel = e.megallok.find((m) => m.tipus === "felrako") ?? e.megallok[0];
  const le = [...e.megallok].reverse().find((m) => m.tipus === "lerako") ?? e.megallok[e.megallok.length - 1];
  const b = e.becsles ? "~" : "";
  return (
    <Link href={`/fuvarozas2/megbizasok?reszlet=${f.id}`}
      className={cn("block rounded-lg px-2 py-1 text-xs", f.sajat ? "bg-[var(--f2-blue-l)] text-[var(--f2-blue)]" : "bg-[var(--f2-mint-l)] text-[#0f5240]", jel === "kesz" && "opacity-55")}>
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1 truncate font-semibold">
          {jel === "kesz" ? "✓ " : jel === "uton" ? <span className="mr-1 inline-block size-1.5 rounded-full bg-current align-middle" title="úton" /> : null}
          {f.cim}
        </div>
        {szerep !== "kozep" ? <TartalekJel e={e} /> : null}
      </div>
      <div className="truncate">{f.felVaros} → {f.leVaros}</div>
      <div className="truncate tabular-nums">
        {szerep === "kozep" ? "↳ úton"
          : szerep === "utolso" ? (le ? `◷ le ${b}${cellaIdo(le.erkezes, nap)}` : "◷ lerakás")
          : `◷ ${fel ? `fel ${cellaIdo(fel.kezdes, nap)}` : "fel"}${le && le !== fel ? ` → le ${b}${cellaIdo(le.erkezes, nap)}` : ""}`}
      </div>
      {szerep === "teljes" ? (
        <>
          <div className="truncate tabular-nums">⇢ {km(e.rakottKm)} km rakott{e.uresKmElotte > 0 ? ` · ${km(e.uresKmElotte)} üres` : ""}</div>
          {e.dijFt != null ? <div className="truncate tabular-nums">{ft(e.dijFt)}{e.ftKm != null ? ` · ${e.ftKm.toLocaleString("hu-HU")} Ft/km` : ""}</div>
            : f.sajat ? <div className="truncate">saját</div> : null}
        </>
      ) : null}
    </Link>
  );
}

/** R4 napi mérleg a cella alján (+ napi pihenő / kamionstop sor, délután szabad link). */
function NapMerlegSav({ m, szabadHref }: { m: NapMerleg; szabadHref: string }) {
  const vanTartalom = m.vegez || m.vezetesPerc > 0 || m.rakottKm > 0 || m.uresKm > 0 || m.napiPihenoTol || m.kamionstop;
  if (!vanTartalom) return null;
  const k: TilalmiAblak | null = m.kamionstop;
  const v = m.vezetesPerc;
  return (
    <div className="mt-0.5 flex flex-col gap-0.5 rounded-md bg-muted/70 px-1.5 py-1 text-[10px] leading-tight text-muted-foreground tabular-nums">
      {m.napiPihenoTol ? <div className="font-medium text-foreground/80">■ napi pihenő ~{tolRag(hhmm(m.napiPihenoTol))}</div> : null}
      {k ? <div className="font-medium text-foreground/80" title={k.ok}>■ kamionstop {tilalomIdo(k.tol)} – {tilalomIdo(k.ig)}</div> : null}
      {m.vegez ? <div className="truncate">végez ~{hhmm(m.vegez.ido)} · {m.vegez.varos}</div> : null}
      <div className="truncate">km {km(m.rakottKm)} / {km(m.uresKm)}{m.berFt > 0 ? ` · bér ${ezer(m.berFt)}` : ""}</div>
      <div title={`Vezetés aznap: ${vezetes(v)} a napi ${vezetes(NAPI_MAX_PERC)}-ból`}>
        vezetés {vezetes(v)} / {vezetes(NAPI_MAX_PERC)}
        <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-foreground/10">
          <div className={cn("h-full rounded-full", v >= NAPI_MAX_PERC ? "bg-[var(--f2-red)]" : v >= 510 ? "bg-[var(--f2-amb)]" : "bg-[var(--f2-mint)]")}
            style={{ width: `${Math.min(100, (v / NAPI_MAX_PERC) * 100)}%` }} />
        </div>
      </div>
      {m.delutanSzabad ? (
        <Link href={szabadHref} scroll={false} className="font-medium text-[var(--f2-amb)] hover:underline">
          délután szabad · {ido(m.delutanSzabad.maradekVezetesPerc)} vezetés →
        </Link>
      ) : null}
    </div>
  );
}

/** A cella fuvarjainak szerepe a sorban: az első cella, ahol megjelenik = felrakó nap, az utolsó = lerakó nap. */
function cellaSzerepek(cellak: NapCella[]) {
  const elso = new Map<string, string>(), utolso = new Map<string, string>();
  for (const c of cellak) for (const f of c.fuvarok) {
    if (!elso.has(f.id)) elso.set(f.id, c.nap);
    utolso.set(f.id, c.nap);
  }
  return (id: string, nap: string): "teljes" | "utolso" | "kozep" => (elso.get(id) === nap ? "teljes" : utolso.get(id) === nap ? "utolso" : "kozep");
}

function ResChip({ r, aktiv, het }: { r: Res; aktiv: boolean; het: string | null }) {
  return (
    <Link href={hetLink(het, r.kulcs)} scroll={false}
      className={cn("block rounded-lg border border-dashed px-2 py-1 text-xs", aktiv ? "border-[var(--f2-amb)] bg-[var(--f2-amb-l)] ring-2 ring-[var(--f2-amb)]/40" : "border-[var(--f2-amb)]/60 bg-[var(--f2-amb-l)]/60 hover:bg-[var(--f2-amb-l)]")}>
      <div className="truncate text-[#5a3806]">{r.honnan} → {r.haza ? "haza" : r.hova}</div>
      <div className="font-semibold text-[var(--f2-amb)]">{r.km} km üres</div>
    </Link>
  );
}

export function TervezesHetNezet({ adat, szerkeszthet }: { adat: TervezesHet; szerkeszthet: boolean }) {
  const k = adat.kijelolt;
  const het = adat.ezAHet ? null : adat.hetKezdet;
  const ehhez = adat.ajanlatok.filter((a) => a.ehhez).sort((a, b) => a.ehhez!.tobbletFt - b.ehhez!.tobbletFt);
  const friss = adat.ajanlatok.filter((a) => a.allapot !== "ajanlva" && !a.regi);
  const regi = adat.ajanlatok.filter((a) => a.allapot !== "ajanlva" && a.regi);
  const kiment = adat.ajanlatok.filter((a) => a.allapot === "ajanlva");
  const utolso = adat.napok[adat.napok.length - 1];
  const savElott = new Map((adat.szunetSavok ?? []).map((s) => [s.elott, s.cimke]));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <nav className="flex items-center gap-1 text-sm" aria-label="Napok">
          <Link href={hetLink(adat.elozoHet)} className="rounded-lg px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">‹ előző</Link>
          <span className="px-1 font-semibold tabular-nums">{napCimke(adat.napok[0])} – {napCimke(utolso)}</span>
          <Link href={hetLink(adat.kovetkezoHet)} className="rounded-lg px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">következő ›</Link>
          {!adat.ezAHet ? <Link href={hetLink(null)} className="rounded-lg border px-2 py-0.5 text-xs hover:bg-muted">vissza mához</Link> : null}
        </nav>
        <AutoFrissites frissitve={adat.frissitve} intervallMs={300_000} />
        <span className={cn("ml-auto rounded-full px-3 py-1 text-sm font-medium", adat.resek.length ? "bg-[var(--f2-amb-l)] text-[#5a3806]" : "bg-[var(--f2-mint-l)] text-[var(--f2-mint)]")}>
          {adat.resek.length ? `${adat.resek.length} rés · ${adat.uresKmOssz.toLocaleString("hu-HU")} km üres${adat.ezAHet ? " (mától)" : ""}` : "nincs 100 km-nél hosszabb üres út"}
        </span>
      </div>
      {adat.kimaradt.length ? (
        <p className="rounded-xl bg-[var(--f2-red-l)] px-4 py-2 text-sm text-[var(--f2-red)]">
          <b>{adat.kimaradt.length} fuvar nem került a táblára:</b>{" "}
          {adat.kimaradt.map((h, i) => (
            <span key={h.id}>{i ? "; " : ""}<Link className="underline" href={`/fuvarozas2/megbizasok?reszlet=${h.id}`}>#{h.id} {h.cim} ({h.utvonal})</Link> — {h.ok}</span>
          ))}
        </p>
      ) : null}
      {adat.helyNelkul.length ? (
        <p className="rounded-xl bg-[var(--f2-amb-l)] px-4 py-2 text-sm text-[#5a3806]">
          <b>{adat.helyNelkul.length} fuvar helye nem ismert</b> — körülöttük a rés nem számolható:{" "}
          {adat.helyNelkul.slice(0, 4).map((h, i) => (
            <span key={h.id}>{i ? ", " : ""}<Link className="underline" href={`/fuvarozas2/megbizasok?reszlet=${h.id}`}>{h.cim} ({h.utvonal})</Link></span>
          ))}
          {adat.helyNelkul.length > 4 ? " …" : ""}. Javítsd a címet a megbízáson.
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <section className="overflow-x-auto rounded-2xl bg-card ring-1 ring-foreground/10">
          <table className="w-full min-w-[760px] table-fixed text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="w-24 px-4 py-2 font-medium" />
                {adat.napok.map((n) => {
                  const szunet = nemMunkanap(n);
                  return (
                    <Fragment key={n}>
                      {savElott.has(n) ? <SzunetSav cimke={savElott.get(n)!} fej /> : null}
                      <th className={cn("px-2 py-2 font-medium", n === adat.ma && "text-foreground", szunet && "bg-muted/50")} title={szunet ?? undefined}>
                        {napCimke(n)}{n === adat.ma ? " · ma" : ""}
                        {szunet && torvenyesUnnep(n) ? <span className="ml-1 rounded bg-[var(--f2-amb-l)] px-1 text-[10px] font-normal text-[#5a3806]">ünnep</span> : null}
                      </th>
                    </Fragment>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {adat.kocsik.map((kocsi) => {
                const ut = kocsi.utemterv ?? null;
                const eredmeny = new Map((ut?.fuvarok ?? []).map((e) => [e.id, e]));
                const merleg = new Map((ut?.napok ?? []).map((m) => [m.nap, m]));
                const szerep = cellaSzerepek(kocsi.cellak);
                return (
                <tr key={kocsi.kod} className="border-t border-foreground/5 align-top">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{kocsi.sofor}</div><div className="text-xs text-muted-foreground">{kocsi.kod}</div>
                    {kocsi.tacho ? (
                      <div className="mt-1 rounded-md bg-[var(--f2-mint-l)] px-1.5 py-0.5 text-[10px] leading-tight text-[var(--f2-mint)]" title={`Tachó (Ecofleet)\n${kocsi.tacho.reszletek}`}>
                        {kocsi.tacho.chip}
                      </div>
                    ) : null}
                  </td>
                  {kocsi.cellak.map((c) => {
                    const m = ut ? merleg.get(c.nap) : undefined;
                    const szabadRes = c.resek.find((r) => r.haza) ?? c.resek[c.resek.length - 1];
                    const szabadHref = szabadRes ? hetLink(het, szabadRes.kulcs)
                      : `/fuvarozas2/timocom?honnan=${encodeURIComponent(m?.vegez?.varos ?? "")}`;
                    return (
                    <Fragment key={c.nap}>
                    {savElott.has(c.nap) ? <SzunetSav cimke={savElott.get(c.nap)!} /> : null}
                    <td className={cn("px-1.5 py-2", c.nap === adat.ma && "bg-muted/40")}>
                      <div className="flex flex-col gap-1">
                        {/* Útvonal-sorrendben: minden üres út közvetlenül az elé a fuvar elé, amelyhez vezet. */}
                        {c.resek.filter((r) => !r.haza && !c.fuvarok.some((f) => f.id === r.elott)).map((r) => <ResChip key={r.kulcs} r={r} aktiv={k?.kulcs === r.kulcs} het={het} />)}
                        {c.fuvarok.map((f) => (
                          <Fragment key={f.id}>
                          {c.resek.filter((r) => !r.haza && r.elott === f.id).map((r) => <ResChip key={r.kulcs} r={r} aktiv={k?.kulcs === r.kulcs} het={het} />)}
                          {eredmeny.has(f.id) ? <UtemKartya f={f} e={eredmeny.get(f.id)!} nap={c.nap} szerep={szerep(f.id, c.nap)} /> : <Link href={`/fuvarozas2/megbizasok?reszlet=${f.id}`}
                            className={cn("block rounded-lg px-2 py-1 text-xs", f.sajat ? "bg-[var(--f2-blue-l)] text-[var(--f2-blue)]" : "bg-[var(--f2-mint-l)] text-[#0f5240]", fuvarJel(f.allapot) === "kesz" && "opacity-55")}>
                            <div className="truncate font-semibold">
                              {fuvarJel(f.allapot) === "kesz" ? "✓ " : fuvarJel(f.allapot) === "uton" ? <span className="mr-1 inline-block size-1.5 rounded-full bg-current align-middle" title="úton" /> : null}
                              {f.cim}
                            </div>
                            <div className="truncate">{f.felVaros} → {f.leVaros}</div>
                          </Link>}
                          </Fragment>
                        ))}
                        {c.resek.filter((r) => r.haza).map((r) => <ResChip key={r.kulcs} r={r} aktiv={k?.kulcs === r.kulcs} het={het} />)}
                        {c.szabad ? <div className="rounded-lg px-2 py-1 text-xs text-muted-foreground/70">szabad</div> : null}
                        {m ? <NapMerlegSav m={m} szabadHref={szabadHref} /> : null}
                      </div>
                    </td>
                    </Fragment>
                    );
                  })}
                </tr>
                );
              })}
              {adat.kiosztatlan.some((c) => c.length) ? (
                <tr className="border-t border-foreground/10 align-top">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-[var(--f2-red)]">Kocsira vár</div>
                    <div className="text-xs text-muted-foreground">{adat.kiosztatlan.flat().length} fuvar</div>
                  </td>
                  {adat.kiosztatlan.map((c, i) => (
                    <Fragment key={adat.napok[i]}>
                    {savElott.has(adat.napok[i]) ? <SzunetSav cimke={savElott.get(adat.napok[i])!} /> : null}
                    <td className={cn("px-1.5 py-2", adat.napok[i] === adat.ma && "bg-muted/40")}>
                      <div className="flex flex-col gap-1">
                        {c.map((f) => (
                          <Link key={f.id} href={`/fuvarozas2/megbizasok?reszlet=${f.id}`}
                            className="block rounded-lg bg-[var(--f2-red-l)] px-2 py-1 text-xs text-[var(--f2-red)] ring-1 ring-[var(--f2-red)]/30">
                            <div className="truncate font-semibold">{f.cim}</div>
                            <div className="truncate">{f.felVaros} → {f.leVaros}</div>
                          </Link>
                        ))}
                      </div>
                    </td>
                    </Fragment>
                  ))}
                </tr>
              ) : null}
            </tbody>
          </table>
          <p className="border-t px-4 py-2 text-xs text-muted-foreground">Rés: 100 km-nél hosszabb üres út két fuvar között vagy hazafelé (légvonal × 1,3). Kattints rá: lent látod, mi illik bele és kit érdemes hívni.</p>
        </section>

        <aside className="flex flex-col gap-3">
          <section className="rounded-2xl bg-card ring-1 ring-foreground/10">
            <div className="flex items-baseline gap-2 px-4 pt-3 pb-1">
              <h2 className="font-semibold">Bejövő ajánlatok</h2>
              <span className="rounded-full bg-muted px-2 text-xs">{friss.length}</span>
              <span className="ml-auto text-[11px] text-muted-foreground">24 óránál régebbi: lent</span>
            </div>
            {friss.length ? <AjanlatLista lista={friss} het={het} /> : <p className="px-4 pb-3 text-sm text-muted-foreground">Nincs friss nyitott ajánlat.</p>}
            {regi.length ? (
              <details className="border-t">
                <summary className="cursor-pointer px-4 py-2 text-sm text-muted-foreground">Régebbi ajánlatok ({regi.length}) — valószínűleg már elkeltek</summary>
                <AjanlatLista lista={regi} het={het} />
              </details>
            ) : null}
          </section>
          {kiment.length ? (
            <section className="rounded-2xl bg-card ring-1 ring-foreground/10">
              <div className="flex items-baseline gap-2 px-4 pt-3 pb-1">
                <h2 className="font-semibold">Kiment ajánlataink</h2>
                <span className="rounded-full bg-muted px-2 text-xs">{kiment.length}</span>
                <span className="ml-auto text-[11px] text-muted-foreground">válaszra vár</span>
              </div>
              <AjanlatLista lista={kiment} het={het} />
            </section>
          ) : null}
          <Link href="/fuvarozas2/timocom" className="rounded-2xl border border-dashed px-4 py-3 text-sm hover:bg-muted/50">
            <b>Ajánlat beillesztése</b>
            <div className="text-xs text-muted-foreground">Timocom szöveg vagy „→ WWP” gomb</div>
          </Link>
        </aside>
      </div>

      {k ? (
        <section id="res" className="scroll-mt-4 rounded-2xl bg-card ring-1 ring-foreground/10">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pt-4">
            <h2 className="text-lg font-semibold">{k.sofor} · {rovidNap(k.nap)} · {k.honnan} → {k.haza ? "haza" : k.hova}</h2>
            <span className="text-sm text-[var(--f2-amb)]">{k.km} km üres ≈ {ft(k.ft)}</span>
          </div>
          <div className="grid gap-4 p-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="overflow-x-auto">
              {ehhez.length ? (
                <table className="w-full min-w-[620px] text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr><th className="py-1.5 font-medium">Ajánlat</th><th className="px-2 py-1.5 text-right font-medium">+km</th><th className="px-2 py-1.5 text-right font-medium">+idő</th><th className="px-2 py-1.5 text-right font-medium">Többlet</th><th className="px-2 py-1.5 text-right font-medium">Mennyit kérj</th><th /></tr>
                  </thead>
                  <tbody>
                    {ehhez.map((a) => (
                      <tr key={a.id} className="border-t border-foreground/5">
                        <td className="py-2"><b>{a.megbizo ?? "Timocom"}</b> <span className="text-muted-foreground">· {a.felVaros} → {a.leVaros}</span>{a.ehhez!.draga ? <span className="ml-2 rounded-full bg-[var(--f2-amb-l)] px-2 text-[11px] text-[#5a3806]">drága</span> : null}
                          <span className={cn("block text-[11px]", a.regi ? "text-[var(--f2-amb)]" : "text-muted-foreground")}>{a.allapot === "ajanlva" ? "ajánlat kiment · " : ""}{a.kor}{a.regi ? " · valószínűleg elkelt" : ""}</span></td>
                        <td className="px-2 py-2 text-right tabular-nums">+{a.ehhez!.plusKm}</td>
                        <td className="px-2 py-2 text-right tabular-nums">+{ido(a.ehhez!.plusPerc)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">+{ft(a.ehhez!.tobbletFt)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          <span className="block" title={`teljes önköltség ${ft(a.ehhez!.teljesFt)}`}>
                            {a.ehhez!.letra.fokok.map((f, i) => (
                              <span key={f.szazalek} className={i === 1 ? "font-bold" : "text-xs text-muted-foreground"}>{i ? " · " : ""}+{f.szazalek}% {ezer(f.ft)}</span>
                            ))}
                          </span>
                          <span className="block text-xs text-muted-foreground">{a.ehhez!.letra.fokok.map((f) => (f.eur != null ? eur(f.eur) : "—")).join(" · ")} €</span>
                          <span className="block text-[11px] text-muted-foreground/80">alsó határ visszfuvarnál {ezer(a.ehhez!.alsoFt)}{a.ehhez!.alsoEur != null ? ` · ${eur(a.ehhez!.alsoEur)} €` : ""}{a.ehhez!.elozmenyFt ? ` · előzmény ${ezer(a.ehhez!.elozmenyFt)}` : ""}</span>
                        </td>
                        <td className="py-2 pl-2 text-right"><span className="flex flex-col items-end gap-1"><Link href={`/fuvarozas2/timocom?id=${a.id}`} className="rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-muted">Megnyitom</Link>{szerkeszthet ? <AjanlatGombok id={a.id} allapot={a.allapot} javaslat={{ jarmuKod: k.kocsi, felrakasNap: k.nap, dijFt: a.ehhez!.kerjFt }} /> : null}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="text-sm text-muted-foreground">Ebbe a résbe most nincs illő ajánlat. Keress a Timocomon {k.honnan} környékéről {k.haza ? "hazafelé" : `${k.hova} felé`}, vagy hívd a jobb oldali megbízókat.</p>}
              <p className="mt-2 text-xs text-muted-foreground">
                +km: a kerülő a rés útjához képest (légvonal × 1,3). Többlet: +km × {adat.kmKoltseg} Ft/km (üzemanyag + útdíj) + az idő a napi fix arányában.
                Mennyit kérj (félkövér): az ajánlat teljes önköltsége (ráállás + rakott út × {adat.kmKoltseg} Ft/km + az idő a napi fix arányában) + 20%; mellette +10% (minimum) és +30%. Alsó határ visszfuvarnál: a többlet + 10%. Felfelé kerekítve 1 000 Ft-ra, 10 €-ra{adat.eurArfolyam ? `, ${adat.eurArfolyam.toLocaleString("hu-HU", { maximumFractionDigits: 2 })} Ft/EUR` : ", EUR-árfolyam nélkül"}); előzmény: a hasonló korábbi fuvarjaink Ft/km-e, ha volt ilyen.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/fuvarozas2/timocom?honnan=${encodeURIComponent(k.honnan)}&hova=${encodeURIComponent(k.hova)}`} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">Kalkulátor ezzel a réssel →</Link>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold">Kiket hívj · saját múltból</h3>
              <p className="mb-2 text-xs text-muted-foreground">felrakó legfeljebb 50 km-re innen: {k.honnan} · legalább 2 korábbi fuvar</p>
              {adat.hivandok.length ? (
                <ul className="flex flex-col gap-2">
                  {adat.hivandok.map((h) => (
                    <li key={h.partner} className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                      <div className="flex items-baseline gap-2"><b className="truncate">{h.partner}</b><span className="ml-auto text-xs tabular-nums text-muted-foreground">{h.utolsoDijFt ? ezer(h.utolsoDijFt) : "—"} · {h.db}×</span></div>
                      <div className="text-xs text-muted-foreground">{h.utolsoUt} · {h.utolsoNap.slice(5).replace("-", ".")}.</div>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-foreground">Innen még nem volt visszatérő megbízónk.</p>}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function AjanlatLista({ lista, het }: { lista: HetAjanlat[]; het: string | null }) {
  return (
    <ul className="divide-y">
      {lista.map((a) => (
        <li key={a.id} className={cn("px-4 py-2.5", a.regi && a.allapot !== "ajanlva" && "opacity-70")}>
          <Link href={`/fuvarozas2/timocom?id=${a.id}`} className="block hover:underline">
            <div className="flex items-baseline gap-2 text-sm"><b className="truncate">{a.megbizo ?? "Timocom-ajánlat"}</b><span className="ml-auto shrink-0 text-xs text-muted-foreground">{a.kor}</span></div>
            <div className="text-sm">{a.felVaros} → {a.leVaros}{a.felNap ? ` · ${a.felNap.slice(5).replace("-", ".")}.` : " · dátum nélkül"}{a.arSzoveg ? ` · ${a.arSzoveg}` : ""}</div>
          </Link>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn("text-xs", a.illik ? (a.illik.draga ? "text-[var(--f2-amb)]" : "text-[var(--f2-mint)]") : "text-muted-foreground")}>
              {a.illik
                ? <>illik: <Link className="underline" href={hetLink(het, a.illik.res.kulcs)} scroll={false}>{a.illik.res.sofor} {rovidNap(a.illik.res.nap)} rés</Link> · +{ft(a.illik.tobbletFt)}{a.illik.draga ? " · drága" : ""}</>
                : a.nincsHely ? "a helyet nem sikerült térképre tenni" : "egyik résbe sem illik"}
            </span>
            <span className="ml-auto"><AjanlatGombok id={a.id} allapot={a.allapot} /></span>
          </div>
        </li>
      ))}
    </ul>
  );
}
