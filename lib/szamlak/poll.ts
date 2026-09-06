// A Számlázz.hu-szinkron motorja: EGYETLEN központi hely kérdezi le a
// Számlázz.hu API-t (lásd korábbi döntés — más modulok innen, a `szamla`
// táblából olvasnak, nem az API-ból közvetlenül).
//
// A Számlázz.hu Számla Agent API-jának nincs listázó végpontja, csak
// egyedi számla kérdezhető le sorszám alapján — ezért sorszámról sorszámra
// haladva próbálgatjuk őket. A cég Számlázz.hu-s számlatömbjének előtagja
// (egy valós, 2026-ban kiállított számláról leolvasva: "WLLWR-2026-283")
// "WLLWR", formátum: "{ELOTAG}-{ÉV}-{SORSZÁM}".
//
// FONTOS tervezési döntés: egy adott pillanatban "nem található" sorszám
// nem jelenti, hogy soha nem is lesz — a Számlázz.hu-ban egy sorszám
// lefoglalása megelőzheti a tényleges kiállítást. Ezért a fő kereső
// (szamlak_poll_allapot.utolso_sorszam) és a "még hiányzó" sorszámok
// listája (szamlak_poll_pending) EGYMÁSTÓL FÜGGETLENÜL haladnak: a hiányzó
// sorszámokat minden körben újra megvizsgáljuk, függetlenül attól, hogy a
// fő kereső időközben már jóval előrébb jár.

import { query } from "@/lib/db";
import { lekerdezSzamla, SzamlazzHuError, type SzamlazzHuSzamla } from "./szamlazzhu-client";
import { kategorizalSzamla, alkategorizalRaklap } from "./categorize";

const SZAMLA_ELOTAG = "WLLWR";
/** Egy lekérdezési körben legfeljebb ennyi ÚJ sorszámot próbálunk (a kezdeti,
 *  sok száz számlát behozó felzárkózás fokozatosan, több kör alatt fusson le). */
const MAX_UJ_PROBALKOZAS_KORONKENT = 60;
/** Ennyi egymást követő "nem található" után feladjuk az adott kör előrehaladását
 *  (feltételezve, hogy elértük a jelenlegi frontot — nincs értelme messze előre
 *  találgatni olyan számokat, amik még nem is léteznek). */
const MAX_EGYMASUTANI_HIANY = 5;
/** Ennyi napig próbálkozunk egy hiányzó sorszámmal, mielőtt véglegesen feladjuk. */
const FELADAS_NAPOK = 400;

function budapestEv(): number {
  return Number(
    new Intl.DateTimeFormat("hu-HU", { timeZone: "Europe/Budapest", year: "numeric" }).format(new Date())
  );
}

async function mentSzamla(adat: SzamlazzHuSzamla) {
  const kategoria = kategorizalSzamla(adat.tetelekSzoveg);
  const alkategoria = kategoria === "raklap" ? alkategorizalRaklap(adat.vevoNev) : null;
  await query(
    `insert into szamla
       (szamlaszam, vevo_nev, rendelesszam, fizmod, penznem, teljesites_datum,
        kiallitas_datum, fizetesi_hatarido, netto, afa, brutto, kategoria,
        alkategoria, tetelek_szoveg, raw_xml, lekerdezve_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, now())
     on conflict (szamlaszam) do update set
       vevo_nev = excluded.vevo_nev,
       rendelesszam = excluded.rendelesszam,
       fizmod = excluded.fizmod,
       penznem = excluded.penznem,
       teljesites_datum = excluded.teljesites_datum,
       kiallitas_datum = excluded.kiallitas_datum,
       fizetesi_hatarido = excluded.fizetesi_hatarido,
       netto = excluded.netto,
       afa = excluded.afa,
       brutto = excluded.brutto,
       kategoria = excluded.kategoria,
       alkategoria = excluded.alkategoria,
       tetelek_szoveg = excluded.tetelek_szoveg,
       raw_xml = excluded.raw_xml,
       lekerdezve_at = now()`,
    [
      adat.szamlaszam,
      adat.vevoNev,
      adat.rendelesszam,
      adat.fizmod,
      adat.penznem,
      adat.teljesitesDatum,
      adat.kiallitasDatum,
      adat.fizetesiHatarido,
      adat.netto,
      adat.afa,
      adat.brutto,
      kategoria,
      alkategoria,
      adat.tetelekSzoveg,
      adat.rawXml,
    ]
  );
}

async function felveszPendingbe(szamlaszam: string) {
  await query(
    `insert into szamlak_poll_pending (szamlaszam)
     values ($1)
     on conflict (szamlaszam) do update set
       utoljara_probalt_at = now(),
       probalkozasok = szamlak_poll_pending.probalkozasok + 1`,
    [szamlaszam]
  );
}

async function torolPendingbol(szamlaszam: string) {
  await query(`delete from szamlak_poll_pending where szamlaszam = $1`, [szamlaszam]);
}

export type PollEredmeny = {
  ujMegtalalt: number;
  pendingMegoldva: number;
  hibak: string[];
};

/** Egy teljes lekérdezési kör: 1) a pending sorszámok újrapróbálása, 2) a fő kereső előrehaladása. */
export async function futtatSzamlaSzinkron(): Promise<PollEredmeny> {
  const agentKulcs = process.env.SZAMLAZZHU_API_KEY;
  const eredmeny: PollEredmeny = { ujMegtalalt: 0, pendingMegoldva: 0, hibak: [] };
  if (!agentKulcs) {
    eredmeny.hibak.push("SZAMLAZZHU_API_KEY nincs beállítva — a szinkron kihagyva.");
    return eredmeny;
  }

  // 1) Pending sorszámok — ezek a fő kereső állásától FÜGGETLENÜL, minden
  // körben újra próbálkoznak, amíg meg nem oldódnak vagy fel nem adjuk őket.
  const pendingSorok = await query<{
    szamlaszam: string;
    eloszor_probalt_at: string;
  }>(`select szamlaszam, eloszor_probalt_at from szamlak_poll_pending where feladva = false`);

  for (const sor of pendingSorok) {
    const napokElotte = (Date.now() - new Date(sor.eloszor_probalt_at).getTime()) / (1000 * 60 * 60 * 24);
    try {
      const talalat = await lekerdezSzamla(sor.szamlaszam, agentKulcs);
      if (talalat) {
        await mentSzamla(talalat);
        await torolPendingbol(sor.szamlaszam);
        eredmeny.pendingMegoldva++;
      } else if (napokElotte >= FELADAS_NAPOK) {
        await query(`update szamlak_poll_pending set feladva = true where szamlaszam = $1`, [sor.szamlaszam]);
      } else {
        await felveszPendingbe(sor.szamlaszam);
      }
    } catch (err) {
      eredmeny.hibak.push(
        `${sor.szamlaszam}: ${err instanceof SzamlazzHuError ? err.message : "ismeretlen hiba"}`
      );
    }
  }

  // 2) A fő kereső előrehaladása — új, még sosem próbált sorszámok.
  const ev = budapestEv();
  const allapotSor = (
    await query<{ ev: number; utolso_sorszam: number }>(
      `select ev, utolso_sorszam from szamlak_poll_allapot where id = 1`
    )
  )[0];

  let utolsoSorszam = allapotSor?.ev === ev ? allapotSor.utolso_sorszam : 0;
  let egymasutaniHiany = 0;

  for (let i = 0; i < MAX_UJ_PROBALKOZAS_KORONKENT; i++) {
    const kovetkezo = utolsoSorszam + 1;
    const szamlaszam = `${SZAMLA_ELOTAG}-${ev}-${kovetkezo}`;
    try {
      const talalat = await lekerdezSzamla(szamlaszam, agentKulcs);
      if (talalat) {
        await mentSzamla(talalat);
        utolsoSorszam = kovetkezo;
        eredmeny.ujMegtalalt++;
        egymasutaniHiany = 0;
      } else {
        await felveszPendingbe(szamlaszam);
        utolsoSorszam = kovetkezo;
        egymasutaniHiany++;
        if (egymasutaniHiany >= MAX_EGYMASUTANI_HIANY) break;
      }
    } catch (err) {
      eredmeny.hibak.push(
        `${szamlaszam}: ${err instanceof SzamlazzHuError ? err.message : "ismeretlen hiba"}`
      );
      break; // hálózati/kulcs-hiba esetén ne pörgessük tovább feleslegesen
    }
  }

  await query(
    `insert into szamlak_poll_allapot (id, ev, utolso_sorszam, utolso_futas_at)
     values (1, $1, $2, now())
     on conflict (id) do update set ev = $1, utolso_sorszam = $2, utolso_futas_at = now()`,
    [ev, utolsoSorszam]
  );

  return eredmeny;
}
