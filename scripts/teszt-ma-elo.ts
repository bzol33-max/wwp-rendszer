// A Ma oldal élő nézete (lib/fuvarozas2/ma-elo.ts): megy/áll/nincs jel,
// következő megálló + ETA, nyomvonal, idősáv, szünetig hátralévő idő.
// Futtatás: npx tsx scripts/teszt-ma-elo.ts

import { budapestPerc, idoTartam, maEloKocsi, savAblak, type EloBemenet } from "@/lib/fuvarozas2/ma-elo";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}
const t = (s: string) => new Date(s);
const MA = "2026-10-12";
// 2026-10-12 nyári idő: Budapest = UTC+2.
const most = t("2026-10-12T10:00:00Z"); // 12:00

function alap(): EloBemenet {
  return {
    pozicio: { lat: 47.3, lon: 19.3, sebesseg: 84, utolsoAdat: t("2026-10-12T09:58:00Z"), motorJar: true, cim: "M5, Ócsa", irany: 140 },
    szakaszok: [
      { tipus: "indulas", idopont: t("2026-10-12T04:30:00Z"), cim: "Telephely", lat: 47.5, lon: 19.0 },
      { tipus: "vezetes", kezdet: t("2026-10-12T04:30:00Z"), veg: t("2026-10-12T06:00:00Z"), honnan: "Telephely", hova: "Újhartyán", hovaLat: 47.2, hovaLon: 19.4, tavKm: 60 },
      { tipus: "allas", kezdet: t("2026-10-12T06:00:00Z"), veg: t("2026-10-12T07:30:00Z"), cim: "Újhartyán", lat: 47.2, lon: 19.4, kategoria: "rakodas" },
      { tipus: "vezetes", kezdet: t("2026-10-12T07:30:00Z"), veg: t("2026-10-12T10:00:00Z"), honnan: "Újhartyán", hova: null, hovaLat: 47.3, hovaLon: 19.3, tavKm: 150 },
    ],
    megallok: [
      { tipus: "felrako", cim: "Újhartyán", idopont: t("2026-10-12T06:00:00Z"), elhagyva: true, eppenItt: false, lat: 47.2, lon: 19.4 },
      { tipus: "lerako", cim: "Debrecen", idopont: t("2026-10-12T13:00:00Z"), elhagyva: false, eppenItt: false, lat: 47.53, lon: 21.63 },
    ],
    eta: { cel: "Debrecen", erkezes: t("2026-10-12T12:40:00Z"), bizonytalan: false },
    vezetesSec: 240 * 60,
    utolsoSzunetVege: t("2026-10-12T07:30:00Z"),
    napiKm: 210,
    most,
  };
}

// 1. Megy.
{
  const r = maEloKocsi(alap(), MA)!;
  eq("MEGY állapot", [r.allapot, r.szam, r.szin], ["MEGY", "84 km/h", "kek"]);
  eq("irány", r.irany, 140);
  eq("mióta megy", r.ota, 150);
  eq("következő: Debrecen, ETA a láncból", r.kovetkezo && [r.kovetkezo.cel, r.kovetkezo.eta, r.kovetkezo.etaNap], ["Debrecen", "14:40", 0]);
  eq("hátra van", r.hatraVan.map((h) => h.cim), ["Debrecen"]);
  eq("nyomvonal: telephely → Újhartyán → most", r.nyomvonal, [[47.5, 19.0], [47.2, 19.4], [47.3, 19.3]]);
  eq("idősáv típusok", r.sav.map((s) => s.tipus), ["vezetes", "rakodas", "vezetes"]);
  eq("idősáv 06:30–08:00", [r.sav[0].tol, r.sav[0].ig], [390, 480]);
  eq("pontok", r.pontok.map((p) => [p.perc, p.kesz]), [[480, true], [900, false]]);
  // Utolsó szünet 09:30 óta 150 perc vezetés → 270−150 = 120.
  eq("szünetig", [r.vezetesPerc, r.szunetigPerc], [240, 120]);
}
// 2. Bizonytalan ETA → a terv szerinti idő.
{
  const b = alap();
  b.eta = { cel: "Debrecen", erkezes: t("2026-10-12T12:40:00Z"), bizonytalan: true };
  eq("bizonytalan ETA helyett terv", maEloKocsi(b, MA)!.kovetkezo!.eta, "15:00");
}
// 3. Más célra szóló ETA nem kerül a következő megállóhoz.
{
  const b = alap();
  b.eta = { cel: "Miskolc", erkezes: t("2026-10-12T12:40:00Z"), bizonytalan: false };
  eq("más cél ETA-ja nem", maEloKocsi(b, MA)!.kovetkezo!.eta, "15:00");
}
// 4. Áll.
{
  const b = alap();
  b.pozicio!.sebesseg = 0;
  b.szakaszok.push({ tipus: "allas", kezdet: t("2026-10-12T09:01:00Z"), veg: most, cim: "Ócsa", lat: 47.3, lon: 19.3, kategoria: "egyeb" });
  const r = maEloKocsi(b, MA)!;
  eq("ÁLL 59 p", [r.allapot, r.szam, r.szin, r.ota], ["ÁLL", "59 p", "borostyan", 59]);
}
// 5. Áll, de nincs állás-szakasz → üres szám.
{
  const b = alap();
  b.pozicio!.sebesseg = 2;
  const r = maEloKocsi(b, MA)!;
  eq("ÁLL ismeretlen óta", [r.allapot, r.szam, r.ota], ["ÁLL", "", null]);
}
// 6. Régi GPS → NINCS JEL.
{
  const b = alap();
  b.pozicio!.utolsoAdat = t("2026-10-12T08:40:00Z");
  const r = maEloKocsi(b, MA)!;
  eq("NINCS JEL 1:20", [r.allapot, r.szam, r.szin, r.gpsKoraPerc], ["NINCS JEL", "1:20", "szurke", 80]);
}
// 7. Nincs pozíció.
eq("nincs pozíció → null", maEloKocsi({ ...alap(), pozicio: null }, MA), null);
// 8. Nincs hátralévő megálló.
{
  const b = alap();
  b.megallok = b.megallok.map((m) => ({ ...m, elhagyva: true }));
  const r = maEloKocsi(b, MA)!;
  eq("nincs következő", [r.kovetkezo, r.hatraVan.length], [null, 0]);
}
// 9. Éppen ott áll → a következő utána jön.
{
  const b = alap();
  b.megallok[1].eppenItt = true;
  eq("éppen itt → nincs következő", maEloKocsi(b, MA)!.kovetkezo, null);
}
// 10. Holnapi ETA.
{
  const b = alap();
  b.eta = { cel: "Debrecen", erkezes: t("2026-10-13T05:15:00Z"), bizonytalan: false };
  eq("holnap 07:15", [maEloKocsi(b, MA)!.kovetkezo!.eta, maEloKocsi(b, MA)!.kovetkezo!.etaNap], ["07:15", 1]);
}
// 11. Rövid állás (<3 p) kimarad a sávból.
{
  const b = alap();
  b.szakaszok.splice(3, 0, { tipus: "allas", kezdet: t("2026-10-12T07:31:00Z"), veg: t("2026-10-12T07:33:00Z"), cim: "x", lat: 47.2, lon: 19.4, kategoria: "egyeb" });
  eq("2 perces állás nincs a sávban", maEloKocsi(b, MA)!.sav.length, 3);
}
// 12. Segédek.
eq("budapestPerc téli idő", budapestPerc(t("2026-12-01T07:00:00Z"), "2026-12-01"), 480);
eq("budapestPerc tegnap", budapestPerc(t("2026-10-11T21:00:00Z"), MA), -60);
eq("idoTartam", [idoTartam(45), idoTartam(60), idoTartam(135)], ["45 p", "1:00", "2:15"]);
eq("savAblak alap", savAblak([], [], 720), { tol: 300, ig: 1320 });
eq("savAblak tágul", savAblak([{ tol: 250, ig: 400 }], [{ perc: 1350 }], 720), { tol: 240, ig: 1380 });
eq("savAblak éjfél után", savAblak([], [], 1430), { tol: 300, ig: 1440 });
eq("savAblak holnapi pont nem tágít", savAblak([], [{ perc: 1500 }], 720), { tol: 300, ig: 1320 });

console.log(`teszt-ma-elo: ${ok} ok, ${bad} hiba`);
if (bad) process.exit(1);
