import { NextResponse } from "next/server";
import { addFuvar } from "@/lib/fuvarozas/megbizasok";
import type { AddFuvarInput } from "@/lib/fuvarozas/fuvar-constants";

/**
 * A Drive-fuvarmegbízás-figyelő automatika (ütemezett Claude-feladat, lásd
 * projekt-attekintes.md) ezzel viszi fel az újonnan talált, Drive-ból
 * kiolvasott fuvarmegbízásokat — pontosan úgy, mint egy kézi PDF-import:
 * forras = "pdf_import", ellenorzott = false, tehát a "Fuvarozás →
 * Előkészített" listán jelenik meg jóváhagyásra váró sorként, NEM kerül
 * automatikusan véglegesnek számító állapotba (lásd a rendszerspecifikáció
 * 8. pontja: "Ne kerüljön automatikusan végleges állapotba").
 *
 * Elvárt body: { fuvarok: AddFuvarInput[] } — minden elemnek legalább
 * `lerako` és `datum` mezője legyen (ezek kötelezőek az addFuvar-nál is).
 */
export async function POST(req: Request) {
  let body: { fuvarok?: Partial<AddFuvarInput>[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ hiba: "Érvénytelen JSON body." }, { status: 400 });
  }

  const fuvarok = body.fuvarok;
  if (!Array.isArray(fuvarok) || fuvarok.length === 0) {
    return NextResponse.json({ hiba: "A 'fuvarok' mezőnek nem üres tömbnek kell lennie." }, { status: 400 });
  }

  const eredmenyek: { index: number; ok: boolean; hiba?: string }[] = [];

  for (let i = 0; i < fuvarok.length; i++) {
    const f = fuvarok[i];
    if (!f.datum || !f.lerako) {
      eredmenyek.push({ index: i, ok: false, hiba: "Hiányzó kötelező mező: datum vagy lerako." });
      continue;
    }
    try {
      await addFuvar({
        ...f,
        tipus: f.tipus ?? "sajat",
        datum: f.datum,
        lerako: f.lerako,
        forras: "pdf_import",
        ellenorzott: false,
      } as AddFuvarInput);
      eredmenyek.push({ index: i, ok: true });
    } catch (err) {
      eredmenyek.push({
        index: i,
        ok: false,
        hiba: err instanceof Error ? err.message : "ismeretlen hiba",
      });
    }
  }

  return NextResponse.json({ eredmenyek });
}
