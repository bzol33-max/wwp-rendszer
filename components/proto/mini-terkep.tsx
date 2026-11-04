import { ORSZAG_UTVONAL, orszagbanVan, vetit } from "@/lib/proto/orszag";
import type { TerkepKocsi } from "@/lib/proto/dashboard";

// Csempe nincs: csak az ország látszik, a külföldi rész nem foglal helyet.
export function MiniTerkep({ kocsi, telepek }: { kocsi: TerkepKocsi | null; telepek: { nev: string; lat: number; lon: number }[] }) {
  const megallok = (kocsi?.megallok ?? []).map((m) => ({ ...vetit(m.lat, m.lon), cim: m.cim }));
  const bent = megallok.filter(orszagbanVan);
  const kint = megallok.filter((m) => !orszagbanVan(m));
  const pont = kocsi?.pont ? vetit(kocsi.pont.lat, kocsi.pont.lon) : null;
  const pontBent = pont && orszagbanVan(pont) ? pont : null;
  const regi = kocsi?.pont?.korPerc != null && kocsi.pont.korPerc > 120;
  const szin = kocsi?.szin ?? "var(--fld)";
  const cimkek = bent.filter((_, i) => i === 0 || i === bent.length - 1);
  const leiras = !kocsi ? "nincs adat" : [
    kocsi.kod,
    bent.length ? `megállók: ${bent.map((m) => m.cim).join(", ")}` : "ma nincs megálló az országban",
    !pont ? "nincs pozíció" : pontBent ? (regi ? "utolsó ismert hely az országban" : "a kocsi az országban van") : "a kocsi külföldön van",
  ].join(", ");
  const jegyzet = [
    pont && !pontBent ? `A kocsi ${regi ? "utoljára" : "most"} külföldön.` : null,
    kint.length ? `Külföldi megálló: ${kint.map((m) => m.cim).join(", ")}.` : null,
    regi ? `Utolsó GPS ${Math.round(kocsi!.pont!.korPerc! / 60)} órája.` : null,
    kocsi?.kimaradt ? `${kocsi.kimaradt} cím nincs a térképen.` : null,
  ].filter(Boolean).join(" ");
  return (
    <div className="minit">
      <svg viewBox="-14 -10 668 413" role="img" aria-label={`Magyarország térképe: ${leiras}`}>
        <path className="minit-o" d={ORSZAG_UTVONAL} />
        {telepek.map((t) => { const p = vetit(t.lat, t.lon); return <circle key={t.nev} className="minit-t" cx={p.x} cy={p.y} r={8} />; })}
        {bent.length > 1 && <polyline fill="none" stroke={szin} strokeWidth={6} points={bent.map((m) => `${m.x},${m.y}`).join(" ")} />}
        {bent.map((m, i) => <circle key={`${i}-${m.cim}`} cx={m.x} cy={m.y} r={8} fill={szin} />)}
        {cimkek.map((m) => (
          <text key={`c-${m.cim}-${m.x}`} className="minit-c" x={m.x > 320 ? m.x - 14 : m.x + 14} y={m.y > 60 ? m.y - 16 : m.y + 38} textAnchor={m.x > 320 ? "end" : "start"}>{m.cim}</text>
        ))}
        {pontBent && <circle cx={pontBent.x} cy={pontBent.y} r={13} fill={regi ? "var(--card)" : szin} stroke={regi ? szin : "#fff"} strokeWidth={4} />}
      </svg>
      {jegyzet && <span className="m">{jegyzet}</span>}
    </div>
  );
}
