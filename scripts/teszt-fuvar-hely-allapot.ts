import { fuvarHelyAllapotbol } from "@/lib/megbizasok/fuvar-hely-allapotbol";

const esetek = [
  ["bér folyamatban", "ber", "folyamatban", "ber_folyamatban"],
  ["bér teljesítve", "ber", "teljesitve", "szamla_posta"],
  ["bér számlázható", "ber", "szamlazhato", "szamla_posta"],
  ["bér számlázva", "ber", "szamlazva", "szamla_posta"],
  ["bér e-mail elküldve", "ber", "email_elment", "szamla_posta"],
  ["bér postázva", "ber", "postazva", "archiv"],
  ["bér lezárt", "ber", "lezart", "archiv"],
  ["saját teljesítve", "sajat", "teljesitve", "archiv"],
  ["saját folyamatban", "sajat", "folyamatban", "sajat_folyamatban"],
  ["saját ellenőrzésre vár", "sajat", "ellenorzesre_var", "sajat_folyamatban"],
] as const;

let hiba = 0;
for (const [nev, jelleg, allapot, vart] of esetek) {
  const kapott = fuvarHelyAllapotbol(jelleg, allapot);
  if (kapott !== vart) {
    hiba++;
    console.error(`${nev}: várt ${vart}, kapott ${kapott}`);
  }
}
console.log(`Fuvar fülleképezés: ${esetek.length - hiba}/${esetek.length} rendben`);
if (hiba) process.exitCode = 1;
