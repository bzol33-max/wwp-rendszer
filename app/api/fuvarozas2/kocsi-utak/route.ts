import { NextResponse } from "next/server";
import { requireViewPermission } from "@/lib/auth/require-permission";
import { getMaVaszon, type TukorSor } from "@/lib/fuvarozas2/ma-vaszon";

/**
 * A kocsik mai megállói az Útvonaltervező (public/utvonaltervezo.html)
 * térképéhez: ebből rajzolja ki a kocsi hátralévő útját a pillanatnyi
 * GPS-helyétől. Csak olvas, és ugyanazt adja, amit a Ma + hét oldal tükre
 * mutat (`getMaVaszon().kocsik[].sorok`) — sorrendet, állapotot, ETA-t itt
 * nem számolunk újra. Telefonszám és kapcsolattartó nem megy ki.
 *
 * Jog: a teljes "fuvarozas" modul megtekintése kell hozzá.
 */
export const dynamic = "force-dynamic";

type FuvarSor = Extract<TukorSor, { tipus: "fuvar" }>;

export async function GET() {
  try {
    await requireViewPermission("fuvarozas");
  } catch (err) {
    // A requireSession átirányítása (nincs munkamenet) menjen tovább a Nextnek.
    if (err && typeof err === "object" && "digest" in err) throw err;
    return NextResponse.json({ hiba: "Nincs jogosultságod a kocsik útjához." }, { status: 403 });
  }
  try {
    const vaszon = await getMaVaszon();
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
          megallok,
        };
      });
    return NextResponse.json({ frissitve: vaszon.frissitve, kocsik }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err && typeof err === "object" && "digest" in err) throw err;
    return NextResponse.json({ hiba: "A kocsik mai megállói most nem érhetők el." }, { status: 500 });
  }
}
