"use server";

// Tervezés · A hét (az új terv 2. oldala, 2026-10-11): a kocsik hete a
// résekkel, a bejött Timocom-ajánlatok melyik résbe illenek, és kiket
// érdemes hívni a saját múltból. Csak olvas; a döntés (elvállalás) a
// meglévő Timocom-lapon és a bejövő megbízás-döntésen keresztül megy.

import { query } from "@/lib/db";
import { requireViewPermission } from "@/lib/auth/require-permission";
import { megbizoMegjelenites } from "@/lib/fuvarozas/fuvar-constants";
import { varosNev } from "@/lib/fuvarozas/varos";
import { findJarmuByKod, findJarmuInSzoveg, resolveJarmu } from "@/lib/fuvarozas/vehicles";
import { getJarmuvek } from "@/lib/fuvarozas/jarmuvek-db";
import { geokodolCachelve } from "@/lib/fuvarozas/erintes-felismeres";
import { getIndulasiTelephely } from "@/lib/fuvarozas/telephelyek-db";
import { getFuvarBeallitasok } from "@/lib/beallitasok/fuvar";
import { getTaroltKalkulaciok } from "@/lib/fuvarozas2/kalkulacio-tar";
import { getTimocomAjanlatok } from "@/lib/fuvarozas2/timocom";
import { getEurArfolyamok } from "@/lib/fuvarozas/arfolyam";
import type { Pont } from "@/lib/fuvarozas2/tervezo-alap";
import {
  ajanlatFrissesseg, hetEltolva, hetiReszek, illeszt, kiketHivj, kiosztatlanCellak, legjobbRes, tervHetNapjai, utKm,
  riasztandoResek, riasztasOsszerak, type RiasztasAjanlat, type VisszfuvarRiasztas,
  type AjanlatHely, type HetiFuvar, type HivandoPartner, type Illeszkedes, type MultFuvar, type NapCella, type Res,
} from "@/lib/fuvarozas2/tervezes-het-alap";
import { legutobbiTacho } from "@/lib/jarmu-telemetria/repo";
import { tachoKijelzes } from "@/lib/fuvarozas2/tervezes-het-tacho";

export type HetAjanlat = {
  id: string;
  megbizo: string | null;
  felVaros: string;
  leVaros: string;
  felNap: string | null;
  arSzoveg: string | null;
  illik: Illeszkedes | null;
  /** A kijelölt réshez mért illeszkedés (ha más, mint a legjobb). */
  ehhez: Illeszkedes | null;
  nincsHely: boolean;
  /** "nyitott" vagy "ajanlva" (kiment az árajánlatunk, válaszra vár). */
  allapot: string;
  /** Mióta van nálunk: „3 órája”; 24 óra után régi. */
  kor: string;
  regi: boolean;
};

export type TervezesHet = {
  ma: string;
  /** Az adat előállításának ideje („10:42”). */
  frissitve: string;
  /** A mutatott hét hétfője, a lapozás szomszédai; `ezAHet`: a mai (vagy hétvégén a következő) hét-e. */
  hetKezdet: string;
  elozoHet: string;
  kovetkezoHet: string;
  ezAHet: boolean;
  /** A hét fuvarjai, amelyek egyik kocsi-sorba és a „Kocsira vár” sorba sem kerültek — az okkal (sosem esik ki csendben). */
  kimaradt: { id: string; cim: string; utvonal: string; ok: string }[];
  /** A hét még nem lerakott fuvarjai, amelyeknek a felrakó vagy a lerakó helye nem ismert — körülöttük nem számolható rés. */
  helyNelkul: { id: string; cim: string; utvonal: string }[];
  napok: string[];
  /** `tacho`: friss tachó-chip („ma 2 ó 40 p · hét 26 ó 25 p hátra”) + súgó — csak a mostani héten, különben nincs. */
  kocsik: { kod: string; sofor: string; cellak: NapCella[]; tacho?: { chip: string; reszletek: string } | null }[];
  /** Kocsira váró (ki nem osztott) fuvarok napra bontva, a `napok` sorrendjében. */
  kiosztatlan: HetiFuvar[][];
  resek: Res[];
  uresKmOssz: number;
  ajanlatok: HetAjanlat[];
  kijelolt: Res | null;
  hivandok: HivandoPartner[];
  /** Visszfuvar-riasztás: a ma és a következő munkanap üres útjai ennek a hétnek a napjaiból, a legjobb ajánlattal és a hívandókkal. */
  riasztasok: VisszfuvarRiasztas[];
  kmKoltseg: number;
  /** Ft / 1 EUR (MNB), null: nincs árfolyam — az EUR oszlop „—”. */
  eurArfolyam: number | null;
};

type Sor = {
  id: string; jelleg: "ber" | "sajat"; allapot: string; jarmu_kod: string | null; jarmu_szoveg: string | null; partner: string | null;
  felrako: string | null; lerako: string | null; fel_nap: string; le_nap: string;
  fuvardij: number | null; penznem: string;
  fel_lat: number | null; fel_lon: number | null; le_lat: number | null; le_lon: number | null;
};

const pont = (lat: number | null, lon: number | null): Pont | null => (lat != null && lon != null ? { lat: Number(lat), lon: Number(lon) } : null);
const varos = (s: string | null) => varosNev(s ?? "") || "?";

async function geo(cim: string): Promise<Pont | null> {
  const ido = new Promise<null>((r) => setTimeout(() => r(null), 4000));
  const g = await Promise.race([geokodolCachelve(cim).catch(() => null), ido]);
  return g ? { lat: g.lat, lon: g.lon } : null;
}

function median(x: number[]): number | null {
  if (!x.length) return null;
  const s = [...x].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export async function getTervezesHet(resKulcs?: string, het?: string): Promise<TervezesHet> {
  await requireViewPermission("fuvarozas");
  const [{ ma, ora }] = await query<{ ma: string; ora: string }>(
    `select ((now() at time zone 'Europe/Budapest')::date)::text as ma, to_char(now() at time zone 'Europe/Budapest', 'HH24:MI') as ora`
  );
  const mostaniHet = tervHetNapjai(ma)[0];
  const napok = tervHetNapjai(het && /^\d{4}-\d{2}-\d{2}$/.test(het) ? het : ma);

  const sorok = await query<Sor>(
    `select m.id::text, m.jelleg, m.allapot, j.kod as jarmu_kod, coalesce(nullif(trim(m.jarmu), ''), nullif(trim(m.sofor), '')) as jarmu_szoveg, coalesce(p.nev, m.megrendelo) as partner,
       coalesce(fel.cim_nyers, m.felrako) as felrako, coalesce(le.cim_nyers, m.lerako) as lerako,
       to_char(m.datum, 'YYYY-MM-DD') as fel_nap, to_char(coalesce(m.lerakas_datum, m.datum), 'YYYY-MM-DD') as le_nap,
       m.fuvardij, coalesce(m.fuvardij_penznem, 'Ft') as penznem,
       fel.lat as fel_lat, fel.lon as fel_lon, le.lat as le_lat, le.lon as le_lon
     from fuvar_megbizasok m
     left join fuvar_partnerek p on p.id = m.partner_id
     left join fuvar_jarmuvek j on j.id = m.jarmu_id
     left join lateral (select g.cim_nyers, g.lat, g.lon from fuvar_megallok g where g.megbizas_id = m.id and g.tipus = 'felrako' order by g.sorszam limit 1) fel on true
     left join lateral (select g.cim_nyers, g.lat, g.lon from fuvar_megallok g where g.megbizas_id = m.id and g.tipus = 'lerako' order by g.sorszam desc limit 1) le on true
     where m.torolt_at is null and m.allapot is not null and m.datum is not null
       and coalesce(m.lerakas_datum, m.datum) >= $1::date - 180 and m.datum <= $2::date
     order by m.datum, m.id`,
    [napok[0], napok[napok.length - 1]]
  );

  // A megállók lat/lon oszlopát semmi nem tölti ki (a modell-szinkron csak a
  // címet írja), ezért koordináta nélkül egyetlen rés sem jött létre. A hét és
  // az előtte lévő 2 hét fuvarjainak hiányzó pontjait a címből geokódoljuk
  // (gyorsítótárazva, címenként egyszer, legfeljebb 40 cím).
  const tol = new Date(`${napok[0]}T12:00:00Z`);
  tol.setUTCDate(tol.getUTCDate() - 14);
  const tolNap = tol.toISOString().slice(0, 10);
  // A legfrissebbek előre (a hét fuvarjai), hogy a 40-es korlát ne őket vágja le.
  const kellCim = new Set<string>();
  for (const s of [...sorok].sort((x, y) => y.le_nap.localeCompare(x.le_nap))) {
    if (s.le_nap < tolNap) continue;
    if (s.fel_lat == null && s.felrako) kellCim.add(s.felrako);
    if (s.le_lat == null && s.lerako) kellCim.add(s.lerako);
  }
  const cimPont = new Map<string, Pont | null>();
  await Promise.all([...kellCim].slice(0, 40).map(async (c) => cimPont.set(c, await geo(c))));
  for (const s of sorok) {
    if (s.le_nap < tolNap) continue;
    const fp = s.fel_lat == null && s.felrako ? cimPont.get(s.felrako) : null;
    if (fp) { s.fel_lat = fp.lat; s.fel_lon = fp.lon; }
    const lp = s.le_lat == null && s.lerako ? cimPont.get(s.lerako) : null;
    if (lp) { s.le_lat = lp.lat; s.le_lon = lp.lon; }
  }

  // A kocsi: a megbízás „Kocsi” szövege a hiteles (mint a Ma oldalon és a
  // sofőr-appban); a jarmu_id csak tartalék. 2026-10-14: a #311 (Gergő,
  // Budapest → Balkány) azért hiányzott a hétről, mert a jarmu_id üres maradt.
  const jarmuListaKod = await getJarmuvek();
  for (const s of sorok) {
    const szoveg = s.jarmu_szoveg ? (resolveJarmu(s.jarmu_szoveg, jarmuListaKod) ?? findJarmuInSzoveg(s.jarmu_szoveg, jarmuListaKod))?.kod ?? null : null;
    s.jarmu_kod = szoveg ?? s.jarmu_kod;
  }

  const beallitas = await getFuvarBeallitasok();
  const hetiBer = sorok.filter((s) => s.jelleg === "ber" && s.le_nap >= napok[0]).map((s) => s.id);
  const tar = await getTaroltKalkulaciok(hetiBer);
  const eredmenyek = [...tar.values()].map((t) => t.eredmeny).filter((e): e is NonNullable<typeof e> => !!e);
  const fogyasztas = eredmenyek.length ? eredmenyek.reduce((a, e) => a + e.fogyasztasL100, 0) / eredmenyek.length : beallitas.fogyasztas_alap_l_100km;
  const gazolaj = eredmenyek.length ? eredmenyek[eredmenyek.length - 1].gazolaj.ar : beallitas.gazolaj_ar_tartalek_ft - beallitas.tankolasi_kedvezmeny_ft_l;
  const kmOssz = eredmenyek.reduce((a, e) => a + e.rakottKm, 0);
  const utdijPerKm = kmOssz > 0 ? eredmenyek.reduce((a, e) => a + e.rakottUtdijFt, 0) / kmOssz : 120;
  const kmKoltseg = Math.round((fogyasztas / 100) * gazolaj + utdijPerKm);
  const oraFt = Math.round(beallitas.napi_koltseg_ft / 9);

  const indulas = await getIndulasiTelephely();
  const tpont = indulas.lat != null && indulas.lon != null ? { lat: indulas.lat, lon: indulas.lon } : (await geo(indulas.cim)) ?? { lat: 47.77, lon: 21.93 };
  const telephely = { pont: tpont, varos: varos(indulas.cim) };

  const jarmuLista = await getJarmuvek();
  const jarmuvek = (await query<{ kod: string; sofor: string | null }>(
    `select j.kod, a.name as sofor from fuvar_jarmuvek j left join alkalmazottak a on a.id = j.sofor_id
     where j.aktiv order by j.id`
  )).map((j) => ({ kod: j.kod, sofor: findJarmuByKod(j.kod, jarmuLista)?.sofor ?? j.sofor?.split(" ").pop() ?? j.kod }));

  const hetiFuvar = (s: Sor): HetiFuvar => ({
    id: s.id, cim: megbizoMegjelenites(s.jelleg, s.partner), felVaros: varos(s.felrako), leVaros: varos(s.lerako),
    fel: pont(s.fel_lat, s.fel_lon), le: pont(s.le_lat, s.le_lon), felNap: s.fel_nap, leNap: s.le_nap, sajat: s.jelleg === "sajat",
    allapot: s.allapot,
  });

  // Tachó csak a mostani héten (élő állapot); a tábla hiánya / hiba → nincs chip.
  const tachoMost = new Date();
  const tachok = napok[0] === mostaniHet ? await legutobbiTacho().catch(() => new Map<string, never>()) : new Map<string, never>();

  const resek: Res[] = [];
  const kocsik = jarmuvek.map((j) => {
    const sajat = sorok.filter((s) => s.jarmu_kod === j.kod);
    const elozo = sajat.filter((s) => s.le_nap < napok[0] && s.le_lat != null).pop();
    const r = hetiReszek(
      { kod: j.kod, sofor: j.sofor, fuvarok: sajat.map(hetiFuvar), elozoVeg: elozo ? { pont: pont(elozo.le_lat, elozo.le_lon)!, varos: varos(elozo.lerako) } : null },
      napok, telephely, kmKoltseg, ma
    );
    resek.push(...r.resek);
    const tk = tachoKijelzes(tachok.get(j.kod)?.tacho, tachoMost);
    return { kod: j.kod, sofor: j.sofor, cellak: r.cellak, tacho: tk ? { chip: tk.chip, reszletek: tk.reszletek } : null };
  });

  const mult: (MultFuvar & { le: Pont | null })[] = sorok
    .filter((s) => s.jelleg === "ber" && s.fel_nap < ma && s.partner)
    .map((s) => ({ partner: megbizoMegjelenites(s.jelleg, s.partner), fel: pont(s.fel_lat, s.fel_lon), le: pont(s.le_lat, s.le_lon), felVaros: varos(s.felrako), leVaros: varos(s.lerako), nap: s.fel_nap, dijFt: s.penznem === "Ft" && s.fuvardij ? Number(s.fuvardij) : null }));

  /** Ár-memória: hasonló (fel ±30 km, le ±30 km) korábbi fuvarok Ft/km mediánja. */
  const ftKmElozmeny = (f: Pont, l: Pont): number | null => {
    const x = mult.filter((m) => m.dijFt && m.fel && m.le && utKm(m.fel, f) <= 30 && utKm(m.le, l) <= 30)
      .map((m) => m.dijFt! / Math.max(1, utKm(m.fel!, m.le!)));
    return median(x);
  };

  const kijelolt = resek.find((r) => r.kulcs === resKulcs) ?? resek[0] ?? null;

  // EUR-árfolyam (MNB, mai vagy legutóbbi közzétett) az árlétra EUR-oszlopához.
  const eurArfolyam = (await getEurArfolyamok([ma]).catch(() => new Map<string, never>())).get(ma)?.ft ?? null;

  // Lejárt ajánlat (a felrakás napja ma előtt) nem kerül a hétre — a Timocom fülön megmarad.
  const felNapja = (t: Awaited<ReturnType<typeof getTimocomAjanlatok>>[number]) =>
    (t.ajanlat.helyek.find((h) => h.tipus === "fel") ?? t.ajanlat.helyek[0])?.datumTol ?? null;
  const most = new Date();
  const nyitott = (await getTimocomAjanlatok(40, ["nyitott", "ajanlva"]))
    .filter((t) => { const n = felNapja(t); return !n || n >= ma; })
    .slice(0, 12);
  const riasztandok = riasztandoResek(resek, ma);
  const riasztasJeloltek = new Map<string, RiasztasAjanlat[]>(riasztandok.map((r) => [r.kulcs, []]));
  const ajanlatok: HetAjanlat[] = await Promise.all(nyitott.map(async (t) => {
    const helyek = t.ajanlat.helyek;
    const f = helyek.find((h) => h.tipus === "fel") ?? helyek[0];
    const l = [...helyek].reverse().find((h) => h.tipus === "le") ?? helyek[helyek.length - 1];
    const cim = (h: typeof f) => [h.irsz, h.varos].filter(Boolean).join(" ") + (h.orszag ? `, ${h.orszag}` : "");
    const [fp, lp] = f && l ? await Promise.all([geo(cim(f)), geo(cim(l))]) : [null, null];
    const fel: AjanlatHely = { varos: f?.varos ?? "?", pont: fp, nap: f?.datumTol ?? null };
    const le: AjanlatHely = { varos: l?.varos ?? "?", pont: lp, nap: l?.datumTol ?? null };
    const p = { kmKoltseg, oraFt, ftKmElozmeny: fp && lp ? ftKmElozmeny(fp, lp) : null, eurArfolyam };
    const illik = legjobbRes(resek, fel, le, p);
    const ehhez = kijelolt ? illeszt(kijelolt, fel, le, p) : null;
    const regi = ajanlatFrissesseg(t.frissitveAt, most).regi;
    if (t.allapot === "nyitott") {
      for (const r of riasztandok) {
        const i = illeszt(r, fel, le, p);
        if (i) riasztasJeloltek.get(r.kulcs)!.push({ id: t.id, megbizo: t.ajanlat.megbizo, felVaros: fel.varos, leVaros: le.varos, regi, illik: i });
      }
    }
    return {
      id: t.id, megbizo: t.ajanlat.megbizo, felVaros: fel.varos, leVaros: le.varos, felNap: fel.nap,
      arSzoveg: t.ajanlat.ar ? `${t.ajanlat.ar.osszeg.toLocaleString("hu-HU")} ${t.ajanlat.ar.penznem ?? "(pénznem?)"}` : null,
      illik, ehhez, nincsHely: !fp || !lp,
      allapot: t.allapot,
      ...(({ szoveg, regi }) => ({ kor: szoveg, regi }))(ajanlatFrissesseg(t.frissitveAt, most)),
    };
  }));
  // Elöl a friss, nyitott ajánlat (a legjobban illő első), utána a régi; a kiment ajánlat külön listában.
  const csoport = (a: HetAjanlat) => (a.allapot === "ajanlva" ? 2 : a.regi ? 1 : 0);
  ajanlatok.sort((a, b) => csoport(a) - csoport(b) || (a.illik ? a.illik.tobbletFt : 1e12) - (b.illik ? b.illik.tobbletFt : 1e12));

  const kiosztatlan = kiosztatlanCellak(sorok.filter((s) => !s.jarmu_kod).map(hetiFuvar), napok, ma);
  const utolsoNap = napok[napok.length - 1];
  const helyNelkul = sorok
    .filter((s) => s.fel_nap <= utolsoNap && s.le_nap >= napok[0] && s.le_nap >= ma && (s.fel_lat == null || s.le_lat == null))
    .map((s) => ({ id: s.id, cim: megbizoMegjelenites(s.jelleg, s.partner), utvonal: `${varos(s.felrako)} → ${varos(s.lerako)}` }));

  const elhelyezett = new Set<string>([
    ...kocsik.flatMap((k) => k.cellak.flatMap((c) => c.fuvarok.map((f) => f.id))),
    ...kiosztatlan.flat().map((f) => f.id),
  ]);
  const aktivKodok = new Set(jarmuvek.map((j) => j.kod));
  const kimaradt = sorok
    .filter((s) => s.fel_nap <= utolsoNap && s.le_nap >= napok[0] && !elhelyezett.has(s.id))
    .map((s) => ({
      id: s.id, cim: megbizoMegjelenites(s.jelleg, s.partner), utvonal: `${varos(s.felrako)} → ${varos(s.lerako)}`,
      ok: s.jarmu_kod && !aktivKodok.has(s.jarmu_kod)
        ? `a kocsi (${s.jarmu_kod}) nincs az aktív kocsik közt`
        : !s.jarmu_kod
          ? `kocsi nélkül${s.jarmu_szoveg ? ` („${s.jarmu_szoveg}” nem ismerhető fel)` : ""}, már lerakva`
          : "ismeretlen ok",
    }));

  // Amit a fenti lekérdezés ki sem hozott (állapot nélküli sor), az is látszódjon.
  const allapotNelkul = await query<{ id: string; jelleg: "ber" | "sajat"; partner: string | null; felrako: string | null; lerako: string | null }>(
    `select m.id::text, m.jelleg, coalesce(p.nev, m.megrendelo) as partner, m.felrako, m.lerako
       from fuvar_megbizasok m left join fuvar_partnerek p on p.id = m.partner_id
      where m.torolt_at is null and m.allapot is null and m.datum is not null
        and m.datum <= $2::date and coalesce(m.lerakas_datum, m.datum) >= $1::date
      limit 20`,
    [napok[0], utolsoNap]
  ).catch(() => []);
  for (const s of allapotNelkul) {
    kimaradt.push({ id: s.id, cim: megbizoMegjelenites(s.jelleg, s.partner), utvonal: `${varos(s.felrako)} → ${varos(s.lerako)}`, ok: "nincs állapota" });
  }

  return {
    ma, frissitve: ora, kimaradt, hetKezdet: napok[0], elozoHet: hetEltolva(napok[0], -1), kovetkezoHet: hetEltolva(napok[0], 1), ezAHet: napok[0] === mostaniHet, helyNelkul,
    napok, kocsik, kiosztatlan, resek,
    uresKmOssz: resek.reduce((a, r) => a + r.km, 0),
    ajanlatok, kijelolt,
    hivandok: kijelolt ? kiketHivj(kijelolt, mult) : [],
    riasztasok: riasztandok.map((r) => riasztasOsszerak(r, riasztasJeloltek.get(r.kulcs) ?? [], kiketHivj(r, mult))),
    kmKoltseg,
    eurArfolyam,
  };
}
