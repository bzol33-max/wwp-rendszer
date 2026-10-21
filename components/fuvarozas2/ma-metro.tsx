import Link from "next/link";
import type { CSSProperties } from "react";
import { Lock } from "lucide-react";
import type { MaKocsi, MaFuvarAdat } from "@/lib/fuvarozas2/ma-vaszon";
import type { TukorSor, TukorAllas } from "@/lib/fuvarozas2/ma-tukor";
import type { KocsiSav } from "@/lib/fuvarozas2/kocsi-sav-alap";
import { aktualisEsKovetkezo, fogyasztasElteres, kocsiAzElejen, metroElemek, type MegbizasKartya, type MetroElem } from "@/lib/fuvarozas2/ma-metro-alap";
import { kocsiSzin } from "@/lib/fuvarozas2/kocsi-szin";
import { bejegyzesIdo, tipusNev, TAVOLLET_NEV, type TavolletTipus } from "@/lib/fuvarozas2/bejegyzes-alap";
import { BejegyzesIkon } from "@/components/fuvarozas2/bejegyzes-ikon";
import { ForrasJel } from "@/components/fuvarozas2/forras-jel";
import { AllasRogzitesGomb } from "@/components/fuvarozas2/allas-rogzites";
import { KocsiSavLab } from "@/components/fuvarozas2/kocsi-savok";

// A Ma oldal kocsikártyája „metróvonallal” (Budaházi Zoltán, 2026-10-21, V11):
// fejléc (ki, hol, mikor ér le), a mai megállók egy vízszintes vonalon (teli
// pötty = kész, gyűrű = most, üres = hátravan; tömör = rakott, pontozott =
// üres), alatta tachó + fogyasztás, és két kártya: az aktuális és a következő
// megbízás. Szerver-komponens.

const reszlet = (id: string) => `/fuvarozas2/megbizasok?reszlet=${id}`;

const ALLAPOT_PONT = { mint: "bg-[var(--f2-mint)]", amber: "bg-[var(--f2-amb)]", red: "bg-[var(--f2-red)]", normal: "bg-foreground/40" } as const;

function szinValtozok(szin: string | null | undefined): CSSProperties {
  const s = kocsiSzin(szin);
  return { "--kc": s.c, "--kl": s.l, "--kd": s.d } as CSSProperties;
}

function napCimke(nap: string | null, ma: string): string {
  if (!nap || nap === ma) return "";
  return `${nap.slice(5).replace("-", ".")}. `;
}

function Vonal({ elemek }: { elemek: MetroElem[] }) {
  const elejen = kocsiAzElejen(elemek);
  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex min-w-[560px] items-center px-10 pb-8 pt-9">
        {elejen ? <KocsiJel /> : null}
        {elemek.map((e, i) => {
          if (e.tipus === "allas") {
            return (
              <span key={i} className="relative mx-0.5 shrink-0 rounded-md bg-[var(--f2-amb-l)] px-1.5 text-[10px] font-semibold leading-4 text-[#6b430a]" title="nem tervezett GPS-állás">
                {e.szoveg}
              </span>
            );
          }
          if (e.tipus === "szakasz") {
            const cls = e.rakott
              ? e.kesz ? "h-1.5 bg-[var(--kc)]" : "h-1 bg-[repeating-linear-gradient(90deg,var(--kc)_0_6px,transparent_6px_11px)] opacity-70"
              : e.kesz ? "h-[3px] bg-[repeating-linear-gradient(90deg,#808984_0_6px,transparent_6px_11px)]" : "h-[3px] bg-[repeating-linear-gradient(90deg,#c3c8c5_0_6px,transparent_6px_11px)]";
            return (
              <div key={i} className="relative mx-0.5 flex min-w-8 flex-1 items-center">
                <div className={`w-full rounded-full ${cls}`} />
                {!e.rakott ? <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground">üres</span> : null}
                {e.kocsiItt ? <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"><KocsiJel /></span> : null}
              </div>
            );
          }
          const pont =
            e.allapot === "kesz" ? "size-3.5 bg-[var(--kc)]"
            : e.allapot === "most" ? `size-4 border-[3px] bg-card animate-pulse ${e.kiemelt === "varakozik" ? "border-[var(--f2-red)]" : "border-[var(--kc)]"}`
            : e.allapot === "kovetkezo" ? "size-3.5 border-[3px] border-[var(--kc)] bg-card"
            : "size-3.5 border-2 border-foreground/25 bg-card";
          return (
            <Link key={i} href={reszlet(e.fuvarId)} className="relative flex size-5 shrink-0 items-center justify-center hover:opacity-80" title={`${e.felLe === "felrako" ? "Felrakó" : "Lerakó"}: ${e.varos}`}>
              <span className={`rounded-full ${pont}`} />
              {e.jel ? <span className="absolute -top-8 left-1/2 max-w-32 -translate-x-1/2 truncate text-[10px] font-semibold text-[var(--kd)]">{e.jel} ▸</span> : null}
              {e.ido ? <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] text-muted-foreground">{e.ido}</span> : null}
              <span className={`absolute left-1/2 top-5 max-w-36 -translate-x-1/2 truncate text-center text-xs ${e.allapot === "most" || e.allapot === "kovetkezo" ? "font-semibold" : e.allapot === "hatra" ? "text-muted-foreground" : ""}`}>
                {e.varos}{e.allapot === "kesz" ? " ✓" : ""}
              </span>
              {e.elteres && e.allapot !== "kesz" && e.elteres !== "ablakban" ? (
                <span className={`absolute left-1/2 top-9 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 text-[10px] font-semibold ${e.elteres.startsWith("késik") ? "bg-[var(--f2-red-l)] text-[var(--f2-red)]" : "bg-[var(--f2-blue-l)] text-[var(--f2-blue)]"}`}>{e.elteres}</span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function KocsiJel() {
  return <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--kc)] text-xs text-white shadow-[0_0_0_3px_var(--card)]" aria-label="a kocsi most">▸</span>;
}

function AllasLista({ sorok }: { sorok: TukorSor[] }) {
  const allasok: { a: TukorAllas; varos: string | null }[] = [];
  for (const r of sorok) {
    if (r.tipus === "allas") allasok.push({ a: r.allas, varos: null });
    else if (r.tipus === "megallo" && r.allas) allasok.push({ a: r.allas, varos: r.varos });
  }
  if (!allasok.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {allasok.map(({ a, varos }, i) => (
        <div key={i} className="rounded-lg bg-[var(--f2-amb-l)] px-2 py-1 text-[11px] leading-snug text-[#6b430a]">
          <b>{a.folyamatban ? `áll ${a.tol} óta (${a.percek} p)` : `állt ${a.percek} p · ${a.tol}–${a.ig}`}</b>
          {a.cim ? <> · GPS: {a.cim}</> : null}
          {varos ? <> · a cím nincs rögzítve{a.rogzites ? <> · <AllasRogzitesGomb {...a.rogzites} varos={varos} /></> : null}</> : <> · nem tervezett állás</>}
        </div>
      ))}
    </div>
  );
}

function MegbizasDoboz({ cim, k, f, ma }: { cim: string; k: MegbizasKartya; f: MaFuvarAdat | undefined; ma: string }) {
  const aktiv = cim === "Aktuális";
  return (
    <div className={`flex min-w-0 flex-col gap-1 rounded-xl px-3 py-2.5 text-xs ${aktiv ? "bg-[var(--kl)] shadow-[inset_3px_0_0_var(--kc)]" : "bg-muted/40 ring-1 ring-foreground/10"}`}>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{cim}{k.holnap ? " · holnap" : ""}</span>
        <span className="rounded-full bg-card px-2 text-[11px] font-medium text-[var(--kd)] ring-1 ring-[var(--kc)]/30">{k.allapot}</span>
        <Link href={reszlet(k.fuvarId)} className="ml-auto truncate font-semibold text-[var(--f2-mint)] hover:underline">
          {f?.hivatkozas ? `#${f.hivatkozas}` : "megbízás"} →
        </Link>
      </div>
      <Link href={reszlet(k.fuvarId)} className="truncate text-sm font-semibold hover:underline">{f?.utvonal ?? [k.fel?.varos, k.le?.varos].filter(Boolean).join(" → ")}</Link>
      <div className="flex flex-wrap gap-x-3.5 text-muted-foreground">
        <span>Megbízó <b className="font-medium text-foreground">{f?.partner ?? "—"}</b></span>
        {k.fel ? <span>fel <b className="font-medium text-foreground">{k.fel.kesz ? "✓ " : ""}{k.fel.ido ?? napCimke(f?.felrakasNap ?? null, ma) ?? "—"}</b></span> : f?.felrakasNap ? <span>fel <b className="font-medium text-foreground">{napCimke(f.felrakasNap, ma) || "ma"}</b></span> : null}
        {k.le ? <span>le <b className="font-medium text-foreground">{k.le.kesz ? "✓ " : ""}{k.le.ido ?? "—"}</b></span> : f?.lerakasNap ? <span>le <b className="font-medium text-foreground">{napCimke(f.lerakasNap, ma) || "ma"}</b></span> : null}
        <span>Díj <b className="font-medium text-foreground">{f?.jelleg === "sajat" ? "saját fuvar" : f?.dij ?? "—"}</b></span>
      </div>
      {k.ceg || k.telefon ? (
        <div className="flex flex-wrap gap-x-3 text-muted-foreground">
          {k.ceg ? <span className="truncate">{k.ceg}</span> : null}
          {k.telefon ? <a href={`tel:${k.telefon}`} className="font-semibold text-[var(--f2-mint)] hover:underline">📞 {[k.kontakt, k.telefon].filter(Boolean).join(" · ")}</a> : null}
        </div>
      ) : null}
    </div>
  );
}

function UresDoboz({ cim, szoveg, href, link }: { cim: string; szoveg: string; href?: string; link?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl bg-[var(--f2-amb-l)] px-3 py-2.5 text-xs text-[#6b430a]">
      <span className="text-[11px] font-semibold uppercase tracking-wide">{cim}</span>
      <span className="text-sm font-semibold">{szoveg}</span>
      {href && link ? <Link href={href} className="font-semibold hover:underline">{link} →</Link> : null}
    </div>
  );
}

function SemlegesDoboz({ cim, szoveg }: { cim: string; szoveg: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl bg-muted/40 px-3 py-2.5 text-xs ring-1 ring-foreground/10">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{cim}</span>
      <span className="text-sm font-semibold">{szoveg}</span>
    </div>
  );
}

function TavolletSor({ t }: { t: TavolletTipus }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-[var(--kd)] ring-1 ring-[var(--kc)]"
      style={{ backgroundImage: "repeating-linear-gradient(135deg, var(--kl) 0 7px, transparent 7px 14px)" }}>
      <Lock className="size-3.5 shrink-0" aria-hidden />{TAVOLLET_NEV[t]} · Jelenlétből · ne tervezz
    </div>
  );
}

export function MetroKocsi({ k, ma, holnapCimke, piheno, flottaL100, sav }: {
  k: MaKocsi; ma: string; holnapCimke: string; piheno: boolean; flottaL100: number | null; sav?: KocsiSav | null;
}) {
  const elemek = metroElemek(k.sorok);
  const { aktualis, kovetkezo, maKesz } = aktualisEsKovetkezo(k.sorok, k.holnap.map((b) => b.id));
  const adat = new Map((k.fuvarAdat ?? []).map((f) => [f.id, f]));
  const jelzesek = k.jelzesek ?? [];
  const l100 = k.fogyasztas?.l100 ?? null;
  const elteres = fogyasztasElteres(l100, flottaL100);
  const egeszNaposMa = (k.bejegyzesekMa ?? []).some((b) => !b.tol);
  const egeszNaposHolnap = (k.bejegyzesekHolnap ?? []).some((b) => !b.tol);
  const hl = holnapCimke.toLowerCase();

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-foreground/10 bg-card" style={szinValtozok(k.szin)} aria-label={k.sofor ?? k.cimke}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-5 pt-4">
        <span className="size-2.5 shrink-0 rounded-full bg-[var(--kc)]" aria-hidden />
        <b className="text-base">{k.sofor ?? "nincs sofőr"}</b>
        <span className="text-xs text-muted-foreground">{k.cimke}</span>
        {k.allapot ? (
          <span className="flex min-w-0 items-center gap-1.5 rounded-full bg-muted/60 px-2 py-0.5 text-xs">
            <span className={`size-2 shrink-0 rounded-full ${ALLAPOT_PONT[k.allapot.szin]}`} />
            <span className={`truncate font-semibold ${k.allapot.szin === "amber" ? "text-[var(--f2-amb)]" : "text-[var(--kd)]"}`}>{k.allapot.szoveg}</span>
            {k.allapot.hely ? <span className="truncate text-muted-foreground">· {k.allapot.hely}</span> : null}
          </span>
        ) : null}
        {k.etaSor ? <span className="ml-auto text-xs text-muted-foreground">{k.etaSor}</span> : null}
      </div>

      {jelzesek.length ? (
        <div className="mt-2 flex flex-col" role="status" aria-label="Figyelmeztetések">
          {jelzesek.map((j, i) => (
            <div key={i} className={`px-5 py-1 text-xs font-semibold ${j.szin === "red" ? "bg-[var(--f2-red-l)] text-[var(--f2-red)]" : "bg-[var(--f2-amb-l)] text-[#6b430a]"}`}><span aria-hidden>⚠ </span>{j.szoveg}</div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 px-5 pb-4 pt-2">
        {k.tavolletMa ? <TavolletSor t={k.tavolletMa} /> : null}
        {(k.bejegyzesekMa ?? []).map((b) => (
          <div key={`${b.id}-${b.alkalom}`} className="flex items-center gap-1.5 text-xs text-foreground/80">
            <BejegyzesIkon tipus={b.tipus} className="size-3.5 shrink-0 text-muted-foreground" />
            <b>{tipusNev(b.tipus)}</b> <span className="tabular-nums">{bejegyzesIdo(b)}</span>{b.hely ? <span className="text-muted-foreground">· {b.hely}</span> : null}
          </div>
        ))}

        {elemek.length ? (
          <Vonal elemek={elemek} />
        ) : piheno ? (
          <div className="rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">Pihenőnap (hétvége / ünnep)</div>
        ) : k.tavolletMa || egeszNaposMa ? null : (
          <Link href="/fuvarozas2/tervezes" className="rounded-xl bg-[var(--f2-amb-l)] px-3 py-2 text-xs font-semibold text-[var(--f2-amb)] hover:underline">Ma nincs fuvar — keress →</Link>
        )}

        <AllasLista sorok={k.sorok} />

        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-t border-foreground/10 pt-2.5 text-xs text-muted-foreground">
          {k.vezetesSor ? (
            <span className={k.vezetesForras === "tacho" ? "font-medium text-foreground" : ""} title={k.tacho?.reszletek}>
              {k.vezetesSor}{" "}
              {k.vezetesForras === "tacho"
                ? <ForrasJel forras="teny" cimke="tachó" title={`Ecofleet tachográf-adat${k.tacho?.reszletek ? `\n${k.tacho.reszletek}` : ""}`} />
                : <ForrasJel forras="becsles" cimke="GPS-becslés" title="GPS-ből számolt becslés, nem tachográf" />}
            </span>
          ) : <span>Tachó: —</span>}
          {k.vezetesForras !== "tacho" && k.hetiSor ? <span>{k.hetiSor}</span> : null}
          <span title="Ecofleet CAN, utolsó 7 nap">
            <b className="tabular-nums text-foreground">{l100 != null ? l100.toLocaleString("hu-HU") : "—"}</b> l/100
            {elteres != null ? (
              <span className={`ml-1 rounded-full px-1.5 text-[11px] font-semibold ${elteres > 0 ? "bg-[var(--f2-amb-l)] text-[var(--f2-amb)]" : "bg-[var(--f2-mint-l)] text-[var(--f2-mint)]"}`}>
                {elteres > 0 ? "+" : ""}{elteres} % a flottához
              </span>
            ) : null}
          </span>
          {k.fogyasztas?.szervizHatraKm != null && k.fogyasztas.szervizHatraKm < 10000 ? (
            <span className={k.fogyasztas.szervizHatraKm < 3000 ? "font-semibold text-[var(--f2-amb)]" : ""}>szervizig {Math.round(k.fogyasztas.szervizHatraKm).toLocaleString("hu-HU")} km</span>
          ) : null}
          {k.napiKm != null ? <span>ma <b className="text-foreground">{k.napiKm} km</b></span> : null}
          {k.papir.map((p) => <Link key={p.szoveg} href={p.href} className="font-semibold text-[var(--f2-amb)] hover:underline">{p.szoveg}</Link>)}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {aktualis ? (
            <MegbizasDoboz cim="Aktuális" k={aktualis} f={adat.get(aktualis.fuvarId)} ma={ma} />
          ) : (
            <SemlegesDoboz cim="Aktuális" szoveg={maKesz ? "Ma kész — nincs futó megbízás" : "Nincs futó megbízás"} />
          )}
          {kovetkezo ? (
            <MegbizasDoboz cim="Következő" k={kovetkezo} f={adat.get(kovetkezo.fuvarId)} ma={ma} />
          ) : k.tavolletHolnap ? (
            <UresDoboz cim={`Következő · ${hl}`} szoveg={`${TAVOLLET_NEV[k.tavolletHolnap]} — ${k.cimke} sofőr nélkül`} href="/fuvarozas2/tervezes" link="Tervezés" />
          ) : egeszNaposHolnap ? (
            <SemlegesDoboz cim={`Következő · ${hl}`} szoveg={(k.bejegyzesekHolnap ?? []).filter((b) => !b.tol).map((b) => tipusNev(b.tipus)).join(", ")} />
          ) : k.holnapFolytatodik ? (
            <SemlegesDoboz cim="Következő" szoveg="A mai fuvar holnap folytatódik — utána még nincs megbízás" />
          ) : (
            <UresDoboz cim="Következő" szoveg={`Nincs következő megbízás (${hl} sem)`} href="/fuvarozas2/tervezes" link="Keress fuvart" />
          )}
        </div>
      </div>
      {sav ? <KocsiSavLab s={sav} /> : null}
    </article>
  );
}
