import { getMegbizasok } from "@/lib/fuvarozas2/megbizasok";
import { PostaLista } from "@/components/m/iroda";

export const dynamic = "force-dynamic";

export default async function Page() {
  // Csak a ténylegesen kiszámlázott (számlaszámos) fuvar — számla nélkül nincs mit postázni.
  const sorok = (await getMegbizasok({ jelleg: "ber", allapotok: ["szamlazva", "email_elment"], limit: 200 })).filter((s) => !!s.szamla_szam);
  return <PostaLista sorok={sorok} />;
}
