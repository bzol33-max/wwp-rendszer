import Link from "next/link";
import { requireSession } from "@/lib/auth/dal";
import { megbizasJogok } from "@/lib/megbizasok/jogok";
import { getBerFuvarAdat, getKetOszlop, getMegbizas } from "@/lib/fuvarozas2/megbizasok";
import { getParositatlanFuvarszamlak } from "@/lib/fuvarozas/megbizasok";
import { Fuvarozas2Fulek } from "@/components/fuvarozas2/fulek";
import { MegbizasReszlet } from "@/components/fuvarozas2/megbizas-reszlet";
import { OszlopLista, munkaasztalLink, type MunkaasztalSzuro } from "@/components/fuvarozas2/munkaasztal";
import { KeresoJavaslatok } from "@/components/fuvarozas2/kereso-javaslatok";
import { ReszletLap } from "@/components/fuvarozas2/reszlet-lap";
import { formatFt } from "@/components/fuvarozas2/kozos";
import { SajatFuvarUrlap, VisszaveszemGomb } from "@/components/fuvarozas2/sajat-fuvar-urlap";
import { getSajatFuvarSegedlet } from "@/lib/fuvarozas2/sajat-fuvar";
import { BerFuvarUrlap, DriveFrissitesGomb, UjraolvasasGomb } from "@/components/fuvarozas2/berfuvar";
import { uresBerFuvar } from "@/lib/fuvarozas2/berfuvar";
import { MegbizasokAsztal, VisszaElvinniGomb } from "@/components/fuvarozas2/megbizasok-asztal";
import { getElvinniHet } from "@/lib/megbizasok/elvinni-het";
import { elvinniOszlop } from "@/lib/megbizasok/elvinni-szabalyok";

export const dynamic = "force-dynamic";

// Megbízások (2026-10-07, Budaházi Zoltán): asztali B — szakasz-oszlopok,
// az Elvinni való saját fuvarok heti kocsinaptárával; a kis kijelzőkön a
// korábbi felület marad.
// Megbízások (2026-09-30, Budaházi Zoltán: 1-es terv, B-változat): balra a
// bérfuvarok, jobbra a saját fuvarok, minden nyitott szakasz egyszerre. A
// saját oszlop tetején lenyíló „+ Új saját fuvar”; az előre beírt saját
// fuvar ugyanott nyílik szerkesztésre. Minden más sor részlete jobbról
// becsúszó lapon. A régi linkek szakasz-/jelleg-/kocsi-paramétere
// (Ma oldal, korábbi könyvjelzők) nem szűr többé — minden szakasz látszik.

export default async function Page({ searchParams }: {
  searchParams: Promise<{ q?: string; reszlet?: string; uj?: string; szerk?: string; ujber?: string; jelleg?: string; elvinni?: string; het?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const reszletId = sp.reszlet && /^\d+$/.test(sp.reszlet) ? sp.reszlet : undefined;
  const uj = sp.uj === "1";
  const szuro: MunkaasztalSzuro = { q, reszlet: reszletId, uj, szerk: sp.szerk === "1", ujBer: sp.ujber === "1", jelleg: sp.jelleg === "ber" || sp.jelleg === "sajat" ? sp.jelleg : undefined, elvinni: sp.elvinni && /^\d+$/.test(sp.elvinni) ? sp.elvinni : undefined, het: sp.het && /^\d{4}-\d{2}-\d{2}$/.test(sp.het) ? sp.het : undefined };

  const session = await requireSession();
  const jogok = megbizasJogok(session);
  const szerkeszthet = jogok.szerkeszti;
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
  const bezar = munkaasztalLink(szuro, { reszlet: undefined, uj: false, szerk: false, ujBer: false });
  // Bérfuvar: szerkesztés a lapon (?szerk=1), kézi új bérfuvar (?ujber=1).
  const berSzerk = szerkeszthet && szuro.szerk && lapon?.sor.jelleg === "ber" ? await getBerFuvarAdat(lapon.sor.id) : null;
  const nyitottak = [...asztal.ber, ...asztal.sajat].filter(s => elvinniOszlop(s));
  const nyitottReszlet = szuro.elvinni ? await getMegbizas(szuro.elvinni) : null;
  const [elvinniHet, gyorsHelyek] = await Promise.all([
    szuro.elvinni && nyitottReszlet?.sor.idopont_nyitott
      ? getElvinniHet(szuro.elvinni, sp.het)
      : Promise.resolve(null),
    szerkeszthet ? getSajatFuvarSegedlet() : Promise.resolve(null),
  ]);
  const ujBerLap = szerkeszthet && szuro.ujBer && !lapon;
  const reszletLink = (id: string) => munkaasztalLink(szuro, { reszlet: id, uj: false, szerk: false, ujBer: false });

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

      <div className="hidden lg:block">
        {parositatlan.length > 0 ? <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-[var(--f2-amb-l)] px-4 py-2 text-sm text-[var(--f2-amb)]"><span><b className="text-foreground">{parositatlan.length} fuvarszámla nincs fuvarhoz párosítva:</b> {parositatlan.slice(0,3).map(p=>`${p.szamlaszam} · ${p.vevo_nev} · ${formatFt(p.netto)}`).join(" | ")}{parositatlan.length>3?" …":""}</span><span className="text-xs">A számlaszámot a fuvar részleteinél lehet beírni.</span></div> : null}
        <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><KeresoJavaslatok key={q ?? ""} index={asztal.kereso} kezdo={q ?? ""} /></div>{q ? <Link href="/fuvarozas2/megbizasok" className="mt-1.5 shrink-0 rounded-lg border px-3 py-1.5 text-sm">× keresés törlése</Link> : null}</div>
        <MegbizasokAsztal key={szuro.elvinni ?? "lista"} sorok={[...asztal.ber,...asztal.sajat]} nyitottak={nyitottak} szuro={szuro} het={elvinniHet} szerkesztheto={szerkeszthet} helyek={gyorsHelyek?.helyek} jarmuvek={gyorsHelyek?.jarmuvek} ma={asztal.ma} />
      </div>
      {szerkeszthet && elokeszitett && segedlet ? <div className="hidden lg:block"><ReszletLap bezarHref={bezar} cim={`#${elokeszitett.id} · Előkészítés`}>{elokeszitett.idopont_nyitott ? null : <VisszaElvinniGomb id={elokeszitett.id} />}{sajatFelso}</ReszletLap></div> : null}

      <div className="lg:hidden">

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
        <OszlopLista
          cim="Bérfuvarok"
          sorok={asztal.ber}
          ma={asztal.ma}
          szuro={szuro}
          ures={q ? "Nincs találat." : "Nincs nyitott bérfuvar."}
          fejlecJobb={szerkeszthet ? (
            <>
              <DriveFrissitesGomb />
              <Link
                href={munkaasztalLink(szuro, { ujBer: true, reszlet: undefined, uj: false, szerk: false })}
                scroll={false}
                className="rounded-lg bg-[var(--f2-blue)] px-2.5 py-1 text-xs font-bold text-white hover:opacity-90"
              >
                + Új bérfuvar
              </Link>
            </>
          ) : null}
        />
        <OszlopLista cim="Saját fuvarok" sorok={asztal.sajat} ma={asztal.ma} szuro={szuro} felso={sajatFelso} ures={q ? "Nincs találat." : "Nincs nyitott saját fuvar."} />
      </div>
      </div>

      {ujBerLap ? (
        <ReszletLap bezarHref={bezar} cim="Új bérfuvar">
          <BerFuvarUrlap id={null} kezdo={uresBerFuvar(asztal.ma)} megseHref={bezar} reszletHref={munkaasztalLink(szuro, { reszlet: "{id}", uj: false, szerk: false, ujBer: false }).replace("%7Bid%7D", "{id}")} />
        </ReszletLap>
      ) : null}

      {lapon && berSzerk ? (
        <ReszletLap bezarHref={bezar} cim={`#${lapon.sor.id} · ${lapon.sor.partner_nev ?? "(nincs megbízó)"} — szerkesztés`}>
          <BerFuvarUrlap id={lapon.sor.id} kezdo={berSzerk} megseHref={reszletLink(lapon.sor.id)} reszletHref={reszletLink(lapon.sor.id)} />
        </ReszletLap>
      ) : lapon ? (
        <ReszletLap bezarHref={bezar} cim={`#${lapon.sor.id} · ${lapon.sor.partner_nev ?? (lapon.sor.jelleg === "sajat" ? "Saját fuvar" : "(nincs megbízó)")}`}>
          {szerkeszthet && lapon.sor.jelleg === "ber" && !lapon.sor.torolt ? (
            <div className="flex flex-wrap gap-2">
              <Link
                href={munkaasztalLink(szuro, { reszlet: lapon.sor.id, szerk: true })}
                scroll={false}
                className="rounded-lg bg-[var(--f2-blue)] px-3 py-1.5 text-xs font-bold text-white hover:opacity-90"
              >
                ✎ Szerkesztés (minden mező)
              </Link>
              {lapon.sor.forras === "pdf_import" && lapon.sor.dokumentum_url ? <UjraolvasasGomb id={lapon.sor.id} utanaHref={bezar} /> : null}
            </div>
          ) : null}
          {visszaveheto ? <VisszaveszemGomb id={lapon.sor.id} /> : null}
          <MegbizasReszlet
            {...lapon}
            egyOszlop
            szerkeszthet={jogok.elszamol}
            elszamolasJog={jogok.elszamol}
            fuvarozasJog={jogok.szerkeszti}
          />
        </ReszletLap>
      ) : null}
      {szerkeszthet && uj && segedlet ? <div className="hidden lg:block"><ReszletLap bezarHref={bezar} cim="Új saját fuvar">{sajatFelso}</ReszletLap></div> : null}
    </div>
  );
}
