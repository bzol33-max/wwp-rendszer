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

export type SajatTelephely = {
  nev: string;
  cim: string;
};

export const SAJAT_TELEPHELYEK: SajatTelephely[] = [
  { nev: "Szakoly (telephely)", cim: "Szakoly, Rákóczi utca 26" },
  { nev: "Balkány (telephely)", cim: "Balkány, Bocskai utca 11" },
  // Külön parkolóhely Szakolyban (nem a telephely) — ide szokott állni Gergő kamionja.
  { nev: "Szakoly (parkoló)", cim: "Szakoly, Létai utca" },
];
