import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  const beszurando = [
    {
      datum: "2026-08-07",
      lerakas_datum: "2026-08-10",
      felrako: "Baromfi Coop Zrt, Nyírjákó, Baktalórántházi út",
      lerako: "Jánossomorja (szállítási cím szerint)",
      megrendelo: "Kriki-Sped Kereskedelmi és Szolgáltató Kft.",
      aru: "Bigbeges műtrágya",
      mennyiseg: "24 tonna",
      jarmu: "Micó — NMZ-492/XZV-926",
      sofor: "Micó",
      fuvardij: 245000,
      megjegyzes: "TimocomID: 542984. Csereraklap NEM szükséges.",
      szamla_szam: "WLLWR-2026-244",
      dokumentum_url: null as string | null,
    },
    {
      datum: "2026-09-02",
      lerakas_datum: "2026-09-03",
      felrako: "Nyírjákó (Baromfi-Coop Kft.)",
      lerako: "Ikrény (RWA)",
      megrendelo: "Hajdúspedíció Kft.",
      aru: "BB Bio Fer Natur",
      mennyiseg: "24 tonna",
      jarmu: "Micó — NMZ-492/XZV-926",
      sofor: "Micó",
      fuvardij: 230000,
      megjegyzes: "Ügyintéző: Hajdu János. Lerakás előtt 1 nappal értesítés kérve.",
      szamla_szam: null as string | null,
      dokumentum_url: "https://drive.google.com/file/d/1HuH-3TAbOJYVIQJN9k00Xl3YXUZLQj-y/view",
    },
    {
      datum: "2026-09-03",
      lerakas_datum: "2026-09-04",
      felrako: "Pázmándfalu (Kalászka Mg.i Szövetkezet)",
      lerako: "Nagyhegyes, Elep tanya (Biopoint Kft.)",
      megrendelo: "Hajdúspedíció Kft.",
      aru: "BB Zebra/Natur II. Fok",
      mennyiseg: "22 tonna",
      jarmu: "Micó — NMZ-492/XZV-926",
      sofor: "Micó",
      fuvardij: 215000,
      megjegyzes: "Ügyintéző: Hajdu János.",
      szamla_szam: null as string | null,
      dokumentum_url: "https://drive.google.com/file/d/1yIayap8m_RS-EFrcQ1rvUiUQmcvS5282/view",
    },
  ];

  const beszurt = [];
  for (const f of beszurando) {
    const res = await query<{ id: string }>(
      `insert into fuvar_megbizasok
         (tipus, datum, lerakas_datum, felrako, lerako, megrendelo, aru, mennyiseg,
          jarmu, sofor, fuvardij, megjegyzes, szamla_szam, dokumentum_url, forras, ellenorzott)
       values ('sajat', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pdf_import', false)
       returning id::text`,
      [
        f.datum,
        f.lerakas_datum,
        f.felrako,
        f.lerako,
        f.megrendelo,
        f.aru,
        f.mennyiseg,
        f.jarmu,
        f.sofor,
        f.fuvardij,
        f.megjegyzes,
        f.szamla_szam,
        f.dokumentum_url,
      ]
    );
    beszurt.push({ id: res[0].id, megrendelo: f.megrendelo, datum: f.datum });
  }

  return NextResponse.json({ beszurt });
}
