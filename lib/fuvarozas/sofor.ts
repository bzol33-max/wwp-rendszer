"use server";

// Sofőr saját (dolgozói mobil) nézete — az /erkezes "Fuvarok" csempéje.
// Szándékosan NEM a flottaszintű Áttekintés Fuvar fület (lib/attekintes/
// actions.ts) használja: az minden saját járművet mutat egy vezetőnek,
// itt viszont EGY sofőr EGY aktuális fuvarjának állomásait kell
// megjeleníteni, kézzel jelölhető fel-/lerakási állapottal (lásd
// fuvar_megallok) — ez a GPS-alapú, csak becslésre
// szolgáló "elhagyva" jelzéstől (lib/fuvarozas/idovonal.ts) független,
// explicit sofőri megerősítés.

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { query, withTransaction } from "@/lib/db";
import { megalloKeszTx, megalloKeszVisszavonTx, megerkezettTx, varakozasTx } from "@/lib/megbizasok/megallo";
import { requireAnyEditPermission, requireSajatVagyModulJog } from "@/lib/auth/require-permission";
import { requireSession } from "@/lib/auth/dal";
import { getIdovonalak } from "@/lib/fuvarozas/actions";
import { resolveJarmu } from "@/lib/fuvarozas/vehicles";
import { findJarmuByEmployeeName, jarmuMatch } from "@/lib/fuvarozas/sofor-jarmu";
import { bontsMegallokra, cimKulcs, cimPontossaga, varosNev } from "@/lib/fuvarozas/varos";
import { toroljIdovonalCachet } from "@/lib/fuvarozas/idovonal-cache";
import { getFleetLastPositions, parseEcofleetTimestamp } from "@/lib/fuvarozas/ecofleet";
import { mozogE, toroljGeokodCachet } from "@/lib/fuvarozas/erintes-felismeres";
import { ceglNevKanonikusan, normalizaltCegKulcs } from "@/lib/fuvarozas/fuvar-constants";
import { megalloReszlete, type MegalloReszlet } from "@/lib/fuvarozas/sofor-adatok";
import { szkennelj } from "@/lib/fuvarozas/doksi-kivagas";
import { sajatFuvarE } from "@/lib/fuvarozas/irat-jog";
import { ellenorizAtmenet } from "@/lib/fuvarozas/allapot";

function budapestMaIso(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Budapest" });
}

export type SoforMegallo = {
  index: number;
  tipus: "felrako" | "lerako";
  varos: string;
  cim: string;
  datumIso: string | null;
  kesz: boolean;
  keszAt: string | null;
  keszBy: string | null;
};

export type SoforTura = {
  fuvarId: string;
  megrendelo: string | null;
  pozicioszam: string | null;
  aru: string | null;
  mennyiseg: string | null;
  dokumentumUrl: string | null;
  /** A fuvar teljes állomás-sorrendje — a felrakó + az összes lerakó állomás (lásd bontsMegallokra). */
  megallok: SoforMegallo[];
  /** Az első még nem kész megálló indexe a megallok tömbben — ez a képernyőn kiemelt "jelenlegi" megálló. Null, ha minden állomás kész. */
  aktualisIndex: number | null;
};

/**
 * A sofőri írók közös őre: a teljes Fuvarozás jog bármelyik fuvarra írhat, a
 * sofőri önkiszolgáló jog ("fuvarozas_sajat") viszont csak a SAJÁT kocsija
 * fuvarjára — ugyanaz az összerendelés, mint az irat-végpontnál (irat-jog.ts).
 * Enélkül egy sofőr tetszőleges fuvarId-val lezárhatta más fuvarjának
 * megállóját, fotót csatolhatott hozzá, várakozást indíthatott (audit
 * 2026-10-04, SEC-1).
 */
async function requireFuvarIrasJog(fuvarId: string): Promise<"fuvarozas" | "fuvarozas_sajat"> {
  const kulcs = await requireAnyEditPermission(["fuvarozas", "fuvarozas_sajat"]);
  if (kulcs === "fuvarozas") return "fuvarozas";
  const session = await requireSession();
  if (!(await sajatFuvarE(session.employeeId, fuvarId))) {
    throw new Error("Ez a fuvar nem a te fuvarod.");
  }
  return "fuvarozas_sajat";
}

/**
 * A sofőr megjelöli, hogy egy adott állomáson (felrakó/lerakó) végzett —
 * kézi, időbélyeges megerősítés. A jelölő nevét a MUNKAMENETBŐL vesszük, nem
 * a kliens által küldött szövegből, hogy a napló ne legyen hamisítható.
 */
export async function markMegalloKesz(fuvarId: string, megalloIndex: number): Promise<{ fuvarLezarva: boolean }> {
  await requireFuvarIrasJog(fuvarId);
  const soforNev = (await requireSession()).name;
  // Az UTOLSÓ megálló "Indulok"-ja a fuvart is lezárja — ugyanúgy, mint a
  // GPS lap pipája (megbizasok.ts setMegalloKesz). Eddig csak a GPS vagy az
  // iroda zárta le, így a sofőr hiába jelezte, a fuvar "folyamatban" maradt
  // (Budaházi Zoltán, 2026-09-24).
  // A megálló kettős írása és az ebből következő teljesítésjelölő együtt atomikus.
  const fuvarLezarva = await withTransaction(async (tx) => {
    await megalloKeszTx(tx, fuvarId, megalloIndex, soforNev);
    const [sor] = await tx<{ felrako: string | null; lerako: string; teljesitve: boolean }>(`select felrako, lerako, teljesitve from fuvar_megbizasok where id = $1 and statusz <> 'torolt'`, [fuvarId]);
    let lezarva = false;
    if (sor && !sor.teljesitve) {
    const utolsoIndex = bontsMegallokra(sor.felrako).length + bontsMegallokra(sor.lerako).length - 1;
    if (megalloIndex === utolsoIndex) {
      await tx(`update fuvar_megbizasok set teljesitve = true, teljesitve_at = now() where id = $1`, [fuvarId]);
      lezarva = true;
    }
    }
    return lezarva;
  });
  if (fuvarLezarva) console.log(`[sofor] fuvar #${fuvarId} lezárva a sofőr utolsó "Indulok" jelölésével (${soforNev}).`);
  // A GPS lap is ezt a jelölést mutatja (kézi kész) — a gyorsítótárazott idővonal frissüljön.
  toroljIdovonalCachet();
  revalidatePath("/erkezes");
  return { fuvarLezarva };
}

/** Ennyi óráig vonhatja vissza a sofőr a saját kézi „Kész” jelölését (az iroda bármikor). */
const VISSZAVONAS_ORA = 12;

/**
 * A fuvar lezárását EZ a kézi jelölés okozta-e: a markMegalloKesz (és a GPS
 * lap pipája, megbizasok.ts setMegalloKesz) ugyanabban a hívásban írja a
 * megálló kesz_at-ját és a fuvar teljesitve_at-ját, egymás után. A GPS-figyelő
 * vagy az iroda „Teljesítve” gombja más időpontban zár — azt ez nem nyitja újra.
 */
function lezarastOkozta(keszAt: Date | string | null, teljesitveAt: Date | string | null): boolean {
  if (!keszAt || !teljesitveAt) return false;
  return Math.abs(new Date(teljesitveAt).getTime() - new Date(keszAt).getTime()) < 2 * 60_000;
}

/**
 * A sofőr (vagy az iroda) visszavonja egy megálló TÉVES kézi „Felrakva ✓ /
 * Lerakva ✓” jelölését (Micó, NMZ-492, 2026-10-05: véletlenül lezárta a
 * fuvart, és eltűnt a telefonjáról a lerakó időkapuja és bejelentkezési
 * száma).
 *
 * - Csak kézi jelölés vonható vissza (a GPS-felismerés nem a kesz oszlopba ír).
 * - A sofőr csak 12 órán belül; az iroda (teljes Fuvarozás jog) bármikor.
 * - Ha a jelölés az utolsó megállóé volt, és ez zárta le a fuvart, a fuvar
 *   is visszanyílik: teljesitve → folyamatban (allapot.ts 18. él) — de csak
 *   ha még nem lépett tovább (nincs fuvarlevél-fotó, számla, lezárás).
 * - Ha a fuvar más okból (GPS, iroda) teljesített, a megálló jelölése sem
 *   vonható vissza: a lezárt fuvar minden megállója késznek látszik, a
 *   visszavonásnak nem lenne látható hatása — ilyenkor az iroda dönt.
 *
 * A megálló tükrét (fuvar_megallok.sofor_kesz_at) a 003-as trigger törli
 * (kesz=false → null); itt a biztonság kedvéért közvetlenül is.
 */
export async function visszavonMegalloKesz(fuvarId: string, megalloIndex: number): Promise<{ fuvarVisszanyitva: boolean }> {
  const kulcs = await requireFuvarIrasJog(fuvarId);
  const session = await requireSession();
  const ki = session.name ?? session.username;
  const forras = kulcs === "fuvarozas" ? "ember" : "sofor";

  const fuvarVisszanyitva = await withTransaction(async (q) => {
    const [sor] = await q<{
      felrako: string | null;
      lerako: string;
      teljesitve: boolean;
      teljesitve_at: Date | null;
      allapot: string | null;
      jelleg: string | null;
      szamla_szam: string | null;
      torolt: boolean;
      foto_van: boolean;
    }>(
      `select felrako, lerako, teljesitve, teljesitve_at, allapot, jelleg, szamla_szam,
              (statusz = 'torolt' or torolt_at is not null) as torolt,
              exists (select 1 from fuvar_dokumentumok d where d.fuvar_id = fuvar_megbizasok.id and d.tipus = 'fuvarlevel') as foto_van
         from fuvar_megbizasok where id = $1 for update`,
      [fuvarId]
    );
    if (!sor || sor.torolt) throw new Error("A fuvar nem található.");
    const [jel] = await q<{ kesz: boolean; kesz_at: Date | null; megallo_id: string | null }>(
      `select sofor_kesz_at is not null as kesz, sofor_kesz_at as kesz_at, id::text as megallo_id
         from fuvar_megallok where megbizas_id = $1 and sorszam = $2 + 1 for update`,
      [fuvarId, megalloIndex]
    );
    if (!jel?.kesz) throw new Error("Ez a megálló nincs kézzel készre jelölve — nincs mit visszavonni.");
    if (kulcs === "fuvarozas_sajat" && (!jel.kesz_at || Date.now() - new Date(jel.kesz_at).getTime() > VISSZAVONAS_ORA * 3600_000)) {
      throw new Error(`A jelölés ${VISSZAVONAS_ORA} óránál régebbi — szólj az irodának.`);
    }

    // Visszanyíljon-e a fuvar? Csak ha EZ a jelölés zárta le.
    let visszanyit = false;
    if (sor.teljesitve) {
      if (!lezarastOkozta(jel.kesz_at, sor.teljesitve_at)) {
        throw new Error("A fuvart nem ez a jelölés zárta le (GPS vagy az iroda) — szólj az irodának.");
      }
      if (sor.allapot !== "teljesitve") {
        throw new Error("A fuvar már továbblépett (fotó, számla vagy lezárás) — szólj az irodának.");
      }
      const e = ellenorizAtmenet("teljesitve", "folyamatban", forras, {
        keziKeszVisszavonas: true,
        sajatFuvar: sor.jelleg === "sajat",
        fotoVan: sor.foto_van,
        szamlaVan: !!sor.szamla_szam?.trim(),
      });
      if (!e.ok) throw new Error(`Nem vonható vissza: ${e.hiba}.`);
      visszanyit = true;
    }

    await megalloKeszVisszavonTx(q, fuvarId, megalloIndex);
    // A 002-es napló-trigger ne duplázzon — a saját, részletesebb eseményünket írjuk.
    await q(`select set_config('fuvarozas2.uj_kod', '1', true)`);
    if (visszanyit) {
      // Az allapot-ot ugyanaz az utasítás írja, így a 002-es követő trigger
      // nem számolja újra a régi jelölőkből (lásd valtAllapot).
      const irt = await q<{ id: string }>(
        `update fuvar_megbizasok
            set allapot = 'folyamatban', allapot_at = now(), teljesitve = false, teljesitve_at = null, ellenorzott = true
          where id = $1 and allapot = 'teljesitve'
          returning id::text`,
        [fuvarId]
      );
      if (irt.length === 0) throw new Error("A fuvar állapota közben megváltozott — frissíts, és próbáld újra.");
    }
    await q(
      `insert into fuvar_megbizas_esemeny (megbizas_id, megallo_id, esemeny, allapot_elott, allapot_utan, forras, ki, reszletek)
       values ($1, $2, 'visszaallitas', $3, $4, $5, $6, $7)`,
      [
        fuvarId,
        jel.megallo_id,
        visszanyit ? "teljesitve" : null,
        visszanyit ? "folyamatban" : null,
        forras,
        ki,
        JSON.stringify({
          atmenet: visszanyit ? 18 : null,
          megallo_index: megalloIndex,
          visszavont_kesz_at: jel.kesz_at,
          indok: "téves Kész jelölés visszavonva",
        }),
      ]
    );
    return visszanyit;
  });

  console.log(
    `[sofor] fuvar #${fuvarId} megálló ${megalloIndex}: kézi Kész visszavonva (${ki})${fuvarVisszanyitva ? " — a fuvar újra folyamatban" : ""}.`
  );
  toroljIdovonalCachet();
  revalidatePath("/erkezes");
  revalidatePath("/m");
  return { fuvarVisszanyitva };
}

// ---------------------------------------------------------------------------
// A sofőr TELJES napja (2026-09-17) — a getSoforAktualisTura egyetlen fuvart
// mutat, ami a Duvenbeck-napokon kevés: egy kocsin 2-3 fuvar van (Pápa ↔
// Debrecen ingázás), a másodikat a sofőr nem látta.
//
// FONTOS: ez a nézet NEM külön logikából számol, hanem a GPS lap
// idővonalából (lib/fuvarozas/actions.ts getIdovonalak) veszi a fuvaronkénti
// blokkokat, és csak a sofőrnek szóló mezőkkel bővíti (időablak,
// Reise ID, súly, iratok). Így a sofőr ugyanazt a sorrendet és ugyanazt a
// kész/nem kész állapotot látja, mint a diszpécser — két külön számítás
// előbb-utóbb elcsúszna egymástól. A getIdovonalak gyorsítótárazott, tehát
// ez nem jelent plusz külső hívást.
//
// Ami szándékosan NEM megy ki a telefonra: fuvardíj, költség, eredmény,
// számla. A rakodáshoz nem kell, a telefon viszont elveszhet. Ugyanezért nem
// látja a sofőr a kocsi nélküli (elakadt) megbízásokat sem — azok a
// diszpécser GPS-oldalán maradnak.
// ---------------------------------------------------------------------------

export type SoforMegalloSor = {
  fuvarId: string;
  megalloIndex: number;
  tipus: "felrako" | "lerako";
  varos: string;
  /** A megálló teljes címe — két azonos városú megállót csak ez különböztet meg. */
  cim: string;
  /** Tényleges (GPS szerinti) megérkezés, ha volt, egyébként a becsült időpont. */
  idopont: Date;
  /** Igaz, ha az `idopont` csak a statikus menetrend és már a múltba esik — a felület ilyenkor nem mutat órát. */
  becslesElavult: boolean;
  /** A megbízás időablaka erre a megállóra (Duvenbeck PV/PB) — ez a valódi határidő. */
  ablakTol: Date | null;
  ablakIg: Date | null;
  kesz: boolean;
  /** Honnan tudjuk, hogy kész: "gps" megfigyelés vagy "kezi" megerősítés. */
  keszForras: "gps" | "kezi" | null;
  keszBy: string | null;
  /** A kézi készre jelölés ideje (fuvar_megallok.sofor_kesz_at), ha volt. (2026-10-06) */
  keszAt: Date | null;
  /**
   * Igaz, ha a megálló kézi „Kész” jelölése még visszavonható
   * (visszavonMegalloKesz): kézi, 12 órán belüli, és ha a fuvart is lezárta,
   * a fuvar még nem lépett tovább (fotó, számla).
   */
  visszavonhato: boolean;
  /** A kamion a GPS szerint MOST itt áll. */
  eppenItt: boolean;
  /** Hány nappal esik a megjelenített naptól (0 = aznap, -1 = tegnap, +1 = holnap). */
  napElteres: number;
  /** A sofőr "Megérkeztem" koppintásának ideje, ha volt. */
  keziErkezes: Date | null;
  /**
   * Igaz, ha a cím geokódolása bizonytalan (csak városnév szintjén ismert
   * vagy egyáltalán nem), és a helyszín-szótárban sincs rögzítve — ilyenkor
   * a GPS-felismerés nem tud ide érkezést jelölni, a sofőr a helyszínről
   * rögzítheti a valódi koordinátát (rogzitMegalloHelyet).
   */
  helyBizonytalan: boolean;
  /** Igaz, ha ehhez a címhez már van helyszínről rögzített koordináta. */
  helyRogzitve: boolean;
  /** A sofőr Várakozom / Várakozás vége koppintásai. */
  varakozasKezdete: Date | null;
  varakozasVege: Date | null;
  /**
   * A megbízásból kiolvasott megálló-részletek (lib/fuvarozas/sofor-adatok.ts):
   * a rakodóhely cége, időablaka, napja (ISO) és helyszíni kontaktja. Régi,
   * még ki nem olvasott soron null.
   */
  ceg: string | null;
  ido: string | null;
  nap: string | null;
  kontakt: string | null;
  /** Ezen a megállón fel-/lerakandó áru ("2 t 1.fok Titus"), ha a megbízás megállónként adja. */
  rakomany: string | null;
  /** A megállón kért bejelentkezési / lerakodási kód (sofor-adatok.ts), ha a megbízás megadja. */
  kod: string | null;
};

export type SoforDokumentum = {
  id: string;
  /** "megbizas" | "rakomanylista" | "egyeb" | null */
  tipus: string | null;
  verzio: number | null;
  fajlnev: string | null;
};

/** A megbízó kapcsolattartója — a kapuban és gond esetén ezt kell hívni. */
export type SoforKapcsolat = {
  nev: string | null;
  telefon: string;
};

export type SoforFuvarBlokk = {
  fuvarId: string;
  megrendelo: string | null;
  pozicioszam: string | null;
  /** Duvenbeck Út ID (Reise ID) — a kapuban ezt kérik, és ez a számlázási kulcs. */
  reiseId: string | null;
  aru: string | null;
  mennyiseg: string | null;
  suly: string | null;
  megjegyzes: string | null;
  /**
   * A megbízáson szereplő szabad szöveges időpont. Nem ugyanaz, mint a
   * felrakas/lerakas_ablak: azt csak a Duvenbeck-importőr tölti, ezt viszont
   * minden megbízás hozza. A sofőrnek enélkül hiányzik az e-mailből az, hogy
   * "hánykor".
   */
  idopont: string | null;
  /**
   * Igaz, ha a SAJÁT raklapunkat visszük (a felületen "Saját fuvar"), hamis,
   * ha másnak fuvarozunk ("Bér fuvar"). A sofőrnek ez két más munka: a
   * sajátnál nincs külső megbízó, akinek a kapuban szólni kell.
   *
   * FIGYELEM, EZ A FÁJL SZÁNDÉKOSAN NEM ADJA TOVÁBB A NYERS `tipus`
   * OSZLOPOT: a `fuvar_megbizasok.tipus` elnevezése történelmi okokból
   * FORDÍTOTT a felülethez képest — `tipus='ber'` a "Saját fuvarok" fül,
   * `tipus='sajat'` a "Bér fuvarok" fül (lásd lib/fuvarozas/megbizasok.ts
   * getMaiValodiSajatFuvarok). A nyers oszlopot továbbadva a csempe
   * pontosan fordítva címkézte a fuvarokat (2026-09-22), ezért itt már
   * eldöntött logikai érték megy tovább.
   */
  sajatFuvar: boolean;
  /** A felrakón / kapuban kért szám, ha más, mint a pozíciószám (sofor-adatok.ts). */
  referencia: string | null;
  /** A járműre vonatkozó előírás ("Mega autó", "spanifer kell"). */
  jarmuEloiras: string | null;
  /** A megrendelő kapcsolattartója a fuvar_kapcsolatok törzsből, ha van. */
  kapcsolat: SoforKapcsolat | null;
  /** Igaz, ha a fuvar korábbról csúszik át erre a napra. */
  csuszo: boolean;
  /**
   * A megbízáson szereplő nyers Kocsi-szöveg, ha az NEM a sofőr kocsijára
   * oldódik fel (a fuvar a Sofőr mező alapján került ide). A Duvenbeck
   * következetesen felcserélt betűkkel írja Micó rendszámát, ezért ez csak
   * halk figyelmeztetés — a fuvart sosem rejtjük el miatta.
   */
  masRendszam: string | null;
  megallok: SoforMegalloSor[];
  dokumentumok: SoforDokumentum[];
};

/**
 * Egy 12 órán belül kézzel lezárt fuvar, ami a mai napról kiesett (pl.
 * tegnap este tévesen „Lerakva”, a lerakás ma lenne — a GPS lap szándékosan
 * nem mutatja a nap előtt lezárt fuvart). A sofőr innen vonhatja vissza.
 */
export type SoforLezartFuvar = {
  fuvarId: string;
  megalloIndex: number;
  megrendelo: string | null;
  honnan: string | null;
  hova: string | null;
  keszAt: Date;
};

export type SoforNap = {
  napISO: string;
  sofor: string;
  jarmuLabel: string;
  fuvarok: SoforFuvarBlokk[];
  /** Nemrég kézzel lezárt, a napról kiesett fuvarok — visszavonhatók (lásd SoforLezartFuvar). */
  nemregLezartak: SoforLezartFuvar[];
  /** A soron következő megálló — az első, ami még nincs kész. */
  kovetkezo: { fuvarId: string; megalloIndex: number } | null;
  /** Hibaszöveg, ha az élő GPS-lekérdezés nem sikerült (a megbízások ettől függetlenül látszanak). */
  hiba: string | null;
};

type FuvarExtraSor = {
  id: string;
  reise_id: string | null;
  /** A megbízáson szereplő szabad szöveges időpont ("07:00-15:00", "de."). */
  idopont: string | null;
  aru: string | null;
  mennyiseg: string | null;
  suly: string | null;
  megjegyzes: string | null;
  jarmu: string | null;
  tipus: "sajat" | "ber";
  felrakas_ablak_tol: Date | null;
  felrakas_ablak_ig: Date | null;
  lerakas_ablak_tol: Date | null;
  lerakas_ablak_ig: Date | null;
  /** A felrakás és a lerakás napja, ISO — ha a megálló-részlet nem ad saját napot. */
  datum_iso: string | null;
  lerakas_datum_iso: string | null;
  megallo_reszletek: MegalloReszlet[] | null;
  referencia: string | null;
  jarmu_eloiras: string | null;
  teljesitve: boolean;
  teljesitve_at: Date | null;
  allapot: string | null;
  szamla_szam: string | null;
  foto_van: boolean;
};

/** A getSoforNap megálló-sorához: visszavonható-e a kézi Kész (ugyanaz a szabály, mint a visszavonMegalloKesz-ben). */
function visszavonhatoE(
  m: { keszForras: "gps" | "kezi" | null; keszAt: Date | null },
  extra: FuvarExtraSor | undefined
): boolean {
  if (m.keszForras !== "kezi" || !m.keszAt) return false;
  if (Date.now() - new Date(m.keszAt).getTime() > VISSZAVONAS_ORA * 3600_000) return false;
  if (!extra?.teljesitve) return true;
  return (
    lezarastOkozta(m.keszAt, extra.teljesitve_at) &&
    extra.allapot === "teljesitve" &&
    !extra.foto_van &&
    !extra.szamla_szam?.trim()
  );
}

/**
 * A bejelentkezett sofőr egy napjának teljes képe: a kocsijára ütemezett
 * fuvarok fuvaronkénti blokkban, a GPS lappal egyező sorrendben.
 *
 * Null, ha az alkalmazotthoz nem tartozik saját jármű.
 */
export async function getSoforNap(employeeId: string, napISO?: string): Promise<SoforNap | null> {
  await requireSajatVagyModulJog({
    employeeId,
    sajatModule: "fuvarozas_sajat",
    modul: "fuvarozas",
    kind: "view",
  });

  const empRows = await query<{ name: string }>(`select name from alkalmazottak where id = $1`, [employeeId]);
  const employeeName = empRows[0]?.name;
  if (!employeeName) return null;
  const jarmu = findJarmuByEmployeeName(employeeName);
  if (!jarmu) return null;

  const nap = napISO ?? budapestMaIso();
  const idovonal = await getIdovonalak(nap);
  const sajat = idovonal.jarmuvek.find((j) => j.sofor === jarmu.sofor);
  const blokkok = sajat?.fuvarok ?? [];

  const fuvarIds = blokkok.map((b) => b.fuvarId);
  // A megbízás eredeti irata legyen a fuvar_dokumentumok között is — a
  // "Megbízás PDF" gomb onnan nyitja (api/fuvarozas/dokumentum). A beolvasás
  // korábban csak a fuvar_megbizasok.drive_file_id-ba írta, így a PDF-gomb
  // csak a véletlenül kétszer feltöltött iratoknál jelent meg (Micó ÁB Speed
  // megbízásánál igen, Gergőnél nem — 2026-09-23). Idempotens: ha az irat
  // már csatolva van, nem történik semmi; egy TÖRÖLT sorról átkerül ide.
  if (fuvarIds.length) {
    await query(
      `insert into fuvar_dokumentumok (fuvar_id, drive_file_id, dokumentum_url, tipus, fajlnev)
       select f.id, f.drive_file_id, f.dokumentum_url, 'megbizas', null
         from fuvar_megbizasok f
        where f.id = any($1::bigint[]) and f.drive_file_id is not null
       on conflict (drive_file_id) do update set fuvar_id = excluded.fuvar_id
        where (select m.statusz from fuvar_megbizasok m where m.id = fuvar_dokumentumok.fuvar_id) = 'torolt'`,
      [fuvarIds]
    ).catch((err) => console.error("[sofor] megbízás-irat csatolása:", err));
  }
  const [extraSorok, dokSorok] = fuvarIds.length
    ? await Promise.all([
        query<FuvarExtraSor>(
          `select id::text, reise_id, idopont, aru, mennyiseg, suly, megjegyzes, jarmu, tipus,
                  felrakas_ablak_tol, felrakas_ablak_ig, lerakas_ablak_tol, lerakas_ablak_ig,
                  to_char(datum, 'YYYY-MM-DD') as datum_iso, to_char(lerakas_datum, 'YYYY-MM-DD') as lerakas_datum_iso,
                  megallo_reszletek, referencia, jarmu_eloiras,
                  teljesitve, teljesitve_at, allapot, szamla_szam,
                  exists (select 1 from fuvar_dokumentumok d where d.fuvar_id = fuvar_megbizasok.id and d.tipus = 'fuvarlevel') as foto_van
             from fuvar_megbizasok
            where id = any($1::bigint[])`,
          [fuvarIds]
        ),
        query<{ id: string; fuvar_id: string; tipus: string | null; verzio: number | null; fajlnev: string | null }>(
          `select id::text, fuvar_id::text, tipus, verzio, fajlnev
             from fuvar_dokumentumok
            where fuvar_id = any($1::bigint[])
            order by tipus, verzio desc nulls last, id`,
          [fuvarIds]
        ),
      ])
    : [[], []];

  const megallokKulcsai = [...new Set(blokkok.flatMap((b) => b.megallok.map((m) => cimKulcs(m.nyersCim))).filter(Boolean))];
  const [erkezesSorok, helyszinSorok] = fuvarIds.length
    ? await Promise.all([
        query<{ fuvar_id: string; megallo_index: number; kezi_erkezes: Date | null }>(
          `select megbizas_id::text as fuvar_id, sorszam - 1 as megallo_index, sofor_megerkezett_at as kezi_erkezes
             from fuvar_megallok
            where megbizas_id = any($1::bigint[]) and sofor_megerkezett_at is not null`,
          [fuvarIds]
        ),
        megallokKulcsai.length
          ? query<{ cim_kulcs: string }>(`select cim_kulcs from fuvar_helyszin_koordinata where cim_kulcs = any($1::text[])`, [megallokKulcsai])
          : Promise.resolve([]),
      ])
    : [[], []];
  const erkezesByMegallo = new Map(erkezesSorok.map((e) => [`${e.fuvar_id}/${e.megallo_index}`, e.kezi_erkezes]));
  const rogzitettHelyek = new Set(helyszinSorok.map((h) => h.cim_kulcs));

  const extraById = new Map(extraSorok.map((e) => [e.id, e]));

  // Kapcsolattartó a megrendelő neve alapján. A fuvar_kapcsolatok "ceg"
  // mezője szabad szöveg (más írásmód, Kft./KFT., ékezet), ezért ugyanazzal a
  // kulccsal párosítunk, amivel a Megbízások oldal is dolgozik. Csak olyan sor
  // érdekel, amin VAN telefonszám — a sofőrnek hívni kell tudnia.
  const megrendeloKulcsok = [
    ...new Set(
      blokkok
        .map((b) => b.megrendelo?.trim())
        .filter((n): n is string => Boolean(n))
        .map((n) => normalizaltCegKulcs(ceglNevKanonikusan(n)))
        .filter(Boolean)
    ),
  ];
  const kapcsolatSorok = megrendeloKulcsok.length
    ? await query<{ ceg: string; kapcsolattarto: string | null; telefon: string }>(
        `select ceg, kapcsolattarto, telefon
           from fuvar_kapcsolatok
          where coalesce(trim(telefon), '') <> ''
          order by id asc`
      )
    : [];
  const kapcsolatByKulcs = new Map<string, SoforKapcsolat>();
  for (const k of kapcsolatSorok) {
    const kulcs = normalizaltCegKulcs(ceglNevKanonikusan(k.ceg));
    if (!kulcs || kapcsolatByKulcs.has(kulcs)) continue;
    kapcsolatByKulcs.set(kulcs, { nev: k.kapcsolattarto, telefon: k.telefon });
  }
  const dokByFuvar = new Map<string, SoforDokumentum[]>();
  for (const d of dokSorok) {
    const lista = dokByFuvar.get(d.fuvar_id) ?? [];
    lista.push({ id: d.id, tipus: d.tipus, verzio: d.verzio, fajlnev: d.fajlnev });
    dokByFuvar.set(d.fuvar_id, lista);
  }

  const fuvarok: SoforFuvarBlokk[] = blokkok.map((b) => {
    const extra = extraById.get(b.fuvarId);
    // A megálló-részleteket típuson belül, város szerint párosítjuk (lásd
    // sofor-adatok.ts megalloReszlete) — ehhez kell a típuson belüli sorszám.
    const tipusDarab = { felrako: 0, lerako: 0 };
    for (const m of b.megallok) tipusDarab[m.tipus]++;
    const tipusSzamlalo = { felrako: 0, lerako: 0 };
    const reszletek = b.megallok.map((m) =>
      megalloReszlete(extra?.megallo_reszletek, m.tipus, tipusSzamlalo[m.tipus]++, tipusDarab[m.tipus], m.nyersCim)
    );
    const masRendszam =
      extra?.jarmu && resolveJarmu(extra.jarmu) !== jarmu ? extra.jarmu : null;
    return {
      fuvarId: b.fuvarId,
      megrendelo: b.megrendelo,
      pozicioszam: b.pozicioszam,
      reiseId: extra?.reise_id ?? null,
      aru: extra?.aru ?? null,
      mennyiseg: extra?.mennyiseg ?? null,
      suly: extra?.suly ?? null,
      megjegyzes: extra?.megjegyzes ?? null,
      idopont: extra?.idopont ?? null,
      // tipus='ber' = "Saját fuvar" a felületen — lásd a mező leírását.
      sajatFuvar: extra?.tipus === "ber",
      referencia: extra?.referencia ?? null,
      jarmuEloiras: extra?.jarmu_eloiras ?? null,
      kapcsolat: b.megrendelo?.trim()
        ? kapcsolatByKulcs.get(normalizaltCegKulcs(ceglNevKanonikusan(b.megrendelo))) ?? null
        : null,
      csuszo: b.csuszo,
      masRendszam,
      dokumentumok: dokByFuvar.get(b.fuvarId) ?? [],
      megallok: b.megallok.map((m, i) => ({
        fuvarId: m.fuvarId,
        megalloIndex: m.megalloIndex,
        tipus: m.tipus,
        varos: m.cim,
        cim: m.nyersCim,
        idopont: m.idopont,
        becslesElavult: m.becslesElavult,
        ablakTol: (m.tipus === "felrako" ? extra?.felrakas_ablak_tol : extra?.lerakas_ablak_tol) ?? null,
        ablakIg: (m.tipus === "felrako" ? extra?.felrakas_ablak_ig : extra?.lerakas_ablak_ig) ?? null,
        kesz: m.keszForras !== null,
        keszForras: m.keszForras,
        keszBy: m.keszBy,
        keszAt: m.keszAt,
        visszavonhato: visszavonhatoE(m, extra),
        eppenItt: m.eppenItt,
        napElteres: m.napElteres,
        keziErkezes: erkezesByMegallo.get(`${m.fuvarId}/${m.megalloIndex}`) ?? null,
        helyRogzitve: rogzitettHelyek.has(cimKulcs(m.nyersCim)),
        helyBizonytalan:
          !rogzitettHelyek.has(cimKulcs(m.nyersCim)) && (m.bizonytalanFelismeres || cimPontossaga(m.nyersCim) !== "pontos"),
        varakozasKezdete: m.varakozasKezdete,
        varakozasVege: m.varakozasVege,
        ceg: reszletek[i]?.ceg ?? null,
        ido: reszletek[i]?.ido ?? null,
        nap:
          reszletek[i]?.nap ??
          (m.tipus === "felrako" ? extra?.datum_iso : extra?.lerakas_datum_iso ?? extra?.datum_iso) ??
          null,
        kontakt: reszletek[i]?.kontakt ?? null,
        rakomany: reszletek[i]?.rakomany ?? null,
        kod: reszletek[i]?.kod ?? null,
      })),
    };
  });

  const kovetkezoMegallo = fuvarok.flatMap((f) => f.megallok).find((m) => !m.kesz);

  // A mai napról kiesett, 12 órán belül kézzel lezárt fuvarok (a GPS lap a
  // nap ELŐTT lezártat szándékosan kihagyja — szamitsIdovonalakat
  // napElottKesz). Csak a mai nézetben, és csak a még vissza nem lépett,
  // a jelöléssel lezárt fuvarok; a kocsi-egyezés ugyanaz, mint a sofőri
  // írók jogánál (sofor-jarmu.ts jarmuMatch).
  const nemregLezartak: SoforLezartFuvar[] = [];
  if (nap === budapestMaIso()) {
    const sorok = await query<{
      id: string; megrendelo: string | null; felrako: string | null; lerako: string | null;
      jarmu: string | null; sofor: string | null; megallo_index: number; kesz_at: Date;
    }>(
      `select distinct on (f.id) f.id::text, f.megrendelo, f.felrako, f.lerako, f.jarmu, f.sofor, a.sorszam - 1 as megallo_index, a.sofor_kesz_at as kesz_at
         from fuvar_megbizasok f
         join fuvar_megallok a on a.megbizas_id = f.id and a.sofor_kesz_at is not null
        where f.teljesitve and f.allapot = 'teljesitve' and f.statusz <> 'torolt' and f.torolt_at is null
          and coalesce(f.szamla_szam, '') = ''
          and not exists (select 1 from fuvar_dokumentumok d where d.fuvar_id = f.id and d.tipus = 'fuvarlevel')
          and a.sofor_kesz_at > now() - make_interval(hours => $3)
          and abs(extract(epoch from (f.teljesitve_at - a.sofor_kesz_at))) < 120
          and coalesce(f.lerakas_datum, f.datum) >= $1::date
          and not (f.id = any($2::bigint[]))
        order by f.id, a.sofor_kesz_at desc`,
      [nap, fuvarIds, VISSZAVONAS_ORA]
    ).catch((err) => {
      console.error("[sofor] nemrég lezárt fuvarok:", err);
      return [];
    });
    for (const s of sorok) {
      if (!jarmuMatch(jarmu, s) && s.sofor?.trim().toLowerCase() !== employeeName.trim().toLowerCase()) continue;
      nemregLezartak.push({
        fuvarId: s.id,
        megalloIndex: s.megallo_index,
        megrendelo: s.megrendelo,
        honnan: s.felrako ? varosNev(bontsMegallokra(s.felrako)[0] ?? s.felrako) : null,
        hova: s.lerako ? varosNev(bontsMegallokra(s.lerako).at(-1) ?? s.lerako) : null,
        keszAt: s.kesz_at,
      });
    }
  }

  return {
    napISO: nap,
    sofor: jarmu.sofor,
    jarmuLabel: jarmu.label,
    fuvarok,
    nemregLezartak,
    kovetkezo: kovetkezoMegallo
      ? { fuvarId: kovetkezoMegallo.fuvarId, megalloIndex: kovetkezoMegallo.megalloIndex }
      : null,
    hiba: sajat?.hiba ?? null,
  };
}

/**
 * A sofőr "Megérkeztem" koppintása — a tényleges érkezés ideje, a
 * GPS-becsléstől függetlenül. Csak az első koppintás számít (a második nem
 * írja felül), mert az érkezés egy pillanat, nem állapot.
 */
export async function jelolMegerkeztem(fuvarId: string, megalloIndex: number): Promise<void> {
  await requireFuvarIrasJog(fuvarId);
  const soforNev = (await requireSession()).name;
  await withTransaction((tx) => megerkezettTx(tx, fuvarId, megalloIndex, soforNev));
  toroljIdovonalCachet();
  revalidatePath("/erkezes");
}

/** Ennél régebbi élő pozícióval nem rögzítünk helyszínt — nem tudjuk, hol áll a kocsi. */
const HELYSZIN_MAX_JEL_KOR_PERC = 15;

/**
 * A sofőr a megállóban rögzíti, hogy a megbízáson szereplő cím TÉNYLEGESEN
 * itt van — a kocsi aktuális Ecofleet-pozícióját írjuk a helyszín-szótárba
 * (fuvar_helyszin_koordinata), a cím normalizált kulcsával. Onnantól
 * minden ugyanerre a címre szóló fuvart a GPS-felismerés ide vár.
 *
 * A kocsi pozícióját használjuk, nem a telefonét: a nyomkövető megbízhatóbb,
 * és a sofőr a kocsi mellett áll. Két feltétel: a kocsi álljon (mozgás
 * közben a "hely" értelmetlen), és a jel legyen friss.
 */
export async function rogzitMegalloHelyet(
  fuvarId: string,
  megalloIndex: number
): Promise<{ cim: string; lat: number; lon: number }> {
  await requireFuvarIrasJog(fuvarId);
  const session = await requireSession();

  const sorok = await query<{ felrako: string | null; lerako: string; jarmu: string | null; sofor: string | null }>(
    `select felrako, lerako, jarmu, sofor from fuvar_megbizasok where id = $1`,
    [fuvarId]
  );
  const fuvar = sorok[0];
  if (!fuvar) throw new Error("Nincs ilyen fuvar.");
  const cimek = [...bontsMegallokra(fuvar.felrako), ...bontsMegallokra(fuvar.lerako)];
  const cim = cimek[megalloIndex];
  if (!cim) throw new Error("Nincs ilyen megálló.");

  // Melyik kocsi: a fuvaré. (A sofőr csak a saját kocsijára ütemezett fuvart
  // látja, de a hely a fuvar kocsijához tartozik, nem a bejelentkezett
  // személyhez.)
  const jarmu =
    (fuvar.jarmu ? resolveJarmu(fuvar.jarmu) : null) ??
    (fuvar.sofor ? findJarmuByEmployeeName(fuvar.sofor) : null);
  if (!jarmu?.ecofleetObjectId) throw new Error("A fuvarhoz nem tartozik GPS-es kocsi.");

  const poziciok = await getFleetLastPositions();
  const pos = poziciok.find((p) => p.objectId === jarmu.ecofleetObjectId);
  if (!pos) throw new Error("Nincs élő pozíció a kocsihoz.");
  const jelIdeje = parseEcofleetTimestamp(pos.timestamp);
  if (!jelIdeje || Date.now() - jelIdeje.getTime() > HELYSZIN_MAX_JEL_KOR_PERC * 60000) {
    throw new Error("A kocsi GPS-jele régi, várj egy percet és próbáld újra.");
  }
  if (mozogE(pos)) throw new Error("A kocsi mozog — állj meg a rakodóhelyen, és akkor rögzítsd.");

  const kulcs = cimKulcs(cim);
  if (!kulcs) throw new Error("Üres cím.");
  await query(
    `insert into fuvar_helyszin_koordinata (cim_kulcs, cim_minta, lat, lon, forras, rogzitve_by)
     values ($1, $2, $3, $4, 'sofor', $5)
     on conflict (cim_kulcs)
     do update set cim_minta = excluded.cim_minta, lat = excluded.lat, lon = excluded.lon,
                   forras = excluded.forras, rogzitve_by = excluded.rogzitve_by, rogzitve_at = now()`,
    [kulcs, cim, pos.latitude, pos.longitude, session.name]
  );
  // A felismerés és a GPS lap a következő számításnál már az új helyet lássa.
  toroljGeokodCachet();
  toroljIdovonalCachet();
  revalidatePath("/erkezes");
  console.log(`[sofor] helyszín rögzítve: "${cim}" → ${pos.latitude.toFixed(5)}, ${pos.longitude.toFixed(5)} (${session.name})`);
  return { cim, lat: pos.latitude, lon: pos.longitude };
}

/** Ennél nagyobb fotót nem fogadunk el — a telefon oldalán amúgy is kicsinyítünk (lásd sofor-fuvar-nap.tsx). */
const FOTO_MAX_BAJT = 8 * 1024 * 1024;
/** Fuvaronkénti felső korlát, hogy a DB-tárhelyet egy hibás kliens se tölthesse tele. */
const FOTO_MAX_DB_FUVARONKENT = 40;

/**
 * A sofőr lefotózza a fuvarlevelet/CMR-t a lerakásnál. A kép az adatbázisba
 * kerül (fuvar_dokumentumok.tartalom, tarolas = 'db' — a Drive-ra a service
 * account nem tud írni, lásd 014-es migráció), és "fuvarlevel" típusú
 * dokumentumként a fuvarhoz kötődik (fuvar_dokumentumok) — így a Számla/
 * Posta oldal aznap látja, hogy a papír létezik és mi van rajta. A fizikai
 * beérkezést (papirok_beerkeztek_at) NEM váltja ki: papír nélkül nem
 * számlázunk, de az elveszett fuvarlevél nem két hét múlva derül ki.
 */
export async function feltoltFuvarlevelFoto(fuvarId: string, form: FormData): Promise<{ dokId: string }> {
  await requireFuvarIrasJog(fuvarId);
  const session = await requireSession();
  const fajl = form.get("foto");
  if (!(fajl instanceof File) || fajl.size === 0) throw new Error("Nincs kép.");
  if (fajl.size > FOTO_MAX_BAJT) throw new Error("A kép túl nagy.");
  if (!fajl.type.startsWith("image/")) throw new Error("Csak kép tölthető fel.");

  const sorok = await query<{ datum: string; jarmu: string | null; reise_id: string | null; pozicioszam: string | null }>(
    `select to_char(datum, 'YYYY-MM-DD') as datum, jarmu, reise_id, pozicioszam from fuvar_megbizasok where id = $1`,
    [fuvarId]
  );
  const fuvar = sorok[0];
  if (!fuvar) throw new Error("Nincs ilyen fuvar.");
  const [{ db }] = await query<{ db: number }>(
    `select count(*)::int as db from fuvar_dokumentumok where fuvar_id = $1 and tipus = 'fuvarlevel'`,
    [fuvarId]
  );
  if (db >= FOTO_MAX_DB_FUVARONKENT) throw new Error(`Ehhez a fuvarhoz már ${db} fotó van — többet nem lehet feltölteni.`);

  const hivatkozas = (fuvar.reise_id ?? fuvar.pozicioszam ?? `fuvar${fuvarId}`).replace(/[^A-Za-z0-9_-]+/g, "_");
  const rendszam = (fuvar.jarmu ?? "").replace(/[^A-Za-z0-9]+/g, "").toUpperCase() || "kocsi";
  // A fotóból szkennelt oldal lesz: a papír kivágva, egyenesbe hozva,
  // tisztítva (lib/fuvarozas/doksi-kivagas.ts). A kimenet mindig JPEG, ezért
  // a fájlnév is az. Ha a lap nem ismerhető fel, a kép tisztítva, de vágatlanul
  // megy tovább; a telefonon kicsinyített bemenet külön is megmarad eredetiként.
  const nev = `${fuvar.datum}_${rendszam}_${hivatkozas}_${Date.now()}.jpg`;
  const eredeti = Buffer.from(await fajl.arrayBuffer());
  const szken = await szkennelj(eredeti);
  const tartalom = szken.tartalom;
  // Az eredeti is álló helyzetben tárolódjon: ha a telefon a forgatást csak
  // EXIF-ben jelzi (pl. sikertelen böngészős tömörítésnél), beégetjük — de
  // csak ilyenkor, hogy a már egyenes fotó ne veszítsen az újrakódolással.
  const exif = await sharp(eredeti).metadata().then((m) => m.orientation ?? 1).catch(() => 1);
  const eredetiAllo = exif > 1 ? await sharp(eredeti).rotate().jpeg({ quality: 92 }).toBuffer().catch(() => eredeti) : eredeti;
  const eredetiMime = exif > 1 ? "image/jpeg" : fajl.type || "image/jpeg";

  const beszurt = await query<{ id: string }>(
    `insert into fuvar_dokumentumok (fuvar_id, tipus, fajlnev, tarolas, tartalom, mime_type, meret_byte, feltoltotte, eredeti, eredeti_mime_type)
     values ($1, 'fuvarlevel', $2, 'db', $3, $4, $5, $6, $7, $8)
     returning id::text`,
    [fuvarId, nev, tartalom, szken.mimeType, tartalom.length, session.name ?? session.username, eredetiAllo, eredetiMime]
  );
  // A részletek-lista a dokumentum_url-t linkeli — a saját kiszolgálónkra mutat.
  await query(`update fuvar_dokumentumok set dokumentum_url = $2 where id = $1`, [beszurt[0].id, `/api/fuvarozas/dokumentum/${beszurt[0].id}`]);
  // Saját fuvarnál ez a BEFELÉ kapott szállítólevél fotója (a kifelé menőt a
  // Számlázz.hu állítja ki) — ugyanaz a 'fuvarlevel' irat-típus, mert a
  // fuvar_dokumentumok CHECK-je csak ezt ismeri, és a saját fuvar állapotát a
  // fotó amúgy sem mozdítja (003 trigger: csak jelleg='ber').
  console.log(
    `[sofor] fuvarlevél-fotó feltöltve: fuvar #${fuvarId}, ${nev}, ` +
      `${Math.round(eredeti.length / 1024)} KB → ${Math.round(tartalom.length / 1024)} KB, ` +
      `${szken.kivagva ? "lap kivágva" : `vágatlan (${szken.ok ?? "?"})`} (${session.name})`
  );
  revalidatePath("/erkezes");
  revalidatePath("/fuvarozas2");
  return { dokId: beszurt[0].id };
}

/**
 * A sofőr gondot jelez egy fuvarhoz (rossz cím, nem fogadják, hiányzó
 * papír…). A jelzés a feladatok táblába kerül, amit a diszpécser a
 * Jelenlét/üzenőfal oldalon és a Feladatok csempén lát — nincs új felület,
 * a meglévő csatornán érkezik.
 */
export async function jelezGondot(fuvarId: string, szoveg: string): Promise<void> {
  await requireFuvarIrasJog(fuvarId);
  const session = await requireSession();
  const tiszta = szoveg.trim();
  if (!tiszta) throw new Error("Írd le röviden, mi a gond.");
  const sorok = await query<{ megrendelo: string | null; pozicioszam: string | null; reise_id: string | null; lerako: string }>(
    `select megrendelo, pozicioszam, reise_id, lerako from fuvar_megbizasok where id = $1`,
    [fuvarId]
  );
  const fuvar = sorok[0];
  if (!fuvar) throw new Error("Nincs ilyen fuvar.");
  // A feladat telephelyhez kötött; a sofőr jelzése a központhoz (Szakoly)
  // szól. Ha nincs ilyen nevű telephely, az első felvitt telephelyre megy.
  const site = await query<{ id: number }>(
    `select id from sites order by (name ilike 'szakoly%') desc, id asc limit 1`
  );
  if (!site[0]) throw new Error("Nincs telephely a feladathoz.");
  const hiv = fuvar.reise_id ?? fuvar.pozicioszam;
  const leiras = `Sofőr jelzés (${session.name}) — fuvar #${fuvarId}${fuvar.megrendelo ? `, ${fuvar.megrendelo}` : ""}${hiv ? `, ${hiv}` : ""}, ${varosNev(fuvar.lerako)}: ${tiszta}`;
  await query(
    `insert into feladatok (task_date, site_id, description, urgency, repeat_freq, created_by, forras)
     values (($1::timestamptz at time zone 'Europe/Budapest')::date, $2, $3, 4, 'egyszeri', $4, 'sofor_gond')`,
    [new Date().toISOString(), site[0].id, leiras, session.name]
  );
  console.log(`[sofor] gondjelzés: ${leiras}`);
  revalidatePath("/jelenlet");
  revalidatePath("/erkezes");
}

/**
 * A kapuban kapott pozíciószám / hivatkozási szám beírása, ha a
 * megbízásról nem sikerült kiolvasni. Csak ÜRES mezőt tölt ki — meglévő
 * számot a sofőr nem ír felül, az a diszpécser dolga.
 */
export async function rogzitPozicioszamot(fuvarId: string, szam: string): Promise<void> {
  await requireFuvarIrasJog(fuvarId);
  const session = await requireSession();
  const tiszta = szam.trim();
  if (!tiszta) throw new Error("Üres a szám.");
  const eredmeny = await query<{ id: string }>(
    `update fuvar_megbizasok
        set pozicioszam = $2, pozicioszam_nincs = false
      where id = $1 and coalesce(pozicioszam, '') = ''
      returning id::text`,
    [fuvarId, tiszta]
  );
  if (eredmeny.length === 0) throw new Error("Ehhez a fuvarhoz már van pozíciószám.");
  console.log(`[sofor] pozíciószám rögzítve: fuvar #${fuvarId} → ${tiszta} (${session.name})`);
  toroljIdovonalCachet();
  revalidatePath("/erkezes");
  revalidatePath("/fuvarozas2");
}

/**
 * Várakozás jelölése egy megállón: "kezd" a Várakozom koppintás (csak ha
 * még nincs kezdet), "befejez" a Várakozás vége (csak ha van kezdet és még
 * nincs vég). A GPS-ből az állás látszik, de az oka nem — a Duvenbecknél a
 * rakodóhelyi várakozás pótdíjas. Ez jelzés a diszpécsernek (GPS lap,
 * megbízás részletei), nem automatikus számlázás.
 */
export async function jelolVarakozast(fuvarId: string, megalloIndex: number, muvelet: "kezd" | "befejez"): Promise<void> {
  await requireFuvarIrasJog(fuvarId);
  const soforNev = (await requireSession()).name;
  await withTransaction((tx) => varakozasTx(tx, fuvarId, megalloIndex, muvelet === "kezd" ? "kezd" : "vege", soforNev));
  console.log(`[sofor] várakozás ${muvelet === "kezd" ? "kezdete" : "vége"}: fuvar #${fuvarId}/${megalloIndex} (${soforNev})`);
  toroljIdovonalCachet();
  revalidatePath("/erkezes");
  revalidatePath("/fuvarozas2");
}
