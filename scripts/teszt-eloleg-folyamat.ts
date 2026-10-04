// Az előleg teljes életútja: felvitel → nyugtázás → bérlevonás → nyugtázás.
// Futtatás: npx tsx scripts/teszt-eloleg-folyamat.ts
//
// Miért fontos: Budaházi Zoltán kérdése (2026-10-04) — "beírom az előleget, a
// dolgozó jóváhagyja, nő az egyenleg; fizetéskor beírom a levonást, azt is
// jóváhagyja, csökken az egyenleg". Ez a teszt a sorokat pontosan úgy állítja
// elő, ahogy a szerver teszi (lib/dolgozok/actions.ts: addAdvance és
// syncEloleg), és ellenőrzi, mit lát ebből a dolgozó a telefonján.

import { elolegBontas, type ElolegTetel } from "@/lib/dolgozok/shared";

let ok = 0,
  bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else {
    bad++;
    console.log(
      `  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`
    );
  }
}

// A telefonon látható "el nem számolt előleg": MINDEN tétel összege —
// lásd getEmployeeElolegek.osszesen.
const egyenleg = (l: ElolegTetel[]) => l.reduce((s, t) => s + t.amount, 0);
const nyugtazatlan = (l: ElolegTetel[]) => l.filter((t) => !t.acceptedAt).length;

let seq = 0;
/** Amit az admin visz fel a Dolgozók → Előleg fülön (addAdvance). */
function elolegFelvitel(date: string, amount: number, note: string | null = null): ElolegTetel {
  seq += 1;
  return { id: String(seq), date, amount, note, acceptedAt: null, acceptedBy: null };
}
/**
 * Amit a bérkártya "Előleg" mezője hoz létre fizetéskor (syncEloleg): NEGATÍV
 * sor, a hónap 1-jére keltezve, rögzített megjegyzéssel.
 */
function berLevonas(ev: number, honap: number, levont: number): ElolegTetel {
  seq += 1;
  const HO = ["január","február","március","április","május","június","július","augusztus","szeptember","október","november","december"];
  return {
    id: String(seq),
    date: `${ev}-${String(honap).padStart(2, "0")}-01`,
    amount: -levont,
    note: `bérből levonva (${HO[honap - 1]} ${ev})`,
    acceptedAt: null,
    acceptedBy: null,
  };
}
/** A dolgozó megnyomja az ELFOGADOM gombot (acceptAdvance). */
function nyugtaz(t: ElolegTetel, mikor = "2026-10-04 09:00"): ElolegTetel {
  if (t.acceptedAt) return t; // a szerver sem írja felül: "accepted_at is null"
  return { ...t, acceptedAt: mikor, acceptedBy: "Vadon Gergő" };
}

// ---------------------------------------------------------------
// 1. lépés — az admin beír egy 100 000 Ft előleget
// ---------------------------------------------------------------
let lista: ElolegTetel[] = [];
const eloleg1 = elolegFelvitel("2026-10-05", 100000, "készpénz");
lista = [eloleg1];

eq("felvitel után az egyenleg azonnal nő", egyenleg(lista), 100000);
eq("és nyugtázásra vár", nyugtazatlan(lista), 1);

// ---------------------------------------------------------------
// 2. lépés — a dolgozó jóváhagyja
// ---------------------------------------------------------------
lista = lista.map((t) => (t.id === eloleg1.id ? nyugtaz(t) : t));
eq("a jóváhagyás NEM változtatja az egyenleget", egyenleg(lista), 100000);
eq("nincs több nyugtázatlan", nyugtazatlan(lista), 0);
eq("a nyugtázás nevet és időt rögzít", lista[0].acceptedBy, "Vadon Gergő");

// Kétszer nyugtázni nem lehet (a szerver "accepted_at is null"-ra szűr).
const ketszer = nyugtaz(lista[0], "2026-12-31 23:59");
eq("a nyugtázás nem írható felül", ketszer.acceptedAt, "2026-10-04 09:00");

// ---------------------------------------------------------------
// 3. lépés — fizetéskor az admin beír 30 000 Ft levonást
// ---------------------------------------------------------------
const levonas = berLevonas(2026, 10, 30000);
lista = [levonas, ...lista];

eq("a levonás csökkenti az egyenleget", egyenleg(lista), 70000);
eq("a levonás is nyugtázásra vár", nyugtazatlan(lista), 1);
eq("a levonás negatív sor", levonas.amount < 0, true);
eq("a levonás a hónap 1-jére kerül", levonas.date, "2026-10-01");
eq("a megjegyzése magyarázza magát", levonas.note, "bérből levonva (október 2026)");

// ---------------------------------------------------------------
// 4. lépés — a dolgozó a levonást is jóváhagyja
// ---------------------------------------------------------------
lista = lista.map((t) => (t.id === levonas.id ? nyugtaz(t) : t));
eq("a jóváhagyás után is 70 000 az egyenleg", egyenleg(lista), 70000);
eq("minden tétel nyugtázva", nyugtazatlan(lista), 0);

// ---------------------------------------------------------------
// Amit a dolgozó a Profil "Részletek" alatt lát
// ---------------------------------------------------------------
const bontas = elolegBontas(lista);
eq("egy év", bontas.length, 1);
eq("egy hónap (október)", bontas[0].honapok.length, 1);
eq("októberben felvett", bontas[0].honapok[0].felvett, 100000);
eq("októberben levonva", bontas[0].honapok[0].vissza, -30000);
eq("a hónap végi egyenleg a tényleges tartozás", bontas[0].honapok[0].zaroEgyenleg, 70000);
eq("a bontás és az összesítő ugyanazt mondja",
  bontas[0].honapok[0].zaroEgyenleg, egyenleg(lista));

// ---------------------------------------------------------------
// Következő hónap: újabb levonás, a tartozás tovább fogy
// ---------------------------------------------------------------
const levonas2 = nyugtaz(berLevonas(2026, 11, 30000));
lista = [levonas2, ...lista];
const b2 = elolegBontas(lista);
eq("két hónap, a frissebb elöl", b2[0].honapok.map((h) => h.kulcs), ["2026-11", "2026-10"]);
eq("november végén 40 000 a tartozás", b2[0].honapok[0].zaroEgyenleg, 40000);
eq("október végén még 70 000 volt", b2[0].honapok[1].zaroEgyenleg, 70000);
eq("novemberben nem vett fel semmit", b2[0].honapok[0].felvett, 0);

// ---------------------------------------------------------------
// A levont összeg utólagos módosítása: a szerver törli a nyugtázást,
// tehát a dolgozónak ÚJRA el kell fogadnia (syncEloleg on conflict ága).
// ---------------------------------------------------------------
function levonastModosit(t: ElolegTetel, ujLevont: number): ElolegTetel {
  const valtozott = t.amount !== -ujLevont;
  return {
    ...t,
    amount: -ujLevont,
    acceptedAt: valtozott ? null : t.acceptedAt,
    acceptedBy: valtozott ? null : t.acceptedBy,
  };
}
const modositott = levonastModosit(levonas2, 50000);
eq("a módosított levonás újra nyugtázásra vár", modositott.acceptedAt, null);
eq("és az új összeggel számol", modositott.amount, -50000);
const valtozatlan = levonastModosit(nyugtaz(berLevonas(2026, 12, 20000)), 20000);
eq("változatlan összegnél marad a nyugtázás", valtozatlan.acceptedAt !== null, true);

// ---------------------------------------------------------------
// Teljes visszafizetés: a tartozás nullára fut, nem megy mínuszba magától
// ---------------------------------------------------------------
const kiegyenlitve = [berLevonas(2027, 1, 40000), ...lista].map((t) => nyugtaz(t));
eq("kiegyenlített tartozás", egyenleg(kiegyenlitve), 0);
eq("a januári hónap zárója nulla", elolegBontas(kiegyenlitve)[0].honapok[0].zaroEgyenleg, 0);

console.log(`\nElőleg-folyamat teszt: ${ok} rendben, ${bad} hiba`);
if (bad > 0) process.exit(1);
