import { getMegbizasok } from "@/lib/fuvarozas2/megbizasok";
import { SzamlaLista } from "@/components/m/iroda";

export const dynamic = "force-dynamic";

export default async function Page() {
  const sorok = await getMegbizasok({ jelleg: "ber", allapotok: ["teljesitve", "szamlazhato"], limit: 200 });
  return <SzamlaLista szamlazando={sorok} />;
}
