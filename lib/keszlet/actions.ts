"use server";

import { query } from "@/lib/db";

export type Direction = "be" | "ki" | "mozgatas";

export type MovementRow = {
  id: string;
  date: string;
  type: string;
  direction: Direction;
  partner: string | null;
  qty: number;
  target_site: string | null;
};

export async function getActiveTypes(site: string) {
  const rows = await query<{ name: string }>(
    `select t.name
     from site_active_types sat
     join sites s on s.id = sat.site_id
     join pallet_types t on t.id = sat.type_id
     where s.name = $1
     order by t.id`,
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
         when m.direction = 'be' then m.qty
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
    `select m.id::text, to_char(m.created_at, 'mon. DD') as date, t.name as type,
       m.direction, m.partner, m.qty, ts.name as target_site
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
}) {
  await query(
    `insert into keszlet_movements (site_id, type_id, direction, qty, partner, target_site_id, purchase_id)
     values (
       (select id from sites where name = $1),
       (select id from pallet_types where name = $2),
       $3, $4, $5,
       (select id from sites where name = $6),
       $7
     )`,
    [input.site, input.type, input.direction, input.qty, input.partner ?? null, input.targetSite ?? null, input.purchaseId ?? null]
  );
}

// Mozgás rögzítése (Beérkezés / Kiszállítás / Telephelyek közti mozgatás) — a Mozgás
// rögzítése kártya minden telephelyen ezt hívja. Nyíregyházán a mozgásokat a
// keszlet_events (Legutóbbi mozgások) listában is megjeleníti, hogy egy helyen
// lásd a Csere/Szétválogatás mellett a sima Be/Ki/Mozgatás tételeket is.
export async function recordMovement(input: {
  site: string;
  type: string;
  direction: Direction;
  qty: number;
  partner?: string;
  targetSite?: string;
}) {
  await addMovement(input);
  if (input.site === "Nyíregyháza") {
    const details =
      input.direction === "mozgatas"
        ? `${input.qty} db ${input.type} átszállítva ide: ${input.targetSite}`
        : `${input.qty} db ${input.type}${input.partner ? ` — ${input.partner}` : ""}`;
    const effect =
      input.direction === "be"
        ? `${input.type} +${input.qty}`
        : input.direction === "ki"
          ? `${input.type} −${input.qty}`
          : `${input.type} −${input.qty} → ${input.targetSite}`;
    await query(
      `insert into keszlet_events (site_id, kind, details, effect)
       values ((select id from sites where name = 'Nyíregyháza'), 'mozgas', $1, $2)`,
      [details, effect]
    );
  }
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
};

export async function getHaviSnapshot() {
  const purchases = await query<PurchaseRow>(
    `select p.id::text, to_char(p.created_at, 'mon. DD') as date,
       to_char(p.created_at, 'YYYY-MM-DD') as day_key, t.name as type,
       p.qty, p.unit_price, p.total, p.seller, p.pending, p.payment_method
     from nyiregyhaza_purchases p
     join pallet_types t on t.id = p.type_id
     order by p.created_at desc
     limit 60`
  );
  const kasszaRows = await query<{ total: string }>(
    `select coalesce(sum(amount), 0) as total from kassza_movements`
  );
  // Mai kiadás: a mai napon ténylegesen kifizetett készpénzes vétel (Csere is kiadás —
  // készpénzért veszünk raklapot). Átutalással fizetett vétel nem kassza-kiadás, ezért
  // itt sem számít bele. Kifizetésre váró (pending) tétel csak azon a napon számít bele,
  // amikor ténylegesen kifizetésre kerül (paid_at), nem amikor felvették.
  const todayExpenseRows = await query<{ total: string; today_key: string }>(
    `select coalesce(sum(p.total), 0) as total, to_char(current_date, 'YYYY-MM-DD') as today_key
     from nyiregyhaza_purchases p
     where p.payment_method = 'keszpenz'
       and p.pending = false
       and coalesce(p.paid_at::date, p.created_at::date) = current_date`
  );
  // Gyors rögzítéshez azok a típusok jelennek meg, amik Nyíregyházán aktívak ÉS van beárazva.
  const priceRows = await query<{ name: string; default_price: number | null }>(
    `select t.name, t.default_price
     from pallet_types t
     join site_active_types sat on sat.type_id = t.id
     join sites s on s.id = sat.site_id
     where s.name = 'Nyíregyháza' and t.default_price is not null
     order by t.id`
  );
  // Típusonkénti darabszám-számláló: havi (aktuális naptári hónap) és mai összesítés.
  // Pending tétel is beleszámít, mert a darabszám a felvételkor azonnal a készletben van.
  const typeCounterRows = await query<{
    type: string;
    monthly_qty: string;
    daily_qty: string;
  }>(
    `select t.name as type,
       coalesce(sum(p.qty) filter (
         where date_trunc('month', p.created_at) = date_trunc('month', current_date)
       ), 0) as monthly_qty,
       coalesce(sum(p.qty) filter (where p.created_at::date = current_date), 0) as daily_qty
     from pallet_types t
     join site_active_types sat on sat.type_id = t.id
     join sites s on s.id = sat.site_id
     left join nyiregyhaza_purchases p on p.type_id = t.id
     where s.name = 'Nyíregyháza' and t.default_price is not null
     group by t.name, t.id
     order by t.id`
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
}) {
  const seller = input.seller ?? "";
  const total = input.qty * input.unitPrice;
  const method: PaymentMethod = input.method ?? "keszpenz";
  // Átutalással fizetett vétel: a készletet növeli, de a kasszát nem érinti —
  // az összeg banki átutalással rendeződik, nem készpénzből.
  const affectsKassza = !input.pending && method === "keszpenz";
  const rows = await query<{ id: string }>(
    `insert into nyiregyhaza_purchases (type_id, qty, unit_price, total, seller, pending, payment_method, created_at)
     values ((select id from pallet_types where name = $1), $2, $3, $4, $5, $6, $7, coalesce($8::timestamptz, now()))
     returning id`,
    [input.type, input.qty, input.unitPrice, total, seller, input.pending ?? false, method, input.date ?? null]
  );
  const purchaseId = rows[0].id;

  if (input.type === "Csere") {
    // A "Csere" nem önálló készlettétel: világos +db, szürke −db a Nyíregyháza készleten.
    // Kasszaszempontból ugyanolyan kiadás, mint bármelyik más felvásárlás — készpénzért vesszük.
    await addMovement({ site: "Nyíregyháza", type: "EUR világos", direction: "be", qty: input.qty, partner: "Csere", purchaseId });
    await addMovement({ site: "Nyíregyháza", type: "EUR szürke", direction: "ki", qty: input.qty, partner: "Csere", purchaseId });
    if (affectsKassza) {
      await query(
        `insert into kassza_movements (description, amount, purchase_id)
         values ($1, $2, $3)`,
        [`Csere (${input.qty} db × ${input.unitPrice} Ft)`, -total, purchaseId]
      );
    }
    await query(
      `insert into keszlet_events (site_id, kind, details, effect, purchase_id)
       values ((select id from sites where name = 'Nyíregyháza'), 'csere', $1, $2, $3)`,
      [
        `${input.qty} db csere, ${input.unitPrice} Ft/db`,
        `világos +${input.qty} · szürke −${input.qty} · kassza −${total.toLocaleString("hu-HU")} Ft`,
        purchaseId,
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
  });
  if (affectsKassza) {
    await query(
      `insert into kassza_movements (description, amount, purchase_id)
       values ($1, $2, $3)`,
      [`Felvásárlás — ${input.type} (${input.qty} db)`, -total, purchaseId]
    );
  }
}

export async function deletePurchase(id: string) {
  // Visszavonja a felvásárlás összes hatását: mozgás(ok), kassza-tétel, esemény, majd maga a tétel.
  await query(`delete from keszlet_movements where purchase_id = $1`, [id]);
  await query(`delete from kassza_movements where purchase_id = $1`, [id]);
  await query(`delete from keszlet_events where purchase_id = $1`, [id]);
  await query(`delete from nyiregyhaza_purchases where id = $1`, [id]);
}

// --- Kifizetésre váró tételek (nyitvatartáson túl/hétvégén leadott felvásárlás) ---

export async function addPendingPurchase(input: {
  seller: string;
  type: string;
  qty: number;
  date: string;
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
  });
}

export async function updatePendingPurchase(
  id: string,
  input: { type: string; qty: number; date: string }
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
  });
}

export async function payPendingSeller(seller: string) {
  const rows = await query<{ id: string; total: number }>(
    `select id::text, total from nyiregyhaza_purchases where seller = $1 and pending = true`,
    [seller]
  );
  if (rows.length === 0) return;
  const sum = rows.reduce((s, r) => s + Number(r.total), 0);
  await query(
    `update nyiregyhaza_purchases set pending = false, paid_at = now() where seller = $1 and pending = true`,
    [seller]
  );
  await query(
    `insert into kassza_movements (description, amount) values ($1, $2)`,
    [`Kifizetés — ${seller} (${rows.length} tétel)`, -sum]
  );
}

export async function addKasszaMovement(description: string, amount: number) {
  await query(`insert into kassza_movements (description, amount) values ($1, $2)`, [
    description,
    amount,
  ]);
}

export type KasszaMovementRow = {
  id: string;
  date: string;
  description: string;
  amount: number;
};

export async function getKasszaMovements(): Promise<KasszaMovementRow[]> {
  return query<KasszaMovementRow>(
    `select id::text, to_char(created_at, 'mon. DD') as date, description, amount
     from kassza_movements
     order by created_at desc
     limit 200`
  );
}

// --- Nyíregyháza — fő fül ---

export type EventRow = {
  id: string;
  date: string;
  kind: "csere" | "szet" | "havi-zaras" | "mozgas";
  details: string;
  effect: string;
};

export async function getNyiregyhazaFoSnapshot() {
  // A "Legutóbbi mozgások" itt csak a be/ki szállításokat és a telephelyek közti
  // mozgatást mutatja (kind = 'mozgas') — a Csere/Szétválogatás tételenkénti
  // története a saját fülén (Havi, ill. a Vegyes EUR sor) tekinthető meg.
  const [stock, events] = await Promise.all([
    getStock("Nyíregyháza"),
    query<EventRow>(
      `select id::text, to_char(created_at, 'mon. DD') as date, kind, details, effect
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
}) {
  const torott = input.torott ?? 0;
  const total = input.vilagos + input.szurke + torott;
  if (total > 0) {
    await addMovement({ site: input.site, type: "Vegyes EUR", direction: "ki", qty: total, partner: "Szétválogatás" });
  }
  if (input.vilagos > 0) {
    await addMovement({ site: input.site, type: "EUR világos", direction: "be", qty: input.vilagos, partner: "Szétválogatás" });
  }
  if (input.szurke > 0) {
    await addMovement({ site: input.site, type: "EUR szürke", direction: "be", qty: input.szurke, partner: "Szétválogatás" });
  }
  // A "Legutóbbi mozgások" görgetett esemény-feed egyelőre csak Nyíregyházán van —
  // a többi telepen a nyers mozgás-lista (getMovements) már mutatja ugyanezt.
  if (input.site === "Nyíregyháza") {
    await query(
      `insert into keszlet_events (site_id, kind, details, effect)
       values ((select id from sites where name = 'Nyíregyháza'), 'szet', $1, $2)`,
      [
        "Vegyes EUR → világos/szürke/törött",
        `vegyes −${total} · világos +${input.vilagos} · szürke +${input.szurke} · törött +${torott}`,
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
}) {
  await query(
    `insert into inventory_counts (site_id, type_id, expected_qty, counted_qty, accepted, comment)
     values ((select id from sites where name = $1), (select id from pallet_types where name = $2), $3, $4, $5, $6)`,
    [input.site, input.type, input.expectedQty, input.countedQty, input.accepted, input.comment ?? null]
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
     order by t.id`
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
