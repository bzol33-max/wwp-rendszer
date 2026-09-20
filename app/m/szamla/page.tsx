import { getMegbizasok } from "@/lib/fuvarozas2/megbizasok";
import { SzamlaPostaLista } from "@/components/m/iroda";

export const dynamic = "force-dynamic";

export default async function Page() {
  const sorok = await getMegbizasok({
    jelleg: "ber",
    allapotok: ["szamlazhato", "szamlazva", "email_elment"],
    limit: 200,
  });
  return (
    <SzamlaPostaLista
      szamlazhato={sorok.filter((s) => s.allapot === "szamlazhato")}
      emailre={sorok.filter((s) => s.allapot === "szamlazva")}
      postazando={sorok.filter((s) => s.allapot === "email_elment" && !!s.papirok_beerkeztek_at)}
    />
  );
}
