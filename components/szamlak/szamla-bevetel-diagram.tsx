import type { SzamlaHaviBevetelSor, SzamlaKiemeltStatisztika } from "@/lib/szamlak/szamla-constants";

const HONAP_ROVID = ["Jan", "Feb", "Már", "Ápr", "Máj", "Jún", "Júl", "Aug", "Szep", "Okt", "Nov", "Dec"];

function formatKompakt(n: number): string {
  if (Math.abs(n) >= 1_000_000) {
    const m = n / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(Math.round(n));
}

function formatOsszeg(n: number) {
  return `${Number(n).toLocaleString("de-DE", { maximumFractionDigits: 0 })} Ft`;
}

const INNER_LEFT = 40;
const INNER_RIGHT = 690;
const INNER_TOP = 10;
const INNER_BOTTOM = 130;

// Fix színek (nem a szürkeárnyalatos --chart-* tokenek) — a Fuvar/Raklap
// megkülönböztetés kék/narancs kódolása a teljes Számlák modulban
// következetes elvárás, ez az egyetlen hely, ahol ez ténylegesen meg is
// jelenik (lásd AGENTS.md — a narancs márkaszín egyelőre sehol máshol).
const SZIN_FUVAR = "#3b82f6";
const SZIN_RAKLAP = "#f97316";

/** Havi bevétel diagram (Fuvar/Raklap halmozott oszlop, csak HUF, csak az eltelt hónapokra), alatta egy statisztika-sor. */
export function SzamlaBevetelDiagram({
  havi,
  statisztika,
}: {
  havi: SzamlaHaviBevetelSor[];
  statisztika: SzamlaKiemeltStatisztika;
}) {
  const jelenlegiHonap = new Date().getMonth() + 1;
  const maxErtek = Math.max(1, ...havi.map((h) => h.osszes));
  // Kerek, a maxErtek fölötti tengely-felső határ (a rácsvonalak "szép" osztásához).
  const tengelyMax = (() => {
    const nagysagrend = Math.pow(10, Math.floor(Math.log10(maxErtek)));
    const lepesek = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    for (const l of lepesek) {
      if (maxErtek <= l * nagysagrend) return l * nagysagrend;
    }
    return 10 * nagysagrend;
  })();

  const n = Math.max(havi.length, 1);
  const slot = (INNER_RIGHT - INNER_LEFT) / n;
  const barSzelesseg = Math.min(26, slot * 0.5);

  function y(ertek: number) {
    return INNER_BOTTOM - (ertek / tengelyMax) * (INNER_BOTTOM - INNER_TOP);
  }

  const racsvonalak = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    y: y(tengelyMax * f),
    label: formatKompakt(tengelyMax * f),
  }));

  const novekedes = statisztika.novekedesSzazalek;

  return (
    <div className="rounded-md border bg-card p-3 shadow-sm">
      <div className="mb-2 text-sm font-semibold">Havi bevétel — Fuvar + Raklap (HUF, {new Date().getFullYear()})</div>
      <div className="rounded border bg-muted/20 p-2">
        <svg viewBox="0 0 700 150" className="h-[130px] w-full" preserveAspectRatio="xMidYMid meet">
          {racsvonalak.map((r) => (
            <line key={r.y} x1={INNER_LEFT} y1={r.y} x2={INNER_RIGHT} y2={r.y} stroke="var(--border)" strokeWidth={0.5} />
          ))}
          <line x1={INNER_LEFT} y1={INNER_TOP} x2={INNER_LEFT} y2={INNER_BOTTOM + 3} stroke="var(--muted-foreground)" strokeWidth={1} />
          <line
            x1={INNER_LEFT}
            y1={INNER_BOTTOM + 3}
            x2={INNER_RIGHT}
            y2={INNER_BOTTOM + 3}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          {havi.map((h, i) => {
            const x = INNER_LEFT + slot * i + (slot - barSzelesseg) / 2;
            const aktualis = h.honap === jelenlegiHonap;
            return (
              <g key={h.honap}>
                <rect
                  x={x}
                  y={y(h.fuvar)}
                  width={barSzelesseg}
                  height={INNER_BOTTOM + 3 - y(h.fuvar)}
                  fill={SZIN_FUVAR}
                  stroke={aktualis ? "var(--foreground)" : "none"}
                  strokeWidth={aktualis ? 1.2 : 0}
                />
                <rect
                  x={x}
                  y={y(h.osszes)}
                  width={barSzelesseg}
                  height={y(h.fuvar) - y(h.osszes)}
                  fill={SZIN_RAKLAP}
                  stroke={aktualis ? "var(--foreground)" : "none"}
                  strokeWidth={aktualis ? 1.2 : 0}
                />
                {h.osszes > 0 && (
                  <text
                    x={x + barSzelesseg / 2}
                    y={y(h.osszes) - 5}
                    fontSize={8}
                    fontWeight={aktualis ? 700 : 400}
                    textAnchor="middle"
                    fill="var(--foreground)"
                  >
                    {formatKompakt(h.osszes)}
                  </text>
                )}
                <text
                  x={x + barSzelesseg / 2}
                  y={INNER_BOTTOM + 14}
                  fontSize={8}
                  fontWeight={aktualis ? 700 : 400}
                  textAnchor="middle"
                  fill="var(--muted-foreground)"
                >
                  {HONAP_ROVID[h.honap - 1]}
                </text>
              </g>
            );
          })}
          {racsvonalak.map((r) => (
            <text key={`l-${r.y}`} x={INNER_LEFT - 6} y={r.y + 3} fontSize={8} textAnchor="end" fill="var(--muted-foreground)">
              {r.label}
            </text>
          ))}
        </svg>
      </div>

      <div className="mt-2 flex justify-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: SZIN_FUVAR }} /> Fuvar
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: SZIN_RAKLAP }} /> Raklap
        </div>
      </div>

      <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 border-t pt-2 text-xs text-muted-foreground">
        <span>
          Éves (Jan–{HONAP_ROVID[jelenlegiHonap - 1]}): <span className="font-semibold text-foreground">{formatOsszeg(statisztika.evesYtdHuf)}</span>
        </span>
        <span title="A folyó, még félkész hónap nélkül">
          Havi átlag: <span className="font-semibold text-foreground">{formatOsszeg(statisztika.haviAtlagHuf)}</span>
        </span>
        <span>
          Csúcs:{" "}
          <span className="font-semibold text-foreground">
            {statisztika.csucsHonap
              ? `${HONAP_ROVID[statisztika.csucsHonap - 1]} (${formatOsszeg(statisztika.csucsHonapOsszegHuf)})`
              : "—"}
          </span>
        </span>
        <span title="Az utolsó lezárt hónap az azt megelőzőhöz képest">
          Növekedés:{" "}
          <span
            className={`font-semibold ${novekedes !== null && novekedes >= 0 ? "text-success" : novekedes !== null ? "text-destructive" : "text-foreground"}`}
          >
            {novekedes !== null ? `${novekedes >= 0 ? "+" : ""}${novekedes.toFixed(0)}%` : "—"}
          </span>
        </span>
      </div>
    </div>
  );
}
