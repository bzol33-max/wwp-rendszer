import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Building2, MapPin, ArrowRight, Mail } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ModuleStatusBadge } from "@/components/layout/module-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SITES } from "@/lib/nav";
import { MODULES } from "@/lib/modules";
import { requireSession } from "@/lib/auth/dal";
import { getAttekintesProfil } from "@/lib/attekintes/tabs";
import { NapiNaplo, type NapiNaploAdat } from "@/components/kokpit/napi-naplo";
import {
  naploHatarok,
  getFelvasarlasNaplo,
  getTelepekNaplo,
  getSzamlaNaplo,
  getNyitottFeladatok,
  getSzabadsagok,
} from "@/lib/kokpit/naplo";
import { getKimutatas } from "@/lib/fuvarozas2/kimutatas";
import { getPenzLista } from "@/lib/fuvarozas2/penz-lista";

export const dynamic = "force-dynamic";

/** Egy blokk betöltése: hiba esetén a blokk kimarad (null), a lap többi része megjelenik. */
async function biztos<T>(nev: string, f: () => Promise<T>): Promise<T | null> {
  try {
    return await f();
  } catch (e) {
    console.error(`[napló] ${nev}:`, e instanceof Error ? e.message : e);
    return null;
  }
}

export default async function Home({ searchParams }: { searchParams: Promise<{ nap?: string; idoszak?: string }> }) {
  const session = await requireSession();

  // Akinek van "attekintes" (vezetői, mobilra tervezett csempés/tabsávos
  // nézet) joga, és éppen mobil eszközről jelentkezett be (proxy.ts a
  // User-Agent alapján állítja be a "wwp_device" sütit — lásd
  // lib/device.ts), azt bejelentkezés után rögtön az Áttekintésre
  // irányítjuk, akkor is, ha egyébként a teljes asztali modulrácshoz is
  // hozzáférése van — mobilon ez az ő kezdőképernyője, nem az Info.
  const isMobileDevice = (await cookies()).get("wwp_device")?.value === "mobile";
  if (isMobileDevice && session.can("attekintes").view) {
    // Szabinának a Posta a kezdőlapja (2026-10-04).
    redirect(getAttekintesProfil(session.name) === "szabina" ? "/attekintes/posta" : "/attekintes");
  }

  const visibleModules = MODULES.filter(
    (mod) => session.can(mod.key).view
  );

  // Aki egyelőre csak egy önálló, korlátozott nézethez (mobil összefoglaló,
  // posta vagy saját érkezés) kap jogot (egyik teljes modulhoz sincs
  // hozzáférése), azt bejelentkezés után rögtön oda irányítjuk — neki ez a
  // kezdőlap üres modul-rácsot mutatna.
  if (visibleModules.length === 0) {
    // Irodai (elszámolás) fiók — Szabina: az új mobil Posta, ahol csak a
    // kiszámlázott fuvarok látszanak (a régi /posta a számlázatlanokat is mutatta).
    if (session.can("elszamolas").view) redirect(session.can("attekintes").view ? "/attekintes/posta" : "/m/posta");
    if (session.can("erkezes").view) redirect("/erkezes");
    if (session.can("felvasarlas_mobil").view) redirect("/felvasarlas");
    // Ha egyik nézet sem elérhető, kijelentkeztess (nincs hozzáférés)
    redirect("/login");
  }

  // Napi napló (C6 terv, 2026-10-17): a kezdőlap teteje. Minden blokk csak
  // annak látszik, akinek az adott modulhoz joga van.
  const sp = await searchParams;
  const latKeszlet = session.can("keszlet").view;
  const latFuvar = session.can("fuvarozas").view || session.can("elszamolas").view;
  const latSzamla = session.can("szamlak").view;
  const latJelenlet = session.can("jelenlet").view || session.can("dolgozok").view;
  let naplo: NapiNaploAdat | null = null;
  if (latKeszlet || latFuvar || latSzamla || latJelenlet) {
    const h = await naploHatarok(sp.nap, sp.idoszak);
    let kimutatasHiba: string | null = null;
    const [felvasarlas, telepek, kimutatas, penz, szamlak, feladatok, szabadsagok] = await Promise.all([
      latKeszlet ? biztos("felvásárlás", () => getFelvasarlasNaplo(h)) : null,
      latKeszlet ? biztos("telepek", () => getTelepekNaplo(h)) : null,
      latFuvar
        ? getKimutatas(h.idoszak, h.nap).catch((e) => {
            kimutatasHiba = e instanceof Error ? e.message : "ismeretlen hiba";
            console.error("[napló] kimutatás:", kimutatasHiba);
            return null;
          })
        : null,
      latFuvar ? biztos("pénz-lista", () => getPenzLista("teendo", false)) : null,
      latSzamla ? biztos("számlák", () => getSzamlaNaplo(h)) : null,
      latJelenlet ? biztos("feladatok", () => getNyitottFeladatok(h)) : null,
      latJelenlet ? biztos("szabadság", () => getSzabadsagok(h)) : null,
    ]);
    naplo = { h, felvasarlas, telepek, kimutatas, kimutatasHiba, penz, szamlak, feladatok, szabadsagok };
  }

  return (
    <div className="flex flex-col gap-6">
      {naplo ? <NapiNaplo {...naplo} /> : null}

      <PageHeader
        title="Info"
        subtitle="Well-Worn Pallet Kft. — a rendszer áttekintése és gyorslinkek a modulokhoz"
      />

      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            Cégadatok
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="font-medium">Well-Worn Pallet Kft.</div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            Telephelyek: {SITES.join(" · ")}
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Modulok
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleModules.map((mod) => {
            const Icon = mod.icon;
            return (
              <Link key={mod.key} href={mod.href} className="group block">
                <Card className="h-full transition-colors group-hover:ring-foreground/20">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        {mod.label}
                      </span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <p className="text-sm text-muted-foreground">
                      {mod.description}
                    </p>
                    <ModuleStatusBadge status={mod.status} />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {(session.can("fuvarozas").view || session.can("elszamolas").view) && (
          <Link
            href="/m/posta"
            className="flex items-center gap-2 self-start rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            <Mail className="h-3.5 w-3.5" />
            Posta nézet (kiszámlázott bér fuvarok postázásra várva)
          </Link>
        )}
      </div>
    </div>
  );
}
