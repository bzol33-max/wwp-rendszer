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

import { readFileSync } from "node:fs";
import { cachelveHiv, hatterHivasban, sorbaAllit, sorKulcs, ujraprobal, kulcsKoordinata, UjrapobalhatoHiba } from "@/lib/fuvarozas/kulso-hivas";
import { korlatozottan, megosztva } from "@/lib/fuvarozas/parhuzamos";
import { pool } from "@/lib/db";

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

  // 6. Háttér-sor: az óránkénti kör HU-GO hívásai nem tartják fel az interaktívat.
  {
    eq("interaktív hívás a szolgáltató sorába", sorKulcs("hugo"), "hugo");
    eq("háttérben a külön háttér-sorba", await hatterHivasban(async () => sorKulcs("hugo")), "hugo:hatter");
    await varj(700); // a korábbi hugo-hívások szünete teljen le
    const sorrend: string[] = [];
    const hatterHivas = hatterHivasban(() => sorbaAllit("hugo", async () => { await varj(600); sorrend.push("háttér"); }));
    await varj(20);
    const t0 = Date.now();
    await sorbaAllit("hugo", async () => { sorrend.push("interaktív"); });
    const varakozas = Date.now() - t0;
    await hatterHivas;
    eq("az interaktív hívás nem várja meg a futó háttér-hívást", sorrend, ["interaktív", "háttér"]);
    all(`az interaktív hívás gyorsan lefutott (${varakozas} ms)`, varakozas < 500);
    // A háttér-hívás elengedi a már sorban álló interaktívat.
    const s2: string[] = [];
    await varj(700);
    const inter = sorbaAllit("hugo", async () => { await varj(200); s2.push("interaktív"); });
    const hat = hatterHivasban(() => sorbaAllit("hugo", async () => { s2.push("háttér"); }));
    await Promise.all([inter, hat]);
    eq("a háttér-hívás kivárja az interaktív sor kiürülését", s2, ["interaktív", "háttér"]);
  }

  // 5. Cache-kulcs koordináta.
  {
    eq("kerekítés 4 tizedesre", kulcsKoordinata(47.123456, 21.987654), [47.1235, 21.9877]);
    eq("pár méteres remegés ugyanaz a kulcs", kulcsKoordinata(47.123412, 21.987612), kulcsKoordinata(47.123418, 21.987618));
    all("100 méter már más kulcs", JSON.stringify(kulcsKoordinata(47.1234, 21.9876)) !== JSON.stringify(kulcsKoordinata(47.1244, 21.9876)));
  }

  // 7. Folyamatban lévő hívás megosztása (megosztva) — QA: kalibrációs roham, cachelveHiv.
  {
    const tar = new Map<string, Promise<unknown>>();
    let hivas = 0;
    const lassu = async () => { const sajat = ++hivas; await varj(30); return sajat; };
    const [a, b] = [megosztva(tar, "k", lassu), megosztva(tar, "k", lassu)];
    eq("azonos kulcs: ugyanaz az ígéret", a === b, true);
    eq("azonos kulcs: egyszer fut", await Promise.all([a, b]), [1, 1]);
    eq("lezárulás után törlődik", tar.size, 0);
    eq("lezárulás után új hívás indul", await megosztva(tar, "k", lassu), 2);
    const [c, d] = await Promise.all([megosztva(tar, "x", lassu), megosztva(tar, "y", lassu)]);
    eq("más kulcs: külön hívás", [c, d].sort(), [3, 4]);
    let hibas = 0;
    const rossz = () => { hibas++; return Promise.reject(new Error("elszállt")); };
    const h1 = megosztva(tar, "h", rossz), h2 = megosztva(tar, "h", rossz);
    await Promise.allSettled([h1, h2]);
    eq("hibánál is egy hívás, mindkét várakozó hibát kap", [hibas, await h1.then(() => "ok", () => "hiba"), await h2.then(() => "ok", () => "hiba")], [1, "hiba", "hiba"]);
    await varj(0);
    eq("hiba után törlődik (újrapróbálható)", tar.has("h"), false);
    const szinkronDobas = megosztva(tar, "s", () => { throw new Error("szinkron"); });
    eq("szinkron dobás is elutasítás", await szinkronDobas.then(() => "ok", () => "hiba"), "hiba");
  }

  // 8. Korlátozott párhuzamosság (korlatozottan): legfeljebb N egyszerre, sorrendtartó eredmény.
  {
    let bent = 0, csucs = 0;
    const feladatok = Array.from({ length: 20 }, (_, i) => async () => {
      bent++; csucs = Math.max(csucs, bent);
      await varj(5 + (i % 3) * 5);
      bent--;
      return i;
    });
    const t0 = Date.now();
    const ki = await korlatozottan(feladatok, 6);
    eq("sorrendtartó eredmény", ki, Array.from({ length: 20 }, (_, i) => i));
    eq("legfeljebb 6 egyszerre", csucs, 6);
    all(`párhuzamosan fut (${Date.now() - t0} ms < soros ~190 ms)`, Date.now() - t0 < 150);
    eq("üres lista", await korlatozottan([], 6), []);
  }

  // 9. cachelveHiv: azonos (szolgáltató, kulcs) párhuzamos hívásai egy ígéreten osztoznak.
  {
    const egyedi = `teszt-${Date.now()}-${Math.random()}`;
    let n = 0;
    const fn = async () => { n++; await varj(20); return { n }; };
    const [x, y] = await Promise.all([
      cachelveHiv("teszt-dedup", { egyedi }, 1, fn),
      cachelveHiv("teszt-dedup", { egyedi }, 1, fn),
    ]);
    eq("cachelveHiv: egyidejű azonos hívás egyszer megy ki", n, 1);
    eq("cachelveHiv: mindkettő ugyanazt kapja", [x, y], [{ n: 1 }, { n: 1 }]);
    await Promise.all([
      cachelveHiv("teszt-dedup", { egyedi: egyedi + "-a" }, 1, fn),
      cachelveHiv("teszt-dedup", { egyedi: egyedi + "-b" }, 1, fn),
    ]);
    eq("cachelveHiv: más kulcs külön hívás", n, 3);
  }

  // 10. A kalibráció (menetido-tanulas.ts, server-only — forrásból ellenőrizve) a fenti segédeket használja.
  {
    const src = readFileSync("lib/fuvarozas/menetido-tanulas.ts", "utf8");
    all("kalibráció: folyamatban lévő ígéret megosztva", /megosztva\(kalibracioFolyamatban,/.test(src));
    all("kalibráció: modul-szintű tár", /^const kalibracioFolyamatban = new Map/m.test(src));
    all("kalibráció: korlátozott (6) párhuzamos HU-GO összevetés", /KALIBRACIO_PARHUZAMOS = 6;/.test(src) && /korlatozottan\(/.test(src));
    all("kalibráció: nincs soros calculateToll-ciklus", !/for \(const t of jelentosTripek\)/.test(src));
  }
}

main().then(async () => {
  await pool.end().catch(() => {});
  console.log(`\nKülső hívás teszt: ${ok} rendben, ${bad} hiba`);
  if (bad > 0) process.exit(1);
});
