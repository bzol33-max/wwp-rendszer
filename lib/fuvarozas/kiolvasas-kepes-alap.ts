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
export function cimASzovegben(cim: string, szovegKulcs: string): boolean {
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

/** A díj számértéke (tizedes nélkül) a szövegben: „50.000 ft”, „450,00 EUR”, „155 000,00” egyaránt. */
function dijASzovegben(dij: number | string, szoveg: string): boolean {
  const szam = String(dij).trim().replace(/[.,]\d{1,2}$/, "").replace(/\D/g, "");
  return szam.length === 0 || szoveg.replace(/\D/g, "").includes(szam);
}

/**
 * A napi import forrás-ellenőrzése (drive-sync-core): a modell által adott
 * fel-/lerakó (irányítószám vagy település) és díj benne van-e az irat
 * szövegében. A null mező (nincs, vagy a partner szabályalapú olvasója adta)
 * nem ellenőrizendő. Képes fejlécből jött megrendelőt nem nézünk itt: az a
 * szövegben szándékosan nincs benne.
 */
export function importGyanu(
  m: { felrako?: string | null; lerako?: string | null; fuvardij?: number | string | null },
  szoveg: string
): string[] {
  const sz = kulcs(szoveg);
  const ki: string[] = [];
  for (const [nev, cim] of [["a felrakó", m.felrako], ["a lerakó", m.lerako]] as const) {
    if (cim && !cimASzovegben(cim, sz)) ki.push(`${nev} („${cim}”) nem található az iratban`);
  }
  if (m.fuvardij != null && m.fuvardij !== "" && !dijASzovegben(m.fuvardij, szoveg)) {
    ki.push(`a fuvardíj (${m.fuvardij}) nem található az iratban`);
  }
  return ki;
}

/** Az ISO nap ( ÉÉÉÉ-HH-NN ) szerepel-e a szövegben bármely szokásos írásmódban (2026.11.16, 16.11.2026, 2026 11.16., 11.16.). */
export function datumASzovegben(iso: string | null | undefined, szoveg: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return false;
  const [, e, h, n] = m;
  const szamok = szoveg.replace(/\D+/g, " ");
  const tomor = szoveg.replace(/\D/g, "");
  const nn = String(Number(n)), hh = String(Number(h));
  return tomor.includes(`${e}${h}${n}`) || tomor.includes(`${n}${h}${e}`)
    || new RegExp(`(^|\\D)${e}\\D{1,3}0?${hh}\\D{1,3}0?${nn}(\\D|$)`).test(szoveg)
    || new RegExp(`(^|\\D)0?${nn}\\D{1,3}0?${hh}\\D{1,3}${e}(\\D|$)`).test(szoveg)
    || szamok.includes(` ${h} ${n} `);
}

/** Melyik kiolvasott dátum igazolt az iratban (a csempe ezzel választja el a tervmódosítást a rossz olvasástól). */
export function kiolvasottIgazolas(
  d: { datum?: string | null; lerakasDatum?: string | null },
  szoveg: string
): { datum: boolean; lerakasDatum: boolean } {
  return { datum: datumASzovegben(d.datum, szoveg), lerakasDatum: datumASzovegben(d.lerakasDatum, szoveg) };
}
