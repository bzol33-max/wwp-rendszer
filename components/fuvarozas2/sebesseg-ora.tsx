import { cn } from "@/lib/utils";

// Kocsi-fejléc sebességmutatója (redesign 5e): 270°-os ív, 135°-tól indul,
// skála 0–90 km/h. Tiszta megjelenítés, adatot nem számol; szerver-komponens.

const MERET = 92;
const VASTAG = 8;
const R = (MERET - VASTAG) / 2;
const KOR = 2 * Math.PI * R;
const IV = KOR * 0.75;
const SKALA_MAX = 90;

export function SebessegOra({ sebesseg, className }: { sebesseg: number | null | undefined; className?: string }) {
  const nincsAdat = sebesseg == null || !Number.isFinite(sebesseg);
  const arany = nincsAdat ? 0 : Math.max(0, Math.min(1, sebesseg / SKALA_MAX));
  const kitoltes = IV * arany;
  const ivAttr = { cx: MERET / 2, cy: MERET / 2, r: R, fill: "none", strokeWidth: VASTAG, strokeLinecap: "round" as const, transform: `rotate(135 ${MERET / 2} ${MERET / 2})` };

  return (
    <div
      className={cn("relative size-[76px] shrink-0 @[280px]:size-[92px]", className)}
      role="img"
      aria-label={nincsAdat ? "Sebesség: nincs GPS" : sebesseg === 0 ? "Sebesség: áll" : `Sebesség: ${sebesseg} km/h`}
    >
      <style>{`@keyframes sebesseg-ora-ki{from{stroke-dasharray:0 ${KOR}}to{stroke-dasharray:${kitoltes} ${KOR}}}@media (prefers-reduced-motion:no-preference){.sebesseg-ora-ki{animation:sebesseg-ora-ki 600ms ease-out}}`}</style>
      <svg viewBox={`0 0 ${MERET} ${MERET}`} className="size-full" aria-hidden>
        <circle {...ivAttr} stroke="#E5E8EE" strokeDasharray={`${IV} ${KOR}`} />
        {arany > 0 ? (
          <circle {...ivAttr} className="sebesseg-ora-ki" stroke="#0A84FF" strokeDasharray={`${kitoltes} ${KOR}`} />
        ) : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-tight">
        {nincsAdat ? (
          <>
            <span className="text-[22px] font-bold text-[#6E6E73]">—</span>
            <span className="text-xs text-[#6E6E73]">nincs GPS</span>
          </>
        ) : sebesseg === 0 ? (
          <span className="text-sm font-semibold">áll</span>
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
