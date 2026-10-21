"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatNap } from "@/components/fuvarozas2/kozos";
import { DriveFrissitesGomb } from "@/components/fuvarozas2/berfuvar";
import { utolsoVaros, varos } from "@/lib/megbizasok/megjelenites";
import { MegbizasKartya } from "@/components/fuvarozas2/megbizas-kartya";
import { SzamlazasiSegedGomb } from "@/components/fuvarozas2/szamlazasi-seged";
import { munkaasztalLink, type MunkaasztalSzuro } from "@/components/fuvarozas2/munkaasztal";
import {
  modositElvinnivalot,
  rogzitElvinnivalot,
  torolElokeszitettet,
  kocsihozAdom,
  visszaElvinnivalokba,
} from "@/lib/fuvarozas2/sajat-fuvar";
import type { MunkaasztalSor } from "@/lib/fuvarozas2/megbizasok";
import type { PenzJel } from "@/lib/fuvarozas2/penz-lista-alap";
import type { ElvinniHet, ElvinniHetCella } from "@/lib/megbizasok/elvinni-het";
import { elvinniSurgosseg } from "@/lib/megbizasok/elvinni-szabalyok";
import { eletutOszlopok, type Fizetes } from "@/lib/fuvarozas2/eletut-tabla";

const NAPNEV = ["Vas", "Hét", "Kedd", "Sze", "Csüt", "Pén", "Szo"];

type Cimadat = { cim: string; nev: string | null };
type ElvinniAdat = {
  honnan: string;
  hova: string;
  legkorabban: string;
  legkesobb: string;
  kitol: string;
  kinek: string;
  megjegyzes: string;
};
type Oszlop = {
  kulcs: string;
  cim: string;
  sorok: MunkaasztalSor[];
  /** Az oszlopba eső összes fuvar (ha több, mint ami látszik). */
  osszes?: number;
  /** A „további” link pénz-szűrője (a teljes lista a tábla alatt). */
  penzSzuro?: string;
  ures?: string;
};

function napRovid(nap: string) {
  const datum = new Date(`${nap}T12:00:00Z`);
  return `${NAPNEV[datum.getUTCDay()].toLowerCase()} ${formatNap(nap)}`;
}

function napFejlec(nap: string) {
  const datum = new Date(`${nap}T12:00:00Z`);
  return `${NAPNEV[datum.getUTCDay()]} ${formatNap(nap)}`;
}

function uresAdat(): ElvinniAdat {
  return { honnan: "", hova: "", legkorabban: "", legkesobb: "", kitol: "", kinek: "", megjegyzes: "" };
}

function Rögzítő({
  helyek,
}: {
  helyek: Cimadat[];
}) {
  const router = useRouter();
  const [adat, setAdat] = useState(uresAdat);
  const [reszletek, setReszletek] = useState(false);
  const [hiba, setHiba] = useState("");
  const [mentes, setMentes] = useState(false);

  // A telephelyek gyorsgombként (a mező alatt), minden más korábbi cím a
  // böngésző javaslatlistájából (datalist) — hogy ne legyen hosszú gomb-fal.
  const telephelyek = helyek.filter((h) => h.nev?.includes("(telephely)"));

  function mezo(kulcs: keyof ElvinniAdat, cimke: string, tipus = "text", gyors = false) {
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">
          {cimke}
          <input
            type={tipus}
            value={adat[kulcs] ?? ""}
            list={gyors ? "sajat-fuvar-helyek" : undefined}
            onChange={(e) => setAdat({ ...adat, [kulcs]: e.target.value })}
            className="min-h-10 min-w-0 rounded-lg border border-foreground/15 bg-background px-2.5 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-[var(--f2-blue)]"
          />
        </label>
        {gyors && telephelyek.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {telephelyek.map((hely) => (
              <button
                key={hely.cim}
                type="button"
                onClick={() => setAdat({ ...adat, [kulcs]: hely.cim })}
                className="min-h-7 rounded-full border border-foreground/15 px-2 text-[11px] text-muted-foreground hover:bg-muted"
              >
                {hely.nev?.replace(" (telephely)", "") ?? hely.cim}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  async function rogzit() {
    setHiba("");
    setMentes(true);
    try {
      const eredmeny = await rogzitElvinnivalot(adat);
      if (!eredmeny.ok) {
        setHiba(eredmeny.hiba);
        return;
      }
      setAdat(uresAdat());
      toast.success("Saját fuvar rögzítve");
      router.refresh();
    } finally {
      setMentes(false);
    }
  }

  return (
    <div className="space-y-2 border-b border-foreground/10 p-3">
      <datalist id="sajat-fuvar-helyek">
        {helyek.map((hely) => (
          <option key={hely.cim} value={hely.cim}>{hely.nev ?? undefined}</option>
        ))}
      </datalist>
      {mezo("honnan", "Honnan *", "text", true)}
      {mezo("hova", "Hová *", "text", true)}
      {mezo("legkorabban", "Legkorábban", "date")}
      {mezo("legkesobb", "Legkésőbb (üresen: +7 nap)", "date")}
      <button
        type="button"
        onClick={() => setReszletek(!reszletek)}
        className="min-h-9 text-xs font-semibold text-[var(--f2-blue)]"
        aria-expanded={reszletek}
      >
        {reszletek ? "− kevesebb" : "+ részletek"}
      </button>
      {reszletek ? (
        <div className="space-y-2">
          {mezo("kitol", "Kitől")}
          {mezo("kinek", "Kinek")}
          {mezo("megjegyzes", "Megjegyzés")}
        </div>
      ) : null}
      {hiba ? <p role="alert" className="text-xs text-[var(--f2-red)]">{hiba}</p> : null}
      <button
        type="button"
        disabled={mentes || !adat.honnan.trim() || !adat.hova.trim()}
        onClick={rogzit}
        className="min-h-11 w-full rounded-lg bg-[var(--f2-mint)] px-3 font-bold text-white disabled:opacity-50"
      >
        {mentes ? "Mentés…" : "Rögzítem"}
      </button>
    </div>
  );
}

function ElvinniKartya({
  sor,
  ma,
  kijelolt,
  href,
  jarmuvek,
  szerkesztheto,
}: {
  sor: MunkaasztalSor;
  ma: string;
  kijelolt: boolean;
  href: string;
  jarmuvek: { kod: string; cimke: string }[];
  szerkesztheto: boolean;
}) {
  const router = useRouter();
  const napokOta = Math.max(
    0,
    Math.floor((Date.parse(`${ma}T12:00:00Z`) - Date.parse(sor.letrehozva_at)) / 86_400_000)
  );
  const legkorabbiNap = sor.legkorabban && sor.legkorabban > ma ? sor.legkorabban : ma;
  const [jarmuKod, setJarmuKod] = useState("");
  const [nap, setNap] = useState(legkorabbiNap);
  const [kuldes, setKuldes] = useState(false);

  // Egy lépésben kocsira (2026-10-07): kocsi + nap, és megy a sofőrnek.
  async function kocsira() {
    if (!jarmuKod || !nap) return;
    setKuldes(true);
    try {
      const eredmeny = await kocsihozAdom(sor.id, { jarmuKod, nap });
      if (!eredmeny.ok) {
        toast.error(eredmeny.hiba);
        return;
      }
      toast.success("Kocsira adva — a sofőr látja");
      router.refresh();
    } finally {
      setKuldes(false);
    }
  }

  return (
    <div className={`rounded-2xl border border-foreground/10 p-3 text-sm ${kijelolt ? "bg-[var(--f2-blue-l)]" : "bg-card"}`}>
      <strong className="block">{varos(sor.felrako)} → {utolsoVaros(sor.lerako)}</strong>
      <span className="mt-1 block text-xs text-muted-foreground">
        {sor.legkorabban ? `legkorábban: ${napRovid(sor.legkorabban)}` : "bármikor"} · {napokOta} napja vár
      </span>
      {sor.legkesobb ? <HataridoCimke legkesobb={sor.legkesobb} ma={ma} /> : null}
      {sor.megjegyzes ? (
        <span className="block truncate text-xs text-muted-foreground">{sor.megjegyzes.split("\n")[0]}</span>
      ) : null}
      {szerkesztheto ? (
        <div className="mt-2 flex flex-col gap-1.5">
          <select
            aria-label="Kocsi"
            value={jarmuKod}
            onChange={(e) => setJarmuKod(e.target.value)}
            className="min-h-10 rounded-lg border border-foreground/15 bg-background px-2 text-sm"
          >
            <option value="">Melyik kocsi?</option>
            {jarmuvek.map((jarmu) => (
              <option key={jarmu.kod} value={jarmu.kod}>{jarmu.cimke}</option>
            ))}
          </select>
          <input
            type="date"
            aria-label="Nap"
            value={nap}
            min={legkorabbiNap}
            onChange={(e) => setNap(e.target.value)}
            className="min-h-10 rounded-lg border border-foreground/15 bg-background px-2 text-sm"
          />
          <button
            type="button"
            disabled={kuldes || !jarmuKod || !nap}
            onClick={kocsira}
            className="min-h-11 rounded-lg bg-[var(--f2-mint)] px-3 font-bold text-white disabled:opacity-50"
          >
            {kuldes ? "Mentés…" : "Kocsira adom"}
          </button>
        </div>
      ) : null}
      <Link href={href} scroll={false} className="mt-2 inline-block text-xs font-semibold text-[var(--f2-blue)]">
        Kocsik hete · szerkesztés ›
      </Link>
    </div>
  );
}

/** A rugalmas saját fuvar határideje, sürgősség szerint színezve (elvinniSurgosseg). */
function HataridoCimke({ legkesobb, ma }: { legkesobb: string; ma: string }) {
  const s = elvinniSurgosseg(legkesobb, ma);
  const szin = s === "piros" ? "bg-[var(--f2-red-l)] text-[var(--f2-red)]" : s === "sarga" ? "bg-[var(--f2-amb-l)] text-[var(--f2-amb)]" : "text-muted-foreground";
  return (
    <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${szin}`}>
      {legkesobb < ma ? `lejárt: ${napRovid(legkesobb)}` : `határidő: ${napRovid(legkesobb)}`}
    </span>
  );
}

function SzakaszOszlop({
  oszlop,
  ma,
  szuro,
  jelek,
  szamlazhat,
}: {
  oszlop: Oszlop;
  ma: string;
  szuro: MunkaasztalSzuro;
  jelek: Record<string, PenzJel>;
  szamlazhat: boolean;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-foreground/10 bg-card" aria-label={oszlop.cim}>
      <header className="border-b border-foreground/10 px-3 py-3">
        <h2 className="text-sm font-semibold">
          {oszlop.cim} <span className="text-xs font-normal text-muted-foreground">{oszlop.osszes ?? oszlop.sorok.length}</span>
        </h2>
      </header>
      {oszlop.sorok.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">{oszlop.ures ?? "Nincs fuvar ebben a szakaszban."}</p>
      ) : (
        <ul className="space-y-2 p-2">
          {oszlop.sorok.map((sor) => (
            <li key={sor.id}>
              <MegbizasKartya
                sor={sor}
                ma={ma}
                tipus={!szuro.jelleg}
                penzJel={jelek[sor.id] ?? null}
                href={munkaasztalLink(szuro, { reszlet: sor.id, elvinni: undefined, uj: false, ujBer: false, szerk: false })}
              />
              {/* Számlázandó bérfuvarnál a Számlázási segéd közvetlenül a kártya alatt
                  (a kártya linkjén kívül). A számlaszám írását a setSzamlaSzam
                  szerveroldalon a jogosultsághoz köti. */}
              {sor.jelleg === "ber" && sor.szakasz === "szamlazasra" && !sor.szamla_szam ? (
                <div className="mt-1 flex justify-end">
                  <SzamlazasiSegedGomb megbizasId={sor.id} elszamolasJog={szamlazhat} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {oszlop.osszes != null && oszlop.osszes > oszlop.sorok.length ? (
        oszlop.penzSzuro ? (
          <Link href={munkaasztalLink(szuro, { penz: oszlop.penzSzuro, reszlet: undefined, elvinni: undefined })} className="block px-3 pb-3 text-xs font-semibold text-[var(--f2-blue)] hover:underline">
            + további {oszlop.osszes - oszlop.sorok.length} · mind a listában
          </Link>
        ) : (
          <p className="px-3 pb-3 text-xs text-muted-foreground">+ további {oszlop.osszes - oszlop.sorok.length} (kereséssel)</p>
        )
      ) : null}
    </section>
  );
}

function HetiCella({
  cella,
  jarmuCimke,
  jarmuKod,
  ma,
  utemezheto,
  utemez,
}: {
  cella: ElvinniHetCella;
  jarmuCimke: string;
  jarmuKod: string;
  ma: string;
  utemezheto: boolean;
  utemez: (cimke: string, kod: string, nap: string) => void;
}) {
  return (
    <td className={`w-[13%] p-1 align-top ${cella.nap === ma ? "ring-2 ring-inset ring-[var(--f2-blue)]" : ""} ${[0, 6].includes(new Date(`${cella.nap}T12:00:00Z`).getUTCDay()) ? "bg-muted/40" : ""}`}>
      <button
        type="button"
        disabled={!utemezheto || cella.megNemViheto}
        onClick={() => utemez(jarmuCimke, jarmuKod, cella.nap)}
        className={`min-h-20 w-full rounded-lg border p-2 text-left disabled:cursor-not-allowed ${cella.megNemViheto ? "opacity-40" : "hover:border-[var(--f2-blue)]"}`}
      >
        {cella.megNemViheto ? <span className="block text-[10px]">Még nem vihető</span> : null}
        {cella.megbizasok.map((megbizas) => (
          <span key={megbizas.id} className="mb-1 block">
            {megbizas.utemezett ? <b>Ütemezett · </b> : null}
            <span className="font-medium">{megbizas.partner ?? `${megbizas.kitol ?? "saját"} → ${megbizas.kinek ?? "?"}`}</span>
            <small className="block text-muted-foreground">{varos(megbizas.felrako)} → {utolsoVaros(megbizas.lerako)}</small>
          </span>
        ))}
        {cella.hol ? <span className="block">áll: {cella.hol}</span> : null}
        {cella.km !== null ? <span className="block">≈ {cella.km} km a felrakóig</span> : null}
      </button>
    </td>
  );
}

function KocsiHetPanel({
  adat,
  utvonal,
  ma,
  szuro,
  szerkesztheto,
  bezar,
  elozoHet,
  kovetkezoHet,
  kezdoAdat,
  mentes,
  torles,
  utemez,
}: {
  adat: ElvinniHet;
  utvonal: string;
  ma: string;
  szuro: MunkaasztalSzuro;
  szerkesztheto: boolean;
  bezar: () => void;
  elozoHet: string;
  kovetkezoHet: string;
  kezdoAdat: ElvinniAdat;
  mentes: (adat: ElvinniAdat) => Promise<void>;
  torles: () => Promise<void>;
  utemez: (cimke: string, kod: string, nap: string) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [confirm, confirmDialog] = useConfirm();
  const [szerkesztes, setSzerkesztes] = useState<ElvinniAdat>(kezdoAdat);

  useEffect(() => panelRef.current?.focus(), []);

  useEffect(() => {
    function escape(e: KeyboardEvent) {
      if (e.key === "Escape") bezar();
    }
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [bezar]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Saját fuvar és a kocsik hete">
      <button type="button" aria-label="A panel bezárása" onClick={bezar} className="absolute inset-0 bg-black/25" />
      <div ref={panelRef} tabIndex={-1} className="relative flex h-full w-full max-w-[min(1200px,94vw)] flex-col gap-4 overflow-y-auto bg-background p-4 shadow-2xl focus:outline-none">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">{utvonal}</h2>
            <p className="text-sm text-muted-foreground">
              {adat.legkorabban ? `Legkorábban: ${napRovid(adat.legkorabban)}` : "Bármikor vihető"}
              {adat.legkesobb ? ` · határidő: ${napRovid(adat.legkesobb)}` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <Link href={munkaasztalLink(szuro, { het: elozoHet })} className="min-h-11 rounded-lg border px-3 py-2">‹ Előző hét</Link>
            <Link href={munkaasztalLink(szuro, { het: kovetkezoHet })} className="min-h-11 rounded-lg border px-3 py-2">Következő hét ›</Link>
            <button type="button" onClick={bezar} className="min-h-11 rounded-lg px-3 py-2" aria-label="Bezárás">×</button>
          </div>
        </header>

        {szerkesztheto ? (
          <div className="grid gap-2 rounded-xl bg-muted/40 p-3 sm:grid-cols-3">
            {(["honnan", "hova", "legkorabban", "legkesobb", "kitol", "kinek", "megjegyzes"] as const).map((kulcs) => (
              <label key={kulcs} className="flex flex-col gap-1 text-xs text-muted-foreground">
                {({ honnan: "Honnan", hova: "Hová", legkorabban: "Legkorábban", legkesobb: "Legkésőbb", kitol: "Kitől", kinek: "Kinek", megjegyzes: "Megjegyzés" })[kulcs]}
                <input
                  type={kulcs === "legkorabban" || kulcs === "legkesobb" ? "date" : "text"}
                  value={szerkesztes[kulcs]}
                  onChange={(e) => setSzerkesztes({ ...szerkesztes, [kulcs]: e.target.value })}
                  className="min-h-11 rounded-lg border bg-background px-3 text-sm text-foreground"
                />
              </label>
            ))}
            <div className="flex items-end gap-2">
              <button type="button" onClick={() => void mentes(szerkesztes)} className="min-h-11 rounded-lg bg-[var(--f2-blue)] px-4 font-semibold text-white">Mentés</button>
              <button type="button" onClick={async () => { if (await confirm("Törlöd ezt a saját fuvart?", { title: "Fuvar törlése", confirmLabel: "Törlés" })) await torles(); }} className="min-h-11 rounded-lg border border-[var(--f2-red)] px-4 font-semibold text-[var(--f2-red)]">Törlés</button>
            </div>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] table-fixed border-collapse text-xs">
            <thead>
              <tr>
                <th className="w-32 p-2 text-left">Kocsi</th>
                {adat.napok.map((nap) => (
                  <th key={nap} className={`p-2 text-left ${nap === ma ? "rounded bg-[var(--f2-blue-l)]" : ""}`}>{napFejlec(nap)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {adat.sorok.map((jarmu) => (
                <tr key={jarmu.kod} className="border-t border-foreground/10">
                  <th className="p-2 text-left">{jarmu.cimke}</th>
                  {jarmu.napok.map((cella) => (
                    <HetiCella key={cella.nap} cella={cella} jarmuCimke={jarmu.cimke} jarmuKod={jarmu.kod} ma={ma} utemezheto={szerkesztheto} utemez={utemez} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {confirmDialog}
      </div>
    </div>
  );
}

export function MegbizasokAsztal({
  sorok,
  nyitottak,
  szuro,
  het,
  szerkesztheto,
  helyek = [],
  jarmuvek = [],
  ma,
  penzIdk = null,
  penzJelek = {},
  szamlazhat = false,
  archiv = [],
  fizetes = {},
}: {
  sorok: MunkaasztalSor[];
  nyitottak: MunkaasztalSor[];
  szuro: MunkaasztalSzuro;
  het?: ElvinniHet | null;
  szerkesztheto: boolean;
  helyek?: Cimadat[];
  jarmuvek?: { kod: string; cimke: string }[];
  ma: string;
  /** Aktív pénz-szűrőnél a találatok azonosítói: az oszlopok csak ezeket mutatják. */
  penzIdk?: string[] | null;
  penzJelek?: Record<string, PenzJel>;
  /** Elszámolási jog (a Számlázási segéd írhat-e). */
  szamlazhat?: boolean;
  /** A lezárt megbízások (életút-tábla, 2026-10-21). */
  archiv?: MunkaasztalSor[];
  /** Archív bérfuvarok számla-állapota (Kiküldve / Lejárt / Fizetve). */
  fizetes?: Record<string, Fizetes>;
}) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const penzSzurt = penzIdk ? new Set(penzIdk) : null;
  const szurtSorok = sorok.filter((sor) => (!szuro.jelleg || sor.jelleg === szuro.jelleg) && (!penzSzurt || penzSzurt.has(sor.id)));
  const elvinniSorok = nyitottak.filter((sor) => !szuro.jelleg || sor.jelleg === szuro.jelleg);
  const nyitva = szuro.elvinni ? elvinniSorok.find((sor) => sor.id === szuro.elvinni) : null;

  // Életút-tábla (2026-10-21, 1-es terv): a bérfuvar a fizetésig a táblán
  // marad, a saját fuvar külön sávban (lib/fuvarozas2/eletut-tabla.ts).
  const szurtArchiv = archiv.filter((sor) => !penzSzurt || penzSzurt.has(sor.id));
  const savok = eletutOszlopok({ sorok: szurtSorok, archiv: szurtArchiv, fizetes, ma });

  const bezarPanel = () => router.replace(munkaasztalLink(szuro, { elvinni: undefined, het: undefined }));

  async function utemez(cimke: string, kod: string, nap: string) {
    if (!nyitva) return;
    if (!(await confirm(`${cimke} · ${napRovid(nap)} — kocsira adom? A sofőr azonnal látja.`, { title: "Kocsira adás", confirmLabel: "Kocsira adom" }))) return;
    const eredmeny = await kocsihozAdom(nyitva.id, { jarmuKod: kod, nap });
    if (!eredmeny.ok) {
      toast.error(eredmeny.hiba);
      return;
    }
    toast.success("Kocsira adva — a sofőr látja");
    bezarPanel();
    router.refresh();
  }

  async function mentes(adat: ElvinniAdat) {
    if (!nyitva) return;
    const eredmeny = await modositElvinnivalot(nyitva.id, adat);
    if (!eredmeny.ok) {
      toast.error(eredmeny.hiba);
      return;
    }
    toast.success("Saját fuvar módosítva");
    router.refresh();
  }

  async function torles() {
    if (!nyitva) return;
    const eredmeny = await torolElokeszitettet(nyitva.id);
    if (!eredmeny.ok) {
      toast.error(eredmeny.hiba);
      return;
    }
    router.replace(munkaasztalLink(szuro, { elvinni: undefined, het: undefined }));
    router.refresh();
  }

  const napKulonbseg = het?.hetKezdet
    ? dateOffset(het.hetKezdet, -7)
    : undefined;

  return (
    <div className="hidden flex-col gap-4 lg:flex">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          {([[undefined, "Mind"], ["ber", "Bér"], ["sajat", "Saját"]] as const).map(([jelleg, cimke]) => (
            <Link
              key={cimke}
              href={munkaasztalLink(szuro, { jelleg })}
              className={`min-h-11 rounded-lg px-4 py-2 text-sm font-semibold ${szuro.jelleg === jelleg ? "bg-[var(--f2-blue-l)]" : "border border-foreground/10 bg-card"}`}
            >
              {cimke}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {/* Drive-ból az új megbízások (2026-10-07: az asztali nézetből kimaradt). */}
          {szerkesztheto ? <DriveFrissitesGomb /> : null}
          {szerkesztheto ? (
            <>
              <Link href={munkaasztalLink(szuro, { ujBer: true, reszlet: undefined, elvinni: undefined })} className="flex min-h-11 items-center rounded-lg bg-[var(--f2-blue)] px-4 text-sm font-bold text-white">+ Új bérfuvar</Link>
              <Link href={munkaasztalLink(szuro, { uj: true, reszlet: undefined, elvinni: undefined })} className="flex min-h-11 items-center rounded-lg bg-[var(--f2-mint)] px-4 text-sm font-bold text-white">+ Új saját fuvar</Link>
            </>
          ) : null}
        </div>
      </div>

      {szuro.jelleg !== "sajat" ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Bérfuvarok <span className="font-normal text-muted-foreground">· beérkezéstől a pénzig — a kész fuvar a fizetésig a táblán marad</span></h2>
          <div className="overflow-x-auto pb-1">
            <div className="grid min-w-[1180px] grid-cols-7 gap-3">
              {savok.ber.map((oszlop) => (
                <SzakaszOszlop key={oszlop.kulcs} oszlop={oszlop} ma={ma} szuro={szuro} jelek={penzJelek} szamlazhat={szamlazhat} />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {szuro.jelleg !== "ber" ? (
      <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">Saját fuvarok <span className="font-normal text-muted-foreground">· nem számlázandó, a megbízó mindig a Well-Worn Pallet</span></h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 min-[1360px]:grid-cols-5!">
        <section className="min-w-0 rounded-2xl border border-foreground/10 bg-card" aria-label="Saját fuvar">
          <header className="border-b border-foreground/10 px-3 py-3">
            <h2 className="font-semibold">Saját fuvar <span className="text-xs font-normal text-muted-foreground">{elvinniSorok.length}</span></h2>
          </header>
          {szerkesztheto ? <Rögzítő helyek={helyek} /> : null}
          <ul className="space-y-2 p-2">
            {elvinniSorok.map((sor) => (
              <li key={sor.id}>
                <ElvinniKartya
                  sor={sor}
                  ma={ma}
                  kijelolt={nyitva?.id === sor.id}
                  href={munkaasztalLink(szuro, { elvinni: sor.id, het: undefined, reszlet: undefined })}
                  jarmuvek={jarmuvek}
                  szerkesztheto={szerkesztheto}
                />
              </li>
            ))}
          </ul>
        </section>
        {savok.sajat.map((oszlop) => (
          <SzakaszOszlop key={oszlop.kulcs} oszlop={oszlop} ma={ma} szuro={szuro} jelek={penzJelek} szamlazhat={szamlazhat} />
        ))}
      </div>
      </div>
      ) : null}

      {szuro.q ? (
        <details className="rounded-2xl border border-foreground/10 bg-card">
          <summary className="min-h-11 cursor-pointer px-4 py-3 font-semibold">
            Archív ({szurtSorok.filter((sor) => sor.szakasz === "archiv").length})
          </summary>
          <ul className="grid gap-2 p-3 sm:grid-cols-2 min-[1360px]:grid-cols-4">
            {szurtSorok.filter((sor) => sor.szakasz === "archiv").map((sor) => (
              <li key={sor.id}>
                <MegbizasKartya
                  sor={sor}
                  ma={ma}
                  tipus={!szuro.jelleg}
                  href={munkaasztalLink(szuro, { reszlet: sor.id, elvinni: undefined })}
                />
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {nyitva && het ? (
        <KocsiHetPanel
          key={`${nyitva.id}:${het.hetKezdet}`}
          adat={het}
          utvonal={`${nyitva.felrako ?? ""} → ${nyitva.lerako ?? ""}`}
          ma={ma}
          szuro={szuro}
          szerkesztheto={szerkesztheto}
          bezar={bezarPanel}
          elozoHet={napKulonbseg ?? dateOffset(het.hetKezdet, -7)}
          kovetkezoHet={dateOffset(het.hetKezdet, 7)}
          kezdoAdat={{
            honnan: nyitva.felrako ?? "",
            hova: nyitva.lerako ?? "",
            legkorabban: nyitva.legkorabban ?? "",
            legkesobb: nyitva.legkesobb ?? "",
            kitol: nyitva.kitol ?? "",
            kinek: nyitva.partner_nev ?? "",
            megjegyzes: nyitva.megjegyzes ?? "",
          }}
          mentes={mentes}
          torles={torles}
          utemez={utemez}
        />
      ) : null}
      {confirmDialog}
    </div>
  );
}

export function VisszaElvinniGomb({ id }: { id: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        const eredmeny = await visszaElvinnivalokba(id);
        if (!eredmeny.ok) {
          toast.error(eredmeny.hiba);
          return;
        }
        toast.success("A fuvar visszakerült a Saját fuvar oszlopba");
        router.replace("/fuvarozas2/megbizasok");
        router.refresh();
      }}
      className="mb-3 min-h-11 rounded-lg border border-[var(--f2-blue)] px-4 font-semibold text-[var(--f2-blue)]"
    >
      Vissza a Saját fuvar oszlopba (még nincs nap és kocsi)
    </button>
  );
}

function dateOffset(nap: string, delta: number) {
  const datum = new Date(`${nap}T12:00:00Z`);
  datum.setUTCDate(datum.getUTCDate() + delta);
  return datum.toISOString().slice(0, 10);
}
