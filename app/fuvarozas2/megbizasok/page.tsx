import Link from "next/link";
import { requireSession } from "@/lib/auth/dal";
import { getKetOszlop, getMegbizas } from "@/lib/fuvarozas2/megbizasok";
import { getParositatlanFuvarszamlak } from "@/lib/fuvarozas/megbizasok";
import { Fuvarozas2Fulek } from "@/components/fuvarozas2/fulek";
import { MegbizasReszlet } from "@/components/fuvarozas2/megbizas-reszlet";
import { OszlopLista, munkaasztalLink, type MunkaasztalSzuro } from "@/components/fuvarozas2/munkaasztal";
import { KeresoJavaslatok } from "@/components/fuvarozas2/kereso-javaslatok";
import { ReszletLap } from "@/components/fuvarozas2/reszlet-lap";
import { formatFt } from "@/components/fuvarozas2/kozos";
import { SajatFuvarUrlap, VisszaveszemGomb } from "@/components/fuvarozas2/sajat-fuvar-urlap";
import { getSajatFuvarSegedlet } from "@/lib/fuvarozas2/sajat-fuvar";

export const dynamic = "force-dynamic";

// Megbízások (2026-09-30, Budaházi Zoltán: 1-es terv, B-változat): balra a
// bérfuvarok, jobbra a saját fuvarok, minden nyitott szakasz egyszerre. A
// saját oszlop tetején lenyíló „+ Új saját fuvar”; az előre beírt saját
// fuvar ugyanott nyílik szerkesztésre. Minden más sor részlete jobbról
// becsúszó lapon. A régi linkek szakasz-/jelleg-/kocsi-paramétere
// (Ma oldal, korábbi könyvjelzők) nem szűr többé — minden szakasz látszik.

export default async function Page({ searchParams }: {
  searchParams: Promise<{ q?: string; reszlet?: string; uj?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const reszletId = sp.reszlet && /^\d+$/.test(sp.reszlet) ? sp.reszlet : undefined;
  const uj = sp.uj === "1";
  const szuro: MunkaasztalSzuro = { q, reszlet: reszletId, uj };

  const session = await requireSession();
  const szerkeszthet = session.can("fuvarozas").edit;
  const [asztal, reszlet, parositatlan] = await Promise.all([
    getKetOszlop({ q }),
    reszletId ? getMegbizas(reszletId) : Promise.resolve(null),
    getParositatlanFuvarszamlak(60).catch(() => []),
  ]);
  // Az előre beírt saját fuvar a saját oszlop űrlapjában nyílik, nem a lapon.
  const elokeszitett = szerkeszthet && reszlet?.sor.elokeszites ? reszlet.sor : null;
  const urlapNyitva = szerkeszthet && (uj || !!elokeszitett);
  const segedlet = urlapNyitva ? await getSajatFuvarSegedlet() : null;
  const lapon = reszlet && !elokeszitett ? reszlet : null;
  const visszaveheto =
    szerkeszthet && lapon && lapon.sor.jelleg === "sajat" && !lapon.sor.elokeszites &&
    (lapon.sor.allapot === "tervezett" || lapon.sor.allapot === "folyamatban") &&
    !lapon.megallok.some((m) => m.gps_erkezes || m.sofor_kesz_at);
  const bezar = munkaasztalLink(szuro, { reszlet: undefined, uj: false });

  const sajatFelso = !szerkeszthet ? null : segedlet ? (
    <SajatFuvarUrlap
      key={elokeszitett?.id ?? "uj"}
      id={elokeszitett?.id ?? null}
      kezdo={{
        datum: elokeszitett?.felrakas_nap ?? "",
        jarmuKod: elokeszitett?.elokeszites_jarmu ?? null,
        honnan: elokeszitett?.felrako ?? "",
        hova: elokeszitett?.lerako ?? "",
        kitol: elokeszitett?.kitol ?? null,
        kinek: elokeszitett?.partner_nev ?? null,
        megjegyzes: elokeszitett?.megjegyzes ?? null,
      }}
      segedlet={segedlet}
      bezarHref={bezar}
      listaHref={bezar}
      reszletHref={bezar}
      kocsiraHref={bezar}
    />
  ) : (
    <Link
      href={munkaasztalLink(szuro, { uj: true, reszlet: undefined })}
      scroll={false}
      className="flex items-center justify-between gap-2 rounded-xl bg-[var(--f2-mint)] px-4 py-2.5 text-sm font-bold text-white hover:opacity-90"
    >
      + Új saját fuvar
      <span className="text-xs font-normal opacity-85">itt nyílik ki</span>
    </Link>
  );

  return (
    <div className="flex flex-col gap-4">
      <Fuvarozas2Fulek aktiv="/fuvarozas2/megbizasok" />

      {parositatlan.length > 0 ? (
        <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-[var(--f2-amb-l)] px-4 py-2 text-sm text-[var(--f2-amb)]">
          <span>
            <b className="text-foreground">{parositatlan.length} fuvarszámla nincs fuvarhoz párosítva:</b>{" "}
            {parositatlan.slice(0, 3).map((p) => `${p.szamlaszam} · ${p.vevo_nev} · ${formatFt(p.netto)}`).join(" | ")}
            {parositatlan.length > 3 ? " …" : ""}
          </span>
          <span className="text-xs">A számlaszámot a fuvar részleteinél lehet beírni.</span>
        </div>
      ) : null}

      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <KeresoJavaslatok key={q ?? ""} index={asztal.kereso} kezdo={q ?? ""} />
        </div>
        {q ? (
          <Link href="/fuvarozas2/megbizasok" className="mt-1.5 shrink-0 rounded-lg border border-foreground/15 bg-card px-3 py-1.5 text-sm font-semibold hover:bg-muted">
            × keresés törlése
          </Link>
        ) : null}
      </div>
      {q ? (
        <p className="-mt-2 text-sm text-muted-foreground">
          Keresés: „{q}” — {asztal.talalat} találat, az archívval együtt.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <OszlopLista cim="Bérfuvarok" sorok={asztal.ber} ma={asztal.ma} szuro={szuro} ures={q ? "Nincs találat." : "Nincs nyitott bérfuvar."} />
        <OszlopLista cim="Saját fuvarok" sorok={asztal.sajat} ma={asztal.ma} szuro={szuro} felso={sajatFelso} ures={q ? "Nincs találat." : "Nincs nyitott saját fuvar."} />
      </div>

      {lapon ? (
        <ReszletLap bezarHref={bezar} cim={`#${lapon.sor.id} · ${lapon.sor.partner_nev ?? (lapon.sor.jelleg === "sajat" ? "Saját fuvar" : "(nincs megbízó)")}`}>
          {visszaveheto ? <VisszaveszemGomb id={lapon.sor.id} /> : null}
          <MegbizasReszlet
            {...lapon}
            egyOszlop
            szerkeszthet={session.can("fuvarozas").edit || session.can("elszamolas").edit}
            elszamolasJog={session.can("elszamolas").edit || session.can("fuvarozas").edit}
            fuvarozasJog={szerkeszthet}
          />
        </ReszletLap>
      ) : null}
    </div>
  );
}
