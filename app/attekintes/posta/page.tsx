import { getMegbizasok } from "@/lib/fuvarozas2/megbizasok";
import { budapestNapISO } from "@/lib/fuvarozas/idozona";
import { PostaKartyak } from "@/components/attekintes/posta-kartyak";

export const dynamic = "force-dynamic";

// Szabina Posta lapja (2026-10-04): a kiszámlázott, postázásra váró bér
// fuvarok — kipipálva bezöldül, egy perc múlva az archívba (lezárt) kerül.
// Alul a ma már postázottak. Az állapotváltás ugyanaz, mint az /m/posta
// „Feladva ✓” gombjánál (valtAllapot → postazva, ugyanott lezárva).
export default async function PostaPage() {
  const [varnak, lezartak] = await Promise.all([
    getMegbizasok({ jelleg: "ber", allapotok: ["szamlazva", "email_elment"], limit: 200 }),
    getMegbizasok({ jelleg: "ber", allapotok: ["postazva", "lezart"], limit: 200 }),
  ]);
  const ma = budapestNapISO();
  const maPostazott = lezartak.filter((s) => s.postazva_at && budapestNapISO(new Date(s.postazva_at)) === ma);
  return <PostaKartyak varnak={varnak.filter((s) => !!s.szamla_szam)} maPostazott={maPostazott} />;
}
