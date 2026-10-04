"use server";

// A GPS-idővonal és a címkereső felületi (kliensből hívott) akciói — a
// jogosultságot itt ellenőrizzük, a számolás a lib/fuvarozas/actions.ts
// szerveroldali magjában van. A sofőri önkiszolgáló jog ("fuvarozas_sajat")
// szándékosan NINCS a listán: a sofőr a saját napját a lib/fuvarozas/sofor.ts
// getSoforNap-ján át kapja, a teljes flottáét nem (audit 2026-10-04).

import { requireAnyViewPermission, requireViewPermission } from "@/lib/auth/require-permission";
import {
  getIdovonalak as szamolIdovonalakat,
  getKovetkezoNapokElonezet as szamolKovetkezoNapokat,
  searchAddressSuggestions as keresCimet,
  type IdovonalNap,
  type KovetkezoNap,
} from "@/lib/fuvarozas/actions";
import type { GeocodedAddress } from "@/lib/fuvarozas/utdijkalkulacio";

export async function getIdovonalak(nap?: string): Promise<IdovonalNap> {
  await requireAnyViewPermission(["fuvarozas", "elszamolas", "attekintes"]);
  return szamolIdovonalakat(nap);
}

export async function getKovetkezoNapokElonezet(napokSzama = 3): Promise<Record<string, KovetkezoNap[]>> {
  await requireViewPermission("fuvarozas");
  return szamolKovetkezoNapokat(napokSzama);
}

// Jogosultság (2026-09-30): a HU-GO-hívó akciók eddig nem ellenőriztek jogot.
export async function searchAddressSuggestions(query: string): Promise<GeocodedAddress[]> {
  await requireViewPermission("fuvarozas");
  return keresCimet(query);
}
