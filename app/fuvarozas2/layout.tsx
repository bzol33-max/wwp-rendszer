import { requireSession } from "@/lib/auth/dal";
import { EditPermissionProvider } from "@/components/auth/edit-permission-context";

// A Fuvarozás 2 két jogkulccsal nyílik: a teljes modul ("fuvarozas") vagy
// az Elszámolás hatóköre ("elszamolas", Szabina) — a ModuleGate egy kulcsot
// tud, ezért itt a kettő együtt. A szerkesztési jog a kettő bármelyikéből.
export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const f = session.can("fuvarozas");
  const e = session.can("elszamolas");
  if (!f.view && !e.view) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-1 text-center">
        <p className="text-sm font-medium">Nincs jogosultságod ehhez a modulhoz.</p>
      </div>
    );
  }
  // A terv színei (.fuvarozas2 a globals.css-ben); a wrapper a main belső
  // paddingját ellensúlyozva a teljes tartalomterületet festi.
  return (
    <EditPermissionProvider canEdit={f.edit || e.edit}>
      <div className="fuvarozas2 -mx-4 -my-5 -mb-24 min-h-[calc(100vh-0px)] px-4 py-5 pb-24 md:-mx-8 md:-my-7 md:-mb-7 md:px-8 md:py-7 md:pb-7">
        {children}
      </div>
    </EditPermissionProvider>
  );
}
