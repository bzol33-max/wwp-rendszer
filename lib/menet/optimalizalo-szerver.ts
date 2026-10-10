import "server-only";
import { query, withTransaction } from "@/lib/db";
import { calculateToll } from "@/lib/fuvarozas/utdijkalkulacio";
import { geokodolCachelve } from "@/lib/fuvarozas/erintes-felismeres";
import { getJarmuIndulasiTelephely } from "@/lib/fuvarozas/telephelyek-db";
import { getJarmuvek } from "@/lib/fuvarozas/jarmuvek-db";
import { getFuvarBeallitasok, type FuvarBeallitasok } from "@/lib/beallitasok/fuvar";
import { gazolajArKedvezmennyel } from "@/lib/fuvarozas/gazolaj";
import { mertFogyasztas } from "@/lib/fuvarozas2/kalkulator-szamitas";
import { budapestNapISO } from "@/lib/fuvarozas/idozona";
import { varosNev } from "@/lib/fuvarozas/varos";
import { getMenet, getMenetById, getMenetek } from "@/lib/menet/repo";
import { cimparHiba, frissitMenetJavaslatot, megbizasMunka, menetAdat, szerverTav } from "@/lib/menet/generalas";
import { hugoVagyBecsles, ujHugoKor, type HugoKor } from "@/lib/menet/hugo-megszakito";
import { atrendezMenet, type Valasz } from "@/lib/menet/muveletek";
import { KOZUTI_SZORZO, legvonalKm, megbizasSorrend } from "@/lib/menet/menet-alap";
import {
  TELJES_BEJARAS_MAX,
  bemenetUjjlenyomat,
  erdemesJavasolni,
  feladatSorrendJavaslatbol,
  javasolHozzarendelest,
  optParamBeallitasbol,
  optimalizalSorrendet,
  type Celfuggveny,
  type KocsiNap,
  type OptBemenet,
  type OptJavaslatNezet,
  type OptParam,
  type Szakasz,
  type SzakaszFn,
} from "@/lib/menet/optimalizalo";
import type { Hely, Menet, MenetMunka, Pont } from "@/lib/menet/tipusok";

// Menetterv — az optimalizáló szerveroldala (4. fázis). A tiszta számítás:
// lib/menet/optimalizalo.ts. Ez gyűjti a bemenetet (a menetterv
// adatgyűjtését használja: lib/menet/generalas.ts menetAdat), számol, és
// 'nyitott' javaslatot ír az optimalizalo_javaslat táblába — CSAK ha legalább
// 1 000 Ft-ot vagy 5 km-t hoz (vagy a mostani terv sért egy kemény korlátot).
// A régebbi nyitott javaslat 'elavult', ha a bemenet ujjlenyomata változott.
//
// Elfogadás: jóváhagyott / folyamatban lévő menetnél KIZÁRÓLAG a meglévő
// átrendezés-úton (atrendezMenet: optimista verzió, indok „optimalizáló
// javaslat #id”, menet_esemeny + fuvar_valtozas napló); 'javaslat' menetnél
// a javaslat újragenerálódik ebben a sorrendben, és 'javaslat' marad (a
// tulajdonos külön hagyja jóvá). Jog nélküli mag — a jogot a
// lib/menet/optimalizalo-akciok.ts ellenőrzi.

const AZONOSITO = /^\d+$/;

// ---------------------------------------------------------------- távolság, paraméterek

/**
 * Szerveroldali szakasz: HU-GO útvonal (J5, EURO6, 40 t; a kulso-hivas
 * gyorsítótárával) km-rel, menetidővel és bruttó útdíjjal; ha az nem érhető
 * el, légvonal × 1,3 'becsles' jelöléssel (útdíj és menetidő nélkül — azt az
 * optimalizáló a flottaátlagból / átlagsebességből adja). Körönként memoizált;
 * a `kor` megszakítója az első HU-GO időtúllépés / hálózati hiba (vagy a
 * hívás-/időkeret) után a kör hátralévő részére becslésre vált.
 */
export function szerverSzakasz(kor: HugoKor = ujHugoKor()): SzakaszFn {
  const pontCache = new Map<string, Pont | null>();
  const cache = new Map<string, Szakasz | null>();
  async function pont(h: Hely): Promise<Pont | null> {
    if (h.pont) return h.pont;
    const cim = h.cim?.trim();
    if (!cim) return null;
    if (!pontCache.has(cim)) {
      const g = await geokodolCachelve(cim).catch(() => null);
      pontCache.set(cim, g ? { lat: g.lat, lon: g.lon } : null);
    }
    return pontCache.get(cim) ?? null;
  }
  return async (a, b) => {
    const [p, q] = await Promise.all([pont(a), pont(b)]);
    if (!p || !q) return null;
    const kulcs = `${p.lat.toFixed(4)},${p.lon.toFixed(4)}→${q.lat.toFixed(4)},${q.lon.toFixed(4)}`;
    if (cache.has(kulcs)) return cache.get(kulcs)!;
    let ki: Szakasz;
    if (legvonalKm(p, q) < 0.5) ki = { km: 0, perc: 0, utdijFt: 0, forras: "hugo" };
    else {
      const r = await hugoVagyBecsles<Szakasz>(
        kor,
        async () => {
          const t = await calculateToll({ points: [p, q], vehicleCategory: "J5", euroCategory: "EURO6", weight: 40 });
          return { km: t.distanceKm, perc: t.durationMin, utdijFt: t.tollHuf?.grossTotal ?? 0, forras: "hugo" };
        },
        () => ({ km: Math.round(legvonalKm(p, q) * KOZUTI_SZORZO), perc: null, utdijFt: null, forras: "becsles" }),
        { cimparHiba }
      );
      ki = r.ertek;
    }
    cache.set(kulcs, ki);
    return ki;
  };
}

/** Egy kör közös adatai: beállítások, gázolajár, flottaátlag útdíj, kocsinkénti fogyasztás és távolság. */
export type OptKor = {
  beallitas: FuvarBeallitasok;
  gazolajFtL: number;
  utdijPerKmFt: number;
  fogyasztas: Map<string, number>;
  szakasz: SzakaszFn;
};

export async function ujOptKor(hugo: HugoKor = ujHugoKor()): Promise<OptKor> {
  const beallitas = await getFuvarBeallitasok();
  const gazolajFtL = await gazolajArKedvezmennyel().then((g) => g.ar).catch(() => beallitas.gazolaj_ar_tartalek_ft - beallitas.tankolasi_kedvezmeny_ft_l);
  // Útdíj flottaátlag (Ft/km) a tárolt kalkulációkból (90 nap); ha nincs: 120 Ft/km (mint a Tervezésben).
  let utdijPerKmFt = 120;
  try {
    const [r] = await query<{ utdij: number | null; km: number | null }>(
      `select sum((eredmeny->>'rakottUtdijFt')::numeric)::float8 as utdij, sum((eredmeny->>'rakottKm')::numeric)::float8 as km
         from fuvar_kalkulacio where eredmeny is not null and szamolva_at > now() - interval '90 days'`
    );
    if (r?.km && r.km > 0 && r.utdij != null) utdijPerKmFt = Math.round(Number(r.utdij) / Number(r.km));
  } catch {
    // marad a 120 Ft/km
  }
  return { beallitas, gazolajFtL, utdijPerKmFt, fogyasztas: new Map(), szakasz: szerverSzakasz(hugo) };
}

async function kocsiParam(kor: OptKor, jarmuKod: string): Promise<OptParam> {
  if (!kor.fogyasztas.has(jarmuKod)) {
    const f = await mertFogyasztas(jarmuKod, kor.beallitas).catch(() => null);
    kor.fogyasztas.set(jarmuKod, f?.l100 ?? kor.beallitas.fogyasztas_alap_l_100km);
  }
  return optParamBeallitasbol(kor.beallitas, { gazolajFtL: kor.gazolajFtL, utdijPerKmFt: kor.utdijPerKmFt, fogyasztasL100: kor.fogyasztas.get(jarmuKod) });
}

async function hazaHely(jarmuKod: string): Promise<Hely | null> {
  try {
    const t = await getJarmuIndulasiTelephely(jarmuKod);
    return { cim: t.cim, pont: t.lat != null && t.lon != null ? { lat: Number(t.lat), lon: Number(t.lon) } : null };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- bemenet egy menetre

type MenetBemenet = { be: OptBemenet; ujjlenyomat: string; jarmuKod: string };

/**
 * Az optimalizáló bemenete egy menetre. Jóváhagyott menetnél csak a menet
 * munkái (az átrendezés csak ezeket rendezheti); javaslat-menetnél a kocsi
 * napjának minden munkája. Rögzített: a lezárt menet-feladatok munkái.
 */
async function menetBemenet(menet: Menet, kor: Pick<OptKor, "szakasz"> & Partial<OptKor>, param: OptParam | null): Promise<MenetBemenet | null> {
  const adat = await menetAdat(menet.jarmuId, menet.nap);
  if (!adat) return null;
  const jelenlegiSorrend = megbizasSorrend(menet.feladatok);
  const menetben = new Set(jelenlegiSorrend);
  const munkak: MenetMunka[] = menet.allapot === "javaslat" ? adat.munkak : adat.munkak.filter((m) => menetben.has(m.id));
  const rogzitett = menet.feladatok.flatMap((f) => (f.lezarvaAt && f.megbizasId ? [f.megbizasId] : []));
  const ujjlenyomat = bemenetUjjlenyomat({ nap: menet.nap, munkak, jelenlegiSorrend, rogzitett, indulas: adat.indulas, kapacitas: adat.kapacitas, menetVerzio: menet.verzio });
  const be: OptBemenet = {
    nap: menet.nap,
    munkak,
    jelenlegiSorrend,
    rogzitett,
    indulas: adat.indulas,
    haza: await hazaHely(adat.jarmuKod),
    telephelyek: adat.telephelyek,
    kapacitas: adat.kapacitas,
    // Az ujjlenyomathoz (elfogadáskor) nem kell paraméter — ott egy helykitöltő megy.
    param: param ?? optParamBeallitasbol(await getFuvarBeallitasok(), { gazolajFtL: 0, utdijPerKmFt: 0 }),
    szakasz: kor.szakasz,
  };
  return { be, ujjlenyomat, jarmuKod: adat.jarmuKod };
}

const ut = (m: MenetMunka) => `${varosNev(m.felrako.cim ?? "") || m.felrako.cim || "?"} → ${varosNev(m.lerako.cim ?? "") || m.lerako.cim || "?"}`;

// ---------------------------------------------------------------- optimalizálás (javaslat írása)

export type OptimalizalasEredmeny = {
  eredmeny: "uj" | "meglevo" | "nincs_jobb" | "nincs_megengedett" | "nincs_mozgathato";
  javaslatId: string | null;
  uzenet: string;
  megtakaritasFt: number;
  /** 'nincs_megengedett': a kemény korlátok, amelyeket a legjobb sorrend sem teljesít (a kártyán listázva). */
  korlatok?: string[];
  /** 'nincs_megengedett': a mostani terv megsértett korlátai. */
  mostaniSerulesek?: string[];
};

const FT = (x: number) => `${new Intl.NumberFormat("hu-HU").format(Math.round(x))} Ft`;

/**
 * Egy menet sorrend-optimalizálása. A számítás a tranzakción KÍVÜL fut (HU-GO
 * hívás lehet benne); utána: a más ujjlenyomatú nyitott javaslat 'elavult',
 * az azonos ujjlenyomatú nyitott marad (nincs duplikátum), új 'nyitott' csak
 * a küszöb fölött (erdemesJavasolni).
 */
export async function optimalizalMenetet(menetId: string, kor?: OptKor): Promise<Valasz<OptimalizalasEredmeny>> {
  if (!AZONOSITO.test(menetId)) return { ok: false, hiba: "Érvénytelen menet." };
  const menet = await getMenetById(menetId);
  if (!menet) return { ok: false, hiba: "Nincs ilyen menet." };
  if (menet.allapot === "lezart") return { ok: false, hiba: "Lezárt menet nem optimalizálható." };
  const k = kor ?? (await ujOptKor());
  const mb = await menetBemenet(menet, k, await kocsiParam(k, menet.jarmuKod));
  if (!mb) return { ok: false, hiba: "Nincs ilyen kocsi." };
  const e = await optimalizalSorrendet(mb.be);
  const javasol = erdemesJavasolni(e);
  const munkaUt = Object.fromEntries(mb.be.munkak.map((m) => [m.id, ut(m)]));

  return withTransaction(async (tx): Promise<Valasz<OptimalizalasEredmeny>> => {
    // A menet sorát zároljuk, hogy két párhuzamos kör ne írjon két nyitott javaslatot.
    await tx(`select id from fuvar_menet where id = $1 for update`, [menetId]);
    await tx(
      `update optimalizalo_javaslat set allapot = 'elavult', dontes_at = now()
        where menet_id = $1 and tipus = 'sorrend' and allapot = 'nyitott' and bemenet_ujjlenyomat <> $2`,
      [menetId, mb.ujjlenyomat]
    );
    const [meglevo] = await tx<{ id: string; megtakaritas_ft: string | null }>(
      `select id::text, megtakaritas_ft::text from optimalizalo_javaslat
        where menet_id = $1 and tipus = 'sorrend' and allapot = 'nyitott' and bemenet_ujjlenyomat = $2`,
      [menetId, mb.ujjlenyomat]
    );
    if (meglevo) {
      return { ok: true, eredmeny: "meglevo", javaslatId: meglevo.id, megtakaritasFt: Number(meglevo.megtakaritas_ft ?? 0), uzenet: `A nyitott javaslat (#${meglevo.id}) érvényes — lent látod.` };
    }
    if (!javasol) {
      const eredmeny: OptimalizalasEredmeny["eredmeny"] = e.modszer === "nincs_mozgathato" ? "nincs_mozgathato" : !e.legjobb ? "nincs_megengedett" : "nincs_jobb";
      const uzenet =
        eredmeny === "nincs_mozgathato" ? "Nincs mit átrendezni (legfeljebb egy mozgatható munka)."
          : eredmeny === "nincs_megengedett" ? `Nincs a kemény korlátoknak megfelelő sorrend: ${(e.legkevesbeRosszSerulesek.length ? e.legkevesbeRosszSerulesek : e.jelenlegi.serulesek).slice(0, 2).join(" · ")}`
            : `A mostani sorrend jó — a legjobb is legfeljebb ${FT(Math.max(0, e.megtakaritasFt))}-ot / ${Math.max(0, e.megtakaritasKm)} km-t hozna.`;
      return {
        ok: true, eredmeny, javaslatId: null, megtakaritasFt: Math.max(0, e.megtakaritasFt), uzenet,
        ...(eredmeny === "nincs_megengedett" ? { korlatok: e.legkevesbeRosszSerulesek.length ? e.legkevesbeRosszSerulesek : e.jelenlegi.serulesek, mostaniSerulesek: e.jelenlegi.serulesek } : {}),
      };
    }
    const l = e.legjobb!;
    const figy = [
      ...l.figyelmeztetesek.map((szoveg) => ({ kod: "figyelmeztetes", szoveg })),
      ...(!e.jelenlegi.megengedett ? e.jelenlegi.serulesek.map((szoveg) => ({ kod: "mostani_serules", szoveg })) : []),
      ...e.megjegyzesek.map((szoveg) => ({ kod: "korlat", szoveg })),
      ...(l.becsles ? [{ kod: "becsles", szoveg: "Van légvonal × 1,3 becslésű szakasz (a HU-GO nem volt elérhető)." }] : []),
    ];
    const javasolt = {
      sorrend: l.sorrend,
      jelenlegi: e.jelenlegi.sorrend,
      menetVerzio: menet.verzio,
      menetAllapot: menet.allapot,
      modszer: e.modszer,
      vizsgalt: e.vizsgalt,
      munkak: munkaUt,
      megtakaritasKm: e.megtakaritasKm,
      km: {
        javasolt: { ures: l.uresKm, rakott: l.rakottKm, haza: l.hazaKm },
        jelenlegi: { ures: e.jelenlegi.uresKm, rakott: e.jelenlegi.rakottKm, haza: e.jelenlegi.hazaKm },
      },
      ido: {
        javasolt: { vezetesPerc: l.vezetesPerc, varakozasPerc: l.varakozasPerc, szunetDb: l.szunetDb, horgony: l.horgony },
        jelenlegi: { vezetesPerc: e.jelenlegi.vezetesPerc, varakozasPerc: e.jelenlegi.varakozasPerc, kesesPerc: e.jelenlegi.kesesPerc },
      },
      param: { fogyasztasL100: mb.be.param.fogyasztasL100, gazolajFtL: mb.be.param.gazolajFtL, utdijPerKmFt: mb.be.param.utdijPerKmFt },
    };
    const [uj] = await tx<{ id: string }>(
      `insert into optimalizalo_javaslat (menet_id, jarmu_id, nap, tipus, bemenet_ujjlenyomat, javasolt, celfuggveny, megtakaritas_ft, figyelmeztetesek)
       values ($1, $2, $3::date, 'sorrend', $4, $5::jsonb, $6::jsonb, $7, $8::jsonb)
       on conflict do nothing returning id::text`,
      [menetId, menet.jarmuId, menet.nap, mb.ujjlenyomat, JSON.stringify(javasolt), JSON.stringify({ javasolt: l.celfuggveny, jelenlegi: e.jelenlegi.celfuggveny }), Math.round(e.megtakaritasFt), JSON.stringify(figy)]
    );
    if (!uj) return { ok: true, eredmeny: "meglevo", javaslatId: null, megtakaritasFt: e.megtakaritasFt, uzenet: "Közben készült egy nyitott javaslat." };
    return {
      ok: true, eredmeny: "uj", javaslatId: uj.id, megtakaritasFt: e.megtakaritasFt,
      uzenet: e.jelenlegi.megengedett ? `Javaslat #${uj.id}: ${FT(e.megtakaritasFt)}, ${e.megtakaritasKm} km megtakarítás.` : `Javaslat #${uj.id}: a mostani sorrend sért egy kemény korlátot — ez nem.`,
    };
  });
}

// ---------------------------------------------------------------- döntés

type JavaslatSor = { id: string; menet_id: string | null; jarmu_id: string | null; nap: string; javasolt: { sorrend?: unknown; jelenlegi?: unknown; menetVerzio?: unknown }; bemenet_ujjlenyomat: string; megtakaritas_ft: string | null };

async function visszaallit(id: string, allapot: "nyitott" | "elavult", ki: string | null): Promise<void> {
  await query(
    `update optimalizalo_javaslat set allapot = $2, dontotte = $3, dontes_at = now() where id = $1 and allapot = 'elfogadva'`,
    [id, allapot, allapot === "nyitott" ? null : ki]
  ).catch((err) => console.error("[optimalizalo] visszaállítás hiba:", err));
}

/**
 * Elfogadás. A javaslatot először „lefoglalja” (nyitott → elfogadva, feltételes
 * frissítéssel — két kattintás nem fogadhatja el kétszer); ha az alkalmazás
 * nem sikerül, visszaállítja (változott bemenetnél 'elavult').
 */
export async function elfogadJavaslatot(javaslatId: string, ki: string): Promise<Valasz<{ uzenet: string }>> {
  if (!AZONOSITO.test(javaslatId)) return { ok: false, hiba: "Érvénytelen javaslat." };
  const [j] = await query<JavaslatSor>(
    `update optimalizalo_javaslat set allapot = 'elfogadva', dontotte = $2, dontes_at = now()
      where id = $1 and allapot = 'nyitott' and tipus = 'sorrend'
      returning id::text, menet_id::text, jarmu_id::text, nap::text, javasolt, bemenet_ujjlenyomat, megtakaritas_ft::text`,
    [javaslatId, ki]
  );
  if (!j) {
    const [van] = await query<{ allapot: string }>(`select allapot from optimalizalo_javaslat where id = $1`, [javaslatId]);
    return { ok: false, hiba: van ? `Erről a javaslatról már döntöttek (${van.allapot}).` : "Nincs ilyen javaslat." };
  }
  const sorrend = Array.isArray(j.javasolt.sorrend) ? (j.javasolt.sorrend as unknown[]).filter((x): x is string => typeof x === "string") : [];
  const menetVerzio = Number(j.javasolt.menetVerzio);
  const indok = `optimalizáló javaslat #${j.id}`;
  try {
    const menet = j.menet_id ? await getMenetById(j.menet_id) : null;
    if (!menet || menet.allapot === "lezart") {
      await visszaallit(j.id, "elavult", ki);
      return { ok: false, hiba: "A menet már nincs meg, vagy lezárult — a javaslat elavult." };
    }
    // A bemenet azóta nem változott-e (munkák, ablakok, sorrend, menet-verzió).
    const most = await menetBemenet(menet, { szakasz: async () => null }, null);
    if (!most || most.ujjlenyomat !== j.bemenet_ujjlenyomat) {
      await visszaallit(j.id, "elavult", ki);
      return { ok: false, hiba: "A menet közben változott — a javaslat elavult. Futtasd újra az optimalizálást." };
    }
    if (menet.allapot === "javaslat") {
      // Még nincs jóváhagyva: a javaslat újragenerálódik ebben a sorrendben, és javaslat marad.
      const r = await frissitMenetJavaslatot(menet.jarmuId, menet.nap, ki, szerverTav(), sorrend);
      if (r.eredmeny === "jovahagyott") {
        await visszaallit(j.id, "elavult", ki);
        return { ok: false, hiba: "A menetet közben jóváhagyták — futtasd újra az optimalizálást." };
      }
      if (r.menetId) {
        await query(
          `insert into menet_esemeny (menet_id, esemeny, verzio, ki, ok, reszletek) values ($1, 'optimalizalo_elfogadva', $2, $3, $4, $5::jsonb)`,
          [r.menetId, r.verzio, ki, indok, JSON.stringify({ javaslat_id: j.id, regi: j.javasolt.jelenlegi ?? null, uj: sorrend, megtakaritas_ft: Number(j.megtakaritas_ft ?? 0) })]
        );
      }
      return { ok: true, uzenet: "Elfogadva — a javaslat ebben a sorrendben készült újra; a jóváhagyás külön lépés." };
    }
    // Jóváhagyott / folyamatban: kizárólag az átrendezés-úton.
    const ujSorrend = feladatSorrendJavaslatbol(menet.feladatok, sorrend);
    if (!ujSorrend) {
      await visszaallit(j.id, "elavult", ki);
      return { ok: false, hiba: "A javaslat munkái nem egyeznek a menettel — elavult." };
    }
    const r = await atrendezMenet(menet.id, menetVerzio, ujSorrend, indok, ki);
    if (!r.ok) {
      await visszaallit(j.id, "elavult", ki);
      return { ok: false, hiba: r.hiba };
    }
    return { ok: true, uzenet: `Átrendezve (v${r.verzio}) — ${indok}.` };
  } catch (err) {
    console.error("[optimalizalo] elfogadás hiba:", err);
    await visszaallit(j.id, "nyitott", ki);
    return { ok: false, hiba: "Nem sikerült az elfogadás." };
  }
}

export async function elutasitJavaslatot(javaslatId: string, ki: string): Promise<Valasz> {
  if (!AZONOSITO.test(javaslatId)) return { ok: false, hiba: "Érvénytelen javaslat." };
  const [j] = await query<{ id: string }>(
    `update optimalizalo_javaslat set allapot = 'elutasitva', dontotte = $2, dontes_at = now()
      where id = $1 and allapot = 'nyitott' returning id::text`,
    [javaslatId, ki]
  );
  if (!j) return { ok: false, hiba: "Nincs ilyen nyitott javaslat (lehet, hogy közben döntöttek róla)." };
  return { ok: true };
}

// ---------------------------------------------------------------- olvasás (Menetterv panel)

type NezetSor = {
  id: string; menet_id: string | null; letrehozva_at: string; megtakaritas_ft: string | null;
  javasolt: { sorrend?: string[]; jelenlegi?: string[]; munkak?: Record<string, string>; megtakaritasKm?: number; menetVerzio?: number; km?: OptJavaslatNezet["km"] };
  celfuggveny: { javasolt: Celfuggveny; jelenlegi: Celfuggveny };
  figyelmeztetesek: { kod: string; szoveg: string }[] | null;
};

/** A menetek nyitott sorrend-javaslatai (menet-id → javaslat). Hiba (pl. nincs tábla) esetén üres. */
export async function nyitottJavaslatok(menetIds: string[]): Promise<Map<string, OptJavaslatNezet & { menetVerzio: number | null }>> {
  const ki = new Map<string, OptJavaslatNezet & { menetVerzio: number | null }>();
  if (menetIds.length === 0) return ki;
  try {
    const sorok = await query<NezetSor>(
      `select id::text, menet_id::text, letrehozva_at::text, megtakaritas_ft::text, javasolt, celfuggveny, figyelmeztetesek
         from optimalizalo_javaslat where menet_id = any($1::bigint[]) and tipus = 'sorrend' and allapot = 'nyitott'
        order by letrehozva_at desc`,
      [menetIds]
    );
    for (const s of sorok) {
      if (!s.menet_id || ki.has(s.menet_id)) continue;
      const munkak = s.javasolt.munkak ?? {};
      const lista = (ids: string[] | undefined) => (ids ?? []).map((id) => ({ id, ut: munkak[id] ?? `#${id}` }));
      const figy = Array.isArray(s.figyelmeztetesek) ? s.figyelmeztetesek : [];
      ki.set(s.menet_id, {
        id: s.id,
        menetId: s.menet_id,
        letrehozvaAt: s.letrehozva_at,
        megtakaritasFt: Number(s.megtakaritas_ft ?? 0),
        megtakaritasKm: Number(s.javasolt.megtakaritasKm ?? 0),
        jelenlegi: lista(s.javasolt.jelenlegi),
        javasolt: lista(s.javasolt.sorrend),
        celfuggveny: s.celfuggveny,
        km: s.javasolt.km ?? { javasolt: { ures: 0, rakott: 0, haza: 0 }, jelenlegi: { ures: 0, rakott: 0, haza: 0 } },
        megjegyzesek: figy.filter((f) => f.kod === "korlat" || f.kod === "mostani_serules").map((f) => f.szoveg),
        figyelmeztetesek: figy.filter((f) => f.kod === "figyelmeztetes" || f.kod === "becsles").map((f) => f.szoveg),
        menetVerzio: typeof s.javasolt.menetVerzio === "number" ? s.javasolt.menetVerzio : null,
      });
    }
  } catch (err) {
    console.warn("[optimalizalo] a javaslatok nem olvashatók:", err instanceof Error ? err.message : err);
  }
  return ki;
}

// ---------------------------------------------------------------- hozzárendelés (Tervezés)

export type HozzarendelesNezet = {
  nap: string;
  /** A HU-GO-keret kimerült / nem volt elérhető: a km-ek egy része légvonal × 1,3 becslés. */
  becsles?: boolean;
  legjobb: { kod: string; sofor: string; vanGps: boolean; pozicio: number; elotte: string | null; utana: string | null; hatarFt: number; pluszKm: number } | null;
  kocsik: { kod: string; sofor: string; vanGps: boolean; megengedett: boolean; hatarFt: number | null; pluszKm: number | null; ok: string | null }[];
};

/**
 * Egy bejövő bérfuvar: melyik kocsi napjába (a felrakás napja), hová, és
 * mennyibe kerül (a J határváltozása). Mind a 4 aktív kocsi jelölt — a GPS
 * nélküli is. Nem ír semmit.
 */
/** A kattintásra induló hozzárendelés-javaslat HU-GO kerete: ennyi hívás / ennyi idő után becslés. */
export const HOZZARENDELES_MAX_HIVAS = 120;
export const HOZZARENDELES_IDOKERET_MS = 20_000;

export async function hozzarendelesJavaslat(megbizasId: string, kor?: OptKor): Promise<Valasz<HozzarendelesNezet>> {
  if (!AZONOSITO.test(megbizasId)) return { ok: false, hiba: "Érvénytelen megbízás." };
  const uj = await megbizasMunka(megbizasId);
  if (!uj) return { ok: false, hiba: "Nincs ilyen megbízás." };
  const nap = uj.felrakasNap ?? budapestNapISO();
  // Korlátos: legfeljebb 120 HU-GO hívás és 20 s — utána légvonal × 1,3
  // (a már lekért szakaszok a kulso-hivas gyorsítótárából jönnek).
  const hugo = ujHugoKor({ maxHivas: HOZZARENDELES_MAX_HIVAS, idokeretMs: HOZZARENDELES_IDOKERET_MS });
  const k = kor ?? (await ujOptKor(hugo));
  const jarmuvek = (await getJarmuvek()).filter((j): j is typeof j & { id: string; kod: string } => !!j.id && !!j.kod);
  const kocsik: KocsiNap[] = [];
  let telephelyek: OptBemenet["telephelyek"] = [];
  const munkaUt = new Map<string, string>([[uj.id, ut(uj)]]);
  for (const j of jarmuvek) {
    const adat = await menetAdat(j.id, nap);
    if (!adat) continue;
    telephelyek = adat.telephelyek;
    const menet = await getMenet(j.id, nap).catch(() => null);
    for (const m of adat.munkak) munkaUt.set(m.id, ut(m));
    kocsik.push({
      jarmuId: j.id, kod: j.kod, sofor: j.sofor, vanGps: !!j.ecofleetObjectId,
      munkak: adat.munkak,
      jelenlegiSorrend: menet ? megbizasSorrend(menet.feladatok) : null,
      rogzitett: menet ? menet.feladatok.flatMap((f) => (f.lezarvaAt && f.megbizasId ? [f.megbizasId] : [])) : [],
      indulas: adat.indulas,
      haza: await hazaHely(j.kod),
      kapacitas: adat.kapacitas,
      param: await kocsiParam(k, j.kod),
    });
  }
  const h = await javasolHozzarendelest(uj, nap, kocsik, k.szakasz, telephelyek);
  const l = h.legjobb;
  const ujHelye = l ? l.sorrend.indexOf(uj.id) : -1;
  if (hugo.leallt) console.warn(`[optimalizalo] hozzárendelés: a HU-GO-keret kimerült (${hugo.ok}) — a további szakaszok becslések.`);
  return {
    ok: true,
    nap,
    becsles: hugo.leallt,
    legjobb: l && l.hatarFt != null ? {
      kod: l.kod, sofor: l.sofor, vanGps: l.vanGps, pozicio: ujHelye,
      elotte: ujHelye > 0 ? munkaUt.get(l.sorrend[ujHelye - 1]) ?? null : null,
      utana: ujHelye >= 0 && ujHelye < l.sorrend.length - 1 ? munkaUt.get(l.sorrend[ujHelye + 1]) ?? null : null,
      hatarFt: Math.round(l.hatarFt), pluszKm: l.pluszKm ?? 0,
    } : null,
    kocsik: h.kocsik.map((x) => ({
      kod: x.kod, sofor: x.sofor, vanGps: x.vanGps, megengedett: x.megengedett,
      hatarFt: x.megengedett && x.hatarFt != null ? Math.round(x.hatarFt) : null, pluszKm: x.megengedett ? x.pluszKm : null,
      ok: x.megengedett ? null : x.serulesek[0] ?? null,
    })),
  };
}

// ---------------------------------------------------------------- óránkénti kör

/**
 * Az óránkénti modell-szinkron körből: ma és holnap minden nem lezárt,
 * legalább két munkás menetére javaslat (ha megéri). SOHA nem dob.
 */
export async function frissitsOptimalizaloJavaslatokat(most: Date = new Date(), hugo: HugoKor = ujHugoKor()): Promise<{ uj: number; nincs: number; kihagyva: number; hiba: number }> {
  const eredmeny = { uj: 0, nincs: 0, kihagyva: 0, hiba: 0 };
  try {
    const ma = budapestNapISO(most);
    const holnap = budapestNapISO(new Date(Date.parse(`${ma}T12:00:00Z`) + 24 * 3600 * 1000));
    const mozgathato = (m: Menet) => m.feladatok.filter((f) => f.megbizasId && !f.lezarvaAt).length;
    const jelolt = (await getMenetek(ma, holnap)).filter((m) => m.allapot !== "lezart" && m.feladatok.filter((f) => f.megbizasId).length >= 2);
    // Óránként csak a kis meneteket számoljuk elő (a távolság-mátrix ~ (n+1)² HU-GO
    // szakasz); a nagyobbat a kártya „Optimalizálás” gombja számolja.
    const menetek = jelolt.filter((m) => mozgathato(m) <= TELJES_BEJARAS_MAX);
    eredmeny.kihagyva = jelolt.length - menetek.length;
    if (menetek.length === 0) return eredmeny;
    const kor = await ujOptKor(hugo);
    for (const m of menetek) {
      try {
        const r = await optimalizalMenetet(m.id, kor);
        if (r.ok && r.eredmeny === "uj") eredmeny.uj++;
        else eredmeny.nincs++;
      } catch (err) {
        eredmeny.hiba++;
        console.error(`[optimalizalo] ${m.jarmuKod} ${m.nap}:`, err instanceof Error ? err.message : err);
      }
    }
  } catch (err) {
    eredmeny.hiba++;
    console.error("[optimalizalo] váratlan hiba:", err instanceof Error ? err.message : err);
  }
  return eredmeny;
}

