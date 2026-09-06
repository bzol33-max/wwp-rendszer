import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import fs from "fs";
import path from "path";

type ImportSor = {
  csv_id: number;
  allapot: string;
  datum: string;
  lerakas_datum: string | null;
  felrako: string | null;
  lerako: string | null;
  megrendelo: string;
  jarmu: string | null;
  sofor: string | null;
  fuvardij: number | null;
  megjegyzes: string | null;
  pozicioszam: string | null;
  pozicioszam_nincs: boolean;
  szamla_szam: string | null;
  postazva: boolean;
  postazva_at: string | null;
  fizetesi_hatarido_nap: number | null;
  postazasi_cim: string | null;
  dokumentum_url: string | null;
  erkezett_datum: string | null;
};

type MeglevoSor = {
  id: string;
  dokumentum_url: string | null;
  szamla_szam: string | null;
  megrendelo: string | null;
  datum: string;
};

function driveId(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

function normNev(s: string | null): string {
  return (s || "")
    .toLowerCase()
    .replace(/["„”]/g, "")
    .replace(/kft\.?|zrt\.?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A felhasználó megadott egy teljes, hiteles CSV-táblázatot (66 saját fuvar)
 * mint forrás-igazságot. NEM törlünk semmit — minden CSV-sorhoz megkeressük
 * a legjobb egyező meglévő rekordot (Drive-fájl ID > számlaszám > megrendelő+
 * dátum), és azt UPDATE-eljük a CSV adataival; ha nincs egyező, új sort
 * szúrunk be. A végén jelentjük, mely meglévő "sajat" sorokhoz nem volt CSV
 * egyezés (ezeket nem bántjuk, csak jelezzük).
 */
export async function GET() {
  const jsonPath = path.join(process.cwd(), "db", "temp-sajat-fuvarok-import.json");
  const sorok: ImportSor[] = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));

  const meglevo = await query<MeglevoSor>(
    `select id::text, dokumentum_url, szamla_szam, megrendelo, datum::text
     from fuvar_megbizasok
     where tipus = 'sajat' and statusz <> 'torolt'`
  );

  const parositatlanMeglevo = new Set(meglevo.map((m) => m.id));

  const frissitve: { id: string; csv_id: number; megrendelo: string; mod: string }[] = [];
  const uj: { id: string; csv_id: number; megrendelo: string }[] = [];

  for (const s of sorok) {
    let talalat: MeglevoSor | undefined;
    let mod = "";

    const csvDriveId = driveId(s.dokumentum_url);
    if (csvDriveId) {
      talalat = meglevo.find((m) => driveId(m.dokumentum_url) === csvDriveId);
      if (talalat) mod = "drive_id";
    }
    if (!talalat && s.szamla_szam) {
      talalat = meglevo.find((m) => m.szamla_szam === s.szamla_szam);
      if (talalat) mod = "szamla_szam";
    }
    if (!talalat) {
      talalat = meglevo.find(
        (m) => normNev(m.megrendelo) === normNev(s.megrendelo) && m.datum === s.datum
      );
      if (talalat) mod = "megrendelo_datum";
    }

    if (talalat) {
      parositatlanMeglevo.delete(talalat.id);
      await query(
        `update fuvar_megbizasok set
           datum = $2, lerakas_datum = $3, felrako = $4, lerako = $5, megrendelo = $6,
           jarmu = $7, sofor = $8, fuvardij = $9, megjegyzes = $10, pozicioszam = $11,
           pozicioszam_nincs = $12, szamla_szam = $13, postazva = $14, postazva_at = $15,
           fizetesi_hatarido_nap = $16, postazasi_cim = $17, dokumentum_url = $18,
           erkezett_datum = $19
         where id = $1`,
        [
          talalat.id,
          s.datum,
          s.lerakas_datum,
          s.felrako,
          s.lerako,
          s.megrendelo,
          s.jarmu,
          s.sofor,
          s.fuvardij,
          s.megjegyzes,
          s.pozicioszam,
          s.pozicioszam_nincs,
          s.szamla_szam,
          s.postazva,
          s.postazva_at,
          s.fizetesi_hatarido_nap,
          s.postazasi_cim,
          s.dokumentum_url,
          s.erkezett_datum,
        ]
      );
      frissitve.push({ id: talalat.id, csv_id: s.csv_id, megrendelo: s.megrendelo, mod });
    } else {
      const res = await query<{ id: string }>(
        `insert into fuvar_megbizasok
           (tipus, datum, lerakas_datum, felrako, lerako, megrendelo, jarmu, sofor,
            fuvardij, megjegyzes, pozicioszam, pozicioszam_nincs, szamla_szam,
            postazva, postazva_at, fizetesi_hatarido_nap, postazasi_cim,
            dokumentum_url, erkezett_datum, forras, ellenorzott)
         values ('sajat', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'kezi', true)
         returning id::text`,
        [
          s.datum,
          s.lerakas_datum,
          s.felrako,
          s.lerako,
          s.megrendelo,
          s.jarmu,
          s.sofor,
          s.fuvardij,
          s.megjegyzes,
          s.pozicioszam,
          s.pozicioszam_nincs,
          s.szamla_szam,
          s.postazva,
          s.postazva_at,
          s.fizetesi_hatarido_nap,
          s.postazasi_cim,
          s.dokumentum_url,
          s.erkezett_datum,
        ]
      );
      uj.push({ id: res[0].id, csv_id: s.csv_id, megrendelo: s.megrendelo });
    }
  }

  const parositatlanReszletek = meglevo.filter((m) => parositatlanMeglevo.has(m.id));

  return NextResponse.json({
    frissitveDarab: frissitve.length,
    ujDarab: uj.length,
    frissitve,
    uj,
    csvVelNemEgyezoMeglevoSorok: parositatlanReszletek,
  });
}
