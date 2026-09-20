import { PageHeader } from "@/components/layout/page-header";
import { requireSession } from "@/lib/auth/dal";
import { getLevelek, getFigyeloAllapot, getTakarithatoDb } from "@/lib/fuvarozas2/levelek";
import { TEENDO_OSZTALYOK } from "@/lib/fuvarozas2/level-osztalyozo";
import { Fuvarozas2Fulek } from "@/components/fuvarozas2/fulek";
import { LevelekNezet } from "@/components/fuvarozas2/levelek";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ szuro?: string }> }) {
  const sp = await searchParams;
  const szuro = sp.szuro ?? "teendo";
  const session = await requireSession();
  const [levelek, allapot, takarithato] = await Promise.all([
    getLevelek(
      szuro === "teendo" ? { allapot: "uj", osztalyok: [...TEENDO_OSZTALYOK] }
      : szuro === "uj" ? { allapot: "uj" }
      : szuro === "megbizas" ? { osztalyok: ["megbizas"] }
      : {}
    ),
    getFigyeloAllapot(),
    getTakarithatoDb(),
  ]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Fuvarozás 2 · Levelek" subtitle="A beérkező levelek osztályozva: megbízás → Drive → import; a többi teendőként. A levelek törzse nem hagyja el a postafiókot." />
      <Fuvarozas2Fulek aktiv="/fuvarozas2/levelek" />
      <LevelekNezet
        levelek={levelek}
        allapot={allapot}
        szerkeszthet={session.can("fuvarozas").edit || session.can("elszamolas").edit}
        aktivSzuro={szuro}
        takarithato={takarithato}
      />
    </div>
  );
}
