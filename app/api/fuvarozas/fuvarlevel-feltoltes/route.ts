import { NextResponse } from "next/server";
import { feltoltFuvarlevelFoto } from "@/lib/fuvarozas/sofor";
import { verifySession } from "@/lib/auth/dal";

// A kép legfeljebb 8 MB (sofor.ts FOTO_MAX_BAJT) + a többi mező és a multipart
// keret. Ennél nagyobb kérést be sem olvasunk.
const MAX_KERES_BAJT = 9 * 1024 * 1024;

/**
 * A sofőr papír-fotójának feltöltése a telefonos sorból (2026-10-23).
 *
 * Miért nem szerver-akció: a telefon a feltöltést NAPOKKAL később is
 * küldheti (térerő nélkül a sorban vár). A szerver-akció azonosítója minden
 * élesítéskor megváltozik, így egy deploy előtt eltett hívás utána „Failed to
 * find Server Action” hibával bukna el (QA-bírálat). Ez a végpont stabil.
 *
 * Bemenet (multipart): fuvarId, foto, kulcs (idempotencia — ugyanaz a kulcs
 * nem hoz létre második oldalt). A jog- és fuvar-ellenőrzés a
 * feltoltFuvarlevelFoto-ban van (requireFuvarIrasJog), ugyanaz, mint eddig.
 */
export async function POST(request: Request) {
  // Az /api kívül esik a proxy bejelentkezés-kapuján: a body beolvasása előtt
  // kell a session- és méret-ellenőrzés, különben bejelentkezés nélkül is
  // nagy kérésekkel memóriát lehetne foglalni (audit A4). Az üzenetek és a
  // státuszkódok ugyanazok, mint a beolvasás utáni ellenőrzéseké.
  const session = await verifySession();
  if (!session.isAuth) return NextResponse.json({ hiba: "Jelentkezz be újra." }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_KERES_BAJT) {
    return NextResponse.json({ hiba: "A kép túl nagy." }, { status: 400 });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ hiba: "Hibás kérés." }, { status: 400 });
  }
  const fuvarId = String(form.get("fuvarId") ?? "");
  if (!/^\d+$/.test(fuvarId)) return NextResponse.json({ hiba: "Érvénytelen fuvar." }, { status: 400 });
  try {
    const e = await feltoltFuvarlevelFoto(fuvarId, form);
    return NextResponse.json(e);
  } catch (err) {
    // A requireSession a bejelentkezésre irányít (NEXT_REDIRECT) — a telefonnak ez 401, a sor megtartja az oldalt.
    const uzenet = err instanceof Error ? err.message : String(err);
    if (uzenet.includes("NEXT_REDIRECT")) return NextResponse.json({ hiba: "Jelentkezz be újra." }, { status: 401 });
    console.error("[fuvarlevel-feltoltes]", uzenet);
    return NextResponse.json({ hiba: uzenet }, { status: 400 });
  }
}
