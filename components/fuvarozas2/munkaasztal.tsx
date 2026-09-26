import Link from "next/link";
import { cn } from "@/lib/utils";
import { varosNev } from "@/lib/fuvarozas/varos";
import { formatFt, formatIdo, formatNap } from "@/components/fuvarozas2/kozos";
import { SZAKASZOK, utSzakaszai, type KeresoIndex, type Szakasz } from "@/lib/fuvarozas2/munkaasztal";
import { KeresoJavaslatok } from "@/components/fuvarozas2/kereso-javaslatok";
import { kovetkezoTeendo } from "@/lib/fuvarozas2/megbizas-szuro";
import type { KocsiMost, MunkaasztalSor } from "@/lib/fuvarozas2/megbizasok";

// A Megbízások munkaasztal (2026-09-25, Budaházi Zoltán terve): balra az
// oldalsáv (kereső mindenre, szakaszok, kocsinként bontva), középen a
// lista, jobbra az, amit a kocsi éppen csinál, és a következő fuvarja. Egy
// sorra kattintva a jobb oldalon a sor részletei nyílnak.

export type MunkaasztalSzuro = { szakasz?: Szakasz; jelleg?: "ber" | "sajat"; kocsi?: string; q?: string; reszlet?: string; kocsiMost?: string; uj?: boolean };

export function munkaasztalLink(alap: MunkaasztalSzuro, valtozas: Partial<MunkaasztalSzuro>): string {
  const p = new URLSearchParams();
  const e = { ...alap, ...valtozas };
  if (e.q) p.set("q", e.q);
  if (e.szakasz) p.set("szakasz", e.szakasz);
  if (e.jelleg) p.set("jelleg", e.jelleg);
  if (e.kocsi) p.set("kocsi", e.kocsi);
  if (e.kocsiMost) p.set("km", e.kocsiMost);
  if (e.reszlet) p.set("reszlet", e.reszlet);
  if (e.uj) p.set("uj", "1");
  const q = p.toString();
  return `/fuvarozas2/megbizasok${q ? `?${q}` : ""}`;
}

type Szamok = {
  szakasz: Record<Szakasz, number>;
  kocsik: { kod: string; cimke: string; sofor: string | null; n: number }[];
  kocsiNelkul: number;
  jelleg: { ber: number; sajat: number };
};

function SavSor({ href, cimke, n, aktiv, al, piros }: { href: string; cimke: string; n?: number; aktiv?: boolean; al?: boolean; piros?: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-baseline justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm",
        al && "py-1 pl-6 text-[13px] text-muted-foreground",
        aktiv ? "bg-[var(--f2-mint-l)] font-semibold text-[var(--f2-mint)]" : "hover:bg-muted",
        piros && !aktiv && "text-[var(--f2-red)]"
      )}
    >
      <span className="min-w-0 truncate">{cimke}</span>
      {n !== undefined ? <span className="shrink-0 font-mono text-xs tabular-nums opacity-80">{n}</span> : null}
    </Link>
  );
}

export function Oldalsav({ szuro, szamok, kereso }: { szuro: MunkaasztalSzuro; szamok: Szamok; kereso: KeresoIndex }) {
  const aktivSzakasz = szuro.q ? undefined : szuro.szakasz ?? "folyamatban";
  const csoportok = [...new Set(SZAKASZOK.map((s) => s.csoport))];
  const jellegek: { kulcs?: "ber" | "sajat"; cimke: string; n: number }[] = [
    { cimke: "Mind", n: szamok.jelleg.ber + szamok.jelleg.sajat },
    { kulcs: "ber", cimke: "Bér", n: szamok.jelleg.ber },
    { kulcs: "sajat", cimke: "Saját", n: szamok.jelleg.sajat },
  ];
  return (
    <nav className="flex flex-col gap-1 rounded-2xl border border-foreground/10 bg-card p-2.5 lg:sticky lg:top-4" aria-label="Megbízások szűrése">
      <Link
        href={munkaasztalLink({ jelleg: szuro.jelleg }, { szakasz: "elokeszites", uj: true })}
        className="mb-1 rounded-lg bg-[var(--f2-mint)] px-3 py-2 text-sm font-bold text-white hover:opacity-90"
      >
        + Új saját fuvar
      </Link>
      <KeresoJavaslatok key={szuro.q ?? ""} index={kereso} kezdo={szuro.q ?? ""} jelleg={szuro.jelleg} />
      {szuro.q ? <SavSor href={munkaasztalLink({ jelleg: szuro.jelleg }, {})} cimke="× keresés törlése" /> : null}

      <div className="mt-1 flex gap-1 rounded-lg bg-muted p-1">
        {jellegek.map((j) => (
          <Link
            key={j.cimke}
            href={munkaasztalLink(szuro, { jelleg: j.kulcs, reszlet: undefined })}
            className={cn("flex-1 rounded-md py-1 text-center text-[13px] font-semibold", szuro.jelleg === j.kulcs ? "bg-card shadow-sm" : "text-muted-foreground")}
          >
            {j.cimke}
          </Link>
        ))}
      </div>

      {csoportok.map((cs) => (
        <div key={cs} className="flex flex-col gap-0.5">
          <div className="px-2.5 pb-0.5 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{cs}</div>
          {SZAKASZOK.filter((s) => s.csoport === cs).map((s) => (
            <div key={s.kulcs} className="flex flex-col gap-0.5">
              <SavSor
                href={munkaasztalLink({ jelleg: szuro.jelleg, kocsiMost: szuro.kocsiMost }, { szakasz: s.kulcs })}
                cimke={s.cimke}
                n={szamok.szakasz[s.kulcs]}
                aktiv={aktivSzakasz === s.kulcs && !szuro.kocsi}
              />
              {s.kulcs === "folyamatban" ? (
                <>
                  {szamok.kocsik.map((k) => (
                    <SavSor
                      key={k.kod}
                      al
                      href={munkaasztalLink({ jelleg: szuro.jelleg }, { szakasz: "folyamatban", kocsi: k.kod, kocsiMost: k.kod })}
                      cimke={k.sofor ? `${k.sofor} · ${k.kod}` : k.kod}
                      n={k.n}
                      aktiv={aktivSzakasz === "folyamatban" && szuro.kocsi === k.kod}
                    />
                  ))}
                  {szamok.kocsiNelkul > 0 ? (
                    <SavSor
                      al
                      piros
                      href={munkaasztalLink({ jelleg: szuro.jelleg }, { szakasz: "folyamatban", kocsi: "nincs" })}
                      cimke="kocsi nélkül"
                      n={szamok.kocsiNelkul}
                      aktiv={aktivSzakasz === "folyamatban" && szuro.kocsi === "nincs"}
                    />
                  ) : null}
                </>
              ) : null}
            </div>
          ))}
        </div>
      ))}
    </nav>
  );
}

/** Rövid útvonal: az első felrakó és az utolsó lerakó városa. */
function varos(cim: string | null): string {
  if (!cim) return "—";
  const elso = cim.split(/;|\s\+\s/)[0].trim();
  const v = varosNev(elso).trim();
  if (v && v.length <= 32) return v;
  return elso.length > 32 ? `${elso.slice(0, 31)}…` : elso;
}
function utolsoVaros(cim: string | null): string {
  if (!cim) return "—";
  const reszek = cim.split(/;|\s\+\s/);
  return varos(reszek[reszek.length - 1]);
}
function megalloDb(cim: string | null): number {
  return cim ? cim.split(/;|\s\+\s/).filter((x) => x.trim()).length : 0;
}

function Csik({ s }: { s: MunkaasztalSor }) {
  const ut = utSzakaszai(s.jelleg);
  const hol = ut.indexOf(s.szakasz);
  return (
    <span className="mt-1 flex gap-0.5" aria-hidden>
      {ut.map((sz, i) => (
        <i
          key={sz}
          className={cn(
            "h-1.5 w-5 rounded-full",
            i < hol || s.szakasz === "archiv" ? "bg-[var(--f2-mint)]" : i === hol ? "bg-[var(--f2-blue)]" : "bg-foreground/10"
          )}
        />
      ))}
    </span>
  );
}

export function MunkaLista({ sorok, ma, szuro, cim }: { sorok: MunkaasztalSor[]; ma: string; szuro: MunkaasztalSzuro; cim: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-2xl border border-foreground/10 bg-card p-3">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h2 className="text-base font-semibold">{cim}</h2>
        <span className="text-xs text-muted-foreground">{sorok.length === 300 ? "az első 300" : `${sorok.length} megbízás`}</span>
      </div>
      {sorok.length === 0 ? <p className="px-1 py-6 text-center text-sm text-muted-foreground">Nincs ilyen megbízás.</p> : null}
      <ul className="flex flex-col">
        {sorok.map((s) => {
          const t = s.elokeszites
            ? (() => {
                const h = [!s.elokeszites_jarmu && "kocsi", !s.felrako?.trim() && "honnan", !s.lerako?.trim() && "hová"].filter(Boolean);
                return h.length ? { szoveg: `előkészítés · hiányzik: ${h.join(", ")}`, surgos: true } : { szoveg: "kocsira adható", surgos: false };
              })()
            : kovetkezoTeendo(s, ma);
          const kijelolt = szuro.reszlet === s.id;
          const db = megalloDb(s.felrako) + megalloDb(s.lerako);
          return (
            <li key={s.id}>
              <Link
                href={munkaasztalLink(szuro, { reszlet: s.id })}
                className={cn(
                  "grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_auto] items-start gap-3 border-b border-foreground/5 px-2 py-2.5 text-sm hover:bg-muted/50",
                  kijelolt && "bg-[var(--f2-blue-l)]"
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{s.kitol ? `${s.kitol} → ${s.partner_nev ?? "?"}` : s.partner_nev ?? (s.jelleg === "sajat" ? "Saját fuvar" : "(nincs megbízó)")}</span>
                  <span className="block truncate font-mono text-[11px] text-muted-foreground">{s.hivatkozas ?? (s.jelleg === "sajat" ? "saját" : "—")}</span>
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{varos(s.felrako)} → {utolsoVaros(s.lerako)}</span>
                  <span className={cn("block truncate text-xs", t.surgos ? "font-semibold text-[var(--f2-red)]" : "text-muted-foreground")}>
                    {[
                      s.jarmu_kod ?? (s.elokeszites ? s.elokeszites_jarmu ?? "—" : "kocsi nélkül"),
                      db > 2 ? `${db} megálló` : null,
                      s.szamla_szam && s.szakasz !== "szamlazasra" ? s.szamla_szam : null,
                      s.kieg_szamla_szamok?.length ? `+ kieg. ${s.kieg_szamla_szamok.join(", ")}` : null,
                      s.szallitolevel ? `szállító ${s.szallitolevel}` : null,
                      s.szakasz === "archiv" && s.postazva_at ? `feladva ${formatIdo(s.postazva_at).slice(0, 6)}` : null,
                      s.szakasz !== "archiv" ? t.szoveg : null,
                    ].filter(Boolean).join(" · ")}
                  </span>
                  <Csik s={s} />
                </span>
                <span className="text-right">
                  <span className="block font-mono text-xs tabular-nums text-muted-foreground">{formatNap(s.felrakas_nap)}{s.lerakas_nap && s.lerakas_nap !== s.felrakas_nap ? `→${formatNap(s.lerakas_nap)}` : ""}</span>
                  <span className="block font-mono text-xs tabular-nums">{s.jelleg === "ber" ? formatFt(s.fuvardij, s.fuvardij_penznem) : ""}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function KocsiMostPanel({ adat, szuro }: { adat: KocsiMost; szuro: MunkaasztalSzuro }) {
  const most = adat.most;
  const elsoNyitott = most?.megallok.findIndex((m) => !m.kesz) ?? -1;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5">
        {adat.jarmuvek.map((j) => (
          <Link
            key={j.kod}
            href={munkaasztalLink(szuro, { kocsiMost: j.kod, reszlet: undefined })}
            className={cn(
              "flex-1 rounded-xl border px-2 py-1.5 text-center text-sm font-semibold",
              adat.kod === j.kod ? "border-[var(--f2-blue)] bg-[var(--f2-blue-l)] text-[var(--f2-blue)]" : "border-foreground/10 bg-card"
            )}
          >
            {j.sofor ?? j.kod}
            <span className="block font-mono text-[11px] font-normal text-muted-foreground">{j.kod}{j.dolgozik ? " · úton" : ""}</span>
          </Link>
        ))}
      </div>

      {most ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--f2-blue)] bg-card p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <span className="rounded-full bg-[var(--f2-blue-l)] px-2 py-0.5 text-[11px] font-semibold text-[var(--f2-blue)]">most ezen dolgozik</span>
              <Link href={munkaasztalLink(szuro, { reszlet: most.id })} className="mt-1 block truncate text-lg font-bold hover:underline">
                {most.partner_nev ?? (most.jelleg === "sajat" ? "Saját fuvar" : "(nincs megbízó)")}
              </Link>
              <span className="block font-mono text-xs text-muted-foreground">{most.hivatkozas ?? ""}</span>
            </div>
            {most.jelleg === "ber" ? <span className="shrink-0 font-mono text-sm font-bold">{formatFt(most.fuvardij, most.fuvardij_penznem)}</span> : null}
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px]">
            <span className="text-muted-foreground">Idő</span>
            <span>{formatNap(most.felrakas_nap)}{most.lerakas_nap && most.lerakas_nap !== most.felrakas_nap ? ` → ${formatNap(most.lerakas_nap)}` : ""}</span>
            {most.aru || most.mennyiseg ? (<><span className="text-muted-foreground">Áru</span><span>{[most.aru, most.mennyiseg].filter(Boolean).join(" · ")}</span></>) : null}
            {most.megjegyzes ? (<><span className="text-muted-foreground">Megjegyzés</span><span>{most.megjegyzes}</span></>) : null}
          </div>
          <ol className="flex flex-col text-[13px]">
            {most.megallok.map((m, i) => (
              <li
                key={m.sorszam}
                className={cn(
                  "grid grid-cols-[22px_1fr_auto] items-start gap-2 border-t border-foreground/5 py-1.5",
                  m.kesz && "opacity-55",
                  i === elsoNyitott && "-mx-2 rounded-lg border-transparent bg-[var(--f2-blue-l)] px-2"
                )}
              >
                <span
                  className={cn(
                    "grid h-5 w-5 place-items-center rounded-full font-mono text-[11px] font-bold",
                    m.kesz ? "bg-[var(--f2-mint)] text-white" : m.tipus === "felrako" ? "bg-[var(--f2-blue-l)] text-[var(--f2-blue)]" : "bg-[var(--f2-mint-l)] text-[var(--f2-mint)]"
                  )}
                >
                  {m.sorszam}
                </span>
                <span className="min-w-0">
                  <b>{varos(m.cim)}</b>
                  {m.ceg ? <span className="text-muted-foreground"> · {m.ceg}</span> : null}
                  {i === elsoNyitott || m.kontakt ? (
                    <span className="block truncate text-[11.5px] text-muted-foreground">{[m.cim, m.kontakt, m.ido].filter(Boolean).join(" · ")}</span>
                  ) : null}
                </span>
                <span className="whitespace-nowrap font-mono text-[11.5px] font-semibold">
                  {m.rakomany ? `${m.tipus === "felrako" ? "+" : "−"}${m.rakomany}` : m.tipus === "felrako" ? "fel" : "le"}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-foreground/15 bg-card px-4 py-5 text-sm text-muted-foreground">
          {adat.kod ? "Ennek a kocsinak most nincs futó fuvarja." : "Nincs kocsi a törzsben."}
        </div>
      )}

      <div className="flex flex-col gap-0.5 rounded-2xl border border-foreground/10 bg-card px-4 py-3 text-[13px]">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Következő</span>
        {adat.kovetkezo ? (
          <Link href={munkaasztalLink(szuro, { reszlet: adat.kovetkezo.id })} className="flex flex-col hover:underline">
            <span className="flex justify-between gap-2 font-semibold">
              <span className="truncate">{adat.kovetkezo.partner_nev ?? "Saját fuvar"}</span>
              <span className="shrink-0 font-mono">{adat.kovetkezo.jelleg === "ber" ? formatFt(adat.kovetkezo.fuvardij, adat.kovetkezo.fuvardij_penznem) : ""}</span>
            </span>
            <span className="text-muted-foreground">
              {formatNap(adat.kovetkezo.felrakas_nap)} · {varos(adat.kovetkezo.felrako)} → {utolsoVaros(adat.kovetkezo.lerako)}
            </span>
          </Link>
        ) : (
          <span className="text-muted-foreground">Nincs még következő fuvar.</span>
        )}
      </div>
    </div>
  );
}
