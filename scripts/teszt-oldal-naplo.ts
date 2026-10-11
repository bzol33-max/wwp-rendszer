// Használati napló (lib/fuvarozas2/oldal-naplo-alap.ts): útvonal-szűrés,
// egységesítés, query-kulcs szűrés, 30 mp-es dedup, összesítés.
// Futtatás: npx tsx scripts/teszt-oldal-naplo.ts

import { egysegesUtvonal, hasznalatOsszesit, kuldeniKell, naplozando, szurtParameter } from "@/lib/fuvarozas2/oldal-naplo-alap";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

// Naplózandó útvonalak.
eq("fuvarozas2 gyökér", naplozando("/fuvarozas2"), true);
eq("fuvarozas2 al", naplozando("/fuvarozas2/diszpecser"), true);
eq("m gyökér", naplozando("/m"), true);
eq("m al", naplozando("/m/holnap"), true);
eq("régi fuvarozas nem", naplozando("/fuvarozas"), false);
eq("mobil nem", naplozando("/mobil"), false);
eq("fuvarozas2x nem", naplozando("/fuvarozas2x"), false);
eq("login nem", naplozando("/login"), false);
eq("üres nem", naplozando(""), false);
eq("null nem", naplozando(null), false);
eq("túl hosszú nem", naplozando("/m/" + "a".repeat(300)), false);

// Egységesítés.
eq("szám id", egysegesUtvonal("/fuvarozas2/megbizasok/123"), "/fuvarozas2/megbizasok/[id]");
eq("uuid id", egysegesUtvonal("/m/fuvar/3f2a1b4c-1234-4abc-9def-0123456789ab"), "/m/fuvar/[id]");
eq("záró perjel", egysegesUtvonal("/fuvarozas2/gps/"), "/fuvarozas2/gps");
eq("gyökér marad", egysegesUtvonal("/m"), "/m");
eq("szöveges szakasz marad", egysegesUtvonal("/fuvarozas2/kimutatas"), "/fuvarozas2/kimutatas");

// Query-kulcsok: csak nezet/tab/het/m, ábécérendben; token/jelszó kiesik.
eq("üres", szurtParameter(""), null);
eq("null", szurtParameter(null), null);
eq("csak tiltott", szurtParameter("?token=abc&jelszo=x&d=5"), null);
eq("megtartott, rendezve", szurtParameter("?tab=lista&token=abc&het=2026-W41&nezet=terkep"), "het=2026-W41&nezet=terkep&tab=lista");
eq("m kulcs", szurtParameter("m=10"), "m=10");
eq("üres érték kiesik", szurtParameter("nezet=&tab=x"), "tab=x");
eq("hosszú érték levágva", szurtParameter("nezet=" + "x".repeat(100)), "nezet=" + "x".repeat(40));
eq("URLSearchParams", szurtParameter(new URLSearchParams({ het: "41", password: "p" })), "het=41");

// Dedup 30 mp.
const t = new Map<string, number>();
eq("első küld", kuldeniKell(t, "u1|/m", 0), true);
eq("10 mp múlva nem", kuldeniKell(t, "u1|/m", 10_000), false);
eq("másik útvonal küld", kuldeniKell(t, "u1|/m/holnap", 10_000), true);
eq("másik user küld", kuldeniKell(t, "u2|/m", 10_000), true);
eq("29,999 mp nem", kuldeniKell(t, "u1|/m", 29_999), false);
eq("30 mp küld", kuldeniKell(t, "u1|/m", 30_000), true);
eq("utána 20 mp nem (az új időponthoz mér)", kuldeniKell(t, "u1|/m", 50_000), false);
const nagy = new Map<string, number>();
for (let i = 0; i < 201; i++) kuldeniKell(nagy, `/m/${i}`, 0);
kuldeniKell(nagy, "/m/uj", 60_000);
eq("régi bejegyzések kitakarítva", nagy.size, 1);

// Összesítés.
const o = hasznalatOsszesit([
  { utvonal: "/fuvarozas2", felhasznalo: "zoltan", db: 5, utoljara: "2026-10-10T08:00:00Z" },
  { utvonal: "/fuvarozas2", felhasznalo: "ifj", db: 7, utoljara: "2026-10-11T08:00:00Z" },
  { utvonal: "/fuvarozas2/kalkulator", felhasznalo: "zoltan", db: 1, utoljara: "2026-10-02T08:00:00Z" },
  { utvonal: "/fuvarozas2/gps", felhasznalo: "zoltan", db: 1, utoljara: "2026-10-01T08:00:00Z" },
]);
eq("sorrend db szerint, azonos db-nál útvonal", o.map((u) => [u.utvonal, u.db]), [["/fuvarozas2", 12], ["/fuvarozas2/gps", 1], ["/fuvarozas2/kalkulator", 1]]);
eq("utoljára a legfrissebb", o[0].utoljara, "2026-10-11T08:00:00Z");
eq("felhasználók db szerint", o[0].felhasznalok.map((f) => f.felhasznalo), ["ifj", "zoltan"]);
eq("üres bemenet", hasznalatOsszesit([]), []);

console.log(`teszt-oldal-naplo: ${ok} ok, ${bad} hiba`);
if (bad) process.exit(1);
