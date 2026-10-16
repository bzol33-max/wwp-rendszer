// Ecofleet webhook — tiszta segédfüggvények (DB nélkül), a route és a teszt használja.

import { createHash } from "node:crypto";

/**
 * Idempotencia-kulcs: a payload `id` (elsőbbséggel) vagy `eventId` mezője,
 * ha nem üres szöveg vagy szám; különben "sha256:" + a nyers body hash-e.
 */
export function webhookKulcs(payload: unknown, nyersBody: string): string {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const p = payload as Record<string, unknown>;
    for (const mezo of ["id", "eventId"]) {
      const v = p[mezo];
      if (typeof v === "number" && Number.isFinite(v)) return String(v);
      if (typeof v === "string" && v.trim() !== "") return v;
    }
  }
  return "sha256:" + createHash("sha256").update(nyersBody, "utf8").digest("hex");
}
