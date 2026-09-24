"use server";

// Fuvarozás 2 — a „Ma" képernyő a tervvászon (D1) szerint.
//
// A vászon elve: NEM a normál működést mutatja, hanem az ELTÉRÉSEKET. Fent
// hat mérőszám, alatta „mi nem megy terv szerint", és csak utána a kocsik
// napja. Ami rendben van, az egy sor.
//
// Honnan jön az adat:
//   • állapot, megbízás, megálló, ablak, várakozás → az ÚJ modell
//     (fuvar_megbizasok / fuvar_megallok) — egyetlen lekérdezés megállókra;
//   • élő ETA, vezetési idő, tervezetlen állás, sofőr gondjelzése →
//     getIdovonalak() (a meglévő GPS-lánc, nem duplikáljuk);
//   • kintlévőség → a Számlák modul nyitott számlái (ha a nézőnek van rá
//     joga; enélkül a csempe egyszerűen kimarad);
//   • rendszer-csík → getRendszerEgeszseg().
//
// Minden becsült érték jelölve van a felületen (ETA, vezetési idő) — a
// tachográf a sofőrnél van, ez előrejelzés.

import { query } from "@/lib/db";
import { requireSession } from "@/lib/auth/dal";
import { requireAnyViewPermission } from "@/lib/auth/require-permission";
import { getIdovonalak } from "@/lib/fuvarozas/actions";
import { getSzamlaLista } from "@/lib/szamlak/actions";
import { varosNev } from "@/lib/fuvarozas/varos";
import { getRendszerEgeszseg } from "@/lib/fuvarozas2/rendszer";
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
};

export type MaBlokk = {
  id: string;
  partner: string;
  hivatkozas: string | null;
  jelleg: "ber" | "sajat";
  megallok: MaMegalloSor[];
};

export type MaKocsi = {
  kod: string;
  cimke: string;
  sofor: string | null;
  blokkok: MaBlokk[];
  /** „Vezetés ma 3:20 · szünet 1:10 múlva · szolgálat 05:41 óta" — becslés a GPS-ből. */
  vezetesSor: string | null;
  etaSor: string | null;
};

export type MaVaszon = {
  ma: string;
  holnap: string;
  csempek: Csempe[];
  elteresek: Elteres[];
  kocsik: MaKocsi[];
  kocsiNelkul: { id: string; partner: string; utvonal: string; nap: string | null; allapot: Allapot }[];
  teendok: { cimke: string; ertek: string; also: string | null; href: string }[];
  holnapDoboz: { cimke: string; ertek: string; szin: CsempeSzin }[];
  rendszer: { cimke: string; ertek: string; rendben: boolean }[];
};

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

  const [{ ma, holnap }] = await query<{ ma: string; holnap: string }>(
    `select ((now() at time zone 'Europe/Budapest')::date)::text as ma, ((now() at time zone 'Europe/Budapest')::date + 1)::text as holnap`
  );

  // 1. A nyitott megbízások (ma és holnap) kocsival, partnerrel.
  const sorok = await query<{
    id: string; allapot: Allapot; jelleg: "ber" | "sajat"; partner: string | null; hivatkozas: string | null;
    jarmu_kod: string | null; jarmu_cimke: string | null; sofor: string | null;
    felrakas_nap: string | null; lerakas_nap: string | null; hianylista: unknown[]; felrako: string | null; lerako: string | null;
  }>(
    `select m.id::text, m.allapot, m.jelleg, coalesce(p.nev, m.megrendelo) as partner,
       coalesce(m.hivatkozas_kanonikus, m.pozicioszam, m.reise_id) as hivatkozas,
       j.kod as jarmu_kod, coalesce(j.cimke, m.jarmu) as jarmu_cimke, coalesce(a.name, m.sofor) as sofor,
       to_char(m.datum, 'YYYY-MM-DD') as felrakas_nap,
       to_char(coalesce(m.lerakas_datum, m.datum), 'YYYY-MM-DD') as lerakas_nap,
       m.hianylista, m.felrako, m.lerako
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
  const jarmuvek = await query<{ kod: string; cimke: string; sofor: string | null }>(
    `select j.kod, j.cimke, a.name as sofor from fuvar_jarmuvek j
     left join alkalmazottak a on a.id = j.sofor_id
     where j.aktiv and j.ecofleet_object_id is not null order by j.id`
  );

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
       count(*) filter (where m.allapot = 'szamlazhato')::int as szamlazhato,
       coalesce(sum(m.fuvardij) filter (where m.allapot = 'szamlazhato' and m.fuvardij_penznem = 'Ft'), 0)::int as szamlazhato_ft,
       count(*) filter (where m.allapot = 'email_elment')::int as postazando
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
       and m.allapot in ('teljesitve','szamlazhato','szamlazva','email_elment')
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
      szin: ellenorzesre.length > 0 ? "amber" : "normal", href: "/fuvarozas2/megbizasok?csoport=ellenorzes",
    },
    {
      kulcs: "papir", cimke: "Postára vár", ertek: String(papir.length),
      also: papirSurgos.length > 0 ? `${papirSurgos.length} sürgős (${papirSurgos[0].partner ?? "—"})` : "nincs sürgős",
      szin: papirSurgos.length > 0 ? "red" : "normal", href: "/fuvarozas2/elszamolas",
    },
    {
      kulcs: "szamlazando", cimke: "Számlázandó", ertek: String(elsz?.szamlazhato ?? 0),
      also: ft(elsz?.szamlazhato_ft ?? 0), szin: (elsz?.szamlazhato ?? 0) > 0 ? "mint" : "normal", href: "/fuvarozas2/elszamolas",
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
      const osszeg = nyitott.filter((sz) => sz.penznem === "Ft").reduce((a, sz) => a + sz.brutto, 0);
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
  const kocsik: MaKocsi[] = jarmuvek.map((j) => {
    const sajat = sorok.filter((s) => s.jarmu_kod === j.kod && (aznap(s, ma) || aznap(s, holnap)));
    const elo = idovonal?.jarmuvek.find((x) => j.cimke.includes(x.sofor) || (j.sofor ?? "").includes(x.sofor) || x.sofor === j.sofor);
    const blokkok: MaBlokk[] = sajat.map((s) => {
      const gs = megalloMap.get(s.id) ?? [];
      const megalloSorok: MaMegalloSor[] = gs.map((g) => {
        const kesz = g.gps_tavozas || g.sofor_kesz_at;
        const varakozik = g.varakozas_kezdete && !g.varakozas_vege;
        const ablakIg = idobelyeg(g.ablak_ig);
        const lejartAblak = !kesz && ablakIg != null && ablakIg < most;
        return {
          tipus: g.tipus,
          varos: varosNev(g.cim_nyers) ?? g.cim_nyers,
          allapot: kesz
            ? `kész ${ORA(g.sofor_kesz_at ?? g.gps_tavozas)}`
            : g.gps_erkezes
              ? varakozik ? `várakozik ${percKulonbseg(most, idobelyeg(g.varakozas_kezdete)!)} p` : `megérkezett ${ORA(g.gps_erkezes)}`
              : "úton",
          ido: g.ablak_tol || g.ablak_ig ? `${ORA(g.ablak_tol)}–${ORA(g.ablak_ig)}` : "—",
          kiemelt: varakozik ? "varakozik" : lejartAblak ? "kesik" : null,
        };
      });
      return {
        id: s.id,
        partner: s.partner ?? "(nincs megbízó)",
        hivatkozas: s.hivatkozas,
        jelleg: s.jelleg,
        megallok: megalloSorok.length > 0
          ? megalloSorok
          : [
              { tipus: "felrako" as const, varos: varosNev(s.felrako ?? "") ?? s.felrako ?? "—", allapot: "nincs megálló-adat", ido: "—", kiemelt: null },
              { tipus: "lerako" as const, varos: varosNev(s.lerako ?? "") ?? s.lerako ?? "—", allapot: "", ido: "—", kiemelt: null },
            ],
      };
    });

    // Vezetési idő becslés: 4,5 óra vezetés után kötelező 45 perc szünet.
    let vezetesSor: string | null = null;
    if (elo?.vezetesSec != null) {
      const vezetesPerc = Math.round(elo.vezetesSec / 60);
      const utolsoSzunetOta = elo.utolsoSzunetVege ? percKulonbseg(most, elo.utolsoSzunetVege) : vezetesPerc;
      const szunetigPerc = Math.max(0, 270 - Math.min(utolsoSzunetOta, vezetesPerc));
      vezetesSor = [
        `Vezetés ma ${oraPerc(vezetesPerc)}`,
        szunetigPerc === 0 ? "szünet esedékes" : `szünet ${oraPerc(szunetigPerc)} múlva`,
        elo.szolgalatKezdet ? `szolgálat ${ORA(elo.szolgalatKezdet)} óta` : null,
      ].filter(Boolean).join(" · ");
    }
    const etaSor = elo?.eloEta && !elo.eloEta.bizonytalan ? `ETA ${elo.eloEta.cel}: ${ORA(elo.eloEta.erkezes)}` : elo?.hiba ? elo.hiba : null;

    return { kod: j.kod, cimke: j.cimke, sofor: j.sofor, blokkok, vezetesSor, etaSor };
  });

  // ---------------------------------------------------------------- teendők, holnap, rendszer
  const teendok = [
    {
      cimke: "Postára vár", ertek: `${papir.length}`,
      also: papirSurgos.length > 0 ? `${papirSurgos[0].partner ?? ""} ${papirSurgos[0].hivatkozas ?? ""} · ${papirHatra(papirSurgos[0])} nap`.trim() : null,
      href: "/fuvarozas2/elszamolas",
    },
    { cimke: "Számlázandó", ertek: `${elsz?.szamlazhato ?? 0}`, also: ft(elsz?.szamlazhato_ft ?? 0), href: "/fuvarozas2/elszamolas" },
    { cimke: "Postázandó", ertek: `${elsz?.postazando ?? 0}`, also: null, href: "/fuvarozas2/elszamolas" },
    { cimke: "Fotóra vár", ertek: `${elsz?.fotora ?? 0}`, also: null, href: "/fuvarozas2/elszamolas" },
  ];

  const holnapiak = sorok.filter((s) => aznap(s, holnap));
  const holnapKocsiNelkul = holnapiak.filter((s) => !s.jarmu_kod);
  const utkozes = jarmuvek.filter((j) => holnapiak.filter((s) => s.jarmu_kod === j.kod).length > 1).length;
  const holnapDoboz: { cimke: string; ertek: string; szin: CsempeSzin }[] = [
    { cimke: "Holnapi megbízás", ertek: String(holnapiak.length), szin: "normal" },
    { cimke: "Holnap kocsi nélkül", ertek: String(holnapKocsiNelkul.length), szin: holnapKocsiNelkul.length > 0 ? "red" : "normal" },
    { cimke: "Ütközés", ertek: utkozes === 0 ? "nincs" : `${utkozes} kocsi`, szin: utkozes > 0 ? "amber" : "normal" },
  ];

  let rendszer: { cimke: string; ertek: string; rendben: boolean }[] = [];
  try {
    const eg = await getRendszerEgeszseg();
    rendszer = eg.sorok.map((s) => ({ cimke: s.cim, ertek: s.ertek, rendben: s.allapot === "rendben" }));
  } catch {
    rendszer = [];
  }

  return {
    ma, holnap, csempek,
    elteresek: elteresek.sort((a, b) => (a.szin === b.szin ? 0 : a.szin === "red" ? -1 : 1)),
    kocsik,
    kocsiNelkul: sorok.filter((s) => !s.jarmu_kod && (aznap(s, ma) || aznap(s, holnap))).map((s) => ({
      id: s.id, partner: s.partner ?? "(nincs megbízó)",
      utvonal: `${varosNev(s.felrako ?? "") ?? s.felrako ?? "—"} → ${varosNev(s.lerako ?? "") ?? s.lerako ?? "—"}`,
      nap: s.felrakas_nap, allapot: s.allapot,
    })),
    teendok, holnapDoboz, rendszer,
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
