"use server";

// Számlázási segéd — a „Számlázok” gomb mögötti adatgyűjtés. (2026-10-11)
// Forrás mezőnként: vevő → partner-törzs, hiányában a partner legutóbbi
// kimenő számlája (szamla.raw_xml, Számlázz.hu-szinkron); útvonal, díj,
// teljesítés → a megbízás és a megállók (GPS / sofőr); rendelésszám → a
// megbízás hivatkozásai, végül a megbízó levelének tárgya (fuvar_level);
// fizetési határidő és e-mail → partner-törzs, majd a legutóbbi számla.
// Csak olvas; a kiállítás után a számlaszámot a meglévő setSzamlaSzam írja.

import { query } from "@/lib/db";
import { requireAnyViewPermission } from "@/lib/auth/require-permission";
import { getMegbizas } from "@/lib/fuvarozas2/megbizasok";
import { partnerEgyezik } from "@/lib/fuvarozas/szamla-parositas";
import { budapestNapISO } from "@/lib/fuvarozas/idozona";
import {
  cimBontas, ellenorzesek, fuvarMegnevezes, huDatum, napHozzaad, napKulonbseg, osszegek, penznemKod, szamSzoveg,
  valasztRendelesszam, vevoXmlbol, type Ellenorzes, type Rendelesszam,
} from "@/lib/fuvarozas2/szamlazasi-seged-alap";

export type SzamlazasiSeged = {
  megbizasId: string;
  fejlec: string;
  vevo: { nev: string | null; irsz: string | null; telepules: string | null; cim: string | null; adoszam: string | null; euAdoszam: string | null; forras: string };
  fizetesiMod: string;
  rendelesszam: Rendelesszam;
  teljesites: string | null;
  kiallitas: string;
  hatarido: string | null;
  hataridoNap: number;
  hataridoForras: string;
  megnevezes: string;
  reszlet: string | null;
  mennyiseg: number;
  egyseg: string;
  egysegar: string | null;
  penznem: string;
  afaKulcs: number;
  osszeg: { netto: string; afa: string; brutto: string } | null;
  devizas: boolean;
  email: string | null;
  emailForras: string | null;
  cmrDb: number;
  /** Az eredeti papír nyugtázva — hiánya csak figyelmeztetés (2026-10-11). */
  papirMegvan: boolean;
  ellenorzes: Ellenorzes[];
  kiallithato: boolean;
  elozoSzamla: { szamlaszam: string; kiallitas: string } | null;
};

type PartnerSor = {
  nev: string; nevvaltozatok: string[]; adoszam: string | null; szekhely: string | null; szamlazasi_cim: string | null;
  szamlazasi_email: string | null; fizetesi_hatarido_nap: number | null; szamlan_kert_szam: "pozicioszam" | "reise_id" | "hivatkozas" | null;
  hivatkozas_formatum: string | null; sablon_azonosito: string | null;
};
type SzamlaSor = { szamlaszam: string; vevo_nev: string; rendelesszam: string | null; kiallitas_datum: string; fizetesi_hatarido: string | null; raw_xml: string | null };

export async function getSzamlazasiSeged(id: string): Promise<SzamlazasiSeged | null> {
  await requireAnyViewPermission(["fuvarozas", "elszamolas"]);
  const adat = await getMegbizas(id);
  if (!adat || adat.sor.jelleg !== "ber") return null;
  const { sor, megallok, dokumentumok } = adat;

  const [extra] = await query<{ pozicioszam: string | null; reise_id: string | null; hivatkozas_kanonikus: string | null; hivatkozas_masodlagos: string | null; szamlazasi_email: string | null; felrakas_nap: string | null }>(
    `select m.pozicioszam, m.reise_id, m.hivatkozas_kanonikus, m.hivatkozas_masodlagos, e.szamlazasi_email,
            to_char(m.datum, 'YYYY-MM-DD') as felrakas_nap
     from fuvar_megbizasok m left join fuvar_elszamolas e on e.megbizas_id = m.id where m.id = $1`,
    [id]
  );
  const [partner] = sor.partner_id
    ? await query<PartnerSor>(
        `select nev, nevvaltozatok, adoszam, szekhely, szamlazasi_cim, szamlazasi_email, fizetesi_hatarido_nap,
                szamlan_kert_szam, hivatkozas_formatum, sablon_azonosito
         from fuvar_partnerek where id = $1`,
        [sor.partner_id]
      )
    : [];
  const nevek = [partner?.nev, ...(partner?.nevvaltozatok ?? []), sor.partner_nev].filter((x): x is string => !!x);

  // A partner legutóbbi (nem sztornó) fuvarszámlája — a vevő pontos neve,
  // címe, adószáma és a szokásos határidő / rendelésszám innen jön.
  const szamlak = nevek.length
    ? await query<SzamlaSor>(
        `select szamlaszam, vevo_nev, rendelesszam, to_char(kiallitas_datum, 'YYYY-MM-DD') as kiallitas_datum,
                to_char(fizetesi_hatarido, 'YYYY-MM-DD') as fizetesi_hatarido, raw_xml
         from szamla where kategoria = 'fuvar' and not sztorno and not sztornozva
         order by kiallitas_datum desc, id desc limit 400`
      ).catch(() => [] as SzamlaSor[])
    : [];
  const elozo = szamlak.find((s) => partnerEgyezik(s.vevo_nev, nevek)) ?? null;
  const xmlVevo = vevoXmlbol(elozo?.raw_xml ?? null);

  // Vevő: a legutóbbi számla adatai a pontos írásmódhoz; hiányzó mezőt a partner-törzs pótol.
  const torzsCim = cimBontas(partner?.szamlazasi_cim ?? partner?.szekhely ?? null);
  const vevo = {
    nev: xmlVevo.nev ?? elozo?.vevo_nev ?? partner?.nev ?? sor.partner_nev,
    irsz: xmlVevo.irsz ?? torzsCim.irsz,
    telepules: xmlVevo.telepules ?? torzsCim.telepules,
    cim: xmlVevo.cim ?? torzsCim.cim,
    adoszam: partner?.adoszam ?? xmlVevo.adoszam,
    euAdoszam: xmlVevo.euAdoszam,
    forras: elozo ? `a legutóbbi számla (${elozo.szamlaszam}) és a partner-törzs` : "a partner-törzs",
  };

  // Rendelésszám: a megbízásból, végül a megbízó levelének tárgyából.
  let levelbol: string | null = null;
  const vanMegbizason = [extra?.reise_id, extra?.hivatkozas_kanonikus, extra?.pozicioszam, extra?.hivatkozas_masodlagos].some((x) => x?.trim());
  if (!vanMegbizason && !sor.hivatkozas_nincs) {
    const [lev] = await query<{ hivatkozas: string }>(
      `select hivatkozas from fuvar_level
       where hivatkozas is not null and hivatkozas <> ''
         and (megbizas_id = $1
              or ($2::bigint is not null and partner_id = $2::bigint and $3::date is not null
                  and erkezett between $3::date - interval '4 days' and $3::date + interval '1 day'))
       order by (megbizas_id = $1) desc, erkezett desc limit 1`,
      [id, sor.partner_id, extra?.felrakas_nap ?? sor.felrakas_nap]
    ).catch(() => [] as { hivatkozas: string }[]);
    levelbol = lev?.hivatkozas ?? null;
  }
  const rendelesszam = valasztRendelesszam({
    hivatkozasKanonikus: extra?.hivatkozas_kanonikus ?? null,
    pozicioszam: extra?.pozicioszam ?? null,
    reiseId: extra?.reise_id ?? null,
    hivatkozasMasodlagos: extra?.hivatkozas_masodlagos ?? null,
    hivatkozasNincs: sor.hivatkozas_nincs,
    szamlanKertSzam: partner?.szamlan_kert_szam ?? null,
    formatum: partner?.hivatkozas_formatum ?? null,
    levelbol,
    elozoSzamlanVolt: !!elozo?.rendelesszam?.trim(),
    kotelezoSablon: partner?.sablon_azonosito === "duvenbeck" || partner?.szamlan_kert_szam === "reise_id",
  });

  // Teljesítés: az utolsó lerakó tényleges ideje (GPS / sofőr), különben a lerakás napja.
  const lerakok = megallok.filter((m) => m.tipus === "lerako");
  const utolsoLe = lerakok[lerakok.length - 1];
  const tenyIdo = utolsoLe?.gps_erkezes ?? utolsoLe?.sofor_kesz_at ?? null;
  const teljesites = tenyIdo ? budapestNapISO(new Date(tenyIdo)) : (sor.lerakas_nap ?? sor.felrakas_nap ?? null);
  const kiallitas = budapestNapISO(new Date());

  // Határidő: partner-törzs → a megbízás pillanatképe → a legutóbbi számla → 30 nap.
  const elozoNap = elozo?.fizetesi_hatarido ? napKulonbseg(elozo.kiallitas_datum, elozo.fizetesi_hatarido) : null;
  const [hataridoNap, hataridoForras] =
    partner?.fizetesi_hatarido_nap != null ? [partner.fizetesi_hatarido_nap, "a partner-törzs"]
    : sor.fizetesi_hatarido_nap != null ? [sor.fizetesi_hatarido_nap, "a megbízás"]
    : elozoNap != null && elozoNap >= 0 ? [elozoNap, `a legutóbbi számla (${elozo!.szamlaszam})`]
    : [30, "alapérték"];

  const penznem = penznemKod(sor.fuvardij_penznem);
  const devizas = penznem !== "HUF";
  const ossz = sor.fuvardij != null ? osszegek(Number(sor.fuvardij), penznem) : null;
  const { megnevezes, reszlet } = fuvarMegnevezes(megallok, { felrako: sor.felrako, lerako: sor.lerako });

  const email = extra?.szamlazasi_email?.trim() || partner?.szamlazasi_email?.trim() || xmlVevo.email || null;
  const emailForras = extra?.szamlazasi_email?.trim() ? "a megbízás" : partner?.szamlazasi_email?.trim() ? "a partner-törzs" : xmlVevo.email ? `a legutóbbi számla (${elozo?.szamlaszam})` : null;
  const cmrDb = dokumentumok.filter((d) => d.tipus === "fuvarlevel").length;

  const ellenorzes = ellenorzesek({
    cmrDb, papirMegvan: !!sor.papirok_beerkeztek_at, fuvardij: sor.fuvardij != null ? Number(sor.fuvardij) : null, teljesites, kiallitas,
    vanSzamla: !!sor.szamla_szam, rendelesszam, vevoAdoszam: vevo.adoszam,
  });

  return {
    megbizasId: id,
    fejlec: [sor.partner_nev, [sor.felrako, sor.lerako].filter(Boolean).map((c) => (c ?? "").split(",")[0]).join(" → "), teljesites ? `teljesítve ${huDatum(teljesites)}` : null, sor.jarmu_kod].filter(Boolean).join(" · "),
    vevo,
    fizetesiMod: "átutalás",
    rendelesszam,
    teljesites: huDatum(teljesites),
    kiallitas: huDatum(kiallitas)!,
    hatarido: huDatum(napHozzaad(kiallitas, hataridoNap)),
    hataridoNap,
    hataridoForras,
    megnevezes,
    reszlet,
    mennyiseg: 1,
    egyseg: "db",
    egysegar: ossz ? String(ossz.netto).replace(".", ",") : null,
    penznem,
    afaKulcs: 27,
    osszeg: ossz ? { netto: szamSzoveg(ossz.netto, penznem), afa: szamSzoveg(ossz.afa, penznem), brutto: szamSzoveg(ossz.brutto, penznem) } : null,
    devizas,
    email,
    emailForras,
    cmrDb,
    papirMegvan: !!sor.papirok_beerkeztek_at,
    ellenorzes,
    kiallithato: !ellenorzes.some((e) => e.blokkol),
    elozoSzamla: elozo ? { szamlaszam: elozo.szamlaszam, kiallitas: huDatum(elozo.kiallitas_datum)! } : null,
  };
}
