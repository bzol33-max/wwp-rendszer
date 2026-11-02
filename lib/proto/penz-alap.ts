// Prototípus (2026-11): az új fuvareredmény-képlet tiszta számítása, se DB, se
// hálózat. Fedezet = bevétel − üzemanyag − útdíj − egyéb − a fuvarhoz vezető
// üres út. Nettó = fedezet − sofőr − kocsi fix.

export const SOFOR_HAVI_FT = 850_000;
export const KOCSI_FIX_NAPI_FT = 0;

export type ProtoForras = "teny" | "reszben" | "becsles";

export type ProtoBemenet = {
  id: string;
  jelleg: "ber" | "sajat";
  nap: string;
  jarmuKod: string;
  partner: string | null;
  kitolKinek: string | null;
  hivatkozas: string | null;
  felrako: string | null;
  lerako: string | null;
  km: { ertek: number; forras: "teny" | "becsles" };
  uresKmBecsles: number;
  uzemanyag: { ft: number; forras: "teny" | "becsles" } | null;
  utdij: { ft: number; forras: "teny" | "becsles" } | null;
  napiFix: { ft: number };
  keziEgyeb: { ft: number; forras: "teny" | "becsles" } | null;
  bevetelFt: number | null;
  bevetelEur: number | null;
};

export type ProtoParam = {
  napiKoltsegFt: number;
  fogyasztasL100: number;
  gazolajAr: number | null;
  /** A nap hónapjának munkanapszáma. */
  honapMunkanapja: (nap: string) => number;
};

export type ProtoFuvar = {
  id: string;
  jelleg: "ber" | "sajat";
  nap: string;
  kocsi: string;
  partner: string;
  hivatkozas: string | null;
  felrako: string | null;
  lerako: string | null;
  km: number;
  uresKm: number;
  bevetelFt: number;
  bevetelEur: number | null;
  uzemanyagFt: number;
  utdijFt: number;
  egyebFt: number;
  uresKoltsegFt: number;
  fedezetFt: number;
  napArany: number;
  soforFt: number;
  kocsiFixFt: number;
  nettoFt: number;
  forras: ProtoForras;
  /** A számból hiányzó tételek: ezek miatt lehet a valósnál jobb az eredmény. */
  hianyok: string[];
  /** EUR-díj árfolyam nélkül: a fuvar nem számítható, az összesítőből kimarad. */
  kimarad: boolean;
};

export function protoFuvar(m: ProtoBemenet, p: ProtoParam): ProtoFuvar {
  const hianyok: string[] = [];
  const uzemanyagFt = m.uzemanyag?.ft ?? 0;
  if (!m.uzemanyag) hianyok.push("üzemanyag");
  const utdijFt = m.utdij?.ft ?? 0;
  if (!m.utdij) hianyok.push("útdíj");
  const egyebFt = m.keziEgyeb?.ft ?? 0;

  const km = m.km.ertek;
  const uresKm = Math.round(m.uresKmBecsles);
  const utdijKm = km > 0 ? utdijFt / km : 0;
  const uresKoltsegFt = p.gazolajAr != null
    ? Math.round(uresKm * ((p.fogyasztasL100 / 100) * p.gazolajAr + utdijKm))
    : 0;
  if (p.gazolajAr == null && uresKm > 0) hianyok.push("üres út költsége");

  const kimarad = m.jelleg === "ber" && m.bevetelFt == null;
  if (kimarad) hianyok.push("EUR-árfolyam");
  const bevetelFt = m.jelleg === "ber" ? m.bevetelFt ?? 0 : 0;
  const fedezetFt = bevetelFt - uzemanyagFt - utdijFt - egyebFt - uresKoltsegFt;

  const napArany = p.napiKoltsegFt > 0 ? m.napiFix.ft / p.napiKoltsegFt : 0;
  const munkanap = p.honapMunkanapja(m.nap);
  const soforFt = munkanap > 0 ? Math.round((napArany * SOFOR_HAVI_FT) / munkanap) : 0;
  const kocsiFixFt = Math.round(napArany * KOCSI_FIX_NAPI_FT);

  const mindTeny = m.km.forras === "teny" && m.uzemanyag?.forras === "teny" && m.utdij?.forras === "teny";
  const forras: ProtoForras = mindTeny ? (uresKm > 0 ? "reszben" : "teny") : "becsles";

  return {
    id: m.id,
    jelleg: m.jelleg,
    nap: m.nap,
    kocsi: m.jarmuKod,
    partner: m.partner ?? m.kitolKinek ?? "Saját",
    hivatkozas: m.hivatkozas,
    felrako: m.felrako,
    lerako: m.lerako,
    km,
    uresKm,
    bevetelFt,
    bevetelEur: m.bevetelEur,
    uzemanyagFt,
    utdijFt,
    egyebFt,
    uresKoltsegFt,
    fedezetFt,
    napArany,
    soforFt,
    kocsiFixFt,
    nettoFt: fedezetFt - soforFt - kocsiFixFt,
    forras,
    hianyok,
    kimarad,
  };
}

export type ProtoOsszeg = {
  kulcs: string;
  db: number;
  km: number;
  uresKm: number;
  bevetelFt: number;
  eur: number;
  uzemanyagFt: number;
  utdijFt: number;
  egyebFt: number;
  uresKoltsegFt: number;
  fedezetFt: number;
  soforFt: number;
  nettoFt: number;
  becslesDb: number;
  hianyosDb: number;
  kimaradtDb: number;
};

/** A kimaradó (átválthatatlan) fuvar egyik összegbe sem számít, csak a darabszáma látszik. */
export function osszesit(kulcs: string, fuvarok: ProtoFuvar[]): ProtoOsszeg {
  const o: ProtoOsszeg = { kulcs, db: 0, km: 0, uresKm: 0, bevetelFt: 0, eur: 0, uzemanyagFt: 0, utdijFt: 0, egyebFt: 0, uresKoltsegFt: 0, fedezetFt: 0, soforFt: 0, nettoFt: 0, becslesDb: 0, hianyosDb: 0, kimaradtDb: 0 };
  for (const f of fuvarok) {
    if (f.kimarad) { o.kimaradtDb++; continue; }
    o.db++;
    o.km += f.km;
    o.uresKm += f.uresKm;
    o.bevetelFt += f.bevetelFt;
    o.eur += f.bevetelEur ?? 0;
    o.uzemanyagFt += f.uzemanyagFt;
    o.utdijFt += f.utdijFt;
    o.egyebFt += f.egyebFt;
    o.uresKoltsegFt += f.uresKoltsegFt;
    o.fedezetFt += f.fedezetFt;
    o.soforFt += f.soforFt + f.kocsiFixFt;
    o.nettoFt += f.nettoFt;
    if (f.forras !== "teny") o.becslesDb++;
    if (f.hianyok.length > 0) o.hianyosDb++;
  }
  return o;
}

export function csoportosit(fuvarok: ProtoFuvar[], kulcsa: (f: ProtoFuvar) => string): ProtoOsszeg[] {
  const m = new Map<string, ProtoFuvar[]>();
  for (const f of fuvarok) {
    const k = kulcsa(f);
    m.set(k, [...(m.get(k) ?? []), f]);
  }
  return [...m.entries()].map(([k, l]) => osszesit(k, l)).sort((a, b) => b.nettoFt - a.nettoFt);
}
