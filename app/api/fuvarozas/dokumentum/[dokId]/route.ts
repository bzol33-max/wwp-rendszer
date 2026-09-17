import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { apiAnyViewGuard } from "@/lib/auth/api-guard";
import { letoltDriveFajl } from "@/lib/fuvarozas/drive-sync-core";

/**
 * Egy fuvar-dokumentum (Duvenbeck megbízás TA…, rakománylista FRALI…, vagy
 * bármely más forrásirat) kiszolgálása a saját szerverünkről.
 *
 * Miért nem a Drive-link megy ki: a fuvar_dokumentumok.dokumentum_url a
 * Google Drive megtekintő-linkje, amit csak olyan fiók nyit meg, amivel a
 * mappa meg van osztva — a sofőr telefonján ilyen nincs. A szinkronizáló
 * service account viszont amúgy is olvassa a mappát, tehát a fájlt mi adjuk
 * ki, a saját jogosultság-ellenőrzésünk mögött.
 *
 * A "fuvarozas_sajat" (sofőri mobil) jog is elég hozzá — a sofőrnek látnia
 * kell a saját fuvarja papírjait a kapuban. Az "attekintes" (vezetői mobil
 * nézet) jog is: a Fuvar fülön a sofőr fuvarlevél-fotója innen nyílik meg.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ dokId: string }> }
) {
  const tiltas = await apiAnyViewGuard(["fuvarozas", "fuvarozas_sajat", "attekintes"]);
  if (tiltas) return tiltas;

  const { dokId } = await params;
  if (!/^\d+$/.test(dokId)) {
    return NextResponse.json({ hiba: "Érvénytelen dokumentum-azonosító." }, { status: 400 });
  }

  const sorok = await query<{ drive_file_id: string; fajlnev: string | null }>(
    `select drive_file_id, fajlnev from fuvar_dokumentumok where id = $1`,
    [dokId]
  );
  const dok = sorok[0];
  if (!dok) {
    return NextResponse.json({ hiba: "Nincs ilyen dokumentum." }, { status: 404 });
  }

  try {
    const fajl = await letoltDriveFajl(dok.drive_file_id);
    const nev = dok.fajlnev ?? fajl.nev;
    return new NextResponse(new Uint8Array(fajl.buffer), {
      headers: {
        "Content-Type": fajl.mimeType,
        // inline: a telefon a beépített PDF-nézőben nyitja meg, nem letölti.
        "Content-Disposition": `inline; filename="${nev.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    console.error("[dokumentum] Drive-letöltés hiba:", err);
    return NextResponse.json({ hiba: "A dokumentum most nem érhető el." }, { status: 502 });
  }
}
