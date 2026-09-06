import { NextResponse } from "next/server";
import { setFuvarPostazva, getSzamlaPostaFuvarok } from "@/lib/fuvarozas/megbizasok";

export async function GET() {
  const eredmeny: Record<string, unknown> = {};
  try {
    const rows = await getSzamlaPostaFuvarok();
    eredmeny.lista_ok = true;
    eredmeny.darab = rows.length;
    eredmeny.elso = rows[0] ?? null;
  } catch (err) {
    eredmeny.lista_hiba = err instanceof Error ? err.message : String(err);
  }

  const tesztId = (eredmeny.elso as { id?: string } | null)?.id;
  if (tesztId) {
    try {
      await setFuvarPostazva(tesztId, true);
      eredmeny.postazva_ok = true;
      await setFuvarPostazva(tesztId, false);
    } catch (err) {
      eredmeny.postazva_hiba = err instanceof Error ? err.message : String(err);
      eredmeny.postazva_stack = err instanceof Error ? err.stack : null;
    }
  }

  return NextResponse.json(eredmeny);
}
