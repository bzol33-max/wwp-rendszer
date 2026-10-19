// Partner-törzs automatikus kitöltése — a futtató (lásd partner-kitoltes-alap.ts).
//
// Óránként a modell-szinkron körrel fut (a PDF-kiolvasás után), és a
// Partnerek fülön a „Hiányzók kitöltése” gombbal kézzel is. Csak üres mezőt ír
// (a `where <mező> is null` feltétel a párhuzamos kézi szerkesztést is véd).
// A négy javaslat-mezőnél (postacím, e-mail, két határidő) a felhasznált
// javaslat „elfogadva”, a mező többi nyitott javaslata „elvetve” lesz —
// így a fülön csak a valóban eldöntendő esetek maradnak.
//
// NEM "use server" fájl: az ütemező és a partnerek.ts szerver-akció hívja.

import { pool, query } from "@/lib/db";
import { JAVASLAT_MEZOK } from "@/lib/fuvarozas2/partner-javaslat-alap";
import { kitoltesTerv, type Kitoltes, type KitoltesJavaslat, type KitoltesPartner, type KitoltesSzamla } from "@/lib/fuvarozas2/partner-kitoltes-alap";

export type KitoltesEredmeny = { partner: number; mezo: number; reszletek: { partner: string; mezok: Kitoltes[] }[] };

export async function futtatPartnerKitoltest(ki = "automatikus kitöltés"): Promise<KitoltesEredmeny> {
  const [partnerek, szamlak, javaslatok] = await Promise.all([
    query<KitoltesPartner>(
      `select id::text, nev, nevvaltozatok, adoszam, szamlazasi_cim, postazasi_cim, szamlazasi_email,
         fizetesi_hatarido_nap, papir_bekuldesi_hatarido_nap, posta_nem_kell, szamla_email_nem_kell
       from fuvar_partnerek`
    ),
    query<KitoltesSzamla>(
      `select szamlaszam, vevo_nev, to_char(kiallitas_datum, 'YYYY-MM-DD') as kiallitas_datum,
         to_char(fizetesi_hatarido, 'YYYY-MM-DD') as fizetesi_hatarido, raw_xml
       from szamla where not sztorno and raw_xml is not null`
    ),
    query<KitoltesJavaslat & { partner_id: string }>(
      `select partner_id::text, mezo, ertek, forras, forras_leiras from fuvar_partner_javaslat where allapot = 'nyitott'`
    ).catch(() => []),
  ]);

  const eredmeny: KitoltesEredmeny = { partner: 0, mezo: 0, reszletek: [] };
  for (const p of partnerek) {
    const terv = kitoltesTerv(p, szamlak, javaslatok.filter((j) => j.partner_id === p.id));
    if (terv.length === 0) continue;
    const irt = await alkalmaz(p.id, terv, ki);
    if (irt.length === 0) continue;
    eredmeny.partner++;
    eredmeny.mezo += irt.length;
    eredmeny.reszletek.push({ partner: p.nev, mezok: irt });
  }
  return eredmeny;
}

async function alkalmaz(partnerId: string, terv: Kitoltes[], ki: string): Promise<Kitoltes[]> {
  const irt: Kitoltes[] = [];
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const k of terv) {
      // A mezőnév a KITOLTHETO_MEZOK listából jön (kitoltesTerv), nem felhasználói bemenet.
      const r = await client.query(`update fuvar_partnerek set ${k.mezo} = $2, frissitve_at = now() where id = $1 and ${k.mezo} is null`, [partnerId, k.ertek]);
      if (!r.rowCount) continue;
      irt.push(k);
      if ((JAVASLAT_MEZOK as readonly string[]).includes(k.mezo)) {
        await client.query(
          `insert into fuvar_partner_javaslat (partner_id, mezo, ertek, forras, forras_leiras, allapot, dontes_at, dontes_by)
           values ($1, $2, $3, $4, $5, 'elfogadva', now(), $6)
           on conflict (partner_id, mezo, ertek) do update set allapot = 'elfogadva', dontes_at = now(), dontes_by = excluded.dontes_by`,
          [partnerId, k.mezo, String(k.ertek), k.forras, k.leiras, ki]
        );
        await client.query(
          `update fuvar_partner_javaslat set allapot = 'elvetve', dontes_at = now(), dontes_by = $3
           where partner_id = $1 and mezo = $2 and allapot = 'nyitott'`,
          [partnerId, k.mezo, ki]
        );
      }
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return irt;
}
