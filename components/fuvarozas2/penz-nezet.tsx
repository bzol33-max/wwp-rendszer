import Link from "next/link";
import { cn } from "@/lib/utils";
import { SzamlazasiSegedGomb } from "@/components/fuvarozas2/szamlazasi-seged";
import { PapirGomb } from "@/components/fuvarozas2/papir-gomb";
import { munkaasztalLink, type MunkaasztalSzuro } from "@/components/fuvarozas2/munkaasztal";
import { osszegSzoveg, PENZ_SZUROK, type PenzSzuro } from "@/lib/fuvarozas2/penz-lista-alap";
import type { PenzLista, PenzSor } from "@/lib/fuvarozas2/penz-lista";

// Megbízások · pénz-nézet (az új terv 3. oldala): összesítő csempék,
// szűrők, és megbízásonként papír → számla → esedékes → fizetve.

const datum = (iso: string | null) => (iso ? `${iso.slice(5, 7)}.${iso.slice(8, 10)}.` : "—");
const HONAPOK = ["január", "február", "március", "április", "május", "június", "július", "augusztus", "szeptember", "október", "november", "december"];

function Csempe({ cim, ertek, al, szin, href }: { cim: string; ertek: string; al?: string; szin?: string; href?: string }) {
  const tartalom = (
    <>
      <div className="text-xs text-muted-foreground">{cim}</div>
      <div className={cn("text-xl font-semibold tabular-nums", szin)}>{ertek}</div>
      {al ? <div className="text-xs text-muted-foreground">{al}</div> : null}
    </>
  );
  return href
    ? <Link href={href} className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10 hover:ring-foreground/25">{tartalom}</Link>
    : <div className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">{tartalom}</div>;
}

export function PenzNezet({ adat, szuro, penz, sajatIs, elszamolasJog }: { adat: PenzLista; szuro: MunkaasztalSzuro; penz: PenzSzuro; sajatIs: boolean; elszamolasJog: boolean }) {
  const o = adat.ossz;
  const link = (v: Partial<MunkaasztalSzuro>) => munkaasztalLink(szuro, { reszlet: undefined, ...v });
  const kintSavok = o.kintlevo.savok.map(osszegSzoveg);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Csempe cim="Számlázatlan" ertek={String(o.szamlazatlan.db)} al={o.szamlazatlan.db ? osszegSzoveg(o.szamlazatlan.osszeg) : "minden kész fuvar számlázva"} szin={o.szamlazatlan.db ? "text-[var(--f2-amb)]" : "text-[var(--f2-mint)]"} href={link({ penz: "szamlazatlan" })} />
        <Csempe cim="Papír hiányzik" ertek={String(o.papir.db)} al={o.papir.db ? `a legrégebbi ${o.papir.legregebbi} napos` : "minden papír megvan"} szin={o.papir.db ? "text-[var(--f2-amb)]" : "text-[var(--f2-mint)]"} href={link({ penz: "papir" })} />
        <Csempe cim="Kintlévőség" ertek={osszegSzoveg(o.kintlevo.osszeg)} al={`0–30 nap: ${kintSavok[0]} · 31–60: ${kintSavok[1]} · 60+: ${kintSavok[2]}`} href={link({ penz: "kikuldve" })} />
        <Csempe cim="Lejárt" ertek={osszegSzoveg(o.lejart.osszeg)} al={`${o.lejart.db} számla`} szin={o.lejart.db ? "text-[var(--f2-red)]" : undefined} href={link({ penz: "lejart" })} />
        <Csempe cim={`Befolyt · ${HONAPOK[+adat.ma.slice(5, 7) - 1]}`} ertek={osszegSzoveg(o.befolyt.osszeg)} al={`${o.befolyt.db} számla`} szin="text-[var(--f2-mint)]" href={link({ penz: "fizetve" })} />
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {PENZ_SZUROK.map((f) => (
          <Link key={f.k} href={link({ penz: f.k })} scroll={false}
            className={cn("rounded-full px-3 py-1 text-sm", penz === f.k ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
            {f.c}{f.k !== "mind" && f.k !== "fizetve" && o.szamok[f.k] ? ` · ${o.szamok[f.k]}` : ""}
          </Link>
        ))}
        <Link href={link({ sajatIs: !sajatIs })} scroll={false} className="ml-auto flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <span className={cn("inline-block size-4 rounded border", sajatIs && "border-foreground bg-foreground")} aria-hidden />
          Saját áru is (nincs számlája)
        </Link>
      </div>

      <section className="overflow-x-auto rounded-2xl bg-card ring-1 ring-foreground/10">
        <table className="w-full min-w-[1100px] text-sm [&_td]:whitespace-nowrap">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Nap</th><th className="px-2 py-2 font-medium">#</th><th className="px-2 py-2 font-medium">Megbízó</th><th className="px-2 py-2 font-medium">Reláció</th>
              <th className="px-2 py-2 text-right font-medium">km</th><th className="px-2 py-2 text-right font-medium">Ár</th><th className="px-2 py-2 text-right font-medium">Ft/km</th>
              <th className="px-2 py-2 font-medium">Papír (CMR)</th><th className="px-2 py-2 font-medium">Számla</th><th className="px-2 py-2 font-medium">Esedékes</th><th className="px-2 py-2 font-medium">Fizetve</th><th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {adat.sorok.map((s) => <Sor key={s.id} s={s} reszlet={munkaasztalLink(szuro, { reszlet: s.id })} elszamolasJog={elszamolasJog} />)}
          </tbody>
        </table>
        {adat.sorok.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">{penz === "teendo" ? "Nincs teendő: minden kész fuvar számlázva, a papírok megvannak, nincs lejárt számla." : "Nincs ilyen megbízás."}</p> : null}
        {adat.osszes > adat.sorok.length ? <p className="border-t px-4 py-2 text-xs text-muted-foreground">Az első {adat.sorok.length} látszik a(z) {adat.osszes}-ból — a keresővel szűkíthetsz.</p> : null}
      </section>
      <p className="text-xs text-muted-foreground">
        Csak a lerakott (teljesített) fuvarok, az elmúlt egy évből. {adat.folyamatbanDb ? `Az úton lévő ${adat.folyamatbanDb} fuvar lerakás után jelenik meg itt teendőként; addig a Ma oldalon követed, a beérkezőket és az előkészítést a „Munkafolyamat” nézetben.` : ""}
        {" "}A számla fizetettsége a Számlázz.hu-ból jön.
      </p>
    </div>
  );
}

function Sor({ s, reszlet, elszamolasJog }: { s: PenzSor; reszlet: string; elszamolasJog: boolean }) {
  const a = s.a;
  const sz = s.szamla;
  return (
    <tr className="border-t border-foreground/5">
      <td className="px-4 py-2 tabular-nums">{datum(s.nap)}</td>
      <td className="px-2 py-2 tabular-nums"><Link href={reszlet} scroll={false} className="underline-offset-2 hover:underline">{s.id}</Link></td>
      <td className="px-2 py-2"><Link href={reszlet} scroll={false} className="font-medium hover:underline">{s.megbizo}</Link>{s.jelleg === "sajat" ? <span className="ml-1.5 rounded-full bg-[var(--f2-blue-l)] px-1.5 text-[11px] text-[var(--f2-blue)]">saját</span> : null}</td>
      <td className="max-w-[16rem] truncate px-2 py-2">{s.relacio}</td>
      <td className="px-2 py-2 text-right tabular-nums">{s.km ?? "—"}</td>
      <td className="px-2 py-2 text-right tabular-nums">{s.jelleg === "ber" && s.fuvardij ? `${Math.round(s.fuvardij).toLocaleString("hu-HU")} ${s.penznem === "HUF" ? "Ft" : s.penznem}` : "—"}</td>
      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{s.ftKm ?? "—"}</td>
      <td className={cn("px-2 py-2", a.papirHianyzik && "font-medium text-[var(--f2-amb)]")}>
        <span className="flex items-center gap-2">
          <span>
            {s.vanPapir ? "megvan" : a.papirHianyzik ? `hiányzik · ${a.kor} napja` : "—"}
            {!s.vanPapir && s.fotoVan && s.jelleg === "ber" ? <span className="ml-1 text-xs font-normal text-muted-foreground">· fotó van</span> : null}
            {a.szamlazvaPapirNelkul ? <span className="ml-1.5 rounded-full bg-[var(--f2-amb-l)] px-1.5 text-[11px]" title="A számla kiment, de az eredeti papír még nincs nálunk — ne vesszen el">számlázva, papír még nincs</span> : null}
          </span>
          {elszamolasJog && s.jelleg === "ber" && (s.vanPapir || a.papirHianyzik) ? <PapirGomb megbizasId={s.id} megvan={s.vanPapir} /> : null}
        </span>
      </td>
      <td className={cn("px-2 py-2", a.szamlazatlan && "font-medium text-[var(--f2-amb)]")}>
        {s.jelleg === "sajat" ? <span className="text-muted-foreground">nem kell</span> : s.szamlaSzam ? <span className="font-mono text-xs">{s.szamlaSzam}</span> : `számlázható · ${a.kor} napja`}
      </td>
      <td className={cn("px-2 py-2 tabular-nums", a.lejart && "font-medium text-[var(--f2-red)]")}>{sz?.hatarido ? datum(sz.hatarido) : "—"}{a.lejart ? ` · lejárt ${a.lejartNap} napja` : ""}</td>
      <td className="px-2 py-2 tabular-nums">{sz?.fizetve ? <span className="text-[var(--f2-mint)]">{datum(sz.fizetveNap)}</span> : s.szamlaSzam && !sz ? <span className="text-xs text-muted-foreground">nincs a Számlázz.hu-ban</span> : "—"}</td>
      <td className="px-4 py-1.5 text-right">
        {a.szamlazatlan ? <SzamlazasiSegedGomb megbizasId={s.id} elszamolasJog={elszamolasJog} />
          : a.papirHianyzik && !s.fotoVan ? <Link href={reszlet} scroll={false} className="rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-muted">Fotó feltöltése</Link>
          : null}
      </td>
    </tr>
  );
}
