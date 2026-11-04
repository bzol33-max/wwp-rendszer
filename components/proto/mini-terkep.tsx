import { orszagbanVan, vetit } from "@/lib/proto/orszag";
import { csempek, csempeUrl, ORSZAG_HATAR, terkepPont, TERKEP_H, TERKEP_W } from "@/lib/proto/terkep-vetites";
import type { TerkepKocsi } from "@/lib/proto/dashboard";
import type { Nyompont } from "@/lib/ecofleet/plusz";

const bentVan = (lat: number, lon: number) => orszagbanVan(vetit(lat, lon));
const azonos = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// OpenStreetMap-csempe az országra vágva: a külföldi rész nem foglal helyet.
export function MiniTerkep({ kocsi, nyom, kovVaros }: { kocsi: TerkepKocsi | null; nyom: Nyompont[]; kovVaros: string | null }) {
  const cid = `orszag-${kocsi?.kod ?? "x"}`;
  const szin = kocsi?.szin ?? "var(--fld)";
  const bent = (kocsi?.megallok ?? []).filter((m) => bentVan(m.lat, m.lon));
  const kint = (kocsi?.megallok ?? []).filter((m) => !bentVan(m.lat, m.lon));
  const hely = kocsi?.pont ?? null;
  const pontBent = hely && bentVan(hely.lat, hely.lon) ? terkepPont(hely.lat, hely.lon) : null;
  const regi = hely?.korPerc != null && hely.korPerc > 120;
  const cel = kovVaros ? bent.find((m) => azonos(m.cim, kovVaros)) : undefined;
  const celPont = cel ? terkepPont(cel.lat, cel.lon) : null;
  const leiras = !kocsi ? "nincs adat" : [
    kocsi.kod,
    bent.length ? `megállók: ${bent.map((m) => m.cim).join(", ")}` : "ma nincs megálló az országban",
    !hely ? "nincs pozíció" : pontBent ? (regi ? "utolsó ismert hely az országban" : "a kocsi az országban van") : "a kocsi külföldön van",
  ].join(", ");
  const jegyzet = [
    hely && !pontBent ? `A kocsi ${regi ? "utoljára" : "most"} külföldön.` : null,
    kint.length ? `Külföldi megálló: ${kint.map((m) => m.cim).join(", ")}.` : null,
    regi ? `Utolsó GPS ${Math.round(hely!.korPerc! / 60)} órája.` : null,
    kocsi?.kimaradt ? `${kocsi.kimaradt} cím nincs a térképen.` : null,
  ].filter(Boolean).join(" ");
  return (
    <div className="minit">
      <svg viewBox={`0 0 ${TERKEP_W} ${TERKEP_H}`} role="img" aria-label={`Magyarország térképe: ${leiras}`}>
        <clipPath id={cid}><path d={ORSZAG_HATAR} /></clipPath>
        <path className="minit-o" d={ORSZAG_HATAR} />
        <g clipPath={`url(#${cid})`}>
          {csempek().map((c) => <image key={c.kulcs} href={csempeUrl(c.cx, c.cy)} x={c.x} y={c.y} width={c.meret} height={c.meret} preserveAspectRatio="none" />)}
          {nyom.length > 1 && <polyline className="minit-ut" stroke={szin} points={nyom.map((p) => { const q = terkepPont(p.lat, p.lon); return `${q.x.toFixed(1)},${q.y.toFixed(1)}`; }).join(" ")} />}
        </g>
        <path className="minit-h" d={ORSZAG_HATAR} />
        {pontBent && celPont && <line className="minit-hatra" stroke={szin} x1={pontBent.x} y1={pontBent.y} x2={celPont.x} y2={celPont.y} />}
        {bent.map((m, i) => { const p = terkepPont(m.lat, m.lon); return <circle key={`${i}-${m.cim}`} className="minit-m" stroke={szin} cx={p.x} cy={p.y} r={8} />; })}
        {pontBent && <circle cx={pontBent.x} cy={pontBent.y} r={15} fill={regi ? "var(--card)" : szin} stroke={regi ? szin : "#fff"} strokeWidth={5} />}
      </svg>
      <span className="minit-f">© <a href="https://www.openstreetmap.org/copyright" rel="noreferrer" target="_blank">OpenStreetMap</a> közreműködők</span>
      {jegyzet && <span className="m">{jegyzet}</span>}
    </div>
  );
}
