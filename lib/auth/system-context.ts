import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

// Rendszer-kontextus a háttérfolyamatoknak (Drive-import cron, GPS-alapú
// teljesítés-figyelő, számla-szinkron). Ezek ugyanazokat a lib-függvényeket
// hívják, mint a felület, de nincs mögöttük bejelentkezett felhasználó, így a
// requireEditPermission -> requireSession -> redirect("/login") NEXT_REDIRECT-tel
// megölte őket (a Drive-import 2026-09-14 10:00 és 09-15 07:00 között emiatt
// egyetlen fuvart sem importált).
//
// A megoldás szándékosan OPT-IN: a kivételt a hívó nyitja ki, nem az
// ellenőrzés következteti ki. A "nincs munkamenet, tehát biztosan rendszer"
// szabály ennek a fordítottja lenne — annál minden hitelesítetlen kérés
// jogosultságot kapna, ami pont a most záruló nyitott API-végpontok hibája.
//
// Új belépési pontot csak akkor csomagolj be, ha az tényleg ütemezőből vagy
// hitelesített gépi hívásból indul; felhasználói műveletet (szerver-akció,
// gombnyomás) soha.

const rendszerKontextus = new AsyncLocalStorage<{ ok: string }>();

/** A `fn` a benne indított async hívásokkal együtt rendszerjogon fut. Az `ok` csak naplózásra/nyomkövetésre szolgál. */
export function futtatRendszerkent<T>(ok: string, fn: () => Promise<T>): Promise<T> {
  return rendszerKontextus.run({ ok }, fn);
}

/** Igaz, ha a hívás egy futtatRendszerkent() hívásláncából ered. */
export function rendszerFutasban(): boolean {
  return rendszerKontextus.getStore() !== undefined;
}
