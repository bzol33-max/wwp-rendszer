import Link from "next/link";
import type { CSSProperties } from "react";
import { Search, Phone, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { kocsiSzin } from "@/lib/fuvarozas2/kocsi-szin";
import { napCimke } from "@/lib/fuvarozas2/kocsi-sav-alap";
import { timocomKeresSzoveg, type Irany, type IranyCimke } from "@/lib/fuvarozas2/kereses-javaslat-alap";
import type { KeresesJavaslatAdat } from "@/lib/fuvarozas2/kereses-javaslat";

// Ajánlat oldal · Q2 (docs/ajanlat-q2-terv.md): a kocsik balról jobbra, ahogy
// felszabadulnak; kocsinként legfeljebb 3 irány egy-egy „keres” gombbal.
// A gomb `?kocsi=…&irany=…` címre visz: a kiválasztott irány sávja (Timocom-
// keresés, illő ajánlatok, kit hívjak) és a kitöltött kalkulátor jelenik meg.

type Kocsi = KeresesJavaslatAdat["kocsik"][number];

const CIMKE: Record<IranyCimke, { szoveg: string; szin: string }> = {
  "tobb-penz": { szoveg: "több pénz", szin: "var(--primary)" },
  gyakori: { szoveg: "gyakori", szin: "var(--f2-mint)" },
  hazafele: { szoveg: "hazafelé", szin: "var(--f2-amb)" },
  "ures-haza": { szoveg: "üresen haza", szin: "var(--f2-amb)" },
  tovabbi: { szoveg: "másik", szin: "#5f6b66" },
};

const ido = (perc: number) => `${Math.floor(perc / 60)}:${String(perc % 60).padStart(2, "0")}`;
const eFt = (ft: number) => `${Math.round(ft / 1000).toLocaleString("hu-HU")} e Ft`;
const ejszaka = (n: number) => (n === 0 ? "otthon alszik" : `~${n} éj kint`);

export function keresHref(kod: string, kulcs: string): string {
  return `/fuvarozas2/timocom?${new URLSearchParams({ kocsi: kod, irany: kulcs })}#kereses`;
}

function IranySor({ k, i, betu, aktiv }: { k: Kocsi; i: Irany; betu: string; aktiv: boolean }) {
  const c = CIMKE[i.cimke];
  const tenyek = i.cimke === "ures-haza"
    ? [`${i.hazaKm} km`, ejszaka(i.ejszakaKint)]
    : [`+${i.raallasKm} km ráállás`, ejszaka(i.ejszakaKint)];
  return (
    <div className={cn("flex items-center gap-2 rounded-xl px-2.5 py-2 ring-1 ring-foreground/10", aktiv && "bg-muted ring-2 ring-foreground/40")}
      style={{ boxShadow: `inset 3px 0 0 ${c.szin}` }}>
      <b className="w-3 text-center" style={{ color: c.szin }}>{betu}</b>
      <div className="min-w-0 flex-1 text-xs">
        <div className="flex items-baseline gap-1.5"><b className="truncate text-[13px]">{i.nev}</b><span className="shrink-0 text-[11px] font-semibold" style={{ color: c.szin }}>{c.szoveg}</span></div>
        <div className="text-muted-foreground">
          {tenyek.join(" · ")} · {i.hazaer ? <span className="text-[var(--f2-mint)]">haza időben ✓</span> : <span className="font-semibold text-[var(--f2-red)]">nem ér haza időben</span>}
        </div>
        {i.cimke !== "ures-haza" ? (
          <div className="text-muted-foreground">
            {i.dijFt != null ? <>várható <b className="text-foreground">{eFt(i.dijFt)}</b></> : i.ftKm != null ? <>~{i.ftKm} Ft/km</> : "díj —"}
            {" · "}{i.multDb} korábbi{i.timocomDb ? ` · ${i.timocomDb} Timocom` : ""}
          </div>
        ) : null}
      </div>
      <Link href={keresHref(k.kod, i.kulcs)} scroll={false}
        className="flex min-h-11 shrink-0 items-center rounded-lg px-3 text-xs font-semibold text-white" aria-current={aktiv ? "true" : undefined}
        style={{ background: c.szin }} aria-label={`${k.sofor}: ${i.nev} — keres`}>
        keres
      </Link>
    </div>
  );
}

function KocsiKartya({ k, ma, kivalasztott }: { k: Kocsi; ma: string; kivalasztott: string | null }) {
  const s = kocsiSzin(k.szin);
  const sz = k.szabad;
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-foreground/10 bg-card p-3"
      style={{ "--kc": s.c, "--kl": s.l, boxShadow: `inset 0 3px 0 ${s.c}` } as CSSProperties}>
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-[var(--kc)] text-sm font-bold text-white" aria-hidden>{k.sofor.slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0">
          <b className="block truncate">{k.sofor}</b>
          <div className="truncate text-xs text-muted-foreground">
            {sz ? <>{napCimke(sz.nap, ma)} {sz.ido ?? ""} · {sz.hely.varos}{sz.becsult ? " (feltételezve)" : ""}</> : "nincs adat"}
          </div>
        </div>
      </div>
      {sz && !k.tavolletben ? (
        <div className="text-xs text-muted-foreground">
          {sz.vezetesHatraPerc != null ? `${ido(sz.vezetesHatraPerc)} vezetés aznap · ` : ""}
          {k.hazaNap ? <>haza: <b className="text-foreground">{napCimke(k.hazaNap, ma)}</b></> : null}
          {k.csakHaza ? " · már csak hazafelé" : ""}
        </div>
      ) : null}
      {sz?.becsult && !k.tavolletben ? <div className="rounded-lg bg-[var(--f2-amb-l)] px-2 py-1.5 text-xs text-[#6b4309]">A kocsi helye nem ismert — a telephelyről számolva. Nézd meg a Ma oldalon, hol áll.</div> : null}
      {k.tavolletben ? <div className="rounded-lg bg-[var(--kl)] px-2 py-1.5 text-xs font-semibold">Távollét a szabad napon (Jelenlét) — nincs mit keresni.</div> : null}
      {k.nincsAdat && !k.tavolletben && k.iranyok.length ? <div className="text-xs text-muted-foreground">Innen még nem volt fuvarunk, és nincs illő Timocom-ajánlat.</div> : null}
      {k.iranyok.map((i, n) => (
        <IranySor key={i.kulcs} k={k} i={i} betu={String.fromCharCode(65 + n)} aktiv={kivalasztott === i.kulcs} />
      ))}
    </div>
  );
}

export function KeresesiJavaslatok({ adat, kocsi, irany }: { adat: KeresesJavaslatAdat | null; kocsi: string | null; irany: string | null }) {
  if (!adat) {
    return <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">A keresési javaslat most nem készült el (a hét-terv nem töltődött be időben). Frissíts később — a kalkulátor addig is használható.</p>;
  }
  const lathato = adat.kocsik.filter((k) => k.szabad);
  if (!lathato.length) return null;
  return (
    <section className="flex flex-col gap-2" aria-label="Merre keress fuvart">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-base font-bold">Merre keress fuvart?</h2>
        <span className="text-xs text-muted-foreground">
          ahogy a kocsik kiürülnek · cél: a hét utolsó munkanapján üresen haza · saját múlt ({adat.multIsmert}/{adat.multOssz} fuvar helye ismert) + {adat.timocomDb} nyitott Timocom · {adat.frissitve}
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {lathato.map((k) => <KocsiKartya key={k.kod} k={k} ma={adat.ma} kivalasztott={kocsi === k.kod ? irany : null} />)}
      </div>
    </section>
  );
}

/** A kiválasztott irány: Timocom-keresés szövege, illő ajánlatok, kit hívjak. */
export function KivalasztottIrany({ adat, kocsi, irany }: { adat: KeresesJavaslatAdat | null; kocsi: string | null; irany: string | null }) {
  const k = adat?.kocsik.find((x) => x.kod === kocsi);
  const i = k?.iranyok.find((x) => x.kulcs === irany);
  if (!k || !i || !k.szabad) return null;
  const c = CIMKE[i.cimke];
  const cimek = adat!.ajanlatCim;
  return (
    <section id="kereses" className="flex scroll-mt-4 flex-col gap-2 rounded-2xl border border-foreground/10 bg-card p-3" style={{ boxShadow: `inset 4px 0 0 ${c.szin}` }}>
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-base">{k.sofor} → {i.nev}</b>
        <span className="text-xs text-muted-foreground">{napCimke(k.szabad.nap, adat!.ma)} {k.szabad.ido ?? ""} · indul: {k.szabad.hely.varos}</span>
        <Link href="/fuvarozas2/timocom" scroll={false} className="ml-auto flex min-h-11 items-center px-2 text-xs text-muted-foreground underline">× bezár</Link>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="flex flex-col gap-1 text-sm">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Search className="size-3.5" aria-hidden />Timocomban ezt keresd</div>
          <code className="rounded-lg bg-muted px-2 py-1.5 text-[13px]">{timocomKeresSzoveg(k.szabad.hely.varos, i)}</code>
          <span className="text-xs text-muted-foreground">felrakás: {napCimke(k.szabad.nap, adat!.ma)} vagy másnap</span>
        </div>
        <div className="flex flex-col gap-1 text-sm">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><ExternalLink className="size-3.5" aria-hidden />Illő nyitott Timocom-ajánlat</div>
          {i.ajanlatIdk.length ? i.ajanlatIdk.slice(0, 4).map((id) => (
            <Link key={id} href={`/fuvarozas2/timocom?id=${encodeURIComponent(id)}`} className="rounded-lg px-2 py-1 ring-1 ring-foreground/10 hover:bg-muted">
              {cimek[id]?.cim ?? "ajánlat"}{cimek[id]?.ar ? <span className="text-muted-foreground"> · {cimek[id].ar}</span> : null}
            </Link>
          )) : <span className="text-xs text-muted-foreground">nincs — a „→ WWP” gombbal hozd be, amit találsz</span>}
        </div>
        <div className="flex flex-col gap-1 text-sm">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Phone className="size-3.5" aria-hidden />Kit hívjak (saját múlt)</div>
          {i.partnerek.length ? i.partnerek.map((p) => (
            <Link key={p.partner} href={`/fuvarozas2/megbizasok?${new URLSearchParams({ q: p.partner })}`} className="rounded-lg px-2 py-1 ring-1 ring-foreground/10 hover:bg-muted">
              <b>{p.partner}</b> <span className="text-muted-foreground">· {p.db}× · utoljára {p.utolsoNap.slice(5).replace("-", ".")}.{p.utolsoDijFt ? ` · ${eFt(p.utolsoDijFt)}` : ""}</span>
            </Link>
          )) : <span className="text-xs text-muted-foreground">erre az irányra még nem volt saját fuvar</span>}
        </div>
      </div>
      <span className="text-xs text-muted-foreground">A kalkulátor lent ki van töltve: {k.szabad.hely.varos} → {i.cel.varos}. Írd be a megbízó ajánlatát, és nyomd meg a „Számítás” gombot.</span>
    </section>
  );
}
