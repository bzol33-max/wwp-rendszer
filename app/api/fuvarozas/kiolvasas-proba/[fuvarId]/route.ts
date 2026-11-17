import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { verifySession } from "@/lib/auth/dal";
import { letoltDriveFajl } from "@/lib/fuvarozas/drive-sync-core";
import { kepesKiolvasas } from "@/lib/fuvarozas/kiolvasas-kepes";

/**
 * Próba-kiolvasás (D terv, 1. lépés — 2026-11-17): a megbízás eredeti
 * PDF-jét a képes kiolvasóval újraolvassa, és visszaadja az eredményt a
 * jelenlegi (kézzel javított) adatok mellett. SEMMIT NEM ÍR — csak adminnak,
 * az új kiolvasó élesítés előtti összevetéséhez.
 */
export const maxDuration = 180;

const ENGEDETT_MODELLEK = new Set(["google/gemini-2.5-flash", "google/gemini-2.5-pro", "google/gemini-3-flash-preview"]);

export async function GET(request: Request, { params }: { params: Promise<{ fuvarId: string }> }) {
  const session = await verifySession();
  if (!session.isAuth || session.role !== "admin") return NextResponse.json({ hiba: "Csak adminnak." }, { status: 403 });
  const { fuvarId } = await params;
  if (!/^\d+$/.test(fuvarId)) return NextResponse.json({ hiba: "Érvénytelen azonosító." }, { status: 400 });

  const [m] = await query<{ dokumentum_url: string | null; megrendelo: string | null; partner: string | null; felrako: string | null; lerako: string | null; datum: string | null; lerakas_datum: string | null; fuvardij: string | null; penznem: string | null; pozicioszam: string | null }>(
    `select m.dokumentum_url, m.megrendelo, p.nev as partner, m.felrako, m.lerako,
       to_char(m.datum, 'YYYY-MM-DD') as datum, to_char(m.lerakas_datum, 'YYYY-MM-DD') as lerakas_datum,
       m.fuvardij::text, m.fuvardij_penznem as penznem, m.pozicioszam
     from fuvar_megbizasok m left join fuvar_partnerek p on p.id = m.partner_id where m.id = $1`,
    [fuvarId]
  );
  if (!m) return NextResponse.json({ hiba: "Nincs ilyen megbízás." }, { status: 404 });
  const fileId = m.dokumentum_url?.match(/\/d\/([^/?]+)/)?.[1] ?? null;
  if (!fileId) return NextResponse.json({ hiba: "A megbízáshoz nincs Drive-irat." }, { status: 404 });

  const [level] = await query<{ felado: string; torzs: string | null }>(
    `select felado, torzs from fuvar_level where drive_file_id = $1 order by erkezett desc limit 1`,
    [fileId]
  );
  try {
    const fajl = await letoltDriveFajl(fileId);
    if (fajl.mimeType !== "application/pdf") {
      return NextResponse.json({ fuvarId, hiba: `Nem PDF (${fajl.mimeType}) — a próba csak PDF-et olvas.`, jelenlegi: m });
    }
    const kert = new URL(request.url).searchParams.get("modell");
    const modell = kert && ENGEDETT_MODELLEK.has(kert) ? kert : undefined;
    const eredmeny = await kepesKiolvasas({ modell, pdf: fajl.buffer, kuldo: level?.felado ?? null, levelTorzs: level?.torzs ?? null });
    return NextResponse.json({ fuvarId, fajl: fajl.nev, kuldo: level?.felado ?? null, jelenlegi: m, kepes: eredmeny });
  } catch (e) {
    return NextResponse.json({ fuvarId, hiba: e instanceof Error ? e.message : "ismeretlen hiba", jelenlegi: m }, { status: 500 });
  }
}
