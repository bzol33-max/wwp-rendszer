// A Google Drive-fuvarmegbízás-import ÖNÁLLÓ (nem Claude-alapú) motorja.
//
// Eddig ezt egy ütemezett Claude-feladat (routine) végezte: elolvasta a Drive
// mappát, kiolvasta a megbízás adatait, és beküldte a /api/fuvarozas/
// drive-import végpontra. Ez a mechanikus, szöveg-kiolvasás-jellegű munka
// nem igényli Claude érvelését — ezért ez a modul közvetlenül, egy olcsó
// LLM-mel (OpenRouter-en keresztül, pl. Gemini Flash) végzi ugyanezt:
//
//   Google Drive (service account) --text--> OpenRouter (Gemini) --JSON--> addFuvar()
//
// KIVÉTEL: a Duvenbeck gépi sablonját NEM nyelvi modell olvassa, hanem a
// lib/fuvarozas/duvenbeck.ts determinisztikus értelmezője. Két oka van: a
// hasábos PDF-elrendezést a modell rendre félreolvasta (város nélküli cím,
// megrendelőként a saját cégünk, találomra választott hivatkozási szám), és
// egy fuvarhoz két dokumentum érkezik (megbízás + rakománylista), amiket
// EGY sorba kell összefűzni — lásd lib/fuvarozas/duvenbeck-import.ts.
//
// Két belépési pont hívja ezt a modult:
// - app/api/fuvarozas/drive-sync/route.ts — a Railway cron szolgáltatás
//   óránként ezt hívja HTTP POST-tal.
// - lib/fuvarozas/drive-sync.ts ("use server") — a "Bér fuvarok —
//   folyamatban" lista "Frissítés" gombja hívja közvetlenül, szerver-akcióként.
//
// NEM "use server" fájl — plain Node modul, mert googleapis/pdf-parse/
// mammoth importokat és sok segédfüggvényt tartalmaz (a "use server" fájlok
// kizárólag async függvényeket exportálhatnak).

import { google } from "googleapis";
import { query } from "@/lib/db";
import {
  addFuvar,
  setFuvarFuvardij,
  setFuvarFizetesiHatarido,
  setFuvarPostazasiCim,
} from "@/lib/fuvarozas/megbizasok";
import { normalizaltCegKulcs, sajatCegunkE, type FuvardijPenznem } from "@/lib/fuvarozas/fuvar-constants";
import { findJarmuInSzoveg, jarmuLabel } from "@/lib/fuvarozas/vehicles";
import {
  mentDuvenbeckDokumentumot,
  ismertDriveFileIdk,
  ujUtonFeldolgozottFileIdk,
} from "@/lib/fuvarozas/duvenbeck-import";
import { normalizaltSzoveg, torzsSzoveg } from "@/lib/fuvarozas/import/normalizalas";
import { pdfSzovegElemek } from "@/lib/fuvarozas/import/pdf-elemek";
import { felismerPartner } from "@/lib/fuvarozas/import/partnerek";
import { ellenorizKivontFuvart, type KivontFuvar } from "@/lib/fuvarozas/import/ellenorzes";
import {
  rogzitNaplot,
  nyersSzoveggelNaplozottFileIdk,
  azonosSzoveguIsmertIrat,
  csatolIratotFuvarhoz,
  hianyzoDuvenbeckParja,
} from "@/lib/fuvarozas/import/naplo";

const DRIVE_FOLDER_ID = "1JNUvwN30It3_rooGkeTGTpkO4K9bix2n";

/**
 * A Duvenbeck gépi fájlnevei. Csak arra szolgál, hogy eldöntsük: egy MÁR ISMERT
 * fájlt érdemes-e újraolvasni. Ha egy Duvenbeck-iratot még nem a
 * determinisztikus úton dolgoztunk fel, akkor a hozzá tartozó (nyelvi modellel
 * készült, hibás) sor még fogja a fájlt, és csak újraolvasással váltható le.
 * Az újraolvasás ingyenes — reguláris kifejezés, nem nyelvi modell —, és a
 * fájl utána bekerül a fuvar_dokumentumok táblába, tehát legfeljebb egyszer fut le.
 */
const DUVENBECK_FAJLNEV = /^(TA|FRALI)\d+_V\d+\.pdf$/i;
const MAX_POTLAS_SORONKENT = 5;

export type DriveSyncEredmeny = {
  ujFuvarok: number;
  potoltSorok: number;
  vizsgaltFajlok: number;
  /** Meglévő fuvarhoz csatolt dokumentumok (pl. egy megbízás rakománylistája) — lásd lib/fuvarozas/duvenbeck-import.ts. */
  osszefuzottDokumentumok: number;
  /** Régi, nyelvi modellel beolvasott sorok, amiket a determinisztikus feldolgozás leváltott. */
  levaltottRegiSorok: number;
  /** Iratok, amikből SZÁNDÉKOSAN nem lett sor, mert hiányos volt — lásd fuvar_import_naplo. */
  elutasitottIratok: number;
  /** Korábban beolvasott sorok, amelyek megrendelőjét a partner-sablon utólag helyesbítette — lásd megrendelokHelyesbitese. */
  helyesbitettMegrendelok: number;
  /** Emberi döntést igénylő esetek (pl. már kiszámlázott régi sor) — nem hiba. */
  figyelmeztetesek: string[];
  hibak: string[];
};

/** A Drive service account hitelesítő adatai — GOOGLE_SERVICE_ACCOUNT_KEY env var, a teljes JSON kulcsfájl szövegeként. */
function driveClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error(
      "Hiányzik a GOOGLE_SERVICE_ACCOUNT_KEY környezeti változó (a Google Cloud service account JSON kulcsa)."
    );
  }
  const credentials = JSON.parse(raw);
  const auth = new google.auth.GoogleAuth({
    credentials,
    // Teljes Drive-jog (2026-09-17): a sofőr mobil fuvarlevél-fotói ide
    // töltődnek fel (feltoltFuvarlevelFotot). A "drive.file" nem lenne elég,
    // mert az csak az app által létrehozott fájlokat látná, a megbízás-PDF-eket
    // nem. A service account a Fuvarmegbizások mappán Szerkesztő.
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return google.drive({ version: "v3", auth });
}

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
};

/** Egyértelműen NEM fuvarmegbízás-dokumentum (összesítő/párosító táblázat stb.) — a fájlnév alapján kiszűrve. */
function nyilvanvaloanNemMegbizas(nev: string): boolean {
  const n = nev.toLowerCase();
  return /összesít|osszesit|párosítás|parositas|summary|napló|naplo/.test(n);
}

const TAMOGATOTT_MIME_TIPUSOK = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.google-apps.document", // Google Docs
]);

async function listazDriveFajlok(drive: ReturnType<typeof driveClient>): Promise<DriveFile[]> {
  const res = await drive.files.list({
    q: `'${DRIVE_FOLDER_ID}' in parents and trashed = false`,
    fields: "files(id, name, mimeType)",
    pageSize: 200,
  });
  return (res.data.files ?? [])
    .filter((f): f is DriveFile => !!f.id && !!f.name && !!f.mimeType)
    .filter((f) => TAMOGATOTT_MIME_TIPUSOK.has(f.mimeType))
    .filter((f) => !nyilvanvaloanNemMegbizas(f.name));
}

/**
 * Egy Drive-fájl nyers tartalma a service accounttal — a sofőr mobil nézete
 * ezen keresztül nyitja meg a megbízást és a rakománylistát.
 *
 * Miért kell proxy: a fuvar_dokumentumok.dokumentum_url a Drive saját
 * megtekintő-linkje, amit csak olyan Google-fiók nyit meg, amivel a mappa
 * meg van osztva. A sofőr telefonján ilyen fiók nincs, viszont a
 * szinkronizáló service account amúgy is olvassa ezt a mappát — tehát a
 * fájlt a mi szerverünk adja ki, a mi jogosultság-ellenőrzésünk mögött.
 */
export async function letoltDriveFajl(fileId: string): Promise<{ buffer: Buffer; mimeType: string; nev: string }> {
  const drive = driveClient();
  const meta = await drive.files.get({ fileId, fields: "id, name, mimeType" });
  const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
  return {
    buffer: Buffer.from(res.data as ArrayBuffer),
    mimeType: meta.data.mimeType ?? "application/octet-stream",
    nev: meta.data.name ?? fileId,
  };
}

/** A fuvarlevél-fotók almappája a Fuvarmegbizások mappán belül. */
const FUVARLEVEL_MAPPA_NEV = "Fuvarlevelek";

/**
 * A sofőr által lefotózott fuvarlevél/CMR feltöltése a Drive-ba, a
 * Fuvarmegbizások mappa "Fuvarlevelek" almappájába (ha nincs, létrejön).
 *
 * Miért almappa: a drive-sync a Fuvarmegbizások mappa KÖZVETLEN fájljait
 * olvassa megbízásként. Egy kép mime-típusa ugyan kiesne a szűrőn, de az
 * almappa a biztos: a fotók sosem keverednek a megbízás-iratok közé.
 */
/**
 * Egy e-mailből érkezett megbízás-irat feltöltése a FIGYELT mappába — onnan
 * a szokásos drive-sync veszi fel (nincs külön import-út). A Gmail-figyelő
 * (lib/fuvarozas2/levelek-core.ts) hívja.
 */
export async function feltoltMegbizasIratot(
  nev: string,
  mimeType: string,
  tartalom: Buffer
): Promise<{ id: string; url: string }> {
  const drive = driveClient();
  const { Readable } = await import("node:stream");
  const res = await drive.files.create({
    requestBody: { name: nev, parents: [DRIVE_FOLDER_ID], mimeType },
    media: { mimeType, body: Readable.from(tartalom) },
    fields: "id, webViewLink",
  });
  if (!res.data.id) throw new Error("A Drive nem adott vissza fájl-azonosítót.");
  return { id: res.data.id, url: res.data.webViewLink ?? `https://drive.google.com/file/d/${res.data.id}/view` };
}

export async function feltoltFuvarlevelFotot(
  nev: string,
  mimeType: string,
  tartalom: Buffer
): Promise<{ id: string; url: string }> {
  const drive = driveClient();
  const lista = await drive.files.list({
    q: `'${DRIVE_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${FUVARLEVEL_MAPPA_NEV}' and trashed = false`,
    fields: "files(id)",
    pageSize: 1,
  });
  let mappaId = lista.data.files?.[0]?.id ?? null;
  if (!mappaId) {
    const uj = await drive.files.create({
      requestBody: { name: FUVARLEVEL_MAPPA_NEV, mimeType: "application/vnd.google-apps.folder", parents: [DRIVE_FOLDER_ID] },
      fields: "id",
    });
    mappaId = uj.data.id ?? null;
  }
  if (!mappaId) throw new Error("Nem sikerült a Fuvarlevelek mappát létrehozni a Drive-on.");

  const { Readable } = await import("node:stream");
  const res = await drive.files.create({
    requestBody: { name: nev, parents: [mappaId], mimeType },
    media: { mimeType, body: Readable.from(tartalom) },
    fields: "id, webViewLink",
  });
  if (!res.data.id) throw new Error("A Drive nem adott vissza fájl-azonosítót.");
  return { id: res.data.id, url: res.data.webViewLink ?? `https://drive.google.com/file/d/${res.data.id}/view` };
}

/**
 * A fájl szöveges tartalma — PDF-hez pdf-parse, DOCX-hez mammoth, Google
 * Docs-hoz natív export. PDF-nél a letöltött bájtok is visszajönnek, hogy a
 * hasábos partner-sablonok koordinátás olvasója (pdf-elemek.ts) ugyanabból
 * a letöltésből dolgozhasson.
 */
async function fajlSzovege(
  drive: ReturnType<typeof driveClient>,
  file: DriveFile
): Promise<{ szoveg: string; pdfBuffer: Buffer | null }> {
  if (file.mimeType === "application/vnd.google-apps.document") {
    const res = await drive.files.export(
      { fileId: file.id, mimeType: "text/plain" },
      { responseType: "text" }
    );
    return { szoveg: String(res.data), pdfBuffer: null };
  }

  const res = await drive.files.get(
    { fileId: file.id, alt: "media" },
    { responseType: "arraybuffer" }
  );
  const buffer = Buffer.from(res.data as ArrayBuffer);

  if (file.mimeType === "application/pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const parsed = await parser.getText();
      return { szoveg: parsed.text, pdfBuffer: buffer };
    } finally {
      await parser.destroy();
    }
  }

  // .docx
  const mammoth = await import("mammoth");
  const parsed = await mammoth.extractRawText({ buffer });
  return { szoveg: parsed.value, pdfBuffer: null };
}

function driveViewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

/** A dokumentum_url-ből kinyeri a Drive fájl ID-t — a drive-hianyok pótló körhöz kell újra megtalálni a fájlt. */
function fileIdFromViewUrl(url: string): string | null {
  const m = url.match(/\/file\/d\/([^/]+)\//);
  return m ? m[1] : null;
}

/**
 * Amit a nyelvi modelltől várunk: a közös `KivontFuvar` alak (lásd
 * lib/fuvarozas/import/ellenorzes.ts) + a "ez egyáltalán fuvarmegbízás?"
 * eldöntése. A közös alakot a determinisztikus olvasók is ezt adják vissza,
 * így az ellenőrzés mindkét úton ugyanaz.
 */
type LlmValasz = KivontFuvar & { isFuvarmegbizas: boolean };

const KIVONATOLASI_UTASITAS = `Egy fuvarmegbízás-dokumentum szövege következik. A szöveget már megtisztítottuk: a nyomtatási ismétléseket összevontuk, és a szerződéses kisbetűs részt levágtuk. Olvasd ki belőle ALAPOSAN az alábbi mezőket, és VÁLASZOLJ KIZÁRÓLAG egyetlen, érvényes JSON objektummal (ne írj mást, ne használj markdown code fence-t):

{
  "isFuvarmegbizas": boolean, // false, ha a szöveg NYILVÁNVALÓAN nem fuvarmegbízás (pl. számla, összesítő táblázat)
  "megrendelo": string|null, // a fuvart kiadó partner (MEGBÍZÓ) cégneve
  "felrako": string|null, // felrakás helye (város vagy teljes cím)
  "felrakasDatum": string|null, // ISO dátum ÉÉÉÉ-HH-NN — a felrakás dátuma
  "lerako": string|null, // lerakás helye; ha több lerakó van, az UTOLSÓ
  "lerakasDatum": string|null, // ISO dátum ÉÉÉÉ-HH-NN, CSAK ha eltér a felrakás dátumától, egyébként null
  "aru": string|null, // áru megnevezése
  "mennyiseg": string|null, // mennyiség/súly szövegesen
  "rendszamVagySofor": string|null, // a dokumentumban szereplő jármű rendszáma VAGY sofőr neve, szó szerint
  "fuvardij": number|null, // a fuvardíj SZÁMÉRTÉKE, ezres elválasztó nélkül
  "fuvardijPenznem": "Ft"|"EUR"|null,
  "fizetesiHataridoNap": number|null, // fizetési határidő NAPOKBAN (pl. "60 napos átutalás" -> 60), ne dátum
  "postazasiCim": string|null, // ahová az EREDETI papírokat postázni kell — elsőbbség: kifejezett postázási cím > számlázási cím > székhely
  "pozicioszam": string|null, // a megbízó hivatkozási/pozíció száma
  "megjegyzes": string|null // bármi egyéb fontos infó egy rövid mondatban, vagy null
}

HÁROM DOLOG, AMIT EZEK A SABLONOK RENDRE ELRONTANAK — figyelj rájuk:

1. A CÍMKE GYAKRAN AZ ÉRTÉK UTÁN ÁLL, mert a PDF hasábokban tördel. Például
   "90 000,00 HUF (+ 27 % ÁFA)  Fuvardíj (nettó):" — itt a fuvardíj 90000.
   Ugyanígy: "R16 / 2546 / 3003  Poz.számunk:" -> pozicioszam = "R16 / 2546 / 3003".
   Mindig nézd meg a címke MINDKÉT oldalát.

2. A MEGBÍZÓ ÉS A MEGBÍZOTT ADATAI EGYMÁS MELLETT vannak
   ("Megbízó adatai: Megbízott adatai:"), és a kiolvasott szövegben egy sorba
   csúsznak. A "Well Worn Pallett Kft" / "WELL-WORN PALLET KFT" MINDIG a
   megbízott (mi vagyunk a fuvarozó) — SOHA nem ő a megrendelő. Ha ezt a
   nevet látod, a MÁSIK cég a megrendelő. A felrakó és a lerakó cég sem
   megrendelő: ők a rakodás helyszínei — a "Felrakóhely: … (Valami Kft.)"
   zárójeles cége a rakodóhely üzemeltetője, NEM a megbízó. A megbízó az a
   cég, amelyik az iratot kiadta: a fejlécben/levélpapíron álló név, az
   e-mail-cím domainje, az "Ügyintéző" munkáltatója.

3. A FUVARDÍJ NEM KÖTBÉR. A dokumentumokban sok más pénzösszeg is szerepel:
   kötbér, meghiúsulási kötbér, állásdíj (pl. 210 EUR/nap), késedelmi díj
   (pl. 10.000 Ft/óra), raklap ára (pl. 7.000 Ft/db), kártérítési felső
   határ (pl. 50 000 EUR). EGYIK SEM fuvardíj. A fuvardíj a megbízás
   ellenértéke, jellemzően "Fuvardíj", "Fuvardíj (nettó)", "Fuvar *" vagy
   "Fuvardíj EU-s" megjelöléssel.

Csak akkor hagyj mezőt üresen (null), ha tényleg nem található a szövegben — ne találj ki adatot. Ha egy mezőben bizonytalan vagy, a null a JÓ válasz: a hiányzó mezőt ember pótolja, a kitalált adat viszont rossz számlát eredményez.`;

function parseJsonValasz(nyers: string): LlmValasz | null {
  const eleje = nyers.indexOf("{");
  const vege = nyers.lastIndexOf("}");
  if (eleje === -1 || vege === -1 || vege < eleje) return null;
  try {
    return JSON.parse(nyers.slice(eleje, vege + 1)) as LlmValasz;
  } catch {
    return null;
  }
}

async function kivonatolFuvarAdatot(szoveg: string): Promise<LlmValasz | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("Hiányzik az OPENROUTER_API_KEY környezeti változó.");
  }
  const model = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash-lite";

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: KIVONATOLASI_UTASITAS },
        // A dokumentum szövege esetlegesen hosszú — 20 000 karakternél vágjuk, hogy ne fusson ki a kontextusból.
        { role: "user", content: szoveg.slice(0, 20000) },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenRouter hiba (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const tartalom = data.choices?.[0]?.message?.content;
  if (!tartalom) return null;
  return parseJsonValasz(tartalom);
}

/**
 * A kivont "rendszamVagySofor" szöveg alapján megkeresi a hozzá tartozó saját
 * jármű kanonikus címkéjét, ha van egyezés. A megbízók a vontató és a
 * pótkocsi rendszámát együtt írják ("NMZ492/XZV926", "AOPU-427 AOTY-474"),
 * ezért nem az egész szöveget, hanem a benne lévő rendszámokat egyenként
 * illesztjük — lásd findJarmuInSzoveg.
 */
function resolveJarmuMezo(rendszamVagySofor: string | null): string | undefined {
  const jarmu = findJarmuInSzoveg(rendszamVagySofor);
  return jarmu ? jarmuLabel(jarmu) : undefined;
}

/**
 * Az LLM válasza a "fuvardijPenznem" mezőre a kérés ellenére sem mindig
 * pontosan "Ft"/"EUR" (pl. a dokumentumban szereplő "HUF" felirat szó
 * szerint visszaköszönhet) — a fuvar_megbizasok tábla `check
 * (fuvardij_penznem in ('Ft', 'EUR'))` megkötése viszont pontos egyezést
 * követel, egyébként az INSERT/UPDATE elszáll. Itt normalizáljuk a
 * lehetséges változatokat, mielőtt bármelyik DB-hívásba kerülne.
 */
function normalizaltFuvardijPenznem(nyers: string | null | undefined): FuvardijPenznem | undefined {
  if (!nyers) return undefined;
  const n = nyers.trim().toLowerCase();
  if (n === "eur" || n === "euro" || n === "€") return "EUR";
  if (n === "ft" || n === "huf" || n === "forint") return "Ft";
  return undefined;
}

async function ismertDokumentumUrlak(): Promise<Set<string>> {
  const sorok = await query<{ dokumentum_url: string }>(
    `select dokumentum_url from fuvar_megbizasok where dokumentum_url is not null`
  );
  return new Set(sorok.map((s) => s.dokumentum_url));
}

/**
 * Új fuvarmegbízás-fájlok felvitele.
 *
 * A feldolgozás útja minden fájlra ugyanaz, és MINDEN lépés nyomot hagy a
 * fuvar_import_naplo táblában:
 *
 *   1. szöveg kinyerése (pdf-parse / mammoth / Docs-export)
 *   2. NORMALIZÁLÁS — a vastagítás-utánzó négyszeres ismétlések összevonása
 *   3. PARTNER-FELISMERÉS ujjlenyomatból -> innentől a megrendelő TÉNY, nem tipp
 *   4. a szerződéses kisbetűs rész levágása (csali kötbér-összegek nélkül)
 *   5. kiolvasás: Duvenbecknél determinisztikus értelmező, egyébként nyelvi modell
 *   6. ELLENŐRZÉS -> verdikt; az elutasított iratból NEM lesz sor
 *   7. naplózás — akkor is, ha nem lett sor
 */
async function ujFajlokFeldolgozasa(
  drive: ReturnType<typeof driveClient>,
  hibak: string[]
): Promise<{
  ujFuvarok: number;
  vizsgaltFajlok: number;
  osszefuzottDokumentumok: number;
  levaltottRegiSorok: number;
  elutasitottIratok: number;
  figyelmeztetesek: string[];
}> {
  const [fajlok, ismertUrlak, ismertFileIdk, ujUtonKeszek, naplozottak] = await Promise.all([
    listazDriveFajlok(drive),
    ismertDokumentumUrlak(),
    ismertDriveFileIdk(),
    ujUtonFeldolgozottFileIdk(),
    nyersSzoveggelNaplozottFileIdk(),
  ]);
  let ujFuvarok = 0;
  let osszefuzottDokumentumok = 0;
  let levaltottRegiSorok = 0;
  let elutasitottIratok = 0;
  const figyelmeztetesek: string[] = [];
  // A körben feldolgozott Duvenbeck-iratok — a kör végén nézzük meg, teljes-e
  // a páruk (lásd hianyzoDuvenbeckParja), nem az érkezésükkor.
  const duvenbeckIratok: { fajlnev: string; fuvarId: string; naplo: Parameters<typeof rogzitNaplot>[0] }[] = [];

  for (const file of fajlok) {
    const url = driveViewUrl(file.id);
    // A fájl-ID a megbízhatóbb jel: egy meglévő fuvarhoz CSATOLT dokumentum
    // (pl. a megbízás rakománylistája) nem a fuvar dokumentum_url-je, de
    // ettől még fel van dolgozva — a fuvar_dokumentumok tábla tudja.
    const regiUtonIsmert = ismertUrlak.has(url) || ismertFileIdk.has(file.id);
    const duvenbeckUjrafeldolgozando = DUVENBECK_FAJLNEV.test(file.name) && !ujUtonKeszek.has(file.id);
    // A napló nyers szövegét fájlonként EGYSZER töltjük fel; utána a már
    // ismert fájlokat újra átugorjuk, tehát ez nem óránkénti letöltés.
    const naploraVar = !naplozottak.has(file.id);
    if (regiUtonIsmert && !duvenbeckUjrafeldolgozando && !naploraVar) continue;

    try {
      const { szoveg: nyersSzoveg, pdfBuffer } = await fajlSzovege(drive, file);
      const normalizalt = normalizaltSzoveg(nyersSzoveg);
      const partner = felismerPartner(normalizalt);
      const naploAlap = {
        driveFileId: file.id,
        fajlnev: file.name,
        dokumentumUrl: url,
        partnerKod: partner?.kod ?? null,
        nyersSzoveg,
      };

      if (!normalizalt.trim()) {
        // Beszkennelt, szövegréteg nélküli PDF. Eddig ez csendben kimaradt;
        // mostantól látszik, hogy van egy irat, amit a gép nem tud elolvasni.
        await rogzitNaplot({
          ...naploAlap,
          olvaso: null,
          verdikt: "hiba",
          kifogasok: ["A fájlból nem jött ki szöveg — valószínűleg beszkennelt kép, kézi rögzítés kell."],
          fuvarId: null,
        });
        continue;
      }

      // --- Duvenbeck: determinisztikus út, nyelvi modell nélkül ---
      const duvenbeck = await mentDuvenbeckDokumentumot(nyersSzoveg, {
        id: file.id,
        name: file.name,
        url,
      });
      if (duvenbeck) {
        if (duvenbeck.statusz === "uj") ujFuvarok++;
        else if (duvenbeck.statusz === "osszefuzve") osszefuzottDokumentumok++;
        levaltottRegiSorok += duvenbeck.levaltottSorok;
        const kifogasok = duvenbeck.szamlazottRegiSorok.map(
          (szamla) => `Ehhez a fuvarhoz már van kiállított számla (${szamla}) — nem vettük fel újra, nézd át kézzel.`
        );
        for (const kifogas of kifogasok) figyelmeztetesek.push(`${file.name}: ${kifogas}`);
        const duvenbeckNaplo = {
          ...naploAlap,
          partnerKod: partner?.kod ?? "duvenbeck",
          olvaso: "duvenbeck" as const,
          verdikt: kifogasok.length > 0 ? ("ellenorizendo" as const) : ("biztos" as const),
          kifogasok,
          fuvarId: duvenbeck.fuvarId,
        };
        await rogzitNaplot(duvenbeckNaplo);
        duvenbeckIratok.push({ fajlnev: file.name, fuvarId: duvenbeck.fuvarId, naplo: duvenbeckNaplo });
        continue;
      }

      // --- Már ismert, nem Duvenbeck irat: csak a naplót töltjük fel ---
      // Újra NEM adjuk oda a nyelvi modellnek: abból csak duplikált sor lenne.
      if (regiUtonIsmert) {
        await rogzitNaplot({
          ...naploAlap,
          olvaso: null,
          verdikt: "regi_import",
          kifogasok: [
            "Ez az irat még a napló bevezetése előtt került be, ezért a rendszer nem tudja, mit olvasott ki belőle. A hozzá tartozó sort érdemes egyszer átnézni.",
          ],
          fuvarId: null,
        });
        continue;
      }

      // --- Ugyanaz az irat még egyszer, más Drive-azonosítóval ---
      // A mappába kétszer feltöltött fájl (élesben: 26-3289.pdf, 26-3553.pdf
      // kétszer) eddig két sort adott, mert a nem-Duvenbeck iratnak nincs
      // azonossági kulcsa. A nyers szöveg viszont szó szerint azonos: a
      // második példányt a meglévő fuvarhoz csatoljuk, új sor nem lesz.
      const masodpeldany = await azonosSzoveguIsmertIrat(file.id, nyersSzoveg);
      if (masodpeldany) {
        await csatolIratotFuvarhoz(masodpeldany.fuvarId, { id: file.id, name: file.name, url });
        osszefuzottDokumentumok++;
        await rogzitNaplot({
          ...naploAlap,
          olvaso: null,
          verdikt: "duplikatum",
          kifogasok: [
            `Ugyanez az irat már be van olvasva (${masodpeldany.fajlnev ?? masodpeldany.driveFileId}) — a meglévő fuvarhoz csatoltuk, új sor nem keletkezett.`,
          ],
          fuvarId: masodpeldany.fuvarId,
        });
        continue;
      }

      // --- Nyelvi modell a MEGTISZTÍTOTT törzsszövegen ---
      const torzs = torzsSzoveg(normalizalt, partner?.torzsVege ?? []);
      const llm = await kivonatolFuvarAdatot(torzs);
      if (!llm || !llm.isFuvarmegbizas) {
        await rogzitNaplot({
          ...naploAlap,
          olvaso: "llm",
          verdikt: "nem_megbizas",
          kifogasok: llm ? [] : ["A nyelvi modell nem adott értelmezhető választ."],
          fuvarId: null,
        });
        continue;
      }

      // A partner sablonjából determinisztikusan olvasható mezők (pl. a
      // SpediTrans kéthasábos felrakó/lerakó táblája, lásd
      // lib/fuvarozas/import/speditrans.ts) felülírják a modell tippjét —
      // csak a ténylegesen kiolvasott (nem null) értékek.
      const elemek = partner?.kivon && pdfBuffer ? await pdfSzovegElemek(pdfBuffer).catch(() => null) : null;
      const determinisztikus = Object.fromEntries(
        Object.entries(partner?.kivon?.(nyersSzoveg, elemek) ?? {}).filter(([, v]) => v !== null && v !== undefined)
      ) as Partial<KivontFuvar>;
      const kivont: KivontFuvar = {
        ...llm,
        ...determinisztikus,
        // Ha az irat ismert partner sablonja, a megrendelő NEM TIPP: a
        // partner hivatalos nevét írjuk be. Ez zárja ki véglegesen, hogy a
        // hasábos fejlécből minket (vagy egy felrakó céget) olvasson
        // megrendelőnek — lásd lib/fuvarozas/import/partnerek.ts.
        megrendelo: partner ? partner.nev : llm.megrendelo,
        postazasiCim: llm.postazasiCim || partner?.postazasiCim || null,
        fizetesiHataridoNap: llm.fizetesiHataridoNap ?? partner?.fizetesiHataridoNap ?? null,
      };

      // A pénznemet MÁR az ellenőrzés előtt normalizáljuk: az LLM "HUF"-ot is
      // adhat, és a fuvardíj-sáv táblában (ellenorzes.ts) csak "Ft"/"EUR" van —
      // a nyers érték "Cannot read properties of undefined (reading 'min')"
      // hibával buktatta el a fájlt minden szinkronban (02215-2026.pdf, 2026-09-17).
      kivont.fuvardijPenznem = normalizaltFuvardijPenznem(kivont.fuvardijPenznem) ?? null;
      const { verdikt, kifogasok } = ellenorizKivontFuvart(kivont, !!partner, new Date(), !!partner?.nincsHivatkozas);
      if (verdikt === "elutasitva") {
        // Inkább ne legyen sor, mint rossz sor: egy hiányos irat csendben
        // felvitt fuvarja eddig számlázásig eljutott.
        elutasitottIratok++;
        await rogzitNaplot({ ...naploAlap, olvaso: "llm", verdikt, kifogasok, fuvarId: null });
        figyelmeztetesek.push(`${file.name}: nem vittük fel — ${kifogasok.join(" ")}`);
        continue;
      }

      const fuvarId = await addFuvar({
        tipus: "sajat",
        datum: kivont.felrakasDatum!,
        lerako: kivont.lerako!,
        felrako: kivont.felrako || undefined,
        megrendelo: kivont.megrendelo || undefined,
        aru: kivont.aru || undefined,
        mennyiseg: kivont.mennyiseg || undefined,
        jarmu: resolveJarmuMezo(kivont.rendszamVagySofor),
        sofor: kivont.rendszamVagySofor || undefined,
        fuvardij: kivont.fuvardij ?? undefined,
        fuvardijPenznem: normalizaltFuvardijPenznem(kivont.fuvardijPenznem),
        fizetesiHataridoNap: kivont.fizetesiHataridoNap ?? undefined,
        postazasiCim: kivont.postazasiCim || undefined,
        pozicioszam: kivont.pozicioszam || undefined,
        // A tudottan hivatkozás nélküli partnernél (pl. Hajdúspedíció) a
        // "nincs ilyen" jelölés eleve be van pipálva, nem kell kézzel.
        pozicioszamNincs: !kivont.pozicioszam && !!partner?.nincsHivatkozas,
        megjegyzes: kivont.megjegyzes || undefined,
        lerakasDatum: kivont.lerakasDatum || undefined,
        dokumentumUrl: url,
        driveFileId: file.id,
        forras: "pdf_import",
        ellenorzott: false,
      });
      if (fuvarId) ujFuvarok++;
      await rogzitNaplot({
        ...naploAlap,
        olvaso: "llm",
        verdikt,
        kifogasok: fuvarId
          ? kifogasok
          : [...kifogasok, "Ezt a dokumentumot már felvittük korábban — nem keletkezett új sor."],
        fuvarId,
      });
    } catch (err) {
      const uzenet = err instanceof Error ? err.message : "ismeretlen hiba";
      hibak.push(`${file.name}: ${uzenet}`);
      await rogzitNaplot({
        driveFileId: file.id,
        fajlnev: file.name,
        dokumentumUrl: url,
        partnerKod: null,
        olvaso: null,
        verdikt: "hiba",
        kifogasok: [uzenet],
        fuvarId: null,
        nyersSzoveg: null,
      }).catch(() => {
        /* a napló írása soha ne döntse el a szinkront */
      });
    }
  }

  // --- Duvenbeck: teljes-e a pár? ---
  // A kör végén, mert a megbízás és a rakománylista ugyanabban a körben jön:
  // az elsőnél még hiányozna a második. Ha a kör után is csak az egyik irat
  // van meg, a napló és a figyelmeztetés jelzi — a cím (rakománylista
  // nélkül) vagy az ár (megbízás nélkül) addig a gyengébb forrásból való.
  const mostVizsgalt = new Set<string>();
  for (const irat of duvenbeckIratok) {
    if (mostVizsgalt.has(irat.fuvarId)) continue;
    mostVizsgalt.add(irat.fuvarId);
    try {
      const hianyzik = await hianyzoDuvenbeckParja(irat.fuvarId);
      if (!hianyzik) continue;
      const uzenet =
        hianyzik === "rakomanylista"
          ? "A Duvenbeck párban küldi az iratokat: a rakománylista (FRALI…) még nem érkezett meg, a cím a megbízás hasábos szövegéből való — cégnév nélkül."
          : "A Duvenbeck párban küldi az iratokat: a megbízás (TA…) még nem érkezett meg, ezért nincs ár és számlázási cím.";
      figyelmeztetesek.push(`${irat.fajlnev}: ${uzenet}`);
      await rogzitNaplot({
        ...irat.naplo,
        verdikt: "ellenorizendo",
        kifogasok: [...irat.naplo.kifogasok, uzenet],
        // A nyers szöveget az első írás már eltárolta; itt megmarad.
        nyersSzoveg: null,
      });
    } catch (err) {
      hibak.push(`${irat.fajlnev}: a pár ellenőrzése nem sikerült — ${err instanceof Error ? err.message : "ismeretlen hiba"}`);
    }
  }

  return {
    ujFuvarok,
    vizsgaltFajlok: fajlok.length,
    osszefuzottDokumentumok,
    levaltottRegiSorok,
    elutasitottIratok,
    figyelmeztetesek,
  };
}

/** A korábban felvitt, de hiányos sorok pótlása — az /api/fuvarozas/drive-hianyok + drive-frissites páros eddig végzett lépése. */
async function hianyokPotlasa(drive: ReturnType<typeof driveClient>, hibak: string[]): Promise<number> {
  const hianyosSorok = await query<{
    id: string;
    dokumentum_url: string;
    hianyzik_fuvardij: boolean;
    hianyzik_fizetesi_hatarido: boolean;
    hianyzik_postazasi_cim: boolean;
  }>(
    `select id::text, dokumentum_url,
       (fuvardij is null) as hianyzik_fuvardij,
       (fizetesi_hatarido_nap is null) as hianyzik_fizetesi_hatarido,
       (postazasi_cim is null or trim(postazasi_cim) = '') as hianyzik_postazasi_cim
     from fuvar_megbizasok
     where tipus = 'sajat' and statusz <> 'torolt'
       and dokumentum_url is not null
       -- A reise_id-s (Duvenbeck) sorokat determinisztikusan olvastuk ki, a
       -- nyelvi modell nem tud hozzátenni. Kihagyásuk nélkül minden órában
       -- elvinnék az itteni 5 helyet a valóban hiányos sorok elől.
       and reise_id is null
       and (fuvardij is null or fizetesi_hatarido_nap is null
            or postazasi_cim is null or trim(postazasi_cim) = '')
     order by id desc
     limit ${MAX_POTLAS_SORONKENT}`
  );

  let potoltSorok = 0;
  for (const sor of hianyosSorok) {
    const fileId = fileIdFromViewUrl(sor.dokumentum_url);
    if (!fileId) continue;
    try {
      const meta = await drive.files.get({ fileId, fields: "id, name, mimeType" });
      if (!meta.data.mimeType) continue;
      const { szoveg } = await fajlSzovege(drive, {
        id: fileId,
        name: meta.data.name ?? sor.dokumentum_url,
        mimeType: meta.data.mimeType,
      });
      const kivont = await kivonatolFuvarAdatot(szoveg);
      if (!kivont) continue;
      let valamitPotoltunk = false;
      if (sor.hianyzik_fuvardij && kivont.fuvardij != null) {
        await setFuvarFuvardij(sor.id, kivont.fuvardij, normalizaltFuvardijPenznem(kivont.fuvardijPenznem));
        valamitPotoltunk = true;
      }
      if (sor.hianyzik_fizetesi_hatarido && kivont.fizetesiHataridoNap != null) {
        await setFuvarFizetesiHatarido(sor.id, kivont.fizetesiHataridoNap);
        valamitPotoltunk = true;
      }
      if (sor.hianyzik_postazasi_cim && kivont.postazasiCim) {
        await setFuvarPostazasiCim(sor.id, kivont.postazasiCim);
        valamitPotoltunk = true;
      }
      if (valamitPotoltunk) potoltSorok++;
    } catch (err) {
      hibak.push(`pótlás (${sor.id}): ${err instanceof Error ? err.message : "ismeretlen hiba"}`);
    }
  }
  return potoltSorok;
}

/**
 * A MÁR BEOLVASOTT sorok megrendelőjének helyesbítése a partner-sablonból.
 *
 * Miért kell: amíg egy megbízó nem szerepel a partnerek.ts listában, a
 * megrendelőt a nyelvi modell tippeli — és rendre a rakodóhely cégét írja
 * be (Ghibli N26/22795 és N26/22824: "Apollo Tyres (Hungary) Kft",
 * 2026-09-17). Amikor a partner utólag bekerül a listába, az ÚJ iratai már
 * jók lesznek, de a korábbi sorok rossz megrendelővel maradnának — és a
 * számla a rossz félnek szólna. A napló őrzi minden irat nyers szövegét,
 * abból az ujjlenyomat most is felismerhető: a sor megrendelője a partner
 * hivatalos neve lesz, a hiányzó fizetési határidő / postázási cím /
 * "nincs hivatkozás" jelölés a partner tartalékából pótlódik.
 *
 * Csak DB-munka (nincs Drive-letöltés, nincs nyelvi modell), és soronként
 * legfeljebb egyszer fut: a napló partner_kod mezője jelzi, melyik sablon
 * szerint helyesbítettük már — a partnerlista változásáig nem nyúl hozzá
 * újra, tehát egy kézi javítást sem ír felül óránként. A már kiszámlázott
 * sorokhoz nem nyúl: ott a kiállított számla a tény, ember döntsön.
 */
async function megrendelokHelyesbitese(hibak: string[], figyelmeztetesek: string[]): Promise<number> {
  const sorok = await query<{
    id: string;
    megrendelo: string | null;
    pozicioszam: string | null;
    partner_kod: string | null;
    drive_file_id: string;
    fajlnev: string | null;
    nyers_szoveg: string;
  }>(
    `select f.id::text, f.megrendelo, f.pozicioszam,
            n.partner_kod, n.drive_file_id, n.fajlnev, n.nyers_szoveg
       from fuvar_megbizasok f
       join fuvar_import_naplo n on n.fuvar_id = f.id
      where f.forras = 'pdf_import'
        and f.statusz <> 'torolt'
        and coalesce(f.szamla_szam, '') = ''
        and n.nyers_szoveg is not null
        and n.olvaso is distinct from 'duvenbeck'
      order by f.id`
  );
  let helyesbitett = 0;
  for (const sor of sorok) {
    try {
      const partner = felismerPartner(normalizaltSzoveg(sor.nyers_szoveg));
      if (!partner || partner.kod === sor.partner_kod) continue;
      const regi = sor.megrendelo ?? "";
      const nevValtozik = normalizaltCegKulcs(regi) !== normalizaltCegKulcs(partner.nev);
      await query(
        `update fuvar_megbizasok
            set megrendelo = $2,
                fizetesi_hatarido_nap = coalesce(fizetesi_hatarido_nap, $3),
                postazasi_cim = case when coalesce(trim(postazasi_cim), '') = '' then $4 else postazasi_cim end,
                pozicioszam_nincs = pozicioszam_nincs or (pozicioszam is null and $5)
          where id = $1`,
        [sor.id, partner.nev, partner.fizetesiHataridoNap ?? null, partner.postazasiCim ?? null, !!partner.nincsHivatkozas]
      );
      await query(`update fuvar_import_naplo set partner_kod = $2, frissitve_at = now() where drive_file_id = $1`, [
        sor.drive_file_id,
        partner.kod,
      ]);
      if (nevValtozik) {
        helyesbitett++;
        figyelmeztetesek.push(
          `${sor.fajlnev ?? sor.drive_file_id}: a megrendelő „${regi || "—"}" helyett „${partner.nev}" (a partner-sablon szerint) — nézd át a sort.`
        );
      }
    } catch (err) {
      hibak.push(`megrendelő-helyesbítés (${sor.id}): ${err instanceof Error ? err.message : "ismeretlen hiba"}`);
    }
  }
  return helyesbitett;
}

/**
 * A teljes Drive-import lefutása: új fájlok felvitele + korábbi hiányos
 * sorok pótlása. Ugyanazt a két lépést végzi, mint eddig a Claude-routine +
 * a /api/fuvarozas/drive-import + drive-hianyok/drive-frissites páros —
 * csak most egy folyamaton belül, közvetlen adatbázis-hívásokkal (nincs
 * belső HTTP loopback), és Claude helyett egy olcsó OpenRouter-modellel.
 */
export async function vegrehajtDriveSync(): Promise<DriveSyncEredmeny> {
  const hibak: string[] = [];
  const drive = driveClient();
  const [uj, potoltSorok] = await Promise.all([
    ujFajlokFeldolgozasa(drive, hibak),
    hianyokPotlasa(drive, hibak),
  ]);
  // Az új iratok után, hogy a most felvett sorok naplója már megvan.
  const figyelmeztetesek = [...uj.figyelmeztetesek];
  const helyesbitettMegrendelok = await megrendelokHelyesbitese(hibak, figyelmeztetesek);
  return {
    ujFuvarok: uj.ujFuvarok,
    vizsgaltFajlok: uj.vizsgaltFajlok,
    osszefuzottDokumentumok: uj.osszefuzottDokumentumok,
    levaltottRegiSorok: uj.levaltottRegiSorok,
    elutasitottIratok: uj.elutasitottIratok,
    helyesbitettMegrendelok,
    figyelmeztetesek,
    potoltSorok,
    hibak,
  };
}
