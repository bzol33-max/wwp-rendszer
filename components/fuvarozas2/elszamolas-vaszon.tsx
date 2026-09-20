"use client";

// Elszámolás a tervvászon (D5) szerint: szakaszonként egy-egy szekció, és
// minden kártyán az a gomb, ami ott következik. A számla e-mail piszkozata
// kibontható és kimásolható (automatikus Gmail-vázlat: S17, Apps Script).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import type { ElszamolasVaszon, ElszamolasSor, Piszkozat } from "@/lib/fuvarozas2/elszamolas";
import { setSzamlaSzam, valtAllapot, setPapirBeerkezett } from "@/lib/fuvarozas2/megbizasok";

const ft = (n: number | null | undefined, p = "Ft") => (n == null ? "—" : `${new Intl.NumberFormat("hu-HU").format(n)} ${p}`);
const nap = (d: string | null | undefined) => (d ? d.slice(5).replace("-", ".") + "." : "—");

function Szakasz({ cim, szam, also, children }: { cim: string; szam: string; also?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{cim}</h2>
        <span className="text-[11px] font-semibold text-foreground">{szam}</span>
        {also ? <span className="text-[11px] text-muted-foreground">{also}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Kartya({ s, jobb, children }: { s: ElszamolasSor; jobb?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-foreground/10 bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/fuvarozas2/megbizasok/${s.id}`} className="text-sm font-bold hover:underline">
            {s.partner_nev ?? "(nincs megbízó)"}
          </Link>
          <span className="ml-2 text-xs text-muted-foreground">{s.hivatkozas ?? "nincs hivatkozás"}</span>
          <div className="text-xs text-muted-foreground">
            {s.felrako ?? "—"} → {s.lerako ?? "—"} · lerakva {nap(s.lerakas_nap)}{s.jarmu_kod ? ` · ${s.jarmu_kod}` : ""}
          </div>
        </div>
        <div className="shrink-0 text-right text-sm">{jobb}</div>
      </div>
      {children}
    </div>
  );
}

function PiszkozatDoboz({ p }: { p: Piszkozat }) {
  const masol = async () => {
    const szoveg = `Címzett: ${p.cimzett ?? "(nincs számlázási e-mail a törzsben)"}\nTárgy: ${p.targy}\n\n${p.szoveg}`;
    try {
      await navigator.clipboard.writeText(szoveg);
      toast.success("A piszkozat a vágólapon");
    } catch {
      toast.error("A másolás nem sikerült — jelöld ki és másold kézzel");
    }
  };
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-muted/40 p-3 text-xs">
      <div><span className="text-muted-foreground">Címzett:</span> {p.cimzett ?? <span className="text-[var(--f2-amb)]">nincs számlázási e-mail a partner-törzsben</span>}</div>
      <div><span className="text-muted-foreground">Tárgy:</span> {p.targy}</div>
      <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed">{p.szoveg}</pre>
      <div className="flex flex-wrap gap-2 text-muted-foreground">{p.csatolmanyok.map((c) => <span key={c}>📎 {c}</span>)}</div>
      <button type="button" onClick={masol} className="self-start rounded-lg border border-foreground/15 px-3 py-1.5 text-xs font-semibold">Piszkozat másolása</button>
    </div>
  );
}

export function ElszamolasVaszonNezet({ adat }: { adat: ElszamolasVaszon }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [szamok, setSzamok] = useState<Record<string, string>>({});
  const fut = (nev: string, fn: () => Promise<unknown>) =>
    start(async () => {
      try { await fn(); toast.success(nev); router.refresh(); }
      catch (e) { toast.error(e instanceof Error ? e.message : "Nem sikerült"); }
    });
  const gomb = "rounded-lg bg-[var(--f2-mint)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50";
  const gomb2 = "rounded-lg border border-foreground/15 px-3 py-2 text-xs font-semibold disabled:opacity-50";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2 text-sm">
        <span className={`rounded-lg px-3 py-1.5 ${adat.fejlec.lejartDb > 0 ? "bg-[var(--f2-red-l)] text-[var(--f2-red)]" : "bg-card ring-1 ring-foreground/10"}`}>
          {adat.fejlec.lejartDb} lejárt számla{adat.fejlec.lejartFt > 0 ? ` · ${ft(adat.fejlec.lejartFt)}` : ""}
        </span>
        <span className="rounded-lg bg-card px-3 py-1.5 ring-1 ring-foreground/10">{adat.fejlec.piszkozatDb} e-mail piszkozat vár</span>
        <a href="https://www.szamlazz.hu" target="_blank" rel="noreferrer" className="rounded-lg bg-card px-3 py-1.5 underline ring-1 ring-foreground/10">Számlázz.hu ↗</a>
      </div>

      <Szakasz cim="Fotóra vár" szam={String(adat.fotoraVar.length)} also="teljesítve, a sofőr fuvarlevél-fotója még nincs">
        {adat.fotoraVar.length === 0 ? <Ures /> : adat.fotoraVar.map((s) => (
          <Kartya key={s.id} s={s} jobb={<span className="text-muted-foreground">{ft(s.fuvardij, s.fuvardij_penznem)}</span>}>
            <div className="text-xs text-[var(--f2-amb)]">A számlázáshoz a fotó elég — az eredeti papír a postázáshoz kell.</div>
            <div className="flex gap-2">
              <button type="button" disabled={pending} className={gomb2} onClick={() => fut("Számlázhatóra állítva", () => valtAllapot(s.id, "szamlazhato", { kezi: true }))}>
                Számlázható (fotó nélkül, kézi)
              </button>
            </div>
          </Kartya>
        ))}
      </Szakasz>

      <Szakasz cim="Számlázható" szam={`${adat.szamlazhato.length} · ${ft(adat.osszegek.szamlazhatoFt)}`}>
        {adat.szamlazhato.length === 0 ? <Ures /> : adat.szamlazhato.map((s) => (
          <Kartya key={s.id} s={s} jobb={<><div className="font-semibold">{ft(s.fuvardij, s.fuvardij_penznem)}</div><div className="text-xs text-muted-foreground">{s.fizetesi_hatarido_nap ?? 30} nap</div></>}>
            <div className="text-xs text-muted-foreground">
              {s.foto_van ? "fotó ✓" : "fotó nincs"} · a számlára: <b className="text-foreground">{s.szamlanKertSzam ? `${s.szamlanKertSzam} ` : ""}{s.hivatkozas ?? "—"}</b>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a href="https://www.szamlazz.hu" target="_blank" rel="noreferrer" className={gomb2}>Kiállítom a Számlázz.hu-ban ↗</a>
              <input
                value={szamok[s.id] ?? ""} onChange={(e) => setSzamok({ ...szamok, [s.id]: e.target.value })}
                placeholder="számlaszám" className="w-40 rounded-lg border border-foreground/15 bg-card px-3 py-2 text-xs"
              />
              <button type="button" disabled={pending || !(szamok[s.id] ?? "").trim()} className={gomb}
                onClick={() => fut("Számla párosítva", () => setSzamlaSzam(s.id, szamok[s.id]))}>Számlaszám rögzítése</button>
            </div>
          </Kartya>
        ))}
      </Szakasz>

      <Szakasz cim="Számlázva → e-mail" szam={String(adat.emailre.length)} also="a piszkozat kész, küldeni kézzel kell">
        {adat.emailre.length === 0 ? <Ures /> : adat.emailre.map((s) => (
          <Kartya key={s.id} s={s} jobb={<><div className="font-semibold">{s.szamla_szam ?? "—"}</div><div className="text-xs text-muted-foreground">{ft(s.fuvardij, s.fuvardij_penznem)}</div></>}>
            <PiszkozatDoboz p={s.piszkozat} />
            <div className="flex gap-2">
              <button type="button" disabled={pending} className={gomb} onClick={() => fut("E-mail elment", () => valtAllapot(s.id, "email_elment"))}>E-mail elment ✓</button>
            </div>
          </Kartya>
        ))}
      </Szakasz>

      <Szakasz cim="E-mail elment → posta" szam={String(adat.postazando.length)} also="az eredeti papír a postázás feltétele (Szabina nyugtáz)">
        {adat.postazando.length === 0 ? <Ures /> : adat.postazando.map((s) => (
          <Kartya key={s.id} s={s} jobb={<div className="font-semibold">{s.szamla_szam ?? "—"}</div>}>
            <div className="text-xs">
              {s.papirok_beerkeztek_at
                ? <span className="text-[var(--f2-mint)]">eredeti papír beérkezett ✓</span>
                : <span className={s.papirHatra != null && s.papirHatra <= 2 ? "text-[var(--f2-red)]" : "text-[var(--f2-amb)]"}>
                    eredeti papír még nincs{s.papirHatra != null ? ` · határidő ${s.papirHatra} nap` : ""}
                  </span>}
              {" · "}
              {s.postazasi_cim ?? <span className="text-[var(--f2-amb)]">nincs postázási cím a törzsben</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              {!s.papirok_beerkeztek_at ? (
                <button type="button" disabled={pending} className={gomb2} onClick={() => fut("Papír beérkezett", () => setPapirBeerkezett(s.id, true))}>Papír megjött ✓</button>
              ) : null}
              <button type="button" disabled={pending || !s.papirok_beerkeztek_at} className={gomb}
                onClick={() => fut("Postázva", () => valtAllapot(s.id, "postazva"))}>Postázva ✓</button>
            </div>
          </Kartya>
        ))}
      </Szakasz>

      <Szakasz cim="Kintlévőség" szam={`${adat.kintlevoseg.length}`} also="Számlázz.hu-szinkronból">
        {adat.kintlevoseg.length === 0 ? <Ures /> : (
          <div className="overflow-x-auto rounded-2xl border border-foreground/10 bg-card">
            <table className="w-full text-sm">
              <tbody>
                {adat.kintlevoseg.map((k) => (
                  <tr key={k.szamlaszam} className="border-b border-foreground/5 last:border-0">
                    <td className="px-3 py-2">{k.vevo}</td>
                    <td className="px-3 py-2 text-muted-foreground">{k.szamlaszam}</td>
                    <td className="px-3 py-2 text-muted-foreground">esedékes {k.esedekes ?? "—"}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${k.lejart ? "font-semibold text-[var(--f2-red)]" : ""}`}>{ft(k.brutto, k.penznem)}</td>
                    <td className="px-3 py-2 text-xs">{k.lejart ? <span className="rounded-full bg-[var(--f2-red-l)] px-2 py-0.5 text-[var(--f2-red)]">lejárt</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Szakasz>
    </div>
  );
}

function Ures() {
  return <div className="rounded-2xl border border-dashed border-foreground/15 px-4 py-3 text-sm text-muted-foreground">Ebben a szakaszban most nincs fuvar.</div>;
}
