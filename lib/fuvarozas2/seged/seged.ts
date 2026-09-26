"use server";

// A Megbízások oldal beépített segédje (Budaházi Zoltán, 2026-09-26) — a
// jobb oldali kocsi-panel helyén. 1. rész: csak olvas (keresés, fuvar,
// terv, kalkuláció, GPS, partner, levél, számla), tanul (megtanult szabályok
// jóváhagyással), és a teendőket mutatja. Csak admin látja.
//
// A modell az OpenRouteren fut (ugyanaz a kulcs, mint a PDF-beolvasásé);
// OPENROUTER_SEGED_MODEL-lel cserélhető. Az eszközök: ./eszkozok.ts, a
// tudás: ./szakmai-tudas.ts.

import { query } from "@/lib/db";
import { requireSession } from "@/lib/auth/dal";
import { getMaAdat, type Jelzes } from "@/lib/fuvarozas2/ma";
import { ESZKOZOK, futtatEszkozt } from "@/lib/fuvarozas2/seged/eszkozok";
import { segedRendszerUtasitas } from "@/lib/fuvarozas2/seged/szakmai-tudas";

export type SegedUzenet = { id: string; szerep: "user" | "assistant"; tartalom: string; eszkozok: string[] };
export type SegedTudas = { id: string; szoveg: string; letrehozta: string | null; created_at: string };
export type SegedValasz = { ok: true; uzenet: SegedUzenet; javaslatok: string[] } | { ok: false; hiba: string };

const MAX_KOR = 6;
const ELOZMENY_DB = 20;

async function requireSegedJog() {
  const session = await requireSession();
  if (session.role !== "admin") throw new Error("A segéd csak adminnak érhető el.");
  return session;
}

async function tanultSzabalyok(): Promise<SegedTudas[]> {
  return query<SegedTudas>(
    `select id::text, szoveg, letrehozta, created_at::text from seged_tudas where torolve_at is null order by id`
  );
}

/** A panel kezdő állapota: a beszélgetés, a megtanult szabályok, a teendők. */
export async function getSegedAllapot(): Promise<{ uzenetek: SegedUzenet[]; tudas: SegedTudas[]; teendok: Jelzes[] }> {
  const session = await requireSegedJog();
  const [uzenetek, tudas, ma] = await Promise.all([
    query<SegedUzenet>(
      `select * from (
         select id::text, szerep, tartalom, eszkozok from seged_uzenet where user_id = $1 order by id desc limit 40
       ) x order by id::bigint`,
      [session.userId]
    ),
    tanultSzabalyok(),
    getMaAdat().catch(() => null),
  ]);
  return { uzenetek, tudas, teendok: ma?.jelzesek ?? [] };
}

type ModellUzenet =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: EszkozHivas[] }
  | { role: "tool"; tool_call_id: string; content: string };
type EszkozHivas = { id: string; type: "function"; function: { name: string; arguments: string } };

async function modell(uzenetek: ModellUzenet[]): Promise<{ content: string | null; tool_calls?: EszkozHivas[] }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Hiányzik az OPENROUTER_API_KEY környezeti változó.");
  const alap = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
  const res = await fetch(`${alap}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENROUTER_SEGED_MODEL || "google/gemini-2.5-flash",
      messages: uzenetek,
      tools: ESZKOZOK,
      temperature: 0.2,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter hiba (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string | null; tool_calls?: EszkozHivas[] } }[] };
  const m = data.choices?.[0]?.message;
  if (!m) throw new Error("A modell nem válaszolt.");
  return { content: m.content ?? null, tool_calls: m.tool_calls };
}

/** Egy kérdés a segédnek: eszközhívásokkal válaszol, a beszélgetést menti. */
export async function kuldSegednek(szoveg: string): Promise<SegedValasz> {
  const session = await requireSegedJog();
  const kerdes = szoveg.trim().slice(0, 8000);
  if (!kerdes) return { ok: false, hiba: "Üres üzenet." };
  try {
    const [elozmeny, tudas, [{ ma }]] = await Promise.all([
      query<{ szerep: "user" | "assistant"; tartalom: string }>(
        `select * from (select id, szerep, tartalom from seged_uzenet where user_id = $1 order by id desc limit $2) x order by id`,
        [session.userId, ELOZMENY_DB]
      ),
      tanultSzabalyok(),
      query<{ ma: string }>(`select to_char((now() at time zone 'Europe/Budapest'), 'YYYY-MM-DD, TMDay HH24:MI') as ma`),
    ]);
    const uzenetek: ModellUzenet[] = [
      { role: "system", content: segedRendszerUtasitas(ma, tudas.map((t) => t.szoveg)) },
      ...elozmeny.map((u) => ({ role: u.szerep, content: u.tartalom }) as ModellUzenet),
      { role: "user", content: kerdes },
    ];

    const hasznalt: string[] = [];
    const javaslatok: string[] = [];
    let valasz = "";
    for (let kor = 0; kor < MAX_KOR; kor++) {
      const m = await modell(uzenetek);
      if (!m.tool_calls?.length) {
        valasz = (m.content ?? "").trim();
        break;
      }
      uzenetek.push({ role: "assistant", content: m.content ?? null, tool_calls: m.tool_calls });
      for (const h of m.tool_calls) {
        hasznalt.push(h.function.name);
        if (h.function.name === "tudas_javaslat") {
          try {
            const j = (JSON.parse(h.function.arguments || "{}") as { szoveg?: string }).szoveg?.trim();
            if (j) javaslatok.push(j.slice(0, 500));
          } catch {
            // hibás argumentum — a javaslat elmarad
          }
        }
        uzenetek.push({ role: "tool", tool_call_id: h.id, content: await futtatEszkozt(h.function.name, h.function.arguments) });
      }
    }
    if (!valasz) valasz = "Most nem sikerült választ összeállítanom — kérdezd meg másként, vagy bontsd kisebb részekre.";

    await query(`insert into seged_uzenet (user_id, szerep, tartalom) values ($1, 'user', $2)`, [session.userId, kerdes]);
    const [mentett] = await query<{ id: string }>(
      `insert into seged_uzenet (user_id, szerep, tartalom, eszkozok) values ($1, 'assistant', $2, $3) returning id::text`,
      [session.userId, valasz, [...new Set(hasznalt)]]
    );
    return { ok: true, uzenet: { id: mentett.id, szerep: "assistant", tartalom: valasz, eszkozok: [...new Set(hasznalt)] }, javaslatok };
  } catch (err) {
    console.error("[seged] hiba:", err);
    return { ok: false, hiba: err instanceof Error ? err.message : "ismeretlen hiba" };
  }
}

/** Megtanult szabály mentése (Zoltán jóváhagyta, vagy maga írta be). */
export async function mentTudast(szoveg: string, forras: "ember" | "seged_javaslat" = "ember"): Promise<SegedTudas[]> {
  const session = await requireSegedJog();
  const s = szoveg.trim().slice(0, 500);
  if (s) {
    await query(`insert into seged_tudas (szoveg, forras, letrehozta) values ($1, $2, $3)`, [s, forras, session.name ?? session.username]);
  }
  return tanultSzabalyok();
}

export async function torolTudast(id: string): Promise<SegedTudas[]> {
  await requireSegedJog();
  await query(`update seged_tudas set torolve_at = now() where id = $1`, [id]);
  return tanultSzabalyok();
}

/** Új beszélgetés: a régi üzenetek törlése (a megtanult szabályok maradnak). */
export async function ujBeszelgetes(): Promise<void> {
  const session = await requireSegedJog();
  await query(`delete from seged_uzenet where user_id = $1`, [session.userId]);
}
