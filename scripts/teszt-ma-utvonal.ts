// A Ma oldal útvonal-rajzolásának tiszta része (lib/fuvarozas2/ma-utvonal-alap.ts).
import { illesztSzakaszokat, kerekitettPont, legvonalKm, szakaszokbol } from "@/lib/fuvarozas2/ma-utvonal-alap";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  const j = JSON.stringify(kapott) === JSON.stringify(vart);
  if (j) ok++; else { bad++; console.error(`HIBA ${nev}: kapott ${JSON.stringify(kapott)}, várt ${JSON.stringify(vart)}`); }
}

const hszob: [number, number] = [47.45, 21.39], dunakeszi: [number, number] = [47.63, 19.14], kozel: [number, number] = [47.451, 21.391];
eq("légvonal Hajdúszoboszló–Dunakeszi ~170 km", Math.round(legvonalKm(hszob, dunakeszi) / 10) * 10, 170);
const sz = szakaszokbol([hszob, kozel, dunakeszi]);
eq("rövid szakasz nem illesztendő", sz.map((s) => s.hosszu), [false, true]);
const g: [number, number][] = [[47.5, 20.5], [47.6, 19.8]];
eq("illesztés: a geometria a végpontok közé kerül", illesztSzakaszokat([hszob, kozel, dunakeszi], [null, g]), [hszob, kozel, ...g, dunakeszi]);
eq("illesztés geometria nélkül: egyenes", illesztSzakaszokat([hszob, dunakeszi], [null]), [hszob, dunakeszi]);
eq("egy pont: változatlan", illesztSzakaszokat([hszob], []), [hszob]);
eq("kerekítés ~2 km rácsra", kerekitettPont(47.4512, 21.3949), [47.46, 21.4]);
eq("kis mozgás ugyanaz a kulcs", JSON.stringify(kerekitettPont(47.4512, 21.3949)) === JSON.stringify(kerekitettPont(47.4555, 21.3971)), true);

console.log(`teszt-ma-utvonal: ${ok} ok, ${bad} hiba`);
if (bad > 0) process.exit(1);
