import { getMegbizasok } from "@/lib/fuvarozas2/megbizasok";
import { PapirLista } from "@/components/m/iroda";

export const dynamic = "force-dynamic";

export default async function Page() {
  const sorok = await getMegbizasok({
    jelleg: "ber",
    allapotok: ["teljesitve", "szamlazhato", "szamlazva", "email_elment"],
    limit: 200,
  });
  return <PapirLista sorok={sorok.filter((s) => !s.papirok_beerkeztek_at)} />;
}
