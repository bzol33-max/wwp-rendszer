import Link from "next/link";
import { ArrowLeft, LogOut } from "lucide-react";
import { requireSession } from "@/lib/auth/dal";
import { getSzamlaPostaFuvarok } from "@/lib/fuvarozas/megbizasok";
import { RefreshButton } from "@/components/mobil/refresh-button";
import { PostaLista } from "@/components/posta/posta-lista";
import { logout } from "@/lib/auth/actions";

export default async function PostaPage() {
  const session = await requireSession();
  // A "posta" jog önmagában is feljogosít a Bér fuvarok Számla/Posta
  // listájának megtekintésére és a "Postázva" jelölésre — ez egy
  // szándékosan önálló, korlátozott nézet, független attól, hogy a
  // felhasználó a teljes Fuvarozás modulhoz hozzáfér-e (ld. lib/auth/
  // permissions.ts OPT_IN_MODULES).
  const showPosta = session.can("fuvarozas").view || session.can("posta").view;

  const rows = showPosta ? await getSzamlaPostaFuvarok() : [];

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 bg-muted/40 px-4 py-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <Link href="/" className="flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Rendszer
        </Link>
        <form action={logout}>
          <button type="submit" className="flex items-center gap-1 hover:text-foreground">
            <LogOut className="h-3.5 w-3.5" />
            Kijelentkezés
          </button>
        </form>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">Posta</h1>
          <p className="text-xs text-muted-foreground">Bér fuvarok — postázásra várnak</p>
        </div>
        <RefreshButton />
      </div>

      {!showPosta ? (
        <p className="text-sm text-muted-foreground">
          Nincs jogosultságod ehhez a nézethez.
        </p>
      ) : (
        <PostaLista initialRows={rows} />
      )}
    </div>
  );
}
