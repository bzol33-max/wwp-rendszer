"use server";

// Fuvarozás 2 — a „Ma" képernyő a tervvászon (D1) szerint.
//
// Elrendezés (Budaházi Zoltán, 2026-09-28): négy kocsi-oszlop egymás
// mellett, mindegyik ugyanabban a sorrendben — hol van most (GPS), vezetési
// idő, a mostani megálló, a mai hátralévő megállók, a következő munkanap
// fuvarja, és ha hiányzik, a papír/számla. Fölötte csak akkor sáv, ha van
// eltérés; alatta a kocsi nélküli fuvarok és az iroda számai egy sorban.
//
// Honnan jön az adat:
//   • állapot, megbízás, megálló, ablak, várakozás → az ÚJ modell
//     (fuvar_megbizasok / fuvar_megallok) — egyetlen lekérdezés megállókra;
//   • élő ETA, vezetési idő, tervezetlen állás, sofőr gondjelzése →
//     getIdovonalak() (a meglévő GPS-lánc, nem duplikáljuk);
//   • kintlévőség → a Számlák modul nyitott számlái (ha a nézőnek van rá
//     joga; enélkül a csempe egyszerűen kimarad);
//   • heti vezetési idő → Ecofleet heti útjelentés (10 percig gyorsítótárazva).
//
// Minden becsült érték jelölve van a felületen (ETA, vezetési idő) — a
// tachográf a sofőrnél van, ez előrejelzés.

import { query } from "@/lib/db";
import { requireSession } from "@/lib/auth/dal";
import { requireAnyViewPermission } from "@/lib/auth/require-permission";
import { getIdovonalak } from "@/lib/fuvarozas/actions";
import { getSzamlaLista } from "@/lib/szamlak/actions";
import { szamlaHatralek } from "@/lib/szamlak/szamla-constants";
import { varosNev } from "@/lib/fuvarozas/varos";
import { getUtvonalJelentes, rendszamKulcs } from "@/lib/fuvarozas/ecofleet";
import { cachelve } from "@/lib/fuvarozas/idovonal-cache";
import { kovetkezoMunkanapISO } from "@/lib/fuvarozas/idozona";
import { SAJAT_JARMUVEK } from "@/lib/fuvarozas/vehicles";
import { kontaktNev, kontaktTelefon, megalloReszlete, type MegalloReszlet } from "@/lib/fuvarozas/sofor-adatok";
import type { Allapot } from "@/lib/fuvarozas/allapot";

export type CsempeSzin = "normal" | "amber" | "red" | "mint";
export type Csempe = { kulcs: string; cimke: string; ertek: string; also: string | null; szin: CsempeSzin; href: string | null };

export type Elteres = {
  kulcs: string;
  cim: string;
  badge: string;
  szin: "red" | "amber";
  sorok: string[];
  href: string | null;
};

export type MaMegalloSor = {
  tipus: "felrako" | "lerako" | "ejszaka";
  varos: string;
  allapot: string;
  ido: string;
  kiemelt: "kesik" | "varakozik" | null;
  kesz: boolean;
};

export type MaBlokk = {
  id: string;
  partner: string;
  hivatkozas: string | null;
  jelleg: "ber" | "sajat";
  utvonal: string;
  felrakasNap: string | null;
  lerakasNap: string | null;
  megallok: MaMegalloSor[];
};

/** A kocsi pillanatnyi helyzete a GPS-ből. */
export type MaKocsiAllapot = { szoveg: string; szin: "mint" | "amber" | "red" | "normal"; hely: string | null };

/** A soron következő (első nem kész) mai megálló. */
export type MaMost = {
  fuvarId: string;
  partner: string;
  tipus: "felrako" | "lerako";
  varos: string;
  cim: string;
  ceg: string | null;
  ablak: string | null;
  allapot: string;
  kiemelt: "kesik" | "varakozik" | null;
  /** „3/14" — hányadik megálló a fuvaron. */
  hanyadik: string;
  kontaktNev: string | null;
  telefon: string | null;
};

export type MaKocsi = {
  kod: string | null;
  cimke: string;
  sofor: string | null;
  /** Ha a kocsi még nem üzemel („gyártás alatt”, „még nincs beállítva”). */
  helykitolto: string | null;
  allapot: MaKocsiAllapot | null;
  /** „Vezetés ma 3:20 · szünet 1:10 múlva · szolgálat 05:41 óta" — becslés a GPS-ből. */
  vezetesSor: string | null;
  /** „Hét: 31 / 56 óra" — GPS-becslés. */
  hetiSor: string | null;
  napiKm: number | null;
  etaSor: string | null;
  most: MaMost | null;
  ma: MaBlokk[];
  /** A következő munkanap új fuvarjai (ami a maiból folytatódik, az a „ma” alatt van). */
  holnap: MaBlokk[];
  /** Igaz, ha egy mai fuvar a következő munkanapon is tart. */
  holnapFolytatodik: boolean;
  /** Hiányzó papír/számla ennél a kocsinál, pl. „2 fotó hiányzik”. */
  papir: { szoveg: string; href: string }[];
};

export type MaVaszon = {
  ma: string;
  holnap: string;
  /** „Holnap”, vagy pénteken/szombaton „Hétfő” (a következő munkanap). */
  holnapCimke: string;
  csempek: Csempe[];
  elteresek: Elteres[];
  kocsik: MaKocsi[];
  kocsiNelkul: { id: string; partner: string; utvonal: string; nap: string | null; allapot: Allapot }[];
  teendok: { cimke: string; ertek: string; also: string | null; href: string }[];
  holnapDoboz: { cimke: string; ertek: string; szin: CsempeSzin }[];
};

/** Ennyi oszlop van mindig (a még nem üzemelő kocsik helye is látszik). */
const KOCSI_OSZLOP = 4;

/** A Postgres „2026-09-20 07:00:00+00" alakját is érti (az órás offszetet kiegészíti percekkel). */
function idobelyeg(d: Date | string | null | undefined): Date | null {
  if (!d) return null;
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : d;
  let s = d.trim().replace(" ", "T");
  if (/[+-]\d{2}$/.test(s)) s += ":00";
  const t = new Date(s);
  return Number.isNaN(t.getTime()) ? null : t;
}
const ORA = (d: Date | string | null | undefined) => {
  const t = idobelyeg(d);
  return t ? t.toLocaleTimeString("hu-HU", { timeZone: "Europe/Budapest", hour: "2-digit", minute: "2-digit" }) : "—";
};
const percKulonbseg = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 60000);
const oraPerc = (perc: number) => `${Math.floor(perc / 60)}:${String(perc % 60).padStart(2, "0")}`;
const ft = (n: number) => `${new Intl.NumberFormat("hu-HU").format(Math.round(n))} Ft`;

type MegalloSor = {
  megbizas_id: string;
  sorszam: number;
  tipus: "felrako" | "lerako";
  cim_nyers: string;
  telepules: string | null;
  ablak_tol: string | null;
  ablak_ig: string | null;
  gps_erkezes: string | null;
  gps_tavozas: string | null;
  sofor_kesz_at: string | null;
  varakozas_kezdete: string | null;
  varakozas_vege: string | null;
};

export async function getMaVaszon(): Promise<MaVaszon> {
  await requireAnyViewPermission(["fuvarozas", "elszamolas"]);
  const session = await requireSession();
  const most = new Date();

  const [{ ma, naptariHolnap }] = await query<{ ma: string; naptariHolnap: string }>(
    `select ((now() at time zone 'Europe/Budapest')::date)::text as ma, ((now() at time zone 'Europe/Budapest')::date + 1)::text as "naptariHolnap"`
  );
  // A „holnap” a következő munkanap: pénteken és szombaton a hétfő.
  const holnap = kovetkezoMunkanapISO(ma);
  const holnapCimke = holnap === naptariHolnap ? "Holnap" : "Hétfő";

  // 1. A nyitott megbízások (ma és holnap) kocsival, partnerrel.
  const sorok = await query<{
    id: string; allapot: Allapot; jelleg: "ber" | "sajat"; partner: string | null; hivatkozas: string | null;
    jarmu_kod: string | null; jarmu_cimke: string | null; sofor: string | null;
    felrakas_nap: string | null; lerakas_nap: string | null; hianylista: unknown[]; felrako: string | null; lerako: string | null;
    megallo_reszletek: MegalloReszlet[] | null;
  }>(
    `select m.id::text, m.allapot, m.jelleg, coalesce(p.nev, m.megrendelo) as partner,
       coalesce(m.hivatkozas_kanonikus, m.pozicioszam, m.reise_id) as hivatkozas,
       j.kod as jarmu_kod, coalesce(j.cimke, m.jarmu) as jarmu_cimke, coalesce(a.name, m.sofor) as sofor,
       to_char(m.datum, 'YYYY-MM-DD') as felrakas_nap,
       to_char(coalesce(m.lerakas_datum, m.datum), 'YYYY-MM-DD') as lerakas_nap,
       m.hianylista, m.felrako, m.lerako, m.megallo_reszletek
     from fuvar_megbizasok m
     left join fuvar_partnerek p on p.id = m.partner_id
     left join fuvar_jarmuvek j on j.id = m.jarmu_id
     left join alkalmazottak a on a.id = m.sofor_id
     where m.torolt_at is null and m.allapot in ('ellenorzesre_var','tervezett','folyamatban')
       and coalesce(m.lerakas_datum, m.datum) >= $1::date - 3 and m.datum <= $2::date
     order by m.datum, m.id`,
    [ma, holnap]
  );

  const megallok = sorok.length
    ? await query<MegalloSor>(
        `select megbizas_id::text, sorszam, tipus, cim_nyers, telepules,
           ablak_tol::text, ablak_ig::text, gps_erkezes::text, gps_tavozas::text,
           sofor_kesz_at::text, varakozas_kezdete::text, varakozas_vege::text
         from fuvar_megallok where megbizas_id = any($1::bigint[]) order by megbizas_id, sorszam`,
        [sorok.map((s) => s.id)]
      )
    : [];
  const megalloMap = new Map<string, MegalloSor[]>();
  for (const g of megallok) {
    const lista = megalloMap.get(g.megbizas_id) ?? [];
    lista.push(g);
    megalloMap.set(g.megbizas_id, lista);
  }

  // 2. Élő réteg: ETA, vezetési idő, tervezetlen állás, sofőr gondjelzése.
  const idovonal = await getIdovonalak().catch(() => null);

  // 3. Kocsik az új törzsből.
  const osszesJarmu = await query<{ id: string; kod: string; cimke: string; sofor: string | null; ecofleet_object_id: string | null; vontato_rendszam: string | null }>(
    `select j.id::text, j.kod, j.cimke, a.name as sofor, j.ecofleet_object_id, j.vontato_rendszam from fuvar_jarmuvek j
     left join alkalmazottak a on a.id = j.sofor_id
     where j.aktiv order by j.id`
  );
  const jarmuvek = osszesJarmu.filter((j) => j.ecofleet_object_id);

  const aznap = (s: { felrakas_nap: string | null; lerakas_nap: string | null }, nap: string) =>
    (s.felrakas_nap ?? "") <= nap && (s.lerakas_nap ?? s.felrakas_nap ?? "") >= nap;

  // ---------------------------------------------------------------- eltérések
  const elteresek: Elteres[] = [];

  for (const s of sorok) {
    const gs = megalloMap.get(s.id) ?? [];
    const kocsiCimke = s.jarmu_cimke ?? "kocsi nélkül";
    const ki = [kocsiCimke, s.sofor].filter(Boolean).join(" · ");

    // 2a. Nyitott várakozás — 45 perc felett a legtöbb megbízónál pótdíjas.
    for (const g of gs) {
      if (!g.varakozas_kezdete || g.varakozas_vege) continue;
      const perc = percKulonbseg(most, idobelyeg(g.varakozas_kezdete)!);
      if (perc < 15) continue;
      elteresek.push({
        kulcs: `var-${s.id}-${g.sorszam}`,
        cim: `${ki} · ${varosNev(g.cim_nyers) ?? g.cim_nyers} ${g.tipus === "felrako" ? "felrakó" : "lerakó"}`,
        badge: `várakozik ${perc} p`,
        szin: perc >= 45 ? "red" : "amber",
        sorok: [
          `${s.partner ?? "(nincs megbízó)"}${s.hivatkozas ? ` · ${s.hivatkozas}` : ""} · rakodás ${ORA(g.varakozas_kezdete)} óta`,
          perc >= 45 ? "Pótdíjas várakozás 45 perc felett — jelezd a megbízónak." : "A sofőr várakozást jelölt.",
        ],
        href: `/fuvarozas2/megbizasok/${s.id}`,
      });
    }

    // 2b. Késés az időablakhoz képest: a még nyitott megálló ablaka lejárt.
    for (const g of gs) {
      const kesz = !!(g.gps_tavozas || g.sofor_kesz_at);
      if (kesz || !g.ablak_ig) continue;
      const ig = idobelyeg(g.ablak_ig);
      if (!ig) continue;
      if (ig >= most) continue;
      const perc = percKulonbseg(most, ig);
      elteresek.push({
        kulcs: `kes-${s.id}-${g.sorszam}`,
        cim: `${ki} · ${varosNev(g.cim_nyers) ?? g.cim_nyers} ${g.tipus === "felrako" ? "felrakó" : "lerakó"}`,
        badge: `késés ${perc >= 60 ? `${oraPerc(perc)} ó` : `${perc} p`}`,
        szin: perc >= 60 ? "red" : "amber",
        sorok: [
          `${s.partner ?? "(nincs megbízó)"}${s.hivatkozas ? ` · ${s.hivatkozas}` : ""}`,
          `Ablak ${ORA(g.ablak_tol)}–${ORA(g.ablak_ig)} — a megálló még nincs lezárva.`,
        ],
        href: `/fuvarozas2/megbizasok/${s.id}`,
      });
    }

    // 2c. Ellenőrzésre váró import hiányzó adatokkal.
    if (s.allapot === "ellenorzesre_var") {
      const hiany = (s.hianylista ?? []).map((h) => String(h));
      elteresek.push({
        kulcs: `ell-${s.id}`,
        cim: `${s.partner ?? "(nincs megbízó)"}${s.hivatkozas ? ` · ${s.hivatkozas}` : ""}`,
        badge: hiany.length > 0 ? "hiányos import" : "jóváhagyásra vár",
        szin: "amber",
        sorok: [
          hiany.length > 0 ? `Hiányzik: ${hiany.join(", ")}` : "Az import beolvasta, de még senki nem hagyta jóvá.",
          `${s.felrako ?? "—"} → ${s.lerako ?? "—"}${s.jarmu_kod ? "" : " · nincs kocsi"}`,
        ],
        href: `/fuvarozas2/megbizasok/${s.id}`,
      });
    }

    // 2d. Csúszó fuvar: a lerakás napja elmúlt, de még nyitott.
    if ((s.allapot === "folyamatban" || s.allapot === "tervezett") && (s.lerakas_nap ?? "") < ma) {
      elteresek.push({
        kulcs: `csu-${s.id}`,
        cim: `${ki} · ${s.partner ?? "(nincs megbízó)"}`,
        badge: "csúszik",
        szin: "red",
        sorok: [`Lerakás napja: ${s.lerakas_nap ?? "—"} — a fuvar még nyitott.`, `${s.felrako ?? "—"} → ${s.lerako ?? "—"}`],
        href: `/fuvarozas2/megbizasok/${s.id}`,
      });
    }
  }

  // 2e. Sofőr gondjelzései és tervezetlen állások az élő rétegből.
  for (const j of idovonal?.jarmuvek ?? []) {
    for (const blokk of j.fuvarok) {
      for (const gond of blokk.gondok ?? []) {
        if (!gond.nyitott) continue;
        elteresek.push({
          kulcs: `gond-${blokk.fuvarId}-${gond.mikor.getTime()}`,
          cim: `${gond.nev} · gondot jelzett`,
          badge: "gond van",
          szin: "red",
          sorok: [gond.szoveg, `${blokk.megrendelo ?? ""}${blokk.pozicioszam ? ` · ${blokk.pozicioszam}` : ""}`.trim() || "—"],
          href: `/fuvarozas2/megbizasok/${blokk.fuvarId}`,
        });
      }
    }
    for (const allas of j.nemTervezettAllasok ?? []) {
      if (allas.percek < 30) continue;
      elteresek.push({
        kulcs: `allas-${j.sofor}-${allas.kezdet.getTime()}`,
        cim: `${j.sofor} · nem tervezett állás`,
        badge: `${allas.percek} p`,
        szin: "amber",
        sorok: [`${allas.cim ?? "ismeretlen hely"} · ${ORA(allas.kezdet)}–${ORA(allas.veg)}`, "Nem fel-/lerakó cím közelében állt."],
        href: null,
      });
    }
  }

  // ---------------------------------------------------------------- csempék
  const [elsz] = await query<{ fotora: number; szamlazhato: number; szamlazhato_ft: number; postazando: number }>(
    `select
       count(*) filter (where m.allapot = 'teljesitve')::int as fotora,
       count(*) filter (where m.allapot in ('teljesitve','szamlazhato'))::int as szamlazhato,
       coalesce(sum(m.fuvardij) filter (where m.allapot in ('teljesitve','szamlazhato') and m.fuvardij_penznem = 'Ft'), 0)::int as szamlazhato_ft,
       count(*) filter (where m.allapot in ('szamlazva','email_elment'))::int as postazando
     from fuvar_megbizasok m where m.torolt_at is null and m.jelleg = 'ber'`
  );

  const papir = await query<{ id: string; partner: string | null; hivatkozas: string | null; hatarido_nap: number | null; lerakas: string | null }>(
    `select m.id::text, coalesce(p.nev, m.megrendelo) as partner,
       coalesce(m.hivatkozas_kanonikus, m.pozicioszam, m.reise_id) as hivatkozas,
       coalesce(p.papir_bekuldesi_hatarido_nap, 7) as hatarido_nap,
       to_char(coalesce(m.lerakas_datum, m.datum), 'YYYY-MM-DD') as lerakas
     from fuvar_megbizasok m
     left join fuvar_partnerek p on p.id = m.partner_id
     left join fuvar_elszamolas e on e.megbizas_id = m.id
     where m.torolt_at is null and m.jelleg = 'ber'
       and m.allapot in ('szamlazva','email_elment')
     order by coalesce(m.lerakas_datum, m.datum)`
  );
  const papirHatra = (r: { hatarido_nap: number | null; lerakas: string | null }) => {
    if (!r.lerakas) return null;
    const hatar = new Date(`${r.lerakas}T12:00:00Z`);
    hatar.setUTCDate(hatar.getUTCDate() + (r.hatarido_nap ?? 7));
    return Math.round((hatar.getTime() - most.getTime()) / 86400000);
  };
  const papirSurgos = papir.filter((r) => (papirHatra(r) ?? 99) <= 2);

  const utonKocsik = jarmuvek.filter((j) => sorok.some((s) => s.jarmu_kod === j.kod && s.allapot === "folyamatban"));
  const maiMegbizas = sorok.filter((s) => aznap(s, ma) && s.allapot !== "ellenorzesre_var").length;
  const ellenorzesre = sorok.filter((s) => s.allapot === "ellenorzesre_var");

  const csempek: Csempe[] = [
    {
      kulcs: "uton", cimke: "Úton", ertek: `${utonKocsik.length} kocsi`,
      also: `${maiMegbizas} megbízás ma`, szin: "normal", href: "/fuvarozas2/gps",
    },
    {
      kulcs: "elteres", cimke: "Eltérés", ertek: String(elteresek.length),
      also: elteresek.length === 0 ? "minden terv szerint" : elteresekOsszefoglalo(elteresek),
      szin: elteresek.some((e) => e.szin === "red") ? "red" : elteresek.length > 0 ? "amber" : "mint", href: null,
    },
    {
      kulcs: "ellenorzes", cimke: "Ellenőrzésre vár", ertek: String(ellenorzesre.length),
      also: ellenorzesre.length > 0 ? (ellenorzesre[0].partner ?? "import") : "nincs nyitott import",
      szin: ellenorzesre.length > 0 ? "amber" : "normal", href: "/fuvarozas2/megbizasok?szakasz=beerkezett",
    },
    {
      kulcs: "papir", cimke: "Postára vár", ertek: String(papir.length),
      also: papirSurgos.length > 0 ? `${papirSurgos.length} sürgős (${papirSurgos[0].partner ?? "—"})` : "nincs sürgős",
      szin: papirSurgos.length > 0 ? "red" : "normal", href: "/fuvarozas2/megbizasok?szakasz=postara",
    },
    {
      kulcs: "szamlazando", cimke: "Számlázandó", ertek: String(elsz?.szamlazhato ?? 0),
      also: ft(elsz?.szamlazhato_ft ?? 0), szin: (elsz?.szamlazhato ?? 0) > 0 ? "mint" : "normal", href: "/fuvarozas2/megbizasok?szakasz=szamlazasra",
    },
    {
      kulcs: "foto", cimke: "Fotó még nincs", ertek: String(elsz?.fotora ?? 0),
      also: null, szin: (elsz?.fotora ?? 0) > 0 ? "amber" : "normal", href: "/fuvarozas2/megbizasok?szakasz=szamlazasra",
    },
  ];

  // Kintlévőség — csak annak, aki a Számlák modult is látja.
  if (session.can("szamlak").view || session.can("attekintes").view) {
    try {
      const nyitott = await getSzamlaLista({ csakNyitott: true });
      const maISO = ma;
      const lejart = nyitott.filter((sz) => {
        const m = /^(\d{4})\.(\d{2})\.(\d{2})/.exec(sz.fizetesi_hatarido ?? "");
        return m ? `${m[1]}-${m[2]}-${m[3]}` < maISO : false;
      });
      const osszeg = nyitott.filter((sz) => sz.penznem === "Ft").reduce((a, sz) => a + szamlaHatralek(sz), 0);
      csempek.push({
        kulcs: "kintlevoseg", cimke: "Kintlévőség", ertek: ft(osszeg),
        also: lejart.length > 0 ? `${lejart.length} lejárt` : `${nyitott.length} nyitott számla`,
        szin: lejart.length > 0 ? "red" : "normal", href: "/szamlak",
      });
    } catch {
      // nincs jog vagy nincs szinkron — a csempe kimarad
    }
  }

  // ---------------------------------------------------------------- kocsik
  // Kocsinként a hiányzó papír/számla (az elmúlt 30 nap lerakásai).
  const papirKocsinkent = await query<{ jarmu_id: string; fotora: number; szamlazando: number }>(
    `select m.jarmu_id::text,
       count(*) filter (where m.allapot = 'teljesitve')::int as fotora,
       count(*) filter (where m.allapot = 'szamlazhato' and m.jelleg = 'ber')::int as szamlazando
     from fuvar_megbizasok m
     where m.torolt_at is null and m.jarmu_id is not null
       and coalesce(m.lerakas_datum, m.datum) >= $1::date - 30
     group by m.jarmu_id`,
    [ma]
  );
  const hetiPerc = await hetiVezetesPercek(jarmuvek, ma).catch(() => new Map<string, number>());

  const blokkKesz = (s: (typeof sorok)[number]): MaBlokk => {
    const gs = megalloMap.get(s.id) ?? [];
    const megalloSorok: MaMegalloSor[] = gs.map((g) => {
      const kesz = !!(g.gps_tavozas || g.sofor_kesz_at);
      const varakozik = !!(g.varakozas_kezdete && !g.varakozas_vege);
      const ablakIg = idobelyeg(g.ablak_ig);
      const lejartAblak = !kesz && ablakIg != null && ablakIg < most;
      return {
        tipus: g.tipus,
        varos: varosNev(g.cim_nyers) ?? g.cim_nyers,
        allapot: kesz
          ? `kész ${ORA(g.sofor_kesz_at ?? g.gps_tavozas)}`
          : g.gps_erkezes
            ? varakozik ? `várakozik ${percKulonbseg(most, idobelyeg(g.varakozas_kezdete)!)} p` : `megérkezett ${ORA(g.gps_erkezes)}`
            : "",
        ido: g.ablak_tol || g.ablak_ig ? `${ORA(g.ablak_tol)}–${ORA(g.ablak_ig)}` : "",
        kiemelt: varakozik ? "varakozik" : lejartAblak ? "kesik" : null,
        kesz,
      };
    });
    const f = varosNev(s.felrako ?? "") ?? s.felrako ?? "—";
    const l = varosNev(s.lerako ?? "") ?? s.lerako ?? "—";
    return {
      id: s.id,
      partner: s.partner ?? "(nincs megbízó)",
      hivatkozas: s.hivatkozas,
      jelleg: s.jelleg,
      utvonal: megalloSorok.length > 1 ? `${megalloSorok[0].varos} → ${megalloSorok[megalloSorok.length - 1].varos}` : `${f} → ${l}`,
      felrakasNap: s.felrakas_nap,
      lerakasNap: s.lerakas_nap,
      megallok: megalloSorok.length > 0
        ? megalloSorok
        : [
            { tipus: "felrako" as const, varos: f, allapot: "", ido: "", kiemelt: null, kesz: false },
            { tipus: "lerako" as const, varos: l, allapot: "", ido: "", kiemelt: null, kesz: false },
          ],
    };
  };

  const mostKeres = (maiak: (typeof sorok)[number][]): MaMost | null => {
    for (const s of maiak) {
      const gs = megalloMap.get(s.id) ?? [];
      const i = gs.findIndex((g) => !(g.gps_tavozas || g.sofor_kesz_at));
      if (i === -1) continue;
      const g = gs[i];
      const azonosTipus = gs.filter((x) => x.tipus === g.tipus);
      const r = megalloReszlete(s.megallo_reszletek, g.tipus, azonosTipus.indexOf(g), azonosTipus.length, g.cim_nyers);
      const varakozik = !!(g.varakozas_kezdete && !g.varakozas_vege);
      const ablakIg = idobelyeg(g.ablak_ig);
      return {
        fuvarId: s.id,
        partner: s.partner ?? "(nincs megbízó)",
        tipus: g.tipus,
        varos: varosNev(g.cim_nyers) ?? g.cim_nyers,
        cim: r?.cim ?? g.cim_nyers,
        ceg: r?.ceg ?? null,
        ablak: g.ablak_tol || g.ablak_ig ? `${ORA(g.ablak_tol)}–${ORA(g.ablak_ig)}` : r?.ido ?? null,
        allapot: g.gps_erkezes
          ? varakozik ? `várakozik ${percKulonbseg(most, idobelyeg(g.varakozas_kezdete)!)} perce` : `megérkezett ${ORA(g.gps_erkezes)}`
          : "úton oda",
        kiemelt: varakozik ? "varakozik" : ablakIg != null && ablakIg < most ? "kesik" : null,
        hanyadik: `${i + 1}/${gs.length}`,
        kontaktNev: kontaktNev(r?.kontakt),
        telefon: kontaktTelefon(r?.kontakt),
      };
    }
    return null;
  };

  const kocsiAllapot = (elo: NonNullable<typeof idovonal>["jarmuvek"][number] | undefined): MaKocsiAllapot | null => {
    if (!elo) return null;
    const p = elo.eloPozicio;
    if (!p) return { szoveg: elo.hiba ?? "nincs élő GPS-adat", szin: "amber", hely: null };
    const regi = percKulonbseg(most, p.utolsoAdat);
    if (regi > 30) return { szoveg: `GPS ${ORA(p.utolsoAdat)} óta nem jelez`, szin: "amber", hely: p.cim };
    if (p.sebesseg >= 5) return { szoveg: `megy · ${Math.round(p.sebesseg)} km/h`, szin: "mint", hely: p.cim };
    const allas = [...elo.szakaszok].reverse().find((x) => x.tipus === "allas");
    const allPerc = allas && allas.tipus === "allas" && allas.elo ? percKulonbseg(most, allas.kezdet) : null;
    const tervezetlen = elo.nemTervezettAllasok.some((a) => percKulonbseg(most, a.veg) <= 5 && a.percek >= 30);
    return {
      szoveg: [allPerc != null ? `áll ${allPerc >= 60 ? `${oraPerc(allPerc)} ó` : `${allPerc} p`}` : "áll", p.motorJar ? "motor jár" : null].filter(Boolean).join(" · "),
      szin: tervezetlen ? "amber" : "normal",
      hely: p.cim,
    };
  };

  const kocsik: MaKocsi[] = osszesJarmu.map((j) => {
    const torzs = SAJAT_JARMUVEK.find((x) => x.rendszamok[0] === j.kod) ?? SAJAT_JARMUVEK.find((x) => x.rendszamok.length === 0 && j.kod === "JANI");
    const becenev = torzs?.sofor ?? null;
    const sajat = sorok.filter((s) => s.jarmu_kod === j.kod && s.allapot !== "ellenorzesre_var");
    // Ma: a mai napra eső, és a korábbról csúszó, még folyamatban lévő fuvarok.
    const maiak = sajat.filter((s) => aznap(s, ma) || ((s.lerakas_nap ?? "") < ma && s.allapot === "folyamatban"));
    const holnapiak = sajat.filter((s) => aznap(s, holnap) && !maiak.includes(s));
    const elo = becenev ? idovonal?.jarmuvek.find((x) => x.sofor === becenev) : undefined;

    // Vezetési idő becslés: 4,5 óra vezetés után kötelező 45 perc szünet.
    let vezetesSor: string | null = null;
    if (elo?.vezetesSec != null) {
      const vezetesPerc = Math.round(elo.vezetesSec / 60);
      const utolsoSzunetOta = elo.utolsoSzunetVege ? percKulonbseg(most, elo.utolsoSzunetVege) : vezetesPerc;
      const szunetigPerc = Math.max(0, 270 - Math.min(utolsoSzunetOta, vezetesPerc));
      vezetesSor = [
        `Vezetés ma ${oraPerc(vezetesPerc)} / 9:00`,
        szunetigPerc === 0 ? "szünet esedékes" : `szünet ${oraPerc(szunetigPerc)} múlva`,
        elo.szolgalatKezdet ? `szolgálat ${ORA(elo.szolgalatKezdet)} óta` : null,
      ].filter(Boolean).join(" · ");
    }
    const hp = hetiPerc.get(j.kod);
    const etaSor = elo?.eloEta && !elo.eloEta.bizonytalan ? `ETA ${elo.eloEta.cel}: ${ORA(elo.eloEta.erkezes)}` : null;
    const pk = papirKocsinkent.find((x) => x.jarmu_id === j.id);
    const papirSorok: { szoveg: string; href: string }[] = [];
    if (pk?.fotora) papirSorok.push({ szoveg: `${pk.fotora} fuvarnál nincs még fotó/papír`, href: "/fuvarozas2/megbizasok?szakasz=szamlazasra" });
    if (pk?.szamlazando) papirSorok.push({ szoveg: `${pk.szamlazando} számlázandó`, href: "/fuvarozas2/megbizasok?szakasz=szamlazasra" });

    return {
      kod: j.kod,
      cimke: j.cimke,
      sofor: becenev ?? j.sofor,
      helykitolto: j.ecofleet_object_id ? null : "még nem üzemel",
      allapot: j.ecofleet_object_id ? kocsiAllapot(elo) : null,
      vezetesSor,
      hetiSor: hp != null ? `Hét: ${Math.round(hp / 60)} / 56 óra` : null,
      napiKm: elo?.napiKm ?? null,
      etaSor,
      most: mostKeres(maiak),
      ma: maiak.map(blokkKesz),
      holnap: holnapiak.map(blokkKesz),
      holnapFolytatodik: maiak.some((s) => (s.lerakas_nap ?? "") >= holnap),
      papir: papirSorok,
    };
  });
  while (kocsik.length < KOCSI_OSZLOP) {
    kocsik.push({
      kod: null, cimke: `${kocsik.length + 1}. kocsi`, sofor: null, helykitolto: "még nincs beállítva",
      allapot: null, vezetesSor: null, hetiSor: null, napiKm: null, etaSor: null, most: null,
      ma: [], holnap: [], holnapFolytatodik: false, papir: [],
    });
  }

  // ---------------------------------------------------------------- teendők, holnap, rendszer
  const teendok = [
    {
      cimke: "Postára vár", ertek: `${papir.length}`,
      also: papirSurgos.length > 0 ? `${papirSurgos[0].partner ?? ""} ${papirSurgos[0].hivatkozas ?? ""} · ${papirHatra(papirSurgos[0])} nap`.trim() : null,
      href: "/fuvarozas2/elszamolas",
    },
    { cimke: "Számlázandó", ertek: `${elsz?.szamlazhato ?? 0}`, also: ft(elsz?.szamlazhato_ft ?? 0), href: "/fuvarozas2/elszamolas" },
    { cimke: "Fotó még nincs", ertek: `${elsz?.fotora ?? 0}`, also: null, href: "/fuvarozas2/elszamolas" },
  ];

  const holnapiak = sorok.filter((s) => aznap(s, holnap));
  const holnapKocsiNelkul = holnapiak.filter((s) => !s.jarmu_kod);
  const utkozes = jarmuvek.filter((j) => holnapiak.filter((s) => s.jarmu_kod === j.kod).length > 1).length;
  const holnapDoboz: { cimke: string; ertek: string; szin: CsempeSzin }[] = [
    { cimke: `${holnapCimke}i megbízás`, ertek: String(holnapiak.length), szin: "normal" },
    { cimke: `${holnapCimke} kocsi nélkül`, ertek: String(holnapKocsiNelkul.length), szin: holnapKocsiNelkul.length > 0 ? "red" : "normal" },
    { cimke: "Ütközés", ertek: utkozes === 0 ? "nincs" : `${utkozes} kocsi`, szin: utkozes > 0 ? "amber" : "normal" },
  ];

  return {
    ma, holnap, holnapCimke, csempek,
    elteresek: elteresek.sort((a, b) => (a.szin === b.szin ? 0 : a.szin === "red" ? -1 : 1)),
    kocsik,
    kocsiNelkul: sorok.filter((s) => !s.jarmu_kod && (aznap(s, ma) || aznap(s, holnap))).map((s) => ({
      id: s.id, partner: s.partner ?? "(nincs megbízó)",
      utvonal: `${varosNev(s.felrako ?? "") ?? s.felrako ?? "—"} → ${varosNev(s.lerako ?? "") ?? s.lerako ?? "—"}`,
      nap: s.felrakas_nap, allapot: s.allapot,
    })),
    teendok, holnapDoboz,
  };
}

function elteresekOsszefoglalo(e: Elteres[]): string {
  const csoport = new Map<string, number>();
  for (const x of e) {
    const kulcs = x.badge.split(" ")[0];
    csoport.set(kulcs, (csoport.get(kulcs) ?? 0) + 1);
  }
  return [...csoport.entries()].map(([k, n]) => `${n} ${k}`).join(" · ");
}

/**
 * A hét (hétfőtől máig) GPS szerinti vezetési perce kocsinként — az 56 órás
 * heti kerethez. Az Ecofleet heti útjelentéséből, 10 percig gyorsítótárazva,
 * hogy a Ma oldal ne kérdezze minden megnyitáskor.
 */
async function hetiVezetesPercek(
  jarmuvek: { kod: string; ecofleet_object_id: string | null; vontato_rendszam: string | null }[],
  ma: string
): Promise<Map<string, number>> {
  const d = new Date(`${ma}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const hetfo = d.toISOString().slice(0, 10);
  const ids = jarmuvek.map((j) => j.ecofleet_object_id).filter((x): x is string => !!x);
  if (ids.length === 0) return new Map();
  return cachelve(`ma-heti-vezetes:${hetfo}:${ma}`, 10 * 60 * 1000, async () => {
    const utak = await getUtvonalJelentes(ids, hetfo, ma);
    const eredmeny = new Map<string, number>();
    for (const j of jarmuvek) {
      const kulcs = rendszamKulcs(j.vontato_rendszam ?? j.kod);
      let percek = 0;
      for (const u of utak.filter((x) => x.rendszamKulcs === kulcs)) {
        const i = new Date(u.indulas.replace(" ", "T"));
        const e = new Date(u.erkezes.replace(" ", "T"));
        if (!Number.isNaN(i.getTime()) && !Number.isNaN(e.getTime()) && e > i) percek += (e.getTime() - i.getTime()) / 60000;
      }
      eredmeny.set(j.kod, Math.round(percek));
    }
    return eredmeny;
  });
}
