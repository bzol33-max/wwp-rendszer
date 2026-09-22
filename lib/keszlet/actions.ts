"use server";

import { randomUUID } from "node:crypto";
import { query, withTransaction, type Querier } from "@/lib/db";
import type { ModuleKey } from "@/lib/auth/permissions";
import { verifySession } from "@/lib/auth/dal";
import { rendszerFutasban } from "@/lib/auth/system-context";
import {
  requireAnyEditPermission,
  requireAnyViewPermission,
  requireEditPermission,
  requireViewPermission,
} from "@/lib/auth/require-permission";

const TIME_FMT = "mon. DD HH24:MI";

// A Railway-konténer (és a hozzá tartozó Postgres session) alapértelmezett
// időzónája UTC, nem Europe/Budapest — lásd lib/jelenlet/actions.ts hasonló
// megjegyzését. Sima `to_char`/`current_date`/`::date` ezért a szerver (UTC)
// faliórát adná vissza, ami éjfél körül (kb. 1-2 órás ablakban) a naptári
// napot is elcsúsztatná — pl. egy budapesti éjfél után rögzített "mai"
// felvásárlás a szerver szerint még tegnapra kerülne. Minden itt
// megjelenített/csoportosított dátum-idő ezért explicit
// `at time zone 'Europe/Budapest'` konverzióval számol.
const BUDAPEST_NOW_DATE = `(now() at time zone 'Europe/Budapest')::date`;

// "mozgatas_be" sosem felhasználó által választott irány (a Mozgás
// rögzítése kártyán nem is jelenik meg) — ez a telephelyek közti
// mozgatás cél oldali, rendszer által generált párja, ld. recordMovement.
export type Direction = "be" | "ki" | "mozgatas" | "mozgatas_be";

export type MovementRow = {
  id: string;
  date: string;
  type: string;
  direction: Direction;
  partner: string | null;
  qty: number;
  target_site: string | null;
  created_by: string | null;
  /** "mozgatas_be" sornál: átvette-e már a fogadó telep (addig nincs a készletben). */
  accepted: boolean;
};

// Az önkiszolgáló "keszlet_sajat" jog (a dolgozói mobil nézet Készlet
// csempéje) csak erre a két telephelyre érvényes — ld. KESZLET_SITES a
// components/erkezes/erkezes-sajat-view.tsx-ben. A teljes "keszlet" modul
// birtokosát ez nem korlátozza. A telephelyet a kliens küldi, ezért itt is
// ellenőrizni kell, nem elég a felületen elrejteni.
const SAJAT_KESZLET_SITES = ["Szakoly", "Balkány"];

function ellenorizdSajatKeszletHatokor(jog: ModuleKey, ...sites: (string | undefined)[]) {
  if (jog !== "keszlet_sajat") return;
  for (const site of sites) {
    if (site && !SAJAT_KESZLET_SITES.includes(site)) {
      throw new Error(
        `A saját készlet jogosultság nem érvényes erre a telephelyre: ${site}`
      );
    }
  }
}

// Szerver oldali bemenet-ellenőrzés. A kliens is ellenőriz, de a szerver-akció
// közvetlenül is hívható, és egy hibás érték (pl. tört darabszám) különben
// csak a DB-nél, félig lefutott mentés közben derülne ki.
const TELEPHELYEK = ["Nyíregyháza", "Szakoly", "Balkány"];

function ellenorizdDarabszam(qty: unknown, mihez: string, nullaIsLehet = false): number {
  const min = nullaIsLehet ? 0 : 1;
  if (typeof qty !== "number" || !Number.isInteger(qty) || qty < min || qty > 1_000_000) {
    throw new Error(`Érvénytelen darabszám (${mihez}): ${String(qty)}`);
  }
  return qty;
}

function ellenorizdTelephely(site: unknown): string {
  if (typeof site !== "string" || !TELEPHELYEK.includes(site)) {
    throw new Error(`Ismeretlen telephely: ${String(site)}`);
  }
  return site;
}

// A típus létezését és telephelyi aktivitását a hívó ellenőrzi (a katalógus
// a beállításokban bővíthető, ezért itt nincs rögzített névlista).
function ellenorizdTipusNev(type: unknown): string {
  if (typeof type !== "string" || type.trim() === "" || type.length > 60) {
    throw new Error(`Érvénytelen típus: ${String(type)}`);
  }
  return type;
}

function ellenorizdAr(price: unknown): number {
  if (typeof price !== "number" || !Number.isInteger(price) || price < 0 || price > 10_000_000) {
    throw new Error(`Érvénytelen egységár: ${String(price)}`);
  }
  return price;
}

function ellenorizdDatum(date: unknown): string {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Érvénytelen dátum: ${String(date)}`);
  }
  return date;
}

function ellenorizdAzonosito(id: unknown): string {
  if (typeof id !== "string" || !/^\d+$/.test(id)) {
    throw new Error(`Érvénytelen azonosító: ${String(id)}`);
  }
  return id;
}

// A "ki rögzítette" bélyegző a munkamenetből jön, nem a kliensről. Korábban a
// kliens küldte a (nem httpOnly) "wwp_user" süti tartalmát, amit bárki
// átírhatott — a napló így nem volt megbízható. Ütemezőből indított hívásnál
// nincs munkamenet, ott a mező üresen marad.
async function rogzitoNeve(): Promise<string | null> {
  if (rendszerFutasban()) return null;
  const session = await verifySession();
  return session.isAuth ? session.name : null;
}

// Ezek a lekérdezések csak ezen a modulon belülről hívódnak (getSiteSnapshot,
// getNyiregyhazaFoSnapshot). Szándékosan NEM exportáltak: egy "use server"
// fájl minden exportja távolról hívható szerver-akció, exportálva tehát
// jogosultság-ellenőrzés nélküli olvasási felületet adnának. A hívó
// exportált akciók végzik az ellenőrzést.
async function getActiveTypes(site: string) {
  const rows = await query<{ name: string }>(
    `select t.name
     from site_active_types sat
     join sites s on s.id = sat.site_id
     join pallet_types t on t.id = sat.type_id
     where s.name = $1
     order by t.sort_order, t.id`,
    [site]
  );
  return rows.map((r) => r.name);
}

async function getStock(site: string): Promise<Record<string, number>> {
  // A "Csere" tranzakciótípus, nem önálló készlet — sosem jelenik meg készletkártyaként.
  const active = (await getActiveTypes(site)).filter((t) => t !== "Csere");
  const rows = await query<{ name: string; qty: string }>(
    `select t.name,
       coalesce(sum(case
         when m.direction = 'be' then m.qty
         when m.direction = 'mozgatas_be' and m.elfogadva_at is not null then m.qty
         when m.direction in ('ki','mozgatas') then -m.qty
         else 0
       end), 0) as qty
     from pallet_types t
     left join keszlet_movements m on m.type_id = t.id
       and m.site_id = (select id from sites where name = $1)
     group by t.name`,
    [site]
  );
  const totals: Record<string, number> = {};
  for (const t of active) totals[t] = 0;
  for (const r of rows) {
    if (r.name in totals) totals[r.name] = Number(r.qty);
  }
  return totals;
}

async function getMovements(site: string, limit = 20): Promise<MovementRow[]> {
  const rows = await query<MovementRow>(
    `select m.id::text, to_char(m.created_at at time zone 'Europe/Budapest', '${TIME_FMT}') as date, t.name as type,
       m.direction, m.partner, m.qty, ts.name as target_site, m.created_by,
       (m.direction <> 'mozgatas_be' or m.elfogadva_at is not null) as accepted
     from keszlet_movements m
     join pallet_types t on t.id = m.type_id
     left join sites ts on ts.id = m.target_site_id
     where m.site_id = (select id from sites where name = $1)
     order by m.created_at desc
     limit $2`,
    [site, limit]
  );
  return rows;
}

// Belső segéd (nem exportált, ld. fent): minden hívója exportált akció,
// ami már elvégezte a jogosultság- és hatókör-ellenőrzést. Saját őrt
// szándékosan nem tartalmaz — az itt a keszlet_sajat ágat vágná el.
// A `q` a hívó tranzakciója (withTransaction), hogy a mozgás a többi
// összetartozó írással együtt rögzüljön vagy maradjon el.
async function addMovement(q: Querier, input: {
  site: string;
  type: string;
  direction: Direction;
  qty: number;
  partner?: string;
  targetSite?: string;
  purchaseId?: string;
  createdBy?: string;
  movementGroup?: string;
}) {
  await q(
    `insert into keszlet_movements (site_id, type_id, direction, qty, partner, target_site_id, purchase_id, created_by, movement_group)
     values (
       (select id from sites where name = $1),
       (select id from pallet_types where name = $2),
       $3, $4, $5,
       (select id from sites where name = $6),
       $7, $8, $9
     )`,
    [
      input.site,
      input.type,
      input.direction,
      input.qty,
      input.partner ?? null,
      input.targetSite ?? null,
      input.purchaseId ?? null,
      input.createdBy ?? null,
      input.movementGroup ?? null,
    ]
  );
}

// Mozgás rögzítése (Beérkezés / Kiszállítás / Telephelyek közti mozgatás) — a
// "Mozgás rögzítése" kártya mindhárom telephelyen (Nyíregyháza, Szakoly,
// Balkány) ezt hívja, hogy egy mentésben több típust is fel lehessen venni
// (soronként külön darabszámmal), ugyanahhoz a partnerhez / cél
// telephelyhez. Nyíregyházán egyetlen összevont keszlet_events-sorban
// jelenik meg az összes tétel, hogy egy helyen lásd a Csere/Szétválogatás
// mellett a sima Be/Ki/Mozgatás tételeket is.
//
// FONTOS (2026-09-08-i javítás): "mozgatas"-nál a régi kód csak a FORRÁS
// telepen rögzített sor(oka)t — a mennyiség levonódott onnan, de sehol nem
// íródott jóvá a cél telepen, tehát ténylegesen eltűnt a rendszerből (pl.
// Nyíregyházáról Szakolyra átvitt H1 raklap). Most egy mozgatás mindig két
// oldalról ír: a forrásnál "mozgatas" (levonás), a célnál "mozgatas_be"
// (jóváírás) — lásd getStock, ahol mindkét irány a megfelelő előjellel
// számít bele a készletbe. A két oldal UGYANAZT a movement_group-ot kapja,
// hogy egy törlés (deleteMovement / deleteMovementEvent) mindkét oldalt
// együtt vonja vissza — különben egy féloldalas törlés újra egyensúlyt
// bontana, pont úgy, mint az eredeti hiba.
// FONTOS (2026-09-10-i bővítés): egy "mozgatás" mentésben soronként ELTÉRŐ
// cél telephely is megadható (pl. 10 db EUR világos Szakolyra, 5 db EUR
// szürke Balkányra, egy mentésben) — ezért a cél telephely soronkénti
// (items[].targetSite), nem egyetlen, a teljes mentésre érvényes mező.
// FONTOS (2026-09-18): az egész mentés egy tranzakció — egy félúton elbukó
// mentés (pl. hibás második sor) különben levonná a forrásnál, de nem írná
// jóvá a célnál, vagy a sikeres sorokat az újrapróbálás megduplázná.
// ELADÁS (2026-09-18): a Kiszállítás / Eladás irányhoz soronként megadható
// egy Ft/db ár (items[].unitPrice). Ha van ár, a kiszállítás egyben eladás:
// a készlet csökken, az ellenérték pedig bevételként a kasszába kerül. Az
// `afa` jelölővel a beírt ár a NETTÓ, és a kasszába a bruttó kerül — a vevő
// ennyit fizet. Kassza csak Nyíregyházán van, ezért máshol nem adható ár.
const AFA_KULCS = 0.27;

export async function recordMovements(input: {
  site: string;
  direction: Direction;
  items: { type: string; qty: number; targetSite?: string; unitPrice?: number }[];
  partner?: string;
  afa?: boolean;
}) {
  const jog = await requireAnyEditPermission(["keszlet", "keszlet_sajat"]);
  const createdBy = await rogzitoNeve();
  ellenorizdSajatKeszletHatokor(
    jog,
    input.site,
    ...input.items.map((i) => i.targetSite)
  );
  ellenorizdTelephely(input.site);
  // A "mozgatas_be" csak a rendszer által generált cél oldali pár lehet.
  if (!["be", "ki", "mozgatas"].includes(input.direction)) {
    throw new Error(`Érvénytelen irány: ${String(input.direction)}`);
  }
  for (const item of input.items) {
    ellenorizdDarabszam(item.qty, item.type);
    if (item.unitPrice !== undefined) ellenorizdAr(item.unitPrice);
    if (input.direction === "mozgatas") {
      ellenorizdTelephely(item.targetSite);
      if (item.targetSite === input.site) {
        throw new Error("A mozgatás cél telephelye nem lehet ugyanaz, mint a forrás.");
      }
    }
  }
  const eladottTetelek = input.items.filter((i) => (i.unitPrice ?? 0) > 0);
  const nettoOsszeg = eladottTetelek.reduce((sum, i) => sum + i.qty * (i.unitPrice ?? 0), 0);
  if (nettoOsszeg > 0) {
    if (input.direction !== "ki") {
      throw new Error("Eladási ár csak a Kiszállítás / Eladás irányhoz adható meg.");
    }
    if (input.site !== "Nyíregyháza") {
      throw new Error("Eladás csak Nyíregyházán rögzíthető — kassza csak ott van.");
    }
  }
  const bruttoOsszeg = input.afa ? Math.round(nettoOsszeg * (1 + AFA_KULCS)) : nettoOsszeg;
  if (input.items.length === 0) return;

  const movementGroup = randomUUID();
  await withTransaction(async (q) => {
    for (const item of input.items) {
      await addMovement(q, {
        site: input.site,
        type: item.type,
        direction: input.direction,
        qty: item.qty,
        partner: input.partner,
        targetSite: input.direction === "mozgatas" ? item.targetSite : undefined,
        createdBy: createdBy ?? undefined,
        movementGroup,
      });
    }
    if (input.direction === "mozgatas") {
      for (const item of input.items) {
        if (!item.targetSite) continue;
        await addMovement(q, {
          site: item.targetSite,
          type: item.type,
          direction: "mozgatas_be",
          qty: item.qty,
          targetSite: input.site,
          createdBy: createdBy ?? undefined,
          movementGroup,
        });
      }
    }

    if (input.site === "Nyíregyháza") {
      const itemsText =
        input.direction === "mozgatas"
          ? input.items.map((i) => `${i.qty} db ${i.type} → ${i.targetSite}`).join(", ")
          : input.items.map((i) => `${i.qty} db ${i.type}`).join(", ");
      const details =
        input.direction === "mozgatas"
          ? itemsText
          : `${itemsText}${input.partner ? ` — ${input.partner}` : ""}`;
      const effect = input.items
        .map((i) =>
          input.direction === "be"
            ? `${i.type} +${i.qty}`
            : input.direction === "ki"
              ? `${i.type} −${i.qty}`
              : `${i.type} −${i.qty} → ${i.targetSite}`
        )
        .join(" · ");
      // Eladásnál a pénz is látszik az eseményen, hogy a "Legutóbbi mozgások"
      // listából egyben olvasható legyen, mi ment ki és mennyiért.
      const penzText =
        nettoOsszeg > 0
          ? ` · kassza +${bruttoOsszeg.toLocaleString("hu-HU")} Ft${
              input.afa ? ` (nettó ${nettoOsszeg.toLocaleString("hu-HU")} + 27% ÁFA)` : ""
            }`
          : "";
      await q(
        `insert into keszlet_events (site_id, kind, details, effect, created_by, movement_group)
         values ((select id from sites where name = 'Nyíregyháza'), 'mozgas', $1, $2, $3, $4)`,
        [details, `${effect}${penzText}`, createdBy, movementGroup]
      );
    }

    if (nettoOsszeg > 0) {
      const tetelek = eladottTetelek
        .map((i) => `${i.qty} db ${i.type} × ${(i.unitPrice ?? 0).toLocaleString("hu-HU")} Ft`)
        .join(", ");
      await q(
        `insert into kassza_movements (description, amount, created_by, category, movement_group)
         values ($1, $2, $3, 'eladas', $4)`,
        [
          `Eladás${input.partner ? ` — ${input.partner}` : ""} (${tetelek})${
            input.afa ? ` + 27% ÁFA` : ""
          }`,
          bruttoOsszeg,
          createdBy,
          movementGroup,
        ]
      );
    }
    // A cél oldali "megérkezett" esemény NEM itt keletkezik, hanem az
    // átvételkor (acceptIncomingMovement) — a mozgatás az okézásig úton van.
  });
}

// --- Telephelyek közti mozgatás átvétele a cél telepen ---

export type IncomingRow = {
  id: string;
  date: string;
  type: string;
  qty: number;
  from_site: string | null;
  created_by: string | null;
};

// A cél telepen még okézásra váró ("úton lévő") tételek. Ezek a küldő
// készletéből már lekerültek, de a fogadóéba csak az átvétel után kerülnek be.
async function getIncoming(site: string): Promise<IncomingRow[]> {
  return query<IncomingRow>(
    `select m.id::text, to_char(m.created_at at time zone 'Europe/Budapest', '${TIME_FMT}') as date,
       t.name as type, m.qty, fs.name as from_site, m.created_by
     from keszlet_movements m
     join pallet_types t on t.id = m.type_id
     left join sites fs on fs.id = m.target_site_id
     where m.site_id = (select id from sites where name = $1)
       and m.direction = 'mozgatas_be'
       and m.elfogadva_at is null
     order by m.created_at`,
    [site]
  );
}

export async function getIncomingMovements(site: string): Promise<IncomingRow[]> {
  const jog = await requireAnyViewPermission(["keszlet", "keszlet_sajat"]);
  ellenorizdSajatKeszletHatokor(jog, site);
  ellenorizdTelephely(site);
  return getIncoming(site);
}

// Átvétel ("okézás") a fogadó telepen: ettől a pillanattól számít bele a
// mennyiség a telep készletébe. Azt is rögzítjük, ki és mikor vette át.
export async function acceptIncomingMovement(id: string) {
  const jog = await requireAnyEditPermission(["keszlet", "keszlet_sajat"]);
  const elfogadta = await rogzitoNeve();
  ellenorizdAzonosito(id);
  await withTransaction(async (q) => {
    const rows = await q<{
      site: string;
      from_site: string | null;
      type: string;
      qty: number;
      movement_group: string | null;
    }>(
      `select s.name as site, fs.name as from_site, t.name as type, m.qty, m.movement_group::text
       from keszlet_movements m
       join sites s on s.id = m.site_id
       join pallet_types t on t.id = m.type_id
       left join sites fs on fs.id = m.target_site_id
       where m.id = $1 and m.direction = 'mozgatas_be' and m.elfogadva_at is null`,
      [id]
    );
    if (rows.length === 0) return;
    const sor = rows[0];
    // A telephelyet itt a sorból vesszük, nem a kliensről — a saját készlet
    // jogosultság csak Szakolyra és Balkányra érvényes.
    ellenorizdSajatKeszletHatokor(jog, sor.site);
    await q(
      `update keszlet_movements set elfogadva_at = now(), elfogadva_by = $2 where id = $1`,
      [id, elfogadta]
    );
    // Nyíregyházán az esemény-feed mutatja a beérkezést (a többi telepen a
    // nyers mozgás-lista már tartalmazza a sort).
    if (sor.site === "Nyíregyháza") {
      await q(
        `insert into keszlet_events (site_id, kind, details, effect, created_by, movement_group)
         values ((select id from sites where name = 'Nyíregyháza'), 'mozgas', $1, $2, $3, $4)`,
        [
          `${sor.qty} db ${sor.type} átvéve innen: ${sor.from_site ?? "ismeretlen telephely"}`,
          `${sor.type} +${sor.qty}`,
          elfogadta,
          sor.movement_group,
        ]
      );
    }
  });
}

// Egyetlen mozgás-sor törlése a "Legutóbbi mozgások" listából (Szakoly,
// Balkány — ahol a lista közvetlenül a nyers keszlet_movements-sorokat
// mutatja). Felvásárláshoz kötött sort (purchase_id) szándékosan NEM enged
// itt törölni — azt a Havi fülön, a felvásárlás törlésével (deletePurchase)
// kell visszavonni, hogy a kassza/esemény-hatás is konzisztens maradjon.
//
// "mozgatas"/"mozgatas_be" sornál a movement_group teljes egészét törli, nem
// csak az adott sort — ezek egy telephelyek közti mozgatás két oldala
// (forrás levonás + cél jóváírás), és a féloldalas törlés pont azt az
// egyensúly-bontó hibát okozná újra, amit a jóváírás bevezetése (lásd
// recordMovements) megszüntetett.
export async function deleteMovement(id: string) {
  await requireEditPermission("keszlet");
  ellenorizdAzonosito(id);
  await withTransaction(async (q) => {
    const rows = await q<{
      purchase_id: string | null;
      direction: Direction;
      movement_group: string | null;
      partner: string | null;
    }>(
      `select purchase_id::text, direction, movement_group::text, partner from keszlet_movements where id = $1`,
      [id]
    );
    if (rows.length === 0) return;
    if (rows[0].purchase_id) {
      throw new Error(
        "Ez a tétel egy felvásárláshoz tartozik — a Havi fülön, a felvásárlás törlésével vonható vissza."
      );
    }
    const { direction, movement_group, partner } = rows[0];
    // Két eset, ahol a sor NEM önmagában áll, hanem egy kiegyensúlyozott
    // tétel része, és a féloldalas törlés elrontaná a készletet:
    // a telephelyek közti mozgatás (forrás levonás + cél jóváírás) és a
    // szétválogatás (vegyes − / világos, szürke +). Ilyenkor a teljes
    // movement_group-ot töröljük. A sima be/ki sorok (akár egy mentésből)
    // továbbra is egyenként törölhetők.
    // Eladásnál (kassza-bevétel a mozgás csoportjához kötve) sem törölhető
    // csak az egyik oldal: a pénznek a készlettel együtt kell visszaíródnia.
    const eladasSor = movement_group
      ? (
          await q<{ id: string }>(
            `select id from kassza_movements where movement_group = $1 limit 1`,
            [movement_group]
          )
        ).length > 0
      : false;
    const egybenTorlendo =
      direction === "mozgatas" ||
      direction === "mozgatas_be" ||
      partner === "Szétválogatás" ||
      eladasSor;
    if (egybenTorlendo && movement_group) {
      await q(`delete from kassza_movements where movement_group = $1`, [movement_group]);
      // A másik oldalon (jellemzően Nyíregyházán) a mozgatáshoz tartozhat egy
      // összevont keszlet_events-sor is (lásd recordMovements) — ezt is
      // töröljük, különben egy már nem létező mozgatásra hivatkozó, "árva"
      // esemény maradna a Legutóbbi mozgások listában.
      await q(`delete from keszlet_events where movement_group = $1`, [movement_group]);
      await q(`delete from keszlet_movements where movement_group = $1`, [movement_group]);
      return;
    }
    await q(`delete from keszlet_movements where id = $1`, [id]);
  });
}

// Egy "Legutóbbi mozgások" esemény (Nyíregyháza — keszlet_events, kind =
// 'mozgas') törlése a hozzá tartozó ÖSSZES keszlet_movements-sorral együtt
// (recordMovements egy mentésben több típust is felvehet — ezeket a közös
// movement_group köti össze, lásd db/schema.sql).
export async function deleteMovementEvent(id: string) {
  await requireEditPermission("keszlet");
  ellenorizdAzonosito(id);
  await withTransaction(async (q) => {
    // A 'csere' szándékosan kimarad: az egy felvásárlási tétel hatása, és a
    // Havi fülön, a tétel törlésével vonható vissza (deletePurchase).
    const rows = await q<{ movement_group: string | null }>(
      `select movement_group::text from keszlet_events
       where id = $1 and kind in ('mozgas', 'szet', 'leltar')`,
      [id]
    );
    if (rows.length === 0) return;
    const group = rows[0].movement_group;
    if (group) {
      const linkedToPurchase = await q<{ id: string }>(
        `select id from keszlet_movements where movement_group = $1 and purchase_id is not null`,
        [group]
      );
      if (linkedToPurchase.length > 0) {
        throw new Error(
          "Ez a tétel egy felvásárláshoz tartozik — a Havi fülön, a felvásárlás törlésével vonható vissza."
        );
      }
      // Eladás esetén a kassza-bevétel is ehhez a csoporthoz tartozik.
      await q(`delete from kassza_movements where movement_group = $1`, [group]);
      await q(`delete from keszlet_movements where movement_group = $1`, [group]);
    }
    await q(`delete from keszlet_events where id = $1`, [id]);
  });
}

// --- Összkészlet (Szakoly/Archívum fülek közötti összesítő) ---

export type OsszkeszletRow = {
  type: string;
  total: number;
  bySite: Record<string, number>;
};

export async function getOsszkeszlet(): Promise<OsszkeszletRow[]> {
  await requireViewPermission("keszlet");
  // Ugyanaz a be/ki/mozgatás-számítás, mint a getStock-ban, csak az összes
  // telephelyre egyszerre, típus+telephely bontásban — a "Csere" itt sem
  // önálló készlettétel, ld. getStock megjegyzését.
  const rows = await query<{ type: string; site: string; qty: string }>(
    `select t.name as type, s.name as site,
       coalesce(sum(case
         when m.direction = 'be' then m.qty
         when m.direction = 'mozgatas_be' and m.elfogadva_at is not null then m.qty
         when m.direction in ('ki','mozgatas') then -m.qty
         else 0
       end), 0) as qty
     from pallet_types t
     join site_active_types sat on sat.type_id = t.id
     join sites s on s.id = sat.site_id
     left join keszlet_movements m on m.type_id = t.id and m.site_id = s.id
     where t.name <> 'Csere'
     group by t.name, s.name, t.sort_order, t.id
     order by t.sort_order, t.id`
  );
  const byType = new Map<string, OsszkeszletRow>();
  for (const r of rows) {
    let entry = byType.get(r.type);
    if (!entry) {
      entry = { type: r.type, total: 0, bySite: {} };
      byType.set(r.type, entry);
    }
    const qty = Number(r.qty);
    entry.bySite[r.site] = qty;
    entry.total += qty;
  }
  return Array.from(byType.values());
}

export type OsszkeszletHaviRow = {
  type: string;
  months: { label: string; be: number; ki: number }[];
};

// Típusonkénti havi Be/Ki összesítés, az utolsó `monthsBack` naptári hónapra
// (a jelenlegit is beleértve) — sosincs típusok közti összeadás, csak
// ugyanaz a típus, hónapról hónapra. Kimarad innen ugyanaz a két dolog, mint
// getOsszkeszlet()-ből: a telephelyek közti mozgatás (mozgatas/mozgatas_be —
// nem valódi készletváltozás, csak áthelyezés) és a felvásárláshoz kötött
// tételek (purchase_id not null — a Havi fülön már darabonként látszanak).
export async function getOsszkeszletHavibontas(monthsBack = 4): Promise<OsszkeszletHaviRow[]> {
  await requireViewPermission("keszlet");
  // Minden aktív típusra és minden hónapra ad vissza egy sort (0-val
  // feltöltve, ha nem volt mozgás), így a UI-nak nem kell hiányzó
  // típus/hónap kombinációkat pótolnia.
  const rows = await query<{ type: string; sort_order: number; month_key: string; be: string; ki: string }>(
    `with months as (
       select date_trunc('month', ${BUDAPEST_NOW_DATE}) - (n || ' months')::interval as month_start
       from generate_series(0, $1 - 1) as n
     ),
     types as (
       select distinct t.id, t.name, t.sort_order
       from pallet_types t
       join site_active_types sat on sat.type_id = t.id
       where t.name <> 'Csere'
     )
     select ty.name as type, ty.sort_order,
       to_char(mo.month_start, 'YYYY-MM') as month_key,
       coalesce(sum(m.qty) filter (where m.direction = 'be'), 0) as be,
       coalesce(sum(m.qty) filter (where m.direction = 'ki'), 0) as ki
     from types ty
     cross join months mo
     left join keszlet_movements m
       on m.type_id = ty.id
       and m.direction in ('be', 'ki') and m.purchase_id is null
       and date_trunc('month', m.created_at at time zone 'Europe/Budapest') = mo.month_start
     group by ty.name, ty.sort_order, mo.month_start
     order by ty.sort_order, mo.month_start`,
    [monthsBack]
  );

  const monthLabel = (key: string) => {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("hu-HU", { month: "short" });
  };

  const byType = new Map<string, OsszkeszletHaviRow>();
  for (const r of rows) {
    let entry = byType.get(r.type);
    if (!entry) {
      entry = { type: r.type, months: [] };
      byType.set(r.type, entry);
    }
    entry.months.push({ label: monthLabel(r.month_key), be: Number(r.be), ki: Number(r.ki) });
  }
  return Array.from(byType.values());
}

export async function getSiteSnapshot(site: string) {
  const jog = await requireAnyViewPermission(["keszlet", "keszlet_sajat"]);
  ellenorizdSajatKeszletHatokor(jog, site);
  const [stock, movements, types, incoming] = await Promise.all([
    getStock(site),
    getMovements(site),
    getActiveTypes(site),
    getIncoming(site),
  ]);
  return { stock, movements, types, incoming };
}

// --- Nyíregyháza — Havi fül ---

export type PaymentMethod = "keszpenz" | "atutalas";

export type PurchaseRow = {
  id: string;
  date: string;
  day_key: string;
  type: string;
  qty: number;
  unit_price: number;
  total: number;
  seller: string;
  pending: boolean;
  payment_method: PaymentMethod;
  created_by: string | null;
};

export type PriceRow = { name: string; default_price: number | null };

// Gyors rögzítéshez (Havi fül és a /felvasarlas mobil nézet) azok a típusok
// jelennek meg, amik Nyíregyházán aktívak ÉS van beárazva.
export async function getNyiregyhazaPurchasePrices(): Promise<PriceRow[]> {
  await requireAnyViewPermission(["keszlet", "felvasarlas_mobil"]);
  return query<PriceRow>(
    `select t.name, t.default_price
     from pallet_types t
     join site_active_types sat on sat.type_id = t.id
     join sites s on s.id = sat.site_id
     where s.name = 'Nyíregyháza' and t.default_price is not null
     order by t.sort_order, t.id`
  );
}

export async function getHaviSnapshot() {
  await requireViewPermission("keszlet");
  // FONTOS (2026-09-18): korábban "limit 60" volt — napi 20–35 vétel mellett
  // ez alig 2-3 nap, így a "Korábbi napok" összegei csonkák voltak, a pár
  // napnál régebbi kifizetésre váró tétel pedig eltűnt a listából (a
  // Kifizetés gomb viszont azt is kifizette). Most: a folyó hónap ÉS az
  // utolsó 7 nap (hónap elején is javítható legyen a tegnapi hiba), valamint
  // MINDEN kifizetésre váró tétel, dátumtól függetlenül.
  const purchases = await query<PurchaseRow>(
    `select p.id::text, to_char(p.created_at at time zone 'Europe/Budapest', '${TIME_FMT}') as date,
       to_char(p.created_at at time zone 'Europe/Budapest', 'YYYY-MM-DD') as day_key, t.name as type,
       p.qty, p.unit_price, p.total, p.seller, p.pending, p.payment_method, p.created_by
     from nyiregyhaza_purchases p
     join pallet_types t on t.id = p.type_id
     where p.pending
        or (p.created_at at time zone 'Europe/Budapest')::date >= least(
             date_trunc('month', now() at time zone 'Europe/Budapest')::date,
             ${BUDAPEST_NOW_DATE} - 7
           )
     order by p.created_at desc`
  );
  const kasszaRows = await query<{ total: string }>(
    `select coalesce(sum(amount), 0) as total from kassza_movements`
  );
  // Mai kiadás: MINDEN mai kassza-kifizetés — nem csak a felvásárlás/csere/kifizetésre
  // váró tétel kiegyenlítése (category = 'felvasarlas'), hanem az "Egyéb kassza-mozgás"
  // kártyán kézzel rögzített kiadás (pl. számla) is. A kassza_movements a tényleges
  // pénzmozgás pillanatában íródik (pl. Kifizetésnél a kiegyenlítéskor, nem a tétel
  // felvételekor), ezért a created_at itt már önmagában helyesen a "mai" napot jelenti.
  const todayExpenseRows = await query<{ total: string; today_key: string }>(
    `select coalesce(sum(-amount), 0) as total, to_char(${BUDAPEST_NOW_DATE}, 'YYYY-MM-DD') as today_key
     from kassza_movements
     where amount < 0
       and (created_at at time zone 'Europe/Budapest')::date = ${BUDAPEST_NOW_DATE}`
  );
  const priceRows = await getNyiregyhazaPurchasePrices();
  // Típusonkénti darabszám-számláló: havi (aktuális naptári hónap) és mai összesítés.
  // Pending tétel is beleszámít, mert a darabszám a felvételkor azonnal a készletben van.
  const typeCounterRows = await query<{
    type: string;
    monthly_qty: string;
    daily_qty: string;
  }>(
    `select t.name as type,
       coalesce(sum(p.qty) filter (
         where date_trunc('month', p.created_at at time zone 'Europe/Budapest')
             = date_trunc('month', ${BUDAPEST_NOW_DATE})
       ), 0) as monthly_qty,
       coalesce(sum(p.qty) filter (
         where (p.created_at at time zone 'Europe/Budapest')::date = ${BUDAPEST_NOW_DATE}
       ), 0) as daily_qty
     from pallet_types t
     join site_active_types sat on sat.type_id = t.id
     join sites s on s.id = sat.site_id
     left join nyiregyhaza_purchases p on p.type_id = t.id
     where s.name = 'Nyíregyháza' and t.default_price is not null
     group by t.name, t.id
     order by t.sort_order, t.id`
  );
  return {
    purchases,
    kassza: Number(kasszaRows[0]?.total ?? 0),
    todayExpense: Number(todayExpenseRows[0]?.total ?? 0),
    todayKey: todayExpenseRows[0].today_key,
    typeCounters: typeCounterRows.map((r) => ({
      type: r.type,
      monthlyQty: Number(r.monthly_qty),
      dailyQty: Number(r.daily_qty),
    })),
    prices: priceRows,
  };
}

// Egy felvásárlás KÉSZLET-hatása (kassza nélkül) — a rögzítés (addPurchases)
// és a kifizetésre váró tétel módosítása (updatePendingPurchase) is ezt írja,
// hogy a "Csere" mindkét úton ugyanúgy (világos +db, szürke −db, esemény)
// kerüljön be. Korábban a módosítás mindig egyetlen "be" mozgást írt a tétel
// típusára, ami Csere esetén egy rejtett "Csere" készletet hozott létre, a
// világos/szürke pár pedig elveszett.
async function irjFelvasarlasKeszlethatast(
  q: Querier,
  p: {
    purchaseId: string;
    type: string;
    qty: number;
    unitPrice: number;
    total: number;
    seller: string;
    createdBy: string | null;
  }
) {
  const createdBy = p.createdBy ?? undefined;
  if (p.type === "Csere") {
    // A "Csere" nem önálló készlettétel: világos +db, szürke −db a Nyíregyháza készleten.
    await addMovement(q, { site: "Nyíregyháza", type: "EUR világos", direction: "be", qty: p.qty, partner: "Csere", purchaseId: p.purchaseId, createdBy });
    await addMovement(q, { site: "Nyíregyháza", type: "EUR szürke", direction: "ki", qty: p.qty, partner: "Csere", purchaseId: p.purchaseId, createdBy });
    await q(
      `insert into keszlet_events (site_id, kind, details, effect, purchase_id, created_by)
       values ((select id from sites where name = 'Nyíregyháza'), 'csere', $1, $2, $3, $4)`,
      [
        `${p.qty} db csere, ${p.unitPrice} Ft/db`,
        `világos +${p.qty} · szürke −${p.qty} · kassza −${p.total.toLocaleString("hu-HU")} Ft`,
        p.purchaseId,
        p.createdBy,
      ]
    );
    return;
  }

  // Havi fülről automatikusan bekerül a Nyíregyháza fül (tényleges készlet)
  // állományba is — a kifizetésre váró tétel darabszáma is azonnal itt van,
  // csak a kassza vár.
  await addMovement(q, {
    site: "Nyíregyháza",
    type: p.type,
    direction: "be",
    qty: p.qty,
    partner: p.seller || undefined,
    purchaseId: p.purchaseId,
    createdBy,
  });
}

type UjFelvasarlas = {
  type: string;
  qty: number;
  unitPrice: number;
  seller: string;
  pending: boolean;
  method: PaymentMethod;
  date: string | null;
  createdBy: string | null;
};

async function rogzitsFelvasarlast(q: Querier, input: UjFelvasarlas) {
  const total = input.qty * input.unitPrice;
  // Átutalással fizetett vétel: a készletet növeli, de a kasszát nem érinti —
  // az összeg banki átutalással rendeződik, nem készpénzből.
  const affectsKassza = !input.pending && input.method === "keszpenz";
  const rows = await q<{ id: string }>(
    `insert into nyiregyhaza_purchases (type_id, qty, unit_price, total, seller, pending, payment_method, created_at, created_by)
     values ((select id from pallet_types where name = $1), $2, $3, $4, $5, $6, $7, coalesce($8::timestamptz, now()), $9)
     returning id::text`,
    [input.type, input.qty, input.unitPrice, total, input.seller, input.pending, input.method, input.date, input.createdBy]
  );
  const purchaseId = rows[0].id;
  await irjFelvasarlasKeszlethatast(q, {
    purchaseId,
    type: input.type,
    qty: input.qty,
    unitPrice: input.unitPrice,
    total,
    seller: input.seller,
    createdBy: input.createdBy,
  });
  if (affectsKassza) {
    // Kasszaszempontból a Csere ugyanolyan kiadás, mint bármelyik más
    // felvásárlás — készpénzért vesszük.
    await q(
      `insert into kassza_movements (description, amount, purchase_id, created_by, category)
       values ($1, $2, $3, $4, 'felvasarlas')`,
      [
        input.type === "Csere"
          ? `Csere (${input.qty} db × ${input.unitPrice} Ft)`
          : `Felvásárlás — ${input.type} (${input.qty} db)`,
        -total,
        purchaseId,
        input.createdBy,
      ]
    );
  }
}

// Egy "Vétel" gombnyomás összes típusa egy hívásban, egy tranzakcióban (Havi
// fül gyors rögzítés / egyedi ár, /felvasarlas mobil nézet) — korábban a
// kliens típusonként külön hívta, így egy félúton elbukó mentés után az
// újrapróbálás a már rögzített típusokat megduplázta.
export async function addPurchases(input: {
  items: { type: string; qty: number; unitPrice: number }[];
  method?: PaymentMethod;
}) {
  await requireAnyEditPermission(["keszlet", "felvasarlas_mobil"]);
  const createdBy = await rogzitoNeve();
  const method: PaymentMethod = input.method ?? "keszpenz";
  if (method !== "keszpenz" && method !== "atutalas") {
    throw new Error(`Érvénytelen fizetési mód: ${String(method)}`);
  }
  for (const item of input.items) {
    ellenorizdDarabszam(item.qty, item.type);
    ellenorizdAr(item.unitPrice);
  }
  if (input.items.length === 0) return;
  await withTransaction(async (q) => {
    for (const item of input.items) {
      await rogzitsFelvasarlast(q, {
        type: item.type,
        qty: item.qty,
        unitPrice: item.unitPrice,
        seller: "",
        pending: false,
        method,
        date: null,
        createdBy: createdBy,
      });
    }
  });
}

// Visszavonja a felvásárlás összes hatását: mozgás(ok), kassza-tétel, esemény,
// majd maga a tétel.
async function torolFelvasarlast(q: Querier, id: string) {
  const purchaseRows = await q<{
    total: number;
    payment_method: string;
    pending: boolean;
  }>(`select total, payment_method, pending from nyiregyhaza_purchases where id = $1`, [id]);

  await q(`delete from keszlet_movements where purchase_id = $1`, [id]);
  const deletedKassza = await q<{ id: string }>(
    `delete from kassza_movements where purchase_id = $1 returning id`,
    [id]
  );
  await q(`delete from keszlet_events where purchase_id = $1`, [id]);
  await q(`delete from nyiregyhaza_purchases where id = $1`, [id]);

  // Régebbi, eladónkénti gyűjtő kifizetésből származó (a konkrét tételhez nem
  // közvetlenül kötött) kassza-terhelést nem tudtuk a fenti purchase_id
  // alapján megtalálni és törölni — ilyenkor a törölt tétel összegét
  // manuálisan visszaírjuk a kasszába, hogy a pénz ne vesszen el.
  if (deletedKassza.length === 0 && purchaseRows.length > 0) {
    const p = purchaseRows[0];
    if (!p.pending && p.payment_method === "keszpenz") {
      await q(
        `insert into kassza_movements (description, amount, category) values ($1, $2, 'felvasarlas')`,
        [`Törölt felvásárlási tétel visszaírása`, Number(p.total)]
      );
    }
  }
}

export async function deletePurchase(id: string) {
  await deletePurchases([id]);
}

// A "Korábbi napok" egy sora (egy nap egy típusa) több tételt is összevonhat —
// ezek együtt, egy tranzakcióban törlődnek, nem félig.
export async function deletePurchases(ids: string[]) {
  await requireEditPermission("keszlet");
  ids.forEach((id) => ellenorizdAzonosito(id));
  if (ids.length === 0) return;
  await withTransaction(async (q) => {
    for (const id of ids) await torolFelvasarlast(q, id);
  });
}

// --- Kifizetésre váró tételek (nyitvatartáson túl/hétvégén leadott felvásárlás) ---

async function alapar(q: Querier, type: string): Promise<number> {
  const priceRows = await q<{ default_price: number | null }>(
    `select default_price from pallet_types where name = $1`,
    [type]
  );
  return priceRows[0]?.default_price ?? 0;
}

export async function addPendingPurchases(input: {
  seller: string;
  date: string;
  /** unitPrice: egyedi ár Ft/db — ha nincs megadva, a típus irányára. */
  items: { type: string; qty: number; unitPrice?: number }[];
}) {
  await requireEditPermission("keszlet");
  const createdBy = await rogzitoNeve();
  const seller = input.seller.trim();
  if (!seller) throw new Error("A név megadása kötelező.");
  ellenorizdDatum(input.date);
  for (const item of input.items) {
    ellenorizdDarabszam(item.qty, item.type);
    if (item.unitPrice !== undefined) ellenorizdAr(item.unitPrice);
  }
  if (input.items.length === 0) return;
  await withTransaction(async (q) => {
    for (const item of input.items) {
      await rogzitsFelvasarlast(q, {
        type: item.type,
        qty: item.qty,
        unitPrice: item.unitPrice ?? (await alapar(q, item.type)),
        seller,
        pending: true,
        method: "keszpenz",
        date: input.date,
        createdBy: createdBy,
      });
    }
  });
}

export async function updatePendingPurchase(
  id: string,
  input: { type: string; qty: number; date: string }
) {
  await requireEditPermission("keszlet");
  const createdBy = await rogzitoNeve();
  ellenorizdAzonosito(id);
  ellenorizdDarabszam(input.qty, input.type);
  ellenorizdDatum(input.date);
  await withTransaction(async (q) => {
    const unitPrice = await alapar(q, input.type);
    const total = input.qty * unitPrice;
    const rows = await q<{ seller: string }>(
      `update nyiregyhaza_purchases
       set type_id = (select id from pallet_types where name = $1),
           qty = $2, unit_price = $3, total = $4, created_at = $5::timestamptz
       where id = $6 and pending = true
       returning seller`,
      [input.type, input.qty, unitPrice, total, input.date, id]
    );
    if (rows.length === 0) return;
    // A tétel teljes készlet-hatását (mozgás(ok), Csere esetén az esemény is)
    // újraírjuk az új típusra/darabszámra.
    await q(`delete from keszlet_movements where purchase_id = $1`, [id]);
    await q(`delete from keszlet_events where purchase_id = $1`, [id]);
    await irjFelvasarlasKeszlethatast(q, {
      purchaseId: id,
      type: input.type,
      qty: input.qty,
      unitPrice,
      total,
      seller: rows[0].seller,
      createdBy: createdBy,
    });
  });
}

export async function payPendingSeller(seller: string) {
  await requireEditPermission("keszlet");
  const createdBy = await rogzitoNeve();
  await withTransaction(async (q) => {
    // Egyetlen "update ... returning": ha két kifizetés egyszerre indul, a
    // tételeket csak az egyik kapja meg, így a kassza nem terhelődik duplán.
    const rows = await q<{ id: string; total: number }>(
      `update nyiregyhaza_purchases set pending = false, paid_at = now()
       where seller = $1 and pending = true
       returning id::text, total`,
      [seller]
    );
    // Tételenként külön kassza-sor (purchase_id-hoz kötve), hogy egy később
    // törölt tétel pénze pontosan visszaíródjon a kasszába — nem egy közös,
    // eladónkénti gyűjtő összeg, amit nem lehetne utólag tételre bontani.
    for (const r of rows) {
      await q(
        `insert into kassza_movements (description, amount, purchase_id, created_by, category)
         values ($1, $2, $3, $4, 'felvasarlas')`,
        [`Kifizetés — ${seller}`, -Number(r.total), r.id, createdBy ?? null]
      );
    }
  });
}

export async function addKasszaMovement(description: string, amount: number) {
  await requireEditPermission("keszlet");
  const createdBy = await rogzitoNeve();
  if (!description.trim()) throw new Error("A leírás megadása kötelező.");
  if (!Number.isInteger(amount) || amount === 0) {
    throw new Error(`Érvénytelen összeg: ${String(amount)}`);
  }
  await query(`insert into kassza_movements (description, amount, created_by) values ($1, $2, $3)`, [
    description,
    amount,
    createdBy,
  ]);
}

export type KasszaMovementRow = {
  id: string;
  date: string;
  description: string;
  amount: number;
  created_by: string | null;
};

export async function getKasszaMovements(): Promise<KasszaMovementRow[]> {
  await requireViewPermission("keszlet");
  // Minden felvásárláshoz kapcsolódó kiadás (felvásárlás, csere, kifizetésre
  // váró tétel kiegyenlítése — category = 'felvasarlas') nagyon elszaporodik —
  // ezeket havonta egy összesítő sorba vonjuk össze, mindig a lista tetején,
  // a folyó hónap kerül legfelülre. Az egyéb tételek — kézzel felvitt kiadás
  // (pl. számla), bevétel, nyitó kassza — továbbra is egyenként látszanak.
  const purchaseMonths = await query<{
    month_key: string;
    month_label: string;
    cnt: number;
    total: number;
  }>(
    `select to_char(date_trunc('month', created_at at time zone 'Europe/Budapest'), 'YYYY-MM') as month_key,
            to_char(date_trunc('month', created_at at time zone 'Europe/Budapest'), 'mon. YYYY') as month_label,
            count(*)::int as cnt,
            sum(amount)::int as total
     from kassza_movements
     where category = 'felvasarlas'
     group by 1, 2
     order by 1 desc`
  );

  const otherRows = await query<KasszaMovementRow>(
    `select id::text, to_char(created_at at time zone 'Europe/Budapest', '${TIME_FMT}') as date, description, amount, created_by
     from kassza_movements
     where category <> 'felvasarlas'
     order by created_at desc
     limit 200`
  );

  const aggregated: KasszaMovementRow[] = purchaseMonths.map((m) => ({
    id: `purchase-${m.month_key}`,
    date: m.month_label,
    description: `Felvásárlás (${m.cnt} tétel)`,
    amount: Number(m.total),
    created_by: null,
  }));

  return [...aggregated, ...otherRows];
}

// --- Nyíregyháza — fő fül ---

export type EventRow = {
  id: string;
  date: string;
  kind: "csere" | "szet" | "havi-zaras" | "mozgas" | "leltar";
  details: string;
  effect: string;
  created_by: string | null;
};

export async function getNyiregyhazaFoSnapshot() {
  await requireViewPermission("keszlet");
  // A "Legutóbbi mozgások" a be/ki szállítást, a telephelyek közti mozgatást
  // ('mozgas'), a Vegyes EUR szétválogatást ('szet') és a leltári korrekciót
  // ('leltar') mutatja — ez utóbbi kettő 2026-09-18-ig sehol nem látszott
  // Nyíregyházán, pedig változtatja a készletet. A 'csere' kimarad: annak a
  // tételenkénti története a Havi fülön van.
  const [stock, events, incoming] = await Promise.all([
    getStock("Nyíregyháza"),
    query<EventRow>(
      `select id::text, to_char(created_at at time zone 'Europe/Budapest', '${TIME_FMT}') as date, kind, details, effect, created_by
       from keszlet_events
       where site_id = (select id from sites where name = 'Nyíregyháza')
         and kind in ('mozgas', 'szet', 'leltar')
       order by created_at desc
       limit 20`
    ),
    getIncoming("Nyíregyháza"),
  ]);
  return { stock, events, incoming };
}

// Szétválogatható ("vegyes") készlettételek. A "Vegyes EUR" a klasszikus
// EUR-vegyes — abból világos/szürke/törött lesz. A "Vegyes" a mindenes
// halom (Szakoly/Balkány): olyan szállítmány, amiben EUR-on kívül színes,
// egyutas is van — ezért bármelyik, a telepen aktív típusra bontható.
// (Nem exportálható: a "use server" fájl csak async függvényeket adhat ki —
// a kliensoldali párja a telephelyek-view VEGYES_FORRASOK listája.)
const SZETVALOGATAS_FORRASOK = ["Vegyes EUR", "Vegyes"];

/**
 * Szétválogatás: a forrás-típusból levont mennyiség a megadott típusokra
 * oszlik szét, ugyanazon a telephelyen. Egyensúlyban lévő átalakítás — a
 * levonás pontosan annyi, amennyi a célokra kerül.
 */
export async function recordSzetvalogatas(input: {
  site: string;
  /** Alapértelmezés a régi viselkedés szerint: "Vegyes EUR". */
  source?: string;
  items: { type: string; qty: number }[];
}) {
  // A telepi (keszlet_sajat) jogú dolgozó is szétválogathat a saját telepén —
  // ő pakolja szét a vegyes halmot, ld. recordInventoryCount.
  const jog = await requireAnyEditPermission(["keszlet", "keszlet_sajat"]);
  const createdBy = await rogzitoNeve();
  ellenorizdSajatKeszletHatokor(jog, input.site);
  ellenorizdTelephely(input.site);
  const source = input.source ?? "Vegyes EUR";
  if (!SZETVALOGATAS_FORRASOK.includes(source)) {
    throw new Error(`Ebből a típusból nem lehet szétválogatni: ${source}`);
  }
  if (!Array.isArray(input.items)) throw new Error("Hiányzó szétválogatási tételek.");

  // Ugyanaz a típus többször is jöhet (pl. összecsúszott sorok) — összevonjuk.
  const darabok = new Map<string, number>();
  for (const tetel of input.items) {
    const type = ellenorizdTipusNev(tetel?.type);
    const qty = ellenorizdDarabszam(tetel?.qty, `${type} darabszám`, true);
    if (qty === 0) continue;
    if (type === source) {
      throw new Error("A szétválogatás célja nem lehet ugyanaz a típus.");
    }
    darabok.set(type, (darabok.get(type) ?? 0) + qty);
  }
  const total = Array.from(darabok.values()).reduce((s, q) => s + q, 0);
  if (total === 0) return;

  // Csak a telepen aktív típusokra lehet szétválogatni — különben olyan
  // készlet keletkezne, ami a telep listáiban meg sem jelenik.
  const aktiv = await getActiveTypes(input.site);
  for (const type of darabok.keys()) {
    if (!aktiv.includes(type)) {
      throw new Error(`Ez a típus nincs aktiválva ezen a telephelyen: ${type}`);
    }
  }

  // Közös movement_group: a szétválogatás egy kiegyensúlyozott átalakítás
  // (vegyes −, a célok +). A sorok a "Legutóbbi mozgások" listából
  // korábban egyenként voltak törölhetők, és egy féloldalas törlés elrontotta
  // az egyensúlyt — a csoport miatt most együtt vonódnak vissza (deleteMovement).
  const movementGroup = randomUUID();
  await withTransaction(async (q) => {
    // A forrásban lévő mennyiséget a szerver ellenőrzi, a tranzakción belüli
    // friss állapotból: a kliensé a párbeszéd megnyitásakori kép lenne.
    const keszlet = await q<{ qty: string }>(
      `select coalesce(sum(case
         when direction = 'be' then qty
         when direction = 'mozgatas_be' and elfogadva_at is not null then qty
         when direction in ('ki','mozgatas') then -qty
         else 0
       end), 0) as qty
       from keszlet_movements
       where site_id = (select id from sites where name = $1)
         and type_id = (select id from pallet_types where name = $2)`,
      [input.site, source]
    );
    const elerheto = Number(keszlet[0]?.qty ?? 0);
    if (total > elerheto) {
      throw new Error(`Csak ${elerheto} db ${source} van a telepen, ennyit nem lehet szétválogatni: ${total} db.`);
    }

    await addMovement(q, { site: input.site, type: source, direction: "ki", qty: total, partner: "Szétválogatás", createdBy: createdBy ?? undefined, movementGroup });
    for (const [type, qty] of darabok) {
      await addMovement(q, { site: input.site, type, direction: "be", qty, partner: "Szétválogatás", createdBy: createdBy ?? undefined, movementGroup });
    }
    // A "Legutóbbi mozgások" görgetett esemény-feed egyelőre csak Nyíregyházán van —
    // a többi telepen a nyers mozgás-lista (getMovements) már mutatja ugyanezt.
    if (input.site === "Nyíregyháza") {
      const reszletek = Array.from(darabok, ([type, qty]) => `${type} +${qty}`).join(" · ");
      await q(
        `insert into keszlet_events (site_id, kind, details, effect, created_by, movement_group)
         values ((select id from sites where name = 'Nyíregyháza'), 'szet', $1, $2, $3, $4)`,
        [
          `${source} szétválogatása`,
          `${source} −${total} · ${reszletek}`,
          createdBy,
          movementGroup,
        ]
      );
    }
  });
}

// --- Leltár ---

// A "nyilvántartott" mennyiséget NEM a kliens küldi: az a párbeszéd
// megnyitásakori állapot lenne, és ha közben más rögzített egy mozgást, a
// korrekció pont annyival lenne hibás. A megszámolt darabszám a valóság, a
// különbséget ezért a szerver számolja a friss készletből, a korrekciós
// mozgással egy tranzakcióban. A visszatérési érték az, amit ténylegesen
// rögzítettünk — a kliens ezt írja ki.
export async function recordInventoryCount(input: {
  site: string;
  type: string;
  countedQty: number;
  accepted: boolean;
  comment?: string;
}): Promise<{ expectedQty: number; countedQty: number; diff: number }> {
  const jog = await requireAnyEditPermission(["keszlet", "keszlet_sajat"]);
  const createdBy = await rogzitoNeve();
  ellenorizdSajatKeszletHatokor(jog, input.site);
  ellenorizdTelephely(input.site);
  ellenorizdDarabszam(input.countedQty, input.type, true);
  return withTransaction(async (q) => {
    const stockRows = await q<{ qty: string }>(
      `select coalesce(sum(case
         when direction = 'be' then qty
         when direction = 'mozgatas_be' and elfogadva_at is not null then qty
         when direction in ('ki','mozgatas') then -qty
         else 0
       end), 0) as qty
       from keszlet_movements
       where site_id = (select id from sites where name = $1)
         and type_id = (select id from pallet_types where name = $2)`,
      [input.site, input.type]
    );
    const expectedQty = Number(stockRows[0]?.qty ?? 0);
    const diff = input.countedQty - expectedQty;
    await q(
      `insert into inventory_counts (site_id, type_id, expected_qty, counted_qty, accepted, comment, created_by)
       values ((select id from sites where name = $1), (select id from pallet_types where name = $2), $3, $4, $5, $6, $7)`,
      [input.site, input.type, expectedQty, input.countedQty, input.accepted, input.comment ?? null, createdBy]
    );
    if (input.accepted && diff !== 0) {
      // A korrekciós mozgás és (Nyíregyházán) a hozzá tartozó esemény közös
      // movement_group-ot kap, hogy a "Legutóbbi mozgások" listából egyben
      // visszavonható legyen — ld. deleteMovementEvent.
      const movementGroup = randomUUID();
      await addMovement(q, {
        site: input.site,
        type: input.type,
        direction: diff > 0 ? "be" : "ki",
        qty: Math.abs(diff),
        partner: "Leltári korrekció",
        createdBy: createdBy ?? undefined,
        movementGroup,
      });
      // Az esemény-feed egyelőre csak Nyíregyházán van; a többi telepen a nyers
      // mozgás-lista már mutatja a korrekciót (ld. recordSzetvalogatas).
      if (input.site === "Nyíregyháza") {
        await q(
          `insert into keszlet_events (site_id, kind, details, effect, created_by, movement_group)
           values ((select id from sites where name = 'Nyíregyháza'), 'leltar', $1, $2, $3, $4)`,
          [
            `${input.type} — leltári korrekció${input.comment ? ` (${input.comment})` : ""}`,
            `nyilvántartott ${expectedQty} → megszámolt ${input.countedQty} · ${diff > 0 ? "+" : "−"}${Math.abs(diff)}`,
            createdBy,
            movementGroup,
          ]
        );
      }
    }
    return { expectedQty, countedQty: input.countedQty, diff };
  });
}

// --- Admin: típusok és árak ---

export type TypeAdminRow = {
  id: number;
  name: string;
  default_price: number | null;
  sites: string[];
};

export async function getAllTypesAdmin(): Promise<TypeAdminRow[]> {
  await requireViewPermission("beallitasok");
  return query<TypeAdminRow>(
    `select t.id, t.name, t.default_price,
       coalesce(array_agg(s.name) filter (where s.name is not null), '{}') as sites
     from pallet_types t
     left join site_active_types sat on sat.type_id = t.id
     left join sites s on s.id = sat.site_id
     group by t.id, t.name, t.default_price
     order by t.sort_order, t.id`
  );
}

export async function updateTypePrice(typeId: number, price: number | null) {
  await requireEditPermission("keszlet");
  await query(`update pallet_types set default_price = $1 where id = $2`, [price, typeId]);
}

export async function setTypeSiteActive(typeId: number, site: string, active: boolean) {
  await requireEditPermission("keszlet");
  if (active) {
    await query(
      `insert into site_active_types (site_id, type_id)
       values ((select id from sites where name = $1), $2)
       on conflict do nothing`,
      [site, typeId]
    );
  } else {
    await query(
      `delete from site_active_types
       where site_id = (select id from sites where name = $1) and type_id = $2`,
      [site, typeId]
    );
  }
}

// --- Archívum: egy lezárt (vagy folyó) hónap összesítése ---
//
// Minden szám a nyers tételekből számolódik, nincs külön havi zárás — így egy
// utólag javított tétel a korábbi hónapok összesítőjében is helyesen jelenik
// meg. A mozgatás a cél telepen az ÁTVÉTEL napjával számít bele (elfogadva_at),
// mert a készletbe is akkor kerül; az át nem vett (úton lévő) tétel egyik
// telep hónapjában sem szerepel.

export type ArchivumHonap = { monthKey: string; label: string };

export type ArchivumSorRow = {
  site: string;
  type: string;
  nyito: number;
  be: number;
  ki: number;
  zaro: number;
};

export type ArchivumFelvasarlasRow = {
  type: string;
  qty: number;
  /** null, ha a régi rendszerből csak darabszám van meg. */
  total: number | null;
  /** true: a rendszer indulása előtti, kézzel átvett adat (felvasarlas_archivum). */
  archiv: boolean;
};

// Egy hónap felvásárlása típusonként: az élő tételekből (nyiregyhaza_purchases)
// és a régi rendszerből átvett archív sorokból. Ha ugyanarra a hónap+típus
// párra mindkettő van, az ÉLŐ adat nyer — az a tételes, ellenőrizhető.
const FELVASARLAS_HAVI_SQL = `
  with elo as (
    select t.id as type_id, t.name as type, t.sort_order,
      sum(p.qty)::int as qty, sum(p.total)::int as total, false as archiv
    from nyiregyhaza_purchases p
    join pallet_types t on t.id = p.type_id
    where (p.created_at at time zone 'Europe/Budapest')::date >= $1::date
      and (p.created_at at time zone 'Europe/Budapest')::date < ($1::date + interval '1 month')::date
    group by t.id, t.name, t.sort_order
  ),
  archiv as (
    select t.id as type_id, t.name as type, t.sort_order,
      sum(a.qty)::int as qty, sum(a.total)::int as total, true as archiv
    from archiv_felvasarlas a
    join pallet_types t on t.id = a.type_id
    where a.nap >= $1::date and a.nap < ($1::date + interval '1 month')::date
    group by t.id, t.name, t.sort_order
  ),
  egyesitve as (
    select * from elo
    union all
    select * from archiv a where not exists (select 1 from elo e where e.type_id = a.type_id)
  )
`;

export type ArchivumSnapshot = {
  monthKey: string;
  keszlet: ArchivumSorRow[];
  felvasarlas: ArchivumFelvasarlasRow[];
  kassza: { bevetel: number; kiadas: number; zaroEgyenleg: number };
  /** A régi rendszer befizetései erre a hónapra (a telepre bevitt készpénz). */
  befizetes: { db: number; osszeg: number };
};

function honapCimke(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  const raw = new Date(y, m - 1, 1).toLocaleDateString("hu-HU", { year: "numeric", month: "long" });
  return raw.replace(/\.$/, "");
}

export async function getArchivumHonapok(): Promise<ArchivumHonap[]> {
  await requireViewPermission("keszlet");
  const rows = await query<{ month_key: string }>(
    `with hatar as (
       select least(
         coalesce((select min(created_at) from keszlet_movements), now()),
         coalesce((select min(created_at) from nyiregyhaza_purchases), now()),
         -- A régi rendszerből átvett hónapok is bekerülnek a listába.
         coalesce((select min(nap)::timestamptz from archiv_felvasarlas), now())
       ) at time zone 'Europe/Budapest' as elso
     )
     select to_char(g, 'YYYY-MM') as month_key
     from hatar
     cross join lateral generate_series(
       date_trunc('month', hatar.elso),
       date_trunc('month', now() at time zone 'Europe/Budapest'),
       interval '1 month'
     ) as g
     order by 1 desc`
  );
  return rows.map((r) => ({ monthKey: r.month_key, label: honapCimke(r.month_key) }));
}

export async function getArchivumSnapshot(monthKey: string): Promise<ArchivumSnapshot> {
  await requireViewPermission("keszlet");
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    throw new Error(`Érvénytelen hónap: ${String(monthKey)}`);
  }
  const hoKezd = `${monthKey}-01`;

  // Nyitó = a hónap kezdete előtti összes mozgás egyenlege; Be/Ki = a hónapban
  // történt tételek. A "mikor" a készletbe kerülés ideje (mozgatásnál az átvétel).
  const keszletRows = await query<{
    site: string;
    type: string;
    nyito: number;
    be: number;
    ki: number;
  }>(
    `with hatar as (
       select $1::date as ho_kezd, ($1::date + interval '1 month')::date as ho_veg
     ),
     tetel as (
       select m.site_id, m.type_id,
         (case when m.direction = 'mozgatas_be' then m.elfogadva_at else m.created_at end
            at time zone 'Europe/Budapest')::date as mikor,
         case when m.direction in ('be','mozgatas_be') then m.qty else -m.qty end as elojeles,
         case when m.direction in ('be','mozgatas_be') then m.qty else 0 end as be,
         case when m.direction in ('ki','mozgatas') then m.qty else 0 end as ki
       from keszlet_movements m
       where m.direction <> 'mozgatas_be' or m.elfogadva_at is not null
     )
     select s.name as site, t.name as type,
       coalesce(sum(x.elojeles) filter (where x.mikor < h.ho_kezd), 0)::int as nyito,
       coalesce(sum(x.be) filter (where x.mikor >= h.ho_kezd), 0)::int as be,
       coalesce(sum(x.ki) filter (where x.mikor >= h.ho_kezd), 0)::int as ki
     from tetel x
     join sites s on s.id = x.site_id
     join pallet_types t on t.id = x.type_id
     cross join hatar h
     where x.mikor < h.ho_veg
     group by s.name, t.name, t.sort_order, t.id
     order by s.name, t.sort_order, t.id`,
    [hoKezd]
  );

  const felvasarlasRows = await query<{
    type: string;
    qty: number;
    total: number | null;
    archiv: boolean;
  }>(
    `${FELVASARLAS_HAVI_SQL}
     select type, qty, total, archiv from egyesitve order by sort_order, type_id`,
    [hoKezd]
  );

  const kasszaRows = await query<{ bevetel: number; kiadas: number; zaro: number }>(
    `with hatar as (
       select $1::date as ho_kezd, ($1::date + interval '1 month')::date as ho_veg
     ),
     tetel as (
       select amount, (created_at at time zone 'Europe/Budapest')::date as mikor
       from kassza_movements
     )
     select
       coalesce(sum(t.amount) filter (where t.amount > 0 and t.mikor >= h.ho_kezd and t.mikor < h.ho_veg), 0)::int as bevetel,
       coalesce(sum(-t.amount) filter (where t.amount < 0 and t.mikor >= h.ho_kezd and t.mikor < h.ho_veg), 0)::int as kiadas,
       coalesce(sum(t.amount) filter (where t.mikor < h.ho_veg), 0)::int as zaro
     from tetel t
     cross join hatar h`,
    [hoKezd]
  );

  const befizetesRows = await query<{ db: number; osszeg: number }>(
    `select count(*)::int as db, coalesce(sum(amount), 0)::int as osszeg
     from archiv_befizetes
     where nap >= $1::date and nap < ($1::date + interval '1 month')::date`,
    [hoKezd]
  );

  return {
    monthKey,
    befizetes: {
      db: Number(befizetesRows[0]?.db ?? 0),
      osszeg: Number(befizetesRows[0]?.osszeg ?? 0),
    },
    keszlet: keszletRows
      .map((r) => ({
        site: r.site,
        type: r.type,
        nyito: Number(r.nyito),
        be: Number(r.be),
        ki: Number(r.ki),
        zaro: Number(r.nyito) + Number(r.be) - Number(r.ki),
      }))
      // Az adott hónapban érintetlen, nulla készletű típusok kimaradnak.
      .filter((r) => r.nyito !== 0 || r.be !== 0 || r.ki !== 0 || r.zaro !== 0),
    felvasarlas: felvasarlasRows.map((r) => ({
      type: r.type,
      qty: Number(r.qty),
      total: r.total === null ? null : Number(r.total),
      archiv: r.archiv,
    })),
    kassza: {
      bevetel: Number(kasszaRows[0]?.bevetel ?? 0),
      kiadas: Number(kasszaRows[0]?.kiadas ?? 0),
      zaroEgyenleg: Number(kasszaRows[0]?.zaro ?? 0),
    },
  };
}

// Egy teljes év felvásárlása hónapról hónapra, típusonként — a Nyíregyháza
// archív nyitó (éves) nézetéhez. Ugyanaz az élő + archív egyesítés, mint a
// havi nézetben, csak 12 hónapra egyszerre.
export type ArchivumEvRow = {
  monthKey: string;
  type: string;
  qty: number;
  total: number | null;
  archiv: boolean;
};

export async function getArchivumEv(year: number): Promise<ArchivumEvRow[]> {
  await requireViewPermission("keszlet");
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error(`Érvénytelen év: ${String(year)}`);
  }
  const rows = await query<{
    month_key: string;
    type: string;
    qty: number;
    total: number | null;
    archiv: boolean;
  }>(
    `with elo as (
       select to_char(p.created_at at time zone 'Europe/Budapest', 'YYYY-MM') as month_key,
         t.id as type_id, t.name as type, t.sort_order,
         sum(p.qty)::int as qty, sum(p.total)::int as total, false as archiv
       from nyiregyhaza_purchases p
       join pallet_types t on t.id = p.type_id
       where extract(year from (p.created_at at time zone 'Europe/Budapest')) = $1
       group by 1, 2, 3, 4
     ),
     archiv as (
       select to_char(a.nap, 'YYYY-MM') as month_key,
         t.id as type_id, t.name as type, t.sort_order,
         sum(a.qty)::int as qty, sum(a.total)::int as total, true as archiv
       from archiv_felvasarlas a
       join pallet_types t on t.id = a.type_id
       where extract(year from a.nap) = $1
       group by 1, 2, 3, 4
     )
     select month_key, type, sort_order, qty, total, archiv from elo
     union all
     select a.month_key, a.type, a.sort_order, a.qty, a.total, a.archiv from archiv a
     where not exists (
       select 1 from elo e where e.month_key = a.month_key and e.type_id = a.type_id
     )
     order by sort_order, month_key`,
    [year]
  );
  return rows.map((r) => ({
    monthKey: r.month_key,
    type: r.type,
    qty: Number(r.qty),
    total: r.total === null ? null : Number(r.total),
    archiv: r.archiv,
  }));
}

// Az "Év összesen" nézet kimutatásaihoz: havi befizetés és napi aktivitás.
// A felvásárlás típus × hónap sorait a getArchivumEv adja.
export type ArchivumEvKimutatas = {
  /** Havonta a telepre bevitt készpénz (befizetés). */
  befizetes: { monthKey: string; osszeg: number; alkalom: number }[];
  /** Havonta: hány napon volt felvásárlás, napi átlag, legerősebb nap. */
  napok: {
    monthKey: string;
    aktivNapok: number;
    atlagDb: number;
    legjobbNap: string;
    legjobbDb: number;
  }[];
  /**
   * Havonta az átutalással fizetett felvásárlás — ez benne van a havi
   * felvásárlási összegben, de a kasszából NEM ment ki (banki átutalás),
   * ezért a készpénz-kimutatásban külön is megjelenik. A régi rendszerből
   * átvett hónapokban nincs ilyen bontás, ott 0.
   */
  atutalas: { monthKey: string; osszeg: number; db: number }[];
};

export async function getArchivumEvKimutatas(year: number): Promise<ArchivumEvKimutatas> {
  await requireViewPermission("keszlet");
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error(`Érvénytelen év: ${String(year)}`);
  }
  // Befizetés: a régi rendszer hónapjaiban az archiv_befizetes, az élő
  // rendszerben a kassza bevétel-oldali "egyéb" tételei. A nyitóegyenleg
  // ("NYITÓ …") NEM befizetés, csak az induló pénzkészlet átvezetése, ezért
  // kimarad; az eladás bevétele (category = 'eladas') sem az.
  const befizetes = await query<{ month_key: string; osszeg: number; alkalom: number }>(
    `with tetel as (
       select nap, amount from archiv_befizetes
       where extract(year from nap) = $1
       union all
       select (created_at at time zone 'Europe/Budapest')::date as nap, amount
       from kassza_movements
       where amount > 0
         and category = 'egyeb'
         and description !~* '^\\s*nyit[óo]'
         and extract(year from (created_at at time zone 'Europe/Budapest')) = $1
     )
     select to_char(nap, 'YYYY-MM') as month_key, sum(amount)::int as osszeg, count(*)::int as alkalom
     from tetel group by 1 order by 1`,
    [year]
  );

  // Napi aktivitás: az archív és az élő felvásárlás napi összege, havonta.
  const napok = await query<{
    month_key: string;
    aktiv_napok: number;
    atlag_db: number;
    legjobb_nap: string;
    legjobb_db: number;
  }>(
    `with napi as (
       select nap, sum(qty)::int as db from archiv_felvasarlas
       where extract(year from nap) = $1 group by 1
       union all
       select (created_at at time zone 'Europe/Budapest')::date as nap, sum(qty)::int as db
       from nyiregyhaza_purchases
       where extract(year from (created_at at time zone 'Europe/Budapest')) = $1 group by 1
     ),
     osszevont as (select nap, sum(db)::int as db from napi group by 1)
     select to_char(nap, 'YYYY-MM') as month_key,
       count(*)::int as aktiv_napok,
       round(avg(db))::int as atlag_db,
       (array_agg(to_char(nap, 'YYYY-MM-DD') order by db desc, nap))[1] as legjobb_nap,
       max(db)::int as legjobb_db
     from osszevont group by 1 order by 1`,
    [year]
  );

  const atutalas = await query<{ month_key: string; osszeg: number; db: number }>(
    `select to_char((created_at at time zone 'Europe/Budapest')::date, 'YYYY-MM') as month_key,
       sum(total)::int as osszeg, sum(qty)::int as db
     from nyiregyhaza_purchases
     where payment_method = 'atutalas'
       and extract(year from (created_at at time zone 'Europe/Budapest')) = $1
     group by 1 order by 1`,
    [year]
  );

  return {
    befizetes: befizetes.map((r) => ({
      monthKey: r.month_key,
      osszeg: Number(r.osszeg),
      alkalom: Number(r.alkalom),
    })),
    atutalas: atutalas.map((r) => ({
      monthKey: r.month_key,
      osszeg: Number(r.osszeg),
      db: Number(r.db),
    })),
    napok: napok.map((r) => ({
      monthKey: r.month_key,
      aktivNapok: Number(r.aktiv_napok),
      atlagDb: Number(r.atlag_db),
      legjobbNap: r.legjobb_nap,
      legjobbDb: Number(r.legjobb_db),
    })),
  };
}
