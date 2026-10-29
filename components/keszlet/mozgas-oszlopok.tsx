"use client";

// "Legutóbbi mozgások" — kétoszlopos nézet (Szakoly, Balkány).
// Bal oszlop: Be, jobb oszlop: Ki, alattuk egy sáv a telephelyek közti
// mozgásokkal (kimenő "mozgatas" és bejövő "mozgatas_be").

import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, X } from "lucide-react";
import type { MovementRow } from "@/lib/keszlet/actions";

type Props = {
  site: string;
  movements: MovementRow[];
  canEdit: boolean;
  onDelete: (m: MovementRow) => void;
  /** Asztali redesign (Q1): Be / Ki / Telephelyek közti egymás mellett, görgethető listákkal. */
  harmasOszlop?: boolean;
};

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Törlés (hibás rögzítés)"
      aria-label="Törlés (hibás rögzítés)"
      className="shrink-0 text-destructive/70 hover:text-destructive"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}

function Row({
  m,
  label,
  qty,
  qtyClass,
  canEdit,
  onDelete,
  badge,
}: {
  m: MovementRow;
  label: string;
  qty: string;
  qtyClass: string;
  canEdit: boolean;
  onDelete: (m: MovementRow) => void;
  badge?: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-2 border-b py-1.5 text-sm last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{m.type}</span>
          {badge}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {m.date} · {label} · {m.created_by ?? "—"}
        </div>
      </div>
      <span className={`shrink-0 font-semibold tabular-nums ${qtyClass}`}>{qty}</span>
      {canEdit && <DeleteButton onClick={() => onDelete(m)} />}
    </li>
  );
}

function Column({
  title,
  icon,
  accent,
  total,
  children,
  empty,
  scroll = false,
}: {
  title: string;
  icon: React.ReactNode;
  accent: string;
  total: string;
  children: React.ReactNode;
  empty: boolean;
  scroll?: boolean;
}) {
  return (
    <div className={`min-w-0 rounded-lg border ${scroll ? "border-t-[3px]" : "border-t-2"} bg-background px-3 py-2 ${accent}`}>
      <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
        {icon}
        {title}
        <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">{total}</span>
      </div>
      {empty ? (
        <p className="py-3 text-center text-xs text-muted-foreground">Nincs mozgás</p>
      ) : (
        <ul className={scroll ? "max-h-[22rem] overflow-y-auto pr-1" : undefined}>{children}</ul>
      )}
    </div>
  );
}

export function MozgasOszlopok({ site, movements, canEdit, onDelete, harmasOszlop = false }: Props) {
  const be = movements.filter((m) => m.direction === "be");
  const ki = movements.filter((m) => m.direction === "ki");
  const kozti = movements.filter((m) => m.direction === "mozgatas" || m.direction === "mozgatas_be");

  const sum = (rows: MovementRow[]) => rows.reduce((s, m) => s + m.qty, 0);

  return (
    <div className={harmasOszlop ? "grid gap-3 xl:grid-cols-3" : "space-y-3"}>
      <div className={harmasOszlop ? "contents" : "grid gap-3 md:grid-cols-2"}>
        <Column
          title="Be"
          icon={<ArrowDownLeft className="h-4 w-4 text-success" />}
          accent="border-t-success"
          total={`+${sum(be)} db`}
          empty={be.length === 0}
          scroll={harmasOszlop}
        >
          {be.map((m) => (
            <Row
              key={m.id}
              m={m}
              label={m.partner ?? "—"}
              qty={`+${m.qty}`}
              qtyClass="text-success"
              canEdit={canEdit}
              onDelete={onDelete}
            />
          ))}
        </Column>

        <Column
          title="Ki"
          icon={<ArrowUpRight className="h-4 w-4 text-destructive" />}
          accent="border-t-destructive"
          total={`−${sum(ki)} db`}
          empty={ki.length === 0}
          scroll={harmasOszlop}
        >
          {ki.map((m) => (
            <Row
              key={m.id}
              m={m}
              label={m.partner ?? "—"}
              qty={`−${m.qty}`}
              qtyClass="text-destructive"
              canEdit={canEdit}
              onDelete={onDelete}
            />
          ))}
        </Column>
      </div>

      <Column
        title="Telephelyek közti"
        icon={<ArrowLeftRight className="h-4 w-4 text-primary" />}
        accent="border-t-primary"
        total={`${kozti.length} mozgás`}
        empty={kozti.length === 0}
        scroll={harmasOszlop}
      >
        {kozti.map((m) => {
          const kimeno = m.direction === "mozgatas";
          const utvonal = kimeno ? `${site} → ${m.target_site}` : `${m.target_site} → ${site}`;
          const varakozik = !kimeno && !m.accepted;
          return (
            <Row
              key={m.id}
              m={m}
              label={utvonal}
              qty={kimeno ? `−${m.qty}` : `+${m.qty}`}
              qtyClass={kimeno ? "text-destructive" : "text-success"}
              canEdit={canEdit}
              onDelete={onDelete}
              badge={
                varakozik ? (
                  // Még nem vették át: a mennyiség nincs benne a készletben.
                  <span className="rounded bg-warning/15 px-1.5 py-0.5 text-xs text-warning">
                    Átvételre vár
                  </span>
                ) : undefined
              }
            />
          );
        })}
      </Column>
    </div>
  );
}
