import { Truck } from "lucide-react";
import { getKeszletFulAdatok } from "@/lib/attekintes/actions";

// Telephelyenkénti színek a gyűrűkön (Menta-antracit árnyalatai, a
// legerősebb a fő telep). Az úton lévő mennyiség borostyán.
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
  const lathato = szeletek.filter((x) => x.ertek > 0).length;
  let eltolas = 0;
  return (
    <svg viewBox="0 0 100 100" className="h-24 w-24 shrink-0" role="img" aria-label={`${kozepFent} ${kozepLent}`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--at-tile)" strokeWidth="13" />
      {osszeg > 0 &&
        szeletek.map((sz, i) => {
          const hossz = (Math.max(0, sz.ertek) / osszeg) * kerulet;
          const kezdet = eltolas;
          eltolas += hossz;
          if (hossz <= 0) return null;
          // Szeletek közt vékony rés, hogy egymás mellett is elváljanak.
          const rajzolt = lathato > 1 ? Math.max(hossz - 0.8, 0.1) : hossz;
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
      <text x="50" y="50" textAnchor="middle" fontSize="18" fontWeight="700" fill="var(--at-text)">
        {kozepFent}
      </text>
      <text x="50" y="62" textAnchor="middle" fontSize="9" fill="var(--at-muted)">
        {kozepLent}
      </text>
    </svg>
  );
}

function JelSor({ nev, ertek, szin, uton = false }: { nev: string; ertek: number; szin: string; uton?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-1.5 ${uton ? "text-[#854f0b]" : ""}`}>
      <span className="flex min-w-0 items-center gap-1">
        <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: szin }} />
        <span className="truncate">{nev}</span>
      </span>
      <span className="font-semibold tabular-nums">{ertek === 0 ? "–" : db(ertek)}</span>
    </div>
  );
}

// Típusonként egy gyűrűs csempe: középen a típus aktuális darabszáma, a
// szeletek a telephelyek. Szándékosan nincs "összes készlet" — különböző
// típusok darabszámát nincs értelme összeadni.
export default async function KeszletPage() {
  const { telepek, tipusok, uton } = await getKeszletFulAdatok();
  const telepSzin = new Map(telepek.map((t, i) => [t.nev, TELEP_SZINEK[i % TELEP_SZINEK.length]]));
  const utonTipusonkent = new Map<string, number>();
  for (const u of uton) utonTipusonkent.set(u.tipus, (utonTipusonkent.get(u.tipus) ?? 0) + u.qty);

  return (
    <div className="flex flex-col gap-4 py-4">
      <div>
        <h1 className="text-base font-semibold">Készlet</h1>
        <p className="text-xs text-[var(--at-muted)]">Típusonként, telephelyekre bontva — aktuális állapot</p>
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

      {tipusok.length === 0 ? (
        <p className="text-sm text-[var(--at-muted)]">Jelenleg egyik telephelyen sincs készlet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {tipusok.map((t) => {
            // Csak azok a telepek, ahol a típus aktív (a lekérdezés csak ezekre ad sort).
            const aktivTelepek = telepek.filter((tp) => tp.nev in t.telepenkent);
            const utonDb = utonTipusonkent.get(t.tipus) ?? 0;
            const szeletek: Szelet[] = [
              ...aktivTelepek.map((tp) => ({ ertek: t.telepenkent[tp.nev], szin: telepSzin.get(tp.nev)! })),
              ...(utonDb > 0 ? [{ ertek: utonDb, szin: UTON_SZIN }] : []),
            ];
            return (
              <div
                key={t.tipus}
                className="flex flex-col items-center rounded-xl border border-[var(--at-border)] bg-[var(--at-card)] p-2.5"
              >
                <div className="mb-1 text-center text-xs font-semibold">{t.tipus}</div>
                <Gyuru szeletek={szeletek} kozepFent={db(t.osszes)} kozepLent="db" />
                <div className="mt-1.5 flex w-full flex-col gap-0.5 text-[11px]">
                  {aktivTelepek.map((tp) => (
                    <JelSor key={tp.nev} nev={tp.nev} ertek={t.telepenkent[tp.nev]} szin={telepSzin.get(tp.nev)!} />
                  ))}
                  {utonDb > 0 && <JelSor nev="Úton" ertek={utonDb} szin={UTON_SZIN} uton />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
