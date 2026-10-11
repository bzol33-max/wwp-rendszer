// Papír-jelzés (2026-10-11): „Papír megjött ✓” / visszavonás, a postázás
// nem állítja a papírt, a jog ugyanaz, mint a postázásé.
// Futtatás: npx tsx scripts/teszt-papir-jelzes.ts

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { feladvaMegerosites, papirFelirat, papirValtasHiba, PAPIR_HIANY_SZOVEG, PAPIR_NINCS_NYUGTAZVA } from "../lib/megbizasok/papir-alap";
import { megbizasJogok } from "../lib/megbizasok/jogok";
import type { ModuleKey } from "../lib/auth/permissions";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

// Váltás-szabályok
const ber = { jelleg: "ber", torolt: false };
eq("nyugtázás mehet", papirValtasHiba({ ...ber, megvan: false, megjott: true }), null);
eq("visszavonás mehet", papirValtasHiba({ ...ber, megvan: true, megjott: false }), null);
eq("dupla nyugtázás nem", papirValtasHiba({ ...ber, megvan: true, megjott: true }), "A papír már nyugtázva van.");
eq("üres visszavonás nem", papirValtasHiba({ ...ber, megvan: false, megjott: false }), "Nincs nyugtázott papír, nincs mit visszavonni.");
eq("saját fuvarnál nincs", papirValtasHiba({ jelleg: "sajat", torolt: false, megvan: false, megjott: true }), "Papír-nyugtázás csak bérfuvarnál van.");
eq("törölt nem", papirValtasHiba({ ...ber, torolt: true, megvan: false, megjott: true }), "Törölt megbízás.");

// Feladva-megerősítés
eq("papír nélkül figyelmeztet", feladvaMegerosites({ megbizo: "X Kft.", szamlaSzam: "WLLWR-1", papirMegvan: false }).includes(PAPIR_NINCS_NYUGTAZVA), true);
eq("papír nyugtázva: nincs figyelmeztetés", feladvaMegerosites({ megbizo: "X Kft.", szamlaSzam: "WLLWR-1", papirMegvan: true }).includes(PAPIR_NINCS_NYUGTAZVA), false);
eq("szöveg", PAPIR_NINCS_NYUGTAZVA, "Az eredeti papír még nincs nyugtázva");
eq("számlázási szöveg", PAPIR_HIANY_SZOVEG, "Az eredeti papír még nem érkezett meg");

// Fotó külön jelzés
eq("fotó nem papír", papirFelirat({ papirMegvan: false, fotoVan: true }), "papír még nincs · fotó van");
eq("papír megvan", papirFelirat({ papirMegvan: true, fotoVan: false }), "papír megvan");

// Jog: a papír-nyugtázás ugyanaz, aki postázhat (valtAllapot) — elszámol.
const GYOKER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const akciok = readFileSync(path.join(GYOKER, "lib/megbizasok/akciok.ts"), "utf8");
const torzs = (nev: string) => {
  const i = akciok.indexOf(`export async function ${nev}(`);
  return i < 0 ? "" : akciok.slice(i, akciok.indexOf("\nexport ", i + 10));
};
const guard = (t: string) => /require\w+\(\[?[^)]*\)/.exec(t)?.[0] ?? null;
eq("setPapirMegjott létezik", torzs("setPapirMegjott").length > 0, true);
eq("ugyanaz a jog, mint a postázásé (valtAllapot)", guard(torzs("setPapirMegjott")), guard(torzs("valtAllapot")));
eq("a jog: fuvarozás vagy elszámolás szerkesztés", guard(torzs("setPapirMegjott")), `requireAnyEditPermission(["fuvarozas", "elszamolas"])`);
eq("naplóz (papir_beerkezett)", torzs("setPapirMegjott").includes(`"papir_beerkezett"`), true);
const jog = (m: Partial<Record<ModuleKey, boolean>>) => megbizasJogok({ can: (k: ModuleKey) => ({ view: !!m[k], edit: !!m[k] }) }).elszamol;
eq("Szabina (csak elszámolás) nyugtázhat", jog({ elszamolas: true }), true);
eq("fuvarszervező nyugtázhat", jog({ fuvarozas: true }), true);
eq("dolgozó nem", jog({ fuvarozas_sajat: true }), false);

// A postázás többé nem írja a papírt.
const allapotAkcio = readFileSync(path.join(GYOKER, "lib/megbizasok/allapot-akcio.ts"), "utf8");
eq("valtAllapotTx nem írja a papirok_beerkeztek_at-et", /papirok_beerkeztek_(at|by)\s*=/.test(allapotAkcio), false);
// A sémafájl indításkor sem tölti vissza a papírt a számlaszámból.
const schema = readFileSync(path.join(GYOKER, "db/schema.sql"), "utf8");
eq("schema.sql nem hamisít papírt", /set\s+papirok_beerkeztek_at\s*=/.test(schema), false);

console.log(`teszt-papir-jelzes: ${ok} ok, ${bad} hiba`);
if (bad) process.exit(1);
