// A Ma oldal kocsi-oszlopának „tükör” sorai (Budaházi Zoltán, 2026-09-28,
// 18-as terv): középen a lépcső, balra a TERV (hely, ablak), jobbra a TÉNY
// (GPS / sofőr). A GPS nem tervezett állása nem a lap tetején, hanem itt,
// időrendben a helyén:
//   • ha egy olyan megálló városában volt, amelyre a GPS nem jelzett
//     érkezést (a cím nincs pontosan meg — Polgár, Pap tanya; Budapest,
//     Sörgyár u.), akkor annál a megállónál, „Ez a hely” rögzítéssel;
//   • különben külön sorként az első olyan megálló elé, ahová a kocsi még
//     nem érkezett meg, vagy csak utána érkezett.
//
// Tiszta függvény (nincs adatbázis) — scripts/teszt-ma-tukor.ts teszteli.

import { varosNev } from "@/lib/fuvarozas/varos";
import { kontaktNev, kontaktTelefon, megalloReszlete, type MegalloReszlet } from "@/lib/fuvarozas/sofor-adatok";

export type TukorAllas = {
  percek: number;
  cim: string | null;
  tol: string;
  ig: string;
  folyamatban: boolean;
  /** Ha a GPS-állás koordinátája megvan: „Ez a hely” — a megálló címéhez rögzíthető. */
  rogzites: { megbizasId: string; sorszam: number; lat: number; lon: number } | null;
};

export type TukorSor =
  | { tipus: "fuvar"; fuvarId: string; partner: string; hivatkozas: string | null; jelleg: "ber" | "sajat" }
  | {
      tipus: "megallo";
      fuvarId: string;
      felLe: "felrako" | "lerako";
      varos: string;
      /** Terv: időablak, más napra a nap nevével („kedd 08:00–12:00”). */
      terv: string | null;
      /** Tény: „07:16–09:24”, „ott 14:40 óta”, „ETA 17:35”. */
      teny: string | null;
      /** Eltérés a tervtől: „+18 p”, „késik 35 p”, „ablakban”, „+35 p várható”. */
      elteres: string | null;
      allapot: "kesz" | "most" | "kovetkezo" | "hatra";
      kiemelt: "kesik" | "varakozik" | null;
      allas: TukorAllas | null;
      ceg: string | null;
      kontaktNev: string | null;
      telefon: string | null;
    }
  | { tipus: "allas"; allas: TukorAllas };

export type TukorMegallo = {
  sorszam: number;
  tipus: "felrako" | "lerako";
  cim_nyers: string;
  ablak_tol: string | null;
  ablak_ig: string | null;
  gps_erkezes: string | null;
  gps_tavozas: string | null;
  sofor_kesz_at: string | null;
  varakozas_kezdete: string | null;
  varakozas_vege: string | null;
  tervezett_nap: string | null;
};

export type TukorFuvar = {
  id: string;
  partner: string | null;
  hivatkozas: string | null;
  jelleg: "ber" | "sajat";
  megallo_reszletek: MegalloReszlet[] | null;
  megallok: TukorMegallo[];
};

export type TukorGpsAllas = { kezdet: Date; veg: Date; cim: string | null; percek: number; lat: number | null; lon: number | null };

/** A Postgres „2026-09-20 07:00:00+00" alakját is érti. */
function idobelyeg(d: Date | string | null | undefined): Date | null {
  if (!d) return null;
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : d;
  let s = d.trim().replace(" ", "T");
  if (/[+-]\d{2}$/.test(s)) s += ":00";
  const t = new Date(s);
  return Number.isNaN(t.getTime()) ? null : t;
}
const ORA = (d: Date | null) =>
  d ? d.toLocaleTimeString("hu-HU", { timeZone: "Europe/Budapest", hour: "2-digit", minute: "2-digit" }) : "—";
const perc = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 60000);
const napNeve = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("hu-HU", { timeZone: "UTC", weekday: "long" });
const ekezetNelkul = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * A kocsi fuvarjai a valós sorrendben: előbb a már elkezdettek (van GPS-
 * érkezés vagy kész jelölés) a legkorábbi tényük szerint, utánuk a többi a
 * legkorábbi tervezett idejük (ablak, különben a nap) szerint; egyezésnél a
 * bejövő sorrend marad. A dátum+sorszám nem elég: Gergő 09-29-i napján a
 * később rögzített, de már elkezdett RBT-fuvar (#284) a korábban rögzített,
 * utána következő saját fuvar (#275) mögé került.
 */
function fuvarSorrend(fuvarok: TukorFuvar[]): TukorFuvar[] {
  const kulcs = (f: TukorFuvar) => {
    const tenyek = f.megallok
      .flatMap((g) => [idobelyeg(g.gps_erkezes), idobelyeg(g.sofor_kesz_at)])
      .filter((d): d is Date => d !== null)
      .map((d) => d.getTime());
    if (tenyek.length) return { elkezdve: 0, ido: Math.min(...tenyek) };
    const tervek = f.megallok
      .map((g) => idobelyeg(g.ablak_tol) ?? (g.tervezett_nap ? idobelyeg(`${g.tervezett_nap} 00:00:00+00`) : null))
      .filter((d): d is Date => d !== null)
      .map((d) => d.getTime());
    return { elkezdve: 1, ido: tervek.length ? Math.min(...tervek) : Number.MAX_SAFE_INTEGER };
  };
  return fuvarok
    .map((f, i) => ({ f, i, k: kulcs(f) }))
    .sort((a, b) => a.k.elkezdve - b.k.elkezdve || a.k.ido - b.k.ido || a.i - b.i)
    .map((x) => x.f);
}

export function tukorSorok(be: {
  fuvarok: TukorFuvar[];
  allasok: TukorGpsAllas[];
  /** Élő GPS-becslés a következő megállóhoz (ha nem bizonytalan). */
  eta: Date | null;
  /** Az ETA célja (város) — csak az ezzel egyező megállónál jelenik meg. Null: a következőnél. */
  etaCel?: string | null;
  most: Date;
  /** A mai nap (YYYY-MM-DD, Budapest). */
  ma: string;
}): TukorSor[] {
  const { most, ma } = be;
  const allasok = be.allasok.map((a) => ({ ...a, felhasznalva: false }));
  const allasSor = (a: (typeof allasok)[number], megallo: { megbizasId: string; sorszam: number } | null): TukorAllas => ({
    percek: a.percek,
    cim: a.cim,
    tol: ORA(a.kezdet),
    ig: ORA(a.veg),
    folyamatban: perc(most, a.veg) <= 5,
    rogzites: megallo && a.lat != null && a.lon != null ? { ...megallo, lat: a.lat, lon: a.lon } : null,
  });

  const eredmeny: TukorSor[] = [];
  // A megálló tényleges ideje — ehhez sorolódnak be a különálló állások.
  const rendezoIdo = new Map<TukorSor, number | null>();
  const fuvarok = fuvarSorrend(be.fuvarok);
  // Ahol a kocsi MOST áll (GPS-érkezés, nincs kész) — akkor is „most”, ha egy
  // előtte álló megálló még nyitott (Micó 09-29: a két etei lerakó közül a
  // másodikon kezdett, az első „következő” lett, a valódi „most” szürke).
  const mostItt = fuvarok.flatMap((f) => f.megallok).find((g) => g.gps_erkezes && !g.gps_tavozas && !g.sofor_kesz_at) ?? null;
  let kovetkezoVolt = false;
  const etaCel = be.etaCel ? ekezetNelkul(varosNev(be.etaCel) ?? be.etaCel) : null;
  for (const f of fuvarok) {
    eredmeny.push({ tipus: "fuvar", fuvarId: f.id, partner: f.partner ?? "(nincs megbízó)", hivatkozas: f.hivatkozas, jelleg: f.jelleg });
    for (const g of f.megallok) {
      const kesz = !!(g.gps_tavozas || g.sofor_kesz_at);
      const erk = idobelyeg(g.gps_erkezes);
      const tav = idobelyeg(g.gps_tavozas ?? g.sofor_kesz_at);
      const tol = idobelyeg(g.ablak_tol);
      const ig = idobelyeg(g.ablak_ig);
      const varos = varosNev(g.cim_nyers) ?? g.cim_nyers;
      const varakozik = !!(g.varakozas_kezdete && !g.varakozas_vege);

      // A GPS nem jelzett érkezést, de a kocsi a megálló városában állt: az
      // állás ide tartozik — a megálló címe nincs pontosan meg.
      let allas: TukorAllas | null = null;
      if (!erk) {
        const v = ekezetNelkul(varos);
        const a = v.length >= 3 ? allasok.find((x) => !x.felhasznalva && ekezetNelkul(x.cim ?? "").includes(v)) : undefined;
        if (a) {
          a.felhasznalva = true;
          allas = allasSor(a, { megbizasId: f.id, sorszam: g.sorszam });
        }
      }

      let allapot: "kesz" | "most" | "kovetkezo" | "hatra" = "kesz";
      if (!kesz) {
        if (g === mostItt || (!mostItt && !kovetkezoVolt && allas?.folyamatban)) allapot = "most";
        else if (!kovetkezoVolt) {
          allapot = "kovetkezo";
          kovetkezoVolt = true;
        } else allapot = "hatra";
        if (allapot === "most" && !mostItt) kovetkezoVolt = true;
      }
      const etaIde = allapot === "kovetkezo" && be.eta && (!etaCel || etaCel === ekezetNelkul(varos)) ? be.eta : null;

      const masNap = g.tervezett_nap && g.tervezett_nap !== ma ? napNeve(g.tervezett_nap) : null;
      const ablak = tol || ig ? (tol && ig && ORA(tol) !== ORA(ig) ? `${ORA(tol)}–${ORA(ig)}` : ORA(tol ?? ig)) : null;
      const terv = [masNap, ablak].filter(Boolean).join(" ") || null;

      let teny: string | null = null;
      if (kesz) teny = erk && tav ? `${ORA(erk)}–${ORA(tav)}` : ORA(tav ?? erk);
      else if (erk) teny = varakozik ? `várakozik ${perc(most, idobelyeg(g.varakozas_kezdete)!)} p` : `ott ${ORA(erk)} óta`;
      else if (allas) teny = allas.folyamatban ? `áll ${allas.tol} óta` : `állt ${allas.tol}–${allas.ig}`;
      else if (etaIde) teny = `ETA ${ORA(etaIde)}`;

      let elteres: string | null = null;
      const tenyKezdet = erk ?? (kesz ? tav : null);
      if (tenyKezdet && ig && tenyKezdet > ig) elteres = `+${perc(tenyKezdet, ig)} p`;
      else if (tenyKezdet && tol && ig) elteres = "ablakban";
      else if (!kesz && ig && ig < most) elteres = `késik ${perc(most, ig)} p`;
      else if (etaIde && ig && etaIde > ig) elteres = `+${perc(etaIde, ig)} p várható`;

      // A mostani / következő megállónál a cég és a helyszíni kontakt is kell.
      let ceg: string | null = null;
      let kNev: string | null = null;
      let tel: string | null = null;
      if (allapot === "most" || allapot === "kovetkezo") {
        const azonosTipus = f.megallok.filter((x) => x.tipus === g.tipus);
        const r = megalloReszlete(f.megallo_reszletek, g.tipus, azonosTipus.indexOf(g), azonosTipus.length, g.cim_nyers);
        ceg = r?.ceg ?? null;
        kNev = kontaktNev(r?.kontakt);
        tel = kontaktTelefon(r?.kontakt);
      }

      const sor: TukorSor = {
        tipus: "megallo", fuvarId: f.id, felLe: g.tipus, varos, terv, teny, elteres, allapot,
        kiemelt: varakozik ? "varakozik" : !kesz && ig && ig < most ? "kesik" : null,
        allas, ceg, kontaktNev: kNev, telefon: tel,
      };
      rendezoIdo.set(sor, (erk ?? tav)?.getTime() ?? null);
      eredmeny.push(sor);
    }
  }

  // A különálló állások a helyükre: az első olyan megálló elé (a fuvar
  // fejléce elé, ha az az első megállója), ahová még nem érkezett meg, vagy
  // csak utána érkezett. Időrendben szúrjuk be: az azonos helyre kerülő
  // későbbi állás a korábbi mögé kerül.
  for (const a of allasok.filter((x) => !x.felhasznalva).sort((x, y) => x.kezdet.getTime() - y.kezdet.getTime())) {
    let i = eredmeny.findIndex((r) => r.tipus === "megallo" && ((rendezoIdo.get(r) ?? null) === null || rendezoIdo.get(r)! > a.kezdet.getTime()));
    if (i === -1) i = eredmeny.length;
    else if (i > 0 && eredmeny[i - 1].tipus === "fuvar") i -= 1;
    eredmeny.splice(i, 0, { tipus: "allas", allas: allasSor(a, null) });
  }
  return eredmeny;
}
