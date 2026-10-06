import { megalloSorszam } from "@/lib/megbizasok/megallo-tiszta";

function ellenoriz(igaz: boolean, uzenet: string) {
  if (!igaz) throw new Error(uzenet);
}

ellenoriz(megalloSorszam(0) === 1, "az első 0-indexű megálló sorszáma 1");
ellenoriz(megalloSorszam(4) === 5, "az index és az új tábla sorszáma között +1 az eltérés");
console.log("Megálló-írás tiszta függvények: rendben");
