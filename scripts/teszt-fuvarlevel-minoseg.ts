import assert from "node:assert/strict";
import sharp from "sharp";
import { szkennelj } from "../lib/fuvarozas/doksi-kivagas-mag";
import { kovetkezoMinoseg, normalizalForgatast, pdfOldalMeret } from "../lib/fuvarozas/fuvarlevel-minoseg";

assert.equal(kovetkezoMinoseg(0.9, 9_000_000), 0.85);
assert.equal(kovetkezoMinoseg(0.85, 9_000_000), 0.8);
assert.equal(kovetkezoMinoseg(0.8, 9_000_000), null);
assert.equal(kovetkezoMinoseg(0.9, 3_000_000), 0.9);
assert.equal(normalizalForgatast(-90), 270);
assert.equal(normalizalForgatast(450), 90);
assert.equal(normalizalForgatast(360), 0);
assert.equal(pdfOldalMeret(1200, 800), "fekvo");
assert.equal(pdfOldalMeret(800, 1200), "allo");

// Regresszió (2026-10-06): a median() a szürke képből 3 csatornásat adott, és
// a tisztítás a kép első harmadát nyújtotta szét az egész lapra. Egy csak a
// bal szélén „írt” lapon a jobb oldalnak üresnek (fehérnek) kell maradnia.
(async () => {
  const w = 1200, h = 1600;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#f2efe6"/>`;
  for (let y = 100; y < h - 100; y += 40) svg += `<rect x="60" y="${y}" width="260" height="6" fill="#222"/>`;
  svg += "</svg>";
  const be = await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
  const { tartalom } = await szkennelj(be);
  const { data, info } = await sharp(tartalom).greyscale().raw().toBuffer({ resolveWithObject: true });
  let jobbSotet = 0, balSotet = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const v = data[y * info.width + x];
    if (v < 100) { if (x > info.width * 0.45) jobbSotet++; else balSotet++; }
  }
  assert.ok(balSotet > 1000, `a bal oldali sorok eltűntek (${balSotet} sötét pixel)`);
  assert.ok(jobbSotet < balSotet * 0.02, `a jobb oldalra „átkenődött" a tartalom (${jobbSotet} vs ${balSotet})`);

  // Regresszió (2026-10-07, Micó #300): álló fotó EXIF-forgatással (a
  // tárolt kép fekvő, orientation 6). A méretet a forgatás előtti képből
  // vettük, a nyers puffert rossz sorhosszal olvastuk: vízszintes csíkok és
  // dupla kép. Most: álló kimenet, és egy egyszínű papír-sávon nincs csík.
  const fw = 1200, fh = 800;
  const fekvoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${fw}" height="${fh}"><rect width="100%" height="100%" fill="#333"/><rect x="80" y="80" width="1040" height="640" fill="#eeeae0"/></svg>`;
  const allo = await sharp(Buffer.from(fekvoSvg)).jpeg({ quality: 90 }).withMetadata({ orientation: 6 }).toBuffer();
  const e2 = await szkennelj(allo);
  const k2 = await sharp(e2.tartalom).greyscale().raw().toBuffer({ resolveWithObject: true });
  assert.ok(k2.info.height > k2.info.width, `az álló fotóból fekvő oldal lett (${k2.info.width}×${k2.info.height})`);
  let sotet = 0;
  for (let i = 0; i < k2.data.length; i++) if (k2.data[i] < 128) sotet++;
  assert.ok(sotet < k2.data.length * 0.01, `csíkos az üres lap (${sotet} sötét pixel a ${k2.data.length}-ből)`);
  // Regresszió (2026-10-23, Budaházi Zoltán: „nem vágja ki a lapot”): sűrűn
  // írt, ferdén fotózott lap sötét és világos háttéren. A szöveg-sorok a
  // világos maszkot csíkokra bontották, és a lap felismeretlen maradt.
  const sorok = Array.from({ length: 40 }, (_, i) => `<text x="80" y="${220 + i * 46}" font-size="30" font-family="DejaVu Sans" fill="#222">Szállítólevél ${i} Fabrika 2000 Kft. Tompaládony EUR raklap</text>`).join("");
  const racs = Array.from({ length: 12 }, (_, i) => `<rect x="60" y="${100 + i * 135}" width="1120" height="135" fill="none" stroke="#333" stroke-width="4"/>`).join("");
  const suruLap = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="1754"><rect width="1240" height="1754" fill="#f7f5ef"/>${racs}${sorok}</svg>`))
    .resize(2000).rotate(9, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  for (const [nev, szin] of [["sötét", 70], ["világos", 185]] as const) {
    const foto = await sharp({ create: { width: 3024, height: 4032, channels: 3, background: { r: szin, g: szin, b: szin - 5 } } })
      .composite([{ input: suruLap, left: 300, top: 400 }]).jpeg({ quality: 90 }).toBuffer();
    const e3 = await szkennelj(foto);
    assert.ok(e3.kivagva, `sűrűn írt lap ${nev} háttéren: nem vágta ki (${e3.ok})`);
    const m3 = await sharp(e3.tartalom).metadata();
    assert.ok(Math.abs(m3.width! / m3.height! - 1240 / 1754) < 0.02, `${nev} háttéren rossz a lap aránya (${m3.width}×${m3.height})`);
    assert.ok(m3.width! >= 1900, `${nev} háttéren túl sokat vágott le a lapból (${m3.width} px a 2000-ből)`);
  }
  console.log("Fuvarlevél-minőség tesztek rendben (a szkennelés csatorna-elcsúszás nélkül, álló fotón is, sűrűn írt ferde lapon is).");
})().catch((e) => { console.error(e); process.exit(1); });
