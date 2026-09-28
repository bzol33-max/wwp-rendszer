import Link from "next/link";
import type { MaVaszon, Elteres, MaKocsi, MaBlokk, CsempeSzin, MaKocsiAllapot } from "@/lib/fuvarozas2/ma-vaszon";

// A „Ma" képernyő (Budaházi Zoltán, 2026-09-28): négy kocsi-oszlop egymás
// mellett, mindegyik ugyanabban a sorrendben — fejléc (hol van most),
// vezetési idő, Most, Ma hátra, a következő munkanap, papír/számla. Fölötte
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

function ElteresSor({ e }: { e: Elteres }) {
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
  const oszt = "flex items-start gap-2 text-sm";
  return e.href ? <Link href={e.href} className={`${oszt} hover:underline`}>{belso}</Link> : <div className={oszt}>{belso}</div>;
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
  const vanFuvar = k.ma.length > 0;
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

          {k.most ? (
            <div className="flex flex-col gap-1">
              <SzakaszCim>Most</SzakaszCim>
              <Link
                href={reszlet(k.most.fuvarId)}
                className={`flex flex-col gap-0.5 rounded-xl border px-3 py-2 hover:ring-1 hover:ring-foreground/20 ${
                  k.most.kiemelt === "varakozik"
                    ? "border-[var(--f2-red)]/40 bg-[var(--f2-red-l)]"
                    : k.most.kiemelt === "kesik"
                      ? "border-[var(--f2-amb)]/40 bg-[var(--f2-amb-l)]"
                      : "border-foreground/10"
                }`}
              >
                <span className="text-sm font-bold">
                  {k.most.tipus === "felrako" ? "Felrakó" : "Lerakó"} · {k.most.varos}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">{k.most.hanyadik}</span>
                </span>
                {k.most.ceg ? <span className="text-xs font-semibold">{k.most.ceg}</span> : null}
                <span className="truncate text-xs text-muted-foreground">{k.most.cim}</span>
                <span className="text-xs">
                  {[k.most.allapot, k.most.ablak ? `ablak ${k.most.ablak}` : null, k.etaSor].filter(Boolean).join(" · ")}
                </span>
                <span className="truncate text-xs text-muted-foreground">{k.most.partner}</span>
              </Link>
              {k.most.telefon ? (
                <a href={`tel:${k.most.telefon}`} className="w-fit text-xs font-semibold text-[var(--f2-mint)] hover:underline">
                  📞 {[k.most.kontaktNev, k.most.telefon].filter(Boolean).join(" · ")}
                </a>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <SzakaszCim>Ma</SzakaszCim>
            {vanFuvar ? (
              k.ma.map((b) => <BlokkSorok key={b.id} b={b} osszecsuk={b.megallok.length > 6} />)
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

export function MaVaszonNezet({ adat }: { adat: MaVaszon }) {
  const iroda = adat.csempek.filter((c) => c.kulcs !== "uton" && c.kulcs !== "elteres");
  return (
    <div className="flex flex-col gap-4">
      {adat.elteresek.length === 0 ? (
        <div className="rounded-2xl border border-[var(--f2-mint)]/30 bg-[var(--f2-mint-l)] px-4 py-2 text-sm text-[var(--f2-mint)]">
          Minden terv szerint megy — nincs késés, várakozás vagy jóváhagyásra váró levél.
        </div>
      ) : (
        <div
          className={`flex flex-col gap-1.5 rounded-2xl border px-4 py-3 ${
            adat.elteresek.some((e) => e.szin === "red") ? "border-[var(--f2-red)]/30 bg-[var(--f2-red-l)]" : "border-[var(--f2-amb)]/30 bg-[var(--f2-amb-l)]"
          }`}
        >
          <SzakaszCim>Eltérés ({adat.elteresek.length}) — ami nem terv szerint megy</SzakaszCim>
          <div className="grid gap-x-6 gap-y-1.5 lg:grid-cols-2">
            {adat.elteresek.map((e) => <ElteresSor key={e.kulcs} e={e} />)}
          </div>
        </div>
      )}

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
