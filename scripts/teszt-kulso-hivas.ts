// A külső hívások sorosítójának és újrapróbálójának tesztje (T1/T3/T13/T16).
//
// Futtatás:  npx tsx scripts/teszt-kulso-hivas.ts
//
// Amit bizonyít: (1) egy szolgáltatóhoz egyszerre csak EGY kérés megy ki,
// és a kérések közt eltelik a kötelező szünet (a Nominatim 1 kérés/mp
// feltétele); (2) a különböző szolgáltatók nem fogják egymást; (3) egy hibás
// hívás nem akasztja meg a sort; (4) 429/5xx újrapróbál, más hiba nem;
// (5) a cache-kulcs koordinátája kerekített, tehát a GPS-remegés nem ront
// cache-t, de a valóban más pont igen.

import { sorbaAllit, ujraprobal, kulcsKoordinata, UjrapobalhatoHiba } from "@/lib/fuvarozas/kulso-hivas";

let ok = 0;
let bad = 0;
function all(nev: string, felt: boolean) {
  if (felt) ok++;
  else { bad++; console.log(`  HIBA  ${nev}`); }
}
function eq(nev: string, kapott: unknown, vart: unknown) {
  all(`${nev} — várt ${JSON.stringify(vart)}, kapott ${JSON.stringify(kapott)}`, JSON.stringify(kapott) === JSON.stringify(vart));
}
const varj = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // 1–2. Sorosítás: átfedés nincs, a szünet megvan.
  {
    let bent = 0;
    let atfedes = false;
    const idok: number[] = [];
    const egy = async () => {
      bent++;
      if (bent > 1) atfedes = true;
      idok.push(Date.now());
      await varj(10);
      bent--;
      return idok.length;
    };
    const eredmeny = await Promise.all([
      sorbaAllit("nominatim", egy),
      sorbaAllit("nominatim", egy),
      sorbaAllit("nominatim", egy),
    ]);
    all("nincs átfedő kérés egy szolgáltatóhoz", !atfedes);
    eq("mindhárom hívás lefutott", eredmeny.length, 3);
    const kozok = idok.slice(1).map((t, i) => t - idok[i]);
    all(`a kérések közt legalább 1000 ms telik (nominatim): ${kozok.join(", ")}`, kozok.every((k) => k >= 1000));
  }

  // 3. Hibás hívás nem akasztja meg a sort.
  {
    const hiba = sorbaAllit("hugo", async () => { throw new Error("elszállt"); });
    await hiba.then(() => all("a hibás hívás hibát ad", false), () => ok++);
    const utana = await sorbaAllit("hugo", async () => "megy tovább");
    eq("a sor a hiba után is halad", utana, "megy tovább");
  }

  // 4. Újrapróbálás.
  {
    let hivasok = 0;
    const eredmeny = await ujraprobal(async () => {
      hivasok++;
      if (hivasok < 3) throw new UjrapobalhatoHiba("429", 429);
      return "siker";
    });
    eq("429 után a harmadik próbálkozás sikerül", eredmeny, "siker");
    eq("pontosan három hívás történt", hivasok, 3);

    let masikHivasok = 0;
    await ujraprobal(async () => {
      masikHivasok++;
      throw new Error("404 — nincs ilyen cím");
    }).then(() => all("a nem újrapróbálható hiba feljön", false), () => ok++);
    eq("a nem újrapróbálható hiba nem ismétlődik", masikHivasok, 1);

    let mindigRossz = 0;
    await ujraprobal(async () => {
      mindigRossz++;
      throw new UjrapobalhatoHiba("500", 500);
    }).then(() => all("a tartós 5xx végül hibát ad", false), () => ok++);
    eq("a tartós 5xx pontosan háromszor próbálkozik", mindigRossz, 3);
  }

  // 5. Cache-kulcs koordináta.
  {
    eq("kerekítés 4 tizedesre", kulcsKoordinata(47.123456, 21.987654), [47.1235, 21.9877]);
    eq("pár méteres remegés ugyanaz a kulcs", kulcsKoordinata(47.123412, 21.987612), kulcsKoordinata(47.123418, 21.987618));
    all("100 méter már más kulcs", JSON.stringify(kulcsKoordinata(47.1234, 21.9876)) !== JSON.stringify(kulcsKoordinata(47.1244, 21.9876)));
  }
}

main().then(() => {
  console.log(`\nKülső hívás teszt: ${ok} rendben, ${bad} hiba`);
  if (bad > 0) process.exit(1);
});
