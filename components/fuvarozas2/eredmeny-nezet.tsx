import Link from "next/link";
import { cn } from "@/lib/utils";
import { ezerFt, type Vizeses } from "@/lib/fuvarozas2/eredmeny-alap";
import type { EredmenyAdat, EredmenyKocsi } from "@/lib/fuvarozas2/eredmeny";

// Eredmény oldal (az új terv 4. oldala): három kérdés, kocsinként vízesés,
// havi fedezet, megbízók fedezet szerint. Szerver-komponens, csak megjelenít.

const KOCSI_SZIN = ["#2f6fa8", "#1f8f6e", "#7a4b9a", "#a8690f"];
const ftSzam = (ft: number) => `${ft > 0 ? "+" : ft < 0 ? "−" : ""}${Math.abs(Math.round(ft)).toLocaleString("hu-HU")} Ft`;
const nev = (k: { sofor: string | null; kod: string }) => k.sofor ?? k.kod;
const pozSzin = (ft: number) => (ft < 0 ? "text-[var(--f2-red)]" : "text-[var(--f2-mint)]");
const eurSzam = (eur: number) => `${eur.toLocaleString("hu-HU", { maximumFractionDigits: 2 })} EUR`;

function Kerdes({ kerdes, ertek, szin, sor1, sor2, sor3 }: { kerdes: string; ertek: string; szin?: string; sor1?: React.ReactNode; sor2?: React.ReactNode; sor3?: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5 rounded-2xl bg-card px-5 py-4 ring-1 ring-foreground/10">
      <h2 className="text-sm font-medium text-muted-foreground">{kerdes}</h2>
      <div className={cn("text-3xl font-semibold tabular-nums tracking-tight", szin)}>{ertek}</div>
      {sor1 ? <div className="text-sm">{sor1}</div> : null}
      {sor2 ? <div className="text-xs text-muted-foreground">{sor2}</div> : null}
      {sor3 ? <div className="text-xs text-muted-foreground">{sor3}</div> : null}
    </section>
  );
}

function VizesesAbra({ v }: { v: Vizeses }) {
  const lepesek: { cimke: string; ertek: number; tipus: "bevetel" | "koltseg" | "fedezet" }[] = [
    { cimke: "bevétel", ertek: v.bevetel, tipus: "bevetel" },
    { cimke: "üzemanyag", ertek: -v.uzemanyag, tipus: "koltseg" },
    { cimke: "útdíj", ertek: -v.utdij, tipus: "koltseg" },
    { cimke: "napi fix", ertek: -v.napiFix, tipus: "koltseg" },
    ...(v.uresAllas !== 0 ? [{ cimke: "üres út, állás", ertek: -v.uresAllas, tipus: "koltseg" as const }] : []),
    ...(Math.abs(v.egyeb) >= 1000 ? [{ cimke: "egyéb", ertek: -v.egyeb, tipus: "koltseg" as const }] : []),
    { cimke: "fedezet", ertek: v.fedezet, tipus: "fedezet" },
  ];
  // Futó összeg: minden költség-oszlop onnan indul, ahol az előző véget ért.
  let fut = 0;
  const oszlopok = lepesek.map((l) => {
    if (l.tipus === "bevetel") { fut = l.ertek; return { ...l, also: 0, felso: l.ertek }; }
    if (l.tipus === "fedezet") return { ...l, also: Math.min(0, l.ertek), felso: Math.max(0, l.ertek) };
    const elotte = fut;
    fut += l.ertek;
    return { ...l, also: Math.min(elotte, fut), felso: Math.max(elotte, fut) };
  });
  const max = Math.max(1, ...oszlopok.map((o) => o.felso));
  const min = Math.min(0, ...oszlopok.map((o) => o.also));
  const tart = max - min;
  const MAG = 200;
  const y = (x: number) => ((x - min) / tart) * MAG;
  const szel = 100 / oszlopok.length;
  return (
    <div>
      <div className="relative" style={{ height: MAG + 22 }}>
        {min < 0 ? <div className="absolute inset-x-0 border-t border-dashed border-foreground/30" style={{ bottom: y(0) }} /> : null}
        {oszlopok.map((o, i) => {
          const szin = o.tipus === "bevetel" ? "#1e2325" : o.tipus === "koltseg" ? "#c9a46a" : o.ertek < 0 ? "var(--f2-red)" : "#1f8f6e";
          return (
            <div key={o.cimke} className="absolute" style={{ left: `${i * szel + szel * 0.15}%`, width: `${szel * 0.7}%`, bottom: 0, height: MAG + 22 }}>
              <div className="absolute inset-x-0 rounded-sm" style={{ bottom: y(o.also), height: Math.max(2, y(o.felso) - y(o.also)), background: szin }} />
              <div className={cn("absolute inset-x-0 text-center text-[11px] font-medium tabular-nums", o.tipus === "fedezet" ? pozSzin(o.ertek) : "")} style={{ bottom: y(o.felso) + 3 }}>
                {o.tipus === "bevetel" ? ezerFt(o.ertek, false) : ezerFt(o.ertek)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex border-t pt-1.5">
        {oszlopok.map((o) => (
          <div key={o.cimke} className="text-center text-[11px] text-muted-foreground" style={{ width: `${szel}%` }}>{o.cimke}</div>
        ))}
      </div>
    </div>
  );
}

function KocsiKartya({ k, idoszak }: { k: EredmenyKocsi; idoszak: string }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-card px-5 py-4 ring-1 ring-foreground/10">
      <div className="flex items-baseline gap-2">
        <h3 className="font-semibold">{nev(k)} · {k.kod}</h3>
        <span className="text-xs text-muted-foreground">{k.berDb} bérfuvar · {idoszak}</span>
        <span className={cn("ml-auto text-lg font-semibold tabular-nums", pozSzin(k.vizeses.fedezet))}>{ftSzam(k.vizeses.fedezet)}</span>
      </div>
      {k.atvaltatlanEur > 0 ? (
        <div className="-mt-1 text-xs text-[var(--f2-amb)]">+ {eurSzam(k.atvaltatlanEur)} átváltás nélkül (nincs árfolyam) — a bevételben és a fedezetben nincs benne, a költsége igen</div>
      ) : null}
      {k.berDb > 0 || k.vizeses.uresAllas !== 0 ? <VizesesAbra v={k.vizeses} /> : <p className="py-8 text-center text-sm text-muted-foreground">Ebben az időszakban nem volt bérfuvar.</p>}
    </section>
  );
}

function HaviAbra({ honapok }: { honapok: EredmenyAdat["honapok"] }) {
  const kodok = [...new Set(honapok.flatMap((h) => h.kocsik.filter((k) => k.fedezet !== 0).map((k) => k.kod)))];
  const sofor = new Map(honapok.flatMap((h) => h.kocsik.map((k) => [k.kod, nev(k)] as const)));
  const ertekek = honapok.flatMap((h) => h.kocsik.map((k) => k.fedezet));
  const max = Math.max(1, ...ertekek.map((x) => Math.abs(x)));
  const vanNeg = ertekek.some((x) => x < 0);
  const FEL = 120, LE = vanNeg ? 80 : 0;
  const mag = (x: number) => (Math.abs(x) / max) * (x < 0 ? LE : FEL);
  if (kodok.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">Az elmúlt 4 hónapban nem volt bérfuvar.</p>;
  return (
    <div>
      <div className="mb-2 flex gap-3 text-xs">
        {kodok.map((k, i) => <span key={k} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: KOCSI_SZIN[i % KOCSI_SZIN.length] }} />{sofor.get(k)}</span>)}
      </div>
      <div className="grid" style={{ gridTemplateColumns: `repeat(${honapok.length}, minmax(0,1fr))` }}>
        {honapok.map((h) => (
          <div key={h.cimke} className="flex flex-col items-center">
            <div className="relative flex w-full justify-center gap-2" style={{ height: FEL + LE + 32 }}>
              {kodok.map((kod, i) => {
                const f = h.kocsik.find((k) => k.kod === kod)?.fedezet ?? 0;
                const szin = KOCSI_SZIN[i % KOCSI_SZIN.length];
                return (
                  <div key={kod} className="relative w-9" style={{ height: FEL + LE + 32 }}>
                    <div className="absolute inset-x-0 rounded-sm" style={{ background: szin, opacity: h.folyamatban ? 0.7 : 1, height: Math.max(f === 0 ? 0 : 2, mag(f)), ...(f >= 0 ? { bottom: LE + 16 } : { top: FEL + 16 }) }} />
                    <div className={cn("absolute inset-x-[-8px] text-center text-[11px] font-medium tabular-nums", pozSzin(f))} style={f >= 0 ? { bottom: LE + 18 + mag(f) } : { top: FEL + 18 + mag(f) }}>
                      {f === 0 ? "" : ezerFt(f).replace(" e", "")}
                    </div>
                  </div>
                );
              })}
              <div className="pointer-events-none absolute inset-x-0 border-t border-foreground/20" style={{ bottom: LE + 16 }} />
            </div>
            <div className="text-xs text-muted-foreground">{h.cimke}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">ezer Ft · bérfuvar fedezete kocsinként (bevétel − üzemanyag − útdíj − napi fix − üres út/állás){honapok.some((h) => h.folyamatban) ? " · a halványabb oszlop a folyamatban lévő hónap" : ""}</p>
    </div>
  );
}

export function EredmenyNezet({ adat }: { adat: EredmenyAdat }) {
  const { ingyen } = adat;
  const tobbFuvaros = adat.partnerek.filter((p) => p.db >= 2).slice(0, 12);
  const elsok = tobbFuvaros.length ? tobbFuvaros : adat.partnerek.slice(0, 8);
  const bertKocsik = adat.kocsik.filter((k) => k.berDb > 0 || k.vizeses.uresAllas !== 0);
  const tobbi = adat.partnerek.filter((p) => !elsok.includes(p));
  const becslesSzoveg = [
    "a bevétel tény",
    adat.forras.uzemanyag === "teny" ? "az üzemanyag mért (GPS + tankolás)" : "az üzemanyag részben becslés (ahol nincs mért liter vagy tankolás)",
    adat.forras.utdij === "teny" ? "az útdíj a HU-GO importból jön" : adat.vanUtdijImport ? "az útdíj részben becslés (ahol nincs HU-GO tranzakció)" : "az útdíj becslés, amíg a HU-GO import be nem fut",
    "a napi fix beállításból számolt",
  ].join("; ");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-sm text-muted-foreground">{adat.idoszakCimke}</div>
        <nav className="ml-auto flex gap-0.5 rounded-xl bg-muted p-1" aria-label="Időszak">
          {adat.valasztek.map((v) => (
            <Link key={v.k} href={`/fuvarozas2/eredmeny?idoszak=${v.k}`} aria-current={adat.valasztas === v.k ? "page" : undefined}
              className={cn("rounded-lg px-3 py-1 text-sm", adat.valasztas === v.k ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}>{v.c}</Link>
          ))}
        </nav>
      </div>

      <div className="rounded-xl bg-[var(--f2-blue-l)] px-4 py-2 text-sm text-[var(--f2-blue)]">
        <b>Mi tény, mi becslés:</b> {becslesSzoveg}.{adat.gpsHiba ? ` GPS: ${adat.gpsHiba}` : ""}
      </div>
      {adat.atvaltatlanKezi.db > 0 ? (
        <div className="rounded-xl bg-[var(--f2-amb-l)] px-4 py-2 text-sm text-[var(--f2-amb)]">
          {adat.atvaltatlanKezi.db} kézi költségsor átváltás nélkül kimaradt a költségből
          {adat.atvaltatlanKezi.eur > 0 ? ` (${eurSzam(adat.atvaltatlanKezi.eur)}, nincs árfolyam)` : ""}
          {adat.atvaltatlanKezi.masPenznemDb > 0 ? ` (${adat.atvaltatlanKezi.masPenznemDb} ismeretlen pénznemű)` : ""} — a fedezet ennyivel jobbnak látszik a valósnál.
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-3">
        <Kerdes
          kerdes="Kerestünk a bérfuvaron?"
          ertek={ezerFt(adat.fedezetOssz) + " Ft"}
          szin={pozSzin(adat.fedezetOssz)}
          sor1={<>fedezet {adat.idoszakCimke}: {bertKocsik.map((k, i) => <span key={k.kod}>{i ? ", " : ""}{nev(k)} <span className={pozSzin(k.vizeses.fedezet)}>{ezerFt(k.vizeses.fedezet)}</span></span>)}</>}
          sor2={adat.honapok.filter((h) => !h.folyamatban).map((h) => `${h.cimke}: ${ezerFt(h.kocsik.reduce((a, k) => a + k.fedezet, 0))}`).join(" · ")}
          sor3={adat.atvaltatlanEurOssz > 0 ? <span className="text-[var(--f2-amb)]">+ {eurSzam(adat.atvaltatlanEurOssz)} átváltás nélkül (nincs árfolyam) — a fedezetben nincs benne</span> : undefined}
        />
        <Kerdes
          kerdes="Kinek dolgozunk ingyen?"
          ertek={ingyen.legrosszabb ? ingyen.legrosszabb.partner : "senkinek"}
          szin={ingyen.legrosszabb ? "text-[var(--f2-red)] text-2xl" : "text-[var(--f2-mint)]"}
          sor1={ingyen.legrosszabb ? <>{ingyen.legrosszabb.db} fuvar, {ezerFt(ingyen.legrosszabb.bevetelFt, false)} Ft bevétel → <b className="text-[var(--f2-red)]">{ezerFt(ingyen.legrosszabb.fedezetFt)} Ft</b> fedezet</> : "minden rendszeres megbízó hozza a költségét"}
          sor2={ingyen.nullszaldo.length ? `${ingyen.nullszaldo.map((p) => `${p.partner} (${p.db} fuvar) ${ezerFt(p.fedezetFt)}`).join(", ")}: nullszaldó` : undefined}
          sor3="az elmúlt 4 hónap bérfuvarjai alapján"
        />
        <Kerdes
          kerdes="Mennyibe kerül a saját áru fuvarja?"
          ertek={`${ezerFt(adat.sajatOssz, false)} Ft`}
          szin="text-[var(--f2-blue)]"
          sor1={<>{adat.sajatDb} saját fuvar · {adat.kocsik.filter((k) => k.sajatBelsoFt > 0).map((k) => `${nev(k)} ${ezerFt(k.sajatBelsoFt, false)}`).join(", ") || "—"}</>}
          sor2="ezt a raklap-üzlet viseli, nem fuvarozási veszteség"
        />
      </div>

      {bertKocsik.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {bertKocsik.map((k) => <KocsiKartya key={k.kod} k={k} idoszak={adat.idoszakCimke} />)}
        </div>
      ) : (
        <p className="rounded-2xl bg-card px-5 py-8 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">Ebben az időszakban nem volt bérfuvar.</p>
      )}

      <section className="rounded-2xl bg-card px-5 py-4 ring-1 ring-foreground/10">
        <h2 className="mb-3 font-semibold">Bérfuvar fedezet havonta</h2>
        <HaviAbra honapok={adat.honapok} />
      </section>

      <section className="overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10">
        <div className="flex items-baseline gap-2 px-5 pt-4 pb-2">
          <h2 className="font-semibold">Megbízók fedezet szerint</h2>
          <span className="text-xs text-muted-foreground">{adat.honapok[0]?.cimke}–{adat.honapok[adat.honapok.length - 1]?.cimke} · bérfuvar</span>
        </div>
        {adat.partnerek.length ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr><th className="px-5 py-2 font-medium">Megbízó</th><th className="px-3 py-2 text-right font-medium">Fuvar</th><th className="px-3 py-2 text-right font-medium">Bevétel</th><th className="px-3 py-2 text-right font-medium">Fedezet</th><th className="px-5 py-2 text-right font-medium">Utolsó</th></tr>
            </thead>
            <tbody>
              {elsok.map((p) => <PartnerSorNezet key={p.partner} p={p} />)}
            </tbody>
          </table>
        ) : <p className="px-5 pb-5 text-sm text-muted-foreground">Nincs bérfuvar az elmúlt 4 hónapban.</p>}
        {tobbi.length ? (
          <details className="border-t">
            <summary className="cursor-pointer px-5 py-3 text-sm text-muted-foreground">+ {tobbi.length} további megbízó</summary>
            <table className="w-full text-sm"><tbody>{tobbi.map((p) => <PartnerSorNezet key={p.partner} p={p} />)}</tbody></table>
          </details>
        ) : null}
      </section>

      <p className="text-xs text-muted-foreground">
        A fedezet ugyanaz, mint a Kimutatás „Eredmény” oszlopa: bérfuvar-bevétel − a bérfuvarokra jutó üzemanyag, útdíj és napi fix − a fel nem osztott költség (üres utak, állás).
        A saját áru fuvarjának költsége külön szerepel, nem vonódik le. Részletes táblázat: <Link className="underline" href="/fuvarozas2/kimutatas">Kimutatás</Link>, tételek: <Link className="underline" href="/fuvarozas2/koltsegek">Költségek</Link>.
      </p>
    </div>
  );
}

function PartnerSorNezet({ p }: { p: EredmenyAdat["partnerek"][number] }) {
  return (
    <tr className="border-t border-foreground/5">
      <td className="px-5 py-2 font-medium">{p.partner}{p.elmaradt ? <span className="ml-2 rounded-full bg-[var(--f2-amb-l)] px-2 py-0.5 text-[11px] font-normal text-[#5a3806]">{p.utolso.slice(5).replace("-", ".")}. óta nincs fuvar</span> : null}</td>
      <td className="px-3 py-2 text-right tabular-nums">{p.db}</td>
      <td className="px-3 py-2 text-right tabular-nums">{ezerFt(p.bevetelFt, false)}{p.atvaltatlanEur > 0 ? <div className="text-[10px] text-[var(--f2-amb)]">+ {eurSzam(p.atvaltatlanEur)} átváltás nélkül</div> : null}</td>
      <td className={cn("px-3 py-2 text-right font-medium tabular-nums", pozSzin(p.fedezetFt))}>{ezerFt(p.fedezetFt)}{p.atvaltatlanDb > 0 ? <div className="text-[10px] font-normal text-[var(--f2-amb)]">{p.atvaltatlanDb} fuvar nélkül</div> : null}</td>
      <td className="px-5 py-2 text-right tabular-nums text-muted-foreground">{p.utolso.slice(5).replace("-", ".")}.</td>
    </tr>
  );
}
