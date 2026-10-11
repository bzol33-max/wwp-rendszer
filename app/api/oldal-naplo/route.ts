import { NextResponse, after } from "next/server";
import { verifySession } from "@/lib/auth/dal";
import { query } from "@/lib/db";
import { egysegesUtvonal, kuldeniKell, naplozando, szurtParameter } from "@/lib/fuvarozas2/oldal-naplo-alap";

// Használati napló (db/migrations/039_oldal_megnyitas.sql): a
// components/oldal-naplo.tsx küldi navigator.sendBeacon-nel a /fuvarozas2/**
// és /m/** megnyitásakor. Mindig azonnal 204 — a beírás a válasz után fut
// (after), és bármilyen hibája csendben elnyelődik: a napló soha nem
// lassíthatja vagy törheti el az oldalt. A felhasználó a munkamenetből jön
// (nem a kliensből), a query-stringből csak a nézet-kulcsok maradnak.

// Ugyanaz a felhasználó ugyanazt az útvonalat 30 mp-en belül egyszer
// számít (több fül, gyors oda-vissza navigáció). Folyamatonként tartott —
// ha több példány fut, legfeljebb egy-egy dupla sor kerülhet be.
const utolso = new Map<string, number>();

export async function POST(req: Request) {
  const szoveg = (await req.text().catch(() => "")).slice(0, 1000);
  after(async () => {
    try {
      const adat = JSON.parse(szoveg) as { utvonal?: unknown; kereses?: unknown };
      const nyers = typeof adat.utvonal === "string" ? adat.utvonal : null;
      if (!naplozando(nyers)) return;
      const session = await verifySession();
      if (!session.isAuth) return;
      const utvonal = egysegesUtvonal(nyers!);
      if (!kuldeniKell(utolso, `${session.userId}|${utvonal}`, Date.now())) return;
      const parameter = szurtParameter(typeof adat.kereses === "string" ? adat.kereses.slice(0, 500) : null);
      await query(
        `insert into oldal_megnyitas (user_id, felhasznalo, utvonal, parameter) values ($1, $2, $3, $4)`,
        [session.userId, session.username, utvonal, parameter]
      );
    } catch {
      // csendben — a napló nem fontosabb az oldalnál
    }
  });
  return new NextResponse(null, { status: 204 });
}
