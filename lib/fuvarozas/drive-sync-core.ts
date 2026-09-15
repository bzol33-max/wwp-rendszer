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
import { sajatCegunkE, type FuvardijPenznem } from "@/lib/fuvarozas/fuvar-constants";
import { findJarmuByPlate, jarmuLabel } from "@/lib/fuvarozas/vehicles";
import {
  mentDuvenbeckDokumentumot,
  ismertDriveFileIdk,
  ujUtonFeldolgozottFileIdk,
} from "@/lib/fuvarozas/duvenbeck-import";

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
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
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

/** A fájl szöveges tartalma — PDF-hez pdf-parse, DOCX-hez mammoth, Google Docs-hoz natív export. */
async function fajlSzovege(drive: ReturnType<typeof driveClient>, file: DriveFile): Promise<string> {
  if (file.mimeType === "application/vnd.google-apps.document") {
    const res = await drive.files.export(
      { fileId: file.id, mimeType: "text/plain" },
      { responseType: "text" }
    );
    return String(res.data);
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
      return parsed.text;
    } finally {
      await parser.destroy();
    }
  }

  // .docx
  const mammoth = await import("mammoth");
  const parsed = await mammoth.extractRawText({ buffer });
  return parsed.value;
}

function driveViewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

/** A dokumentum_url-ből kinyeri a Drive fájl ID-t — a drive-hianyok pótló körhöz kell újra megtalálni a fájlt. */
function fileIdFromViewUrl(url: string): string | null {
  const m = url.match(/\/file\/d\/([^/]+)\//);
  return m ? m[1] : null;
}

/** Az LLM-től várt, kinyert megbízás-adatok — lásd a KIVONATOLASI_UTASITAS-t. */
type KivontFuvar = {
  isFuvarmegbizas: boolean;
  megrendelo: string | null;
  felrako: string | null;
  felrakasDatum: string | null;
  lerako: string | null;
  lerakasDatum: string | null;
  aru: string | null;
  mennyiseg: string | null;
  rendszamVagySofor: string | null;
  fuvardij: number | null;
  fuvardijPenznem: "Ft" | "EUR" | null;
  fizetesiHataridoNap: number | null;
  postazasiCim: string | null;
  pozicioszam: string | null;
  megjegyzes: string | null;
};

const KIVONATOLASI_UTASITAS = `Egy fuvarmegbízás-dokumentum (PDF/DOCX/Google Docs) szövege következik. Olvasd ki belőle ALAPOSAN az alábbi mezőket, és VÁLASZOLJ KIZÁRÓLAG egyetlen, érvényes JSON objektummal (ne írj mást, ne használj markdown code fence-t):

{
  "isFuvarmegbizas": boolean, // false, ha a szöveg NYILVÁNVALÓAN nem fuvarmegbízás (pl. számla, összesítő táblázat)
  "megrendelo": string|null, // a fuvart kiadó partner (MEGBÍZÓ) cégneve — FIGYELEM: a sablonok a megbízó és a megbízott adatait egymás mellé teszik ("Megbízó adatai: / Megbízott adatai:"), és a kiolvasott szövegben a két címke egy sorba csúszik. A "Well Worn Pallett Kft" / "Well-Worn Pallet Kft." MINDIG a megbízott (a fuvarozó, akinek a megbízást kiadták) — SOHA nem ő a megrendelő. Ha ezt a nevet látod, a MÁSIK cég a megrendelő.
  "felrako": string|null, // felrakás helye (város vagy teljes cím)
  "felrakasDatum": string|null, // ISO dátum ÉÉÉÉ-HH-NN — a felrakás dátuma
  "lerako": string|null, // lerakás helye
  "lerakasDatum": string|null, // ISO dátum ÉÉÉÉ-HH-NN, CSAK ha eltér a felrakás dátumától, egyébként null
  "aru": string|null, // áru megnevezése
  "mennyiseg": string|null, // mennyiség/súly szövegesen
  "rendszamVagySofor": string|null, // a dokumentumban szereplő jármű rendszáma VAGY sofőr neve, szó szerint, ha van
  "fuvardij": number|null, // a fuvardíj/ár/nettó díj/szállítási díj SZÁMÉRTÉKE (ne írj ezres elválasztót), akkor is keresd, ha nem "fuvardíj" címszó alatt szerepel
  "fuvardijPenznem": "Ft"|"EUR"|null, // a fuvardíj pénzneme
  "fizetesiHataridoNap": number|null, // fizetési határidő NAPOKBAN kifejezve (pl. "30 nap" -> 30), ne konkrét dátumot
  "postazasiCim": string|null, // ahová a fizikai dokumentumokat postázni kell — elsőbbség: kifejezett postázási cím > számlázási cím > megrendelő székhelye
  "pozicioszam": string|null, // a megbízó hivatkozási/pozíció száma, ha van
  "megjegyzes": string|null // bármi egyéb fontos infó egy rövid mondatban, vagy null
}

Csak akkor hagyj mezőt üresen (null), ha tényleg nem található a szövegben — ne találj ki adatot. Ha a dokumentum nyilvánvalóan nem fuvarmegbízás, "isFuvarmegbizas": false, a többi mező lehet null.`;

function parseJsonValasz(nyers: string): KivontFuvar | null {
  const eleje = nyers.indexOf("{");
  const vege = nyers.lastIndexOf("}");
  if (eleje === -1 || vege === -1 || vege < eleje) return null;
  try {
    return JSON.parse(nyers.slice(eleje, vege + 1)) as KivontFuvar;
  } catch {
    return null;
  }
}

async function kivonatolFuvarAdatot(szoveg: string): Promise<KivontFuvar | null> {
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

/** A kivont "rendszamVagySofor" szöveg alapján megkeresi a hozzá tartozó saját jármű kanonikus címkéjét, ha van egyezés. */
function resolveJarmuMezo(rendszamVagySofor: string | null): string | undefined {
  if (!rendszamVagySofor) return undefined;
  const jarmu = findJarmuByPlate(rendszamVagySofor);
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

/** Új fuvarmegbízás-fájlok felvitele — az /api/fuvarozas/drive-import által eddig végzett lépés, Claude helyett közvetlenül. */
async function ujFajlokFeldolgozasa(
  drive: ReturnType<typeof driveClient>,
  hibak: string[]
): Promise<{
  ujFuvarok: number;
  vizsgaltFajlok: number;
  osszefuzottDokumentumok: number;
  levaltottRegiSorok: number;
  figyelmeztetesek: string[];
}> {
  const [fajlok, ismertUrlak, ismertFileIdk, ujUtonKeszek] = await Promise.all([
    listazDriveFajlok(drive),
    ismertDokumentumUrlak(),
    ismertDriveFileIdk(),
    ujUtonFeldolgozottFileIdk(),
  ]);
  let ujFuvarok = 0;
  let osszefuzottDokumentumok = 0;
  let levaltottRegiSorok = 0;
  const figyelmeztetesek: string[] = [];
  for (const file of fajlok) {
    const url = driveViewUrl(file.id);
    // A fájl-ID a megbízhatóbb jel: egy meglévő fuvarhoz CSATOLT dokumentum
    // (pl. a megbízás rakománylistája) nem a fuvar dokumentum_url-je, de
    // ettől még fel van dolgozva — a fuvar_dokumentumok tábla tudja.
    const regiUtonIsmert = ismertUrlak.has(url) || ismertFileIdk.has(file.id);
    const duvenbeckUjrafeldolgozando = DUVENBECK_FAJLNEV.test(file.name) && !ujUtonKeszek.has(file.id);
    if (regiUtonIsmert && !duvenbeckUjrafeldolgozando) continue;
    try {
      const szoveg = await fajlSzovege(drive, file);
      if (!szoveg.trim()) continue;

      // A Duvenbeck gépi sablonját determinisztikusan olvassuk ki — lásd
      // lib/fuvarozas/duvenbeck.ts. Ha felismerte, nyelvi modellre nincs
      // szükség (és nem is szabad: a hasábos PDF-et rendre félreolvasta).
      const duvenbeck = await mentDuvenbeckDokumentumot(szoveg, {
        id: file.id,
        name: file.name,
        url,
      });
      if (duvenbeck) {
        if (duvenbeck.statusz === "uj") ujFuvarok++;
        else if (duvenbeck.statusz === "osszefuzve") osszefuzottDokumentumok++;
        levaltottRegiSorok += duvenbeck.levaltottSorok;
        for (const szamla of duvenbeck.szamlazottRegiSorok) {
          figyelmeztetesek.push(
            `${file.name}: ehhez a fuvarhoz már van kiállított számla (${szamla}), ezért nem vettük fel újra — nézd át kézzel.`
          );
        }
        continue;
      }

      // Egy már ismert, de nem Duvenbeck-iratot nem adunk oda újra a nyelvi
      // modellnek: az csak duplikált sort csinálna belőle.
      if (regiUtonIsmert) continue;

      const kivont = await kivonatolFuvarAdatot(szoveg);
      if (!kivont || !kivont.isFuvarmegbizas || !kivont.lerako || !kivont.felrakasDatum) continue;
      // Ha a modell MINKET írt megrendelőnek, a mezőt inkább üresen hagyjuk —
      // lásd sajatCegunkE. A hiányzó megrendelő javítható, a rossz megrendelő
      // rossz félnek kiállított számlát jelentene.
      const megrendelo = sajatCegunkE(kivont.megrendelo) ? undefined : kivont.megrendelo || undefined;
      await addFuvar({
        tipus: "sajat",
        datum: kivont.felrakasDatum,
        lerako: kivont.lerako,
        felrako: kivont.felrako || undefined,
        megrendelo,
        aru: kivont.aru || undefined,
        mennyiseg: kivont.mennyiseg || undefined,
        jarmu: resolveJarmuMezo(kivont.rendszamVagySofor),
        sofor: kivont.rendszamVagySofor || undefined,
        fuvardij: kivont.fuvardij ?? undefined,
        fuvardijPenznem: normalizaltFuvardijPenznem(kivont.fuvardijPenznem),
        fizetesiHataridoNap: kivont.fizetesiHataridoNap ?? undefined,
        postazasiCim: kivont.postazasiCim || undefined,
        pozicioszam: kivont.pozicioszam || undefined,
        megjegyzes: kivont.megjegyzes || undefined,
        lerakasDatum: kivont.lerakasDatum || undefined,
        dokumentumUrl: url,
        driveFileId: file.id,
        forras: "pdf_import",
        ellenorzott: false,
      });
      ujFuvarok++;
    } catch (err) {
      hibak.push(`${file.name}: ${err instanceof Error ? err.message : "ismeretlen hiba"}`);
    }
  }
  return { ujFuvarok, vizsgaltFajlok: fajlok.length, osszefuzottDokumentumok, levaltottRegiSorok, figyelmeztetesek };
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
      const szoveg = await fajlSzovege(drive, {
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
  return {
    ujFuvarok: uj.ujFuvarok,
    vizsgaltFajlok: uj.vizsgaltFajlok,
    osszefuzottDokumentumok: uj.osszefuzottDokumentumok,
    levaltottRegiSorok: uj.levaltottRegiSorok,
    figyelmeztetesek: uj.figyelmeztetesek,
    potoltSorok,
    hibak,
  };
}
