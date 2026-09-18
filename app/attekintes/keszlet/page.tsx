import { Truck } from "lucide-react";
import { getKeszletFulAdatok } from "@/lib/attekintes/actions";

// Telephelyenkénti színek a gyűrűn és a típus-sávokon (Menta-antracit
// árnyalatai, a legerősebb a fő telep). Az úton lévő mennyiség borostyán.
const TELEP_SZINEK = ["#1f7a5c", "#5dcaa5", "#b4c7be", "#8aa39a"];
const UTON_SZIN = "#e0a43a";

function db(n: number) {
  return n.toLocaleString("hu-HU");
}

type Szelet = { ertek: number; szin: string };

/** Egyszerű SVG gyűrű-diagram: a szeletek a stroke-dasharray-jel rajzolódnak. */
function Gyuru({ szeletek, kozepFent, kozepLent }: { szeletek: Szelet[]; kozepFent: string; kozepLent: string }) {
  const r = 38;
  const kerulet = 2 * Math.PI * r;
  const osszeg = szeletek.reduce((s, x) => s + Math.max(0, x.ertek), 0);
  let eltolas = 0;
  return (
    <svg viewBox="0 0 100 100" className="h-32 w-32 shrink-0" role="img" aria-label={`${kozepFent} ${kozepLent}`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--at-tile)" strokeWidth="13" />
      {osszeg > 0 &&
        szeletek.map((sz, i) => {
          const hossz = (Math.max(0, sz.ertek) / osszeg) * kerulet;
          const kezdet = eltolas;
          eltolas += hossz;
          if (hossz <= 0) return null;
          // Szeletek közt vékony rés, hogy egymás mellett is elváljanak.
          const rajzolt = szeletek.length > 1 ? Math.max(hossz - 0.8, 0.1) : hossz;
          return (
            <circle
              key={i}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={sz.szin}
              strokeWidth="13"
              strokeDasharray={`${rajzolt} ${kerulet}`}
              strokeDashoffset={-kezdet}
              transform="rotate(-90 50 50)"
            />
          );
        })}
      <text x="50" y="49" textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--at-text)">
        {kozepFent}
      </text>
      <text x="50" y="61" textAnchor="middle" fontSize="8" fill="var(--at-muted)">
        {kozepLent}
      </text>
    </svg>
  );
}

export default async function KeszletPage() {
  const { telepek, tipusok, uton } = await getKeszletFulAdatok();
  const osszes = telepek.reduce((s, t) => s + t.osszes, 0);
  const utonOsszes = uton.reduce((s, u) => s + u.qty, 0);
  const telepSzin = new Map(telepek.map((t, i) => [t.nev, TELEP_SZINEK[i % TELEP_SZINEK.length]]));

  const szeletek: Szelet[] = [
    ...telepek.map((t) => ({ ertek: t.osszes, szin: telepSzin.get(t.nev)! })),
    ...(utonOsszes > 0 ? [{ ertek: utonOsszes, szin: UTON_SZIN }] : []),
  ];

  return (
    <div className="flex flex-col gap-4 py-4">
      <div>
        <h1 className="text-base font-semibold">Készlet</h1>
        <p className="text-xs text-[var(--at-muted)]">Minden telephely — aktuális állapot</p>
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-[var(--at-border)] bg-[var(--at-card)] p-4">
        <Gyuru szeletek={szeletek} kozepFent={db(osszes)} kozepLent="db készleten" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm">
          {telepek.map((t) => (
            <div key={t.nev} className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: telepSzin.get(t.nev) }} />
                <span className="truncate">{t.nev}</span>
              </span>
              <span className="font-semibold tabular-nums">{db(t.osszes)}</span>
            </div>
          ))}
          {utonOsszes > 0 && (
            <div className="flex items-center justify-between gap-2 text-[#854f0b]">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: UTON_SZIN }} />
                Úton
              </span>
              <span className="font-semibold tabular-nums">{db(utonOsszes)}</span>
            </div>
          )}
        </div>
      </div>

      {uton.length > 0 && (
        <div className="flex flex-col gap-2">
          {uton.map((u) => (
            <div key={u.id} className="flex items-start gap-2 rounded-lg bg-[#faeeda] p-2.5 text-xs text-[#633806]">
              <Truck className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-medium">
                  {db(u.qty)} db {u.tipus} · {u.honnan ?? "?"} → {u.hova}
                </div>
                <div>Átvételre vár · {u.mikor} — egyik telep számában sincs benne</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold">Típusonként</h2>
        {tipusok.length === 0 ? (
          <p className="text-sm text-[var(--at-muted)]">Jelenleg egyik telephelyen sincs készlet.</p>
        ) : (
          <div className="flex flex-col gap-3 rounded-xl border border-[var(--at-border)] bg-[var(--at-card)] p-4">
            {tipusok.map((t) => {
              const pozitiv = telepek.map((tp) => Math.max(0, t.telepenkent[tp.nev] ?? 0));
              const sav = pozitiv.reduce((s, x) => s + x, 0);
              return (
                <div key={t.tipus}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span>{t.tipus}</span>
                    <span className="font-semibold tabular-nums">{db(t.osszes)}</span>
                  </div>
                  <div className="flex h-2 overflow-hidden rounded-full bg-[var(--at-tile)]">
                    {sav > 0 &&
                      telepek.map((tp, i) =>
                        pozitiv[i] > 0 ? (
                          <div
                            key={tp.nev}
                            style={{ width: `${(pozitiv[i] / sav) * 100}%`, background: telepSzin.get(tp.nev) }}
                          />
                        ) : null
                      )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-[var(--at-muted)]">
                    {telepek
                      .filter((tp) => (t.telepenkent[tp.nev] ?? 0) !== 0)
                      .map((tp) => (
                        <span key={tp.nev}>
                          {tp.nev} <span className="font-medium tabular-nums text-[var(--at-text)]">{db(t.telepenkent[tp.nev])}</span>
                        </span>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
