import Link from "next/link";
import { BejovoGombok, KocsiraGomb } from "@/components/fuvarozas2/ma-het-gombok";
import { timocomKeresSzoveg } from "@/lib/fuvarozas2/kereses-javaslat-alap";
import { varosNev } from "@/lib/fuvarozas/varos";
import { getDontes } from "@/lib/proto/dontes";
import { ArCsekkUrlap } from "@/components/proto/ar-csekk";
import { ArPirula } from "@/components/proto/ar-pirula";
import { MasolGomb } from "@/components/proto/masol-gomb";
import { eur, ft, napCimke, szam } from "@/components/proto/format";

const IRANY_CIMKE: Record<string, string> = {
  "tobb-penz": "Több pénz",
  gyakori: "Gyakori",
  hazafele: "Hazafelé",
  "ures-haza": "Üresen haza",
  tovabbi: "További",
};

export default async function ProtoDontes() {
  const d = await getDontes();
  const kocsik = d.javaslat?.kocsik ?? [];
  const lejartFt = d.kintlevoseg.reduce((s, k) => s + k.lejartFt, 0);
  const lejartEur = d.kintlevoseg.reduce((s, k) => s + k.lejartEur, 0);
  const dupla = d.duplak.reduce((s, x) => s + x.tobbletFt, 0);
  return (
    <>
      <div>
        <h1 className="text-xl font-semibold">Mit döntsek most?</h1>
        <p className="text-sm text-muted-foreground">{d.bejovo.length} megbízás vár rád · {kocsik.filter((k) => k.szabad).length} kocsira keress fuvart · {ft(lejartFt)}{lejartEur ? ` + ${eur(lejartEur)}` : ""} lejárt. Az árak {szam(d.mintaDb)} saját fuvarodból számolódnak.</p>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="grid min-w-0 gap-4">
          <section className="grid gap-2" aria-label="Bejövő megbízások">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-semibold">1. Vállald el? · {d.bejovo.length}</h2><Link href="/proto/beerkezo" className="text-xs font-medium text-primary underline">Kiolvasott adatok mezőnként</Link></div>
            {d.bejovo.length === 0 && <p className="rounded-xl border bg-card p-3 text-sm text-muted-foreground">Nincs döntésre váró megbízás.</p>}
            {d.bejovo.map((b) => (
              <article key={b.id} className="grid gap-2 rounded-xl border bg-card p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/fuvarozas2/megbizasok/${b.id}`} className="font-semibold hover:underline">{varosNev(b.felrako) || "?"} → {varosNev(b.lerako) || "?"}</Link>
                    <div className="text-xs text-muted-foreground">{b.partner ?? "Ismeretlen partner"} · {napCimke(b.felrakasNap)}{b.hivatkozas ? ` · ${b.hivatkozas}` : ""}</div>
                  </div>
                  <div className="text-right"><div className="font-semibold tabular-nums">{b.fuvardij != null ? `${szam(b.fuvardij)} ${b.penznem === "EUR" ? "€" : "Ft"}` : "Nincs díj"}</div><ArPirula itelet={b.csekk.itelet} /></div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {b.csekk.ftKm != null && b.csekk.alapFtKm != null ? `${szam(b.csekk.ftKm)} Ft/km, ${b.csekk.alap}: ${szam(b.csekk.alapFtKm)} Ft/km. ` : ""}
                  {b.csekk.viszonylat.utolso ? `Szokásos díj ezen az úton ${ft(b.csekk.viszonylat.medianDij)} (${b.csekk.viszonylat.db} fuvar). ` : "Ezen az úton még nem volt fuvarod. "}
                  {b.magaban?.eredmenyFt != null ? `Számolt eredmény: ${ft(b.magaban.eredmenyFt)}. ` : ""}
                  {b.kocsiKod ? `Kocsi a megbízásból: ${b.kocsiKod}.` : "Nincs felismert rendszám a megbízásban."}
                </p>
                <div className="flex flex-wrap gap-2"><BejovoGombok id={b.id} allapot={b.allapot} kocsiKod={b.kocsiKod} cimke={b.kocsiKod ?? ""} /></div>
              </article>
            ))}
          </section>

          <section className="grid gap-2" aria-label="Mit keressek">
            <h2 className="font-semibold">2. Mit keress a kocsikra?</h2>
            {!d.javaslat && <p className="rounded-xl border bg-card p-3 text-sm text-amber-800">A javaslatok most nem töltöttek be. Frissíts rá.</p>}
            {kocsik.map((k) => (
              <article key={k.kod} className="grid gap-2 rounded-xl border bg-card p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold">{k.kod} · {k.sofor}</span>
                  {k.szabad
                    ? <span className="text-sm">Kiürül: <b>{k.szabad.hely.varos}</b>, {napCimke(k.szabad.nap)}{k.szabad.ido ? ` ${k.szabad.ido}` : ""}{k.szabad.becsult ? " (becslés)" : ""}</span>
                    : <span className="text-sm text-muted-foreground">{k.tavolletben ? "Távollét" : k.nincsAdat ? "Nincs adat" : "Foglalt"}</span>}
                </div>
                {k.hazaNap && <div className="text-xs text-muted-foreground">Szakolyra haza: {napCimke(k.hazaNap)}{k.csakHaza ? ", csak hazafelé keress" : ""}</div>}
                {k.iranyok.slice(0, 3).map((i) => (
                  <div key={i.kulcs} className="grid gap-1 rounded-lg bg-muted/40 p-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{i.nev} <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{IRANY_CIMKE[i.cimke] ?? i.cimke}</span></span>
                      {k.szabad && <MasolGomb szoveg={timocomKeresSzoveg(k.szabad.hely.varos, i)} cimke="TIMOCOM-keresés másolása" />}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {i.dijFt != null ? `Kérj kb. ${ft(i.dijFt)}${i.ftKm != null ? `, ${szam(i.ftKm)} Ft/km` : ""}. ` : ""}Üresen {szam(i.raallasKm)} km, rakottan {szam(i.rakottKm)} km{i.ejszakaKint ? `, ${i.ejszakaKint} éjszaka kint` : ""}{i.hazaer ? ", hazaér" : ""}. {i.timocomDb > 0 ? `${i.timocomDb} nyitott ajánlat. ` : ""}
                    </div>
                    {i.partnerek.length > 0 && <div className="text-xs">Hívd: {i.partnerek.slice(0, 3).map((p) => `${p.partner} (${p.db} fuvar${p.utolsoDijFt != null ? `, utoljára ${ft(p.utolsoDijFt)}` : ""})`).join(" · ")}</div>}
                  </div>
                ))}
              </article>
            ))}
          </section>

          {d.elvinni.length > 0 && (
            <section className="grid gap-2" aria-label="Saját áru">
              <h2 className="font-semibold">3. Saját áru, ami útba eshet · {d.elvinni.length}</h2>
              {d.elvinni.map((e) => (
                <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3 text-sm">
                  <span className="min-w-0"><Link className="font-medium hover:underline" href={`/fuvarozas2/megbizasok/${e.id}`}>{e.utvonal}</Link><span className={`block text-xs ${e.surgosseg === "piros" ? "font-medium text-red-700" : e.surgosseg === "sarga" ? "text-amber-800" : "text-muted-foreground"}`}>Legkésőbb: {napCimke(e.legkesobb)}{e.hely?.utbaEso ? ", útba esik" : ""}</span></span>
                  {e.hely && <KocsiraGomb id={e.id} jarmuKod={e.hely.kocsi} nap={e.hely.nap} cimke={`${e.hely.kocsi}`} />}
                </div>
              ))}
            </section>
          )}
        </div>

        <aside className="grid min-w-0 gap-4">
          <ArCsekkUrlap />

          <section className="grid gap-2 rounded-xl border bg-card p-3" aria-label="Kintlévőség">
            <h2 className="font-semibold">Kit hívj pénzért?</h2>
            {d.kintlevoseg.length === 0 && <p className="text-sm text-muted-foreground">Nincs nyitott fuvarszámla.</p>}
            {d.kintlevoseg.slice(0, 8).map((k) => (
              <div key={k.vevo} className="flex items-start justify-between gap-2 border-t pt-2 text-sm first:border-t-0 first:pt-0">
                <span className="min-w-0"><span className="block font-medium">{k.vevo}</span><span className="block text-xs text-muted-foreground">{k.fizetesNap != null ? `Általában ${Math.round(k.fizetesNap)} nap alatt fizet` : "Nincs fizetési előzmény"}{k.legregebbiLejart ? ` · lejárt ${napCimke(k.legregebbiLejart)} óta` : ""}</span></span>
                <span className="shrink-0 text-right tabular-nums"><span className={`block font-semibold ${k.lejartDb ? "text-red-700" : ""}`}>{k.lejartDb ? `${szam(k.lejartFt)} Ft${k.lejartEur ? ` + ${szam(k.lejartEur)} €` : ""}` : "Nem lejárt"}</span><span className="block text-xs text-muted-foreground">Nyitott: {szam(k.nyitottFt)} Ft{k.nyitottEur ? ` + ${szam(k.nyitottEur)} €` : ""}</span></span>
              </div>
            ))}
            <Link href="/szamlak" className="text-xs font-medium text-primary underline">Számlák megnyitása</Link>
          </section>

          {d.duplak.length > 0 && (
            <section className="grid gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950" aria-label="Duplikátumok">
              <h2 className="font-semibold">Lehet, hogy kétszer számol: {d.duplak.length} pár</h2>
              <p className="text-xs">Azonos számlaszám két élő fuvaron, kb. {ft(dupla)} többlet a mostani kimutatásokban. Az ártárban ezek csak egyszer számítanak. Te döntöd el, melyik a valódi.</p>
              {d.duplak.slice(0, 8).map((x) => (
                <div key={x.szamla} className="text-xs">
                  <b>{x.szamla}</b>: {x.fuvarok.map((f, i) => <span key={f.id}>{i > 0 ? ", " : " "}<Link className="underline" href={`/fuvarozas2/megbizasok/${f.id}`}>#{f.id}</Link></span>)} · {x.fuvarok[0].partner}
                </div>
              ))}
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
