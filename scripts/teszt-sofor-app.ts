// A sofőr app tiszta számításai (lib/fuvarozas/sofor-app-alap.ts) — DB nélkül.
import sharp from "sharp";
import {
  AUTO_FOTO_KOCKA,
  ELESSEG_KUSZOB,
  RESZLET_PX,
  elesseg,
  reszletKivagasok,
  STABIL_ELTERES,
  fogyasztasKep,
  kepMinoseg,
  kepkockaElteres,
  napCimke,
  papirNeve,
  tizedes,
} from "@/lib/fuvarozas/sofor-app-alap";

let hiba = 0;
const eq = (nev: string, kapott: unknown, vart: unknown) => {
  const ok = JSON.stringify(kapott) === JSON.stringify(vart);
  if (!ok) { hiba++; console.log(`✗ ${nev}\n  kapott: ${JSON.stringify(kapott)}\n  várt:   ${JSON.stringify(vart)}`); } else console.log(`✓ ${nev}`);
};
const igaz = (nev: string, f: boolean) => eq(nev, f, true);

// --- papír
eq("saját fuvar papírja", papirNeve(true), "aláírt szállítólevél");
eq("bérfuvar papírja", papirNeve(false), "aláírt fuvarlevél (CMR)");

// --- dátum-címke (2026-10-21 szerda)
const ma = "2026-10-21";
eq("ma", napCimke(ma, ma), "ma");
eq("holnap", napCimke("2026-10-22", ma), "holnap");
eq("tegnap", napCimke("2026-10-20", ma), "tegnap");
eq("péntek", napCimke("2026-10-23", ma), "péntek");
eq("jövő hét szerda dátummal", napCimke("2026-10-28", ma), "okt. 28.");
eq("üres", napCimke(null, ma), null);

// --- fogyasztás
const napok = [
  // előző hét: 3 nap × 500 km × 29 l/100
  { nap: "2026-10-09", liter: 145, km: 500 },
  { nap: "2026-10-12", liter: 145, km: 500 },
  { nap: "2026-10-14", liter: 145, km: 500 },
  // ez a hét: 27,5 l/100 átlag
  { nap: "2026-10-16", liter: 140, km: 500 },
  { nap: "2026-10-19", liter: 135, km: 500 },
  { nap: "2026-10-20", liter: 137.5, km: 500 },
  // ma csak 10 km — napi átlagnak kevés
  { nap: "2026-10-21", liter: 6, km: 10 },
  // hibás sor: kimarad
  { nap: "2026-10-18", liter: null, km: 300 },
];
const k = fogyasztasKep(napok, ma);
eq("7 nap l/100 (412,5+6 l / 1510 km)", k.het.l100, 27.7);
eq("7 nap km", k.het.km, 1510);
eq("előző hét 29,0", k.elozoHet.l100, 29);
eq("változás −1,3 l", k.valtozas, -1.3);
eq("ma: kevés km → nincs átlag", k.ma.l100, null);
eq("napi oszlopok: 7 nap, régitől a maiig", k.napok.map((n) => n.nap), ["2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21"]);
eq("napi oszlop értékek", k.napok.map((n) => n.l100), [null, 28, null, null, 27, 27.5, null]);
eq("14 nap km", k.ketHet.km, 3010);
const ures = fogyasztasKep([], ma);
eq("adat nélkül: semmi", [ures.het.l100, ures.valtozas, ures.ketHet.km], [null, null, 0]);
eq("tizedesvessző", tizedes(27.4), "27,4");

// --- kép-minőség szintetikus képeken (320×240)
const W = 320, H = 240;
function kep(f: (x: number, y: number) => number): Uint8Array {
  const g = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = Math.max(0, Math.min(255, f(x, y)));
  return g;
}
// Sötét asztalon fehér lap, rajta fekete „szöveg”-csíkok — éles, egész lap.
const lapon = (x: number, y: number) => x > 60 && x < 260 && y > 30 && y < 210;
const jo = kep((x, y) => (lapon(x, y) ? ((y % 12 < 2 && x > 80 && x < 240) ? 30 : 235) : 60));
const mj = kepMinoseg(jo, W, H);
igaz(`éles lap: éles (${Math.round(mj.elesseg)})`, mj.eles);
igaz(`éles lap: világos (${Math.round(mj.fenyesseg)})`, mj.vilagos);
igaz("éles lap: egész lap a képen", mj.egeszLap);
igaz("lap kerete nagyjából 60–260 × 30–210", !!mj.lap && Math.abs(mj.lap.x0 - 61 / W) < 0.03 && Math.abs(mj.lap.y1 - 210 / H) < 0.03);

// A lap kilóg a képből (a teljes kép fehér papír).
const kilog = kep((x, y) => ((y % 12 < 2 && x > 20 && x < 300) ? 30 : 235));
igaz("kilógó lap: nem egész lap", !kepMinoseg(kilog, W, H).egeszLap);

// Sötét kép.
const sotet = kep((x, y) => (lapon(x, y) ? ((y % 12 < 2) ? 5 : 55) : 20));
igaz("sötét kép: nem világos", !kepMinoseg(sotet, W, H).vilagos);

// --- stabilitás
igaz("azonos kockák: stabil", kepkockaElteres(jo, jo) < STABIL_ELTERES);
const eltolt = kep((x, y) => (lapon(x - 25, y) ? ((y % 12 < 2) ? 30 : 235) : 60));
igaz("elmozdult kocka: nem stabil", kepkockaElteres(jo, eltolt) >= STABIL_ELTERES);
igaz("auto-fotó ~1 mp (6–8 kocka)", AUTO_FOTO_KOCKA >= 6 && AUTO_FOTO_KOCKA <= 8);

// --- élesség teljes felbontású részleten: 12 MP-es „fotó” egy szállítólevélről
async function elessegTeszt() {
  const sorok = Array.from({ length: 60 }, (_, i) => `<text x="120" y="${300 + i * 44}" font-size="30" font-family="DejaVu Sans" fill="#222">Szállítólevél ${i} Fabrika 2000 Kft. Tompaládony EUR raklap 33 db</text>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2100" height="2970"><rect width="2100" height="2970" fill="#f7f5ef"/>${sorok}</svg>`;
  const lap = await sharp(Buffer.from(svg)).resize(2400).png().toBuffer();
  const foto = await sharp({ create: { width: 3024, height: 4032, channels: 3, background: { r: 70, g: 75, b: 80 } } })
    .composite([{ input: lap, left: 312, top: 300 }]).png().toBuffer();
  const ertek = async (blur: number) => {
    const buf = blur ? await sharp(foto).blur(blur).toBuffer() : foto;
    let max = 0;
    for (const k of reszletKivagasok(3024, 4032)) {
      const { data } = await sharp(buf).extract({ left: k.x, top: k.y, width: RESZLET_PX, height: RESZLET_PX }).greyscale().raw().toBuffer({ resolveWithObject: true });
      const g = new Uint8Array(data);
      for (let i = 0; i < g.length; i++) g[i] = Math.max(0, Math.min(255, g[i] + ((i * 7919) % 17) - 8)); // determinisztikus „zaj”
      max = Math.max(max, elesseg(g, RESZLET_PX, RESZLET_PX));
    }
    return max;
  };
  const e0 = await ertek(0), e2 = await ertek(2), e5 = await ertek(5);
  igaz(`éles fotó éles (${e0})`, e0 >= ELESSEG_KUSZOB);
  igaz(`2 px-es elmosás még éles (${e2})`, e2 >= ELESSEG_KUSZOB);
  igaz(`5 px-es elmosás már életlen (${e5})`, e5 < ELESSEG_KUSZOB);
  eq("kivágások a képen belül", reszletKivagasok(3024, 4032).every((k) => k.x + RESZLET_PX <= 3024 && k.y + RESZLET_PX <= 4032), true);
}

elessegTeszt().then(() => {
  if (hiba) {
    console.log(`\n${hiba} hiba`);
    process.exit(1);
  }
  console.log("\nminden rendben");
});
