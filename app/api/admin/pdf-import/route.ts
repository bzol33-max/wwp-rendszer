import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Ideiglenes admin endpoint: Drive-ból kinyert fuvarmegbízás-adatok tömeges
// beszúrása "forras='pdf_import', ellenorzott=false" státusszal, hogy az
// "Ellenőrzésre vár" fülön jóváhagyásra várjanak. Egyszeri felhasználás után
// törlendő.

const TOKEN = "wwp-pdf-import-2026-09-04";

type ImportRow = {
  megrendelo?: string;
  datum: string;
  idopont?: string | null;
  felrako: string;
  lerako: string;
  aru?: string | null;
  mennyiseg?: string | null;
  suly?: string | null;
  jarmu?: string | null;
  fuvardij?: number | null;
  megjegyzes?: string | null;
  dokumentumUrl?: string | null;
  driveFileId?: string | null;
};

export async function POST(req: NextRequest) {
  const auth = req.headers.get("x-admin-token");
  if (auth !== TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rows = (await req.json()) as ImportRow[];
  let inserted = 0;

  for (const r of rows) {
    await query(
      `insert into fuvar_megbizasok
         (tipus, datum, idopont, felrako, lerako, megrendelo, aru, mennyiseg, suly,
          jarmu, alvallalkozo, fuvardij, koltseg, megjegyzes,
          dokumentum_url, drive_file_id, forras, ellenorzott, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
      [
        "sajat",
        r.datum,
        r.idopont || null,
        r.felrako,
        r.lerako,
        r.megrendelo || null,
        r.aru || null,
        r.mennyiseg || null,
        r.suly || null,
        r.jarmu || null,
        null,
        r.fuvardij ?? null,
        null,
        r.megjegyzes || null,
        r.dokumentumUrl || null,
        r.driveFileId || null,
        "pdf_import",
        false,
        "admin-import",
      ]
    );
    inserted++;
  }

  return NextResponse.json({ inserted });
}
