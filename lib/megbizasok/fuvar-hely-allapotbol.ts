import type { Allapot } from "@/lib/megbizasok/allapotgep";
import type { FuvarHely } from "@/lib/fuvarozas/fuvar-hely";
import { szakaszSorbol } from "@/lib/fuvarozas2/munkaasztal";

/** A Megbízások új állapotából a régi FuvarHely-féle UI-fül (2026-10-06). */
export function fuvarHelyAllapotbol(jelleg: "ber" | "sajat", allapot: Allapot): FuvarHely {
  const hely = szakaszSorbol({ jelleg, allapot });
  if (hely === "archiv") return "archiv";
  if (jelleg === "ber" && (hely === "szamlazasra" || hely === "postara")) return "szamla_posta";
  return jelleg === "ber" ? "ber_folyamatban" : "sajat_folyamatban";
}
