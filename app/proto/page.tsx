import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { varosNev } from "@/lib/fuvarozas/varos";
import { ArPirula } from "@/components/proto/ar-pirula";
import { BejovoSor } from "@/components/proto/bejovo-gombok";
import { eur, ft, napCimke, szam } from "@/components/proto/format";
import { MasolGomb } from "@/components/proto/masol-gomb";
import { MiniTerkep } from "@/components/proto/mini-terkep";
import { pihenoErkezesElott, SEBESSEG_HATAR_KMH, TANKOLAS_KUSZOB_L } from "@/lib/ecofleet/plusz";
import { percSzoveg } from "@/lib/ecofleet/szamitas";
import { timocomKeresSzoveg } from "@/lib/fuvarozas2/kereses-javaslat-alap";
import type { MaKocsi } from "@/lib/fuvarozas2/ma-vaszon";
import { getDont, getEletut, getFlotta, getHet, getKocsiPlusz, getMa, getPenz, getSebesseg, getTankolasEgyeztetes, getTerkep } from "@/lib/proto/dashboard";
import { idoszakBol, type IdoszakParam } from "./penz/idoszak";
import "./dashboard.css";

const M = (n: number) => `${(n / 1_000_000).toFixed(2).replace(".", ",")} M`;
const PLUSZ = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${M(Math.abs(n))}`;
const percOra = (p: number) => `${Math.floor(p / 60)} ó ${String(Math.round(p % 60)).padStart(2, "0")} p`;

/** Terv szerinti kocsiszám: a megrendelt kamionok helye is látszik, amíg nincs a törzsben. */
const TERVEZETT_KOCSI = 4;
const SZINEK = ["#0B6E85", "#A3147F", "#475569", "#6A2FC4"];

function Doboz({ cim, children, jobb }: { cim: string; children: ReactNode; jobb?: ReactNode }) {
  return <div className="p"><h2 className="h">{cim}{jobb}</h2>{children}</div>;
}

function Toltes({ cim }: { cim: string }) {
  return <div className="p"><span className="h">{cim}</span><span className="m" role="status">Töltöm…</span></div>;
}

function megrendeltE(k: MaKocsi): boolean {
  return !!k.helykitolto;
}

const IDO = new Intl.DateTimeFormat("hu-HU", { timeZone: "Europe/Budapest", hour: "2-digit", minute: "2-digit" });
const ROVID_NAP = new Intl.DateTimeFormat("hu-HU", { timeZone: "Europe/Budapest", month: "short", day: "numeric" });

async function KocsiTerkep({ kod }: { kod: string | null }) {
  const a = await getTerkep();
  return <MiniTerkep kocsi={a.kocsik.find((x) => x.kod === kod) ?? null} telepek={a.telepek} />;
}

/** Tachó-terv és tank a kocsi kártyáján. */
async function KocsiPluszSorok({ k }: { k: MaKocsi }) {
  const adat = (await getKocsiPlusz()).get(k.kod ?? "");
  if (!adat) return <div className="r m kor"><Suspense fallback={null}><KocsiSebesseg kod={k.kod} /></Suspense></div>;
  const t = adat.terv;
  const szunet = t?.szunetIdopont ? `Szünet ${IDO.format(t.szunetIdopont)}` : t?.szunetigPerc != null ? `Szünetig ${percSzoveg(t.szunetigPerc)} vezetés` : null;
  const piheno = t?.napiPihenoIdopont ? `Napi pihenő ${IDO.format(t.napiPihenoIdopont)}` : null;
  const figyel = pihenoErkezesElott(t, k.etaIdopont ? new Date(k.etaIdopont) : null);
  return (
    <>
      {(szunet || piheno) && <div className="r m kor"><span>{szunet}</span><span>{piheno}</span></div>}
      {figyel && <span className="m" style={{ color: "var(--wa)", fontWeight: 600 }}>Érkezés előtt napi pihenő kell</span>}
      <div className="r m kor">
        {adat.tankLiter != null && <span>Tank: {szam(adat.tankLiter)} l{adat.adatKorPerc != null && adat.adatKorPerc > 120 ? ` · ${Math.round(adat.adatKorPerc / 60)} órája` : ""}</span>}
        <Suspense fallback={null}><KocsiSebesseg kod={k.kod} /></Suspense>
      </div>
    </>
  );
}

async function KocsiSebesseg({ kod }: { kod: string | null }) {
  const s = (await getSebesseg()).get(kod ?? "");
  if (s?.max == null) return null;
  return <span style={s.tullepesDb ? { color: "var(--wa)", fontWeight: 600 } : undefined}>Max {s.max} km/h, 7 nap{s.tullepesDb ? ` · ${s.tullepesDb} út ${SEBESSEG_HATAR_KMH} felett` : ""}</span>;
}

function Kocsikartya({ k, i, nov }: { k: MaKocsi; i: number; nov: ReactNode }) {
  if (megrendeltE(k)) return <Megrendelt nev={k.kod ?? k.cimke} i={i} />;
  const megallok = k.sorok.flatMap((s) => (s.tipus === "megallo" ? [s] : []));
  const most = megallok.find((m) => m.allapot === "most") ?? megallok.find((m) => m.allapot === "kovetkezo") ?? megallok[megallok.length - 1] ?? null;
  const fuvar = k.fuvarAdat?.find((f) => f.id === most?.fuvarId) ?? k.fuvarAdat?.[0] ?? null;
  const kesik = megallok.some((m) => m.kiemelt === "kesik");
  const szin = k.allapot?.szin;
  const piros = kesik || szin === "red";
  const holnap = k.holnap[0] ?? null;
  const tachoForras = k.tachoNapiHatraPerc != null;
  return (
    <article className="p">
      <div className="r">
        <h2 className="tn"><i className="dot" style={{ background: SZINEK[i % 4] }} />{k.kod ?? k.cimke}</h2>
        <span className={`pill ${piros ? "pwa" : szin === "amber" ? "pwa" : "pac"}`}>{k.allapot?.szoveg ?? "Nincs adat"}{k.sebesseg ? ` · ${Math.round(k.sebesseg)} km/h` : ""}</span>
      </div>
      <Suspense fallback={<div className="minit" aria-hidden="true"><div className="minit-v" /></div>}><KocsiTerkep kod={k.kod} /></Suspense>
      <span className="m">{k.sofor ?? "Nincs sofőr"}{k.allapot?.hely ? ` · ${k.allapot.hely}` : ""}</span>
      {fuvar
        ? <div className="r"><span>{fuvar.partner} · {fuvar.utvonal}</span></div>
        : <div className="r"><span>Ma nincs fuvar</span><Link href="/fuvarozas2/timocom" aria-label={`Keress rá: fuvar erre: ${k.kod}`}>Keress rá</Link></div>}
      {most && (
        <div className="r"><b className="n">{most.felLe === "felrako" ? "Fel" : "Le"}: {most.varos}</b><span className="m n" style={most.kiemelt === "kesik" ? { color: "var(--wa)", fontWeight: 600 } : undefined}>{most.elteres ?? most.teny ?? most.terv ?? ""}</span></div>
      )}
      <div className="r m">
        <span className="n">
          {tachoForras ? <>Tachó: ma még {percOra(k.tachoNapiHatraPerc!)}<span className="tacho" aria-hidden="true"><i style={{ width: `${Math.min(100, (k.tachoNapiHatraPerc! / 540) * 100)}%` }} /></span></> : "Tachó: nincs friss adat"}
        </span>
        {k.etaSor && <span>{k.etaSor}</span>}
      </div>
      <Suspense fallback={null}><KocsiPluszSorok k={k} /></Suspense>
      <div className="r m">
        {holnap
          ? <span>{k.holnapFolytatodik ? "Holnap is folytatódik" : `Következő nap: ${holnap.partner ?? "fuvar"}`}</span>
          : <span style={{ color: "var(--wa)", fontWeight: 600 }}>Következő napra nincs fuvar</span>}
        {nov}
      </div>
    </article>
  );
}

function Megrendelt({ nev, i }: { nev: string; i: number }) {
  return (
    <article className="p" style={{ borderStyle: "dashed" }}>
      <div className="r"><h2 className="tn"><i className="dot" style={{ background: SZINEK[i % 4] }} />{nev}</h2><span className="pill pmu">Megrendelve</span></div>
      <span className="m">Új kamion, még nem üzemel</span>
    </article>
  );
}

async function KocsiEredmeny({ kod, kezdet, veg }: { kod: string | null; kezdet: string; veg: string }) {
  const p = await getPenz(kezdet, veg);
  const k = p.kocsik.find((x) => x.kulcs === kod);
  if (!k) return null;
  const e = k.nettoFt - k.alloSoforFt;
  return <span className="n" style={e < 0 ? { color: "var(--ba)" } : undefined}>{PLUSZ(e)}</span>;
}

async function Kocsik({ kezdet, veg }: { kezdet: string; veg: string }) {
  const v = await getMa();
  const hiany = Math.max(0, TERVEZETT_KOCSI - v.kocsik.length);
  return (
    <section className="trucks" aria-label="Kocsik most">
      {v.kocsik.map((k, i) => (
        <Kocsikartya key={k.kod ?? k.cimke} k={k} i={i} nov={<Suspense fallback={null}><KocsiEredmeny kod={k.kod} kezdet={kezdet} veg={veg} /></Suspense>} />
      ))}
      {Array.from({ length: hiany }, (_, j) => <Megrendelt key={j} nev={`${v.kocsik.length + j + 1}. kocsi`} i={v.kocsik.length + j} />)}
      <p className="m jelm">Térkép: a vonal légvonal a megállók közt · nagy pont: a kocsi · zöld pont: telephely</p>
    </section>
  );
}

async function Szamok({ kezdet, veg, cim }: { kezdet: string; veg: string; cim: string }) {
  const p = await getPenz(kezdet, veg);
  const allo = p.kocsik.reduce((s, k) => s + k.alloSoforFt, 0);
  const eredmeny = p.ossz.nettoFt - allo;
  const osszKm = p.ossz.km + p.ossz.uresKm;
  const becs = p.ossz.becslesDb;
  const d = await getDont();
  const lejart = d.kintlevoseg.reduce((s, k) => s + k.lejartFt, 0);
  const lejartEur = d.kintlevoseg.reduce((s, k) => s + k.lejartEur, 0);
  const lejartDb = d.kintlevoseg.reduce((s, k) => s + k.lejartDb, 0);
  const nyitott = d.kintlevoseg.reduce((s, k) => s + k.nyitottFt, 0);
  return (
    <section className="kpi" aria-label={`Számok, ${cim}`}>
      <Doboz cim={`Bevétel · nettó, ${cim}`}><b className="big n">{M(p.ossz.bevetelFt)} Ft</b><span className="m">{p.ossz.eur ? `benne ${eur(p.ossz.eur)}` : "Ft-ban számolva"}{p.ossz.kimaradtDb ? ` · ${p.ossz.kimaradtDb} kimaradt` : ""}</span></Doboz>
      <Doboz cim="Fedezet"><b className="big n">{M(p.ossz.fedezetFt)} Ft</b><span className="m">{p.ossz.bevetelFt ? `${Math.round((p.ossz.fedezetFt / p.ossz.bevetelFt) * 100)}%` : "—"} · {becs} fuvar nem teljesen tény</span></Doboz>
      <Doboz cim="Kocsik eredménye"><b className="big n" style={{ color: eredmeny < 0 ? "var(--ba)" : "var(--ok)" }}>{PLUSZ(eredmeny)} Ft</b><span className="m">rezsi és adó előtt · kocsi fix nincs megadva</span></Doboz>
      <div className="p opt"><h2 className="h">Üres km</h2><b className="big n">{osszKm ? `${((p.ossz.uresKm / osszKm) * 100).toFixed(1).replace(".", ",")}%` : "—"}</b><span className="m n">{szam(p.ossz.uresKm)} / {szam(osszKm)} km · becslés</span></div>
      <div className="p opt"><h2 className="h">Ft/km</h2><b className="big n">{osszKm ? szam(p.ossz.bevetelFt / osszKm) : "—"}</b><span className="m n">önköltség: {osszKm ? szam((p.ossz.bevetelFt - eredmeny) / osszKm) : "—"} Ft/km</span></div>
      <div className="gap" aria-hidden="true" />
      <div className="p" style={{ borderColor: "var(--ba)" }}><h2 className="h">Lejárt · bruttó, mai állapot</h2><b className="big n" style={{ color: "var(--ba)" }}>{M(lejart)} Ft</b><span className="m n">{lejartDb} számla{lejartEur ? ` · + ${eur(lejartEur)}` : ""} · nyitott: {M(nyitott)} Ft</span></div>
    </section>
  );
}

async function Teendok() {
  const [v, d, f, tank] = await Promise.all([getMa(), getDont(), getFlotta(), getTankolasEgyeztetes().catch((e) => { console.warn("[proto] tankolás:", e); return []; })]);
  const tetelek: { kulcs: string; szint: "Most" | "Ma" | "Hét"; szoveg: string; href: string; gomb: string }[] = [];
  for (const e of v.elteresek) tetelek.push({ kulcs: e.kulcs, szint: e.szin === "red" ? "Most" : "Ma", szoveg: e.cim, href: e.href ?? "/fuvarozas2", gomb: "Nyit" });
  if (d.bejovo.length) tetelek.push({ kulcs: "bej", szint: "Ma", szoveg: `${d.bejovo.length} új megbízás vár`, href: "#bejovo", gomb: "Dönts" });
  for (const k of d.javaslat?.kocsik ?? []) if (k.szabad && k.iranyok.length) tetelek.push({ kulcs: `k-${k.kod}`, szint: "Ma", szoveg: `${k.kod}: keress fuvart`, href: "#keress", gomb: "Keress" });
  for (const t of v.teendok) tetelek.push({ kulcs: `t-${t.cimke}`, szint: "Ma", szoveg: `${t.cimke}: ${t.ertek}`, href: t.href, gomb: "Nyit" });
  for (const l of f.lejaro.filter((x) => x.nap <= 30)) tetelek.push({ kulcs: `o-${l.cim}`, szint: l.lejart ? "Most" : "Hét", szoveg: `${l.cim}: ${l.lejart ? `lejárt ${-l.nap} napja` : `${l.nap} nap`}`, href: "/jarmuvek", gomb: "Nyit" });
  if (d.duplak.length) tetelek.push({ kulcs: "dup", szint: "Hét", szoveg: `${d.duplak.length} azonos számlaszámú fuvarpár`, href: "/proto/dontes", gomb: "Nézd" });
  const tankEltero = tank.filter((t) => t.tipus !== "egyezik");
  if (tankEltero.length) tetelek.push({ kulcs: "tank", szint: "Hét", szoveg: `${tankEltero.length} tankolás nem egyezik a kútszámlával`, href: "#tankolas", gomb: "Nézd" });
  const sor = { Most: 0, Ma: 1, "Hét": 2 } as const;
  tetelek.sort((a, b) => sor[a.szint] - sor[b.szint]);
  const OSZTALY = { Most: "pba", Ma: "pwa", "Hét": "pac" } as const;
  return (
    <div className="col teendo">
      <div className="p" style={{ flex: 1, overflow: "auto" }}>
        <h2 className="h">Teendő · {tetelek.length}</h2>
        {tetelek.length === 0 && <span className="m">Most nincs teendő.</span>}
        {tetelek.map((t, i) => (
          <div key={t.kulcs} className={`td ${i >= 3 ? "xmob" : ""}`}><span className={`pill ${OSZTALY[t.szint]}`}>{t.szint}</span><span>{t.szoveg}</span><Link href={t.href} aria-label={`${t.gomb}: ${t.szoveg}`}>{t.gomb}</Link></div>
        ))}
        {tetelek.length > 3 && <Link className="mmore" href="/proto/dontes">Mind a {tetelek.length} teendő</Link>}
      </div>
    </div>
  );
}

const TANK_CIMKE = { elteres: "Eltér a számlától", nincsSzamla: "Nincs kútszámla", nincsSzenzor: "Szenzor nem látta" } as const;

async function Tankolas() {
  const tank = await getTankolasEgyeztetes().catch((e) => { console.warn("[proto] tankolás:", e); return null; });
  if (!tank) return <Doboz cim="Tankolás · 30 nap"><span className="m">Most nem töltött be.</span></Doboz>;
  const egyezik = tank.filter((t) => t.tipus === "egyezik").length;
  const elteres = tank.filter((t) => t.tipus !== "egyezik");
  return (
    <div id="tankolas" className="p">
      <h2 className="h">Tankolás · 30 nap <Link href="/fuvarozas2/koltsegek" aria-label="Költségek: tankolások">Költségek</Link></h2>
      {tank.length === 0 && <span className="m">Nincs {TANKOLAS_KUSZOB_L} liter feletti tankolás a szenzor szerint.</span>}
      {tank.length > 0 && <div className="r"><span>Egyezik a számlával</span><b className="n">{egyezik}</b></div>}
      {elteres.slice(0, 4).map((t) => {
        if (t.tipus === "egyezik") return null;
        return (
          <div key={`${t.kod}-${t.idopont.toISOString()}`} className="r" style={{ borderTop: "1px solid var(--line)", paddingTop: 4 }}>
            <span>{t.kod.split("-")[0]} · {ROVID_NAP.format(t.idopont)}<br /><span className="m">{TANK_CIMKE[t.tipus]}</span></span>
            <span className="n" style={{ textAlign: "right" }}>{t.szenzorL != null ? `szenzor ${szam(t.szenzorL)} l` : ""}{t.szenzorL != null && t.szamlaL != null ? " · " : ""}{t.szamlaL != null ? `számla ${szam(t.szamlaL)} l` : ""}</span>
          </div>
        );
      })}
      {elteres.length > 4 && <span className="m">Még {elteres.length - 4} tétel.</span>}
      <span className="m">A szenzor menet közben ingadozik, ezért csak a {TANKOLAS_KUSZOB_L} liter feletti tankolást nézi. Más kút számlája itt hiányozhat.</span>
    </div>
  );
}

async function Bejovo() {
  const d = await getDont();
  return (
    <div className="col dont" style={{ overflow: "auto" }} id="bejovo">
      <div className="p">
        <h2 className="h">Bejövő · {d.bejovo.length} <Link href="/fuvarozas2/tervezes" aria-label="Összes: bejövő megbízás">Összes</Link></h2>
        {d.bejovo.length === 0 && <span className="m">Nincs döntésre váró megbízás.</span>}
        {d.bejovo.slice(0, 3).map((b, i) => {
          const ut = `${varosNev(b.felrako) || "?"} → ${varosNev(b.lerako) || "?"}`;
          return (
            <div key={b.id} style={{ display: "contents" }}>
              <div className="r" style={i ? { borderTop: "1px solid var(--line)", paddingTop: 4 } : undefined}><b>{ut}</b><ArPirula itelet={b.csekk.itelet} /></div>
              <div className="r m n"><span>{b.partner ?? "Ismeretlen"} · {napCimke(b.felrakasNap)}</span><span>{b.fuvardij != null ? `${szam(b.fuvardij)} ${b.penznem === "EUR" ? "€" : "Ft"}` : "Nincs díj"}{b.csekk.ftKm != null ? ` · ${szam(b.csekk.ftKm)} Ft/km` : ""}</span></div>
              <div className="r m n"><span style={b.kocsiKod ? undefined : { color: "var(--wa)", fontWeight: 600 }}>{b.kocsiKod ?? b.kocsiSzoveg ?? "Nincs felismert rendszám, nézd meg az iratot"}</span><span>{b.magaban?.eredmenyFt != null ? `Eredmény kb. ${ft(b.magaban.eredmenyFt)}` : ""}</span></div>
              <div className="r"><span /><BejovoSor id={b.id} nev={`${b.partner ?? ""} ${ut}`} kiemelt={b.csekk.itelet !== "alacsony"} /></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

async function Het() {
  const [h, d] = await Promise.all([getHet(), getDont()]);
  const keres = (d.javaslat?.kocsik ?? []).find((k) => k.szabad && k.iranyok.length > 0);
  const irany = keres?.iranyok[0];
  const hiany = h ? Math.max(0, TERVEZETT_KOCSI - h.sorok.length) : 0;
  return (
    <div className="p" id="keress">
      <h2 className="h">A hét · esti hely <span className="m" style={{ textTransform: "none", letterSpacing: 0 }}>◆ saját · szaggatott: nincs fuvar</span></h2>
      {!h && <span className="m">A heti terv most nem töltött be.</span>}
      {h && (
        <div className="wk">
          <span />
          {h.napok.map((n) => <span key={n} className="m ctr">{["Hé", "Ke", "Sze", "Csü", "Pé"][h.napok.indexOf(n)]}</span>)}
          <span className="m nap">kint · pé. haza</span>
          {h.sorok.map((s) => (
            <div key={s.kod} style={{ display: "contents" }}>
              <b>{s.kod.split("-")[0]}</b>
              {s.cellak.map((c) => <span key={c.nap} className={`c ${c.hely ? (c.sajat ? "cs" : "cb") : "ce"} ${c.ma ? "cm" : ""}`}>{c.hely ?? "Nincs"}</span>)}
              <span className="m nap n" style={s.kintAlvas > 3 || !s.hazaer ? { color: "var(--wa)" } : undefined}>{s.kintAlvas}{s.kintAlvas > 3 ? " (sok)" : ""} · {s.hazaer ? "igen" : "nem"}</span>
            </div>
          ))}
          {Array.from({ length: hiany }, (_, j) => <div key={j} style={{ display: "contents" }}><b>{h.sorok.length + j + 1}.</b><span className="m" style={{ gridColumn: "2/-1" }}>Megrendelve, még nem üzemel</span></div>)}
        </div>
      )}
      {keres && irany && (
        <>
          <div className="r" style={{ borderTop: "1px solid var(--line)", paddingTop: 4 }}><b>{keres.kod}: mit keress</b><MasolGomb szoveg={timocomKeresSzoveg(keres.szabad!.hely.varos, irany)} cimke="TIMOCOM-keresés" /></div>
          <div className="m n">{keres.szabad!.hely.varos} → {irany.nev}{irany.dijFt != null ? ` · kérj kb. ${ft(irany.dijFt)}` : ""} · {irany.partnerek.length} korábbi partner</div>
        </>
      )}
    </div>
  );
}

async function KocsiTabla({ kezdet, veg, cim }: { kezdet: string; veg: string; cim: string }) {
  const [p, v] = await Promise.all([getPenz(kezdet, veg), getMa()]);
  return (
    <Doboz cim={`Kocsik eredménye · ${cim}`} jobb={<Link href={`/proto/penz?tol=${kezdet}&ig=${veg}&nezet=kocsi`} aria-label="Részletek: kocsik eredménye">Részletek</Link>}>
      <table><thead><tr><th>Kocsi</th><th>Bevétel</th><th className="xt">Fedezet</th><th className="xt">Sofőr</th><th>Eredmény</th><th>Üres</th></tr></thead>
        <tbody>
          {v.kocsik.map((k) => {
            if (megrendeltE(k)) return <tr key={k.kod ?? k.cimke}><td><b>{k.kod ?? k.cimke}</b></td><td colSpan={5} className="m" style={{ textAlign: "right" }}>Megrendelve</td></tr>;
            const s = p.kocsik.find((x) => x.kulcs === k.kod);
            if (!s) return null;
            const e = s.nettoFt - s.alloSoforFt;
            const km = s.km + s.uresKm;
            return (
              <tr key={s.kulcs}>
                <td><b>{s.kulcs}</b>{s.becslesDb ? <> <span className="pill pwa">{s.becslesDb} becs.</span></> : null}</td>
                <td>{M(s.bevetelFt)}</td><td className="xt">{M(s.fedezetFt)}</td><td className="xt">{M(s.soforFt + s.alloSoforFt)}</td>
                <td style={{ color: e < 0 ? "var(--ba)" : "var(--ok)", fontWeight: 600 }}>{PLUSZ(e)}</td>
                <td>{km ? `${((s.uresKm / km) * 100).toFixed(1).replace(".", ",")}%` : "—"}</td>
              </tr>
            );
          })}
        </tbody></table>
      <span className="m">A sofőr az álló napokkal együtt számol · kocsi fix még nincs benne, ezért a valósnál jobb.</span>
    </Doboz>
  );
}

async function Eletut() {
  const [e, d] = await Promise.all([getEletut(), getDont()]);
  const kiemelt = d.kintlevoseg.filter((k) => k.lejartDb > 0).slice(0, 2);
  return (
    <Doboz cim="Életút és pénz">
      <div className="r"><span>Számlára vár</span><b className="n">{e.szamlara}</b></div>
      <div className="r"><span>Hiányzó papír</span><b className="n" style={e.papir ? { color: "var(--wa)" } : undefined}>{e.papir}</b></div>
      <div className="r"><span>Postára vár</span><b className="n">{e.postara}</b></div>
      {kiemelt.map((k, i) => <div key={k.vevo} className="r" style={i === 0 ? { borderTop: "1px solid var(--line)", paddingTop: 4 } : undefined}><span>{k.vevo}</span><b className="n" style={{ color: "var(--ba)" }}>{M(k.lejartFt)}</b></div>)}
      {kiemelt.length > 0 && <span className="m">Lejárt, bruttó{kiemelt[0].fizetesNap != null ? ` · ${kiemelt.map((k) => k.fizetesNap != null ? Math.round(k.fizetesNap) : "—").join(" és ")} nap alatt fizet` : ""}</span>}
    </Doboz>
  );
}

async function Flotta() {
  const f = await getFlotta();
  return (
    <Doboz cim="Flotta" jobb={<Link href="/jarmuvek" aria-label="Járművek: flotta">Járművek</Link>}>
      {f.tetelek.length === 0 && <span className="m">Nincs rögzített lejárat.</span>}
      {f.tetelek.map((t) => <div key={t.cim} className="r"><span>{t.cim}</span>{t.figyel ? <span className="pill pwa">{t.ertek}</span> : <span className="n">{t.ertek}</span>}</div>)}
      {f.l100 != null && <div className="r"><span>l/100 · 7 nap</span><span className="n">{f.l100.toFixed(1).replace(".", ",")}</span></div>}
    </Doboz>
  );
}

export default async function ProtoDashboard({ searchParams }: { searchParams: Promise<IdoszakParam> }) {
  const sp = await searchParams;
  const { kezdet, veg, idoszak } = idoszakBol(sp);
  const cim = kezdet === veg ? napCimke(kezdet) : `${napCimke(kezdet)} – ${napCimke(veg)}`;
  const v = await getMa();
  const szeg = (k: string, c: string) => <Link href={`/proto?idoszak=${k}`} aria-current={idoszak === k ? "true" : undefined} style={{ minHeight: 0, lineHeight: "30px", padding: "0 10px", ...(idoszak === k ? { background: "var(--acc)", color: "var(--on)", fontWeight: 600 } : { color: "var(--mut)" }) }}>{c}</Link>;
  return (
    <div className="dash">
      <header className="top">
        <h1 className="brand">WWP Fuvarozás</h1>
        <span className="m">frissítve {v.frissitve}</span>
        <nav className="seg" aria-label="Időszak">{szeg("ma", "Ma")}{szeg("het", "Hét")}{szeg("ho", "Hónap")}<Link href={`/proto/penz?tol=${kezdet}&ig=${veg}`} style={{ minHeight: 0, lineHeight: "30px", padding: "0 10px", color: "var(--mut)" }}>Egyedi</Link></nav>
        <form action="/proto/kereso" style={{ display: "contents" }}><input className="srch" type="search" name="q" aria-label="Keresés a teljes múltban" placeholder="Partner, rendszám, város, számla…" /></form>
        <a className="btn dk" style={{ lineHeight: "30px" }} href={`/proto/penz/export?tol=${kezdet}&ig=${veg}`}>Excel-export</a>
        <Link className="btn f dk" style={{ lineHeight: "32px" }} href="/fuvarozas2/megbizasok">Új fuvar</Link>
      </header>
      <main>
        <Kocsik kezdet={kezdet} veg={veg} />
        <Suspense fallback={<section className="kpi"><Toltes cim="Számok számolása" /></section>}><Szamok kezdet={kezdet} veg={veg} cim={cim} /></Suspense>
        <section className="mid h3">
          <Suspense fallback={<div className="col teendo"><Toltes cim="Teendő" /></div>}><Teendok /></Suspense>
          <Suspense fallback={<div className="col dont"><Toltes cim="Bejövő" /></div>}><Bejovo /></Suspense>
          <div className="col het"><Suspense fallback={<Toltes cim="A hét" />}><Het /></Suspense></div>
        </section>
        <section className="bot b4">
          <Suspense fallback={<Toltes cim="Kocsik eredménye" />}><KocsiTabla kezdet={kezdet} veg={veg} cim={cim} /></Suspense>
          <Suspense fallback={<Toltes cim="Tankolás" />}><Tankolas /></Suspense>
          <Suspense fallback={<Toltes cim="Életút és pénz" />}><Eletut /></Suspense>
          <Suspense fallback={<Toltes cim="Flotta" />}><Flotta /></Suspense>
        </section>
      </main>
    </div>
  );
}
