import { normalizeNev } from "@/lib/attekintes/nev";

export type AttekintesProfil = "zoltan" | "szabina";

// Melyik felhasználó melyik fülkészletet kapja — lásd
// components/attekintes/tab-bar.tsx a tényleges fülekért. Akinek nincs itt
// bejegyzése, az alapértelmezett (zoltan) fülkészletet kapja.
const PROFIL_BY_USER: Record<string, AttekintesProfil> = {
  [normalizeNev("Budaházi Zoltán")]: "zoltan",
  [normalizeNev("Budaházi Szabina")]: "szabina",
};

export function getAttekintesProfil(userName: string): AttekintesProfil {
  return PROFIL_BY_USER[normalizeNev(userName)] ?? "zoltan";
}
