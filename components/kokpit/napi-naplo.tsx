// Kezdőlap · Napi napló (C6 terv, 2026-10-17). Szerveroldali komponens:
// csak megjelenít, az adat a lapról (app/page.tsx) jön blokkonként, a
// jogosultságnak megfelelően (null = a felhasználó nem látja a blokkot,
// vagy a lekérdezés hibára futott).

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  FelvasarlasNaplo,
  FeladatSor,
  NaploHatarok,
  NaploIdoszak,
  SzabadsagSor,
  SzamlaNaplo,
  TelepekNaplo,
} from "@/lib/kokpit/naplo";
import type { KimutatasEredmeny } from "@/lib/fuvarozas2/kimutatas";
import type { PenzLista } from "@/lib/fuvarozas2/penz-lista";
import { NyomtatasGomb } from "@/components/kokpit/nyomtatas-gomb";

export type NapiNaploAdat = {
  h: NaploHatarok;
  felvasarlas: FelvasarlasNaplo | null;
  telepek: TelepekNaplo | null;
  kimutatas: KimutatasEredmeny | null;
  kimutatasHiba: string | null;
  penz: PenzLista | null;
  szamlak: SzamlaNaplo | null;
  feladatok: { sorok: FeladatSor[]; db: number } | null;
  szabadsagok: SzabadsagSor[] | null;
};

// ---------------------------------------------------------------------------
// Formázás
// ---------------------------------------------------------------------------

const szam = (n: number) => new Intl.NumberFormat("hu-HU").format(Math.round(n));
const ft = (n: number) => `${szam(n)} Ft`;
const elojel = (n: number) => (n > 0 ? `+${szam(n)}` : n < 0 ? `−${szam(-n)}` : "0");

const NAPNEV = ["vasárnap", "hétfő", "kedd", "szerda", "csütörtök", "péntek", "szombat"];
const HONAP = ["január", "február", "március", "április", "május", "június", "július", "augusztus", "szeptember", "október", "november", "december"];

function utc(nap: string) {
  return new Date(`${nap}T12:00:00Z`);
}
function napCimke(nap: string) {
  const d = utc(nap);
  return `${NAPNEV[d.getUTCDay()]}, ${HONAP[d.getUTCMonth()]} ${d.getUTCDate()}.`;
}
function rovidNap(nap: string) {
  const [, m, d] = nap.split("-");
  return `${m}.${d}.`;
}
function hetSzama(nap: string) {
  const d = utc(nap);
  const cel = new Date(d);
  cel.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const elso = new Date(Date.UTC(cel.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((cel.getTime() - elso.getTime()) / 86400000 - 3 + ((elso.getUTCDay() + 6) % 7)) / 7);
}
function cim(h: NaploHatarok) {
  if (h.idoszak === "nap") return `Napi napló · ${napCimke(h.nap)}`;
  if (h.idoszak === "het") return `Heti napló · ${hetSzama(h.nap)}. hét (${rovidNap(h.kezdet)}–${rovidNap(h.veg)})`;
  const d = utc(h.nap);
  return `Havi napló · ${d.getUTCFullYear()}. ${HONAP[d.getUTCMonth()]}`;
}
const idoszakSzo = (i: NaploIdoszak) => (i === "nap" ? "ma" : i === "het" ? "a héten" : "a hónapban");
const link = (i: NaploIdoszak, nap?: string) => `/?idoszak=${i}${nap ? `&nap=${nap}` : ""}`;

// ---------------------------------------------------------------------------
// Építőelemek
// ---------------------------------------------------------------------------

function Blokk({
  cim: c,
  alcim,
  ertek,
  ertekAlcim,
  szin,
  href,
  className,
  children,
}: {
  cim: string;
  alcim?: string;
  ertek?: string;
  ertekAlcim?: string;
  szin: string;
  href?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 break-inside-avoid", className)}>
      <div className="flex items-end justify-between gap-3 border-b px-4 py-3" style={{ borderTop: `4px solid ${szin}` }}>
        <div className="min-w-0">
          <h2 className="text-xs font-bold uppercase tracking-wide" style={{ color: szin }}>{c}</h2>
          {alcim ? <div className="text-xs text-muted-foreground">{alcim}</div> : null}
        </div>
        <div className="flex items-end gap-3">
          {ertek ? (
            <div className="text-right">
              <div className="whitespace-nowrap text-2xl font-semibold leading-none tabular-nums">{ertek}</div>
              {ertekAlcim ? <div className="mt-1 text-xs text-muted-foreground">{ertekAlcim}</div> : null}
            </div>
          ) : null}
          {href ? (
            <Link href={href} className="text-muted-foreground hover:text-foreground print:hidden" aria-label={`${c} – megnyitás`}>
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 px-4 py-3 text-sm">{children}</div>
    </section>
  );
}

function Ures({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function Sor({ bal, jobb, szin }: { bal: ReactNode; jobb: ReactNode; szin?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 border-t py-1.5 first:border-t-0", szin)}>
      <span className="min-w-0">{bal}</span>
      <span className="shrink-0 font-medium tabular-nums">{jobb}</span>
    </div>
  );
}

function Kis({ cim: c, ertek, szin }: { cim: string; ertek: string; szin?: string }) {
  return (
    <div className="rounded-lg bg-muted/60 px-3 py-2">
      <div className="text-xs text-muted-foreground">{c}</div>
      <div className={cn("text-base font-semibold tabular-nums", szin)}>{ertek}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Teendők összegyűjtése a blokkokból
// ---------------------------------------------------------------------------

type Teendo = { szoveg: string; reszlet?: string; honnan: string; href: string; suly: number; piros?: boolean };

function teendok(a: NapiNaploAdat): Teendo[] {
  const t: Teendo[] = [];
  for (const s of a.penz?.sorok ?? []) {
    if (s.a.szamlazatlan) {
      t.push({ szoveg: `Számlázd ki: ${s.megbizo}`, reszlet: `${s.relacio} · ${rovidNap(s.nap)} · ${s.a.kor} napja kész`, honnan: "Számla", href: "/fuvarozas2/megbizasok", suly: s.a.kor >= 3 ? 0 : 2, piros: s.a.kor >= 3 });
    } else if (s.a.papirHianyzik) {
      t.push({ szoveg: `Eredeti papír hiányzik: ${s.megbizo}`, reszlet: `${s.relacio} · ${s.a.kor} napja`, honnan: "Fuvar", href: "/fuvarozas2/megbizasok", suly: 3 });
    }
  }
  for (const l of a.szamlak?.lejart.sorok ?? []) {
    t.push({ szoveg: `Lejárt számla: ${l.vevo}`, reszlet: `${l.szamlaszam} · ${ft(l.osszeg)} · ${l.nap} napja`, honnan: "Számla", href: "/szamlak", suly: 1, piros: l.nap > 7 });
  }
  if (a.felvasarlas && a.felvasarlas.fuggo.db > 0) {
    const f = a.felvasarlas.fuggo;
    t.push({ szoveg: `Felvásárlás kifizetésre vár · ${ft(f.osszeg)}`, reszlet: f.eladok.slice(0, 3).join(", ") + (f.eladok.length > 3 ? "…" : ""), honnan: "Felvásárlás", href: "/keszlet", suly: 2 });
  }
  for (const tp of a.telepek?.telepek ?? []) {
    if (tp.utonIde > 0) t.push({ szoveg: `Átvételre vár ${tp.telep} telepen: ${szam(tp.utonIde)} db`, reszlet: "telepközi mozgatás, még nincs okézva", honnan: "Telep", href: "/keszlet", suly: 2 });
  }
  for (const sz of a.szabadsagok ?? []) {
    if (sz.allapot === "kert") t.push({ szoveg: `${sz.tipus === "beteg" ? "Betegség" : "Szabadság"}-kérelem: ${sz.nev}`, reszlet: `${rovidNap(sz.tol)}–${rovidNap(sz.ig)} · jóváhagyásra vár`, honnan: "Dolgozó", href: "/jelenlet", suly: 2 });
  }
  if (a.h.idoszak === "nap" && a.h.nap <= a.h.ma) {
    const hetkoznap = ![0, 6].includes(utc(a.h.nap).getUTCDay());
    for (const j of a.kimutatas?.jarmuvek ?? []) {
      if (hetkoznap && j.vanGps && j.km < 5 && j.berDb + j.sajatDb === 0) {
        t.push({ szoveg: `${j.kod} állt ezen a napon`, reszlet: j.sofor ? `sofőr: ${j.sofor}` : "nincs fuvar, nincs mozgás", honnan: "Kamion", href: "/fuvarozas2", suly: 1, piros: true });
      }
    }
  }
  for (const f of a.feladatok?.sorok ?? []) {
    t.push({ szoveg: f.leiras, reszlet: `${f.telep} · ${rovidNap(f.nap)}${f.keso ? " · késésben" : ""}`, honnan: "Feladat", href: "/jelenlet", suly: f.surgosseg <= 1 ? 0 : f.surgosseg <= 2 ? 1 : 3, piros: f.surgosseg <= 1 || f.keso });
  }
  return t.sort((x, y) => x.suly - y.suly);
}

// ---------------------------------------------------------------------------
// Mini naptár
// ---------------------------------------------------------------------------

function MiniNaptar({ h, szabadsagok }: { h: NaploHatarok; szabadsagok: SzabadsagSor[] }) {
  const d = utc(h.nap);
  const ev = d.getUTCFullYear();
  const ho = d.getUTCMonth();
  const elso = new Date(Date.UTC(ev, ho, 1, 12));
  const eltolas = (elso.getUTCDay() + 6) % 7;
  const napok = new Date(Date.UTC(ev, ho + 1, 0, 12)).getUTCDate();
  const cellak: (string | null)[] = [...Array(eltolas).fill(null)];
  for (let i = 1; i <= napok; i++) cellak.push(`${ev}-${String(ho + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`);
  const jel = (nap: string) => {
    const s = szabadsagok.filter((x) => x.tol <= nap && x.ig >= nap);
    if (s.some((x) => x.allapot === "jovahagyva" && x.tipus === "beteg")) return "bg-violet-400";
    if (s.some((x) => x.allapot === "jovahagyva")) return "bg-amber-500";
    if (s.length) return "bg-amber-200";
    return null;
  };
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-muted-foreground">{ev}. {HONAP[ho]}</div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
        {["H", "K", "Sze", "Cs", "P", "Szo", "V"].map((n) => (
          <div key={n} className="py-1 font-semibold text-muted-foreground">{n}</div>
        ))}
        {cellak.map((nap, i) => {
          if (!nap) return <div key={`u${i}`} />;
          const kij = nap === h.nap;
          const ma = nap === h.ma;
          const p = jel(nap);
          const hetvege = i % 7 >= 5;
          return (
            <Link
              key={nap}
              href={link("nap", nap)}
              className={cn(
                "flex flex-col items-center rounded-md py-1 tabular-nums hover:bg-muted",
                hetvege && "text-muted-foreground",
                ma && "font-bold text-orange-700",
                kij && "bg-foreground text-background hover:bg-foreground"
              )}
            >
              {Number(nap.slice(8))}
              <span className={cn("mt-0.5 h-1 w-3 rounded-full", p ?? "bg-transparent")} />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A napló
// ---------------------------------------------------------------------------

export function NapiNaplo(a: NapiNaploAdat) {
  const { h } = a;
  const tdk = teendok(a);
  const szo = idoszakSzo(h.idoszak);
  const f = a.felvasarlas;
  const tp = a.telepek;
  const k = a.kimutatas;
  const p = a.penz;
  const sz = a.szamlak;
  const telepBe = tp?.telepek.reduce((s, x) => s + x.be, 0) ?? 0;
  const telepKi = tp?.telepek.reduce((s, x) => s + x.ki, 0) ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Fejléc: időszak, lapozás */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={link(h.idoszak, h.elozo)} aria-label="Előző" className="rounded-md border p-2 hover:bg-muted print:hidden">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">{cim(h)}</h1>
            <div className="text-xs text-muted-foreground">
              {h.nap === h.ma || (h.kezdet <= h.ma && h.veg >= h.ma) ? "folyamatban lévő időszak — az adatok élőek" : "lezárt időszak"}
            </div>
          </div>
          <Link href={link(h.idoszak, h.kovetkezo)} aria-label="Következő" className="rounded-md border p-2 hover:bg-muted print:hidden">
            <ChevronRight className="h-4 w-4" />
          </Link>
          {h.nap !== h.ma ? (
            <Link href={link(h.idoszak)} className="rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted print:hidden">Ma</Link>
          ) : null}
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <div className="flex overflow-hidden rounded-md border text-sm font-medium" role="group" aria-label="Időszak">
            {(["nap", "het", "ho"] as const).map((i) => (
              <Link key={i} href={link(i, h.nap === h.ma ? undefined : h.nap)} className={cn("px-3 py-2", h.idoszak === i ? "bg-foreground text-background" : "hover:bg-muted")}>
                {i === "nap" ? "Nap" : i === "het" ? "Hét" : "Hónap"}
              </Link>
            ))}
          </div>
          <NyomtatasGomb />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Felvásárlás */}
        {f ? (
          <Blokk className="lg:col-span-4" cim="Felvásárlás · Nyíregyháza" alcim={`${f.eladok} eladó ${szo}`} ertek={`${szam(f.ossz.db)} db`} ertekAlcim={ft(f.ossz.osszeg)} szin="#5A4632" href="/keszlet">
            {f.tipusok.length === 0 ? (
              <Ures>Nem volt felvásárlás {szo}.</Ures>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="pb-1 font-medium">Típus</th>
                    <th className="pb-1 text-right font-medium">db</th>
                    <th className="pb-1 text-right font-medium">átl. Ft</th>
                    <th className="pb-1 text-right font-medium">Ft</th>
                  </tr>
                </thead>
                <tbody>
                  {f.tipusok.map((t) => (
                    <tr key={t.tipus} className="border-t">
                      <td className="py-1">{t.tipus}</td>
                      <td className="py-1 text-right tabular-nums">{szam(t.db)}</td>
                      <td className="py-1 text-right tabular-nums">{szam(t.atlag)}</td>
                      <td className="py-1 text-right tabular-nums">{szam(t.osszeg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Kis cim="Készpénzzel" ertek={ft(f.keszpenz)} />
              <Kis cim="Átutalással" ertek={ft(f.atutalas)} />
              <Kis cim="Kassza nyitó → záró" ertek={`${szam(f.kassza.nyito)} → ${szam(f.kassza.zaro)}`} />
              <Kis cim="Egyéb kassza-kiadás" ertek={ft(f.kassza.egyeb)} />
            </div>
            {f.fuggo.db > 0 ? (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                Kifizetésre vár: <b>{ft(f.fuggo.osszeg)}</b> · {f.fuggo.eladok.join(", ")}
              </div>
            ) : null}
          </Blokk>
        ) : null}

        {/* Telepek */}
        {tp ? (
          <Blokk className={f ? "lg:col-span-8" : "lg:col-span-12"} cim="Be- és kiszállítás · telepek" alcim={`raklap db ${szo} · a felvásárlás a Nyíregyháza „be” oszlopában`} ertek={`${elojel(telepBe)} / ${elojel(-telepKi)}`} ertekAlcim={`nettó ${elojel(telepBe - telepKi)}`} szin="#3B3F3D" href="/keszlet">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="pb-1 font-medium">Telep</th>
                    <th className="pb-1 text-right font-medium">Nyitó</th>
                    <th className="pb-1 text-right font-medium">Be</th>
                    <th className="pb-1 text-right font-medium">Ki</th>
                    <th className="pb-1 text-right font-medium">Záró</th>
                    <th className="pb-1 pl-3 font-medium">Típusonként (záró)</th>
                  </tr>
                </thead>
                <tbody>
                  {tp.telepek.map((t) => (
                    <tr key={t.telep} className="border-t align-top">
                      <td className="py-1.5 font-semibold">
                        {t.telep}
                        {t.utonIde > 0 ? <div className="text-xs font-normal text-amber-700">átvételre vár: {szam(t.utonIde)}</div> : null}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{szam(t.nyito)}</td>
                      <td className="py-1.5 text-right tabular-nums text-emerald-700">{t.be ? `+${szam(t.be)}` : "0"}</td>
                      <td className="py-1.5 text-right tabular-nums text-red-700">{t.ki ? `−${szam(t.ki)}` : "0"}</td>
                      <td className="py-1.5 text-right font-semibold tabular-nums">{szam(t.zaro)}</td>
                      <td className="py-1.5 pl-3 text-xs text-muted-foreground">
                        {t.tipusok.filter((x) => x.zaro !== 0 || x.be || x.ki).map((x) => `${x.tipus} ${szam(x.zaro)}${x.be || x.ki ? ` (${x.be ? `+${szam(x.be)}` : ""}${x.be && x.ki ? " " : ""}${x.ki ? `−${szam(x.ki)}` : ""})` : ""}`).join(" · ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details className="text-sm">
              <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
                Mozgások {szo} ({tp.mozgasDb}{tp.mozgasDb > tp.mozgasok.length ? `, az utolsó ${tp.mozgasok.length}` : ""}) — felvásárlás nélkül
              </summary>
              {tp.mozgasok.length === 0 ? (
                <Ures>Nem volt mozgás.</Ures>
              ) : (
                <div className="mt-1">
                  {tp.mozgasok.map((m, i) => (
                    <Sor
                      key={i}
                      bal={
                        <span>
                          <span className="text-xs text-muted-foreground tabular-nums">{m.ido}</span>{" "}
                          <b>{m.telep}</b>{" "}
                          {m.irany === "be" ? "← be" : m.irany === "ki" ? "→ ki" : `→ ${m.masikTelep ?? "?"}`} · {m.tipus}
                          {m.partner ? <span className="text-muted-foreground"> · {m.partner}</span> : null}
                        </span>
                      }
                      jobb={m.irany === "be" ? `+${szam(m.db)}` : `−${szam(m.db)}`}
                    />
                  ))}
                </div>
              )}
            </details>
          </Blokk>
        ) : null}

        {/* Kamionok */}
        {k || a.kimutatasHiba ? (
          <Blokk
            className="lg:col-span-8"
            cim="Kamionok · mit csináltak"
            alcim={k ? `rakott ${szam(k.ossz.berKm + k.ossz.sajatKm)} km · üres ${szam(k.ossz.uresKm)} km (becslés)${k.gpsHiba ? " · GPS most nem elérhető" : ""}` : undefined}
            ertek={k ? ft(k.ossz.bevetelFt) : undefined}
            ertekAlcim={k ? `bérfuvar-bevétel · eredmény ${ft(k.ossz.eredmenyFt)}` : undefined}
            szin="#1F5F7A"
            href={`/fuvarozas2/kimutatas?idoszak=${h.idoszak}&nap=${h.nap}`}
          >
            {!k ? (
              <Ures>A kamion-adat most nem tölthető be ({a.kimutatasHiba}).</Ures>
            ) : k.jarmuvek.length === 0 ? (
              <Ures>Nincs rögzített kocsi.</Ures>
            ) : (
              k.jarmuvek.map((j) => {
                const mb = k.megbizasok.filter((m) => m.jarmuKod === j.kod);
                const rakott = j.berKm + j.sajatKm;
                const ossz = rakott + j.uresKm;
                const allt = j.berDb + j.sajatDb === 0;
                return (
                  <div key={j.kod} className={cn("grid grid-cols-1 gap-2 border-t py-2.5 first:border-t-0 sm:grid-cols-[150px_1fr_130px]", allt && "text-muted-foreground")}>
                    <div>
                      <div className="font-mono text-base font-semibold text-foreground">{j.kod}</div>
                      <div className="text-xs">{j.sofor ?? "—"}{!j.vanGps ? " · GPS nélkül" : ""}</div>
                    </div>
                    <div className="min-w-0">
                      {mb.length === 0 ? (
                        <div className="text-sm">{allt ? "Nem volt fuvar." : "—"}</div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {mb.slice(0, 6).map((m) => (
                            <span key={m.id} className={cn("rounded px-2 py-0.5 text-xs font-medium", m.jelleg === "ber" ? "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200" : "bg-stone-200 text-stone-800 dark:bg-stone-800 dark:text-stone-200")}>
                              {h.idoszak !== "nap" ? `${rovidNap(m.nap)} ` : ""}{m.felrako ?? "?"} → {m.lerako ?? "?"}{m.partner ? ` · ${m.partner}` : ""}
                            </span>
                          ))}
                          {mb.length > 6 ? <span className="text-xs">+{mb.length - 6} további</span> : null}
                        </div>
                      )}
                      {ossz > 0 ? (
                        <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-muted" title={`rakott ${szam(rakott)} km · üres ${szam(j.uresKm)} km`}>
                          <div className="bg-sky-700" style={{ width: `${(j.berKm / ossz) * 100}%` }} />
                          <div className="bg-stone-500" style={{ width: `${(j.sajatKm / ossz) * 100}%` }} />
                        </div>
                      ) : null}
                      <div className="mt-1 text-xs">
                        {j.berDb} bér · {j.sajatDb} saját · rakott {szam(rakott)} km · üres {szam(j.uresKm)} km{j.vanGps ? ` · GPS ${szam(j.km)} km` : ""}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold tabular-nums text-foreground">{ft(j.bevetelFt)}</div>
                      <div className={cn("text-xs tabular-nums", j.eredmenyFt < 0 ? "text-red-700" : "text-emerald-700")}>eredmény {ft(j.eredmenyFt)}</div>
                    </div>
                  </div>
                );
              })
            )}
            {k && k.kocsiNelkul > 0 ? <div className="text-xs text-amber-700">{k.kocsiNelkul} megbízás kocsi nélkül — a km-je nem szerepel.</div> : null}
          </Blokk>
        ) : null}

        {/* Számlák */}
        {sz || p ? (
          <Blokk
            className="lg:col-span-4"
            cim="Számlák"
            alcim={`kimenő · ${szo}`}
            ertek={p ? `${p.ossz.szamlazatlan.db} db` : undefined}
            ertekAlcim={p ? "kész fuvar, nincs számla" : undefined}
            szin="#2E6B3F"
            href="/szamlak"
          >
            {sz ? (
              <>
                <Sor bal={`Kiállítva ${szo} (${sz.kiallitva.db})`} jobb={ft(sz.kiallitva.osszeg)} />
                <Sor bal={`Befolyt ${szo} (${sz.befolyt.db})`} jobb={ft(sz.befolyt.osszeg)} szin="text-emerald-700" />
                <Sor bal={`Esedékes ${szo} (${sz.esedekes.db})`} jobb={ft(sz.esedekes.osszeg)} />
                <Sor bal={`Lejárt, nyitott (${sz.lejart.db})`} jobb={ft(sz.lejart.osszeg)} szin={sz.lejart.db ? "text-red-700" : undefined} />
              </>
            ) : null}
            {p ? (
              <>
                <Sor bal={`Eredeti papír hiányzik`} jobb={`${p.ossz.papir.db} db`} szin={p.ossz.papir.db ? "text-amber-700" : undefined} />
                <Sor bal="Fuvar-kintlévő (0–30 / 31–60 / 60+ nap)" jobb={p.ossz.kintlevo.savok.map((s) => szam(s["Ft"] ?? 0)).join(" / ")} />
              </>
            ) : null}
          </Blokk>
        ) : null}

        {/* Teendők */}
        <Blokk className="lg:col-span-7" cim="Teendők" alcim="a blokkokból automatikusan + a Jelenléti feladatai" ertek={String(tdk.length)} ertekAlcim={tdk.filter((x) => x.piros).length ? `${tdk.filter((x) => x.piros).length} sürgős` : "nincs sürgős"} szin="#A8321F">
          {tdk.length === 0 ? (
            <Ures>Nincs nyitott teendő.</Ures>
          ) : (
            <div>
              {tdk.slice(0, 14).map((t, i) => (
                <Link key={i} href={t.href} className="flex items-start gap-3 border-t py-2 first:border-t-0 hover:bg-muted/50">
                  <span className="w-20 shrink-0 pt-0.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t.honnan}</span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("font-medium", t.piros && "text-red-700")}>{t.szoveg}</span>
                    {t.reszlet ? <span className="block text-xs text-muted-foreground">{t.reszlet}</span> : null}
                  </span>
                </Link>
              ))}
              {tdk.length > 14 ? <div className="pt-1 text-xs text-muted-foreground">+{tdk.length - 14} további</div> : null}
              {a.feladatok && a.feladatok.db > a.feladatok.sorok.length ? (
                <Link href="/jelenlet" className="block pt-1 text-xs font-medium text-muted-foreground hover:text-foreground">Összes Jelenléti feladat ({a.feladatok.db}) →</Link>
              ) : null}
            </div>
          )}
        </Blokk>

        {/* Folyamatban */}
        <Blokk className="lg:col-span-5" cim="Folyamatban" alcim="elindult, még nincs lezárva — a mostani állapot" szin="#1B4A5C">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {p ? (
              <>
                <Kis cim="Megbízás tervezett / úton" ertek={szam(p.folyamatbanDb)} />
                <Kis cim="Kész, nincs számla" ertek={szam(p.ossz.szamlazatlan.db)} szin={p.ossz.szamlazatlan.db ? "text-red-700" : undefined} />
                <Kis cim="Papírra vár" ertek={szam(p.ossz.papir.db)} szin={p.ossz.papir.db ? "text-amber-700" : undefined} />
                <Kis cim="Számlázva, fizetésre vár" ertek={szam(p.ossz.szamok.kikuldve)} />
                <Kis cim="Lejárt fuvarszámla" ertek={szam(p.ossz.lejart.db)} szin={p.ossz.lejart.db ? "text-red-700" : undefined} />
              </>
            ) : null}
            {f ? <Kis cim="Felvásárlás kifizetésre" ertek={szam(f.fuggo.db)} szin={f.fuggo.db ? "text-amber-700" : undefined} /> : null}
            {tp ? <Kis cim="Telepközi, átvételre vár" ertek={szam(tp.telepek.reduce((s, x) => s + x.utonIde, 0))} /> : null}
            {a.szabadsagok ? <Kis cim="Szabadság-kérelem" ertek={szam(a.szabadsagok.filter((x) => x.allapot === "kert").length)} /> : null}
          </div>
          <div className="text-xs text-muted-foreground">Projektek: még nincs hozzájuk tábla — jóváhagyás után ide kerülnek.</div>
        </Blokk>

        {/* Jelentések */}
        <Blokk className="lg:col-span-7" cim="Jelentések" alcim="ugyanez a napló napra, hétre, hónapra — nyomtatható / PDF" szin="#4A3A7A">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(["nap", "het", "ho"] as const).map((i) => (
              <Link key={i} href={link(i, h.nap === h.ma ? undefined : h.nap)} className={cn("rounded-lg border px-3 py-2.5 hover:bg-muted", h.idoszak === i && "border-foreground")}>
                <div className="font-semibold">{i === "nap" ? "Napi zárás" : i === "het" ? "Heti összesítő" : "Havi zárás"}</div>
                <div className="text-xs text-muted-foreground">{i === "nap" ? rovidNap(h.nap) : i === "het" ? `${hetSzama(h.nap)}. hét` : HONAP[utc(h.nap).getUTCMonth()]}</div>
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 pt-1 text-xs">
            <Link href={`/fuvarozas2/kimutatas?idoszak=${h.idoszak}&nap=${h.nap}`} className="rounded-md border px-3 py-2 font-medium hover:bg-muted">Fuvar-kimutatás erre az időszakra →</Link>
            <Link href="/szamlak" className="rounded-md border px-3 py-2 font-medium hover:bg-muted">Számlák →</Link>
            <Link href="/keszlet" className="rounded-md border px-3 py-2 font-medium hover:bg-muted">Készlet / havi zárás →</Link>
          </div>
          <div className="text-xs text-muted-foreground">Automatikus kiküldés (e-mail 18:00-kor) még nincs bekötve.</div>
        </Blokk>

        {/* Naptár + szabadság */}
        {a.szabadsagok ? (
          <Blokk className="lg:col-span-5" cim="Naptár · szabadság" alcim="kattints egy napra → az a napló" szin="#B45309" href="/jelenlet">
            <MiniNaptar h={h} szabadsagok={a.szabadsagok} />
            <div className="pt-1">
              {a.szabadsagok.filter((x) => x.ig >= h.nap).length === 0 ? (
                <Ures>Senki nincs szabadságon a következő két hétben.</Ures>
              ) : (
                a.szabadsagok
                  .filter((x) => x.ig >= h.nap)
                  .map((x) => (
                    <Sor
                      key={x.id}
                      bal={<span><b>{x.nev}</b> · {x.tipus === "beteg" ? "beteg" : "szabadság"}</span>}
                      jobb={<span className={x.allapot === "kert" ? "text-amber-700" : undefined}>{rovidNap(x.tol)}–{rovidNap(x.ig)}{x.allapot === "kert" ? " (kérelem)" : ""}</span>}
                    />
                  ))
              )}
            </div>
          </Blokk>
        ) : null}
      </div>
    </div>
  );
}
