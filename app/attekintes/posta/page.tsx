import { requireSession } from "@/lib/auth/dal";
import { getSzamlaPostaFuvarok } from "@/lib/fuvarozas/megbizasok";
import { PostaLista } from "@/components/posta/posta-lista";

export default async function AttekintesPostaPage() {
  const session = await requireSession();
  const showPosta = session.can("fuvarozas").view || session.can("posta").view;

  const rows = showPosta ? await getSzamlaPostaFuvarok() : [];

  return (
    <div className="flex flex-col gap-4 py-4">
      <div>
        <h1 className="text-base font-semibold">Posta</h1>
        <p className="text-xs text-[var(--at-muted)]">Bér fuvarok — postázásra várnak</p>
      </div>

      {!showPosta ? (
        <p className="text-sm text-[var(--at-muted)]">Nincs jogosultságod ehhez a nézethez.</p>
      ) : (
        <PostaLista initialRows={rows} />
      )}
    </div>
  );
}
