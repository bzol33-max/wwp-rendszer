// Saját telephelyek/parkolók — a GPS-oldal ezekhez viszonyítva ismeri fel,
// ha egy jármű éppen egy SAJÁT helyünkön áll (nem egy rejtélyes,
// ismeretlen megállás), és a jármű-csempén ennek megfelelő, olvasható
// névvel jelenik meg a hely (pl. "Szakoly (telephely)" a nyers,
// visszafordított cím helyett).
//
// NEM "use server" fájl — tiszta konstans lista, bárhonnan importálható.
// A koordinátákat a lib/fuvarozas/actions.ts geokódolja (HU-GO
// címkereséssel, ugyanazzal, amit a megbízások fel-/lerakó címeinél is
// használunk) és gyorsítótárazza — itt csak a nevek/címek forrása.
//
// 2026-10-10-től a forrás a telephely_pont tábla (031-es migráció), amit a
// szerver a lib/fuvarozas/telephelyek-db.ts getSajatTelephelyek() /
// getIndulasiTelephely() függvényekkel olvas. Ez a lista a TARTALÉK (ha a
// tábla még nincs meg vagy a DB hibázik), és a kliensoldali kód forrása.

export type SajatTelephely = {
  nev: string;
  cim: string;
  /** 'telephely' | 'parkolo' | 'raktar' — a DB-ből; a tartalék listán is kitöltve. */
  tipus?: "telephely" | "parkolo" | "raktar";
  /** Ebből indul a kalkulátor / a tervezés üres km-je (egyszerre egy pont). */
  indulasiPont?: boolean;
  /** Ismert koordináta (DB) — ha nincs, a hívó geokódolja a címet. */
  lat?: number | null;
  lon?: number | null;
};

export const SAJAT_TELEPHELYEK: SajatTelephely[] = [
  { nev: "Szakoly (telephely)", cim: "Szakoly, Rákóczi utca 26", tipus: "telephely", indulasiPont: true },
  { nev: "Balkány (telephely)", cim: "Balkány, Bocskai utca 11", tipus: "telephely" },
  { nev: "Nyíregyháza (telephely)", cim: "Nyíregyháza, Tünde út 20/A", tipus: "telephely" },
  // Külön parkolóhely Szakolyban (nem a telephely) — ide szokott állni Gergő kamionja.
  { nev: "Szakoly (parkoló)", cim: "Szakoly, Létai utca", tipus: "parkolo" },
];

/** Az indulási pont egy listából: a megjelölt, különben az első. */
export function indulasiTelephely(lista: SajatTelephely[]): SajatTelephely {
  return lista.find((t) => t.indulasiPont) ?? lista[0] ?? SAJAT_TELEPHELYEK[0];
}
