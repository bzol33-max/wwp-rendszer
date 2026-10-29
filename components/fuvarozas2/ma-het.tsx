import Link from "next/link";
import type { CSSProperties } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Elteres, MaKocsi, MaVaszon, TukorAllas, TukorSor } from "@/lib/fuvarozas2/ma-vaszon";
import type { TervezesHet } from "@/lib/fuvarozas2/tervezes-het";
import type { NapCella, Res } from "@/lib/fuvarozas2/tervezes-het-alap";
import type { FuvarEredmeny, NapMerleg } from "@/lib/fuvarozas2/heti-utemterv-alap";
import type { KihasznaltsagSor } from "@/lib/fuvarozas2/kihasznaltsag";
import type { KocsiSav } from "@/lib/fuvarozas2/kocsi-sav-alap";
import { bejegyzesFuvarId, bejegyzesIdo, napFoglalt, tipusNev, TAVOLLET_NEV, type Bejegyzes, type TavolletTipus } from "@/lib/fuvarozas2/bejegyzes-alap";
import { ledolgozosSzombat, munkaszunetiNap } from "@/lib/jelenlet/shared";
import { kocsiSzin } from "@/lib/fuvarozas2/kocsi-szin";
import { tachoCsik } from "@/lib/fuvarozas2/ma-kartya-alap";
import {
  allapotPirula, csuszikNap, csuszoFuvarok, fejlecIdo, ftSzoveg, fuvarCsoportok, gpsGond, kocsiBajban, kocsiElteresei, lezartCsoport, lezartOsszegzes,
  KEVES_TACHO_PERC, megjelenitettNapok, napNevHosszu, napSzakaszCim, nemNulla, oraPerc,
  type Pirula,
} from "@/lib/fuvarozas2/ma-het-alap";
import { fuvarJel } from "@/lib/fuvarozas2/tervezes-het-alap";
import { pihenoNapE } from "@/lib/fuvarozas2/ma-het";
import { hetLink } from "@/components/fuvarozas2/tervezes-het";
import { BejegyzesFelvitel, BejegyzesTorles } from "@/components/fuvarozas2/het-bejegyzes";
import { BejegyzesIkon } from "@/components/fuvarozas2/bejegyzes-ikon";
import { AllasRogzitesGomb } from "@/components/fuvarozas2/allas-rogzites";
import { ForrasJel } from "@/components/fuvarozas2/forras-jel";
import { SebessegOra } from "@/components/fuvarozas2/sebesseg-ora";

// Fuvarozás · Ma + hét egy lapon (redesign 5, U2c terv). A kocsi-oszlop fehér
// élő fejlécét a Ma-vászon (getMaVaszon), a szürke napok-listáját a
// getTervezesHet adja; a mai blokk megállói a Ma-vászon TERV/TÉNY soraiból
// jönnek. Új adatot nem számol. Szerver-komponens; 768 px alatt a régi mobil
// nézet marad (app/fuvarozas2/page.tsx).

const MEDDO = "text-[#6E6E73]";
const ALAP = "/fuvarozas2";

const reszlet = (id: string) => `/fuvarozas2/megbizasok?reszlet=${id}`;
const kocsiLapHref = (kod: string) => `/fuvarozas2/kocsi/${encodeURIComponent(kod)}`;
const hhmm = (t: string) => t.slice(11, 16);
const km = (x: number) => Math.round(x).toLocaleString("hu-HU");
const ezer = (x: number) => `${Math.round(x / 1000).toLocaleString("hu-HU")} e`;

const szinValtozok = (szin: string | null | undefined): CSSProperties => {
  const s = kocsiSzin(szin);
  return { "--kc": s.c, "--kl": s.l, "--kd": s.d } as CSSProperties;
};

const SZIN_ERTEK: Record<string, string> = {
  normal: "text-foreground",
  mint: "text-foreground",
  amber: "text-[var(--f2-amb)]",
  red: "text-[var(--f2-red)]",
};

const PIRULA_OSZTALY: Record<Pirula["szin"], string> = {
  kek: "bg-primary/10 text-primary",
  piros: "bg-[var(--f2-red-l)] text-[var(--f2-red)]",
  narancs: "bg-[var(--f2-amb-l)] text-[var(--f2-amb)]",
  szurke: "bg-muted text-[#6E6E73]",
};

/** Nem munkanap-e (hétvége / munkaszüneti nap, ledolgozós szombat nélkül). */
function nemMunkanap(iso: string): boolean {
  if (ledolgozosSzombat(iso)) return false;
  if (munkaszunetiNap(iso)) return true;
  const d = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return d === 0 || d === 6;
}

type HetKocsi = TervezesHet["kocsik"][number];

// ───────────────────────── Iroda-sor ─────────────────────────

export function IrodaSor({ adat }: { adat: MaVaszon }) {
  const csempek = adat.csempek.filter((c) => c.kulcs !== "uton" && c.kulcs !== "elteres" && nemNulla(c.ertek));
  const holnap = adat.holnapDoboz.filter((h) => nemNulla(h.ertek));
  const fogyasztas = adat.flottaL100 != null && adat.flottaL100 > 0 ? adat.flottaL100 : null;
  if (!csempek.length && !holnap.length && fogyasztas == null) return null;
  const oszt = "inline-flex h-8 items-center gap-1.5 rounded-full bg-card px-3 text-[13px] shadow-[var(--shadow-card)]";
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Iroda">
      <span className="mr-1 text-sm font-semibold">Iroda</span>
      {csempek.map((c) => {
        const belso = (
          <>
            <span className={MEDDO}>{c.cimke}</span>
            <b className={cn("tabular-nums", SZIN_ERTEK[c.szin])}>{c.ertek}</b>
            {c.also ? <span className={MEDDO}>· {c.also}</span> : null}
          </>
        );
        return c.href
          ? <Link key={c.kulcs} href={c.href} className={cn(oszt, "hover:bg-muted")}>{belso}</Link>
          : <span key={c.kulcs} className={oszt}>{belso}</span>;
      })}
      {holnap.map((h) => (
        <span key={h.cimke} className={oszt}>
          <span className={MEDDO}>{h.cimke}</span>
          <b className={cn("tabular-nums", SZIN_ERTEK[h.szin])}>{h.ertek}</b>
        </span>
      ))}
      {fogyasztas != null ? (
        <span className={oszt} title="Ecofleet CAN, utolsó 7 nap, Σ liter / Σ km">
          <span className={MEDDO}>Fogyasztás · 7 nap</span>
          <b className="tabular-nums">{fogyasztas.toLocaleString("hu-HU")} l/100</b>
        </span>
      ) : null}
    </div>
  );
}

// ───────────────────────── Fejléc-sor jobb oldala ─────────────────────────

export function FejlecJobb({ adat, het, szerkeszthet }: { adat: MaVaszon; het: TervezesHet | null; szerkeszthet: boolean }) {
  const lapozo = "inline-flex h-8 items-center rounded-lg px-3 text-sm font-semibold ring-1 ring-foreground/20 hover:bg-muted";
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className={cn("text-sm", MEDDO)}>{fejlecIdo(adat.ma, adat.frissitve)}</span>
      {het ? (
        <>
          <nav className="flex items-center gap-1" aria-label="Napok">
            <Link href={hetLink(het.elozoHet, undefined, ALAP)} className={lapozo} aria-label="Előző napok">‹</Link>
            <Link href={ALAP} className={cn(lapozo, !het.ezAHet && "text-primary")} aria-current={het.ezAHet ? "date" : undefined}>Ma</Link>
            <Link href={hetLink(het.kovetkezoHet, undefined, ALAP)} className={lapozo} aria-label="Következő napok">›</Link>
          </nav>
          <BejegyzesFelvitel
            kocsik={het.kocsik.map((x) => ({ kod: x.kod, sofor: x.sofor, szin: x.szin ?? null }))}
            nap={het.napok.find((n) => n >= het.ma) ?? het.ma}
            mod="gomb"
            szerk={szerkeszthet}
          />
        </>
      ) : null}
    </div>
  );
}

// ───────────────────────── Figyelmeztetések (kimaradt fuvar, ismeretlen hely) ─────────────────────────

export function HetFigyelmeztetesek({ het }: { het: TervezesHet }) {
  if (!het.kimaradt.length && !het.helyNelkul.length) return null;
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      {het.kimaradt.length ? (
        <p className="rounded-xl bg-[var(--f2-red-l)] px-4 py-2 text-[var(--f2-red)]">
          <b>{het.kimaradt.length} fuvar nem került a táblára:</b>{" "}
          {het.kimaradt.map((h, i) => (
            <span key={h.id}>{i ? "; " : ""}<Link className="underline" href={reszlet(h.id)}>#{h.id} {h.cim} ({h.utvonal})</Link> — {h.ok}</span>
          ))}
        </p>
      ) : null}
      {het.helyNelkul.length ? (
        <p className="rounded-xl bg-[var(--f2-amb-l)] px-4 py-2 text-[var(--f2-amb)]">
          <b>{het.helyNelkul.length} fuvar helye nem ismert</b> — körülöttük a rés nem számolható:{" "}
          {het.helyNelkul.slice(0, 4).map((h, i) => (
            <span key={h.id}>{i ? ", " : ""}<Link className="underline" href={reszlet(h.id)}>{h.cim} ({h.utvonal})</Link></span>
          ))}
          {het.helyNelkul.length > 4 ? " …" : ""}. Javítsd a címet a megbízáson.
        </p>
      ) : null}
    </div>
  );
}

// ───────────────────────── A mai blokk (TERV · TÉNY) ─────────────────────────

function AllasSor({ a, varos }: { a: TukorAllas; varos: string | null }) {
  return (
    <div className="rounded-lg bg-[var(--f2-amb-l)] px-2 py-1 text-xs leading-snug text-[var(--f2-amb)]">
      <b>{a.folyamatban ? `áll ${a.tol} óta (${a.percek} p)` : `állt ${a.percek} p · ${a.tol}–${a.ig}`}</b>
      {a.cim ? <div className="truncate">GPS: {a.cim}</div> : null}
      {varos ? (
        <div>
          a cím nincs rögzítve
          {a.rogzites ? <> · <AllasRogzitesGomb {...a.rogzites} varos={varos} /></> : null}
        </div>
      ) : <div>nem tervezett állás</div>}
    </div>
  );
}

/** Egy megálló egy sorban: FEL/LE · város · TERV → TÉNY. Állás-sor és kontakt csak az aktuális megállónál. */
function MegalloSor({ r }: { r: Extract<TukorSor, { tipus: "megallo" }> }) {
  const kiemelt = r.allapot === "most" || r.allapot === "kovetkezo";
  const kesik = r.kiemelt === "kesik" || r.elteres?.startsWith("késik");
  const tenySzin = r.allapot === "kesz" ? "text-[var(--f2-mint)]" : kesik || r.kiemelt === "varakozik" ? "text-[var(--f2-red)]" : "text-foreground";
  const eltSzoveg = r.elteres && r.elteres !== "ablakban" ? r.elteres : null;
  return (
    <div className={cn("flex flex-col gap-0.5", r.allapot === "hatra" && "opacity-80")}>
      <Link href={reszlet(r.fuvarId)} className="flex items-baseline gap-2 hover:underline">
        <span className={cn("w-7 shrink-0 text-xs font-bold", MEDDO)}>{r.felLe === "felrako" ? "FEL" : "LE"}</span>
        <span className={cn("min-w-0 flex-1 truncate text-sm", kiemelt ? "font-bold" : "font-semibold")}>{r.varos}</span>
        <span className="flex shrink-0 items-baseline gap-1 text-[13px] tabular-nums">
          <span className={MEDDO}>{r.terv ?? "—"}</span>
          {r.teny ? (
            <>
              <span className={MEDDO} aria-hidden>→</span>
              <span className={tenySzin}>{r.teny}{r.allapot === "kesz" ? " ✓" : ""}</span>
            </>
          ) : null}
          {eltSzoveg ? <span className={cn("font-semibold", tenySzin)}>{eltSzoveg}</span> : null}
        </span>
      </Link>
      {kiemelt && r.allas ? <div className="pl-9"><AllasSor a={r.allas} varos={r.varos} /></div> : null}
      {kiemelt && (r.ceg || r.telefon) ? (
        <div className="flex flex-wrap gap-x-3 pl-9 text-[13px]">
          {r.ceg ? <span className={cn("truncate", MEDDO)}>{r.ceg}</span> : null}
          {r.telefon ? <a href={`tel:${r.telefon}`} className="font-semibold underline">📞 {[r.kontaktNev, r.telefon].filter(Boolean).join(" · ")}</a> : null}
        </div>
      ) : null}
    </div>
  );
}

function CsoportSorok({ sorok }: { sorok: TukorSor[] }) {
  return (
    <>
      {sorok.map((r, i) => r.tipus === "allas"
        ? <AllasSor key={`a${i}`} a={r.allas} varos={null} />
        : r.tipus === "megallo" ? <MegalloSor key={`m${i}`} r={r} /> : null)}
    </>
  );
}

function MaMegallok({ sorok }: { sorok: TukorSor[] }) {
  return (
    <div className="flex flex-col gap-2">
      {fuvarCsoportok(sorok).map((cs, i) => {
        const f = cs.fuvar;
        if (!f) return <CsoportSorok key={`g${i}`} sorok={cs.sorok} />;
        const jel = f.jelleg === "sajat" ? "SAJÁT" : "BÉR";
        if (lezartCsoport(cs)) {
          const o = lezartOsszegzes(cs);
          return (
            <details key={`f${f.fuvarId}`} className="text-[13px] opacity-65 open:opacity-100">
              <summary className="flex cursor-pointer list-none items-baseline gap-1.5 [&::-webkit-details-marker]:hidden">
                <span className="text-[var(--f2-mint)]" aria-hidden>✓</span>
                <span className={cn("text-xs font-bold tracking-wide", MEDDO)}>{jel}</span>
                <Link href={reszlet(f.fuvarId)} className="shrink-0 font-semibold hover:underline">{f.partner}</Link>
                <span className="min-w-0 truncate">· {o.elso} → {o.utolso}{o.lerakva ? ` · lerakva ${o.lerakva}` : ""}</span>
              </summary>
              <div className="mt-1.5 flex flex-col gap-2 border-l-2 border-foreground/10 pl-2">
                <CsoportSorok sorok={cs.sorok} />
              </div>
            </details>
          );
        }
        return (
          <div key={`f${f.fuvarId}`} className="flex flex-col gap-2">
            <Link href={reszlet(f.fuvarId)} className="mt-1 flex items-baseline gap-1.5 text-[13px] font-semibold hover:underline">
              <span className={cn("text-xs font-bold tracking-wide", MEDDO)}>{jel}</span>
              <span className="truncate">{f.partner}{f.hivatkozas ? ` · ${f.hivatkozas}` : ""}</span>
            </Link>
            <CsoportSorok sorok={cs.sorok} />
          </div>
        );
      })}
    </div>
  );
}

// ───────────────────────── Bejegyzés / távollét ─────────────────────────

function BejegyzesSor({ b, szerk, e }: { b: Bejegyzes; szerk: boolean; e?: FuvarEredmeny }) {
  const cimke = tipusNev(b.tipus);
  const keses = e?.megallok[0] && (e.legszukebbTartalek ?? 0) < 0 ? -(e.legszukebbTartalek ?? 0) : 0;
  return (
    <div className="flex items-start gap-1.5 rounded-xl bg-white px-3 py-2 text-[13px] shadow-[var(--shadow-card)]" title={b.megjegyzes ?? undefined}>
      <BejegyzesIkon tipus={b.tipus} className="mt-0.5 size-3.5 shrink-0 text-[#6E6E73]" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{cimke}{b.ismetles === "heti" ? <span className={cn("ml-1 font-normal", MEDDO)} title="hetente ismétlődik">↻</span> : null} <span className="font-normal tabular-nums">{bejegyzesIdo(b)}</span></div>
        {b.hely || b.megjegyzes ? <div className={cn("truncate", MEDDO)}>{b.hely ?? b.megjegyzes}</div> : null}
        {e?.megallok[0] ? (
          <div className={cn("tabular-nums", keses ? "font-semibold text-[var(--f2-red)]" : MEDDO)} title="A becslő szerint (odaút a kocsi előző helyéről)">
            odaér ~{hhmm(e.megallok[0].erkezes)}{e.uresKmElotte > 0 ? ` · ${km(e.uresKmElotte)} km` : ""}{keses ? ` · késik ${keses} p` : ""}
          </div>
        ) : null}
      </div>
      <BejegyzesTorles id={b.id} cimke={cimke} ismetlodo={b.ismetles === "heti"} alkalom={b.alkalom} szerk={szerk} />
    </div>
  );
}

function TavolletBlokk({ t, utkozik }: { t: TavolletTipus; utkozik: boolean }) {
  return (
    <div
      className="flex items-start gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold text-[var(--f2-amb)] ring-1 ring-[var(--f2-amb)]/50"
      style={{ backgroundImage: "repeating-linear-gradient(135deg, var(--f2-amb-l) 0 7px, transparent 7px 14px)" }}
    >
      <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <div>
        <div>{TAVOLLET_NEV[t]} · Jelenlétből · ne tervezz</div>
        {utkozik ? <div className="text-xs text-[var(--f2-red)]">⚠ fuvar van rajta, de a sofőr távol van</div> : null}
      </div>
    </div>
  );
}

// ───────────────────────── Napok-lista (nem mai napok) ─────────────────────────

function ResKartya({ r, aktiv, het }: { r: Res; aktiv: boolean; het: string | null }) {
  return (
    <Link
      href={hetLink(het, r.kulcs, ALAP)}
      scroll={false}
      className={cn("block rounded-xl bg-white px-3 py-2 ring-2", aktiv ? "ring-[var(--f2-red)]" : "ring-[var(--f2-red)]/50 hover:ring-[var(--f2-red)]")}
    >
      <div className="text-sm font-semibold text-[var(--f2-red)]">Rés · {km(r.km)} km üres</div>
      <div className={cn("truncate text-[13px]", MEDDO)}>{r.honnan} → {r.haza ? "haza" : r.hova}</div>
    </Link>
  );
}

function FuvarKartya({ f, e, szerep }: { f: NapCella["fuvarok"][number]; e?: FuvarEredmeny; szerep: "teljes" | "utolso" | "kozep" }) {
  const jel = fuvarJel(f.allapot);
  const fel = e?.megallok.find((m) => m.tipus === "felrako") ?? e?.megallok[0];
  const le = e ? [...e.megallok].reverse().find((m) => m.tipus === "lerako") ?? e.megallok[e.megallok.length - 1] : undefined;
  const t = szerep !== "kozep" ? e?.legszukebbTartalek ?? null : null;
  const meta = szerep === "kozep"
    ? "↳ úton"
    : [
        fel ? `fel ${hhmm(fel.kezdes)}` : null,
        le && le !== fel ? `le ${e?.becsles ? "~" : ""}${hhmm(le.erkezes)}` : null,
        szerep === "teljes" && e ? `${km(e.rakottKm)} km rakott${e.uresKmElotte > 0 ? ` · ${km(e.uresKmElotte)} üres` : ""}` : null,
        szerep === "teljes" && e?.dijFt != null ? ftSzoveg(e.dijFt) : null,
      ].filter(Boolean).join(" · ");
  return (
    <Link href={reszlet(f.id)} className={cn("block rounded-xl bg-white px-3 py-2 shadow-[var(--shadow-card)] hover:bg-muted/40", jel === "kesz" && "opacity-60")}>
      <div className="flex items-center gap-2 text-xs font-bold tracking-wide">
        <span className={MEDDO}>{f.sajat ? "SAJÁT" : "BÉR"} #{f.id}</span>
        {jel === "kesz" ? <span className="text-[var(--f2-mint)]">✓ kész</span> : jel === "uton" ? <span className="text-primary">úton</span> : null}
        {t != null ? (
          <span className={cn("ml-auto font-semibold tabular-nums", t < 0 ? "text-[var(--f2-red)]" : t < 60 ? "text-[var(--f2-amb)]" : MEDDO)} title={t >= 0 ? `${t} perc tartalék` : `${-t} perc késés`}>
            {t < 0 ? "−" : "+"}{Math.abs(t)} p
          </span>
        ) : null}
      </div>
      <div className="truncate text-sm font-semibold">{f.cim}</div>
      <div className={cn("truncate text-[13px]", MEDDO)}>{f.felVaros} → {f.leVaros}</div>
      {meta ? <div className={cn("truncate text-xs tabular-nums", MEDDO)}>{meta}</div> : null}
    </Link>
  );
}

function NapiMerleg({ m, foglalt, szabadHref }: { m: NapMerleg; foglalt: boolean; szabadHref: string }) {
  const vanTartalom = m.vegez || m.vezetesPerc > 0 || m.rakottKm > 0 || m.uresKm > 0 || m.napiPihenoTol || m.kamionstop;
  if (!vanTartalom) return null;
  const k = m.kamionstop;
  return (
    <div className={cn("flex flex-col gap-0.5 px-1 text-xs tabular-nums", MEDDO)}>
      {m.napiPihenoTol ? <div>■ napi pihenő ~{hhmm(m.napiPihenoTol)}-tól</div> : null}
      {k ? <div title={k.ok}>■ kamionstop {k.tol.slice(11, 16)} – {k.ig.slice(11, 16)}</div> : null}
      {m.vegez ? <div className="truncate">végez ~{hhmm(m.vegez.ido)} · {m.vegez.varos}</div> : null}
      <div className="truncate">
        km {km(m.rakottKm)} / {km(m.uresKm)}{m.berFt > 0 ? ` · bér ${ezer(m.berFt)}` : ""} · vezetés {oraPerc(m.vezetesPerc)} / {oraPerc(540)}
      </div>
      {m.delutanSzabad && !foglalt ? (
        <Link href={szabadHref} scroll={false} className="font-semibold text-[var(--f2-amb)] hover:underline">
          délután szabad · {oraPerc(m.delutanSzabad.maradekVezetesPerc)} vezetés →
        </Link>
      ) : null}
    </div>
  );
}

function NapSzakasz({ nap, ma }: { nap: string; ma: string }) {
  return (
    <div className={cn("flex items-center gap-2 pt-2 text-[13px] font-semibold", MEDDO)}>
      <span className="h-px flex-1 bg-foreground/10" />
      <span>{napSzakaszCim(nap)}{nap === ma ? " · ma" : ""}</span>
      <span className="h-px flex-1 bg-foreground/10" />
    </div>
  );
}

/** Egy nem mai nap: tömör kártyák, rés, szabad / távollét — a getTervezesHet cellájából. */
function NapTartalom({ kocsi, c, het, szerk }: { kocsi: HetKocsi; c: NapCella; het: TervezesHet; szerk: boolean }) {
  const ut = kocsi.utemterv ?? null;
  const eredmeny = new Map((ut?.fuvarok ?? []).map((e) => [e.id, e]));
  const m = ut?.napok.find((x) => x.nap === c.nap);
  const bej = kocsi.bejegyzesek?.[c.nap] ?? [];
  const tav = kocsi.tavollet?.[c.nap] ?? null;
  const foglalt = napFoglalt(bej, tav);
  const hetParam = het.ezAHet ? null : het.hetKezdet;
  // A fuvar szerepe a sorban: az első cella, ahol megjelenik = felrakó nap, az utolsó = lerakó nap.
  const elso = new Map<string, string>(), utolso = new Map<string, string>();
  for (const x of kocsi.cellak) for (const f of x.fuvarok) { if (!elso.has(f.id)) elso.set(f.id, x.nap); utolso.set(f.id, x.nap); }
  const szerep = (id: string): "teljes" | "utolso" | "kozep" => (elso.get(id) === c.nap ? "teljes" : utolso.get(id) === c.nap ? "utolso" : "kozep");
  const aktivRes = het.kijelolt?.kulcs;
  const szabadRes = c.resek.find((r) => r.haza) ?? c.resek[c.resek.length - 1];
  const szabadHref = szabadRes ? hetLink(hetParam, szabadRes.kulcs, ALAP) : `/fuvarozas2/timocom?honnan=${encodeURIComponent(m?.vegez?.varos ?? "")}`;
  const ures = !c.fuvarok.length && !bej.length && !tav && !c.resek.length;
  return (
    <div className="flex flex-col gap-1.5">
      {tav ? <TavolletBlokk t={tav} utkozik={c.fuvarok.length > 0} /> : null}
      {/* Útvonal-sorrendben: minden üres út közvetlenül az elé a fuvar elé, amelyhez vezet. */}
      {c.resek.filter((r) => !r.haza && !c.fuvarok.some((f) => f.id === r.elott)).map((r) => <ResKartya key={r.kulcs} r={r} aktiv={aktivRes === r.kulcs} het={hetParam} />)}
      {c.fuvarok.map((f) => (
        <div key={f.id} className="flex flex-col gap-1.5">
          {c.resek.filter((r) => !r.haza && r.elott === f.id).map((r) => <ResKartya key={r.kulcs} r={r} aktiv={aktivRes === r.kulcs} het={hetParam} />)}
          <FuvarKartya f={f} e={eredmeny.get(f.id)} szerep={szerep(f.id)} />
        </div>
      ))}
      {bej.map((b) => <BejegyzesSor key={`${b.id}-${b.alkalom}`} b={b} szerk={szerk} e={eredmeny.get(bejegyzesFuvarId(b))} />)}
      {c.resek.filter((r) => r.haza).map((r) => <ResKartya key={r.kulcs} r={r} aktiv={aktivRes === r.kulcs} het={hetParam} />)}
      {ures ? <div className={cn("px-1 text-[13px]", MEDDO)}>{nemMunkanap(c.nap) ? "pihenőnap" : "szabad"}</div> : null}
      {m ? <NapiMerleg m={m} foglalt={foglalt} szabadHref={szabadHref} /> : null}
    </div>
  );
}

/** A mai blokk: kék keretes fehér kártya, TERV · TÉNY — a Ma-vászon megállóiból. */
function MaBlokk({ k, kocsi, adat, piheno, szerk }: { k: MaKocsi; kocsi: HetKocsi | null; adat: MaVaszon; piheno: boolean; szerk: boolean }) {
  const bej = kocsi?.bejegyzesek?.[adat.ma] ?? null;
  const tav = k.tavolletMa ?? null;
  const eredmeny = new Map((kocsi?.utemterv?.fuvarok ?? []).map((e) => [e.id, e]));
  const egeszNapos = (k.bejegyzesekMa ?? []).some((b) => !b.tol);
  // Ha a Ma-vászonnak nincs mai megállója, de a hét cellájában van mai fuvar, az látszik (kártyaként).
  const cella = kocsi?.cellak.find((x) => x.nap === adat.ma);
  const cellaFuvar = k.sorok.length === 0 && cella && cella.fuvarok.length > 0;
  // A korábbi napról csúszó, még nyitott fuvarok már a mai sorokban vannak; itt külön jelölést kapnak.
  const csuszok = csuszoFuvarok(fuvarCsoportok(k.sorok), k.fuvarAdat ?? [], adat.ma);
  return (
    <section className="flex flex-col gap-2 rounded-xl bg-white p-3 shadow-[var(--shadow-card)] ring-2 ring-primary" aria-label="Ma">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-primary">Ma · {napNevHosszu(adat.ma).toLowerCase()}</h3>
        <span className={cn("text-xs font-bold tracking-wide", MEDDO)}>TERV · TÉNY</span>
      </div>
      {csuszok.map((c) => (
        <Link key={c.fuvarId} href={reszlet(c.fuvarId)} className="text-[13px] font-semibold text-[var(--f2-amb)] hover:underline">
          csúszik · {csuszikNap(c.eredetiNap)} <span className="font-normal">· {c.partner}</span>
        </Link>
      ))}
      {tav ? <TavolletBlokk t={tav} utkozik={k.sorok.length > 0} /> : null}
      {bej
        ? bej.map((b) => <BejegyzesSor key={`${b.id}-${b.alkalom}`} b={b} szerk={szerk} e={eredmeny.get(bejegyzesFuvarId(b))} />)
        : (k.bejegyzesekMa ?? []).map((b) => (
            <div key={`${b.id}-${b.alkalom}`} className="flex items-center gap-1.5 text-[13px]">
              <BejegyzesIkon tipus={b.tipus} className="size-3.5 shrink-0 text-[#6E6E73]" />
              <b>{tipusNev(b.tipus)}</b> <span className="tabular-nums">{bejegyzesIdo(b)}</span>{b.hely ? <span className={MEDDO}>· {b.hely}</span> : null}
            </div>
          ))}
      {k.sorok.length > 0 ? (
        <MaMegallok sorok={k.sorok} />
      ) : cellaFuvar ? (
        <div className="flex flex-col gap-1.5">
          {cella.fuvarok.map((f) => <FuvarKartya key={f.id} f={f} e={eredmeny.get(f.id)} szerep="teljes" />)}
        </div>
      ) : piheno ? (
        <div className={cn("text-[13px]", MEDDO)}>Pihenőnap (hétvége / ünnep)</div>
      ) : tav || egeszNapos ? null : (
        <div className={cn("text-[13px]", MEDDO)}>Ma nincs fuvar</div>
      )}
      {kocsi && cella ? cella.resek.map((r) => <ResKartya key={r.kulcs} r={r} aktiv={false} het={null} />) : null}
    </section>
  );
}

// ───────────────────────── Kocsi-oszlop ─────────────────────────

function HetSor({ s }: { s: KihasznaltsagSor | null | undefined }) {
  if (!s) return null;
  const reszek = [
    s.berBevetelFt > 0 ? ftSzoveg(s.berBevetelFt) : null,
    s.uresKm > 0 ? `üres ${km(s.uresKm)} km` : null,
    s.fizetosNapok > 0 ? `${s.fizetosNapok} nap fizetős` : null,
  ].filter(Boolean);
  if (!reszek.length) return null;
  return <div className="text-[13px] font-semibold tabular-nums">Hét: {reszek.join(" · ")}</div>;
}

export function MaHetKocsi({ k, adat, het, sav, hetSor, szerk }: {
  k: MaKocsi;
  adat: MaVaszon;
  het: TervezesHet | null;
  sav: KocsiSav | null;
  hetSor: KihasznaltsagSor | null | undefined;
  szerk: boolean;
}) {
  const kod = k.kod ?? k.cimke;
  const kocsi = het?.kocsik.find((x) => x.kod === kod) ?? null;
  const elteresek: Elteres[] = kocsiElteresei(adat.elteresek, k.kod);
  const bajban = kocsiBajban(k, elteresek);
  const pirula = allapotPirula(k, elteresek);
  const gps = gpsGond(k);
  const csik = tachoCsik(k.tachoNapiHatraPerc);
  const piheno = adat.maPihenonap ?? pihenoNapE(adat.ma);
  const kovetkezo = k.sorok.find((r): r is Extract<TukorSor, { tipus: "megallo" }> => r.tipus === "megallo" && (r.allapot === "most" || r.allapot === "kovetkezo"));
  const kovetkezoSzoveg = kovetkezo
    ? `${kovetkezo.felLe === "felrako" ? "Felrakó" : "Lerakó"}: ${kovetkezo.varos}${kovetkezo.terv ? ` · TERV ${kovetkezo.terv}` : ""}`
    : k.holnap[0] && !k.sorok.length ? `${adat.holnapCimke}: ${k.holnap[0].partner} · ${k.holnap[0].utvonal}` : null;
  const jelzesek = k.jelzesek ?? [];
  // „Üresen indul”: a ma és a következő munkanap üres útjai — csak a mai ablakban értelmes.
  const sajatRiasztasok = het?.ezAHet ? het.riasztasok.filter((r) => r.res.kocsi === kod) : [];
  const heti = adat.kihasznaltsag?.kocsik.find((x) => x.kod === kod)?.het ?? hetSor;
  const l100 = k.fogyasztas?.l100 ?? null;
  const hetiTacho = k.hetiSor?.split(" · ").find((x) => x.startsWith("hét"));

  const napok = het && kocsi ? megjelenitettNapok(het.napok, adat.ma, het.ezAHet) : null;
  const cellak = new Map((kocsi?.cellak ?? []).map((c) => [c.nap, c]));

  return (
    <article
      className={cn("flex min-h-0 flex-col overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-card)] xl:h-full", bajban && "ring-2 ring-[var(--f2-red)]")}
      style={szinValtozok(k.szin)}
      aria-label={k.sofor ?? k.cimke}
    >
      <div className="h-[3px] shrink-0 bg-[var(--kc)]" aria-hidden />
      <header className="@container flex shrink-0 flex-col gap-2 bg-white px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          {k.kod ? (
            <Link href={kocsiLapHref(k.kod)} className="min-w-0 truncate text-lg font-bold hover:underline" title={k.cimke}>{k.kod}</Link>
          ) : <span className="min-w-0 truncate text-lg font-bold">{k.cimke}</span>}
          <span className={cn("shrink-0 truncate text-xs", MEDDO)}>{k.sofor ?? "nincs sofőr"}</span>
        </div>
        <div className="flex items-center gap-3.5">
          <SebessegOra sebesseg={k.sebesseg} />
          <div className="flex min-w-0 flex-col">
            <span className={cn("text-xs", MEDDO)}>ma megtett</span>
            <div className="flex items-baseline gap-1 tabular-nums">
              <span className="text-[28px] font-bold leading-none tracking-[-0.02em] @[280px]:text-[34px]">{k.napiKm != null ? k.napiKm.toLocaleString("hu-HU") : "—"}</span>
              {k.napiKm != null ? <span className={cn("text-[15px] font-semibold", MEDDO)}>km</span> : null}
            </div>
            {l100 != null ? (
              <span className="mt-1 text-[13px] tabular-nums text-[#48484A]">{l100.toLocaleString("hu-HU")} l/100 · 7 nap</span>
            ) : null}
          </div>
        </div>
        {pirula ? (
          <span className={cn("inline-flex min-w-0 max-w-full items-center gap-1 self-start rounded-full px-2.5 py-px text-[13px] font-semibold", PIRULA_OSZTALY[pirula.szin])}>
            <span aria-hidden>●</span>
            <span className="truncate">{pirula.szoveg}{pirula.felkialto ? " !" : ""}{k.allapot?.hely ? ` · ${k.allapot.hely}` : ""}</span>
          </span>
        ) : k.allapot?.hely ? <div className="truncate text-sm">{k.allapot.hely}</div> : null}
        {kovetkezoSzoveg ? <div className="truncate text-[13px]" title={kovetkezoSzoveg}>{kovetkezoSzoveg}</div> : null}
        {csik != null ? (
          <div className="flex flex-col gap-1" title={k.tacho?.reszletek}>
            <div className="flex items-baseline justify-between gap-2">
              <span className={cn("text-xs", MEDDO)}>Tachó{hetiTacho ? ` · ${hetiTacho}` : ""}</span>
              <span className="flex items-center gap-1.5">
                <b className="text-[13px] font-semibold tabular-nums">{oraPerc(k.tachoNapiHatraPerc ?? 0)}</b>
                {k.vezetesForras === "tacho" ? <ForrasJel forras="teny" cimke="tachó" title={`Ecofleet tachográf-adat${k.tacho?.reszletek ? `\n${k.tacho.reszletek}` : ""}`} /> : null}
              </span>
            </div>
            <span className="h-1 rounded-full bg-foreground/10" role="meter" aria-label="Napi vezetési idő hátra" aria-valuemin={0} aria-valuemax={100} aria-valuenow={csik}>
              <span className={cn("block h-1 rounded-full", bajban && (k.tachoNapiHatraPerc ?? 999) < KEVES_TACHO_PERC ? "bg-[var(--f2-red)]" : "bg-[var(--kc)]")} style={{ width: `${csik}%` }} />
            </span>
          </div>
        ) : k.vezetesSor ? (
          <div className={cn("text-xs", MEDDO)} title={k.tacho?.reszletek}>
            {k.vezetesSor}{k.hetiSor ? ` · ${k.hetiSor}` : ""}{" "}
            <ForrasJel forras="becsles" cimke="GPS-becslés" title="GPS-ből számolt becslés, nem tachográf" />
          </div>
        ) : null}
        {gps ? <div className="text-xs text-[var(--f2-amb)]">{gps}</div> : null}
      </header>

      {jelzesek.length || sajatRiasztasok.length ? (
        <div className="flex shrink-0 flex-col" role="status" aria-label="Figyelmeztetések">
          {jelzesek.map((j, i) => (
            <div key={i} className={cn("px-4 py-1 text-[13px] font-semibold", j.szin === "red" ? "bg-[var(--f2-red-l)] text-[var(--f2-red)]" : "bg-[var(--f2-amb-l)] text-[var(--f2-amb)]")}>
              <span aria-hidden>⚠ </span>{j.szoveg}
            </div>
          ))}
          {sajatRiasztasok.map((r) => (
            <Link
              key={r.res.kulcs}
              href={hetLink(null, r.res.kulcs, ALAP)}
              scroll={false}
              className="bg-[var(--f2-amb-l)] px-4 py-1 text-[13px] font-semibold text-[var(--f2-amb)] hover:underline"
            >
              <span aria-hidden>⚠ </span>Üresen indul — {km(r.res.km)} km rés ({r.res.honnan} → {r.res.hova})
            </Link>
          ))}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-[#F5F5F7] p-3">
        {napok ? (
          napok.map((nap) => {
            const c = cellak.get(nap);
            return (
              <div key={nap} className={cn("flex flex-col gap-1.5", nap < adat.ma && "opacity-55")}>
                {nap !== adat.ma ? <NapSzakasz nap={nap} ma={adat.ma} /> : null}
                {nap === adat.ma
                  ? <MaBlokk k={k} kocsi={kocsi} adat={adat} piheno={piheno} szerk={szerk} />
                  : c && het && kocsi ? <NapTartalom kocsi={kocsi} c={c} het={het} szerk={szerk} /> : null}
              </div>
            );
          })
        ) : (
          <>
            <MaBlokk k={k} kocsi={null} adat={adat} piheno={piheno} szerk={szerk} />
            <NapSzakasz nap={adat.holnap} ma={adat.ma} />
            <div className="flex flex-col gap-1.5">
              {k.tavolletHolnap ? <TavolletBlokk t={k.tavolletHolnap} utkozik={k.holnap.length > 0} /> : null}
              {(k.bejegyzesekHolnap ?? []).map((b) => (
                <div key={`${b.id}-${b.alkalom}`} className="flex items-center gap-1.5 text-[13px]">
                  <BejegyzesIkon tipus={b.tipus} className="size-3.5 shrink-0 text-[#6E6E73]" />
                  <b>{tipusNev(b.tipus)}</b> <span className="tabular-nums">{bejegyzesIdo(b)}</span>{b.hely ? <span className={MEDDO}>· {b.hely}</span> : null}
                </div>
              ))}
              {k.holnap.map((b) => (
                <Link key={b.id} href={reszlet(b.id)} className="block rounded-xl bg-white px-3 py-2 shadow-[var(--shadow-card)] hover:bg-muted/40">
                  <div className={cn("text-xs font-bold tracking-wide", MEDDO)}>{b.jelleg === "sajat" ? "SAJÁT" : "BÉR"}{b.hivatkozas ? ` · ${b.hivatkozas}` : ""}</div>
                  <div className="truncate text-sm font-semibold">{b.partner}</div>
                  <div className={cn("truncate text-[13px]", MEDDO)}>{b.utvonal}</div>
                </Link>
              ))}
              {!k.holnap.length && !k.tavolletHolnap ? (
                <div className={cn("px-1 text-[13px]", MEDDO)}>{k.holnapFolytatodik ? "A mai fuvar folytatódik." : "Nincs fuvar"}</div>
              ) : null}
            </div>
          </>
        )}
      </div>

      <footer className="flex shrink-0 flex-col gap-1 border-t border-foreground/10 bg-white px-4 py-2.5">
        <HetSor s={heti} />
        {sav?.szabad ? (
          <div className={cn("text-xs", MEDDO)}>
            Szabad: <b className="text-foreground">{sav.szabad.cimke}</b>
            {sav.szabad.honnan ? ` (${sav.szabad.honnan}${sav.szabad.km != null ? ` → ${km(sav.szabad.km)} km üres` : ""})` : ""}
            {" · "}
            <Link
              href={sav.szabad.resKulcs ? hetLink(het && !het.ezAHet ? het.hetKezdet : null, sav.szabad.resKulcs, ALAP) : "/fuvarozas2/timocom"}
              scroll={false}
              className="font-semibold text-foreground underline"
            >
              ajánlat
            </Link>
          </div>
        ) : null}
        {k.papir.length || (k.fogyasztas?.szervizHatraKm != null && k.fogyasztas.szervizHatraKm < 10000) ? (
          <div className={cn("flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs", MEDDO)}>
            {k.fogyasztas?.szervizHatraKm != null && k.fogyasztas.szervizHatraKm < 10000 ? (
              <span className={k.fogyasztas.szervizHatraKm < 3000 ? "font-semibold text-[var(--f2-amb)]" : ""}>szervizig {Math.round(k.fogyasztas.szervizHatraKm).toLocaleString("hu-HU")} km</span>
            ) : null}
            {k.papir.map((p) => <Link key={p.szoveg} href={p.href} className="font-semibold text-[var(--f2-amb)] hover:underline">{p.szoveg}</Link>)}
          </div>
        ) : null}
      </footer>
    </article>
  );
}

/** A még nem üzemelő kocsik: halvány, szaggatott jelölés a sor alatt. */
export function Helykitoltok({ kocsik }: { kocsik: MaKocsi[] }) {
  if (!kocsik.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-2 text-[13px]", MEDDO)}>
      {kocsik.map((k, i) => (
        <span key={k.kod ?? `h-${i}`} className="rounded-full border border-dashed border-foreground/20 px-3 py-1"><b className="text-foreground/70">{k.sofor ?? k.cimke}</b> · {k.helykitolto}</span>
      ))}
    </div>
  );
}
