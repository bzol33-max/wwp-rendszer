import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

// Kocsi-fejléc sebességmutatója (redesign 5e): 270°-os ív, 135°-tól indul,
// skála 0–90 km/h. Tiszta megjelenítés, adatot nem számol; szerver-komponens.
// `meret` nélkül a 5e műszerfal-méret (76/92 px, konténer-lekérdezéssel); `meret`
// megadva (5f: 58) fix, tömör változat: 6 px ív, csak a szám, „—” ha nincs adat.

const MERET = 92;
const SKALA_MAX = 90;

export function SebessegOra({ sebesseg, meret, className }: { sebesseg: number | null | undefined; meret?: number; className?: string }) {
  const nincsAdat = sebesseg == null || !Number.isFinite(sebesseg);
  const tomor = meret != null;
  const vb = tomor ? meret : MERET;
  const vastag = tomor ? 6 : 8;
  const r = (vb - vastag) / 2;
  const kor = 2 * Math.PI * r;
  const iv = kor * 0.75;
  const arany = nincsAdat ? 0 : Math.max(0, Math.min(1, sebesseg / SKALA_MAX));
  const kitoltes = iv * arany;
  const ivAttr = { cx: vb / 2, cy: vb / 2, r, fill: "none", strokeWidth: vastag, strokeLinecap: "round" as const, transform: `rotate(135 ${vb / 2} ${vb / 2})` };
  const stilus: CSSProperties | undefined = tomor ? { width: meret, height: meret } : undefined;

  return (
    <div
      className={cn("relative shrink-0", !tomor && "size-[76px] @[280px]:size-[92px]", className)}
      style={stilus}
      role="img"
      aria-label={nincsAdat ? "Sebesség: nincs GPS" : sebesseg === 0 ? "Sebesség: áll" : `Sebesség: ${sebesseg} km/h`}
      title={nincsAdat ? "nincs GPS" : undefined}
    >
      <style>{`@keyframes sebesseg-ora-ki{from{stroke-dasharray:0 ${kor}}to{stroke-dasharray:${kitoltes} ${kor}}}@media (prefers-reduced-motion:no-preference){.sebesseg-ora-ki{animation:sebesseg-ora-ki 600ms ease-out}}`}</style>
      <svg viewBox={`0 0 ${vb} ${vb}`} className="size-full" aria-hidden>
        <circle {...ivAttr} stroke="#E5E8EE" strokeDasharray={`${iv} ${kor}`} />
        {arany > 0 ? (
          <circle {...ivAttr} className="sebesseg-ora-ki" stroke="#0A84FF" strokeDasharray={`${kitoltes} ${kor}`} />
        ) : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-tight">
        {nincsAdat ? (
          tomor ? (
            <span className="text-[17px] font-bold text-[#6E6E73]">—</span>
          ) : (
            <>
              <span className="text-[22px] font-bold text-[#6E6E73]">—</span>
              <span className="text-xs text-[#6E6E73]">nincs GPS</span>
            </>
          )
        ) : sebesseg === 0 ? (
          <span className={tomor ? "text-[13px] font-semibold" : "text-sm font-semibold"}>áll</span>
        ) : tomor ? (
          <span className="text-[17px] font-bold tabular-nums">{Math.round(sebesseg)}</span>
        ) : (
          <>
            <span className="text-[22px] font-bold tabular-nums">{Math.round(sebesseg)}</span>
            <span className="text-xs text-[#6E6E73]">km/h</span>
          </>
        )}
      </div>
    </div>
  );
}
