"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  addKasszaMovement,
  addPendingPurchases,
  addPurchases,
  deletePurchase,
  deletePurchases,
  getHaviSnapshot,
  getKasszaMovements,
  payPendingSeller,
  updatePendingPurchase,
  type KasszaMovementRow,
  type PurchaseRow,
} from "@/lib/keszlet/actions";
import { kbNav } from "@/lib/keszlet/kbnav";
import { useCanEdit } from "@/components/auth/edit-permission-context";

function todayLabel() {
  const raw = new Date().toLocaleDateString("hu-HU", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  // "2026. szeptember 3., csütörtök" -> "ma, csütörtök (2026. szeptember 3.)"
  const [datePart, weekdayPart] = raw.split(", ");
  return { datePart, weekdayPart };
}

function todayDateInputValue() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const MONTHLY_TILE_COLOR = {
  border: "border-emerald-300/60",
  bg: "bg-emerald-50 dark:bg-emerald-950/30",
  text: "text-emerald-700 dark:text-emerald-400",
};

const DAILY_TILE_COLOR = {
  border: "border-orange-300/60",
  bg: "bg-orange-50 dark:bg-orange-950/30",
  text: "text-orange-700 dark:text-orange-400",
};

// "Korábbi napok" — ugyanaz a csempe-forma, mint a Havi/Mai számlálóknál, de
// visszafogottabb (semleges) színnel, hogy a két felső sor maradjon a hangsúlyos.
const PAST_TILE_COLOR = {
  border: "border-border",
  bg: "bg-muted/40",
  text: "text-muted-foreground",
};

function dayGroupLabel(dayKey: string) {
  return new Date(`${dayKey}T00:00:00`).toLocaleDateString("hu-HU", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

export function NyiregyhazaHaviTab() {
  const canEdit = useCanEdit();
  const [loading, setLoading] = useState(true);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [typeCounters, setTypeCounters] = useState<
    { type: string; monthlyQty: number; dailyQty: number }[]
  >([]);
  const [todayKey, setTodayKey] = useState("");
  const [kassza, setKassza] = useState(0);
  const [todayExpense, setTodayExpense] = useState(0);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [todayQty, setTodayQty] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [kasszaDesc, setKasszaDesc] = useState("");
  const [kasszaAmount, setKasszaAmount] = useState("");
  const [kasszaSubmitting, setKasszaSubmitting] = useState(false);
  const [kasszaDetailOpen, setKasszaDetailOpen] = useState(false);
  const [kasszaDetailLoading, setKasszaDetailLoading] = useState(false);
  const [kasszaMovements, setKasszaMovements] = useState<KasszaMovementRow[]>([]);
  const [customPriceOpen, setCustomPriceOpen] = useState(false);
  const [customPrices, setCustomPrices] = useState<Record<string, string>>({});
  const [pendingAddOpen, setPendingAddOpen] = useState(false);
  const [pendingSeller, setPendingSeller] = useState("");
  const [pendingDate, setPendingDate] = useState(todayDateInputValue());
  const [pendingQtyMap, setPendingQtyMap] = useState<Record<string, string>>({});
  // Típusonkénti egyedi ár a kifizetésre váró felvételnél — csak ott jelenik
  // meg, ahol már van darabszám, és az irányárral indul.
  const [pendingPriceMap, setPendingPriceMap] = useState<Record<string, string>>({});
  const [pendingSubmitting, setPendingSubmitting] = useState(false);
  const [pendingListOpen, setPendingListOpen] = useState(false);
  const [pendingSellerLocked, setPendingSellerLocked] = useState(false);
  const [pendingEditRow, setPendingEditRow] = useState<PurchaseRow | null>(null);
  const [pendingEditType, setPendingEditType] = useState("");
  const [pendingEditQty, setPendingEditQty] = useState("");
  const [pendingEditDate, setPendingEditDate] = useState("");
  const { datePart, weekdayPart } = todayLabel();

  const load = useCallback(async () => {
    const snap = await getHaviSnapshot();
    setPurchases(snap.purchases);
    setTodayKey(snap.todayKey);
    setKassza(snap.kassza);
    setTodayExpense(snap.todayExpense);
    setTypeCounters(snap.typeCounters);
    const priceMap: Record<string, number> = {};
    for (const p of snap.prices) if (p.default_price) priceMap[p.name] = p.default_price;
    setPrices(priceMap);
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const currentEntryTotal = useMemo(() => {
    return Object.entries(todayQty).reduce((sum, [type, qtyStr]) => {
      const qty = Number(qtyStr) || 0;
      return sum + qty * (prices[type] ?? 0);
    }, 0);
  }, [todayQty, prices]);

  function getEntries() {
    return Object.entries(todayQty).filter(([, v]) => Number(v) > 0);
  }

  // Csak egész darabszám mehet tovább: a tört szám a szerveren (integer
  // oszlop) hibára futna, és a mentés félúton szakadna meg.
  function egeszDarabszamok(entries: [string, string][]) {
    const hibas = entries.find(([, v]) => !Number.isInteger(Number(v)));
    if (hibas) {
      toast.error(`Érvénytelen darabszám ehhez: ${hibas[0]}. Csak egész szám adható meg.`);
      return false;
    }
    return true;
  }

  async function recordDay(method: "keszpenz" | "atutalas" = "keszpenz") {
    const entries = getEntries();
    if (entries.length === 0) {
      toast.error("Adj meg legalább egy típust darabszámmal.");
      return;
    }
    if (!egeszDarabszamok(entries)) return;
    setSubmitting(true);
    try {
      await addPurchases({
        items: entries.map(([type, qtyStr]) => ({
          type,
          qty: Number(qtyStr),
          unitPrice: prices[type] ?? 0,
        })),
        method,
      });
      setTodayQty({});
      await load();
      toast.success(
        method === "atutalas" ? "Vétel rögzítve — átutalással." : "Vétel rögzítve."
      );
    } catch {
      toast.error("Nem sikerült menteni.");
    } finally {
      setSubmitting(false);
    }
  }

  function openCustomPrice() {
    const entries = getEntries();
    if (entries.length === 0) {
      toast.error("Adj meg legalább egy típust darabszámmal.");
      return;
    }
    const initial: Record<string, string> = {};
    for (const [type] of entries) {
      initial[type] = String(prices[type] ?? "");
    }
    setCustomPrices(initial);
    setCustomPriceOpen(true);
  }

  async function recordCustomPrice() {
    const entries = getEntries();
    if (!egeszDarabszamok(entries)) return;
    const rosszAr = entries.find(
      ([type]) => !Number.isInteger(Number(customPrices[type]) || 0)
    );
    if (rosszAr) {
      toast.error(`Érvénytelen egységár ehhez: ${rosszAr[0]}.`);
      return;
    }
    setSubmitting(true);
    try {
      await addPurchases({
        items: entries.map(([type, qtyStr]) => ({
          type,
          qty: Number(qtyStr),
          unitPrice: Number(customPrices[type]) || 0,
        })),
        method: "keszpenz",
      });
      setTodayQty({});
      setCustomPriceOpen(false);
      await load();
      toast.success("Vétel rögzítve — egyedi áron.");
    } catch {
      toast.error("Nem sikerült menteni.");
    } finally {
      setSubmitting(false);
    }
  }

  // A törlés a készletet és a kasszát is visszaírja, és nem vonható vissza —
  // ezért minden törlés előtt rákérdezünk, mi tűnik el pontosan.
  async function handleDelete(p: PurchaseRow) {
    if (
      !window.confirm(
        `Biztosan törlöd? ${p.qty} db ${p.type}, ${p.total.toLocaleString("hu-HU")} Ft (${p.date})`
      )
    ) {
      return;
    }
    try {
      await deletePurchase(p.id);
      await load();
      toast.success("Tétel törölve.");
    } catch {
      toast.error("Nem sikerült törölni.");
    }
  }

  async function handleDeleteGroup(dayKey: string, line: { type: string; qty: number; ids: string[] }) {
    if (
      !window.confirm(
        `Biztosan törlöd? ${dayGroupLabel(dayKey)} — ${line.type}, összesen ${line.qty} db ` +
          `(${line.ids.length} tétel). A készletből és a kasszából is visszaíródik.`
      )
    ) {
      return;
    }
    try {
      await deletePurchases(line.ids);
      await load();
      toast.success("Tétel törölve.");
    } catch {
      toast.error("Nem sikerült törölni.");
    }
  }

  function getPendingEntries() {
    return Object.entries(pendingQtyMap).filter(([, v]) => Number(v) > 0);
  }

  // Az adott típusnál érvényes ár: amit beírtak, egyébként az irányár.
  const pendingUnitPrice = useCallback(
    (type: string) => {
      const beirt = pendingPriceMap[type];
      if (beirt !== undefined && beirt !== "" && Number.isFinite(Number(beirt))) {
        return Number(beirt);
      }
      return prices[type] ?? 0;
    },
    [pendingPriceMap, prices]
  );

  const pendingAddTotal = useMemo(() => {
    return Object.entries(pendingQtyMap).reduce((sum, [type, qtyStr]) => {
      const qty = Number(qtyStr) || 0;
      return sum + qty * pendingUnitPrice(type);
    }, 0);
  }, [pendingQtyMap, pendingUnitPrice]);

  function openPendingAdd() {
    setPendingSeller("");
    setPendingSellerLocked(false);
    setPendingDate(todayDateInputValue());
    setPendingQtyMap({});
    setPendingPriceMap({});
    setPendingAddOpen(true);
  }

  function openPendingAddForSeller(seller: string) {
    setPendingSeller(seller);
    setPendingSellerLocked(true);
    setPendingDate(todayDateInputValue());
    setPendingQtyMap({});
    setPendingAddOpen(true);
  }

  async function submitPendingAdd() {
    const entries = getPendingEntries();
    if (!pendingSeller.trim() || entries.length === 0) {
      toast.error("Adj meg nevet, és legalább egy típust darabszámmal.");
      return;
    }
    if (!egeszDarabszamok(entries)) return;
    setPendingSubmitting(true);
    try {
      await addPendingPurchases({
        seller: pendingSeller.trim(),
        date: pendingDate,
        items: entries.map(([type, qtyStr]) => ({
          type,
          qty: Number(qtyStr),
          unitPrice: pendingUnitPrice(type),
        })),
      });
      setPendingAddOpen(false);
      await load();
      toast.success("Kifizetésre váró tétel(ek) rögzítve.");
    } catch {
      toast.error("Nem sikerült menteni.");
    } finally {
      setPendingSubmitting(false);
    }
  }

  function openPendingEdit(row: PurchaseRow) {
    setPendingEditRow(row);
    setPendingEditType(row.type);
    setPendingEditQty(String(row.qty));
    setPendingEditDate(row.day_key);
  }

  async function submitPendingEdit() {
    if (!pendingEditRow) return;
    const qty = Number(pendingEditQty);
    if (!pendingEditType || !qty) {
      toast.error("Adj meg típust és darabszámot.");
      return;
    }
    if (!Number.isInteger(qty) || qty <= 0) {
      toast.error("A darabszám csak pozitív egész szám lehet.");
      return;
    }
    setPendingSubmitting(true);
    try {
      await updatePendingPurchase(pendingEditRow.id, {
        type: pendingEditType,
        qty,
        date: pendingEditDate,
      });
      setPendingEditRow(null);
      await load();
      toast.success("Tétel módosítva.");
    } catch {
      toast.error("Nem sikerült módosítani.");
    } finally {
      setPendingSubmitting(false);
    }
  }

  async function handlePaySeller(seller: string, total: number) {
    if (
      !window.confirm(
        `${seller} kifizetése: ${total.toLocaleString("hu-HU")} Ft kerül ki a kasszából. Mehet?`
      )
    ) {
      return;
    }
    setPendingSubmitting(true);
    try {
      await payPendingSeller(seller);
      await load();
      toast.success(`${seller} kifizetve.`);
    } catch {
      toast.error("Nem sikerült kifizetni.");
    } finally {
      setPendingSubmitting(false);
    }
  }

  async function openKasszaDetail() {
    setKasszaDetailOpen(true);
    setKasszaDetailLoading(true);
    try {
      setKasszaMovements(await getKasszaMovements());
    } finally {
      setKasszaDetailLoading(false);
    }
  }

  async function recordKassza() {
    const amount = Number(kasszaAmount);
    if (!kasszaDesc.trim() || !amount) {
      toast.error("Adj meg leírást és összeget.");
      return;
    }
    if (!Number.isInteger(amount)) {
      toast.error("Az összeg csak egész szám lehet (Ft).");
      return;
    }
    // Mentés közben tiltott gomb + hibakezelés: dupla koppintásra eddig két
    // kassza-tétel keletkezett, egy hibát pedig semmi nem jelzett.
    setKasszaSubmitting(true);
    try {
      await addKasszaMovement(kasszaDesc, amount);
      setKasszaDesc("");
      setKasszaAmount("");
      await load();
      toast.success("Kassza-mozgás rögzítve.");
    } catch {
      toast.error("Nem sikerült rögzíteni a kassza-mozgást.");
    } finally {
      setKasszaSubmitting(false);
    }
  }

  // A "Havi felvásárlások" táblázat a rögzítés módjától (gyors rögzítés vagy
  // kifizetésre váró tétel) függetlenül MINDEN vételt mutat — a pending
  // tételek a "Kifizetésre vár" jelvénnyel különböztethetők meg (a sor
  // renderelése ezt már eddig is kezelte, csak korábban ki voltak szűrve
  // innen, és csak a külön "Kifizetésre váró tételek" kártyán látszottak).
  const pending = purchases.filter((p) => p.pending);
  const todayPurchases = purchases.filter((p) => p.day_key === todayKey);
  const pastPurchases = purchases.filter((p) => p.day_key !== todayKey);

  // A csempe egy nap egy típusának ÖSSZES tételét összevonja. Az átutalással
  // fizetett darab/összeg külön is számolódik: az a pénz nem a kasszából ment
  // ki, és a napi tételsorok (ahol a kék címke látszik) itt már nincsenek meg.
  const pastGroups: {
    dayKey: string;
    atutalasFt: number;
    lines: { type: string; qty: number; atutalasQty: number; ids: string[] }[];
  }[] = [];
  for (const p of pastPurchases) {
    let group = pastGroups.find((g) => g.dayKey === p.day_key);
    if (!group) {
      group = { dayKey: p.day_key, atutalasFt: 0, lines: [] };
      pastGroups.push(group);
    }
    let line = group.lines.find((l) => l.type === p.type);
    if (!line) {
      line = { type: p.type, qty: 0, atutalasQty: 0, ids: [] };
      group.lines.push(line);
    }
    line.qty += p.qty;
    line.ids.push(p.id);
    if (p.payment_method === "atutalas") {
      line.atutalasQty += p.qty;
      group.atutalasFt += p.total;
    }
  }

  const pendingGroups: { seller: string; entries: PurchaseRow[]; total: number }[] = [];
  for (const p of pending) {
    let group = pendingGroups.find((g) => g.seller === p.seller);
    if (!group) {
      group = { seller: p.seller, entries: [], total: 0 };
      pendingGroups.push(group);
    }
    group.entries.push(p);
    group.total += p.total;
  }
  for (const g of pendingGroups) {
    g.entries.sort((a, b) => a.day_key.localeCompare(b.day_key));
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Betöltés…</p>;
  }

  return (
    <fieldset disabled={!canEdit} className="contents">
    <div className="space-y-5">
      {!canEdit && (
        <p className="text-xs text-muted-foreground">
          Csak megtekintési jogosultságod van ehhez a modulhoz.
        </p>
      )}
      {typeCounters.length > 0 && (
        <div className="space-y-2">
          <div>
            <div className={`mb-1 text-xs font-semibold ${MONTHLY_TILE_COLOR.text}`}>Havi</div>
            {/* auto-fill + minmax: annyi típuscsempe fér egy sorba, amennyi a
                minimum szélesség mellett elfér — keskeny (mobil) képernyőn
                több sorba törik, ahelyett hogy flex-nowrap miatt egyre
                keskenyebbre zsugorodna minden csempe. */}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-1.5">
              {typeCounters.map((c) => (
                <div
                  key={`havi-${c.type}`}
                  className={`min-w-0 rounded-lg border px-1.5 py-2 text-center ${MONTHLY_TILE_COLOR.border} ${MONTHLY_TILE_COLOR.bg}`}
                >
                  <div className={`text-[11px] font-medium leading-tight ${MONTHLY_TILE_COLOR.text}`}>
                    {c.type}
                  </div>
                  <div className={`text-lg font-bold tabular-nums ${MONTHLY_TILE_COLOR.text}`}>
                    {c.monthlyQty}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className={`mb-1 text-xs font-semibold ${DAILY_TILE_COLOR.text}`}>Mai</div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-1.5">
              {typeCounters.map((c) => (
                <div
                  key={`napi-${c.type}`}
                  className={`min-w-0 rounded-lg border px-1.5 py-1.5 text-center ${DAILY_TILE_COLOR.border} ${DAILY_TILE_COLOR.bg}`}
                >
                  <div className={`text-[11px] font-medium leading-tight ${DAILY_TILE_COLOR.text}`}>
                    {c.type}
                  </div>
                  <div className={`text-sm font-semibold tabular-nums ${DAILY_TILE_COLOR.text}`}>
                    {c.dailyQty}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.5fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Ma, {weekdayPart} — gyors rögzítés
          </CardTitle>
          <p className="text-xs text-muted-foreground">{datePart}</p>
        </CardHeader>
        <CardContent className="space-y-4" data-kbnav-group>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.keys(prices).map((t) => (
              <div key={t} className="space-y-1.5">
                <Label className="text-xs">{t}</Label>
                <Input
                  type="number"
                  placeholder="db"
                  value={todayQty[t] ?? ""}
                  onChange={(e) =>
                    setTodayQty((prev) => ({ ...prev, [t]: e.target.value }))
                  }
                  data-kbnav-item
                  onKeyDown={kbNav}
                />
                <p className="text-[11px] text-muted-foreground">
                  {prices[t] ? `${prices[t]} Ft/db` : "—"}
                </p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Aktuális kifizetés</span>
            <span className="font-semibold tabular-nums">
              {currentEntryTotal.toLocaleString("hu-HU")} Ft
            </span>
          </div>
          <Button
            onClick={() => recordDay("keszpenz")}
            disabled={submitting}
            size="lg"
            className="w-full"
            data-kbnav-submit
          >
            {submitting ? "Mentés…" : "Vétel — készpénzből fizetve"}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={() => recordDay("atutalas")}
              disabled={submitting}
              className="w-full bg-blue-600 text-white hover:bg-blue-700"
            >
              Vétel — átutalással
            </Button>
            <Button
              onClick={openCustomPrice}
              disabled={submitting}
              className="w-full bg-violet-600 text-white hover:bg-violet-700"
            >
              Vétel — egyedi áron
            </Button>
          </div>

          <h3 className="pt-2 text-sm font-medium">Havi felvásárlások</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dátum/idő</TableHead>
                <TableHead>Típus</TableHead>
                <TableHead className="text-right">Db</TableHead>
                <TableHead className="text-right">Egységár</TableHead>
                <TableHead className="text-right">Összeg</TableHead>
                <TableHead></TableHead>
                <TableHead>Ki</TableHead>
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {todayPurchases.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    Ma még nincs rögzített vétel.
                  </TableCell>
                </TableRow>
              )}
              {todayPurchases.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-muted-foreground">{p.date}</TableCell>
                  <TableCell>{p.type}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.qty}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.unit_price} Ft</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {p.total.toLocaleString("hu-HU")} Ft
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {p.pending && (
                        <Badge className="bg-warning/15 text-warning hover:bg-warning/15">
                          Kifizetésre vár
                        </Badge>
                      )}
                      {p.payment_method === "atutalas" && (
                        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
                          Átutalással
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.created_by ?? "—"}</TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => handleDelete(p)}
                      title="Törlés (hibás rögzítés)"
                      className="text-destructive/70 hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {pastGroups.length > 0 && (
            <div className="space-y-3 pt-2">
              <h3 className="text-sm font-medium">Korábbi napok</h3>
              {/* Ugyanaz a csempe-rács, mint fent a Havi és a Mai számlálóknál —
                  típusnév + darabszám, a nap fejlécével. A törlés a csempe
                  sarkában lévő ✕, ami az adott nap adott típusának MINDEN
                  tételét visszavonja (megerősítés után). */}
              {pastGroups.map((g) => (
                <div key={g.dayKey} className="space-y-1.5">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className={`text-xs font-semibold ${PAST_TILE_COLOR.text}`}>
                      {dayGroupLabel(g.dayKey)}
                    </span>
                    {g.atutalasFt > 0 && (
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                        ebből átutalással {g.atutalasFt.toLocaleString("hu-HU")} Ft
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-1.5">
                    {g.lines.map((l) => (
                      <div
                        key={l.type}
                        className={`relative min-w-0 rounded-lg border px-1.5 py-2 text-center ${PAST_TILE_COLOR.border} ${PAST_TILE_COLOR.bg}`}
                      >
                        <div className={`text-[11px] font-medium leading-tight ${PAST_TILE_COLOR.text}`}>
                          {l.type}
                        </div>
                        <div className={`text-lg font-bold tabular-nums ${PAST_TILE_COLOR.text}`}>
                          {l.qty}
                        </div>
                        {l.atutalasQty > 0 && (
                          <div className="text-[10px] font-medium leading-tight text-blue-600 dark:text-blue-400">
                            {l.atutalasQty === l.qty ? "átutalással" : `ebből ${l.atutalasQty} átutalással`}
                          </div>
                        )}
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => handleDeleteGroup(g.dayKey, l)}
                            title="Törlés (hibás rögzítés)"
                            className="absolute top-0.5 right-0.5 rounded p-0.5 text-destructive/50 hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-5">
        <Card
          className="cursor-pointer border-warning/30 bg-warning/5 transition-colors hover:bg-warning/10"
          onClick={openKasszaDetail}
        >
          <CardHeader>
            <CardTitle className="text-xs font-medium text-warning">
              Kassza egyenleg
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-warning">
              {kassza.toLocaleString("hu-HU")} Ft
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Kattints a tételes bevétel/kifizetés listáért
            </p>
          </CardContent>
        </Card>

        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-xs font-medium text-primary">
              Mai kiadás
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">
              {todayExpense.toLocaleString("hu-HU")} Ft
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">Kifizetésre váró tételek</CardTitle>
            <div className="flex items-center gap-2">
              {pendingGroups.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPendingListOpen((v) => !v)}
                >
                  Lista ({pendingGroups.length})
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={openPendingAdd}>
                + Új tétel
              </Button>
            </div>
          </CardHeader>
          {(pendingGroups.length === 0 || pendingListOpen) && (
            <CardContent className="space-y-3">
              {pendingGroups.length === 0 && (
                <p className="text-xs text-muted-foreground">Nincs kifizetésre váró tétel.</p>
              )}
              {pendingGroups.map((g) => (
                <div key={g.seller} className="rounded-md border px-3 py-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{g.seller}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums">
                        {g.total.toLocaleString("hu-HU")} Ft
                      </span>
                      <button
                        type="button"
                        onClick={() => openPendingAddForSeller(g.seller)}
                        title="Új dátumra felvétel"
                        className="rounded-md border p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <Button size="sm" disabled={pendingSubmitting} onClick={() => handlePaySeller(g.seller, g.total)}>
                        Kifizetés
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {g.entries.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center justify-between rounded-md bg-muted/30 px-2.5 py-1.5 text-xs"
                    >
                      <span className="text-muted-foreground">
                        {dayGroupLabel(e.day_key)} · {e.type} ·{" "}
                        <span className="font-medium text-foreground">{e.qty} db</span>
                        {e.created_by && <> · {e.created_by}</>}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-medium tabular-nums">
                          {e.total.toLocaleString("hu-HU")} Ft
                        </span>
                        <button
                          type="button"
                          onClick={() => openPendingEdit(e)}
                          title="Módosítás"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(e)}
                          title="Törlés"
                          className="text-destructive/70 hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Nyitvatartáson túl/hétvégén leadott tétel — a darabszám azonnal a készletben van,
                a kassza csak a "Kifizetés" gombra kattintva, a tényleges kifizetéskor csökken.
              </p>
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Egyéb kassza-mozgás</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Leírás (pl. számla kifizetése)"
              value={kasszaDesc}
              onChange={(e) => setKasszaDesc(e.target.value)}
            />
            <Input
              type="number"
              placeholder="Összeg (Ft), negatív ha kiadás"
              value={kasszaAmount}
              onChange={(e) => setKasszaAmount(e.target.value)}
            />
            <Button
              variant="outline"
              className="w-full"
              disabled={kasszaSubmitting}
              onClick={recordKassza}
            >
              {kasszaSubmitting ? "Mentés…" : "Rögzítés"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={kasszaDetailOpen} onOpenChange={setKasszaDetailOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Kassza mozgások</DialogTitle>
          </DialogHeader>
          {kasszaDetailLoading ? (
            <p className="text-sm text-muted-foreground">Betöltés…</p>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <h4 className="mb-2 text-xs font-medium text-success">Bevétel</h4>
                <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
                  {kasszaMovements.filter((m) => m.amount > 0).length === 0 && (
                    <p className="text-xs text-muted-foreground">Nincs tétel.</p>
                  )}
                  {kasszaMovements
                    .filter((m) => m.amount > 0)
                    .map((m) => (
                      <div
                        key={m.id}
                        className="flex items-start justify-between gap-2 rounded-md border bg-success/5 px-2.5 py-1.5 text-sm"
                      >
                        <span className="text-muted-foreground">
                          {m.date} · {m.description}
                          {m.created_by && <> · {m.created_by}</>}
                        </span>
                        <span className="shrink-0 font-medium tabular-nums text-success">
                          +{m.amount.toLocaleString("hu-HU")} Ft
                        </span>
                      </div>
                    ))}
                </div>
              </div>
              <div>
                <h4 className="mb-2 text-xs font-medium text-destructive">Kifizetés</h4>
                <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
                  {kasszaMovements.filter((m) => m.amount < 0).length === 0 && (
                    <p className="text-xs text-muted-foreground">Nincs tétel.</p>
                  )}
                  {kasszaMovements
                    .filter((m) => m.amount < 0)
                    .map((m) => (
                      <div
                        key={m.id}
                        className="flex items-start justify-between gap-2 rounded-md border bg-destructive/5 px-2.5 py-1.5 text-sm"
                      >
                        <span className="text-muted-foreground">
                          {m.date} · {m.description}
                          {m.created_by && <> · {m.created_by}</>}
                        </span>
                        <span className="shrink-0 font-medium tabular-nums text-destructive">
                          {m.amount.toLocaleString("hu-HU")} Ft
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={customPriceOpen} onOpenChange={setCustomPriceOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Vétel — egyedi áron</DialogTitle>
          </DialogHeader>
          <div className="space-y-3" data-kbnav-group>
            {getEntries().map(([type, qtyStr]) => (
              <div key={type} className="flex items-center justify-between gap-3">
                <div className="text-sm">
                  <div className="font-medium">{type}</div>
                  <div className="text-xs text-muted-foreground">{qtyStr} db</div>
                </div>
                <Input
                  type="number"
                  className="w-28 text-right"
                  value={customPrices[type] ?? ""}
                  onChange={(e) =>
                    setCustomPrices((prev) => ({ ...prev, [type]: e.target.value }))
                  }
                  data-kbnav-item
                  onKeyDown={kbNav}
                />
              </div>
            ))}
            <Button
              onClick={recordCustomPrice}
              disabled={submitting}
              className="w-full bg-violet-600 text-white hover:bg-violet-700"
              data-kbnav-submit
            >
              {submitting ? "Mentés…" : "Rögzítés egyedi áron"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={pendingAddOpen} onOpenChange={setPendingAddOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Kifizetésre váró tétel felvétele</DialogTitle>
          </DialogHeader>
          <div className="space-y-3" data-kbnav-group>
            <div className="space-y-1.5">
              <Label className="text-xs">Név</Label>
              <Input
                value={pendingSeller}
                onChange={(e) => setPendingSeller(e.target.value)}
                placeholder="Ki hozta"
                disabled={pendingSellerLocked}
                data-kbnav-item
                onKeyDown={kbNav}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Dátum</Label>
              <Input
                type="date"
                value={pendingDate}
                onChange={(e) => setPendingDate(e.target.value)}
                data-kbnav-item
                onKeyDown={kbNav}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Típusok és darabszámok</Label>
              <div className="grid grid-cols-2 gap-3">
                {Object.keys(prices).map((t) => {
                  const vanDarab = Number(pendingQtyMap[t]) > 0;
                  const ar = pendingPriceMap[t] ?? String(prices[t] ?? "");
                  const eltero = Number(ar) !== (prices[t] ?? 0);
                  return (
                    <div key={t} className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">{t}</Label>
                      <Input
                        type="number"
                        placeholder="db"
                        value={pendingQtyMap[t] ?? ""}
                        onChange={(e) =>
                          setPendingQtyMap((prev) => ({ ...prev, [t]: e.target.value }))
                        }
                        data-kbnav-item
                        onKeyDown={kbNav}
                      />
                      {/* Ár csak ott, ahol tényleg rögzítünk valamit — az
                          irányárral indul, és bármikor átírható. */}
                      {vanDarab && (
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            value={ar}
                            onChange={(e) =>
                              setPendingPriceMap((prev) => ({ ...prev, [t]: e.target.value }))
                            }
                            className={`h-8 ${eltero ? "border-warning text-warning" : ""}`}
                            data-kbnav-item
                            onKeyDown={kbNav}
                          />
                          <span className="text-[11px] text-muted-foreground">Ft/db</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Összeg</span>
              <span className="font-semibold tabular-nums">
                {pendingAddTotal.toLocaleString("hu-HU")} Ft
              </span>
            </div>
            <Button
              onClick={submitPendingAdd}
              disabled={pendingSubmitting}
              className="w-full"
              data-kbnav-submit
            >
              {pendingSubmitting ? "Mentés…" : "Rögzítés"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingEditRow !== null}
        onOpenChange={(open) => !open && setPendingEditRow(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Tétel módosítása — {pendingEditRow?.seller}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3" data-kbnav-group>
            <div className="space-y-1.5">
              <Label className="text-xs">Dátum</Label>
              <Input
                type="date"
                value={pendingEditDate}
                onChange={(e) => setPendingEditDate(e.target.value)}
                data-kbnav-item
                onKeyDown={kbNav}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Típus</Label>
              <Select
                value={pendingEditType}
                onValueChange={(v) => v && setPendingEditType(v)}
              >
                <SelectTrigger className="w-full" data-kbnav-item onKeyDown={kbNav}>
                  <SelectValue placeholder="Válassz típust" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(prices).map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Darabszám</Label>
              <Input
                type="number"
                value={pendingEditQty}
                onChange={(e) => setPendingEditQty(e.target.value)}
                placeholder="db"
                data-kbnav-item
                onKeyDown={kbNav}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Összeg</span>
              <span className="font-semibold tabular-nums">
                {(
                  (Number(pendingEditQty) || 0) * (prices[pendingEditType] ?? 0)
                ).toLocaleString("hu-HU")}{" "}
                Ft
              </span>
            </div>
            <Button
              onClick={submitPendingEdit}
              disabled={pendingSubmitting}
              className="w-full"
              data-kbnav-submit
            >
              {pendingSubmitting ? "Mentés…" : "Módosítás mentése"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </div>
    </fieldset>
  );
}
