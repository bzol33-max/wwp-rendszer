// Hét rács 2.0 · becslő motor (tiszta modul, nincs I/O, nincs Date.now()).
// Spec: docs/het-racs-2-terv.md („Becslő motor”), teszt: scripts/teszt-het-utemterv.ts.
//
// Idők kívül: helyi Budapest "YYYY-MM-DDTHH:MM"; belül valós (UTC) percben számolunk a
// kamionstop.ts DST-biztos helpereivel (valos/helyi), a nap-hozzárendelés a helyi naptári nap.
//
// Vezetési szabály (lib/fuvarozas/eta-lanc.ts vezetSzaballyal + megalloTavozas):
//   - min(maradék, szünetig, keretig, tilalomig) vezetés; ha a tilalom ér előbb (vagy egyszerre):
//     megállás az ablak elején, várakozás a végéig (≥ szünet → folyamatos nullázás, ≥ napi pihenő →
//     mindkét számláló nullázás); különben ha keretig <= szünetig → napi pihenő, egyébként szünet.
//   - megállóban várakozás az ablakTol-ig (≥ 45 p szünet, ≥ 660 p napi pihenő); a rakodás nem szünet.
//   - a fuvar első megállója előtti tétlen rés (előző távozás → indulás) ugyanígy várakozásnak számít.
// Napi mérleg: a vezetés/km a ténylegesen arra a helyi napra eső percek szerint (a szakasz km-je a
// vezetett percekkel arányosan oszlik — napi pihenő, kamionstop és éjfél is vágja). A kezdő napon a
// vezetés tartalmazza a kezdes.napiPerc-et. `vegez` = az aznapi utolsó megálló-távozás, ha utána
// aznap nincs több menet / érkezés / napi pihenő / kamionstop; különben null.

import { helyi, napEltol, valos, type TilalmiAblak } from "@/lib/fuvarozas2/kamionstop";

export type UtemMegallo = {
  tipus: "felrako" | "lerako";
  varos: string;
  nap: string;                 // tervezett nap "YYYY-MM-DD"
  ablakTol: string | null;     // helyi "YYYY-MM-DDTHH:MM"
  ablakIg: string | null;
  rakodasPerc: number;         // tanult vagy alapértelmezett
};
export type UtemFuvar = {
  id: string; cim: string; jelleg: "ber" | "sajat";
  dijFt: number | null;        // forintra váltva; saját: null
  megallok: UtemMegallo[];     // sorrendben, ≥ 1
  /** Menet a megállók között (megallok.length - 1 elem): perc és km. */
  szakaszok: { perc: number; km: number; becsles: boolean }[];
  /** Üres ráállás az előző pontról az első megállóig. */
  raallas: { perc: number; km: number; becsles: boolean };
};
export type UtemKezdes = {
  ido: string;                 // a lánc legkorábbi kezdése (pl. holnap 06:00, vagy most)
  folyamatosPerc: number;      // utolsó ≥45 p szünet óta vezetett
  napiPerc: number;            // ma már vezetett (tachóból: 540 − napi_hatra)
};
export type UtemParam = {
  napKezdes: string;           // "06:00" — egy új nap legkorábbi indulása, ha nincs ablak
  szunetUtanPerc: number; szunetPerc: number; napiMaxPerc: number; napiPihenoPerc: number; // 270/45/540/660
  tilalmak: TilalmiAblak[];
};

export type MegalloEredmeny = {
  tipus: "felrako" | "lerako"; varos: string;
  erkezes: string; kezdes: string; tavozas: string; varakozasPerc: number;
  tartalekPerc: number | null; // ablakIg − erkezes (percben); nincs ablakIg → null
};
export type FuvarEredmeny = {
  id: string;
  megallok: MegalloEredmeny[];
  rakottKm: number; uresKmElotte: number; dijFt: number | null; ftKm: number | null; // díj / rakott km, egészre
  legszukebbTartalek: number | null; // min(tartalekPerc), ha van
  becsles: boolean;                  // bármely szakasz becslés
};
export type NapMerleg = {
  nap: string;
  vegez: { ido: string; varos: string } | null;   // az aznapi utolsó távozás (ha aznap ér véget)
  rakottKm: number; uresKm: number;
  berFt: number;              // több napos fuvar: km-arányosan szétosztva a napokra
  vezetesPerc: number;
  napiPihenoTol: string | null; // ha aznap a lánc napi pihenőre áll meg útközben
  kamionstop: TilalmiAblak | null;
  delutanSzabad: { tol: string; maradekVezetesPerc: number } | null; // vegez < 15:00 és maradék ≥ 180
};
export type KocsiUtemterv = { fuvarok: FuvarEredmeny[]; napok: NapMerleg[] };

type NapGyujto = {
  vezetes: number; rakott: number; ures: number; ber: number;
  vegez: { ido: string; varos: string } | null;
  napiPihenoTol: string | null;
  kamionstop: TilalmiAblak | null;
};

const ures = (): NapGyujto => ({ vezetes: 0, rakott: 0, ures: 0, ber: 0, vegez: null, napiPihenoTol: null, kamionstop: null });
const napja = (t: number) => helyi(t).slice(0, 10);
const egesz = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.round(x)) : 0);

export function utemterv(fuvarok: UtemFuvar[], kezdes: UtemKezdes, p: UtemParam, napok: string[]): KocsiUtemterv {
  const gyujto = new Map<string, NapGyujto>();
  const g = (nap: string) => {
    let x = gyujto.get(nap);
    if (!x) gyujto.set(nap, (x = ures()));
    return x;
  };
  const tilalmak = p.tilalmak
    .map((a) => ({ tol: valos(a.tol), ig: valos(a.ig), ablak: a }))
    .sort((a, b) => a.tol - b.tol);

  let t = valos(kezdes.ido);
  let folyamatos = Math.max(0, kezdes.folyamatosPerc);
  let napi = Math.max(0, kezdes.napiPerc);
  g(napja(t)).vezetes += napi;

  /** Állás (várakozás) hatása a számlálókra. */
  const allas = (perc: number) => {
    if (perc >= p.szunetPerc) folyamatos = 0;
    if (perc >= p.napiPihenoPerc) napi = 0;
  };

  /** Vezetett darab rögzítése a napokra (éjfélnél vágva, km arányosan). */
  const rogzit = (tol: number, perc: number, km: number, rakott: boolean, fuvarNapKm: Map<string, number>) => {
    let s = tol;
    let hatra = perc;
    while (hatra > 0) {
      const nap = napja(s);
      const ejfel = valos(`${napEltol(nap, 1)}T00:00`);
      const most = Math.min(hatra, ejfel - s);
      const dkm = (km * most) / perc;
      const x = g(nap);
      x.vezetes += most;
      if (rakott) {
        x.rakott += dkm;
        fuvarNapKm.set(nap, (fuvarNapKm.get(nap) ?? 0) + dkm);
      } else x.ures += dkm;
      x.vegez = null;
      s += most;
      hatra -= most;
    }
  };

  /** Menet a vezetési szabállyal és a kamionstoppal; visszaadja az érkezést. */
  const vezet = (percBe: number, km: number, rakott: boolean, fuvarNapKm: Map<string, number>) => {
    const ossz = egesz(percBe);
    if (ossz <= 0) {
      if (km > 0) {
        const x = g(napja(t));
        if (rakott) {
          x.rakott += km;
          fuvarNapKm.set(napja(t), (fuvarNapKm.get(napja(t)) ?? 0) + km);
        } else x.ures += km;
      }
      return;
    }
    let maradek = ossz;
    // Védőkorlát hibás (óriási) menetidőre.
    for (let kor = 0; maradek > 0 && kor < 1000; kor++) {
      const ban = tilalmak.find((a) => a.ig > t);
      if (ban && ban.tol <= t) {
        const x = g(napja(t));
        x.kamionstop ??= { ...ban.ablak };
        x.vegez = null;
        allas(ban.ig - t);
        t = ban.ig;
        continue;
      }
      const tilalomig = ban ? ban.tol - t : Infinity;
      const szunetig = p.szunetUtanPerc > 0 ? Math.max(0, p.szunetUtanPerc - folyamatos) : Infinity;
      const keretig = p.napiMaxPerc > 0 ? Math.max(0, p.napiMaxPerc - napi) : Infinity;
      const most = Math.min(maradek, szunetig, keretig, tilalomig);
      if (most > 0) {
        rogzit(t, most, (km * most) / ossz, rakott, fuvarNapKm);
        t += most;
        maradek -= most;
        folyamatos += most;
        napi += most;
      }
      if (maradek <= 0) break;
      // A tilalom ér előbb (vagy egyszerre): a következő körben az ablak végéig vár — ez fedi a szünetet/pihenőt.
      if (tilalomig <= Math.min(szunetig, keretig)) continue;
      if (keretig <= szunetig) {
        const x = g(napja(t));
        x.napiPihenoTol ??= helyi(t);
        x.vegez = null;
        t += p.napiPihenoPerc;
        folyamatos = 0;
        napi = 0;
      } else {
        // Ha a szünet tilalmi ablakba nyúlik, a következő kör az ablak végéig vár (a várakozás fedi).
        t += p.szunetPerc;
        folyamatos = 0;
      }
    }
  };

  const fuvarEredmenyek: FuvarEredmeny[] = [];
  const berTetelek: { dij: number; napKm: Map<string, number>; tartalekNap: string }[] = [];

  for (const f of fuvarok) {
    const napKm = new Map<string, number>();
    const megallok: MegalloEredmeny[] = [];
    let elsoTavozasNap: string | null = null;

    for (let i = 0; i < f.megallok.length; i++) {
      const m = f.megallok[i];
      if (i === 0) {
        // Indulás: max(előző távozás, a megálló napjának napKezdes-e); a tétlen rés várakozás.
        const indulas = Math.max(t, valos(`${m.nap}T${p.napKezdes}`));
        allas(indulas - t);
        t = indulas;
        vezet(f.raallas.perc, f.raallas.km, false, napKm);
      } else {
        const sz = f.szakaszok[i - 1] ?? { perc: 0, km: 0, becsles: false };
        vezet(sz.perc, sz.km, true, napKm);
      }
      const erkezes = t;
      g(napja(erkezes)).vegez = null;
      const tol = m.ablakTol ? valos(m.ablakTol) : null;
      const kezd = tol != null && tol > erkezes ? tol : erkezes;
      const varakozas = kezd - erkezes;
      allas(varakozas);
      const tavozas = kezd + egesz(m.rakodasPerc);
      t = tavozas;
      g(napja(tavozas)).vegez = { ido: helyi(tavozas), varos: m.varos };
      elsoTavozasNap ??= napja(tavozas);
      megallok.push({
        tipus: m.tipus, varos: m.varos,
        erkezes: helyi(erkezes), kezdes: helyi(kezd), tavozas: helyi(tavozas),
        varakozasPerc: varakozas,
        tartalekPerc: m.ablakIg ? valos(m.ablakIg) - erkezes : null,
      });
    }

    const rakottKm = f.szakaszok.reduce((s, x) => s + x.km, 0);
    const tartalekok = megallok.map((m) => m.tartalekPerc).filter((x): x is number => x != null);
    fuvarEredmenyek.push({
      id: f.id,
      megallok,
      rakottKm,
      uresKmElotte: f.raallas.km,
      dijFt: f.dijFt,
      ftKm: f.dijFt != null && rakottKm > 0 ? Math.round(f.dijFt / rakottKm) : null,
      legszukebbTartalek: tartalekok.length ? Math.min(...tartalekok) : null,
      becsles: f.raallas.becsles || f.szakaszok.some((x) => x.becsles),
    });
    if (f.jelleg === "ber" && f.dijFt != null) {
      berTetelek.push({ dij: f.dijFt, napKm, tartalekNap: elsoTavozasNap ?? napja(t) });
    }
  }

  // Bér napokra: a rakott km arányában (rakott km nélkül: az első távozás napjára).
  for (const b of berTetelek) {
    const ossz = [...b.napKm.values()].reduce((s, x) => s + x, 0);
    if (ossz > 0) for (const [nap, km] of b.napKm) g(nap).ber += (b.dij * km) / ossz;
    else g(b.tartalekNap).ber += b.dij;
  }

  const napMerlegek: NapMerleg[] = napok.map((nap) => {
    const x = gyujto.get(nap) ?? ures();
    const maradek = p.napiMaxPerc - x.vezetes;
    const delutanSzabad =
      x.vegez && x.vegez.ido < `${nap}T15:00` && maradek >= 180 ? { tol: x.vegez.ido, maradekVezetesPerc: maradek } : null;
    return {
      nap,
      vegez: x.vegez,
      rakottKm: x.rakott,
      uresKm: x.ures,
      berFt: x.ber,
      vezetesPerc: x.vezetes,
      napiPihenoTol: x.napiPihenoTol,
      kamionstop: x.kamionstop,
      delutanSzabad,
    };
  });

  return { fuvarok: fuvarEredmenyek, napok: napMerlegek };
}
