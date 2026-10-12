import { getMaVaszon } from "@/lib/fuvarozas2/ma-vaszon";
import { Fuvarozas2Fulek } from "@/components/fuvarozas2/fulek";
import { MaVaszonNezet } from "@/components/fuvarozas2/ma-vaszon";
import { MaEloNezet } from "@/components/fuvarozas2/ma-elo";

export const dynamic = "force-dynamic";

export default async function Page() {
  const adat = await getMaVaszon();
  return (
    <div className="flex flex-col gap-3">
      <Fuvarozas2Fulek aktiv="/fuvarozas2" cim="Ma" />
      <MaEloNezet adat={adat} />
      {/* A régi Ma-vászon összecsukva; a heti rács nélkül (2026-10-12: a hét fő helye a Tervezés → A hét). */}
      <details className="rounded-lg border bg-card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-muted-foreground">Részletek: megállók, csempék</summary>
        <div className="border-t p-3">
          <MaVaszonNezet adat={adat} sajatFrissito={false} hetRacs={false} />
        </div>
      </details>
    </div>
  );
}
