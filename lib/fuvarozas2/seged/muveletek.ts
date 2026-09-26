// A segéd cselekvő köre (2. rész, 2026-09-26). A modell NEM ír: minden
// művelet először javaslat lesz (`seged_muvelet`, 013-as migráció), és csak
// akkor fut le, ha Zoltán a panelen jóváhagyja. A végrehajtás mindig egy
// meglévő, jogosultság-ellenőrzött függvényt hív — itt nincs saját UPDATE a
// fuvar-táblákon, csak a javaslatok naplója.
//
// NEM "use server" fájl: a lib/fuvarozas2/seged/seged.ts hívja a kérés
// kontextusában (a munkamenet és a jogosultság így érvényes).

import { query } from "@/lib/db";
import { ALLAPOTOK, ALLAPOT_CIMKE, type Allapot } from "@/lib/fuvarozas/allapot";
import { SAJAT_JARMUVEK, findJarmuByPlate, jarmuLabel } from "@/lib/fuvarozas/vehicles";
import { getMegbizas, setFuvarJarmu, setMegjegyzes, setPapirBeerkezett, setSzamlaSzam, valtAllapot } from "@/lib/fuvarozas2/megbizasok";
import { kocsiraAdom, mentSajatFuvart } from "@/lib/fuvarozas2/sajat-fuvar";
import { setLevelAllapot, setLevelOsztaly } from "@/lib/fuvarozas2/levelek";
import { getPartnerek, updatePartner } from "@/lib/fuvarozas2/partnerek";
import type { EszkozLeiras } from "@/lib/fuvarozas2/seged/eszkozok";

export type SegedMuveletAllapot = "javasolt" | "jovahagyva" | "elvetve" | "hiba";
export type SegedMuvelet = {
  id: string;
  eszkoz: string;
  osszefoglalo: string;
  megbizas_id: string | null;
  levelbol: boolean;
  allapot: SegedMuveletAllapot;
  eredmeny: string | null;
  created_at: string;
};

/** Egy válaszban legfeljebb ennyi javaslat — ne lehessen egy kattintással sok dolgot elintézni. */
export const MAX_MUVELET = 3;

const LEVEL_ALLAPOTOK = ["uj", "feldolgozva", "elvetve", "megvalaszolva"] as const;
const LEVEL_OSZTALYOK = [
  "megbizas", "modositas", "adatkeres", "okmanykeres", "papirok",
  "fizetes", "szamla_ertesito", "timocom", "reklam", "egyeb",
] as const;
const PARTNER_MEZOK = ["fizetesi_hatarido_nap", "papir_bekuldesi_hatarido_nap", "postazasi_cim", "szamlazasi_email", "megjegyzes"] as const;

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });
const JOVAHAGYAS = "NEM hajtja végre azonnal: javaslatot tesz, amit Zoltán a panelen hagy jóvá.";

export const MUVELET_ESZKOZOK: EszkozLeiras[] = [
  {
    type: "function",
    function: {
      name: "javasol_allapot_valtas",
      description: `Fuvar állapotának léptetése (jóváhagyás, kocsira adás után folyamatban, teljesítve, számlázható, postázva, lezárt). ${JOVAHAGYAS} Előbb nézd meg a fuvar_reszletei eszközzel, mely állapotok lehetségesek (kovetkezo_lehetseges_allapotok) — másba nem lép.`,
      parameters: obj(
        {
          id: { type: "string", description: "A fuvar azonosítója, pl. '281'." },
          hova: { type: "string", enum: [...ALLAPOTOK], description: "A cél állapot." },
          indok: { type: "string", description: "Egy rövid mondat, miért — a naplóba kerül." },
        },
        ["id", "hova"]
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "javasol_papir_beerkezett",
      description: `Az eredeti papír beérkezett ✓ (vagy a jelölés visszavonása) egy fuvaron. ${JOVAHAGYAS}`,
      parameters: obj({ id: { type: "string" }, be: { type: "boolean", description: "true: beérkezett, false: visszavonás." } }, ["id", "be"]),
    },
  },
  {
    type: "function",
    function: {
      name: "javasol_szamla_szam",
      description: `Számlaszám beírása a fuvarhoz (WLLWR-2026-NNN), vagy törlése. Ha a fuvar számlázható vagy teljesített, a beírás egyben számlázva állapotba lépteti. ${JOVAHAGYAS}`,
      parameters: obj({ id: { type: "string" }, szamla_szam: { type: "string", description: "A számlaszám; üres szöveg: törlés." } }, ["id", "szamla_szam"]),
    },
  },
  {
    type: "function",
    function: {
      name: "javasol_megjegyzes",
      description: `Megjegyzés írása a fuvarhoz (pl. amit a megbízó levélben pontosított). ${JOVAHAGYAS}`,
      parameters: obj(
        {
          id: { type: "string" },
          szoveg: { type: "string", description: "A megjegyzés szövege." },
          mod: { type: "string", enum: ["hozzafuz", "csere"], description: "hozzafuz (alap): a meglévő megjegyzés alá írja; csere: felülírja." },
        },
        ["id", "szoveg"]
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "javasol_sajat_fuvar",
      description: `Új saját fuvar (a saját raklapunk szállítása) előkészítése. A sofőr még nem látja, amíg nincs kocsira adva. ${JOVAHAGYAS}`,
      parameters: obj(
        {
          datum: { type: "string", description: "A fuvar napja, YYYY-MM-DD." },
          honnan: { type: "string" },
          hova: { type: "string" },
          kocsi: { type: "string", description: "Rendszám, pl. NMZ-492. Elhagyható, de kocsira adáshoz kell." },
          kitol: { type: "string", description: "Kitől visszük az árut." },
          kinek: { type: "string", description: "Kinek visszük (vevő)." },
          megjegyzes: { type: "string" },
        },
        ["datum", "honnan", "hova"]
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "javasol_kocsi",
      description: `Kocsi hozzárendelése egy fuvarhoz, vagy a kocsi levétele róla (üres rendszám). Erre van szükség, ha egy fuvar „kocsi nélkül” áll. Előkészítés alatti saját fuvarnál nem működik — ott az űrlap és a „Kocsira adom” a járható út. ${JOVAHAGYAS}`,
      parameters: obj(
        {
          id: { type: "string", description: "A fuvar azonosítója, pl. '281'." },
          kocsi: { type: "string", description: `Rendszám. Választható: ${SAJAT_JARMUVEK.filter((j) => j.rendszamok.length).map((j) => `${j.rendszamok[0]} (${j.sofor})`).join(", ")}. Üres szöveg: a kocsi levétele.` },
        },
        ["id", "kocsi"]
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "javasol_kocsira_adom",
      description: `Előkészített saját fuvar kocsira adása — onnantól a sofőr appjában van. Kell hozzá dátum, kocsi, honnan, hová. ${JOVAHAGYAS}`,
      parameters: obj({ id: { type: "string" } }, ["id"]),
    },
  },
  {
    type: "function",
    function: {
      name: "javasol_level_allapot",
      description: `Levél elintézettre / elvetettre / megválaszoltra állítása a Levelek fülön. ${JOVAHAGYAS}`,
      parameters: obj(
        { id: { type: "string", description: "A levél azonosítója a levelek eszközből." }, allapot: { type: "string", enum: [...LEVEL_ALLAPOTOK] } },
        ["id", "allapot"]
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "javasol_level_osztaly",
      description: `Levél osztályának javítása (pl. rosszul sorolta be a figyelő). ${JOVAHAGYAS}`,
      parameters: obj({ id: { type: "string" }, osztaly: { type: "string", enum: [...LEVEL_OSZTALYOK] } }, ["id", "osztaly"]),
    },
  },
  {
    type: "function",
    function: {
      name: "javasol_partner_adat",
      description: `Partner törzsadatának módosítása: fizetési határidő, papír-beküldési határidő, postázási cím, számlázási e-mail, megjegyzés. ${JOVAHAGYAS}`,
      parameters: obj(
        {
          nev: { type: "string", description: "A partner nevének része, pl. 'eucargo'." },
          mezo: { type: "string", enum: [...PARTNER_MEZOK] },
          ertek: { type: "string", description: "Az új érték; a határidőknél szám (nap). Üres szöveg: törlés." },
        },
        ["nev", "mezo", "ertek"]
      ),
    },
  },
];

export const MUVELET_NEVEK: ReadonlySet<string> = new Set(MUVELET_ESZKOZOK.map((e) => e.function.name));

type Args = Record<string, unknown>;
const szoveg = (a: Args, k: string) => (typeof a[k] === "string" ? (a[k] as string).trim() : "");

type Javaslat = { osszefoglalo: string; argumentumok: Args; megbizasId?: string; ellenorzo?: Record<string, unknown> };
type Keszites = { ok: true; javaslat: Javaslat } | { ok: false; hiba: string };

type FuvarSor = {
  id: string;
  jelleg: "ber" | "sajat";
  allapot: Allapot;
  megrendelo: string | null;
  felrako: string;
  lerako: string;
  elokeszites: boolean;
};

async function fuvar(id: string): Promise<FuvarSor | null> {
  if (!/^\d+$/.test(id)) return null;
  const [s] = await query<FuvarSor>(
    `select id::text, jelleg, allapot, megrendelo, felrako, lerako, elokeszites
     from fuvar_megbizasok where id = $1 and torolt_at is null`,
    [id]
  );
  return s ?? null;
}

const fuvarCimke = (s: FuvarSor) =>
  `#${s.id} ${s.megrendelo ?? (s.jelleg === "sajat" ? "saját fuvar" : "—")} (${s.felrako.slice(0, 40)} → ${s.lerako.slice(0, 40)})`;

/** Az argumentumokból emberi összefoglaló és ellenőrző pillanatkép — végrehajtás nélkül. */
async function keszit(nev: string, a: Args): Promise<Keszites> {
  switch (nev) {
    case "javasol_allapot_valtas": {
      const id = szoveg(a, "id").replace(/^#/, "");
      const hova = szoveg(a, "hova") as Allapot;
      if (!ALLAPOTOK.includes(hova)) return { ok: false, hiba: "Ismeretlen állapot." };
      const s = await fuvar(id);
      if (!s) return { ok: false, hiba: `Nincs #${id} fuvar.` };
      if (s.allapot === hova) return { ok: false, hiba: `A(z) #${id} már ${ALLAPOT_CIMKE[hova]} állapotban van.` };
      // Az állapotgép a döntőbíró: amit a részletekben sem lehet kattintani, azt
      // a segéd sem javasolhatja (a kézi kiskapukat Zoltán nyitja, nem a modell).
      const r = await getMegbizas(id);
      if (r && !r.celok.includes(hova)) {
        return { ok: false, hiba: `A(z) #${id} most nem léphet ${ALLAPOT_CIMKE[hova]} állapotba. Lehetséges: ${r.celok.map((c) => ALLAPOT_CIMKE[c]).join(", ") || "semmi"}.` };
      }
      const indok = szoveg(a, "indok");
      return {
        ok: true,
        javaslat: {
          osszefoglalo: `${fuvarCimke(s)}: ${ALLAPOT_CIMKE[s.allapot]} → ${ALLAPOT_CIMKE[hova]}${indok ? ` — ${indok}` : ""}`,
          argumentumok: { id, hova, indok: indok || null },
          megbizasId: id,
          ellenorzo: { allapot: s.allapot },
        },
      };
    }
    case "javasol_papir_beerkezett": {
      const id = szoveg(a, "id").replace(/^#/, "");
      const s = await fuvar(id);
      if (!s) return { ok: false, hiba: `Nincs #${id} fuvar.` };
      const be = a.be !== false;
      return {
        ok: true,
        javaslat: {
          osszefoglalo: `${fuvarCimke(s)}: az eredeti papír ${be ? "beérkezett ✓" : "beérkezése visszavonva"}`,
          argumentumok: { id, be },
          megbizasId: id,
          ellenorzo: { allapot: s.allapot },
        },
      };
    }
    case "javasol_szamla_szam": {
      const id = szoveg(a, "id").replace(/^#/, "");
      const s = await fuvar(id);
      if (!s) return { ok: false, hiba: `Nincs #${id} fuvar.` };
      const szam = szoveg(a, "szamla_szam");
      return {
        ok: true,
        javaslat: {
          osszefoglalo: szam ? `${fuvarCimke(s)}: számlaszám = ${szam}` : `${fuvarCimke(s)}: a számlaszám törlése`,
          argumentumok: { id, szamla_szam: szam || null },
          megbizasId: id,
          ellenorzo: { allapot: s.allapot },
        },
      };
    }
    case "javasol_megjegyzes": {
      const id = szoveg(a, "id").replace(/^#/, "");
      const s = await fuvar(id);
      if (!s) return { ok: false, hiba: `Nincs #${id} fuvar.` };
      const uj = szoveg(a, "szoveg");
      if (!uj) return { ok: false, hiba: "Üres megjegyzés." };
      const mod = szoveg(a, "mod") === "csere" ? "csere" : "hozzafuz";
      return {
        ok: true,
        javaslat: {
          osszefoglalo: `${fuvarCimke(s)}: megjegyzés ${mod === "csere" ? "felülírása" : "hozzáírása"} — „${uj.slice(0, 200)}”`,
          argumentumok: { id, szoveg: uj.slice(0, 2000), mod },
          megbizasId: id,
          ellenorzo: { allapot: s.allapot },
        },
      };
    }
    case "javasol_sajat_fuvar": {
      const datum = szoveg(a, "datum");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return { ok: false, hiba: "A dátum YYYY-MM-DD alakban kell." };
      const honnan = szoveg(a, "honnan");
      const hova = szoveg(a, "hova");
      if (!honnan || !hova) return { ok: false, hiba: "A honnan és a hová kötelező." };
      const kocsi = szoveg(a, "kocsi");
      if (kocsi && !findJarmuByPlate(kocsi)) return { ok: false, hiba: `Ismeretlen kocsi: ${kocsi}.` };
      const kinek = szoveg(a, "kinek");
      const kitol = szoveg(a, "kitol");
      return {
        ok: true,
        javaslat: {
          osszefoglalo: `Új saját fuvar előkészítése: ${datum}, ${honnan} → ${hova}${kocsi ? `, kocsi: ${kocsi}` : ", kocsi nélkül"}${kinek ? `, kinek: ${kinek}` : ""}${kitol ? `, kitől: ${kitol}` : ""}`,
          argumentumok: { datum, honnan, hova, kocsi: kocsi || null, kinek: kinek || null, kitol: kitol || null, megjegyzes: szoveg(a, "megjegyzes") || null },
        },
      };
    }
    case "javasol_kocsi": {
      const id = szoveg(a, "id").replace(/^#/, "");
      const s = await fuvar(id);
      if (!s) return { ok: false, hiba: `Nincs #${id} fuvar.` };
      if (s.elokeszites) return { ok: false, hiba: `A(z) #${id} előkészítésben van — ott az űrlapon állítsd a kocsit, aztán „Kocsira adom”.` };
      const kocsi = szoveg(a, "kocsi");
      const jarmu = kocsi ? findJarmuByPlate(kocsi) : null;
      if (kocsi && !jarmu) return { ok: false, hiba: `Ismeretlen kocsi: ${kocsi}.` };
      return {
        ok: true,
        javaslat: {
          osszefoglalo: jarmu ? `${fuvarCimke(s)}: kocsi = ${jarmuLabel(jarmu)}` : `${fuvarCimke(s)}: a kocsi levétele`,
          argumentumok: { id, kocsi: kocsi || null },
          megbizasId: id,
          ellenorzo: { allapot: s.allapot },
        },
      };
    }
    case "javasol_kocsira_adom": {
      const id = szoveg(a, "id").replace(/^#/, "");
      const s = await fuvar(id);
      if (!s) return { ok: false, hiba: `Nincs #${id} fuvar.` };
      if (!s.elokeszites) return { ok: false, hiba: `A(z) #${id} már kocsin van.` };
      return {
        ok: true,
        javaslat: {
          osszefoglalo: `${fuvarCimke(s)}: kocsira adás — onnantól a sofőr látja`,
          argumentumok: { id },
          megbizasId: id,
          ellenorzo: { elokeszites: true },
        },
      };
    }
    case "javasol_level_allapot":
    case "javasol_level_osztaly": {
      const id = szoveg(a, "id");
      if (!/^\d+$/.test(id)) return { ok: false, hiba: "Érvénytelen levél-azonosító." };
      const [l] = await query<{ felado: string; targy: string | null; allapot: string }>(
        `select felado, targy, allapot from fuvar_level where id = $1`,
        [id]
      );
      if (!l) return { ok: false, hiba: "Nincs ilyen levél." };
      const cimke = `„${(l.targy ?? "tárgy nélkül").slice(0, 60)}” (${l.felado})`;
      if (nev === "javasol_level_allapot") {
        const allapot = szoveg(a, "allapot");
        if (!LEVEL_ALLAPOTOK.includes(allapot as (typeof LEVEL_ALLAPOTOK)[number])) return { ok: false, hiba: "Ismeretlen levél-állapot." };
        return { ok: true, javaslat: { osszefoglalo: `Levél ${cimke}: állapot → ${allapot}`, argumentumok: { id, allapot }, ellenorzo: { level_allapot: l.allapot } } };
      }
      const osztaly = szoveg(a, "osztaly");
      if (!LEVEL_OSZTALYOK.includes(osztaly as (typeof LEVEL_OSZTALYOK)[number])) return { ok: false, hiba: "Ismeretlen levél-osztály." };
      return { ok: true, javaslat: { osszefoglalo: `Levél ${cimke}: osztály → ${osztaly}`, argumentumok: { id, osztaly }, ellenorzo: { level_allapot: l.allapot } } };
    }
    case "javasol_partner_adat": {
      const nevReszlet = szoveg(a, "nev").toLowerCase();
      const mezo = szoveg(a, "mezo");
      if (!PARTNER_MEZOK.includes(mezo as (typeof PARTNER_MEZOK)[number])) return { ok: false, hiba: "Ezt a partner-mezőt a segéd nem írhatja." };
      const partnerek = await getPartnerek();
      const talalat = partnerek.filter((p) => [p.nev, ...p.nevvaltozatok].some((n) => n.toLowerCase().includes(nevReszlet)));
      if (talalat.length === 0) return { ok: false, hiba: `Nincs „${nevReszlet}” nevű partner.` };
      if (talalat.length > 1) return { ok: false, hiba: `Több partner illeszkedik (${talalat.slice(0, 4).map((p) => p.nev).join(", ")}) — pontosítsd a nevet.` };
      const p = talalat[0];
      const ertekSzoveg = szoveg(a, "ertek");
      const szamMezo = mezo.endsWith("_nap");
      if (szamMezo && ertekSzoveg && !/^\d{1,3}$/.test(ertekSzoveg)) return { ok: false, hiba: "A határidő napok száma (0–999)." };
      const regi = (p as unknown as Record<string, unknown>)[mezo];
      return {
        ok: true,
        javaslat: {
          osszefoglalo: `${p.nev}: ${mezo} ${regi == null || regi === "" ? "(üres)" : String(regi).slice(0, 60)} → ${ertekSzoveg || "(üres)"}`,
          argumentumok: { partner_id: p.id, partner_nev: p.nev, mezo, ertek: ertekSzoveg || null },
        },
      };
    }
    default:
      return { ok: false, hiba: `Ismeretlen művelet: ${nev}` };
  }
}

/** A modell művelet-hívása: javaslat a naplóba, végrehajtás nélkül. */
export async function keszitJavaslatot(
  nev: string,
  argumentumok: string,
  ctx: { userId: string; levelbol: boolean }
): Promise<{ ok: true; muvelet: SegedMuvelet } | { ok: false; hiba: string }> {
  let a: Args = {};
  try {
    a = argumentumok ? (JSON.parse(argumentumok) as Args) : {};
  } catch {
    return { ok: false, hiba: "Az argumentum nem érvényes JSON." };
  }
  const k = await keszit(nev, a);
  if (!k.ok) return k;
  const j = k.javaslat;
  const [sor] = await query<SegedMuvelet>(
    `insert into seged_muvelet (user_id, eszkoz, argumentumok, osszefoglalo, megbizas_id, ellenorzo, levelbol)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id::text, eszkoz, osszefoglalo, megbizas_id::text, levelbol, allapot, eredmeny, created_at::text`,
    [ctx.userId, nev, JSON.stringify(j.argumentumok), j.osszefoglalo, j.megbizasId ?? null, JSON.stringify(j.ellenorzo ?? {}), ctx.levelbol]
  );
  return { ok: true, muvelet: sor };
}

/** Amit a modell a művelet-hívásra visszakap — sosem az, hogy „megtörtént”. */
export function javaslatVisszajelzes(m: SegedMuvelet): string {
  return JSON.stringify({
    rendben: true,
    allapot: "jóváhagyásra vár",
    osszefoglalo: m.osszefoglalo,
    megjegyzes: "A művelet MÉG NEM történt meg: Zoltán jóváhagyó gombja indítja. A válaszban így írd le: mit fogsz tenni, ha jóváhagyja.",
  });
}

type MuveletRow = SegedMuvelet & { argumentumok: Args; ellenorzo: Record<string, unknown> };

async function ellenorzoBaj(m: MuveletRow): Promise<string | null> {
  if (typeof m.ellenorzo.allapot === "string" && m.megbizas_id) {
    const s = await fuvar(m.megbizas_id);
    if (!s) return "A fuvar közben törlődött.";
    if (s.allapot !== m.ellenorzo.allapot) return `A fuvar állapota közben megváltozott (${ALLAPOT_CIMKE[s.allapot]}) — nézd meg újra.`;
  }
  if (m.ellenorzo.elokeszites === true && m.megbizas_id) {
    const s = await fuvar(m.megbizas_id);
    if (!s) return "A fuvar közben törlődött.";
    if (!s.elokeszites) return "A fuvar közben kikerült az előkészítésből.";
  }
  if (typeof m.ellenorzo.level_allapot === "string") {
    const [l] = await query<{ allapot: string }>(`select allapot from fuvar_level where id = $1`, [String(m.argumentumok.id)]);
    if (!l) return "A levél közben eltűnt.";
    if (l.allapot !== m.ellenorzo.level_allapot) return `A levél állapota közben megváltozott (${l.allapot}).`;
  }
  return null;
}

async function futtat(m: MuveletRow): Promise<{ ok: true; eredmeny: string } | { ok: false; hiba: string }> {
  const a = m.argumentumok;
  const id = String(a.id ?? "");
  switch (m.eszkoz) {
    case "javasol_allapot_valtas": {
      const r = await valtAllapot(id, a.hova as Allapot, { megjegyzes: typeof a.indok === "string" ? a.indok : undefined });
      return r.ok ? { ok: true, eredmeny: `#${id}: ${ALLAPOT_CIMKE[r.allapot]}` } : { ok: false, hiba: r.hiba };
    }
    case "javasol_papir_beerkezett":
      await setPapirBeerkezett(id, a.be === true);
      return { ok: true, eredmeny: `#${id}: papír ${a.be === true ? "beérkezett" : "visszavonva"}` };
    case "javasol_szamla_szam": {
      const r = await setSzamlaSzam(id, typeof a.szamla_szam === "string" ? a.szamla_szam : null);
      return r.ok ? { ok: true, eredmeny: `#${id}: számlaszám ${a.szamla_szam ?? "törölve"}` } : { ok: false, hiba: r.hiba };
    }
    case "javasol_megjegyzes": {
      const uj = String(a.szoveg ?? "");
      const [s] = await query<{ megjegyzes: string | null }>(`select megjegyzes from fuvar_megbizasok where id = $1`, [id]);
      const vegso = a.mod === "csere" || !s?.megjegyzes?.trim() ? uj : `${s.megjegyzes.trim()}\n${uj}`;
      await setMegjegyzes(id, vegso);
      return { ok: true, eredmeny: `#${id}: megjegyzés mentve` };
    }
    case "javasol_sajat_fuvar": {
      const r = await mentSajatFuvart(null, {
        datum: String(a.datum ?? ""),
        jarmuKod: (a.kocsi as string | null) ?? null,
        honnan: String(a.honnan ?? ""),
        hova: String(a.hova ?? ""),
        kitol: (a.kitol as string | null) ?? null,
        kinek: (a.kinek as string | null) ?? null,
        megjegyzes: (a.megjegyzes as string | null) ?? null,
      });
      return r.ok ? { ok: true, eredmeny: `#${r.id}: saját fuvar előkészítve` } : { ok: false, hiba: r.hiba };
    }
    case "javasol_kocsi": {
      const r = await setFuvarJarmu(id, typeof a.kocsi === "string" ? a.kocsi : null);
      return r.ok ? { ok: true, eredmeny: `#${id}: kocsi ${r.cimke ?? "levéve"}` } : { ok: false, hiba: r.hiba };
    }
    case "javasol_kocsira_adom": {
      const r = await kocsiraAdom(id);
      return r.ok ? { ok: true, eredmeny: `#${id}: kocsira adva` } : { ok: false, hiba: r.hiba };
    }
    case "javasol_level_allapot":
      await setLevelAllapot(id, a.allapot as "uj" | "feldolgozva" | "elvetve" | "megvalaszolva");
      return { ok: true, eredmeny: `Levél: ${String(a.allapot)}` };
    case "javasol_level_osztaly":
      await setLevelOsztaly(id, a.osztaly as Parameters<typeof setLevelOsztaly>[1]);
      return { ok: true, eredmeny: `Levél: ${String(a.osztaly)}` };
    case "javasol_partner_adat": {
      const mezo = String(a.mezo);
      const nyers = a.ertek == null ? null : String(a.ertek);
      const ertek = mezo.endsWith("_nap") ? (nyers ? Number(nyers) : null) : nyers;
      await updatePartner(String(a.partner_id), { [mezo]: ertek });
      return { ok: true, eredmeny: `${String(a.partner_nev)}: ${mezo} = ${ertek ?? "(üres)"}` };
    }
    default:
      return { ok: false, hiba: `Ismeretlen művelet: ${m.eszkoz}` };
  }
}

const MUVELET_SQL = `select id::text, eszkoz, argumentumok, osszefoglalo, megbizas_id::text, ellenorzo, levelbol, allapot, eredmeny, created_at::text
                     from seged_muvelet`;

/**
 * Zoltán jóváhagyta: az ellenőrző pillanatkép után a meglévő függvény fut le.
 * Csak az hagyhatja jóvá, akinek a segédje javasolta (`user_id`).
 */
export async function vegrehajtMuveletet(id: string, userId: string, ki: string): Promise<{ ok: true; muvelet: SegedMuvelet } | { ok: false; hiba: string }> {
  const [m] = await query<MuveletRow>(`${MUVELET_SQL} where id = $1 and user_id = $2`, [id, userId]);
  if (!m) return { ok: false, hiba: "Nincs ilyen művelet." };
  if (m.allapot !== "javasolt") return { ok: false, hiba: "Ez a művelet már el van bírálva." };
  const baj = await ellenorzoBaj(m);
  if (baj) {
    await query(`update seged_muvelet set allapot = 'hiba', eredmeny = $2, dontes_at = now(), dontes_by = $3 where id = $1`, [id, baj, ki]);
    return { ok: false, hiba: baj };
  }
  let r: { ok: true; eredmeny: string } | { ok: false; hiba: string };
  try {
    r = await futtat(m);
  } catch (err) {
    r = { ok: false, hiba: err instanceof Error ? err.message : "ismeretlen hiba" };
  }
  const [sor] = await query<SegedMuvelet>(
    `update seged_muvelet set allapot = $2, eredmeny = $3, dontes_at = now(), dontes_by = $4 where id = $1
     returning id::text, eszkoz, osszefoglalo, megbizas_id::text, levelbol, allapot, eredmeny, created_at::text`,
    [id, r.ok ? "jovahagyva" : "hiba", r.ok ? r.eredmeny : r.hiba, ki]
  );
  return r.ok ? { ok: true, muvelet: sor } : { ok: false, hiba: r.hiba };
}

export async function elvetMuveletet(id: string, userId: string, ki: string): Promise<void> {
  await query(
    `update seged_muvelet set allapot = 'elvetve', dontes_at = now(), dontes_by = $3
     where id = $1 and user_id = $2 and allapot = 'javasolt'`,
    [id, userId, ki]
  );
}

/** A panel alsó listája: a jóváhagyásra váró és a legutóbb elintézett műveletek. */
export async function getMuveletek(userId: string): Promise<{ varakozo: SegedMuvelet[]; utolsok: SegedMuvelet[] }> {
  const sorok = await query<SegedMuvelet>(
    `select id::text, eszkoz, osszefoglalo, megbizas_id::text, levelbol, allapot, eredmeny, created_at::text
     from seged_muvelet where user_id = $1 order by id desc limit 40`,
    [userId]
  );
  return {
    varakozo: sorok.filter((m) => m.allapot === "javasolt").reverse(),
    utolsok: sorok.filter((m) => m.allapot !== "javasolt").slice(0, 10),
  };
}
