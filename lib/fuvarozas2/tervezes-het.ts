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
  ajanlatFrissesseg, hetiReszek, illeszt, kiketHivj, kiosztatlanCellak, legjobbRes, utKm,
  riasztandoResek, riasztasOsszerak, szunetSavok, ablakKezdet, munkanapLepes, tervAblak, ABLAK_MUNKANAP, type RiasztasAjanlat, type VisszfuvarRiasztas,
  type AjanlatHely, type HetiFuvar, type HivandoPartner, type Illeszkedes, type MultFuvar, type NapCella, type Res,
} from "@/lib/fuvarozas2/tervezes-het-alap";
import { legutobbiTacho } from "@/lib/jarmu-telemetria/repo";
import { getFleetLastPositions, parseEcofleetTimestamp } from "@/lib/fuvarozas/ecofleet";
import { tachoKijelzes } from "@/lib/fuvarozas2/tervezes-het-tacho";
import { szamoljUtemtervet, type UtemKocsiBemenet } from "@/lib/fuvarozas2/heti-utemterv";
import type { KocsiUtemterv } from "@/lib/fuvarozas2/heti-utemterv-alap";
import { getBejegyzesSorok, getTavolletek } from "@/lib/fuvarozas2/bejegyzesek";
import { bejegyzesekNapokra, elofordulNapon, tavolletekNapokra, type Bejegyzes, type TavolletTipus } from "@/lib/fuvarozas2/bejegyzes-alap";
import { getKihasznaltsag, type KihasznaltsagAdat } from "@/lib/fuvarozas2/kihasznaltsag";
import type { JarmuSzin } from "@/lib/fuvarozas/vehicles";
import { elvinniSurgosseg, type ElvinniSurgosseg } from "@/lib/megbizasok/elvinni-szabalyok";
import { legjobbElvinniHelyek, ujElvinniKozos, UTBA_ESO_KM, type ElvinniHely } from "@/lib/megbizasok/elvinni-het";

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
  /** A napok közti nem-munkanap szakaszok (a második oszlop napja előtt), pl. „P ünnep · Szo · V” — keskeny sáv a rácsban. */
  szunetSavok: { elott: string; cimke: string }[];
  /**
   * `tacho`: friss tachó-chip („ma 2 ó 40 p · hét 26 ó 25 p hátra”) + súgó — csak a mostani héten, különben nincs.
   * `utemterv`: a becslő motor (heti-utemterv-alap.ts) eredménye — null, ha hibázott / kifutott az időből (a rács a régi módon jelenik meg).
   */
  kocsik: {
    kod: string; sofor: string; cellak: NapCella[]; tacho?: { chip: string; reszletek: string } | null; utemterv: KocsiUtemterv | null;
    /** B1 (docs/het-b1-terv.md): a törzsadat színe, a nem-fuvar bejegyzések és a sofőr távollétei naponként. */
    szin: JarmuSzin | null;
    bejegyzesek: Record<string, Bejegyzes[]>;
    tavollet: Record<string, TavolletTipus>;
  }[];
  /** Heti / havi összefoglaló az oldalsáv tetejére (getKihasznaltsag) — null: nem készült el időben / hiba. */
  osszegzes: KihasznaltsagAdat | null;
  /** Kocsira váró (ki nem osztott) fuvarok napra bontva, a `napok` sorrendjében. */
  kiosztatlan: HetiFuvar[][];
  /**
   * Rugalmas saját fuvarok (Elvinni való, 2026-10-19) napra bontva: minden
   * fuvar azokon a napokon jelenik meg, amelyekre vihető (legkorábban …
   * határidő, ma előtt nem). Sürgősség: elvinniSurgosseg.
   */
  elvinni: { id: string; utvonal: string; legkesobb: string | null; surgosseg: ElvinniSurgosseg; hatarnap: boolean; legjobb: (ElvinniHely & { utbaEso: boolean }) | null }[][];
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
  /** A felrakó / lerakó tényleges ideje (GPS / sofőr), „YYYY-MM-DD HH:MI”, ha már megtörtént. */
  fel_teny: string | null; le_teny: string | null;
};

const pont = (lat: number | null, lon: number | null): Pont | null => (lat != null && lon != null ? { lat: Number(lat), lon: Number(lon) } : null);
const varos = (s: string | null) => varosNev(s ?? "") || "?";

async function geo1(cim: string): Promise<Pont | null> {
  const ido = new Promise<null>((r) => setTimeout(() => r(null), 4000));
  const g = await Promise.race([geokodolCachelve(cim).catch(() => null), ido]);
  return g ? { lat: g.lat, lon: g.lon } : null;
}

/**
 * A címben gyakran cég- vagy telepnév áll („Záhony, Solinwest Agro Telep”,
 * #329, 2026-10-19), amit a HU-GO címkereső nem ismer → a fuvar „helye nem
 * ismert” lett. Tartalék, sorrendben: a teljes cím; csak a település + a
 * számot tartalmazó (utca/házszám) részek; végül csak a település. A rés-
 * számításhoz a településszintű pont is elég.
 */
async function geo(cim: string): Promise<Pont | null> {
  const telepules = varosNev(cim);
  const reszek = cim.split(",").map((r) => r.trim()).filter(Boolean);
  const tisztitott = [reszek[0], ...reszek.slice(1).filter((r) => /\d/.test(r))].join(", ");
  // Ha a település nem az első részben áll („Florasca Tőzegüzem, Osli”, #330,
  // 2026-10-21), a többi, településnévnek látszó rész is jelölt (1–2 szó, szám
  // és cégjelölés nélkül).
  const telepulesSzeru = reszek.slice(1).filter((r) => !/\d/.test(r) && r.split(/\s+/).length <= 2 && !/(kft|zrt|bt|telep|üzem|uzem|raktár|raktar|áruház|aruhaz|kft\.)/i.test(r));
  const jeloltek = [...new Set([cim, tisztitott, telepules, ...telepulesSzeru].filter((c) => c && c.trim().length >= 2))];
  for (const c of jeloltek) {
    const p = await geo1(c);
    if (p) return p;
  }
  return null;
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
  // 2026-10-17: nem naptári hét — egy munkanap vissza + előre (szombat csak fuvarral, vasárnap soha).
  // A `het` paraméter az ablak első napja (lapozás 5 munkanappal, egy nap átfedéssel).
  const alapKezdet = ablakKezdet(ma);
  const kezdet = het && /^\d{4}-\d{2}-\d{2}$/.test(het) ? het : alapKezdet;
  const vazlat = tervAblak(kezdet);

  const sorok = await query<Sor>(
    `select m.id::text, m.jelleg, m.allapot, j.kod as jarmu_kod, coalesce(nullif(trim(m.jarmu), ''), nullif(trim(m.sofor), '')) as jarmu_szoveg, coalesce(p.nev, m.megrendelo) as partner,
       coalesce(fel.cim_nyers, m.felrako) as felrako, coalesce(le.cim_nyers, m.lerako) as lerako,
       to_char(m.datum, 'YYYY-MM-DD') as fel_nap, to_char(coalesce(m.lerakas_datum, m.datum), 'YYYY-MM-DD') as le_nap,
       m.fuvardij, coalesce(m.fuvardij_penznem, 'Ft') as penznem,
       fel.lat as fel_lat, fel.lon as fel_lon, le.lat as le_lat, le.lon as le_lon, fel.teny as fel_teny, le.teny as le_teny
     from fuvar_megbizasok m
     left join fuvar_partnerek p on p.id = m.partner_id
     left join fuvar_jarmuvek j on j.id = m.jarmu_id
     left join lateral (select g.cim_nyers, g.lat, g.lon, to_char(coalesce(g.gps_erkezes, g.sofor_megerkezett_at, g.sofor_kesz_at, g.gps_tavozas) at time zone 'Europe/Budapest', 'YYYY-MM-DD HH24:MI') as teny from fuvar_megallok g where g.megbizas_id = m.id and g.tipus = 'felrako' order by g.sorszam limit 1) fel on true
     left join lateral (select g.cim_nyers, g.lat, g.lon, to_char(coalesce(g.gps_erkezes, g.sofor_megerkezett_at, g.sofor_kesz_at, g.gps_tavozas) at time zone 'Europe/Budapest', 'YYYY-MM-DD HH24:MI') as teny from fuvar_megallok g where g.megbizas_id = m.id and g.tipus = 'lerako' order by g.sorszam desc limit 1) le on true
     where m.torolt_at is null and m.allapot is not null and m.datum is not null
       and coalesce(m.lerakas_datum, m.datum) >= $1::date - 180 and m.datum <= $2::date
     order by m.datum, m.id`,
    [vazlat[0], vazlat[vazlat.length - 1]]
  );
  // Ami már megtörtént, annak a TÉNYLEGES napja számít, nem a tervezett
  // (2026-10-21: a keddre írt Tata → Tompaládony szerdán ment).
  for (const s of sorok) {
    if (s.fel_teny) s.fel_nap = s.fel_teny.slice(0, 10);
    if (s.le_teny) s.le_nap = s.le_teny.slice(0, 10);
    if (s.le_nap < s.fel_nap) s.le_nap = s.fel_nap;
  }
  // …ami pedig még NEM történt meg, az nem maradhat a múltban (ott kiesne a
  // láncból): a csúszott fuvar a mai napra tolódik, a hossza megmarad
  // (Budaházi Zoltán, 2026-10-21: „ha átcsúszik egy nappal, akkor sem tűnhet el”).
  const napPlusz = (nap: string, d: number) => { const t = new Date(`${nap}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };
  const napKul = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
  for (const s of sorok) {
    const nyitott = s.allapot === "ellenorzesre_var" || s.allapot === "tervezett" || s.allapot === "folyamatban";
    if (!nyitott || s.le_teny || s.le_nap >= ma) continue;
    if (s.fel_teny) s.le_nap = ma; // felrakva, a lerakás csúszik
    else if (s.fel_nap < ma) { const hossz = napKul(s.fel_nap, s.le_nap); s.fel_nap = ma; s.le_nap = napPlusz(ma, Math.max(0, hossz)); }
    else s.le_nap = ma;
  }
  // B1: a bejegyzések előre kellenek — a szombat / ünnep oszlop akkor is megjelenik, ha aznap bejegyzés van (QA #1).
  const bejegyzesElore = await getBejegyzesSorok(vazlat[0], vazlat[vazlat.length - 1]).catch((e) => { console.warn("[het] bejegyzések:", e instanceof Error ? e.message : e); return [] as Awaited<ReturnType<typeof getBejegyzesSorok>>; });
  // Szombat / ünnep oszlop csak akkor, ha aznap van felrakás, lerakás vagy bejegyzés.
  const napok = tervAblak(kezdet, (nap) => sorok.some((s) => s.fel_nap === nap || s.le_nap === nap) || bejegyzesElore.some((b) => elofordulNapon(b, nap)));
  // B1: távollétek, heti/havi összefoglaló — párhuzamosan; hiba esetén üres / null (a lap nem törhet el).
  const ablakTol = napok[0], ablakIg = napok[napok.length - 1];
  const bejegyzesIgeret = Promise.resolve(bejegyzesElore);
  const tavolletIgeret = getTavolletek(ablakTol, ablakIg).catch((e) => { console.warn("[het] távollétek:", e instanceof Error ? e.message : e); return []; });
  const osszegzesIgeret = getKihasznaltsag(ma).catch(() => null);

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
  )).map((j) => {
    const torzs = findJarmuByKod(j.kod, jarmuLista);
    return { kod: j.kod, sofor: torzs?.sofor ?? j.sofor?.split(" ").pop() ?? j.kod, szin: torzs?.szin ?? null };
  });

  const hetiFuvar = (s: Sor): HetiFuvar => ({
    id: s.id, cim: megbizoMegjelenites(s.jelleg, s.partner), felVaros: varos(s.felrako), leVaros: varos(s.lerako),
    fel: pont(s.fel_lat, s.fel_lon), le: pont(s.le_lat, s.le_lon), felNap: s.fel_nap, leNap: s.le_nap, sajat: s.jelleg === "sajat",
    allapot: s.allapot, felIdo: s.fel_teny,
  });

  // Tachó csak a mostani héten (élő állapot); a tábla hiánya / hiba → nincs chip.
  const tachoMost = new Date();
  const tachok = kezdet === alapKezdet ? await legutobbiTacho().catch(() => new Map<string, never>()) : new Map<string, never>();

  // A kocsik mostani GPS-helye (csak a mai nézetben, friss jel ≤ 3 óra).
  const mostHelyek = new Map<string, { pont: Pont; varos: string }>();
  if (kezdet === alapKezdet) {
    try {
      const objok = await query<{ kod: string; obj: string | null }>(`select kod, ecofleet_object_id as obj from fuvar_jarmuvek where aktiv`);
      const poz = await Promise.race([getFleetLastPositions(), new Promise<never[]>((r) => setTimeout(() => r([]), 4000))]);
      for (const o of objok) {
        const p = o.obj ? poz.find((x) => x.objectId === o.obj) : undefined;
        const d = p ? parseEcofleetTimestamp(p.timestamp) : null;
        if (p && d && Date.now() - d.getTime() <= 3 * 3600_000 && Number.isFinite(p.latitude) && Number.isFinite(p.longitude)) {
          mostHelyek.set(o.kod, { pont: { lat: p.latitude, lon: p.longitude }, varos: "a mostani helye (GPS)" });
        }
      }
    } catch (e) {
      console.warn("[het] GPS-hely:", e instanceof Error ? e.message : e);
    }
  }

  const resek: Res[] = [];
  const utemBemenet: UtemKocsiBemenet[] = [];
  const kocsikAlap = jarmuvek.map((j) => {
    const sajat = sorok.filter((s) => s.jarmu_kod === j.kod);
    const elozo = sajat.filter((s) => s.le_nap < napok[0] && s.le_lat != null).pop();
    const elozoVeg = elozo ? { pont: pont(elozo.le_lat, elozo.le_lon)!, varos: varos(elozo.lerako) } : null;
    const r = hetiReszek(
      { kod: j.kod, sofor: j.sofor, fuvarok: sajat.map(hetiFuvar), elozoVeg, most: mostHelyek.get(j.kod) ?? null },
      napok, telephely, kmKoltseg, ma
    );
    resek.push(...r.resek);
    utemBemenet.push({
      kod: j.kod, elozoVeg,
      fuvarok: sajat.map((s) => ({ ...hetiFuvar(s), jelleg: s.jelleg, fuvardij: s.fuvardij, penznem: s.penznem, felrako: s.felrako, lerako: s.lerako })),
    });
    const tk = tachoKijelzes(tachok.get(j.kod)?.tacho, tachoMost);
    return { kod: j.kod, sofor: j.sofor, cellak: r.cellak, tacho: tk ? { chip: tk.chip, reszletek: tk.reszletek } : null };
  });

  // Rács 2.0 ütemterv (docs/het-racs-2-terv.md): a többi betöltéssel párhuzamosan fut; bármilyen hiba
  // vagy időtúllépés → null, a rács a régi módon jelenik meg (a lap sosem törhet el miatta).
  const utemtervek: Promise<Map<string, KocsiUtemterv | null> | null> = (async () => {
    let t: ReturnType<typeof setTimeout> | undefined;
    try {
      const ido = new Promise<null>((r) => { t = setTimeout(() => r(null), 8000); });
      // B1: a bejegyzések megállóként / foglalt időszakként, a távollét foglalt időszakként kerül a becslőbe.
      const tav = tavolletekNapokra(await tavolletIgeret);
      const bej = bejegyzesekNapokra(bejegyzesElore, napok);
      const kocsikB1 = utemBemenet.map((k) => ({
        ...k,
        bejegyzesek: Object.values(bej[k.kod] ?? {}).flat(),
        tavolletNapok: Object.keys(tav[k.kod] ?? {}),
      }));
      return await Promise.race([szamoljUtemtervet({ napok, ma, most: `${ma}T${ora}`, telephely, kocsik: kocsikB1 }).catch(() => null), ido]);
    } catch {
      return null;
    } finally {
      clearTimeout(t);
    }
  })();

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
    // Csak nyitott, napra szóló ajánlat (nap nélkülit nem ajánlunk egy konkrét napi üres útra — QA #4).
    if (t.allapot === "nyitott" && fel.nap) {
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
    ...kocsikAlap.flatMap((k) => k.cellak.flatMap((c) => c.fuvarok.map((f) => f.id))),
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

  const utem = await utemtervek;
  const [bejegyzesSorok, tavolletSorok, osszegzes] = await Promise.all([bejegyzesIgeret, tavolletIgeret, osszegzesIgeret]);
  const bejegyzesTerkep = bejegyzesekNapokra(bejegyzesSorok, napok);
  const tavolletTerkep = tavolletekNapokra(tavolletSorok);
  const szinek = new Map(jarmuvek.map((j) => [j.kod, j.szin]));
  const kocsik = kocsikAlap.map((k) => ({
    ...k, utemterv: utem?.get(k.kod) ?? null,
    szin: szinek.get(k.kod) ?? null, bejegyzesek: bejegyzesTerkep[k.kod] ?? {}, tavollet: tavolletTerkep[k.kod] ?? {},
  }));
  let savok: { elott: string; cimke: string }[] = [];
  try { savok = szunetSavok(napok); } catch { savok = []; }

  const elvinniSorok = await query<{ id: string; felrako: string | null; lerako: string | null; legkorabban: string | null; legkesobb: string | null }>(
    `select id::text, felrako, lerako, to_char(legkorabban, 'YYYY-MM-DD') as legkorabban, to_char(legkesobb, 'YYYY-MM-DD') as legkesobb
       from fuvar_megbizasok
      where jelleg = 'sajat' and elokeszites and idopont_nyitott and torolt_at is null
      order by legkesobb nulls last, id`
  ).catch(() => []);
  // 2. lépés: fuvaronként a legjobb hely (kocsi + nap, legkevesebb üres km a felrakóig).
  // Időkorlát: a lap nem várhat 6 mp-nél tovább — ami addig nem készül el, csillag nélkül marad (a geokód utána már gyorsítótárból jön).
  const legjobbak = new Map<string, (ElvinniHely & { utbaEso: boolean }) | null>();
  // A hetek közös adatát (kocsik, a hét munkái) egyszer kérdezzük le, nem fuvaronként (audit P2).
  const elvinniKozos = ujElvinniKozos();
  const legjobbMunka = Promise.all(elvinniSorok.slice(0, 15).map(async (e) => {
    const [h] = await legjobbElvinniHelyek(e.id, 1, elvinniKozos).catch((err) => { console.warn("[het] elvinni legjobb hely:", err instanceof Error ? err.message : err); return [] as ElvinniHely[]; });
    legjobbak.set(e.id, h ? { ...h, utbaEso: h.km <= UTBA_ESO_KM || elvinniSurgosseg(e.legkesobb, ma) === "piros" } : null);
  }));
  await Promise.race([legjobbMunka, new Promise((r) => setTimeout(r, 6000))]);
  const elvinni = napok.map((nap) =>
    elvinniSorok
      .filter((e) => nap >= ma && (!e.legkorabban || nap >= e.legkorabban) && (!e.legkesobb || nap <= e.legkesobb || (e.legkesobb < ma && nap === ma)))
      .map((e) => ({
        id: e.id,
        utvonal: `${varos(e.felrako)} → ${varos(e.lerako)}`,
        legkesobb: e.legkesobb,
        surgosseg: elvinniSurgosseg(e.legkesobb, ma),
        hatarnap: !!e.legkesobb && (nap === e.legkesobb || (e.legkesobb < ma && nap === ma)),
        legjobb: legjobbak.get(e.id) ?? null,
      }))
  );

  return {
    ma, frissitve: ora, kimaradt, elvinni, hetKezdet: napok[0], elozoHet: munkanapLepes(kezdet, -(ABLAK_MUNKANAP - 1)), kovetkezoHet: munkanapLepes(kezdet, ABLAK_MUNKANAP - 1), ezAHet: kezdet === alapKezdet, helyNelkul,
    napok, szunetSavok: savok, kocsik, kiosztatlan, resek,
    uresKmOssz: resek.reduce((a, r) => a + r.km, 0),
    ajanlatok, kijelolt,
    hivandok: kijelolt ? kiketHivj(kijelolt, mult) : [],
    riasztasok: riasztandok.map((r) => riasztasOsszerak(r, riasztasJeloltek.get(r.kulcs) ?? [], kiketHivj(r, mult))),
    kmKoltseg,
    eurArfolyam,
    osszegzes,
  };
}
