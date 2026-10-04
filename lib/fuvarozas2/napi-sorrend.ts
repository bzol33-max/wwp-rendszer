// Egy kocsi fuvarjainak sorrendje — a Ma oldal és a Tervezés közös szabálya
// (scripts/teszt-napi-sorrend.ts).
//
// Nem a rögzítés sorrendje számít: Gergő 10.05-i napján a Lösung-fuvar
// (#293, Sárvár → Debrecen, lerakás 10.06.) korábban került be, mint a két
// saját fuvar (Szakoly → Tata, Tata → Tompaládony), ezért a lista elejére
// került, holott a nap végén, a hazafelé úton jön.
//
// 1. Előbb az, amelyik hamarabb ér véget (lerakás napja) — a több napra
//    nyúló fuvar az aznapiak után jön, és ennek a lerakója lesz a kocsi
//    következő napi helye.
// 2. Azonos lerakás-napon a felrakás napja.
// 3. Láncolás: ha egy fuvar ott rak fel, ahol egy másik lerak (Tata → Tata),
//    a lerakós megy előre.
// 4. Ami ezután is egyforma: a rögzítés sorrendje (id).

import { varosNev } from "@/lib/fuvarozas/varos";

export type SorrendAdat = {
  id: string;
  felrakasNap: string | null;
  lerakasNap: string | null;
  felrako: string | null;
  lerako: string | null;
};

function varosKulcs(cim: string | null): string {
  return (varosNev(cim) || "").trim().toLowerCase();
}

export function napiSorrend<T>(lista: T[], adat: (t: T) => SorrendAdat): T[] {
  const elemek = lista.map((t) => ({ t, a: adat(t) }));
  const veg = (a: SorrendAdat) => a.lerakasNap ?? a.felrakasNap ?? "";
  elemek.sort(
    (x, y) =>
      veg(x.a).localeCompare(veg(y.a)) ||
      (x.a.felrakasNap ?? "").localeCompare(y.a.felrakasNap ?? "") ||
      Number(x.a.id) - Number(y.a.id)
  );

  // Láncolás azonos lerakás-napon belül: ha egy későbbi elem lerakója ennek
  // a felrakója, az előre kerül. Körbeérő láncnál (A → B → A) a lépésszám-
  // korlát megállítja, és marad az id-sorrend.
  for (let lepes = 0; lepes < elemek.length * elemek.length; lepes++) {
    let mozdult = false;
    for (let i = 0; i < elemek.length && !mozdult; i++) {
      const fel = varosKulcs(elemek[i].a.felrako);
      if (!fel) continue;
      for (let j = i + 1; j < elemek.length; j++) {
        if (veg(elemek[j].a) !== veg(elemek[i].a)) break;
        if (varosKulcs(elemek[j].a.lerako) === fel && varosKulcs(elemek[i].a.lerako) !== varosKulcs(elemek[j].a.felrako)) {
          const [e] = elemek.splice(j, 1);
          elemek.splice(i, 0, e);
          mozdult = true;
          break;
        }
      }
    }
    if (!mozdult) break;
  }
  return elemek.map((e) => e.t);
}
