"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatNap } from "@/components/fuvarozas2/kozos";
import { utolsoVaros, varos } from "@/lib/megbizasok/megjelenites";
import { MegbizasKartya } from "@/components/fuvarozas2/megbizas-kartya";
import { munkaasztalLink, type MunkaasztalSzuro } from "@/components/fuvarozas2/munkaasztal";
import {
  modositElvinnivalot,
  rogzitElvinnivalot,
  torolElokeszitettet,
  utemezElvinnivalot,
  visszaElvinnivalokba,
} from "@/lib/fuvarozas2/sajat-fuvar";
import type { MunkaasztalSor } from "@/lib/fuvarozas2/megbizasok";
import type { ElvinniHet, ElvinniHetCella } from "@/lib/megbizasok/elvinni-het";
import { beerkElokeszitesOszlopba } from "@/lib/megbizasok/elvinni-szabalyok";

const NAPNEV = ["Vas", "Hét", "Kedd", "Sze", "Csüt", "Pén", "Szo"];

type Cimadat = { cim: string; nev: string | null };
type ElvinniAdat = {
  honnan: string;
  hova: string;
  legkorabban: string;
  kitol: string;
  kinek: string;
  megjegyzes: string;
};
type Oszlop = {
  kulcs: string;
  cim: string;
  sorok: MunkaasztalSor[];
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
  return { honnan: "", hova: "", legkorabban: "", kitol: "", kinek: "", megjegyzes: "" };
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
}: {
  sor: MunkaasztalSor;
  ma: string;
  kijelolt: boolean;
  href: string;
}) {
  const napokOta = Math.max(
    0,
    Math.floor((Date.parse(`${ma}T12:00:00Z`) - Date.parse(sor.letrehozva_at)) / 86_400_000)
  );

  return (
    <Link
      href={href}
      scroll={false}
      className={`block min-h-11 rounded-2xl border border-foreground/10 bg-card p-3 text-sm hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-[var(--f2-blue)] ${kijelolt ? "bg-[var(--f2-blue-l)]" : ""}`}
    >
      <strong className="block">{sor.felrako} → {sor.lerako}</strong>
      <span className="mt-1 block text-xs text-muted-foreground">
        {sor.legkorabban ? `legkorábban: ${napRovid(sor.legkorabban)}` : "bármikor"} · {napokOta} napja vár
      </span>
      {sor.megjegyzes ? (
        <span className="block truncate text-xs text-muted-foreground">{sor.megjegyzes.split("\n")[0]}</span>
      ) : null}
    </Link>
  );
}

function SzakaszOszlop({
  oszlop,
  ma,
  szuro,
}: {
  oszlop: Oszlop;
  ma: string;
  szuro: MunkaasztalSzuro;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-foreground/10 bg-card" aria-label={oszlop.cim}>
      <header className="border-b border-foreground/10 px-3 py-3">
        <h2 className="text-sm font-semibold">
          {oszlop.cim} <span className="text-xs font-normal text-muted-foreground">{oszlop.sorok.length}</span>
        </h2>
      </header>
      {oszlop.sorok.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nincs fuvar ebben a szakaszban.</p>
      ) : (
        <ul className="space-y-2 p-2">
          {oszlop.sorok.map((sor) => (
            <li key={sor.id}>
              <MegbizasKartya
                sor={sor}
                ma={ma}
                tipus={!szuro.jelleg}
                href={munkaasztalLink(szuro, { reszlet: sor.id, elvinni: undefined, uj: false, ujBer: false, szerk: false })}
              />
            </li>
          ))}
        </ul>
      )}
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
            {(["honnan", "hova", "legkorabban", "kitol", "kinek", "megjegyzes"] as const).map((kulcs) => (
              <label key={kulcs} className="flex flex-col gap-1 text-xs text-muted-foreground">
                {({ honnan: "Honnan", hova: "Hová", legkorabban: "Legkorábban", kitol: "Kitől", kinek: "Kinek", megjegyzes: "Megjegyzés" })[kulcs]}
                <input
                  type={kulcs === "legkorabban" ? "date" : "text"}
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
  ma,
}: {
  sorok: MunkaasztalSor[];
  nyitottak: MunkaasztalSor[];
  szuro: MunkaasztalSzuro;
  het?: ElvinniHet | null;
  szerkesztheto: boolean;
  helyek?: Cimadat[];
  ma: string;
}) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const szurtSorok = sorok.filter((sor) => !szuro.jelleg || sor.jelleg === szuro.jelleg);
  const elvinniSorok = nyitottak.filter((sor) => !szuro.jelleg || sor.jelleg === szuro.jelleg);
  const nyitva = szuro.elvinni ? elvinniSorok.find((sor) => sor.id === szuro.elvinni) : null;

  const oszlopok: Oszlop[] = [
    { kulcs: "beerkezett", cim: "Beérkezett / Előkészítés", sorok: szurtSorok.filter((sor) => beerkElokeszitesOszlopba(sor)) },
    { kulcs: "folyamatban", cim: "Folyamatban", sorok: szurtSorok.filter((sor) => sor.szakasz === "folyamatban") },
    { kulcs: "szamlazasra", cim: "Számlázásra", sorok: szurtSorok.filter((sor) => sor.szakasz === "szamlazasra") },
    { kulcs: "postara", cim: "Postára", sorok: szurtSorok.filter((sor) => sor.szakasz === "postara") },
  ];

  const bezarPanel = () => router.replace(munkaasztalLink(szuro, { elvinni: undefined, het: undefined }));

  async function utemez(cimke: string, kod: string, nap: string) {
    if (!nyitva) return;
    if (!(await confirm(`${cimke} · ${napRovid(nap)} — ütemezem?`, { title: "Fuvar ütemezése", confirmLabel: "Ütemezem" }))) return;
    const eredmeny = await utemezElvinnivalot(nyitva.id, { jarmuKod: kod, nap });
    if (!eredmeny.ok) {
      toast.error(eredmeny.hiba);
      return;
    }
    toast.success("Fuvar ütemezve");
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
        <div className="flex gap-2">
          <Link href={munkaasztalLink(szuro, { ujBer: true, reszlet: undefined, elvinni: undefined })} className="flex min-h-11 items-center rounded-lg bg-[var(--f2-blue)] px-4 text-sm font-bold text-white">+ Új bérfuvar</Link>
          <Link href={munkaasztalLink(szuro, { uj: true, reszlet: undefined, elvinni: undefined })} className="flex min-h-11 items-center rounded-lg bg-[var(--f2-mint)] px-4 text-sm font-bold text-white">+ Új saját fuvar</Link>
        </div>
      </div>

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
                />
              </li>
            ))}
          </ul>
        </section>
        {oszlopok.map((oszlop) => (
          <SzakaszOszlop key={oszlop.kulcs} oszlop={oszlop} ma={ma} szuro={szuro} />
        ))}
      </div>

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
