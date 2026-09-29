import "server-only";
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { verifySession } from "@/lib/auth/dal";
import type { ModuleKey } from "@/lib/auth/permissions";
import { findJarmuByEmployeeName, jarmuMatch } from "@/lib/fuvarozas/sofor-jarmu";

/**
 * Egy fuvar iratainak (megbízás-PDF, rakománylista, fuvarlevél-fotó)
 * kiszolgálása előtti jogosultság-ellenőrzés.
 *
 * Miért nem elég a puszta modul-jog (apiAnyViewGuard): a végpont útvonala
 * csak egy sorszám, tehát aki EGY iratot megnyithat, az végigpörgetheti az
 * összeset. A diszpécsernek és a vezetőnek ez a dolga, a sofőrnek viszont
 * nem — a "fuvarozas_sajat" a saját kocsija papírjaira szól, a kapuban.
 * Ezért: a teljes modulok bármelyike → minden irat; csak a sofőri
 * önkiszolgáló jog → kizárólag a saját fuvar iratai.
 *
 * A "saját fuvar" ugyanaz az összerendelés, amit a sofőr nap-nézete használ
 * (lib/fuvarozas/sofor-jarmu.ts): a bejelentkezett dolgozó neve → SAJAT_JARMUVEK
 * kocsi → a fuvar jarmu/sofor mezője. Tartaléknak a fuvar "sofor" mezőjének
 * közvetlen név-egyezése is elég, hogy egy ismeretlen kocsira ültetett sofőr
 * se maradjon papír nélkül.
 *
 * Visszatérési értéke a hibaválasz, vagy null, ha a kérés mehet tovább —
 * ugyanaz a szokás, mint a lib/auth/api-guard.ts őreinél.
 */
export async function fuvarIratGuard(
  fuvarId: string,
  /** A teljes értékű modulok, amiknek birtokosa minden fuvar iratát látja. */
  teljesModulok: ModuleKey[]
): Promise<NextResponse | null> {
  const session = await verifySession();
  if (!session.isAuth) {
    return NextResponse.json({ hiba: "Bejelentkezés szükséges." }, { status: 401 });
  }
  if (teljesModulok.some((m) => session.can(m).view)) return null;
  if (!session.can("fuvarozas_sajat").view) {
    return NextResponse.json(
      { hiba: `Nincs jogosultságod ehhez: ${[...teljesModulok, "fuvarozas_sajat"].join(" / ")}` },
      { status: 403 }
    );
  }
  if (await sajatFuvarE(session.employeeId, fuvarId)) return null;
  // 403, nem 404: a fuvar létezik, csak nem ezé a sofőré — a "nincs ilyen"
  // válasz itt félrevezetné a hibakeresést.
  return NextResponse.json({ hiba: "Ez az irat nem a te fuvarodhoz tartozik." }, { status: 403 });
}

async function sajatFuvarE(employeeId: string | null, fuvarId: string): Promise<boolean> {
  if (!employeeId) return false;
  const [emp] = await query<{ name: string }>(`select name from alkalmazottak where id = $1`, [employeeId]);
  if (!emp?.name) return false;
  const [fuvar] = await query<{ jarmu: string | null; sofor: string | null }>(
    `select jarmu, sofor from fuvar_megbizasok where id = $1`,
    [fuvarId]
  );
  if (!fuvar) return false;
  const nev = emp.name.trim().toLowerCase();
  if (fuvar.sofor && fuvar.sofor.trim().toLowerCase() === nev) return true;
  const jarmu = findJarmuByEmployeeName(emp.name);
  return jarmu ? jarmuMatch(jarmu, fuvar) : false;
}
