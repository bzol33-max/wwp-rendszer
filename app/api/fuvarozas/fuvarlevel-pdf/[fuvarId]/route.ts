import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { query } from "@/lib/db";
import { apiAnyViewGuard } from "@/lib/auth/api-guard";
import { letoltDriveFajl } from "@/lib/fuvarozas/drive-sync-core";

/**
 * Egy fuvar összes fuvarlevél-/CMR-fotója egyetlen PDF-ben, a feltöltés
 * sorrendjében (Budaházi Zoltán, 2026-09-28: „az okmányok több oldalasak,
 * akár 10 vagy több … kell pdf”) — a megbízónak egy csatolmányként
 * küldhető. Mindig a pillanatnyi oldalakból készül, nincs tárolt példány,
 * így egy később pótolt oldal is benne van.
 *
 * Oldalméret: A4, a kép arányosan kitölti (fekvő képnél fekvő A4). JPEG és
 * PNG ágyazható be; más formátumú oldal (ritka, a telefon JPEG-et küld)
 * kimarad, és a fájlnév jelzi.
 */
const A4 = { rovid: 595.28, hosszu: 841.89 };
const MARGO = 18;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fuvarId: string }> }
) {
  const tiltas = await apiAnyViewGuard(["fuvarozas", "fuvarozas_sajat", "attekintes", "elszamolas"]);
  if (tiltas) return tiltas;

  const { fuvarId } = await params;
  if (!/^\d+$/.test(fuvarId)) {
    return NextResponse.json({ hiba: "Érvénytelen fuvar-azonosító." }, { status: 400 });
  }

  const [fuvar] = await query<{ datum: string | null; hivatkozas: string | null }>(
    `select to_char(datum, 'YYYY-MM-DD') as datum,
       coalesce(hivatkozas_kanonikus, pozicioszam, reise_id) as hivatkozas
     from fuvar_megbizasok where id = $1`,
    [fuvarId]
  );
  if (!fuvar) return NextResponse.json({ hiba: "Nincs ilyen fuvar." }, { status: 404 });

  const oldalak = await query<{ id: string; tarolas: string; tartalom: Buffer | null; mime_type: string | null; drive_file_id: string | null }>(
    `select id::text, tarolas, tartalom, mime_type, drive_file_id
     from fuvar_dokumentumok where fuvar_id = $1 and tipus = 'fuvarlevel' order by created_at, id`,
    [fuvarId]
  );
  if (oldalak.length === 0) {
    return NextResponse.json({ hiba: "Ehhez a fuvarhoz még nincs fuvarlevél-fotó." }, { status: 404 });
  }

  const pdf = await PDFDocument.create();
  let kimaradt = 0;
  for (const o of oldalak) {
    try {
      let bajtok: Uint8Array;
      let mime: string;
      if (o.tarolas === "db" && o.tartalom) {
        bajtok = new Uint8Array(o.tartalom);
        mime = o.mime_type ?? "image/jpeg";
      } else if (o.drive_file_id) {
        const f = await letoltDriveFajl(o.drive_file_id);
        bajtok = new Uint8Array(f.buffer);
        mime = f.mimeType;
      } else {
        kimaradt++;
        continue;
      }
      const kep = mime === "image/png" ? await pdf.embedPng(bajtok) : mime === "image/jpeg" || mime === "image/jpg" ? await pdf.embedJpg(bajtok) : null;
      if (!kep) {
        kimaradt++;
        continue;
      }
      const fekvo = kep.width > kep.height;
      const lapSz = fekvo ? A4.hosszu : A4.rovid;
      const lapM = fekvo ? A4.rovid : A4.hosszu;
      const arany = Math.min((lapSz - 2 * MARGO) / kep.width, (lapM - 2 * MARGO) / kep.height);
      const w = kep.width * arany;
      const h = kep.height * arany;
      const lap = pdf.addPage([lapSz, lapM]);
      lap.drawImage(kep, { x: (lapSz - w) / 2, y: (lapM - h) / 2, width: w, height: h });
    } catch (err) {
      console.error(`[fuvarlevel-pdf] #${fuvarId} oldal ${o.id} kimaradt:`, err);
      kimaradt++;
    }
  }
  if (pdf.getPageCount() === 0) {
    return NextResponse.json({ hiba: "Egyik oldal sem fűzhető PDF-be." }, { status: 422 });
  }

  const hiv = (fuvar.hivatkozas ?? `fuvar${fuvarId}`).replace(/[^A-Za-z0-9_-]+/g, "_");
  const nev = `fuvarlevel_${fuvar.datum ?? ""}_${hiv}${kimaradt > 0 ? `_${kimaradt}-oldal-kimaradt` : ""}.pdf`;
  const bajtok = await pdf.save();
  return new NextResponse(new Uint8Array(bajtok), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nev}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
