// A Fuvarozás 2 megbízás-állapotgép — az EGYETLEN forrás arra, hogy egy
// megbízás milyen állapotból milyen állapotba léphet, és mi kell hozzá.
// A lista és az átmenetek a claude/fuvarozas-atallas-ellenorzes.md 11.1
// fejezetéből jönnek (második független ellenőrzés, 2026-09-19).
//
// Tiszta modul: nincs adatbázis, nincs "use server" — ezért tesztelhető
// (scripts/teszt-allapotgep.ts) és a kliens is importálhatja a szűrőkhöz.
// A tényleges állapotváltást végző szerver-akció (E4 után) ezen keresztül
// dönt, és a megbizas_esemeny naplóba ír; itt csak a szabály van.

export const ALLAPOTOK = [
  "ellenorzesre_var",
  "tervezett",
  "folyamatban",
  "teljesitve",
  "szamlazhato",
  "szamlazva",
  "email_elment",
  "postazva",
  "lezart",
] as const;
export type Allapot = (typeof ALLAPOTOK)[number];

/** Ki/mi váltja ki az átmenetet — a naplóba (`megbizas_esemeny.forras`) is ez kerül. */
export type AtmenetForras = "rendszer" | "ember" | "gps" | "sofor" | "migracio";

/** Amit az átmenet feltétele nézhet — a hívó adja át (nincs DB-hívás itt). */
export type AtmenetKontextus = {
  /** `jelleg='sajat'` — saját fuvar (nincs számla/e-mail/posta, rövid út a lezárásig). */
  sajatFuvar?: boolean;
  /** Történt-e GPS-érintés bármelyik megállón (a „Visszaállítás" tervezettre ettől függ). */
  gpsErintesVolt?: boolean;
  /** `elszamolas.szamla_id` nem null. */
  szamlaVan?: boolean;
  /** `fuvar_dokumentumok.tipus='fuvarlevel'` fotó megvan (vagy kézi „számlázható"). */
  fotoVan?: boolean;
  /** `elszamolas.email_elment_at` nem null. */
  emailElment?: boolean;
  /** `elszamolas.papirok_beerkeztek_at` nem null. */
  papirBeerkezett?: boolean;
  /** `elszamolas.postazva_at` nem null. */
  postazva?: boolean;
  /** Partner-törzs: nem kér számla-e-mailt / postát (13. él). */
  partnerNemKerEmailt?: boolean;
  partnerNemKerPostat?: boolean;
  /** Szállítólevél párosítva a saját fuvarhoz (12. él, 8.3). */
  szallitolevelParositva?: boolean;
  /** `torolt_at` nem null — törölt soron semmilyen átmenet nincs. */
  torolt?: boolean;
};

export type Atmenet = {
  /** Sorszám a 11.1 táblából. */
  szam: number;
  honnan: Allapot;
  hova: Allapot;
  /** Mi váltja ki — dokumentációs célra és a naplóhoz. */
  kivalto: string;
  /** Ki indíthatja. */
  forrasok: readonly AtmenetForras[];
  /** Ha megadva, csak akkor engedett, ha igazat ad; a hibaüzenet a második elem. */
  feltetel?: (k: AtmenetKontextus) => true | string;
};

const kell = (ok: boolean | undefined, hiba: string): true | string => (ok ? true : hiba);

export const ATMENETEK: readonly Atmenet[] = [
  { szam: 3, honnan: "ellenorzesre_var", hova: "tervezett", kivalto: "jóváhagyás", forrasok: ["ember", "migracio"] },
  { szam: 4, honnan: "ellenorzesre_var", hova: "folyamatban", kivalto: "első megálló érintése (auto-jóváhagyás, naplózva)", forrasok: ["gps", "sofor", "migracio"] },
  { szam: 5, honnan: "tervezett", hova: "folyamatban", kivalto: "első megálló érintése / Megérkeztem", forrasok: ["gps", "sofor", "ember", "migracio"] },
  { szam: 6, honnan: "folyamatban", hova: "teljesitve", kivalto: "utolsó lerakó elhagyva / Kész", forrasok: ["gps", "sofor", "ember", "migracio"] },
  {
    szam: 7, honnan: "teljesitve", hova: "szamlazhato", kivalto: "fuvarlevél-fotó megérkezett vagy kézi „számlázható”", forrasok: ["rendszer", "ember", "migracio"],
    feltetel: (k) => (k.sajatFuvar ? "saját fuvar nem számlázható — a 12. él (lezárás) jár" : kell(k.fotoVan, "nincs fuvarlevél-fotó (vagy kézi jelölés)")),
  },
  {
    szam: 8, honnan: "szamlazhato", hova: "szamlazva", kivalto: "Számlázz.hu-párosítás vagy kézi számlaszám", forrasok: ["rendszer", "ember", "migracio"],
    feltetel: (k) => kell(k.szamlaVan, "nincs számla"),
  },
  { szam: 9, honnan: "szamlazva", hova: "email_elment", kivalto: "a piszkozat elküldve (SENT szál) vagy kézi jelölés", forrasok: ["rendszer", "ember", "migracio"] },
  {
    // A külön „Papír megjött” lépés megszűnt (Budaházi Zoltán, 2026-09-24):
    // Szabina viszi postára a papírt, a „Postázva ✓” maga jelenti, hogy a
    // papír a kezében volt — a papír dátumát a valtAllapot beírja.
    szam: 10, honnan: "email_elment", hova: "postazva", kivalto: "Postázva ✓ (Szabina feladta)", forrasok: ["ember", "migracio"],
  },
  {
    szam: 11, honnan: "postazva", hova: "lezart", kivalto: "mind a négy feltétel áll (S1)", forrasok: ["rendszer", "ember", "migracio"],
    feltetel: (k) => kell(k.szamlaVan && k.emailElment && k.postazva, "lezáráshoz kell: számla + e-mail + postázva"),
  },
  {
    szam: 12, honnan: "teljesitve", hova: "lezart", kivalto: "saját fuvar: szállítólevél párosítva (rövid út)", forrasok: ["rendszer", "ember", "migracio"],
    feltetel: (k) => (k.sajatFuvar ? kell(k.szallitolevelParositva, "nincs párosított szállítólevél") : "csak saját fuvarnál"),
  },
  {
    szam: 13, honnan: "szamlazva", hova: "lezart", kivalto: "partner nem kér e-mailt és postát (törzs-kapcsoló)", forrasok: ["rendszer", "ember", "migracio"],
    feltetel: (k) => kell(k.partnerNemKerEmailt && k.partnerNemKerPostat, "a partner e-mailt vagy postát kér"),
  },
  {
    szam: 14, honnan: "folyamatban", hova: "tervezett", kivalto: "Visszaállítás", forrasok: ["ember"],
    feltetel: (k) => kell(!k.gpsErintesVolt, "GPS-érintés után nem állítható vissza tervezettre"),
  },
  { szam: 15, honnan: "szamlazhato", hova: "teljesitve", kivalto: "fotó visszavonása (téves párosítás)", forrasok: ["ember"] },
  { szam: 15, honnan: "szamlazva", hova: "teljesitve", kivalto: "számla visszavonása (téves párosítás)", forrasok: ["ember"] },
  { szam: 16, honnan: "lezart", hova: "postazva", kivalto: "Visszaállítás a lezárt sor részletén", forrasok: ["ember"] },
];

/** Az 1–2. él: új megbízás induló állapota. */
export function induloAllapot(hianylistaVan: boolean): Allapot {
  return hianylistaVan ? "ellenorzesre_var" : "tervezett";
}

export type AtmenetEredmeny = { ok: true; atmenet: Atmenet } | { ok: false; hiba: string };

/**
 * Engedett-e az átmenet `honnan` → `hova` a megadott forrással és kontextussal.
 * Nem vált — csak dönt; a hívó ír az adatbázisba és a naplóba.
 */
export function ellenorizAtmenet(
  honnan: Allapot,
  hova: Allapot,
  forras: AtmenetForras,
  k: AtmenetKontextus = {}
): AtmenetEredmeny {
  if (k.torolt) return { ok: false, hiba: "törölt megbízáson nincs állapotváltás (előbb visszaállítás)" };
  if (honnan === hova) return { ok: false, hiba: "már ebben az állapotban van" };
  const jeloltek = ATMENETEK.filter((a) => a.honnan === honnan && a.hova === hova);
  if (jeloltek.length === 0) return { ok: false, hiba: `nincs ilyen átmenet: ${honnan} → ${hova}` };
  const hibak: string[] = [];
  for (const a of jeloltek) {
    if (!a.forrasok.includes(forras)) {
      hibak.push(`a(z) ${forras} nem indíthatja: ${honnan} → ${hova}`);
      continue;
    }
    const f = a.feltetel ? a.feltetel(k) : true;
    if (f === true) return { ok: true, atmenet: a };
    hibak.push(f);
  }
  return { ok: false, hiba: hibak[0] };
}

/** Milyen állapotokba léphet innen (az UI gombjaihoz) — forrás és kontextus szerint szűrve. */
export function lehetsegesCelok(honnan: Allapot, forras: AtmenetForras, k: AtmenetKontextus = {}): Allapot[] {
  const celok = new Set<Allapot>();
  for (const a of ATMENETEK) {
    if (a.honnan !== honnan) continue;
    if (ellenorizAtmenet(honnan, a.hova, forras, k).ok) celok.add(a.hova);
  }
  return [...celok];
}

/** Nyitott = még nem lezárt (a listák és a GPS-figyelő szűrője). */
export const NYITOTT_ALLAPOTOK: readonly Allapot[] = ALLAPOTOK.filter((a) => a !== "lezart");
/** Elszámolás-oszlopok (asztali Elszámolás fül és Szabina Teendői). */
export const ELSZAMOLAS_ALLAPOTOK: readonly Allapot[] = ["teljesitve", "szamlazhato", "szamlazva", "email_elment", "postazva"];
