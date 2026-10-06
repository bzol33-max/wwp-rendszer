import { NextResponse } from "next/server";
import sharp from "sharp";
import { query } from "@/lib/db";
import { fuvarIratGuard } from "@/lib/fuvarozas/irat-jog";
import { letoltDriveFajl } from "@/lib/fuvarozas/drive-sync-core";
import { EXCEL_MIME_TIPUSOK, excelHtml } from "@/lib/fuvarozas/import/excel";

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
  request: Request,
  { params }: { params: Promise<{ dokId: string }> }
) {
  const { dokId } = await params;
  if (!/^\d+$/.test(dokId)) {
    return NextResponse.json({ hiba: "Érvénytelen dokumentum-azonosító." }, { status: 400 });
  }

  // A jog a dokumentum FUVARJÁHOZ kötődik, ezért előbb a sor kell — a
  // lekérdezés maga nem ad ki semmit a hívónak.
  const eredetiKer = new URL(request.url).searchParams.get("eredeti") === "1";
  const sorok = await query<{ fuvar_id: string; drive_file_id: string | null; fajlnev: string | null; tarolas: string; tartalom: Buffer | null; mime_type: string | null; eredeti: Buffer | null; eredeti_mime_type: string | null; forgatas: number }>(
    `select fuvar_id::text, drive_file_id, fajlnev, tarolas, tartalom, mime_type, eredeti, eredeti_mime_type, forgatas from fuvar_dokumentumok where id = $1`,
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
    const adat = eredetiKer && dok.eredeti ? dok.eredeti : dok.tartalom;
    const mime = eredetiKer && dok.eredeti ? dok.eredeti_mime_type ?? "image/jpeg" : dok.mime_type ?? "image/jpeg";
    const forgatott = !eredetiKer && dok.forgatas ? await sharp(adat).rotate(dok.forgatas).toBuffer() : adat;
    return new NextResponse(new Uint8Array(forgatott), {
      headers: {
        "Content-Type": biztonsagosMime(mime),
        "Content-Disposition": inlineFajlnev(dok.fajlnev ?? `dokumentum-${dokId}.jpg`),
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (!dok.drive_file_id) {
    return NextResponse.json({ hiba: "A dokumentumnak nincs tartalma." }, { status: 404 });
  }

  try {
    const fajl = await letoltDriveFajl(dok.drive_file_id);
    const nev = dok.fajlnev ?? fajl.nev;
    // Excel-megbízás (lib/fuvarozas/import/excel.ts): a telefon a nyers
    // .xls-t csak letöltené — olvasható táblázat-oldalt adunk, szkript
    // nélkül (a CSP minden szkriptet tilt). ?letolt=1: az eredeti fájl.
    const letolt = new URL(request.url).searchParams.get("letolt") === "1";
    if (EXCEL_MIME_TIPUSOK.has(fajl.mimeType) && !letolt) {
      const html = await excelHtml(fajl.buffer, nev, `/api/fuvarozas/dokumentum/${dokId}?letolt=1`).catch(() => null);
      if (html) {
        return new NextResponse(html, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; frame-ancestors 'self'",
            "Cache-Control": "private, max-age=300",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
    }
    if (EXCEL_MIME_TIPUSOK.has(fajl.mimeType)) {
      return new NextResponse(new Uint8Array(fajl.buffer), {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": inlineFajlnev(nev).replace(/^inline/, "attachment"),
          "Cache-Control": "private, max-age=300",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    // A Drive-on tárolt régi fuvarlevél-képre is érvényes a kért forgatás
    // (a PDF-et nem forgatjuk, annak saját oldaltájolása van).
    const forgatottDrive = !eredetiKer && dok.forgatas && fajl.mimeType.startsWith("image/")
      ? await sharp(fajl.buffer).rotate(dok.forgatas).toBuffer().catch(() => fajl.buffer)
      : fajl.buffer;
    return new NextResponse(new Uint8Array(forgatottDrive), {
      headers: {
        "Content-Type": biztonsagosMime(fajl.mimeType),
        // inline: a telefon a beépített PDF-nézőben nyitja meg, nem letölti.
        "Content-Disposition": inlineFajlnev(nev),
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("[dokumentum] Drive-letöltés hiba:", err);
    return NextResponse.json({ hiba: "A dokumentum most nem érhető el." }, { status: 502 });
  }
}

/**
 * A Content-Disposition fejléc csak ASCII-t engedhet (a Node fejléc-ellenőrzése
 * az ő/ű betűre kivételt dobott, a sofőr 500/502-t kapott — audit FE-2): ASCII
 * tartalék-név + RFC 5987 szerinti UTF-8 név, amit a böngészők előnyben részesítenek.
 */
function inlineFajlnev(nev: string): string {
  const ascii = nev.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "");
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nev)}`;
}

/** Csak ismert, ártalmatlan típus megy ki inline; minden más letöltendő bináris (audit SEC-11). */
function biztonsagosMime(mime: string): string {
  const m = mime.toLowerCase().split(";")[0].trim();
  if (m === "application/pdf" || m.startsWith("image/") && m !== "image/svg+xml") return m;
  if (m.startsWith("application/vnd.openxmlformats") || m === "application/msword") return m;
  return "application/octet-stream";
}
