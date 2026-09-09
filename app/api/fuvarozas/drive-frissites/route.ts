import { NextResponse } from "next/server";
import { setFuvarFuvardij, setFuvarFizetesiHatarido } from "@/lib/fuvarozas/megbizasok";

/**
 * A Drive-fuvarmegbízás-figyelő automatika utólagos pótló körének
 * ellenpárja a /api/fuvarozas/drive-hianyok végponthoz: ide küldi vissza a
 * dokumentum újbóli elolvasásával most már megtalált fuvardíjat és/vagy
 * fizetési határidőt egy MÁR meglévő fuvarhoz (id alapján) — ÚJ sort nem
 * hoz létre, és a mezőt csak akkor írja felül, ha a kérésben ténylegesen
 * szerepel (undefined = nem nyúl hozzá, tehát egy korábban már kézzel
 * kitöltött értéket sem ír felül feleslegesen).
 *
 * Elvárt body: { frissitesek: [{ id, fuvardij?, fizetesiHataridoNap? }] }
 */
export async function POST(req: Request) {
  let body: {
    frissitesek?: { id?: string; fuvardij?: number; fizetesiHataridoNap?: number }[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ hiba: "Érvénytelen JSON body." }, { status: 400 });
  }

  const frissitesek = body.frissitesek;
  if (!Array.isArray(frissitesek) || frissitesek.length === 0) {
    return NextResponse.json(
      { hiba: "A 'frissitesek' mezőnek nem üres tömbnek kell lennie." },
      { status: 400 }
    );
  }

  const eredmenyek: { index: number; ok: boolean; hiba?: string }[] = [];

  for (let i = 0; i < frissitesek.length; i++) {
    const f = frissitesek[i];
    if (!f.id) {
      eredmenyek.push({ index: i, ok: false, hiba: "Hiányzó kötelező mező: id." });
      continue;
    }
    try {
      if (f.fuvardij !== undefined) {
        await setFuvarFuvardij(f.id, f.fuvardij);
      }
      if (f.fizetesiHataridoNap !== undefined) {
        await setFuvarFizetesiHatarido(f.id, f.fizetesiHataridoNap);
      }
      eredmenyek.push({ index: i, ok: true });
    } catch (err) {
      eredmenyek.push({
        index: i,
        ok: false,
        hiba: err instanceof Error ? err.message : "ismeretlen hiba",
      });
    }
  }

  return NextResponse.json({ eredmenyek });
}
