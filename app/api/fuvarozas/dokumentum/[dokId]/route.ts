import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { fuvarIratGuard } from "@/lib/fuvarozas/irat-jog";
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
 * A "fuvarozas_sajat" (sofőri mobil) jog is elég hozzá — de CSAK a saját
 * fuvar irataira (lib/fuvarozas/irat-jog.ts): az útvonal egyetlen sorszám,
 * tehát enélkül egy sofőr végigpörgethetné a cég összes iratát. Az
 * "attekintes" (vezetői mobil nézet) jog viszont mindet nyitja: a Fuvar
 * fülön a sofőr fuvarlevél-fotója innen nyílik meg.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ dokId: string }> }
) {
  const { dokId } = await params;
  if (!/^\d+$/.test(dokId)) {
    return NextResponse.json({ hiba: "Érvénytelen dokumentum-azonosító." }, { status: 400 });
  }

  // A jog a dokumentum FUVARJÁHOZ kötődik, ezért előbb a sor kell — a
  // lekérdezés maga nem ad ki semmit a hívónak.
  const sorok = await query<{ fuvar_id: string; drive_file_id: string | null; fajlnev: string | null; tarolas: string; tartalom: Buffer | null; mime_type: string | null }>(
    `select fuvar_id::text, drive_file_id, fajlnev, tarolas, tartalom, mime_type from fuvar_dokumentumok where id = $1`,
    [dokId]
  );
  const dok = sorok[0];
  if (!dok) {
    return NextResponse.json({ hiba: "Nincs ilyen dokumentum." }, { status: 404 });
  }

  const tiltas = await fuvarIratGuard(dok.fuvar_id, ["fuvarozas", "attekintes"]);
  if (tiltas) return tiltas;

  // A sofőr fuvarlevél-fotója az adatbázisban van (014-es migráció).
  if (dok.tarolas === "db" && dok.tartalom) {
    return new NextResponse(new Uint8Array(dok.tartalom), {
      headers: {
        "Content-Type": dok.mime_type ?? "image/jpeg",
        "Content-Disposition": `inline; filename="${(dok.fajlnev ?? `dokumentum-${dokId}.jpg`).replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  }
  if (!dok.drive_file_id) {
    return NextResponse.json({ hiba: "A dokumentumnak nincs tartalma." }, { status: 404 });
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
