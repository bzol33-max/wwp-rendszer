"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPartnerMegbizasok, importSzamlazzPartnerek, kitoltHianyzoPartnerAdatokat, osszevonPartnereket, torolHivatkozatlanPartnert, updatePartner, type Partner, type PartnerAdatJavaslat, type PartnerMegbizas } from "@/lib/fuvarozas2/partnerek";
import type { ImportTerv } from "@/lib/fuvarozas2/partner-szamlazz-alap";
import { AdatJavaslatSor } from "@/components/fuvarozas2/partner-adat-javaslat";
import { cimSzep } from "@/lib/fuvarozas2/cim-formazas";

type Javaslat = { a: Partner; b: Partner; indok: string };
type Kor = "ber" | "sajat" | "mind";

/**
 * A partner hiányzó adatai — ami a számlázáshoz és a papír elküldéséhez KELL
 * (postacím, e-mail, fizetési határidő). Az adószám a tulajdonosnak nem fontos
 * (2026-10-19), a számlán úgyis a Számlázz.hu vevő-adata áll. A papír-beküldési határidőt
 * csak az a megbízó adja meg, aki kiköti; ha nincs, az nem hiány (2026-10-19).
 * Saját fuvar partnerénél semmi nem számít hiánynak. Postacím helyett a
 * székhely is jó (2026-11-18): ha a megbízáson nincs postacím, oda megy a papír.
 */
function hianyok(p: Partner): string[] {
  if (!p.berfuvar) return [];
  const h: string[] = [];
  if (!p.postazasi_cim && !p.szekhely && !p.posta_nem_kell) h.push("postacím");
  if (!p.szamlazasi_email && !p.szamla_email_nem_kell) h.push("e-mail");
  if (p.fizetesi_hatarido_nap == null) h.push("fizetési határidő");
  return h;
}

function KorGomb({ aktiv, onClick, cimke, db }: { aktiv: boolean; onClick: () => void; cimke: string; db: number }) {
  return <Button size="xs" variant={aktiv ? "default" : "outline"} onClick={onClick}>{cimke} <span className="opacity-70">{db}</span></Button>;
}

/** 1 234 567 Ft → „1,2 M Ft”, 850 000 → „850 e Ft”, euró egészre. */
function penzRovid(f: { penznem: string; osszeg: number }): string {
  const eur = /^(eur|€)$/i.test(f.penznem);
  if (eur) return `${Math.round(f.osszeg).toLocaleString("hu-HU")} €`;
  if (f.osszeg >= 1_000_000) return `${(f.osszeg / 1_000_000).toLocaleString("hu-HU", { maximumFractionDigits: 1 })} M Ft`;
  if (f.osszeg >= 10_000) return `${Math.round(f.osszeg / 1000).toLocaleString("hu-HU")} e Ft`;
  return `${Math.round(f.osszeg).toLocaleString("hu-HU")} ${f.penznem}`;
}

/** Átlag km-díj: „542 Ft/km”, euróban két tizedesig („1,85 €/km”). */
function kmDijSzoveg(k: { penznem: string; perKm: number }): string {
  if (/^(eur|€)$/i.test(k.penznem)) return `${k.perKm.toLocaleString("hu-HU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/km`;
  return `${Math.round(k.perKm).toLocaleString("hu-HU")} Ft/km`;
}

const penzEgesz = (n: number, penznem: string) => `${Math.round(n).toLocaleString("hu-HU")} ${/^(eur|€)$/i.test(penznem) ? "€" : penznem}`;
/** 2026-10-13 → „10.13.” */
const datumRovid = (d: string | null) => (d ? `${d.slice(5).replace("-", ".")}.` : "—");
const ekezetNelkul = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** ABC-csoport kezdőbetű: ékezet nélkül, nagybetűvel; számmal kezdődő név „#”. */
const kezdobetu = (nev: string) => { const c = ekezetNelkul(nev.trim()).charAt(0).toUpperCase(); return /[A-Z]/.test(c) ? c : "#"; };
const telHref = (t: string) => `tel:${t.replace(/[^\d+]/g, "")}`;
/** Város a megálló címéből: az irányítószám utáni szó(k) („…, 4002 Debrecen” → „Debrecen”), különben az első vesszőig. */
const varos = (cim: string | null) => {
  if (!cim) return null;
  const irsz = cim.match(/\b\d{4,5}\s+([^,;]+)/);
  return (irsz ? irsz[1] : cim.split(/[,;]/)[0]).trim().replace(/^(HU|H|D|A|SK|RO)-\s*/i, "") || null;
};

export function PartnerekNezet({ partnerek, javaslatok, adatJavaslatok = [], szerkeszthet, nyit }: {
  partnerek: Partner[]; javaslatok: Javaslat[];
  /** A partnerek hiányzó adataira a megbízás-PDF-ekből és a számlákból (lib/fuvarozas2/partner-javaslat.ts). */
  adatJavaslatok?: PartnerAdatJavaslat[];
  szerkeszthet: boolean; nyit?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // A munkaasztal részletéből „?nyit=<id>” paraméterrel jövünk: az a partner van kiválasztva.
  const [nyitott, setNyitott] = useState<string | null>(nyit ?? null);
  const [kijelolt, setKijelolt] = useState<Set<string>>(new Set());
  const [confirm, confirmDialog] = useConfirm();
  const [kor, setKor] = useState<Kor>("ber");
  const [csakHianyos, setCsakHianyos] = useState(false);
  const [kereses, setKereses] = useState("");

  function kitolt() {
    start(async () => {
      try {
        const r = await kitoltHianyzoPartnerAdatokat();
        if (r.mezo === 0) toast.info("Nincs több biztos forrásból kitölthető adat — a maradékot kézzel kell megadni.");
        else toast.success(`Kitöltve: ${r.mezo} adat, ${r.partner} partnernél`);
        router.refresh();
      } catch {
        toast.error("A kitöltés nem sikerült.");
      }
    });
  }

  async function osszevon(celId: string, forrasIds: string[]) {
    if (!(await confirm("Összevonod? A beolvasztott partner megbízásai a megtartott partnerre kerülnek, a neve névváltozat lesz. Nem visszavonható."))) return;
    start(async () => {
      const r = await osszevonPartnereket(celId, forrasIds);
      toast.success(`Összevonva — ${r.megbizasok} megbízás átírva`);
      setKijelolt(new Set());
      router.refresh();
    });
  }

  const javasoltPartnerek = [...new Set(adatJavaslatok.map((j) => j.partner_id))];
  const berPartnerek = partnerek.filter((p) => p.berfuvar);
  // Saját fuvar: csak a vevőink (saját fuvar + szállítólevél + raklap-számla) — a bérfuvarok rakodóhelyei nem.
  const sajatVevok = partnerek.filter((p) => p.sajatVevo || p.sajatBeszallito);
  const hianyosBer = berPartnerek.filter((p) => hianyok(p).length > 0);
  const q = ekezetNelkul(kereses.trim());
  // Kereső mindenre: név, névváltozat, adószám, székhely, e-mailek, kapcsolattartók (név, telefon, e-mail).
  const lathato = partnerek
    .filter((p) => (kor === "ber" ? p.berfuvar : kor === "sajat" ? p.sajatVevo || p.sajatBeszallito : true))
    .filter((p) => !csakHianyos || hianyok(p).length > 0)
    .filter((p) => !q || ekezetNelkul([p.nev, ...p.nevvaltozatok, p.adoszam ?? "", p.szekhely ?? "", p.szamlazasi_email ?? "", p.postazasi_cim ?? "", ...p.kapcsolatok.flatMap((k) => [k.nev ?? "", k.email ?? "", k.telefon ?? "", (k.telefon ?? "").replace(/\D/g, "")])].join(" ")).includes(q.replace(/\s+/g, " ")))
    .sort((a, b) => a.nev.localeCompare(b.nev, "hu"));
  // Kiválasztott partner: a kért, különben a lista első eleme (a szűrés ne hagyjon üres panelt).
  const valasztott = partnerek.find((p) => p.id === nyitott) ?? [...lathato].sort((a, b) => b.megbizas_db - a.megbizas_db)[0] ?? null;

  return (
    <div className="flex flex-col gap-4">
      {confirmDialog}
      <div className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 ring-1 ring-foreground/10">
        <KorGomb aktiv={kor === "ber"} onClick={() => setKor("ber")} cimke="Bérfuvar megbízók" db={berPartnerek.length} />
        <KorGomb aktiv={kor === "sajat"} onClick={() => setKor("sajat")} cimke="Saját fuvar" db={sajatVevok.length} />
        <KorGomb aktiv={kor === "mind"} onClick={() => setKor("mind")} cimke="Mind" db={partnerek.length} />
        <label className="ml-1 flex items-center gap-1.5 text-sm"><input type="checkbox" checked={csakHianyos} onChange={(e) => setCsakHianyos(e.target.checked)} />csak hiányos</label>
        <Input value={kereses} onChange={(e) => setKereses(e.target.value)} placeholder="Keresés: partner, kapcsolattartó, telefon, e-mail, város" className="h-8 w-full text-sm sm:w-80" />
        <span className="ml-auto text-sm text-muted-foreground">
          {hianyosBer.length === 0 ? "Minden megbízó adata teljes" : <>Hiányos megbízó: <b className="text-[var(--f2-amb)]">{hianyosBer.length}</b> / {berPartnerek.length} <span className="text-xs">· a megbízásokból óránként magától pótlódik</span></>}
        </span>
        {szerkeszthet ? <Button size="xs" variant="outline" disabled={pending} onClick={kitolt} title="Magától is lefut óránként, az új megbízások beérkezése után — ez csak azonnal elindítja.">Frissítés most</Button> : null}
      </div>

      {kor === "sajat" ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-muted/40 px-3 py-2 text-sm">
          <span>Vevő: akinek saját árut (raklap, gitterbox) viszünk — saját fuvar + a nevére szóló raklap-számla. Beszállító: akitől a telephelyünkre hozunk. A bérfuvarok rakodóhelyei a „Mind” alatt vannak.</span>
          <a href="/fuvarozas2/kimutatas?idoszak=ho&jelleg=sajat" className="font-medium hover:underline">Saját utak: mikor, hová, mennyi lett volna a díja →</a>
        </div>
      ) : null}

      {szerkeszthet ? <SzamlazzBetoltes /> : null}

      {javasoltPartnerek.length > 0 ? (
        <details className="rounded-xl ring-1 ring-foreground/10">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
            Eldöntendő javaslatok — {adatJavaslatok.length} db, {javasoltPartnerek.length} partner <span className="font-normal text-muted-foreground">(ahol a források ellentmondanak, vagy már van adat)</span>
          </summary>
          <div className="flex flex-col gap-3 px-3 pb-3 text-sm">
            {javasoltPartnerek.map((pid) => (
              <div key={pid} className="flex flex-col gap-1">
                <a href={`#p-${pid}`} onClick={() => setNyitott(pid)} className="font-semibold hover:underline">
                  {partnerek.find((p) => p.id === pid)?.nev ?? `#${pid}`}
                </a>
                {adatJavaslatok.filter((j) => j.partner_id === pid).map((j) => <AdatJavaslatSor key={j.id} j={j} szerkeszthet={szerkeszthet} />)}
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {javaslatok.length > 0 && szerkeszthet ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Összevonási javaslatok — E5 (névváltozatok)</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {javaslatok.map((j) => (
              <div key={`${j.a.id}-${j.b.id}`} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 px-3 py-2">
                <span className="font-medium">{j.a.nev}</span><span className="text-muted-foreground">({j.a.megbizas_db})</span>
                <span className="text-muted-foreground">↔</span>
                <span className="font-medium">{j.b.nev}</span><span className="text-muted-foreground">({j.b.megbizas_db})</span>
                <span className="text-xs text-muted-foreground">· {j.indok}</span>
                <span className="ml-auto flex gap-1">
                  <Button size="xs" variant="outline" disabled={pending} onClick={() => osszevon(j.a.id, [j.b.id])}>„{j.a.nev}” marad</Button>
                  <Button size="xs" variant="outline" disabled={pending} onClick={() => osszevon(j.b.id, [j.a.id])}>„{j.b.nev}” marad</Button>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {kijelolt.size >= 2 && szerkeszthet ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm">
          {kijelolt.size} kijelölve — melyik maradjon?
          {[...kijelolt].map((id) => {
            const p = partnerek.find((x) => x.id === id);
            return p ? <Button key={id} size="xs" disabled={pending} onClick={() => osszevon(id, [...kijelolt])}>„{p.nev}” marad</Button> : null;
          })}
          <Button size="xs" variant="ghost" onClick={() => setKijelolt(new Set())}>Mégse</Button>
        </div>
      ) : null}

      {/* V2d (2026-11-17): keskeny ABC-lista + a kiválasztott partner lapja KPI-csempékkel és megbízás-táblával. */}
      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <PartnerLista partnerek={lathato} valasztott={valasztott?.id ?? null} onValaszt={setNyitott}
          szerkeszthet={szerkeszthet} kijelolt={kijelolt}
          onKijelol={(id, v) => setKijelolt((s) => { const n = new Set(s); if (v) n.add(id); else n.delete(id); return n; })} />
        {valasztott ? <PartnerLap key={valasztott.id} p={valasztott} szerkeszthet={szerkeszthet} /> : (
          <div className="rounded-xl bg-card px-3 py-10 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">Nincs a szűrésnek megfelelő partner.</div>
        )}
      </div>
    </div>
  );
}

/** Bal oszlop: ABC-csoportokba szedett névlista, munkaszámmal; a kijelölés az összevonáshoz. */
function PartnerLista({ partnerek, valasztott, onValaszt, szerkeszthet, kijelolt, onKijelol }: {
  partnerek: Partner[]; valasztott: string | null; onValaszt: (id: string) => void;
  szerkeszthet: boolean; kijelolt: Set<string>; onKijelol: (id: string, v: boolean) => void;
}) {
  if (partnerek.length === 0) return <div className="rounded-xl px-3 py-6 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">Nincs találat.</div>;
  return (
    <div className="max-h-[70vh] overflow-y-auto rounded-xl bg-card shadow-[var(--shadow-card)] lg:max-h-[calc(100vh-14rem)]">
      {partnerek.map((p, i) => {
        const b = kezdobetu(p.nev);
        const fej = i === 0 || kezdobetu(partnerek[i - 1].nev) !== b;
        const hiany = hianyok(p).length > 0;
        return (
          <div key={p.id}>
            {fej ? <div className="sticky top-0 bg-card/95 px-3 pb-0.5 pt-2 text-[11px] font-semibold text-muted-foreground backdrop-blur">{b}</div> : null}
            <div id={`p-${p.id}`} className={`flex scroll-mt-20 items-center gap-2 px-2 ${valasztott === p.id ? "bg-primary/10" : "hover:bg-muted/40"}`}>
              {szerkeszthet ? <input type="checkbox" checked={kijelolt.has(p.id)} onChange={(e) => onKijelol(p.id, e.target.checked)} aria-label="kijelölés összevonáshoz" /> : null}
              <button type="button" onClick={() => onValaszt(p.id)} className={`flex min-w-0 flex-1 items-center justify-between gap-2 py-1.5 text-left text-sm ${valasztott === p.id ? "font-medium" : ""}`}>
                <span className="truncate">{p.nev}{hiany ? <span className="ml-1 text-[var(--f2-amb)]" title={`hiányzik: ${hianyok(p).join(", ")}`}>•</span> : null}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{p.megbizas_db}</span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Csempe({ cimke, ertek, alatta, figyelem }: { cimke: string; ertek: ReactNode; alatta?: ReactNode; figyelem?: boolean }) {
  return (
    <div className="rounded-xl bg-muted/60 px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{cimke}</div>
      <div className={`mt-0.5 text-xl font-semibold tabular-nums ${figyelem ? "text-[var(--f2-amb)]" : ""}`}>{ertek}</div>
      {alatta ? <div className="text-xs text-muted-foreground">{alatta}</div> : null}
    </div>
  );
}

/** Jobb oldal: a kiválasztott partner lapja — fejléc, kapcsolattartók, KPI-csempék, megbízások, adatok szerkesztése. */
function PartnerLap({ p, szerkeszthet }: { p: Partner; szerkeszthet: boolean }) {
  const [megbizasok, setMegbizasok] = useState<PartnerMegbizas[] | null>(null);
  const [hiba, setHiba] = useState(false);
  const [csakNyitott, setCsakNyitott] = useState(false);
  const [mind, setMind] = useState(false);
  useEffect(() => {
    let el = false;
    getPartnerMegbizasok(p.id).then((m) => { if (!el) setMegbizasok(m); }).catch(() => { if (!el) setHiba(true); });
    return () => { el = true; };
  }, [p.id]);
  const hiany = hianyok(p);
  // A teljes képhez (nem a számlázáshoz) hiányzó adatok — szürkén, a kiolvasás pótolja.
  const tovabbiHiany = p.berfuvar
    ? [!p.szekhely ? "székhely" : null, !p.adoszam ? "adószám" : null, !p.kapcsolatok.some((k) => k.telefon || k.email) ? "kapcsolattartó" : null].filter((x): x is string => !!x)
    : [];
  const emailek = (p.szamlazasi_email ?? "").split(/[,;]\s*/).map((e) => e.trim()).filter(Boolean);
  const nyitott = p.nyitottSzamla.reduce((n, s) => n + s.db, 0);
  const lejart = p.nyitottSzamla.reduce((n, s) => n + s.lejart, 0);
  // Tipikus viszonylatok: a leggyakoribb felrakó → lerakó párok a megbízásokból.
  const viszonylatok = useMemo(() => {
    const db = new Map<string, number>();
    for (const m of megbizasok ?? []) {
      const k = `${varos(m.felrako) ?? "?"} → ${varos(m.lerako) ?? "?"}`;
      if (m.felrako && m.lerako) db.set(k, (db.get(k) ?? 0) + 1);
    }
    return [...db.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [megbizasok]);
  // A mai nap egyszer, a megnyitáskor (a render maradjon tiszta).
  const [ma] = useState(() => new Date().toISOString().slice(0, 10));
  const napOta = p.utolso_megbizas ? Math.floor((new Date(ma).getTime() - new Date(p.utolso_megbizas).getTime()) / 86_400_000) : null;
  const lista = (megbizasok ?? []).filter((m) => !csakNyitott || (m.szamla_szam && m.fizetve === false));
  const mutatott = mind ? lista : lista.slice(0, 8);

  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            {p.nev}
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{p.berfuvar ? "megbízó" : p.sajatVevo ? "saját fuvar vevője" : p.sajatBeszallito ? "saját fuvar beszállítója" : "rakodóhely / egyéb"}</span>
            {hiany.length > 0 ? <span className="text-xs font-normal text-[var(--f2-amb)]">hiányzik: {hiany.join(", ")}</span> : null}
            {tovabbiHiany.length > 0 ? <span className="text-xs font-normal text-muted-foreground" title="A megbízás-iratokból és a számlákból óránként magától pótlódik">még nincs: {tovabbiHiany.join(", ")}</span> : null}
          </h2>
          <div className="mt-0.5 text-sm text-muted-foreground">
            {[p.szekhely ? cimSzep(p.szekhely) : null, p.nevvaltozatok.length ? `névváltozat: ${p.nevvaltozatok.join(", ")}` : null].filter(Boolean).join(" · ") || "székhely nincs megadva"}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 text-sm">
          <a href={`/fuvarozas2/megbizasok?${new URLSearchParams({ q: p.nev })}`} className="rounded-lg px-2.5 py-1 ring-1 ring-foreground/10 hover:bg-muted/40">Munkaasztalon keresés →</a>
          {szerkeszthet && p.hivatkozas_db === 0 ? <TorlesGomb p={p} /> : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        {p.kapcsolatok.length === 0 ? <span className="text-muted-foreground">Még nincs kapcsolattartó — a megbízást küldő levelekből és a Kapcsolatok törzsből gyűlik.</span> : null}
        {p.kapcsolatok.slice(0, 4).map((k, i) => (
          <div key={i} className="flex flex-wrap items-center gap-x-2 rounded-lg bg-muted/60 px-2.5 py-1.5">
            <span className="font-medium">{k.nev ?? k.email}</span>
            {k.telefon ? <a href={telHref(k.telefon)} className="hover:underline">{k.telefon}</a> : null}
            {k.email && k.nev ? <a href={`mailto:${k.email}`} className="text-muted-foreground hover:underline">{k.email}</a> : null}
            {k.levelDb ? <span className="text-xs text-muted-foreground">{k.levelDb} levél</span> : null}
          </div>
        ))}
        {p.kapcsolatok.length > 4 ? <span className="self-center text-xs text-muted-foreground">+{p.kapcsolatok.length - 4} további</span> : null}
        {emailek.length > 0 ? <div className="flex items-center gap-x-2 rounded-lg px-2.5 py-1.5 ring-1 ring-foreground/10"><span className="text-xs text-muted-foreground">számla:</span><a href={`mailto:${emailek[0]}`} className="hover:underline">{emailek[0]}</a>{emailek.length > 1 ? <span className="text-xs text-muted-foreground">+{emailek.length - 1}</span> : null}</div> : null}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        <Csempe cimke="Munkák" ertek={p.megbizas_db} alatta={p.utolso_megbizas ? `utolsó ${datumRovid(p.utolso_megbizas)}${napOta != null && napOta > 60 ? ` · ${napOta} nap óta nincs` : ""}` : "még nincs"} figyelem={napOta != null && napOta > 60} />
        {p.berfuvar || p.raklapSzamla.length === 0 ? (
          <Csempe cimke="Forgalom" ertek={p.forgalom.length ? p.forgalom.map(penzRovid).join(" + ") : "—"} alatta={p.forgalom.length && p.megbizas_db ? `átl. ${penzRovid({ penznem: p.forgalom[0].penznem, osszeg: p.forgalom[0].osszeg / p.megbizas_db })} / munka` : "bérfuvar díja"} />
        ) : (
          <Csempe cimke="Raklap-számlák" ertek={p.raklapSzamla.map(penzRovid).join(" + ")} alatta={`${p.raklapSzamla.reduce((n, r) => n + r.db, 0)} számla · ${p.szallitolevel_db} szállítólevél`} />
        )}
        <Csempe cimke="Átlag km-díj" ertek={p.kmDij.length ? p.kmDij.map(kmDijSzoveg).join(" · ") : "—"} alatta={p.kmDij.length ? `${p.kmDij.reduce((n, k) => n + k.munka, 0)} munkából · HU-GO rakott km` : "nincs km-adat"} />
        <Csempe cimke="Fizetési nap" ertek={p.fizetesNap ? p.fizetesNap.atlag : p.fizetesi_hatarido_nap === 0 ? "kp" : "—"}
          alatta={p.fizetesNap ? `tényleges, ${p.fizetesNap.minta} számlából · szerződés ${p.fizetesi_hatarido_nap ?? "?"}` : p.fizetesi_hatarido_nap != null ? `szerződés ${p.fizetesi_hatarido_nap} nap · még nincs fizetett számla` : p.berfuvar ? "határidő hiányzik" : ""}
          figyelem={!!p.fizetesNap && p.fizetesi_hatarido_nap != null && p.fizetesNap.atlag > p.fizetesi_hatarido_nap + 5} />
        <Csempe cimke="Nyitott számla" ertek={nyitott} alatta={nyitott ? `${p.nyitottSzamla.map((s) => penzEgesz(s.osszeg, s.penznem)).join(" + ")}${lejart ? ` · ${lejart} lejárt` : " · nincs lejárt"}` : "mind fizetve"} figyelem={lejart > 0} />
      </div>

      {viszonylatok.length > 0 || p.rakodasFelrako || p.rakodasLerako ? (
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          {viszonylatok.length > 0 ? <div className="rounded-xl bg-muted/60 px-3 py-2"><div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tipikus viszonylat</div>{viszonylatok.map(([v, n]) => `${v} (${n}×)`).join(" · ")}</div> : null}
          {p.rakodasFelrako || p.rakodasLerako ? (
            <div className="rounded-xl bg-muted/60 px-3 py-2"><div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tanult rakodási idő</div>
              felrakó {p.rakodasFelrako ? <b>{p.rakodasFelrako.perc} p</b> : "—"} · lerakó {p.rakodasLerako ? <b>{p.rakodasLerako.perc} p</b> : "—"} <span className="text-xs text-muted-foreground">(GPS-mediánok)</span></div>
          ) : null}
        </div>
      ) : null}

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Megbízások {megbizasok ? <span className="font-normal text-muted-foreground">{lista.length}</span> : null}</h3>
          <div className="flex gap-1.5">
            <Button size="xs" variant={csakNyitott ? "default" : "outline"} onClick={() => setCsakNyitott((v) => !v)}>Nyitott számla</Button>
          </div>
        </div>
        {hiba ? <p className="mt-2 text-sm text-muted-foreground">A megbízások most nem tölthetők be.</p> : megbizasok == null ? <p className="mt-2 text-sm text-muted-foreground">Betöltés…</p> : lista.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Nincs ilyen megbízás.</p> : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] text-muted-foreground">
                <tr><th className="py-1 pr-2 font-medium">#</th><th className="py-1 pr-2 font-medium">Dátum</th><th className="py-1 pr-2 font-medium">Viszonylat</th><th className="py-1 pr-2 text-right font-medium">km</th><th className="py-1 pr-2 text-right font-medium">Díj</th><th className="py-1 pr-2 text-right font-medium" title="fuvardíj ÷ HU-GO rakott km">/km</th><th className="py-1 pr-2 font-medium">Számla</th><th className="py-1 font-medium" /></tr>
              </thead>
              <tbody>
                {mutatott.map((m) => {
                  const perKm = m.fuvardij && m.rakott_km ? m.fuvardij / m.rakott_km : null;
                  return (
                    <tr key={m.id} className="border-t border-foreground/5">
                      <td className="whitespace-nowrap py-1.5 pr-2"><a href={`/fuvarozas2/megbizasok/${m.id}`} className="font-medium hover:underline">#{m.id}</a>{m.jelleg === "sajat" ? <span className="ml-1 text-[10px] text-muted-foreground">saját</span> : null}</td>
                      <td className="whitespace-nowrap py-1.5 pr-2 tabular-nums">{m.datum ?? "—"}</td>
                      <td className="max-w-[18rem] truncate py-1.5 pr-2" title={`${m.felrako ?? ""} → ${m.lerako ?? ""}`}>{varos(m.felrako) ?? "?"} → {varos(m.lerako) ?? "?"}</td>
                      <td className="whitespace-nowrap py-1.5 pr-2 text-right tabular-nums">{m.rakott_km ? Math.round(m.rakott_km) : <span className="text-muted-foreground">—</span>}</td>
                      <td className="whitespace-nowrap py-1.5 pr-2 text-right tabular-nums">{m.fuvardij ? penzEgesz(m.fuvardij, m.penznem) : <span className="text-muted-foreground">—</span>}</td>
                      <td className="whitespace-nowrap py-1.5 pr-2 text-right tabular-nums text-muted-foreground">{perKm ? kmDijSzoveg({ penznem: m.penznem, perKm }).replace("/km", "") : "—"}</td>
                      <td className="whitespace-nowrap py-1.5 pr-2 text-xs">
                        {m.szamla_szam ? <>{m.szamla_szam}{m.fizetve ? <span className="text-muted-foreground"> · fizetve {datumRovid(m.fizetve_datum)}</span> : m.fizetve === false ? <span className={m.fizetesi_hatarido && m.fizetesi_hatarido < ma ? "text-[var(--f2-amb)]" : "text-muted-foreground"}> · nyitott{m.fizetesi_hatarido ? `, ${datumRovid(m.fizetesi_hatarido)}` : ""}</span> : null}</> : <span className="text-muted-foreground">{m.allapot}</span>}
                      </td>
                      <td className="whitespace-nowrap py-1.5 text-right text-xs">
                        <a href={`/fuvarozas2/megbizasok/${m.id}`} className="hover:underline">Megbízás ↗</a>
                        {m.drive_url ? <> · <a href={m.drive_url} target="_blank" rel="noreferrer" className="hover:underline">Drive PDF ↗</a></> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {lista.length > mutatott.length ? <button type="button" onClick={() => setMind(true)} className="mt-2 text-sm text-primary hover:underline">további {lista.length - mutatott.length} megbízás</button> : null}
          </div>
        )}
      </div>

      <details className="rounded-xl ring-1 ring-foreground/10">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Adatok {szerkeszthet ? "szerkesztése" : ""} <span className="font-normal text-muted-foreground">— számlázás, posta, határidők, névváltozatok</span></summary>
        <div className="px-3 pb-3"><PartnerSzerkeszto p={p} szerkeszthet={szerkeszthet} /></div>
      </details>
    </section>
  );
}

/**
 * Számlázz.hu partner-export betöltése: a CSV szövegét beillesztve előbb próba
 * (mit töltene ki), aztán betöltés. Csak az üres mezők töltődnek.
 */
function SzamlazzBetoltes() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [csv, setCsv] = useState("");
  const [terv, setTerv] = useState<{ szamlazzDb: number; tervek: ImportTerv[]; parositatlan: string[]; irt: number; alkalmazva: boolean } | null>(null);
  const CIMKE: Record<string, string> = { adoszam: "adószám", szekhely: "székhely", szamlazasi_cim: "számlázási cím", postazasi_cim: "postacím", szamlazasi_email: "e-mail", fizetesi_hatarido_nap: "fizetési nap", nevvaltozatok: "névváltozat" };
  function futtat(alkalmaz: boolean) {
    start(async () => {
      const r = await importSzamlazzPartnerek(csv, alkalmaz);
      if (!r.ok) { toast.error(r.hiba); return; }
      setTerv({ ...r, alkalmazva: alkalmaz });
      if (alkalmaz) { toast.success(`Betöltve: ${r.irt} mező, ${r.tervek.length} partnernél`); router.refresh(); }
    });
  }
  return (
    <details className="rounded-xl ring-1 ring-foreground/10">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Számlázz.hu partner-export betöltése <span className="font-normal text-muted-foreground">— székhely, adószám, e-mail, fizetési határidő, postacím a hivatalos törzsből (csak az üres mezők)</span></summary>
      <div className="flex flex-col gap-2 px-3 pb-3 text-sm">
        <p className="text-xs text-muted-foreground">Számlázz.hu → Partnerek → Export (CSV) → a fájl tartalmát másold ide. Új partnert nem hoz létre, meglévő adatot nem ír felül; a Számlázz.hu-s név névváltozat lesz, hogy a számlák párosuljanak.</p>
        <textarea value={csv} onChange={(e) => { setCsv(e.target.value); setTerv(null); }} rows={4} placeholder='"partner neve","partner azonosító","ország",…' className="w-full rounded-lg border bg-background p-2 font-mono text-xs" />
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={pending || csv.length < 50} onClick={() => futtat(false)}>Próba (mit töltene ki)</Button>
          <Button size="sm" disabled={pending || !terv || terv.alkalmazva || terv.tervek.length === 0} onClick={() => futtat(true)}>Betöltés</Button>
        </div>
        {terv ? (
          <div className="flex flex-col gap-1">
            <div>{terv.szamlazzDb} Számlázz.hu partner · <b>{terv.tervek.length}</b> partnernél van kitöltenivaló{terv.alkalmazva ? <> · <b>{terv.irt}</b> mező betöltve</> : null}{terv.parositatlan.length ? <> · nem párosult: {terv.parositatlan.length}</> : null}</div>
            <ul className="max-h-64 overflow-y-auto rounded-lg bg-muted/40 p-2 text-xs">
              {terv.tervek.map((t) => (
                <li key={t.partnerId}><b>{t.partnerNev}</b>{t.szamlazzNev.toLowerCase() !== t.partnerNev.toLowerCase() ? <span className="text-muted-foreground"> ← {t.szamlazzNev}</span> : null}: {Object.entries(t.valtozas).map(([k, v]) => `${CIMKE[k] ?? k} = ${Array.isArray(v) ? v[v.length - 1] : v}`).join(" · ")}</li>
              ))}
            </ul>
            {terv.parositatlan.length ? <div className="text-xs text-muted-foreground">Nem párosult (nincs ilyen nevű/adószámú a Számlázz.hu-ban): {terv.parositatlan.join(", ")}</div> : null}
          </div>
        ) : null}
      </div>
    </details>
  );
}

/** Helymaradvány törlése — csak akkor látszik, ha semmi nem hivatkozik a partnerre. */
function TorlesGomb({ p }: { p: Partner }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  async function torol() {
    if (!(await confirm(`Törlöd „${p.nev}” partnert? Nincs megbízása, kapcsolattartója — a bérfuvarok rakodóhelyeként került ide. Nem visszavonható.`))) return;
    start(async () => {
      const r = await torolHivatkozatlanPartnert(p.id);
      if (r.ok) { toast.success(`„${p.nev}” törölve`); router.refresh(); } else toast.error(r.hiba);
    });
  }
  return <>{confirmDialog}<Button size="xs" variant="outline" disabled={pending} onClick={torol} title="Nincs megbízása és kapcsolattartója — helymaradvány">Törlés</Button></>;
}

/** A partner-törzs mezői (a korábbi lenyíló sor űrlapja változatlan mezőkkel). */
function PartnerSzerkeszto({ p, szerkeszthet }: { p: Partner; szerkeszthet: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState({
    nev: p.nev, adoszam: p.adoszam ?? "", szekhely: p.szekhely ?? "", fizetesi_hatarido_nap: p.fizetesi_hatarido_nap?.toString() ?? "", papir_bekuldesi_hatarido_nap: p.papir_bekuldesi_hatarido_nap?.toString() ?? "",
    szamlazasi_email: p.szamlazasi_email ?? "", postazasi_cim: p.postazasi_cim ?? "", szamlazasi_cim: p.szamlazasi_cim ?? "",
    szamlan_kert_szam: p.szamlan_kert_szam, szamla_email_nem_kell: p.szamla_email_nem_kell, posta_nem_kell: p.posta_nem_kell, megbizas_pdf_csatolva: p.megbizas_pdf_csatolva,
    nevvaltozatok: p.nevvaltozatok.join("; "), email_domainek: p.email_domainek.join("; "), megjegyzes: p.megjegyzes ?? "",
  });
  const szam = (s: string) => (s.trim() === "" ? null : Number(s));
  function ment() {
    start(async () => {
      await updatePartner(p.id, {
        nev: f.nev.trim(), adoszam: f.adoszam.trim() || null, szekhely: f.szekhely.trim() || null, fizetesi_hatarido_nap: szam(f.fizetesi_hatarido_nap), papir_bekuldesi_hatarido_nap: szam(f.papir_bekuldesi_hatarido_nap),
        szamlazasi_email: f.szamlazasi_email.trim() || null, postazasi_cim: f.postazasi_cim.trim() || null, szamlazasi_cim: f.szamlazasi_cim.trim() || null,
        szamlan_kert_szam: f.szamlan_kert_szam, szamla_email_nem_kell: f.szamla_email_nem_kell, posta_nem_kell: f.posta_nem_kell, megbizas_pdf_csatolva: f.megbizas_pdf_csatolva,
        nevvaltozatok: f.nevvaltozatok.split(";").map((s) => s.trim()).filter(Boolean), email_domainek: f.email_domainek.split(";").map((s) => s.trim()).filter(Boolean),
        megjegyzes: f.megjegyzes.trim() || null,
      });
      toast.success("Partner mentve");
      router.refresh();
    });
  }
  const M = (k: keyof typeof f, cimke: string, t: "text" | "number" = "text") => (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {cimke}
      <Input type={t} value={String(f[k])} onChange={(e) => setF({ ...f, [k]: e.target.value })} disabled={!szerkeszthet} className="h-8 text-sm text-foreground" />
    </label>
  );
  const K = (k: "szamla_email_nem_kell" | "posta_nem_kell" | "megbizas_pdf_csatolva", cimke: string) => (
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f[k]} disabled={!szerkeszthet} onChange={(e) => setF({ ...f, [k]: e.target.checked })} />{cimke}</label>
  );
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {M("nev", "Név")}
        {M("nevvaltozatok", "Névváltozatok (; elválasztva)")}
        {M("adoszam", "Adószám")}
        {M("szekhely", "Székhely")}
        {M("fizetesi_hatarido_nap", "Fizetési határidő (nap, 0 = készpénz)", "number")}
        {M("papir_bekuldesi_hatarido_nap", "Papír beküldési határidő (nap)", "number")}
        {M("szamlazasi_email", "Számlázási e-mail")}
        {M("email_domainek", "E-mail domainek (; elválasztva)")}
        {M("postazasi_cim", "Postázási cím")}
        {M("szamlazasi_cim", "Számlázási cím")}
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Számlán kért szám
          <select value={f.szamlan_kert_szam} disabled={!szerkeszthet} onChange={(e) => setF({ ...f, szamlan_kert_szam: e.target.value })} className="h-8 rounded-lg border bg-background px-2 text-sm text-foreground">
            <option value="pozicioszam">pozíciószám</option><option value="reise_id">Reise / Út ID</option><option value="hivatkozas">hivatkozás</option>
          </select>
        </label>
        <div className="flex flex-col gap-1 pt-4">{K("szamla_email_nem_kell", "nem kér számla-e-mailt (pl. önszámlázás)")}{K("posta_nem_kell", "nem kér postát")}{K("megbizas_pdf_csatolva", "megbízás PDF-et is csatolni")}</div>
        {M("megjegyzes", "Megjegyzés")}
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">Megbízás-sablon
          <span className="text-sm text-foreground">{p.sablon_azonosito ?? "nincs (LLM olvassa)"}</span>
        </div>
      </div>
      {p.kapcsolatok.length > 0 ? (
        <div className="mt-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Minden kapcsolattartó</div>
          <ul className="mt-1 flex flex-col gap-0.5 text-sm">
            {p.kapcsolatok.map((k, i) => (
              <li key={i}>{k.nev ?? "—"}{k.telefon ? <> · <a href={telHref(k.telefon)} className="hover:underline">{k.telefon}</a></> : null}{k.email ? <> · <a href={`mailto:${k.email}`} className="hover:underline">{k.email}</a></> : null}{k.levelDb ? <span className="text-xs text-muted-foreground"> · {k.levelDb} levél</span> : null}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {szerkeszthet ? <div className="mt-3 flex gap-2"><Button size="sm" disabled={pending} onClick={ment}>Ment</Button></div> : null}
    </>
  );
}
