import Link from "next/link";
import type { KocsiSav } from "@/lib/fuvarozas2/kocsi-sav-alap";
import { findJarmuByKod, JARMU_SZIN_DOT_CLASS } from "@/lib/fuvarozas/vehicles";

// Fuvarozás 2. kör · Kocsik / Ma: kocsinként egy sáv (docs/fuvarozas-2-kor-terv.md,
// „Kocsi-sáv betöltő és felület (Dev A)”). Hol van, tachó, a futó fuvar
// haladása, a hét számai és a következő szabad nap → ajánlat. A fejre kattintva
// a kocsi lapja. Szerver-komponens; telefonon egy oszlop, szélesebben kettő.

const ALLAPOT_SZOVEG: Record<NonNullable<KocsiSav["allapot"]>["szin"], string> = {
  mint: "text-[var(--f2-mint)]",
  amber: "text-[var(--f2-amb)]",
  red: "text-[var(--f2-red)]",
  normal: "text-foreground",
};
const ALLAPOT_PONT: Record<NonNullable<KocsiSav["allapot"]>["szin"], string> = {
  mint: "bg-[var(--f2-mint)]",
  amber: "bg-[var(--f2-amb)]",
  red: "bg-[var(--f2-red)]",
  normal: "bg-foreground/40",
};

/** „235 e”, „−95 e” (ezer forint, kerekítve). */
const ezer = (x: number) => `${Math.round(x / 1000).toLocaleString("hu-HU").replace("-", "−")} e`;
const kocsiHref = (kod: string) => `/fuvarozas2/kocsi/${encodeURIComponent(kod)}`;

function SzinPotty({ kod }: { kod: string }) {
  const szin = findJarmuByKod(kod)?.szin;
  return <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${szin ? JARMU_SZIN_DOT_CLASS[szin] : "bg-foreground/30"}`} />;
}

function Fej({ s }: { s: KocsiSav }) {
  return (
    <Link href={kocsiHref(s.kod)} className="flex min-w-0 flex-col gap-1 rounded-t-2xl px-4 pt-3 pb-2 hover:bg-muted/50">
      <div className="flex min-w-0 items-center gap-2">
        <SzinPotty kod={s.kod} />
        <span className="truncate text-base font-bold">{s.sofor}</span>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">{s.kod} ›</span>
      </div>
      {s.allapot ? (
        <div className="flex min-w-0 items-center gap-1.5 text-sm">
          <span className={`size-2 shrink-0 rounded-full ${ALLAPOT_PONT[s.allapot.szin]}`} />
          <span className={`truncate font-semibold ${ALLAPOT_SZOVEG[s.allapot.szin]}`}>{s.allapot.szoveg}</span>
        </div>
      ) : null}
      {s.hely ? <div className="truncate text-xs text-muted-foreground">{s.hely}</div> : null}
      {s.tacho ? <div className="text-xs text-muted-foreground">{s.tacho}</div> : null}
    </Link>
  );
}

function Futo({ futo }: { futo: NonNullable<KocsiSav["futo"]> }) {
  const k = futo.kovetkezo;
  const ido = k ? [k.terv ? `terv ${k.terv}` : null, k.teny, k.elteres].filter(Boolean).join(" · ") : "";
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-sm">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="truncate font-semibold">{futo.partner || "fuvar"}</span>
        {futo.jelleg === "sajat" ? <span className="shrink-0 text-xs text-muted-foreground">saját</span> : null}
        <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
          {futo.keszDb}/{futo.osszDb} megálló kész
        </span>
      </div>
      {k ? (
        <div className={`min-w-0 ${k.kesik ? "text-[var(--f2-red)]" : ""}`}>
          <span className="font-medium">{k.felLe === "felrako" ? "Felrakás" : "Lerakás"}: {k.varos}</span>
          {ido ? <span className={k.kesik ? "" : "text-muted-foreground"}> · {ido}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function Lab({ s }: { s: KocsiSav }) {
  const h = s.hetSzamok;
  if (!h && !s.szabad) return null;
  return (
    <div className="flex flex-col gap-1 border-t border-foreground/10 px-4 py-2 text-xs text-muted-foreground">
      {h ? (
        <div className="tabular-nums">
          Hét: {ezer(h.bevetelFt)} Ft
          {h.uresSzazalek != null ? ` · üres ${Math.round(h.uresSzazalek)} %` : ""}
          {h.fedezetPerNap != null ? (
            <>
              {" · fedezet/nap "}
              <span className={h.fedezetPerNap < 0 ? "text-[var(--f2-red)]" : ""}>{ezer(h.fedezetPerNap)}</span>
            </>
          ) : null}
        </div>
      ) : null}
      {s.szabad ? (
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span>
            Szabad: <span className="font-semibold text-foreground">{s.szabad.cimke}</span>
            {s.szabad.honnan ? ` (${s.szabad.honnan}${s.szabad.km != null ? ` → ${s.szabad.km.toLocaleString("hu-HU")} km üres` : ""})` : ""}
          </span>
          <Link href={s.ajanlatHref} className="font-semibold text-[var(--f2-mint)] hover:underline">
            → ajánlat
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function SavKartya({ s, holnapCimke }: { s: KocsiSav; holnapCimke: string }) {
  if (!s.uzemel) {
    return (
      <Link
        href={kocsiHref(s.kod)}
        className="flex min-w-0 items-center gap-2 rounded-2xl border border-dashed border-foreground/15 bg-card px-4 py-3 text-sm text-muted-foreground hover:bg-muted/50"
      >
        <SzinPotty kod={s.kod} />
        <span className="font-semibold">{s.sofor}</span>
        <span className="min-w-0 truncate">· {s.helykitolto || "nem üzemel"}</span>
      </Link>
    );
  }
  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-foreground/10 bg-card">
      <Fej s={s} />
      <div className="border-t border-foreground/10 px-4 py-2">
        {s.futo ? (
          <Futo futo={s.futo} />
        ) : s.kovetkezoFuvar ? (
          <div className="min-w-0 text-sm">
            <span className="text-muted-foreground">Következő: </span>
            <span className="font-semibold">{s.kovetkezoFuvar.partner}</span>{" "}
            <span>{s.kovetkezoFuvar.utvonal}</span>
            <span className="text-muted-foreground"> ({holnapCimke.toLocaleLowerCase("hu-HU")})</span>
          </div>
        ) : (
          <div className="text-sm font-semibold text-[var(--f2-mint)]">Szabad</div>
        )}
      </div>
      <Lab s={s} />
    </div>
  );
}

export function DontesreVarSor({ bejovo, kocsiraVar }: { bejovo: number; kocsiraVar: number }) {
  if (bejovo + kocsiraVar <= 0) return null;
  const reszek = [
    bejovo > 0 ? `${bejovo} bejövő megbízás` : null,
    kocsiraVar > 0 ? `${kocsiraVar} kocsira vár` : null,
  ].filter(Boolean);
  return (
    <Link
      href="/fuvarozas2/tervezes"
      className="flex items-center gap-2 rounded-2xl border border-[var(--f2-amb)]/30 bg-[var(--f2-amb-l)] px-4 py-2.5 text-sm text-[#5a3806] hover:underline"
    >
      <span className="font-semibold">Döntésre vár:</span>
      <span className="min-w-0">{reszek.join(" · ")}</span>
      <span className="ml-auto shrink-0">›</span>
    </Link>
  );
}

export function KocsiSavok({ savok, holnapCimke }: { savok: KocsiSav[]; holnapCimke: string }) {
  if (savok.length === 0) return null;
  return (
    <section aria-label="Kocsik" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {savok.map((s) => (
        <SavKartya key={s.kod} s={s} holnapCimke={holnapCimke} />
      ))}
    </section>
  );
}
