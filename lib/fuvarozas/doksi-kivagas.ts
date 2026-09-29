import "server-only";
import sharp from "sharp";

// A sofőr fuvarlevél-fotójának „szkennelése": a papírlap kivágása a fotóból,
// egyenesbe forgatva, szürkeárnyalatos, tisztított lapként (Budaházi Zoltán,
// 2026-09-29: „nekem csak a doksi kell, mintha scannelve lenne").
//
// Miért saját kód: a perspektíva-korrekcióhoz elég egy homográfia + bilineáris
// mintavétel, ehhez nem kell OpenCV-wasm (≈9 MB) a szerverre — a dekódolást,
// átméretezést és a kontraszt-kezelést a sharp végzi, ami a Next.js révén
// amúgy is telepítve van.
//
// Az egész lépés OPCIONÁLIS: ha a lap kontúrja nem ismerhető fel biztosan
// (sötét háttér nincs, a papír kilóg a képből, gyűrött/árnyékos lap), akkor
// az EREDETI kép megy tovább. Egy ferde fotó jobb, mint egy félbevágott
// fuvarlevél — az eredetit nem tároljuk el külön, tehát nincs visszaút.

/** A felismerés ezen a szélességen dolgozik — elég a lap megtalálásához, és gyors. */
const ELEMZES_SZELESSEG = 500;
/**
 * A maszk erózió-sugara az elemzési méretben. A lapot vékony világos „hidak"
 * (a műszerfal fényes foltjai, a kéz megvilágított éle) hozzáköthetik a
 * háttérhez; ezeket az erózió elvágja, a lap maga alig fogy tőle. A kivágás
 * előtt a sarkokat ugyanennyivel kifelé toljuk, hogy a lap széle ne vesszen el.
 */
const EROZIO_SUGAR = 3;
/** A sarkok kifelé tolása az erózió után. Kisebb, mint az erózió sugara: inkább vesszen el egy hajszálnyi fehér szegély, mint hogy a sötét háttér csíkja rákerüljön a lapra. */
const SZEGELY_VISSZA = 1;
/** A lapnak legalább ennyi részét kell elfoglalnia a képből, különben nem hisszük el. */
const MIN_LAP_ARANY = 0.25;
/** Ennél nagyobb folt már maga a kép (nincs látható háttér) — nincs mit kivágni. */
const MAX_LAP_ARANY = 0.97;
/** A folt és a belőle kapott négyszög területének aránya — egy papírlap konvex, tehát közel 1. */
const MIN_NEGYSZOG_KITOLTES = 0.82;
/** A megvilágítás-térkép léptéke: ennyied méretre kicsinyítve becsüljük a háttér fényességét. */
const HATTER_OSZTO = 16;
/**
 * A háttérhez mért világosság („hányados") két végpontja. E fölött tiszta
 * fehér a papír, ez alatt tiszta fekete a betű; köztük enyhe sötétítő görbe,
 * hogy a napfényben elmosódott, halvány nyomat is visszakapja a kontrasztját.
 */
const HANYADOS_FEKETE = 0.35;
const HANYADOS_FEHER = 0.97;
/** 1 fölött sötétíti a középtónust — ettől olvasható a halvány mátrixnyomtatós sor is. */
const TONUS_GORBE = 1.35;
/** A kész oldal leghosszabb oldala pixelben. */
const KIMENET_MAX_OLDAL = 1600;

type Pont = { x: number; y: number };

/**
 * A fotóból szkennelt kinézetű oldal. Ha a lap nem ismerhető fel biztosan,
 * a bemenetet adja vissza változatlanul (`kivagva: false`).
 */
export async function szkennelj(
  eredeti: Buffer
): Promise<{ tartalom: Buffer; mimeType: string; kivagva: boolean; ok?: string }> {
  try {
    // A telefon EXIF-forgatását azonnal beégetjük, hogy a koordináták a
    // LÁTOTT képre vonatkozzanak.
    const kep = sharp(eredeti).rotate();
    const { width, height } = await kep.metadata();
    if (!width || !height) return { tartalom: eredeti, mimeType: "image/jpeg", kivagva: false, ok: "ismeretlen méret" };

    const meret = Math.min(ELEMZES_SZELESSEG / width, ELEMZES_SZELESSEG / height, 1);
    const ew = Math.max(1, Math.round(width * meret));
    const eh = Math.max(1, Math.round(height * meret));
    const kicsi = await kep.clone().resize(ew, eh, { fit: "fill" }).greyscale().raw().toBuffer();

    const sarkok = keressLapot(kicsi, ew, eh);
    if (!sarkok) {
      // Nincs biztos lap-kontúr: a kivágás kimarad, de a tisztítás nem — egy
      // egyenletesen megvilágított, szürkeárnyalatos oldal így is olvashatóbb.
      const egesz = await kep.clone().greyscale().raw().toBuffer();
      return { tartalom: await tisztitsd(egesz, width, height), mimeType: "image/jpeg", kivagva: false, ok: "nincs felismert lap" };
    }

    // Vissza a teljes felbontásra.
    const teljes = sarkok.map((p) => ({ x: p.x / meret, y: p.y / meret }));
    const szurke = await kep.clone().greyscale().raw().toBuffer();
    const lap = egyenesitsd(szurke, width, height, teljes);
    const kesz = await tisztitsd(lap.adat, lap.szelesseg, lap.magassag);
    return { tartalom: kesz, mimeType: "image/jpeg", kivagva: true };
  } catch (err) {
    console.error("[doksi-kivagas] a szkennelés nem sikerült, az eredeti kép megy tovább:", err);
    return { tartalom: eredeti, mimeType: "image/jpeg", kivagva: false, ok: "hiba" };
  }
}

/**
 * Szkenner-szerű utókezelés: HÁTTÉR-KIEGYENLÍTÉS. A fotón a lap egyik fele
 * árnyékban van, a másikra rásüt a nap — egy sima kontrasztnyújtás ezt nem
 * javítja, a helyi kontraszt (CLAHE) pedig felerősíti a papír szemcséjét és
 * a széleken sötét sávot hagy.
 *
 * Amit a szkenner csinál: egyenletesen világítja meg a lapot. Ezt utólag úgy
 * kapjuk vissza, hogy a képet elosztjuk a saját, erősen elmosott
 * változatával (ez a megvilágítás térképe) — ahol a papír sötétebb, ott a
 * háttér is sötétebb, tehát a hányados mindenhol ugyanaz a fehér. Csak a
 * betű és a tollvonás marad sötét, mert az kisebb, mint az elmosás sugara.
 *
 * A kemény fekete-fehér küszöbölést szándékosan kerüljük: a kék tollal írt
 * megjegyzés és a halvány pecsét azon eltűnne (a megbeszélt szürkeárnyalatos,
 * tisztított kinézet).
 */
async function tisztitsd(szurke: Buffer, w: number, h: number): Promise<Buffer> {
  // A megvilágítás térképe: lekicsinyítés + elmosás + visszanagyítás. Olcsóbb,
  // mint egy nagy sugarú elmosás a teljes felbontáson, és ugyanazt adja.
  const kw = Math.max(1, Math.round(w / HATTER_OSZTO));
  const kh = Math.max(1, Math.round(h / HATTER_OSZTO));
  const hatter = await sharp(szurke, { raw: { width: w, height: h, channels: 1 } })
    .resize(kw, kh, { fit: "fill" })
    .blur(2)
    .resize(w, h, { fit: "fill" })
    .raw()
    .toBuffer();

  // A hányadosból egy 256 elemű táblával számolunk értéket — pixelenként
  // pár szorzás helyett egy kikeresés.
  const tabla = new Uint8Array(1024);
  for (let i = 0; i < 1024; i++) {
    const hanyados = i / 512; // 0 … 2 közötti hányados, 1 = a háttérrel azonos
    const t = (hanyados - HANYADOS_FEKETE) / (HANYADOS_FEHER - HANYADOS_FEKETE);
    const v = t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(t, TONUS_GORBE);
    tabla[i] = Math.round(v * 255);
  }
  const ki = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) {
    const alap = hatter[i] < 1 ? 1 : hatter[i];
    const index = Math.min(1023, Math.round((szurke[i] / alap) * 512));
    ki[i] = tabla[index];
  }

  return sharp(ki, { raw: { width: w, height: h, channels: 1 } })
    .resize(KIMENET_MAX_OLDAL, KIMENET_MAX_OLDAL, { fit: "inside", withoutEnlargement: true })
    // Élesítés: a mátrixnyomtatós, halvány sorok (a lap felhajló szélén a
    // fotó is életlen) így kapják vissza az olvashatóságukat. A szemcsét nem
    // erősíti fel, mert a háttér-kiegyenlítés után a papír már egyenletes.
    .sharpen({ sigma: 1.2 })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

/**
 * A papírlap négy sarka a szürkeárnyalatos kicsinyített képen, vagy null, ha
 * nem ismerhető fel biztosan. A lap világos, a háttér (műszerfal, ruha, kéz)
 * sötétebb — Otsu-küszöb után a legnagyobb összefüggő világos folt a lap.
 */
function keressLapot(szurke: Buffer, w: number, h: number): [Pont, Pont, Pont, Pont] | null {
  const kuszob = otsu(szurke);
  const vilagos = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) vilagos[i] = szurke[i] > kuszob ? 1 : 0;

  const folt = legnagyobbFolt(erodald(vilagos, w, h, EROZIO_SUGAR), w, h);
  if (!folt) return null;
  const arany = folt.meret / (w * h);
  if (arany < MIN_LAP_ARANY || arany > MAX_LAP_ARANY) return null;

  // A lap SZÁNDÉKOSAN érhet a kép széléhez: a sofőrök teleképezik vele a
  // keresőt, sőt a papír sarka gyakran ki is lóg. Ami a képen kívül van, az
  // már a fotózáskor elveszett — a látható lapra vágás nem veszít többet.

  // Az erózióval elvesztett szegélyt visszaadjuk: minden sarkot a négyszög
  // középpontjától kifelé tolunk az erózió sugarával.
  const sarkok = toldd([folt.bf, folt.jf, folt.ja, folt.ba], SZEGELY_VISSZA);
  const negyszogTerulet = negyszogTeruleteFn(sarkok);
  if (negyszogTerulet <= 0) return null;
  if (folt.meret / negyszogTerulet < MIN_NEGYSZOG_KITOLTES) return null;

  // Elfajult négyszög (túl rövid oldal) — nem lap.
  const oldalak = [
    tav(sarkok[0], sarkok[1]),
    tav(sarkok[1], sarkok[2]),
    tav(sarkok[2], sarkok[3]),
    tav(sarkok[3], sarkok[0]),
  ];
  if (Math.min(...oldalak) < Math.min(w, h) * 0.2) return null;
  return sarkok;
}

/**
 * Erózió (minimum-szűrő) négyzetes ablakkal, két menetben (vízszintes, majd
 * függőleges) — így a költsége a sugártól független marad.
 */
function erodald(maszk: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const kozbenso = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let min = 1;
      for (let dx = -r; dx <= r && min; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= w || !maszk[y * w + nx]) min = 0;
      }
      kozbenso[y * w + x] = min;
    }
  }
  const ki = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let min = 1;
      for (let dy = -r; dy <= r && min; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h || !kozbenso[ny * w + x]) min = 0;
      }
      ki[y * w + x] = min;
    }
  }
  return ki;
}

/** Otsu-küszöb a szürkeárnyalatos hisztogramból. */
function otsu(szurke: Buffer): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < szurke.length; i++) hist[szurke[i]]++;
  const osszes = szurke.length;
  let osszegSuly = 0;
  for (let t = 0; t < 256; t++) osszegSuly += t * hist[t];
  let hatterSuly = 0, hatterOsszeg = 0, legjobb = 0, kuszob = 128;
  for (let t = 0; t < 256; t++) {
    hatterSuly += hist[t];
    if (hatterSuly === 0) continue;
    const elorSuly = osszes - hatterSuly;
    if (elorSuly === 0) break;
    hatterOsszeg += t * hist[t];
    const hAtlag = hatterOsszeg / hatterSuly;
    const eAtlag = (osszegSuly - hatterOsszeg) / elorSuly;
    const szoras = hatterSuly * elorSuly * (hAtlag - eAtlag) ** 2;
    if (szoras > legjobb) { legjobb = szoras; kuszob = t; }
  }
  return kuszob;
}

/**
 * A legnagyobb összefüggő világos folt, és mindjárt a négy sarka is: a
 * klasszikus x+y / x−y szélsőértékek adják egy (közel) téglalap alakú lap
 * bal-felső, jobb-felső, jobb-alsó, bal-alsó sarkát.
 */
function legnagyobbFolt(vilagos: Uint8Array, w: number, h: number) {
  const cimke = new Int32Array(w * h).fill(-1);
  const sor = new Int32Array(w * h);
  let legjobb: null | {
    meret: number; minX: number; minY: number; maxX: number; maxY: number;
    bf: Pont; jf: Pont; ja: Pont; ba: Pont;
  } = null;

  for (let start = 0; start < w * h; start++) {
    if (!vilagos[start] || cimke[start] !== -1) continue;
    let eleje = 0, vege = 0;
    sor[vege++] = start;
    cimke[start] = start;
    let meret = 0, minX = w, minY = h, maxX = 0, maxY = 0;
    let minSum = Infinity, maxSum = -Infinity, minDif = Infinity, maxDif = -Infinity;
    let bf: Pont = { x: 0, y: 0 }, jf: Pont = { x: 0, y: 0 }, ja: Pont = { x: 0, y: 0 }, ba: Pont = { x: 0, y: 0 };
    while (eleje < vege) {
      const p = sor[eleje++];
      const x = p % w, y = (p - x) / w;
      meret++;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      const s = x + y, d = x - y;
      if (s < minSum) { minSum = s; bf = { x, y }; }
      if (s > maxSum) { maxSum = s; ja = { x, y }; }
      if (d > maxDif) { maxDif = d; jf = { x, y }; }
      if (d < minDif) { minDif = d; ba = { x, y }; }
      if (x > 0 && vilagos[p - 1] && cimke[p - 1] === -1) { cimke[p - 1] = start; sor[vege++] = p - 1; }
      if (x < w - 1 && vilagos[p + 1] && cimke[p + 1] === -1) { cimke[p + 1] = start; sor[vege++] = p + 1; }
      if (y > 0 && vilagos[p - w] && cimke[p - w] === -1) { cimke[p - w] = start; sor[vege++] = p - w; }
      if (y < h - 1 && vilagos[p + w] && cimke[p + w] === -1) { cimke[p + w] = start; sor[vege++] = p + w; }
    }
    if (!legjobb || meret > legjobb.meret) legjobb = { meret, minX, minY, maxX, maxY, bf, jf, ja, ba };
  }
  return legjobb;
}

/** A négyszög sarkainak kitolása a középpontból kifelé, pixelben. */
function toldd(p: [Pont, Pont, Pont, Pont], px: number): [Pont, Pont, Pont, Pont] {
  const kx = (p[0].x + p[1].x + p[2].x + p[3].x) / 4;
  const ky = (p[0].y + p[1].y + p[2].y + p[3].y) / 4;
  return p.map((s) => {
    const d = Math.hypot(s.x - kx, s.y - ky) || 1;
    return { x: s.x + ((s.x - kx) / d) * px, y: s.y + ((s.y - ky) / d) * px };
  }) as [Pont, Pont, Pont, Pont];
}

function tav(a: Pont, b: Pont): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Négyszög területe (shoelace), a sarkok körbejárási sorrendjében. */
function negyszogTeruleteFn(p: [Pont, Pont, Pont, Pont]): number {
  let t = 0;
  for (let i = 0; i < 4; i++) {
    const a = p[i], b = p[(i + 1) % 4];
    t += a.x * b.y - b.x * a.y;
  }
  return Math.abs(t) / 2;
}

/**
 * A négyszögbe fogott lap kiegyenesítése: a kimeneti téglalap minden pontjára
 * kiszámoljuk a forrás-koordinátát (inverz homográfia), és bilineárisan
 * mintavételezzük. Így a ferdén, oldalról fotózott lap is szemből néz ki.
 */
function egyenesitsd(szurke: Buffer, w: number, h: number, sarkok: Pont[]) {
  const [bf, jf, ja, ba] = sarkok;
  // A kimenet a RÖVIDEBB szemközti oldalak mérete. A lap távolabbi vége
  // kevesebb pixelből áll; ha a hosszabb, közelebbi élhez igazítanánk, azt a
  // véget felnagyítanánk — a mátrixnyomtatós fejléc pont ettől mosódna el.
  const szelesseg = Math.round(Math.min(tav(bf, jf), tav(ba, ja)));
  const magassag = Math.round(Math.min(tav(bf, ba), tav(jf, ja)));
  const H = homografia(
    [{ x: 0, y: 0 }, { x: szelesseg, y: 0 }, { x: szelesseg, y: magassag }, { x: 0, y: magassag }],
    [bf, jf, ja, ba]
  );
  const adat = Buffer.alloc(szelesseg * magassag);
  for (let y = 0; y < magassag; y++) {
    for (let x = 0; x < szelesseg; x++) {
      const nevezo = H[6] * x + H[7] * y + 1;
      const sx = (H[0] * x + H[1] * y + H[2]) / nevezo;
      const sy = (H[3] * x + H[4] * y + H[5]) / nevezo;
      adat[y * szelesseg + x] = mintavetel(szurke, w, h, sx, sy);
    }
  }
  return { adat, szelesseg, magassag };
}

function mintavetel(kep: Buffer, w: number, h: number, x: number, y: number): number {
  if (x < 0) x = 0; else if (x > w - 1) x = w - 1;
  if (y < 0) y = 0; else if (y > h - 1) y = h - 1;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
  const fx = x - x0, fy = y - y0;
  const a = kep[y0 * w + x0], b = kep[y0 * w + x1], c = kep[y1 * w + x0], d = kep[y1 * w + x1];
  return Math.round(a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy);
}

/**
 * Homográfia együtthatói (h8 = 1) négy pontpárból, Gauss-eliminációval.
 * A forrásból a célba: cel[i] -> forras[i].
 */
function homografia(cel: Pont[], forras: Pont[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = cel[i];
    const { x: u, y: v } = forras[i];
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]); b.push(v);
  }
  for (let i = 0; i < 8; i++) {
    let fo = i;
    for (let r = i + 1; r < 8; r++) if (Math.abs(A[r][i]) > Math.abs(A[fo][i])) fo = r;
    [A[i], A[fo]] = [A[fo], A[i]];
    [b[i], b[fo]] = [b[fo], b[i]];
    const oszto = A[i][i] || 1e-12;
    for (let c = i; c < 8; c++) A[i][c] /= oszto;
    b[i] /= oszto;
    for (let r = 0; r < 8; r++) {
      if (r === i) continue;
      const f = A[r][i];
      if (!f) continue;
      for (let c = i; c < 8; c++) A[r][c] -= f * A[i][c];
      b[r] -= f * b[i];
    }
  }
  return b;
}
