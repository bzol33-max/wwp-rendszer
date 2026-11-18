import { NextResponse } from "next/server";
import { requireViewPermission } from "@/lib/auth/require-permission";
import { getMaVaszon, type TukorSor } from "@/lib/fuvarozas2/ma-vaszon";
import { getLastDataCachelve } from "@/lib/ecofleet/kliens";
import { tachoAllapotLastDatabol } from "@/lib/ecofleet/szamitas";
import { tachoTervLastDatabol } from "@/lib/ecofleet/plusz";
import { rendszamKulcs } from "@/lib/fuvarozas/ecofleet";

/**
 * A kocsik mai megállói az Útvonaltervező (public/utvonaltervezo.html)
 * térképéhez: ebből rajzolja ki a kocsi hátralévő útját a pillanatnyi
 * GPS-helyétől. Csak olvas, és ugyanazt adja, amit a Ma + hét oldal tükre
 * mutat (`getMaVaszon().kocsik[].sorok`) — sorrendet, állapotot, ETA-t itt
 * nem számolunk újra. Telefonszám és kapcsolattartó nem megy ki.
 *
 * A `tacho` a kocsi tachográfjának Ecofleeten átjövő adata (getLastData
 * tcoData, a közös 30 mp-es gyorsítótárból): mennyi vezetés van a következő
 * kötelező szünetig és a napi keretből. A térkép ebből jelöli a vonalon, meddig
 * jut el a kocsi. Ha az Ecofleet nem válaszol, a `tacho` egyszerűen kimarad.
 *
 * Jog: a teljes "fuvarozas" modul megtekintése kell hozzá.
 */
export const dynamic = "force-dynamic";

type FuvarSor = Extract<TukorSor, { tipus: "fuvar" }>;
type Tacho = { szunetigPerc: number | null; napiHatraPerc: number | null; allapot: string | null; adat: string | null };

async function tachokRendszamSzerint(): Promise<Map<string, Tacho>> {
  const ki = new Map<string, Tacho>();
  try {
    const { sorok } = await getLastDataCachelve();
    for (const sor of sorok as unknown[]) {
      const allapot = tachoAllapotLastDatabol(sor);
      if (!allapot) continue;
      const plate = (sor as { plate?: unknown }).plate;
      if (typeof plate !== "string" || !plate) continue;
      ki.set(rendszamKulcs(plate), {
        szunetigPerc: tachoTervLastDatabol(sor)?.szunetigPerc ?? null,
        napiHatraPerc: allapot.napiVezetesHatraPerc,
        allapot: allapot.allapot,
        adat: allapot.adatIdopont?.toISOString() ?? null,
      });
    }
  } catch {
    // Tachó nélkül is megy a térkép: a vonal megmarad, csak a jelölők nem.
  }
  return ki;
}

export async function GET() {
  try {
    await requireViewPermission("fuvarozas");
  } catch (err) {
    // A requireSession átirányítása (nincs munkamenet) menjen tovább a Nextnek.
    if (err && typeof err === "object" && "digest" in err) throw err;
    return NextResponse.json({ hiba: "Nincs jogosultságod a kocsik útjához." }, { status: 403 });
  }
  try {
    const [vaszon, tachok] = await Promise.all([getMaVaszon(), tachokRendszamSzerint()]);
    const kocsik = vaszon.kocsik
      .filter((k) => k.kod && !k.helykitolto)
      .map((k) => {
        const fuvarok = new Map<string, FuvarSor>();
        for (const s of k.sorok) if (s.tipus === "fuvar") fuvarok.set(s.fuvarId, s);
        const megallok = k.sorok.flatMap((s) =>
          s.tipus === "megallo"
            ? [{
                fuvarId: s.fuvarId,
                partner: fuvarok.get(s.fuvarId)?.partner ?? null,
                jelleg: fuvarok.get(s.fuvarId)?.jelleg ?? null,
                felLe: s.felLe,
                varos: s.varos,
                ceg: s.ceg,
                terv: s.terv,
                teny: s.teny,
                elteres: s.elteres,
                allapot: s.allapot,
                kiemelt: s.kiemelt,
              }]
            : []
        );
        return {
          rendszam: k.kod,
          sofor: k.sofor,
          szin: k.szin ?? null,
          allapot: k.allapot?.szoveg ?? null,
          hely: k.allapot?.hely ?? null,
          vezetes: k.vezetesSor,
          heti: k.hetiSor,
          eta: k.etaSor,
          napiKm: k.napiKm,
          fogyasztas: k.fogyasztas?.l100 ?? null,
          tacho: tachok.get(rendszamKulcs(k.kod ?? "")) ?? null,
          megallok,
        };
      });
    return NextResponse.json({ frissitve: vaszon.frissitve, kocsik }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err && typeof err === "object" && "digest" in err) throw err;
    return NextResponse.json({ hiba: "A kocsik mai megállói most nem érhetők el." }, { status: 500 });
  }
}
