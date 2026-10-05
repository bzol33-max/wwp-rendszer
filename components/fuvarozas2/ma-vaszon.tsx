import Link from "next/link";
import type { MaVaszon, Elteres, MaKocsi, MaBlokk, CsempeSzin, MaKocsiAllapot, TukorSor, TukorAllas } from "@/lib/fuvarozas2/ma-vaszon";
import { AllasRogzitesGomb } from "@/components/fuvarozas2/allas-rogzites";
import { NyugtaGomb, VisszavonGomb } from "@/components/fuvarozas2/elteres-nyugta";
import { AutoFrissites } from "@/components/fuvarozas2/auto-frissites";
import { Csempesor } from "@/components/fuvarozas2/csempesor";
import { HetRacs } from "@/components/fuvarozas2/het-racs";

// A „Ma" képernyő (Budaházi Zoltán, 2026-09-28): négy kocsi-oszlop egymás
// mellett, mindegyik ugyanabban a sorrendben — fejléc (hol van most),
// vezetési idő, a mai megállók „tükörben” (18-as terv: balra a terv, középen
// a lépcső, jobbra a tény; a nem tervezett GPS-állás a helyén), a következő
// munkanap, papír/számla. Fölötte a csempesor, és
// csak akkor sáv, ha van eltérés; alatta a kocsi nélküli fuvarok és az iroda
// számai. Szerver-komponens; a kocsi-oszlop <details>, telefonon
// összecsukható.

const SZIN_ERTEK: Record<CsempeSzin, string> = {
  normal: "text-foreground",
  amber: "text-[var(--f2-amb)]",
  red: "text-[var(--f2-red)]",
  mint: "text-[var(--f2-mint)]",
};

const ALLAPOT_PONT: Record<MaKocsiAllapot["szin"], string> = {
  mint: "bg-[var(--f2-mint)]",
  amber: "bg-[var(--f2-amb)]",
  red: "bg-[var(--f2-red)]",
  normal: "bg-foreground/40",
};

const reszlet = (id: string) => `/fuvarozas2/megbizasok?reszlet=${id}`;

function Doboz({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-foreground/10 bg-card ${className}`}>{children}</div>;
}

function SzakaszCim({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</div>;
}

function ElteresSor({ e, nyugtazhat }: { e: Elteres; nyugtazhat: boolean }) {
  const badge = e.szin === "red" ? "bg-[var(--f2-red)] text-white" : "bg-[var(--f2-amb)] text-white";
  const belso = (
    <>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge}`}>{e.badge}</span>
      <span className="min-w-0">
        <span className="font-semibold">{e.cim}</span>
        {e.sorok[0] ? <span className="text-muted-foreground"> · {e.sorok[0]}</span> : null}
      </span>
    </>
  );
  const oszt = "flex min-w-0 flex-1 items-start gap-2 text-sm";
  return (
    <div className="flex items-start gap-2">
      {e.href ? <Link href={e.href} className={`${oszt} hover:underline`}>{belso}</Link> : <div className={oszt}>{belso}</div>}
      {nyugtazhat ? <NyugtaGomb kulcs={e.kulcs} szin={e.szin} /> : null}
    </div>
  );
}

/** Egy fuvar röviden: megbízó, hivatkozás, útvonal, megállók pipával. */
function BlokkSorok({ b, osszecsuk }: { b: MaBlokk; osszecsuk: boolean }) {
  const kesz = b.megallok.filter((m) => m.kesz).length;
  const megallok = b.megallok.map((m, i) => (
    <div
      key={i}
      className="flex items-baseline justify-between gap-2 border-l-2 pl-2 text-xs"
      style={{ borderColor: m.kiemelt === "varakozik" ? "var(--f2-red)" : m.kiemelt === "kesik" ? "var(--f2-amb)" : m.kesz ? "var(--f2-mint)" : "var(--border)" }}
    >
      <span className={`min-w-0 truncate ${m.kesz ? "text-muted-foreground line-through decoration-foreground/30" : ""}`}>
        {m.kesz ? "✓ " : "○ "}
        <span className="font-semibold">{m.tipus === "felrako" ? "Fel" : "Le"}</span> · {m.varos}
        {m.allapot && !m.kesz ? <span className="text-muted-foreground"> · {m.allapot}</span> : null}
      </span>
      {m.ido ? <span className="shrink-0 tabular-nums text-muted-foreground">{m.ido}</span> : null}
    </div>
  ));
  return (
    <div className="flex flex-col gap-1">
      <Link href={reszlet(b.id)} className="flex items-baseline justify-between gap-2 hover:underline">
        <span className="truncate text-sm font-semibold">{b.partner}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">{b.hivatkozas ?? (b.jelleg === "sajat" ? "saját" : "")}</span>
      </Link>
      <div className="text-xs text-muted-foreground">{b.utvonal}</div>
      {osszecsuk ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">{kesz}/{b.megallok.length} megálló kész — mutasd</summary>
          <div className="mt-1 flex flex-col gap-0.5">{megallok}</div>
        </details>
      ) : (
        <div className="flex flex-col gap-0.5">{megallok}</div>
      )}
    </div>
  );
}

const TUKOR_RACS = "grid grid-cols-[minmax(0,1fr)_16px_minmax(0,1.15fr)] gap-x-2";

function AllasDoboz({ a, varos }: { a: TukorAllas; varos: string | null }) {
  return (
    <div className="mt-1 rounded-lg bg-[var(--f2-amb-l)] px-2 py-1 text-[11px] leading-snug text-[#6b430a]">
      <b>{a.folyamatban ? `áll ${a.tol} óta` : `állt ${a.percek} p`}</b>
      {a.folyamatban ? ` (${a.percek} p)` : ` · ${a.tol}–${a.ig}`}
      {a.cim ? <div className="truncate">GPS: {a.cim}</div> : null}
      {varos ? (
        <div>
          a cím nincs rögzítve
          {a.rogzites ? <> · <AllasRogzitesGomb {...a.rogzites} varos={varos} /></> : null}
        </div>
      ) : (
        <div>nem tervezett állás</div>
      )}
    </div>
  );
}

/**
 * A mai megállók tükörben: bal a terv (hely, ablak), közép a lépcső, jobb a
 * tény. A nem tervezett állásnak nincs bal oldala — ettől szembeötlő.
 */
function Tukor({ sorok }: { sorok: TukorSor[] }) {
  const utolsoMegallo = sorok.reduce((u, r, i) => (r.tipus !== "fuvar" ? i : u), -1);
  return (
    <div className="flex flex-col">
      <div className={`${TUKOR_RACS} pb-1 text-[10px] font-bold tracking-wide text-muted-foreground`}>
        <span className="text-right">TERV</span><span /><span>TÉNY</span>
      </div>
      {sorok.map((r, i) => {
        if (r.tipus === "fuvar") {
          return (
            <Link key={`f${r.fuvarId}`} href={reszlet(r.fuvarId)} className="truncate pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:underline">
              {r.partner}{r.hivatkozas ? ` · ${r.hivatkozas}` : r.jelleg === "sajat" ? " · saját" : ""}
            </Link>
          );
        }
        const vonal = i < utolsoMegallo;
        if (r.tipus === "allas") {
          return (
            <div key={`a${i}`} className={TUKOR_RACS}>
              <span className="pb-2 text-right text-xs text-muted-foreground/50">—</span>
              <span className="flex flex-col items-center">
                <span className="mt-1 size-3 shrink-0 rounded-[3px] bg-[var(--f2-amb)]" />
                {vonal ? <span className="w-0.5 flex-1 bg-[var(--f2-mint)]" /> : null}
              </span>
              <div className="pb-2"><AllasDoboz a={r.allas} varos={null} /></div>
            </div>
          );
        }
        const pont =
          r.allapot === "kesz"
            ? "bg-[var(--f2-mint)]"
            : r.allapot === "most"
              ? r.kiemelt === "varakozik" ? "border-[3px] border-[var(--f2-red)] bg-card" : "border-[3px] border-[var(--f2-amb)] bg-card"
              : r.allapot === "kovetkezo"
                ? "border-[3px] border-[var(--f2-blue)] bg-card"
                : "border-2 border-foreground/25 bg-card";
        const tenySzin =
          r.allapot === "kesz" ? "text-[var(--f2-mint)]" : r.allapot === "most" ? "text-[#6b430a]" : r.allapot === "kovetkezo" ? "text-[var(--f2-blue)]" : "text-muted-foreground";
        const elteresSzin = r.elteres === "ablakban" ? "bg-[var(--f2-mint-l)] text-[var(--f2-mint)]" : r.elteres?.startsWith("+") && !r.elteres.includes("várható") && r.allapot === "kesz" ? "bg-[var(--f2-amb-l)] text-[var(--f2-amb)]" : r.elteres?.startsWith("késik") ? "bg-[var(--f2-red-l)] text-[var(--f2-red)]" : "bg-[var(--f2-blue-l)] text-[var(--f2-blue)]";
        const kiemelt = r.allapot === "most" || r.allapot === "kovetkezo";
        return (
          <div key={`m${i}`} className={TUKOR_RACS}>
            <Link href={reszlet(r.fuvarId)} className={`pb-2 text-right text-xs leading-snug hover:underline ${r.allapot === "hatra" ? "text-muted-foreground" : ""}`}>
              <b className={kiemelt ? "text-sm" : ""}>{r.varos}</b>
              <div className="font-mono text-[11px] text-muted-foreground">{r.felLe === "felrako" ? "fel" : "le"}{r.terv ? ` ${r.terv}` : ""}</div>
            </Link>
            <span className="flex flex-col items-center">
              <span className={`mt-1 size-3 shrink-0 rounded-full ${pont}`} />
              {vonal ? <span className={`w-0.5 flex-1 ${r.allapot === "kesz" ? "bg-[var(--f2-mint)]" : "bg-[repeating-linear-gradient(var(--border)_0_4px,transparent_4px_8px)]"}`} /> : null}
            </span>
            <div className="min-w-0 pb-2 text-xs leading-snug">
              {r.teny ? <span className={`font-mono text-[11px] ${tenySzin}`}>{r.teny}{r.allapot === "kesz" ? " ✓" : ""}</span> : <span className="text-muted-foreground">—</span>}
              {r.elteres ? <span className={`ml-1 rounded-full px-1.5 py-px text-[10px] font-semibold ${elteresSzin}`}>{r.elteres}</span> : null}
              {r.allas ? <AllasDoboz a={r.allas} varos={r.varos} /> : null}
              {kiemelt && r.ceg ? <div className="truncate font-semibold">{r.ceg}</div> : null}
              {kiemelt && r.telefon ? (
                <a href={`tel:${r.telefon}`} className="block truncate font-semibold text-[var(--f2-mint)] hover:underline">📞 {[r.kontaktNev, r.telefon].filter(Boolean).join(" · ")}</a>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KocsiOszlop({ k, holnapCimke }: { k: MaKocsi; holnapCimke: string }) {
  if (k.helykitolto) {
    return (
      <Doboz className="flex flex-col gap-1 border-dashed p-4 text-muted-foreground xl:min-h-40">
        <div className="text-base font-bold">{k.sofor ?? k.cimke}</div>
        {k.sofor ? <div className="text-xs">{k.cimke}</div> : null}
        <div className="mt-2 text-sm">{k.helykitolto}</div>
      </Doboz>
    );
  }
  return (
    <Doboz className="flex flex-col">
      <details open className="group flex flex-col">
        <summary className="flex cursor-pointer list-none flex-col gap-1 border-b border-foreground/10 px-4 py-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-base font-bold">{k.sofor ?? "nincs sofőr"}</span>
            <span className="text-xs text-muted-foreground">{k.cimke}</span>
          </div>
          {k.allapot ? (
            <div className="flex items-center gap-1.5 text-sm">
              <span className={`size-2 shrink-0 rounded-full ${ALLAPOT_PONT[k.allapot.szin]}`} />
              <span className={k.allapot.szin === "amber" ? "font-semibold text-[var(--f2-amb)]" : "font-semibold"}>{k.allapot.szoveg}</span>
            </div>
          ) : null}
          {k.allapot?.hely ? <div className="truncate text-xs text-muted-foreground">{k.allapot.hely}</div> : null}
        </summary>

        <div className="flex flex-col gap-3 px-4 py-3">
          {k.vezetesSor || k.hetiSor || k.napiKm != null ? (
            <div className="rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              {k.vezetesSor ? <div>{k.vezetesSor}</div> : null}
              <div>
                {[k.hetiSor, k.napiKm != null ? `ma ${k.napiKm} km` : null].filter(Boolean).join(" · ")}
                <span className="opacity-70"> · GPS-becslés, nem tachográf</span>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-1">
            <SzakaszCim>Ma</SzakaszCim>
            {k.sorok.length > 0 ? (
              <Tukor sorok={k.sorok} />
            ) : (
              <Link href="/fuvarozas2/tervezes" className="rounded-xl bg-[var(--f2-amb-l)] px-3 py-2 text-xs font-semibold text-[var(--f2-amb)] hover:underline">
                Üres nap — keress fuvart →
              </Link>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <SzakaszCim>{holnapCimke}</SzakaszCim>
            {k.holnap.map((b) => <BlokkSorok key={b.id} b={b} osszecsuk />)}
            {k.holnap.length === 0 ? (
              k.holnapFolytatodik ? (
                <div className="text-xs text-muted-foreground">A mai fuvar folytatódik.</div>
              ) : (
                <Link href="/fuvarozas2/tervezes" className="rounded-xl bg-[var(--f2-amb-l)] px-3 py-2 text-xs font-semibold text-[var(--f2-amb)] hover:underline">
                  Nincs fuvar — keress →
                </Link>
              )
            ) : null}
          </div>

          {k.papir.length > 0 ? (
            <div className="flex flex-col gap-1">
              <SzakaszCim>Papír / számla</SzakaszCim>
              {k.papir.map((p) => (
                <Link key={p.szoveg} href={p.href} className="text-xs font-semibold text-[var(--f2-amb)] hover:underline">{p.szoveg}</Link>
              ))}
            </div>
          ) : null}
        </div>
      </details>
    </Doboz>
  );
}

/** A ma nyugtázott eltérések, összecsukva — „vissza” gombbal visszatehetők a sávba. */
function NyugtazottLista({ adat, kulon = false }: { adat: MaVaszon; kulon?: boolean }) {
  if (adat.nyugtazott.length === 0) return null;
  return (
    <details className={kulon ? "rounded-2xl border border-foreground/10 bg-card px-4 py-2 text-sm" : "text-sm"}>
      <summary className="cursor-pointer text-xs text-muted-foreground">
        {kulon ? "Nincs nyitott eltérés · " : ""}{adat.nyugtazott.length} nyugtázva ma
      </summary>
      <div className="mt-1.5 flex flex-col gap-1">
        {adat.nyugtazott.map((e) => (
          <div key={e.kulcs} className="flex items-baseline gap-2 text-xs text-muted-foreground">
            <span className="shrink-0 font-semibold">{e.badge}</span>
            <span className="min-w-0 flex-1 truncate">{e.cim}</span>
            <span className="shrink-0">{e.nyugtazta ?? "—"} · {e.mikor}</span>
            {adat.nyugtazhat ? <VisszavonGomb kulcs={e.kulcs} /> : null}
          </div>
        ))}
      </div>
    </details>
  );
}

export function MaVaszonNezet({ adat }: { adat: MaVaszon }) {
  const iroda = adat.csempek.filter((c) => c.kulcs !== "uton" && c.kulcs !== "elteres");
  return (
    <div className="flex flex-col gap-4">
      <Csempesor berHavi={adat.berHavi} berHeti={adat.berHeti} berHonapHetei={adat.berHonapHetei} />

      <div className="-mb-2 flex justify-end">
        <AutoFrissites frissitve={adat.frissitve} />
      </div>

      {adat.elteresek.length === 0 && adat.nyugtazott.length === 0 ? null : adat.elteresek.length === 0 ? (
        <NyugtazottLista adat={adat} kulon />
      ) : (
        <div
          className={`flex flex-col gap-1.5 rounded-2xl border px-4 py-3 ${
            adat.elteresek.some((e) => e.szin === "red") ? "border-[var(--f2-red)]/30 bg-[var(--f2-red-l)]" : "border-[var(--f2-amb)]/30 bg-[var(--f2-amb-l)]"
          }`}
        >
          <SzakaszCim>Eltérés ({adat.elteresek.length}) — ami nem terv szerint megy</SzakaszCim>
          <div className="grid gap-x-6 gap-y-1.5 lg:grid-cols-2">
            {adat.elteresek.map((e) => <ElteresSor key={e.kulcs} e={e} nyugtazhat={adat.nyugtazhat} />)}
          </div>
          <NyugtazottLista adat={adat} />
        </div>
      )}

      <HetRacs het={adat.het} />

      <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-4">
        {adat.kocsik.map((k, i) => <KocsiOszlop key={k.kod ?? `hely-${i}`} k={k} holnapCimke={adat.holnapCimke} />)}
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-2">
        <Doboz className="flex flex-col gap-2 p-4">
          <SzakaszCim>Kocsi nélkül — ma / {adat.holnapCimke.toLowerCase()} ({adat.kocsiNelkul.length})</SzakaszCim>
          {adat.kocsiNelkul.length === 0 ? (
            <div className="text-sm text-muted-foreground">Minden fuvarnak van kocsija.</div>
          ) : (
            adat.kocsiNelkul.map((s) => (
              <Link key={s.id} href={reszlet(s.id)} className="flex items-baseline justify-between gap-2 text-sm hover:underline">
                <span className="min-w-0 truncate font-semibold text-[var(--f2-red)]">{s.partner}<span className="font-normal text-muted-foreground"> · {s.utvonal}</span></span>
                <span className="shrink-0 text-xs text-muted-foreground">{s.nap ?? "—"}</span>
              </Link>
            ))
          )}
        </Doboz>

        <Doboz className="flex flex-col gap-2 p-4">
          <SzakaszCim>Iroda és {adat.holnapCimke.toLowerCase()}</SzakaszCim>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
            {iroda.map((c) => {
              const belso = (
                <>
                  <span className="text-xs text-muted-foreground">{c.cimke}</span>
                  <b className={`tabular-nums ${SZIN_ERTEK[c.szin]}`}>{c.ertek}</b>
                  {c.also ? <span className="truncate text-[11px] text-muted-foreground">{c.also}</span> : null}
                </>
              );
              return c.href ? (
                <Link key={c.kulcs} href={c.href} className="flex flex-col hover:underline">{belso}</Link>
              ) : (
                <div key={c.kulcs} className="flex flex-col">{belso}</div>
              );
            })}
            {adat.holnapDoboz.map((h) => (
              <Link key={h.cimke} href="/fuvarozas2/tervezes" className="flex flex-col hover:underline">
                <span className="text-xs text-muted-foreground">{h.cimke}</span>
                <b className={`tabular-nums ${SZIN_ERTEK[h.szin]}`}>{h.ertek}</b>
              </Link>
            ))}
          </div>
        </Doboz>
      </div>
    </div>
  );
}
