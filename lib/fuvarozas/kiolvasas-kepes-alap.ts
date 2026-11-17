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
 * - a "szoveg" forrású idézet nincs a szövegrétegben (kitalált vagy rossz helyről vett),
 * - nincs megrendelő, felrakó vagy lerakó,
 * - a lerakás napja a felrakás előtt van.
 * A "fejlec" forrású idézetet nem keressük a szövegben: a képes fejléc
 * (FERSPED #375) éppen azért kell, mert ott nincs.
 */
export function gyanusPontok(v: KepesValasz, szoveg: string): string[] {
  const sz = kulcs(szoveg);
  const ki: string[] = [];
  const idezetMegvan = (idezet: string | null) => {
    const k = kulcs(idezet);
    return k.length < 4 || sz.includes(k);
  };
  for (const [nev, m] of [["megrendelő", v.megrendelo], ["pozíciószám", v.pozicioszam], ["fuvardíj", v.fuvardij]] as const) {
    if (m?.ertek && m.hol === "szoveg" && !idezetMegvan(m.idezet)) ki.push(`${nev}: az idézet nincs az irat szövegében`);
  }
  if (!v.megrendelo?.ertek) ki.push("megrendelő: nem található");
  const fel = v.megallok.filter((m) => m.tipus === "felrako");
  const le = v.megallok.filter((m) => m.tipus === "lerako");
  if (fel.length === 0) ki.push("nincs felrakó");
  if (le.length === 0) ki.push("nincs lerakó");
  for (const m of v.megallok) {
    if (m.idezet && kulcs(m.idezet).length >= 6 && !sz.includes(kulcs(m.idezet))) {
      ki.push(`${m.tipus === "felrako" ? "felrakó" : "lerakó"} (${m.cim ?? "?"}): az idézet nincs az irat szövegében`);
    }
  }
  const elsoFel = fel.find((m) => m.nap)?.nap;
  const utolsoLe = [...le].reverse().find((m) => m.nap)?.nap;
  if (elsoFel && utolsoLe && utolsoLe < elsoFel) ki.push(`lerakás (${utolsoLe}) a felrakás (${elsoFel}) előtt`);
  return ki;
}
