import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/dal";
import { getMegbizasok } from "@/lib/fuvarozas2/megbizasok";
import { SzamlaLista } from "@/components/m/iroda";

export const dynamic = "force-dynamic";

// A még ki nem számlázott fuvarok — csak a teljes Fuvarozás-joggal. Az
// irodai (csak elszámolás) fiók mobilon kizárólag a kiszámlázottakat látja
// (Posta fül), ezért őt oda irányítjuk.
export default async function Page() {
  const session = await requireSession();
  if (!session.can("fuvarozas").view) redirect("/m/posta");
  const sorok = await getMegbizasok({ jelleg: "ber", allapotok: ["teljesitve", "szamlazhato"], limit: 200 });
  return <SzamlaLista szamlazando={sorok} />;
}
