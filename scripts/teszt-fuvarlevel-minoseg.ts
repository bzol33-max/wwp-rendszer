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
  console.log("Fuvarlevél-minőség tesztek rendben (a szkennelés csatorna-elcsúszás nélkül).");
})().catch((e) => { console.error(e); process.exit(1); });
