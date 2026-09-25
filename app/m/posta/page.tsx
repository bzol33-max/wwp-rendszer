import { getMegbizasok } from "@/lib/fuvarozas2/megbizasok";
import { PostaLista } from "@/components/m/iroda";

export const dynamic = "force-dynamic";

export default async function Page() {
  const sorok = await getMegbizasok({ jelleg: "ber", allapotok: ["szamlazva", "email_elment"], limit: 200 });
  return <PostaLista sorok={sorok} />;
}
