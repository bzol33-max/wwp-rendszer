// Város szintű GPS-érintés (lib/fuvarozas/varos-erintes.ts + idovonal.ts
// jelolMegallokat) és a településszintű cím felismerése (varos.ts
// cimPontossaga). (2026-10-06)
//
// Futtatás:  npx tsx scripts/teszt-varos-erintes.ts
//
// Élesben elveszett két érintés: a #293 lerakója "HU-4031 Debrecen" (a kocsi
// 12:01–12:39 a Nyomdász u. 5-ben állt), a #300 felrakója "4541 Nyírjákó,
// Fermentáló üzem Nyírjákó külterület" (Micó 11:06–13:12 a falu határában).

import { jelolMegallokat, megalloJeloltjei, type IdovonalSzakasz, type TervezettMegallo } from "@/lib/fuvarozas/idovonal";
import { cimPontossaga } from "@/lib/fuvarozas/varos";
import { erintesDontes, telepulesEgyezik, varosKorben, type ErintesMegalloAdat } from "@/lib/fuvarozas/varos-erintes";

let ok = 0;
let bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else {
    bad++;
    console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`);
  }
}

const t = (ora: number, perc = 0, nap = 5) => new Date(Date.UTC(2026, 9, nap, ora - 2, perc)); // budapesti nyári idő, 2026-10
// 1 fok szélesség ≈ 111 km.
const eszakra = (p: { lat: number; lon: number }, km: number) => ({ lat: p.lat + km / 111, lon: p.lon });

const SARVAR = { lat: 47.2539, lon: 16.9353 };
const DEBRECEN = { lat: 47.5316, lon: 21.6273 };
const NYIRJAKO = { lat: 48.0281, lon: 22.079 };

function megallo(index: number, tipus: "felrako" | "lerako", hely: { lat: number; lon: number }, ablakKezdet: Date, cim: string, pontossag: TervezettMegallo["pontossag"]): TervezettMegallo {
  return {
    index, tipus, cim, nyersCim: cim, pontossag, lat: hely.lat, lon: hely.lon, idopont: ablakKezdet,
    elhagyva: false, eppenItt: false, tenylegesIdo: null, tenylegesTavozas: null, bizonytalanFelismeres: false,
    ablakKezdet, keszForras: null, keszBy: null,
  };
}
function allas(hely: { lat: number; lon: number }, kezdet: Date, percek: number, cim: string | null = null): IdovonalSzakasz {
  return { tipus: "allas", kezdet, veg: new Date(kezdet.getTime() + percek * 60000), idotartamSec: percek * 60, cim, lat: hely.lat, lon: hely.lon, kategoria: "rakodas", osszevontLepesek: 0 };
}
function vezetes(hova: { lat: number; lon: number }, kezdet: Date, veg: Date): IdovonalSzakasz {
  return { tipus: "vezetes", kezdet, veg, tavKm: 50, idotartamSec: (veg.getTime() - kezdet.getTime()) / 1000, atlagSebesseg: 60, honnan: null, hova: null, hovaLat: hova.lat, hovaLon: hova.lon };
}

// 1) Cím-pontosság: az irányítószám önmagában település szint.
{
  eq("HU-4031 Debrecen: város szintű", cimPontossaga("HU-4031 Debrecen"), "csak_varos");
  eq("Nyírjákó külterület: város szintű", cimPontossaga("4541 Nyírjákó , Fermentáló üzem Nyírjákó külterület"), "csak_varos");
  eq("utca + házszám: pontos", cimPontossaga("Yanfeng International Automotive, Juhar utca 17, HU 8500 Papa"), "pontos");
  eq("irsz + házszám (ékezet nélküli 'Ut'): pontos", cimPontossaga("9600 Sarvar, Pelda Ut 5"), "pontos");
  eq("ismert telephely-kód (BILK): pontos", cimPontossaga("Budapest (BILK)"), "pontos");
  eq("RBT Hrsz.: pontos", cimPontossaga("HAJDU HAJDUSÁGI ZRT [H-4243] TÉGLÁS, Hrsz. 0135/9"), "pontos");
  eq("tételsorszám nem házszám", cimPontossaga("1. Szállítólevél szerint - Debrecen GLOBUS HU- 4000 Debrecen"), "csak_varos");
}

// 2) Település-név egyezés az Ecofleet-címben.
{
  eq("Debrecen a címben", telepulesEgyezik("Debrecen", "Nyomdász utca 5, 4031 Debrecen, Hungary"), true);
  eq("ékezet/kisbetű független", telepulesEgyezik("Nyírjákó", "NYIRJAKO, külterület"), true);
  eq("'Debreceni út' nem Debrecen", telepulesEgyezik("Debrecen", "Debreceni út 12, Hajdúsámson"), false);
  eq("nincs cím", telepulesEgyezik("Debrecen", null), false);
}

// 3) A tiszta döntés és az elutasítás oka.
{
  const varos: ErintesMegalloAdat = { pontossag: "csak_varos", varos: "Debrecen", sugarKm: 4, ablakKezdet: t(0, 0, 6) };
  const j = (tavKm: number, kezdet: Date, percek: number, allasCim: string | null = null) => ({ tavKm, idotartamSec: percek * 60, kezdet, veg: new Date(kezdet.getTime() + percek * 60000), allasCim });
  eq("kör belül, 30 perc: cím szintű", erintesDontes(varos, j(2, t(12, 0, 6), 30)), { elfogadva: true, szint: "cim" });
  eq("5 km, 38 perc: város szintű", erintesDontes(varos, j(5, t(12, 1, 6), 38)), { elfogadva: true, szint: "varos" });
  eq("5 km, 15 perc: túl rövid", erintesDontes(varos, j(5, t(12, 1, 6), 15)).elfogadva === false && (erintesDontes(varos, j(5, t(12, 1, 6), 15)) as { ok: string }).ok, "rovid");
  eq("#300 Olaszliszka: 6,3 km Erdőbényén, 69 perc: város szintű", erintesDontes({ ...varos, varos: "Olaszliszka", ablakKezdet: t(11, 6, 6) }, j(6.3, t(7, 9, 7), 69, "Erdőbénye, Magyarország")), { elfogadva: true, szint: "varos" });
  eq("9 km név nélkül: messze", (erintesDontes(varos, j(9, t(12, 0, 6), 40)) as { ok: string }).ok, "messze");
  eq("9 km a település nevével: város szintű", erintesDontes(varos, j(9, t(12, 0, 6), 40, "Nyomdász utca 5, Debrecen")), { elfogadva: true, szint: "varos" });
  eq("20 km a nevével is: messze", (erintesDontes(varos, j(20, t(12, 0, 6), 40, "Debrecen")) as { ok: string }).ok, "messze");
  eq("előző nap véget ért: ablak előtt", (erintesDontes(varos, j(5, t(10, 0, 5), 60)) as { ok: string }).ok, "ablak_elott");
  eq("két nappal később: ablak után", (erintesDontes(varos, j(5, t(12, 0, 8), 60)) as { ok: string }).ok, "ablak_utan");
  const pontos: ErintesMegalloAdat = { ...varos, pontossag: "pontos", sugarKm: 2 };
  eq("pontos címnél nincs város szintű tágítás", (erintesDontes(pontos, j(5, t(12, 0, 6), 60, "Debrecen")) as { ok: string }).ok, "messze");
  eq("pontos címnél a régi 10 perces szabály", (erintesDontes(pontos, j(1, t(12, 0, 6), 5)) as { ok: string }).ok, "rovid");
  eq("varosKorben: pontos címnél soha", varosKorben({ pontossag: "pontos", varos: "Debrecen" }, 1, "Debrecen"), false);
  const ok = erintesDontes(varos, j(5, t(12, 1, 6), 15));
  eq("az ok szövege tartalmazza a távolságot", !ok.elfogadva && ok.reszlet.includes("5.0 km"), true);
}

// 4) #293: Sárvár → Debrecen (csak "HU-4031 Debrecen"), a kocsi a
//    városközéptől 5 km-re, a Nyomdász utcában áll 12:01–12:39, majd hazaindul.
{
  const NYOMDASZ = eszakra(DEBRECEN, 5);
  const f = () => [
    megallo(0, "felrako", SARVAR, t(0, 0, 5), "Sárvár", "pontos"),
    megallo(1, "lerako", DEBRECEN, t(0, 0, 6), "Debrecen", cimPontossaga("HU-4031 Debrecen")),
  ];
  const nap = (lerakoPerc: number): IdovonalSzakasz[] => [
    { tipus: "indulas", idopont: t(14, 0, 5), cim: null, lat: SARVAR.lat, lon: SARVAR.lon },
    allas(SARVAR, t(14, 56, 5), 44, "Sárvár"),
    vezetes(NYOMDASZ, t(15, 40, 5), t(12, 1, 6)),
    allas(NYOMDASZ, t(12, 1, 6), lerakoPerc, "Nyomdász utca 5, 4031 Debrecen"),
    vezetes(eszakra(DEBRECEN, 40), t(12, 40, 6), t(13, 30, 6)),
  ];
  const [j] = jelolMegallokat([f()], nap(38));
  eq("#293: a debreceni lerakó kész", j[1].elhagyva, true);
  eq("#293: város szintű egyezés", j[1].varosSzintuEgyezes, true);
  eq("#293: bizonytalan jelölés", j[1].bizonytalanFelismeres, true);
  eq("#293: érkezés 12:01", j[1].tenylegesIdo?.toISOString(), t(12, 1, 6).toISOString());
  eq("#293: a sárvári felrakó cím szintű", j[0].varosSzintuEgyezes, false);

  const [rovid] = jelolMegallokat([f()], nap(15));
  eq("#293, csak 15 perc: nincs érintés", rovid[1].tenylegesIdo, null);
  const jeloltek = megalloJeloltjei(rovid[1], nap(15));
  eq("#293, 15 perc: a jelölt oka 'rovid'", jeloltek.map((x) => (x.dontes.elfogadva ? "ok" : x.dontes.ok)), ["rovid"]);
  eq("#293, 15 perc: város szintű jelölt", jeloltek.map((x) => x.szint), ["varos"]);

  // Pontos (utcás) címnél ugyanez az 5 km nem érintés, és a napló "messze"-t mond.
  const pontos = [f()[0], megallo(1, "lerako", DEBRECEN, t(0, 0, 6), "Debrecen", "pontos")];
  eq("pontos cím, 5 km: nincs érintés", jelolMegallokat([pontos], nap(38))[0][1].tenylegesIdo, null);
}

// 5) A város szintű látogatás az ÁLLÁS helyétől "megy tovább", nem a
//    városközéptől: a kocsi a lerakás után 1,5 km-t gurul a városon belül
//    (a központtól már 6,5 km-re), ott áll — még nem hagyta el a lerakót.
{
  const NYOMDASZ = eszakra(DEBRECEN, 5);
  const f = [megallo(0, "lerako", DEBRECEN, t(0, 0, 6), "Debrecen", "csak_varos")];
  const szakaszok: IdovonalSzakasz[] = [
    vezetes(NYOMDASZ, t(10, 0, 6), t(12, 1, 6)),
    allas(NYOMDASZ, t(12, 1, 6), 30, "Debrecen"),
    vezetes(eszakra(DEBRECEN, 6.5), t(12, 31, 6), t(12, 35, 6)),
    allas(eszakra(DEBRECEN, 6.5), t(12, 35, 6), 5, "Debrecen"),
  ];
  const [j] = jelolMegallokat([f], szakaszok);
  eq("városon belüli araszolás: még itt áll", j[0].eppenItt, true);
  eq("városon belüli araszolás: nem elhagyva", j[0].elhagyva, false);
}

// 6) #300: Nyírjákó, a fermentáló üzem a falu határában (5 km), Micó
//    11:06–13:12 áll ott; a pontos körrel kimaradt.
{
  const UZEM = eszakra(NYIRJAKO, -5);
  const f = [megallo(0, "felrako", NYIRJAKO, t(0, 0, 6), "Nyírjákó", cimPontossaga("4541 Nyírjákó , Fermentáló üzem Nyírjákó külterület")), megallo(1, "lerako", DEBRECEN, t(0, 0, 7), "Debrecen", "pontos")];
  const szakaszok: IdovonalSzakasz[] = [
    vezetes(UZEM, t(10, 0, 6), t(11, 6, 6)),
    allas(UZEM, t(11, 6, 6), 126, null),
    vezetes(eszakra(NYIRJAKO, -30), t(13, 12, 6), t(14, 0, 6)),
  ];
  const [j] = jelolMegallokat([f], szakaszok);
  eq("#300: a nyírjákói felrakó kész", j[0].elhagyva, true);
  eq("#300: város szintű egyezés", j[0].varosSzintuEgyezes, true);
  eq("#300: érkezés 11:06", j[0].tenylegesIdo?.toISOString(), t(11, 6, 6).toISOString());
}

// 7) A cím körében lévő állás elsőbbséget kap a város szintű előtt (két
//    azonos lerakójú fuvar: az egyik a körben, a másik a településen).
{
  const f1 = [megallo(0, "lerako", DEBRECEN, t(0, 0, 6), "Debrecen", "csak_varos")];
  const f2 = [megallo(0, "lerako", DEBRECEN, t(0, 0, 6), "Debrecen", "csak_varos")];
  const szakaszok: IdovonalSzakasz[] = [
    allas(eszakra(DEBRECEN, 5), t(9, 0, 6), 40, "Debrecen"),
    vezetes(eszakra(DEBRECEN, 1), t(9, 40, 6), t(10, 0, 6)),
    allas(eszakra(DEBRECEN, 1), t(10, 0, 6), 40, "Debrecen"),
    vezetes(eszakra(DEBRECEN, 60), t(10, 40, 6), t(12, 0, 6)),
  ];
  const [a, b] = jelolMegallokat([f1, f2], szakaszok);
  eq("elsőbbség: az első fuvar a körben lévő állást kapja", a[0].varosSzintuEgyezes, false);
  eq("elsőbbség: a második a város szintűt", b[0].varosSzintuEgyezes, true);
}

console.log(`\nVáros szintű érintés: ${ok} rendben, ${bad} hiba`);
if (bad > 0) process.exit(1);
