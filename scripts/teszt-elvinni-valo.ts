import {
  beerkElokeszitesOszlopba,
  elvinniCellaKm,
  elvinniOszlop,
  hetKezdeteElvinni,
  tavolsagElvinniKm,
  utemezhetoNap,
} from "../lib/megbizasok/elvinni-szabalyok";

function ellenoriz(nev: string, sikeres: boolean) {
  if (!sikeres) throw new Error(`Elvinni való teszt sikertelen: ${nev}`);
}

const nyitottSajat = {
  jelleg: "sajat",
  elokeszites: true,
  idopont_nyitott: true,
  szakasz: "elokeszites",
};

ellenoriz("nyitott, előkészített saját fuvar az Elvinni való", elvinniOszlop(nyitottSajat));
ellenoriz("előkészítés nélküli sor nem Elvinni való", !elvinniOszlop({ ...nyitottSajat, elokeszites: false }));
ellenoriz("bérfuvar nem Elvinni való", !elvinniOszlop({ ...nyitottSajat, jelleg: "ber" }));
ellenoriz("nyitott fuvar nem duplikálódik a beérkezett oszlopban", !beerkElokeszitesOszlopba(nyitottSajat));
ellenoriz(
  "ütemezett előkészítés a beérkezett oszlopban marad",
  beerkElokeszitesOszlopba({ ...nyitottSajat, idopont_nyitott: false })
);
ellenoriz("legkorábbi nap engedélyezett", utemezhetoNap("2026-10-08", "2026-10-08"));
ellenoriz("legkorábbi nap előtti nap tiltott", !utemezhetoNap("2026-10-07", "2026-10-08"));
ellenoriz(
  "a legkorábbi dátum hetének hétfőjét adja",
  hetKezdeteElvinni("2026-10-08", "2026-10-07") === "2026-10-05"
);
ellenoriz("pont nélkül nincs km", tavolsagElvinniKm(null, { lat: 47, lon: 19 }) === null);

const lerakoPont = { lat: 47.5, lon: 19 };
const allohelyPont = { lat: 47.6, lon: 19.1 };
const felrakoPont = { lat: 47.7, lon: 19.2 };
const foglaltNapiKm = elvinniCellaKm({
  foglalt: true,
  utolsoLerakoPont: lerakoPont,
  allohelyPont,
  felrakoPont,
});
const uresNapiKm = elvinniCellaKm({
  foglalt: false,
  utolsoLerakoPont: lerakoPont,
  allohelyPont,
  felrakoPont,
});
ellenoriz("foglalt napon az utolsó lerakótól számol km-t", foglaltNapiKm === tavolsagElvinniKm(lerakoPont, felrakoPont));
ellenoriz("üres napon az állóhelytől számol km-t", uresNapiKm === tavolsagElvinniKm(allohelyPont, felrakoPont));

console.log("Elvinni való szabályteszt: rendben");
