import { NextResponse } from "next/server";
import { requireViewPermission } from "@/lib/auth/require-permission";
import { getMaVaszon, type TukorSor } from "@/lib/fuvarozas2/ma-vaszon";
import { getLastDataCachelve } from "@/lib/ecofleet/kliens";
import { tachoAllapotLastDatabol } from "@/lib/ecofleet/szamitas";
import { tachoTervLastDatabol } from "@/lib/ecofleet/plusz";
import { rendszamKulcs } from "@/lib/fuvarozas/ecofleet";
import { geokodolCachelve, megalloPontossaga } from "@/lib/fuvarozas/erintes-felismeres";
import { query } from "@/lib/db";

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
 * A még hátralévő megállók a címükkel és a koordinátájukkal mennek ki — ugyanazzal
 * a `geokodolCachelve`-vel, amit a GPS-felismerés használ (előbb a helyszín-szótár,
 * vagyis a sofőr/diszpécser által rögzített pont, utána geokódolás). Ha egy megállóhoz
 * nincs cím vagy koordináta, a térkép a település nevéből dolgozik.
 *
 * Jog: a teljes "fuvarozas" modul megtekintése kell hozzá.
 */
export const dynamic = "force-dynamic";

type FuvarSor = Extract<TukorSor, { tipus: "fuvar" }>;
type Tacho = { szunetigPerc: number | null; napiHatraPerc: number | null; allapot: string | null; adat: string | null };

/**
 * A megbízások megállóinak nyers címe, megbízásonként és típusonként sorrendben.
 * A tükör megálló-sorai nem hordozzák a sorszámot, ezért a párosítás: ugyanannak a
 * megbízásnak az n-edik felrakója / lerakója.
 */
async function megalloCimek(megbizasIdk: string[]): Promise<Map<string, (string | null)[]>> {
  const ki = new Map<string, (string | null)[]>();
  const idk = megbizasIdk.filter((id) => /^\d+$/.test(id));
  if (idk.length === 0) return ki;
  try {
    const sorok = await query<{ megbizas_id: string; tipus: string; cim_nyers: string | null }>(
      `select megbizas_id::text, tipus, cim_nyers from fuvar_megallok where megbizas_id = any($1::bigint[]) order by megbizas_id, sorszam`,
      [idk]
    );
    for (const s of sorok) {
      const kulcs = `${s.megbizas_id}|${s.tipus}`;
      const lista = ki.get(kulcs) ?? [];
      lista.push(s.cim_nyers);
      ki.set(kulcs, lista);
    }
  } catch {
    // Cím nélkül is megy: a térkép a település nevéből számol.
  }
  return ki;
}

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
    const uzemelok = vaszon.kocsik.filter((k) => k.kod && !k.helykitolto);
    const cimek = await megalloCimek([
      ...new Set(uzemelok.flatMap((k) => k.sorok.flatMap((s) => (s.tipus === "megallo" ? [s.fuvarId] : [])))),
    ]);
    const kocsik = await Promise.all(
      uzemelok.map(async (k) => {
        const fuvarok = new Map<string, FuvarSor>();
        for (const s of k.sorok) if (s.tipus === "fuvar") fuvarok.set(s.fuvarId, s);
        const hanyadik = new Map<string, number>();
        const megallok = await Promise.all(
          k.sorok.flatMap((s) => {
            if (s.tipus !== "megallo") return [];
            const kulcs = `${s.fuvarId}|${s.felLe}`;
            const n = hanyadik.get(kulcs) ?? 0;
            hanyadik.set(kulcs, n + 1);
            const cim = cimek.get(kulcs)?.[n] ?? null;
            return [
              (async () => {
                // Koordináta csak a még hátralévő megállókhoz kell (a kész megállóhoz nem megy út).
                const pont = cim && s.allapot !== "kesz" ? await geokodolCachelve(cim) : null;
                return {
                  fuvarId: s.fuvarId,
                  partner: fuvarok.get(s.fuvarId)?.partner ?? null,
                  jelleg: fuvarok.get(s.fuvarId)?.jelleg ?? null,
                  felLe: s.felLe,
                  varos: s.varos,
                  ceg: s.ceg,
                  cim,
                  lat: pont?.lat ?? null,
                  lon: pont?.lon ?? null,
                  pontossag: pont && cim ? megalloPontossaga(cim) : null,
                  terv: s.terv,
                  teny: s.teny,
                  elteres: s.elteres,
                  allapot: s.allapot,
                  kiemelt: s.kiemelt,
                };
              })(),
            ];
          })
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
          etaIdopont: k.etaIdopont ?? null,
          napiKm: k.napiKm,
          fogyasztas: k.fogyasztas?.l100 ?? null,
          tacho: tachok.get(rendszamKulcs(k.kod ?? "")) ?? null,
          megallok,
        };
      })
    );
    return NextResponse.json({ frissitve: vaszon.frissitve, kocsik }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err && typeof err === "object" && "digest" in err) throw err;
    return NextResponse.json({ hiba: "A kocsik mai megállói most nem érhetők el." }, { status: 500 });
  }
}
