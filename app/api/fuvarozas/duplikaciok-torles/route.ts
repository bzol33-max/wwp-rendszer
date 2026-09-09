import { NextResponse } from "next/server";
import { query } from "@/lib/db";

/**
 * A /api/fuvarozas/duplikaciok végpont által feltárt duplikátum-sorok
 * törlésére — ugyanazt teszi, mint a felületen a "Törlés" gomb
 * (deleteFuvar): NEM töröl fizikailag, csak statusz='torolt'-ra állítja,
 * hogy a naplózás megmaradjon, és (a már javított drive-allapot
 * végpontnak köszönhetően) a dokumentuma többé ne importálódjon vissza.
 *
 * Elvárt body: { ids: string[] }
 */
export async function POST(req: Request) {
  let body: { ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ hiba: "Érvénytelen JSON body." }, { status: 400 });
  }

  const ids = body.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ hiba: "Az 'ids' mezőnek nem üres tömbnek kell lennie." }, { status: 400 });
  }

  let torolve = 0;
  for (const id of ids) {
    const eredmeny = await query<{ id: string }>(
      `update fuvar_megbizasok set statusz = 'torolt' where id = $1 and statusz <> 'torolt' returning id`,
      [id]
    );
    torolve += eredmeny.length;
  }

  return NextResponse.json({ torolve });
}
