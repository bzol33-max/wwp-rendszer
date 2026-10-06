import type { ModuleKey } from "../lib/auth/permissions";
import { megbizasJogok } from "../lib/megbizasok/jogok";

const kombinaciok = [false, true].flatMap((fuvarView) => [false, true].flatMap((fuvarEdit) => [false, true].flatMap((elszamView) => [false, true].map((elszamEdit) => ({ fuvarView, fuvarEdit, elszamView, elszamEdit })))));
for (const k of kombinaciok) {
  const jog = megbizasJogok({ can: (modul: ModuleKey) => {
    const view = modul === "fuvarozas" ? k.fuvarView : modul === "elszamolas" ? k.elszamView : false;
    const edit = modul === "fuvarozas" ? k.fuvarEdit : modul === "elszamolas" ? k.elszamEdit : false;
    return { view, edit };
  } });
  const vart = { latja: k.fuvarView || k.elszamView, szerkeszti: k.fuvarEdit, elszamol: k.fuvarEdit || k.elszamEdit, torolhet: k.fuvarEdit };
  if (JSON.stringify(jog) !== JSON.stringify(vart)) throw new Error(`Hibás jogosultsági kombináció: ${JSON.stringify(k)}`);
}
console.log(`Megbízás-jogok teszt: ${kombinaciok.length} kombináció rendben`);
