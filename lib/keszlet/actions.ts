"use server";

import { randomUUID } from "node:crypto";
import { query } from "@/lib/db";

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
};

export async function getActiveTypes(site: string) {
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

export async function getStock(site: string): Promise<Record<string, number>> {
  // A "Csere" tranzakciótípus, nem önálló készlet — sosem jelenik meg készletkártyaként.
  const active = (await getActiveTypes(site)).filter((t) => t !== "Csere");
  const rows = await query<{ name: string; qty: string }>(
    `select t.name,
       coalesce(sum(case
         when m.direction in ('be','mozgatas_be') then m.qty
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

export async function getMovements(site: string, limit = 20): Promise<MovementRow[]> {
  const rows = await query<MovementRow>(
    `select m.id::text, to_char(m.created_at at time zone 'Europe/Budapest', '${TIME_FMT}') as date, t.name as type,
       m.direction, m.partner, m.qty, ts.name as target_site, m.created_by
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

export async function addMovement(input: {
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
  await query(
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
export async function recordMovements(input: {
  site: string;
  direction: Direction;
  items: { type: string; qty: number }[];
  partner?: string;
  targetSite?: string;
  createdBy?: string;
}) {
  if (input.items.length === 0) return;

  const movementGroup = randomUUID();
  for (const item of input.items) {
    await addMovement({
      site: input.site,
      type: item.type,
      direction: input.direction,
      qty: item.qty,
      partner: input.partner,
      targetSite: input.targetSite,
      createdBy: input.createdBy,
      movementGroup,
    });
  }
  if (input.direction === "mozgatas" && input.targetSite) {
    for (const item of input.items) {
      await addMovement({
        site: input.targetSite,
        type: item.type,
        direction: "mozgatas_be",
        qty: item.qty,
        targetSite: input.site,
        createdBy: input.createdBy,
        movementGroup,
      });
    }
  }

  if (input.site === "Nyíregyháza") {
    const itemsText = input.items.map((i) => `${i.qty} db ${i.type}`).join(", ");
    const details =
      input.direction === "mozgatas"
        ? `${itemsText} átszállítva ide: ${input.targetSite}`
        : `${itemsText}${input.partner ? ` — ${input.partner}` : ""}`;
    const effect = input.items
      .map((i) =>
        input.direction === "be"
          ? `${i.type} +${i.qty}`
          : input.direction === "ki"
            ? `${i.type} −${i.qty}`
            : `${i.type} −${i.qty} → ${input.targetSite}`
      )
      .join(" · ");
    await query(
      `insert into keszlet_events (site_id, kind, details, effect, created_by, movement_group)
       values ((select id from sites where name = 'Nyíregyháza'), 'mozgas', $1, $2, $3, $4)`,
      [details, effect, input.createdBy ?? null, movementGroup]
    );
  }
  if (input.direction === "mozgatas" && input.targetSite === "Nyíregyháza") {
    const itemsText = input.items.map((i) => `${i.qty} db ${i.type}`).join(", ");
    await query(
      `insert into keszlet_events (site_id, kind, details, effect, created_by, movement_group)
       values ((select id from sites where name = 'Nyíregyháza'), 'mozgas', $1, $2, $3, $4)`,
      [
        `${itemsText} érkezett innen: ${input.site}`,
        input.items.map((i) => `${i.type} +${i.qty}`).join(" · "),
        input.createdBy ?? null,
        movementGroup,
      ]
    );
  }
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
  const rows = await query<{
    purchase_id: string | null;
    direction: Direction;
    movement_group: string | null;
  }>(
    `select purchase_id::text, direction, movement_group::text from keszlet_movements where id = $1`,
    [id]
  );
  if (rows.length === 0) return;
  if (rows[0].purchase_id) {
    throw new Error(
      "Ez a tétel egy felvásárláshoz tartozik — a Havi fülön, a felvásárlás törlésével vonható vissza."
    );
  }
  const { direction, movement_group } = rows[0];
  if ((direction === "mozgatas" || direction === "mozgatas_be") && movement_group) {
    // A másik oldalon (jellemzően Nyíregyházán) a mozgatáshoz tartozhat egy
    // összevont keszlet_events-sor is (lásd recordMovements) — ezt is
    // töröljük, különben egy már nem létező mozgatásra hivatkozó, "árva"
    // esemény maradna a Legutóbbi mozgások listában.
    await query(`delete from keszlet_events where movement_group = $1`, [movement_group]);
    await query(`delete from keszlet_movements where movement_group = $1`, [movement_group]);
    return;
  }
  await query(`delete from keszlet_movements where id = $1`, [id]);
}

// Egy "Legutóbbi mozgások" esemény (Nyíregyháza — keszlet_events, kind =
// 'mozgas') törlése a hozzá tartozó ÖSSZES keszlet_movements-sorral együtt
// (recordMovements egy mentésben több típust is felvehet — ezeket a közös
// movement_group köti össze, lásd db/schema.sql).
export async function deleteMovementEvent(id: string) {
  const rows = await query<{ movement_group: string | null }>(
    `select movement_group::text from keszlet_events where id = $1 and kind = 'mozgas'`,
    [id]
  );
  if (rows.length === 0) return;
  const group = rows[0].movement_group;
  if (group) {
    const linkedToPurchase = await query<{ id: string }>(
      `select id from keszlet_movements where movement_group = $1 and purchase_id is not null`,
      [group]
    );
    if (linkedToPurchase.length > 0) {
      throw new Error(
        "Ez a tétel egy felvásárláshoz tartozik — a Havi fülön, a felvásárlás törlésével vonható vissza."
      );
    }
    await query(`delete from keszlet_movements where movement_group = $1`, [group]);
  }
  await query(`delete from keszlet_events where id = $1`, [id]);
}

// --- Összkészlet (Szakoly/Archívum fülek közötti összesítő) ---

export type OsszkeszletRow = {
  type: string;
  total: number;
  bySite: Record<string, number>;
};

export async function getOsszkeszlet(): Promise<OsszkeszletRow[]> {
  // Ugyanaz a be/ki/mozgatás-számítás, mint a getStock-ban, csak az összes
  // telephelyre egyszerre, típus+telephely bontásban — a "Csere" itt sem
  // önálló készlettétel, ld. getStock megjegyzését.
  const rows = await query<{ type: string; site: string; qty: string }>(
    `select t.name as type, s.name as site,
       coalesce(sum(case
         when m.direction in ('be','mozgatas_be') then m.qty
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

export async function getSiteSnapshot(site: string) {
  const [stock, movements, types] = await Promise.all([
    getStock(site),
    getMovements(site),
    getActiveTypes(site),
  ]);
  return { stock, movements, types };
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
  const purchases = await query<PurchaseRow>(
    `select p.id::text, to_char(p.created_at at time zone 'Europe/Budapest', '${TIME_FMT}') as date,
       to_char(p.created_at at time zone 'Europe/Budapest', 'YYYY-MM-DD') as day_key, t.name as type,
       p.qty, p.unit_price, p.total, p.seller, p.pending, p.payment_method, p.created_by
     from nyiregyhaza_purchases p
     join pallet_types t on t.id = p.type_id
     order by p.created_at desc
     limit 60`
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

export async function addPurchase(input: {
  type: string;
  qty: number;
  unitPrice: number;
  seller?: string;
  pending?: boolean;
  method?: PaymentMethod;
  date?: string;
  createdBy?: string;
}) {
  const seller = input.seller ?? "";
  const total = input.qty * input.unitPrice;
  const method: PaymentMethod = input.method ?? "keszpenz";
  const createdBy = input.createdBy ?? null;
  // Átutalással fizetett vétel: a készletet növeli, de a kasszát nem érinti —
  // az összeg banki átutalással rendeződik, nem készpénzből.
  const affectsKassza = !input.pending && method === "keszpenz";
  const rows = await query<{ id: string }>(
    `insert into nyiregyhaza_purchases (type_id, qty, unit_price, total, seller, pending, payment_method, created_at, created_by)
     values ((select id from pallet_types where name = $1), $2, $3, $4, $5, $6, $7, coalesce($8::timestamptz, now()), $9)
     returning id`,
    [input.type, input.qty, input.unitPrice, total, seller, input.pending ?? false, method, input.date ?? null, createdBy]
  );
  const purchaseId = rows[0].id;

  if (input.type === "Csere") {
    // A "Csere" nem önálló készlettétel: világos +db, szürke −db a Nyíregyháza készleten.
    // Kasszaszempontból ugyanolyan kiadás, mint bármelyik más felvásárlás — készpénzért vesszük.
    await addMovement({ site: "Nyíregyháza", type: "EUR világos", direction: "be", qty: input.qty, partner: "Csere", purchaseId, createdBy: createdBy ?? undefined });
    await addMovement({ site: "Nyíregyháza", type: "EUR szürke", direction: "ki", qty: input.qty, partner: "Csere", purchaseId, createdBy: createdBy ?? undefined });
    if (affectsKassza) {
      await query(
        `insert into kassza_movements (description, amount, purchase_id, created_by, category)
         values ($1, $2, $3, $4, 'felvasarlas')`,
        [`Csere (${input.qty} db × ${input.unitPrice} Ft)`, -total, purchaseId, createdBy]
      );
    }
    await query(
      `insert into keszlet_events (site_id, kind, details, effect, purchase_id, created_by)
       values ((select id from sites where name = 'Nyíregyháza'), 'csere', $1, $2, $3, $4)`,
      [
        `${input.qty} db csere, ${input.unitPrice} Ft/db`,
        `világos +${input.qty} · szürke −${input.qty} · kassza −${total.toLocaleString("hu-HU")} Ft`,
        purchaseId,
        createdBy,
      ]
    );
    return;
  }

  // Havi fülről automatikusan bekerül a Nyíregyháza fül (tényleges készlet) állományba is,
  // kivéve ha kifizetésre vár (akkor a darabszám már benne van, csak a kassza vár).
  await addMovement({
    site: "Nyíregyháza",
    type: input.type,
    direction: "be",
    qty: input.qty,
    partner: seller || undefined,
    purchaseId,
    createdBy: createdBy ?? undefined,
  });
  if (affectsKassza) {
    await query(
      `insert into kassza_movements (description, amount, purchase_id, created_by, category)
       values ($1, $2, $3, $4, 'felvasarlas')`,
      [`Felvásárlás — ${input.type} (${input.qty} db)`, -total, purchaseId, createdBy]
    );
  }
}

export async function deletePurchase(id: string) {
  // Visszavonja a felvásárlás összes hatását: mozgás(ok), kassza-tétel, esemény, majd maga a tétel.
  const purchaseRows = await query<{
    total: number;
    payment_method: string;
    pending: boolean;
  }>(`select total, payment_method, pending from nyiregyhaza_purchases where id = $1`, [id]);

  await query(`delete from keszlet_movements where purchase_id = $1`, [id]);
  const deletedKassza = await query<{ id: string }>(
    `delete from kassza_movements where purchase_id = $1 returning id`,
    [id]
  );
  await query(`delete from keszlet_events where purchase_id = $1`, [id]);
  await query(`delete from nyiregyhaza_purchases where id = $1`, [id]);

  // Régebbi, eladónkénti gyűjtő kifizetésből származó (a konkrét tételhez nem
  // közvetlenül kötött) kassza-terhelést nem tudtuk a fenti purchase_id
  // alapján megtalálni és törölni — ilyenkor a törölt tétel összegét
  // manuálisan visszaírjuk a kasszába, hogy a pénz ne vesszen el.
  if (deletedKassza.length === 0 && purchaseRows.length > 0) {
    const p = purchaseRows[0];
    if (!p.pending && p.payment_method === "keszpenz") {
      await query(
        `insert into kassza_movements (description, amount, category) values ($1, $2, 'felvasarlas')`,
        [`Törölt felvásárlási tétel visszaírása`, Number(p.total)]
      );
    }
  }
}

// --- Kifizetésre váró tételek (nyitvatartáson túl/hétvégén leadott felvásárlás) ---

export async function addPendingPurchase(input: {
  seller: string;
  type: string;
  qty: number;
  date: string;
  createdBy?: string;
}) {
  const priceRows = await query<{ default_price: number | null }>(
    `select default_price from pallet_types where name = $1`,
    [input.type]
  );
  const unitPrice = priceRows[0]?.default_price ?? 0;
  await addPurchase({
    type: input.type,
    qty: input.qty,
    unitPrice,
    seller: input.seller,
    pending: true,
    date: input.date,
    createdBy: input.createdBy,
  });
}

export async function updatePendingPurchase(
  id: string,
  input: { type: string; qty: number; date: string; createdBy?: string }
) {
  const priceRows = await query<{ default_price: number | null }>(
    `select default_price from pallet_types where name = $1`,
    [input.type]
  );
  const unitPrice = priceRows[0]?.default_price ?? 0;
  const total = input.qty * unitPrice;
  const rows = await query<{ seller: string }>(
    `update nyiregyhaza_purchases
     set type_id = (select id from pallet_types where name = $1),
         qty = $2, unit_price = $3, total = $4, created_at = $5::timestamptz
     where id = $6 and pending = true
     returning seller`,
    [input.type, input.qty, unitPrice, total, input.date, id]
  );
  if (rows.length === 0) return;
  // A kapcsolódó készletmozgást is frissítjük az új típusra/darabszámra.
  await query(`delete from keszlet_movements where purchase_id = $1`, [id]);
  await addMovement({
    site: "Nyíregyháza",
    type: input.type,
    direction: "be",
    qty: input.qty,
    partner: rows[0].seller || undefined,
    purchaseId: id,
    createdBy: input.createdBy,
  });
}

export async function payPendingSeller(seller: string, createdBy?: string) {
  const rows = await query<{ id: string; total: number }>(
    `select id::text, total from nyiregyhaza_purchases where seller = $1 and pending = true`,
    [seller]
  );
  if (rows.length === 0) return;
  await query(
    `update nyiregyhaza_purchases set pending = false, paid_at = now() where seller = $1 and pending = true`,
    [seller]
  );
  // Tételenként külön kassza-sor (purchase_id-hoz kötve), hogy egy később
  // törölt tétel pénze pontosan visszaíródjon a kasszába — nem egy közös,
  // eladónkénti gyűjtő összeg, amit nem lehetne utólag tételre bontani.
  for (const r of rows) {
    await query(
      `insert into kassza_movements (description, amount, purchase_id, created_by, category)
       values ($1, $2, $3, $4, 'felvasarlas')`,
      [`Kifizetés — ${seller}`, -Number(r.total), r.id, createdBy ?? null]
    );
  }
}

export async function addKasszaMovement(description: string, amount: number, createdBy?: string) {
  await query(`insert into kassza_movements (description, amount, created_by) values ($1, $2, $3)`, [
    description,
    amount,
    createdBy ?? null,
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
  kind: "csere" | "szet" | "havi-zaras" | "mozgas";
  details: string;
  effect: string;
  created_by: string | null;
};

export async function getNyiregyhazaFoSnapshot() {
  // A "Legutóbbi mozgások" itt csak a be/ki szállításokat és a telephelyek közti
  // mozgatást mutatja (kind = 'mozgas') — a Csere/Szétválogatás tételenkénti
  // története a saját fülén (Havi, ill. a Vegyes EUR sor) tekinthető meg.
  const [stock, events] = await Promise.all([
    getStock("Nyíregyháza"),
    query<EventRow>(
      `select id::text, to_char(created_at at time zone 'Europe/Budapest', '${TIME_FMT}') as date, kind, details, effect, created_by
       from keszlet_events
       where site_id = (select id from sites where name = 'Nyíregyháza')
         and kind = 'mozgas'
       order by created_at desc
       limit 20`
    ),
  ]);
  return { stock, events };
}

export async function recordSzetvalogatas(input: {
  site: string;
  vilagos: number;
  szurke: number;
  torott?: number;
  createdBy?: string;
}) {
  const torott = input.torott ?? 0;
  const total = input.vilagos + input.szurke + torott;
  if (total > 0) {
    await addMovement({ site: input.site, type: "Vegyes EUR", direction: "ki", qty: total, partner: "Szétválogatás", createdBy: input.createdBy });
  }
  if (input.vilagos > 0) {
    await addMovement({ site: input.site, type: "EUR világos", direction: "be", qty: input.vilagos, partner: "Szétválogatás", createdBy: input.createdBy });
  }
  if (input.szurke > 0) {
    await addMovement({ site: input.site, type: "EUR szürke", direction: "be", qty: input.szurke, partner: "Szétválogatás", createdBy: input.createdBy });
  }
  // A "Legutóbbi mozgások" görgetett esemény-feed egyelőre csak Nyíregyházán van —
  // a többi telepen a nyers mozgás-lista (getMovements) már mutatja ugyanezt.
  if (input.site === "Nyíregyháza") {
    await query(
      `insert into keszlet_events (site_id, kind, details, effect, created_by)
       values ((select id from sites where name = 'Nyíregyháza'), 'szet', $1, $2, $3)`,
      [
        "Vegyes EUR → világos/szürke/törött",
        `vegyes −${total} · világos +${input.vilagos} · szürke +${input.szurke} · törött +${torott}`,
        input.createdBy ?? null,
      ]
    );
  }
}

// --- Leltár ---

export async function recordInventoryCount(input: {
  site: string;
  type: string;
  expectedQty: number;
  countedQty: number;
  accepted: boolean;
  comment?: string;
  createdBy?: string;
}) {
  await query(
    `insert into inventory_counts (site_id, type_id, expected_qty, counted_qty, accepted, comment, created_by)
     values ((select id from sites where name = $1), (select id from pallet_types where name = $2), $3, $4, $5, $6, $7)`,
    [input.site, input.type, input.expectedQty, input.countedQty, input.accepted, input.comment ?? null, input.createdBy ?? null]
  );
  if (input.accepted) {
    const diff = input.countedQty - input.expectedQty;
    if (diff !== 0) {
      await addMovement({
        site: input.site,
        type: input.type,
        direction: diff > 0 ? "be" : "ki",
        qty: Math.abs(diff),
        partner: "Leltári korrekció",
        createdBy: input.createdBy,
      });
    }
  }
}

// --- Admin: típusok és árak ---

export type TypeAdminRow = {
  id: number;
  name: string;
  default_price: number | null;
  sites: string[];
};

export async function getAllTypesAdmin(): Promise<TypeAdminRow[]> {
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
  await query(`update pallet_types set default_price = $1 where id = $2`, [price, typeId]);
}

export async function setTypeSiteActive(typeId: number, site: string, active: boolean) {
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
