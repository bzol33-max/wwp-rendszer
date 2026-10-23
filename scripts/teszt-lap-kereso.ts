// A sofőr app lap-keresője (components/erkezes/sofor-app/lap-kereso.ts) az
// igazi OpenCV.js-sel (public/vendor), szintetikus „fotókon”. DB nem kell.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import sharp from "sharp";
import { AJANLOTT_MIN_TERULET, TELJES_KEP, egyenesitsd, feherites, keressLapot, kimenetMeret, lapnakLatszik, rendezd, sarkokTerulete, type Sarkok } from "../components/erkezes/sofor-app/lap-kereso";

// Node-ban nincs ImageData — az egyenesitsd ezt adja vissza.
(globalThis as unknown as { ImageData: unknown }).ImageData = class {
  constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
};

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cvBetolt(): Promise<{ cv: any }> {
  const cv = require("../public/vendor/opencv-4.10.0.js");
  return new Promise((ok) => (cv.Mat ? ok({ cv }) : (cv.onRuntimeInitialized = () => ok({ cv }))));
}

async function foto(deg: number, hatter: number, belsoTabla = false): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const sorok = Array.from({ length: 30 }, (_, i) => `<text x="80" y="${260 + i * 46}" font-size="30" font-family="DejaVu Sans" fill="#222">Szállítólevél ${i} Fabrika 2000 Kft.</text>`).join("");
  const tabla = belsoTabla ? `<rect x="120" y="300" width="1000" height="900" fill="none" stroke="#111" stroke-width="10"/>` : "";
  const lap = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="1754"><rect width="1240" height="1754" fill="#f4f1ea"/>${tabla}${sorok}</svg>`))
    .resize(560).rotate(deg, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const { data, info } = await sharp({ create: { width: 720, height: 1100, channels: 3, background: { r: hatter, g: hatter, b: hatter - 5 } } })
    .composite([{ input: lap, left: deg ? 25 : 70, top: deg ? 70 : 120 }]).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}

(async () => {
  // tiszta függvények
  const s = rendezd([{ x: 0.9, y: 0.1 }, { x: 0.1, y: 0.9 }, { x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }]);
  assert.deepEqual(s, [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }]);
  assert.ok(lapnakLatszik(s));
  assert.ok(!lapnakLatszik(TELJES_KEP), "a teljes kép nem „talált lap”");
  assert.ok(!lapnakLatszik([{ x: 0.4, y: 0.4 }, { x: 0.6, y: 0.4 }, { x: 0.6, y: 0.6 }, { x: 0.4, y: 0.6 }]), "túl kicsi");
  assert.deepEqual(kimenetMeret(s, 1000, 2000), { w: 800, h: 1600 });

  const { cv } = await cvBetolt();
  const vart: Sarkok = [{ x: 70 / 720, y: 120 / 1100 }, { x: 630 / 720, y: 120 / 1100 }, { x: 630 / 720, y: 912 / 1100 }, { x: 70 / 720, y: 912 / 1100 }];
  for (const h of [60, 120]) {
    const k = keressLapot(cv, await foto(0, h));
    assert.ok(k, `egyenes lap ${h}-as háttéren: nem találta`);
    k!.forEach((p, i) => assert.ok(Math.abs(p.x - vart[i].x) < 0.03 && Math.abs(p.y - vart[i].y) < 0.03, `sarok ${i} eltér: ${JSON.stringify(p)}`));
    assert.ok(sarkokTerulete(k!) >= AJANLOTT_MIN_TERULET);
  }
  const ferde = keressLapot(cv, await foto(8, 60));
  assert.ok(ferde && lapnakLatszik(ferde), "8°-ban ferde lap: nem találta");
  // Lapon belüli vastag keret: a lapot kell választania, nem a keretet.
  const tablas = keressLapot(cv, await foto(0, 60, true));
  assert.ok(tablas && sarkokTerulete(tablas) > 0.5, `a belső keretet választotta (${tablas && sarkokTerulete(tablas).toFixed(2)})`);
  // Nincs lap (a kép maga a papír): nincs javaslat → a teljes kép marad.
  const ures = await sharp({ create: { width: 600, height: 900, channels: 3, background: { r: 240, g: 238, b: 230 } } }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(keressLapot(cv, { data: new Uint8ClampedArray(ures.data), width: 600, height: 900 }), null);

  // kiegyenesítés: a kimenet a lap arányát adja
  const f = await foto(8, 60);
  const lap = egyenesitsd(cv, f, ferde!);
  assert.ok(Math.abs(lap.width / lap.height - 1240 / 1754) < 0.05, `rossz arány: ${lap.width}×${lap.height}`);
  // fehérítés: árnyékos (balról sötétedő) lap, fekete szöveg, kék pecsét
  const W2 = 800, H2 = 1100;
  const svg2 = `<svg xmlns="http://www.w3.org/2000/svg" width="${W2}" height="${H2}">
    <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#6e6a60"/><stop offset="1" stop-color="#e8e4da"/></linearGradient></defs>
    <rect width="${W2}" height="${H2}" fill="url(#g)"/>
    ${Array.from({ length: 20 }, (_, i) => `<rect x="60" y="${80 + i * 40}" width="600" height="6" fill="#222"/>`).join("")}
    <circle cx="560" cy="900" r="90" fill="none" stroke="#1f3fbf" stroke-width="10"/></svg>`;
  const r2 = await sharp(Buffer.from(svg2)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const be2 = { data: new Uint8ClampedArray(r2.data), width: W2, height: H2 };
  const ki2 = feherites(cv, be2 as unknown as ImageData) as unknown as { data: Uint8ClampedArray; width: number };
  const px = (d: Uint8ClampedArray, w: number, x: number, y: number) => [d[(y * w + x) * 4], d[(y * w + x) * 4 + 1], d[(y * w + x) * 4 + 2]];
  const arnyekPapir = px(ki2.data, W2, 30, 1050); // a legsötétebb sarokban, üres papír
  assert.ok(arnyekPapir.every((v) => v >= 225), `az árnyékos papír nem lett fehér: ${arnyekPapir}`);
  const szoveg = px(ki2.data, W2, 200, 83);
  assert.ok(szoveg.every((v) => v <= 90), `a szöveg nem maradt sötét: ${szoveg}`);
  const pecset = px(ki2.data, W2, 650, 900);
  assert.ok(pecset[2] > pecset[0] + 40, `a kék pecsét elvesztette a színét: ${pecset}`);
  console.log("Lap-kereső teszt rendben (egyenes, ferde, belső keretes lap, üres kép, kiegyenesítés, színes fehérítés).");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
