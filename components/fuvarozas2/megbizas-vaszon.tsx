import Link from "next/link";
import { LepesBadge, formatFt, formatNap } from "@/components/fuvarozas2/kozos";
import { LEPESEK } from "@/lib/fuvarozas/allapot";
import { ALLAPOT_CIMKE } from "@/components/fuvarozas2/kozos";
import { kovetkezoTeendo } from "@/lib/fuvarozas2/megbizas-szuro";
import type { MegbizasSor } from "@/lib/fuvarozas2/megbizasok";
import { cn } from "@/lib/utils";

// Megbízások a tervvászon (D2) szerint: bal oldalon szűrősáv darabszámokkal,
// jobbra egy lista — a régi hat alfül helyett. Az utolsó oszlop a
// „Következő teendő": mi az EGY dolog, ami ezen a soron hátravan.

type Szamok = {
  jelleg: { ber: number; sajat: number };
  allapot: Record<string, number>;
  lepes: Record<string, number>;
  jarmu: { kod: string; cimke: string; n: number }[];
  jarmuNelkul: number;
  idoszak: Record<string, number>;
  mind: number;
};

export type SzuroErtekek = { jelleg?: string; allapot?: string; lepes?: string; jarmu?: string; idoszak?: string; reszlet?: string };

function link(alap: SzuroErtekek, valtozas: Partial<SzuroErtekek>): string {
  const p = new URLSearchParams();
  const egyesitve = { ...alap, ...valtozas, reszlet: undefined };
  for (const [k, v] of Object.entries(egyesitve)) if (v) p.set(k, String(v));
  const q = p.toString();
  return `/fuvarozas2/megbizasok${q ? `?${q}` : ""}`;
}

function SavCsoport({ cim, children }: { cim: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{cim}</div>
      {children}
    </div>
  );
}

function SavSor({ href, cimke, n, aktiv }: { href: string; cimke: string; n: number; aktiv: boolean }) {
  return (
    <Link href={href} className={cn(
      "flex items-baseline justify-between gap-2 rounded-lg px-2 py-1.5 text-sm",
      aktiv ? "bg-[var(--f2-mint-l)] font-semibold text-[var(--f2-mint)]" : "hover:bg-muted"
    )}>
      <span className="min-w-0 truncate">{cimke}</span>
      <span className="shrink-0 tabular-nums text-xs text-muted-foreground">{n}</span>
    </Link>
  );
}

export function MegbizasSzuroSav({ szuro, szamok }: { szuro: SzuroErtekek; szamok: Szamok }) {
  const IDOSZAK: { kulcs: string; cimke: string }[] = [
    { kulcs: "ez_a_het", cimke: "Ez a hét" },
    { kulcs: "mult_het", cimke: "Múlt hét" },
    { kulcs: "regebbi", cimke: "Régebbi" },
  ];
  return (
    <aside className="w-56 shrink-0 rounded-2xl border border-foreground/10 bg-card p-2">
      <SavCsoport cim="Jelleg">
        <SavSor href={link(szuro, { jelleg: undefined })} cimke="Mind" n={szamok.mind} aktiv={!szuro.jelleg} />
        <SavSor href={link(szuro, { jelleg: "ber" })} cimke="Bér fuvar" n={szamok.jelleg.ber} aktiv={szuro.jelleg === "ber"} />
        <SavSor href={link(szuro, { jelleg: "sajat" })} cimke="Saját fuvar" n={szamok.jelleg.sajat} aktiv={szuro.jelleg === "sajat"} />
      </SavCsoport>

      <SavCsoport cim="Hol tart">
        <SavSor href={link(szuro, { lepes: undefined, allapot: undefined })} cimke="Mind" n={szamok.mind} aktiv={!szuro.lepes && !szuro.allapot} />
        {LEPESEK.map((l) => (
          <SavSor key={l.kulcs} href={link(szuro, { lepes: l.kulcs, allapot: undefined })} cimke={l.cimke} n={szamok.lepes[l.kulcs] ?? 0} aktiv={szuro.lepes === l.kulcs} />
        ))}
        {szuro.allapot ? <SavSor href={link(szuro, {})} cimke={`csak: ${ALLAPOT_CIMKE[szuro.allapot as keyof typeof ALLAPOT_CIMKE] ?? szuro.allapot}`} n={szamok.allapot[szuro.allapot] ?? 0} aktiv /> : null}
      </SavCsoport>

      <SavCsoport cim="Kocsi">
        <SavSor href={link(szuro, { jarmu: undefined })} cimke="Mind" n={szamok.mind} aktiv={!szuro.jarmu} />
        {szamok.jarmu.map((j) => (
          <SavSor key={j.kod} href={link(szuro, { jarmu: j.kod })} cimke={j.cimke} n={j.n} aktiv={szuro.jarmu === j.kod} />
        ))}
        <SavSor href={link(szuro, { jarmu: "nincs" })} cimke="Kocsi nélkül" n={szamok.jarmuNelkul} aktiv={szuro.jarmu === "nincs"} />
      </SavCsoport>

      <SavCsoport cim="Időszak">
        <SavSor href={link(szuro, { idoszak: undefined })} cimke="Mind" n={szamok.mind} aktiv={!szuro.idoszak} />
        {IDOSZAK.map((i) => (
          <SavSor key={i.kulcs} href={link(szuro, { idoszak: i.kulcs })} cimke={i.cimke} n={szamok.idoszak[i.kulcs] ?? 0} aktiv={szuro.idoszak === i.kulcs} />
        ))}
      </SavCsoport>
    </aside>
  );
}

export function MegbizasTabla({ sorok, ma, szuro }: { sorok: MegbizasSor[]; ma: string; szuro: SzuroErtekek }) {
  const reszletLink = (id: string) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...szuro, reszlet: id })) if (v) p.set(k, String(v));
    return `/fuvarozas2/megbizasok?${p.toString()}#reszlet`;
  };
  return (
    <div className="min-w-0 flex-1 overflow-x-auto rounded-2xl border border-foreground/10 bg-card">
      <table className="w-full min-w-[52rem] text-sm">
        <thead>
          <tr className="border-b border-foreground/10 text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 text-left font-semibold">Hol tart</th>
            <th className="px-3 py-2 text-left font-semibold">Partner</th>
            <th className="px-3 py-2 text-left font-semibold">Hivatkozás</th>
            <th className="px-3 py-2 text-left font-semibold">Útvonal</th>
            <th className="px-3 py-2 text-left font-semibold">Dátum</th>
            <th className="px-3 py-2 text-left font-semibold">Kocsi</th>
            <th className="px-3 py-2 text-right font-semibold">Díj</th>
            <th className="px-3 py-2 text-left font-semibold">Következő teendő</th>
          </tr>
        </thead>
        <tbody>
          {sorok.length === 0 ? (
            <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Ezzel a szűréssel nincs megbízás.</td></tr>
          ) : null}
          {sorok.map((s) => {
            const t = kovetkezoTeendo(s, ma);
            const kijelolt = szuro.reszlet === s.id;
            return (
              <tr key={s.id} className={cn("border-b border-foreground/5 last:border-0 hover:bg-muted/40", kijelolt && "bg-[var(--f2-mint-l)]")}>
                <td className="px-3 py-2"><LepesBadge allapot={s.allapot} /></td>
                <td className="px-3 py-2">
                  <Link href={reszletLink(s.id)} className="font-medium hover:underline">{s.partner_nev ?? "(nincs megbízó)"}</Link>
                </td>
                <td className="max-w-[9rem] truncate px-3 py-2 text-muted-foreground">{s.hivatkozas ?? (s.hivatkozas_nincs ? "nincs" : "—")}</td>
                <td className="max-w-[16rem] truncate px-3 py-2 text-muted-foreground" title={`${s.felrako ?? "—"} → ${s.lerako ?? "—"}`}>{s.felrako ?? "—"} → {s.lerako ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums text-muted-foreground">{formatNap(s.lerakas_nap)}</td>
                <td className="px-3 py-2 text-muted-foreground">{s.jarmu_kod ?? <span className="text-[var(--f2-red)]">— kocsi nélkül</span>}</td>
                <td className="px-3 py-2 text-right tabular-nums">{s.jelleg === "ber" ? formatFt(s.fuvardij, s.fuvardij_penznem) : "—"}</td>
                <td className={cn("px-3 py-2", t.surgos ? "font-semibold text-[var(--f2-red)]" : "text-muted-foreground")}>{t.szoveg}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
