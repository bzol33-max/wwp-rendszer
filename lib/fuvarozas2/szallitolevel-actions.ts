"use server";

// Szállítólevél-pótlás a Rendszer oldalról (2026-11-18): a Számlázz.hu-s
// szállítólevelek behúzása sorszám-tartományra, és saját fuvarok létrehozása a
// párosítatlan szállítólevelekből. Csak fuvarozás-szerkesztő indíthatja.

import { requireSession } from "@/lib/auth/dal";
import { requireEditPermission } from "@/lib/auth/require-permission";
import { potolSzallitoleveleket } from "@/lib/szamlak/poll";
import { sajatFuvarokSzallitolevelekbol, type SzlPotlasSor } from "@/lib/fuvarozas2/szallitolevel";

export async function potolSzallitoleveleketAction(ev: number, tol: number, ig: number): Promise<{ ok: true; uj: number; hianyzo: number; hibak: string[] } | { ok: false; hiba: string }> {
  await requireEditPermission("fuvarozas");
  if (!Number.isInteger(ev) || ev < 2024 || ev > 2100) return { ok: false, hiba: "Érvénytelen év." };
  if (!Number.isInteger(tol) || !Number.isInteger(ig) || tol < 1 || ig < tol || ig - tol > 400) return { ok: false, hiba: "A sorszám-tartomány 1-től, legfeljebb 400 szám egyszerre." };
  try {
    const r = await potolSzallitoleveleket(ev, tol, ig);
    return { ok: true, ...r };
  } catch (err) {
    return { ok: false, hiba: err instanceof Error ? err.message : "A pótlás nem sikerült." };
  }
}

export async function sajatFuvarPotlasAction(tolIso: string, alkalmaz: boolean): Promise<{ ok: true; parositva: number; sorok: SzlPotlasSor[] } | { ok: false; hiba: string }> {
  await requireEditPermission("fuvarozas");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tolIso)) return { ok: false, hiba: "Érvénytelen kezdő dátum." };
  const session = await requireSession();
  try {
    const r = await sajatFuvarokSzallitolevelekbol(tolIso, alkalmaz, `${session.name ?? session.username} (szállítólevél-pótlás)`);
    return { ok: true, ...r };
  } catch (err) {
    return { ok: false, hiba: err instanceof Error ? err.message : "A pótlás nem sikerült." };
  }
}
