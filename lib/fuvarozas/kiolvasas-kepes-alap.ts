// A képes kiolvasás tiszta szabályai (nem "use server", nincs DB/hálózat) —
// a scripts/teszt-kiolvasas-kepes.ts tsx alól tölti be.

export type KepesMezo = { ertek: string | null; idezet: string | null; hol: "fejlec" | "szoveg" | "email" | "nincs" };

export type KepesMegallo = {
  tipus: "felrako" | "lerako";
  ceg: string | null;
  cim: string | null;
  nap: string | null;
  ido: string | null;
  idezet: string | null;
};

export type KepesValasz = {
  megrendelo: KepesMezo;
  megrendeloAdoszam: string | null;
  pozicioszam: KepesMezo;
  fuvardij: KepesMezo & { penznem: "Ft" | "EUR" | null };
  aru: string | null;
  megallok: KepesMegallo[];
};

/** Írásmód-független összevetéshez: ékezet, kis-nagybetű, szóköz és írásjel nélkül. */
export function kulcs(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * A modell válaszának gyanús pontjai:
 * - a "szoveg" forrású megrendelő/pozíciószám idézete nincs a szövegrétegben,
 * - a díj összege vagy egy megálló címe (irányítószám/település) nincs a szövegben,
 * - nincs megrendelő, felrakó, lerakó, vagy egy megállónak nincs címe,
 * - a lerakás napja a felrakás előtt van.
 * A "fejlec" forrású idézetet nem keressük a szövegben: a képes fejléc
 * (FERSPED #375) éppen azért kell, mert ott nincs.
 */
/** A cím irányítószáma (4 jegy) vagy leghosszabb szava (település) szerepel-e a szövegben. */
function cimASzovegben(cim: string, szovegKulcs: string): boolean {
  const irsz = cim.match(/\b\d{4}\b/)?.[0];
  if (irsz && szovegKulcs.includes(irsz)) return true;
  const szavak = cim.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4);
  return szavak.some((w) => szovegKulcs.includes(w));
}

export function gyanusPontok(v: KepesValasz, szoveg: string): string[] {
  const sz = kulcs(szoveg);
  const ki: string[] = [];
  const idezetMegvan = (idezet: string | null) => {
    const k = kulcs(idezet);
    return k.length < 4 || sz.includes(k);
  };
  for (const [nev, m] of [["megrendelő", v.megrendelo], ["pozíciószám", v.pozicioszam]] as const) {
    if (m?.ertek && m.hol === "szoveg" && !idezetMegvan(m.idezet)) ki.push(`${nev}: az idézet nincs az irat szövegében`);
  }
  // A díjat számként keressük (az ezres tagolás és a pénznem írásmódja iratonként más).
  const dijSzam = (v.fuvardij?.ertek ?? "").trim().replace(/[.,]\d{1,2}$/, "").replace(/\D/g, "");
  if (dijSzam && !szoveg.replace(/\D/g, "").includes(dijSzam)) ki.push("fuvardíj: az összeg nincs az irat szövegében");
  if (!v.megrendelo?.ertek) ki.push("megrendelő: nem található");
  const fel = v.megallok.filter((m) => m.tipus === "felrako");
  const le = v.megallok.filter((m) => m.tipus === "lerako");
  if (fel.length === 0) ki.push("nincs felrakó");
  if (le.length === 0) ki.push("nincs lerakó");
  for (const m of v.megallok) {
    if (!m.cim) {
      ki.push(`${m.tipus === "felrako" ? "felrakó" : "lerakó"}: nincs cím`);
      continue;
    }
    // A megálló akkor igazolt, ha a CÍM irányítószáma vagy települése a szövegben van —
    // a teljes idézet a hasábos tördelés miatt gyakran nem egyben áll a szövegrétegben.
    if (!cimASzovegben(m.cim, sz)) {
      ki.push(`${m.tipus === "felrako" ? "felrakó" : "lerakó"} (${m.cim ?? "?"}): a cím nincs az irat szövegében`);
    }
  }
  const elsoFel = fel.find((m) => m.nap)?.nap;
  const utolsoLe = [...le].reverse().find((m) => m.nap)?.nap;
  if (elsoFel && utolsoLe && utolsoLe < elsoFel) ki.push(`lerakás (${utolsoLe}) a felrakás (${elsoFel}) előtt`);
  return ki;
}

/**
 * Ha a modell a teljes rovatot a cégnévbe tette és a cím üres (FERSPED #375:
 * „Trivium Packaking Hungary kft HU,4562 Vaja,Rohodi u.1-3”), a cím az
 * irányítószámtól (az előtte álló „HU,” / „H-” jelöléssel együtt) indul.
 */
export function megalloCimPotlas<T extends { ceg: string | null; cim: string | null }>(m: T): T {
  if (m.cim || !m.ceg) return m;
  const talalat = m.ceg.match(/(?:\b(?:HU|H)\s*[,-]?\s*)?\b\d{4}\b/);
  if (!talalat || talalat.index === undefined) return m;
  const ceg = m.ceg.slice(0, talalat.index).replace(/[\s,;-]+$/, "").trim();
  return { ...m, ceg: ceg || null, cim: m.ceg.slice(talalat.index).trim() };
}
