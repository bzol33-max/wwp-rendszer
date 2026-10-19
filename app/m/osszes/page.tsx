import { requireSession } from "@/lib/auth/dal";
import { getSoforNapokElore } from "@/lib/fuvarozas/sofor";
import { SoforNapNezet } from "@/components/m/sofor-nap";
import { budapestNapISO } from "@/lib/fuvarozas/idozona";

export const dynamic = "force-dynamic";

// „Összes” fül: a sofőr saját kocsijának minden közelgő megbízása,
// naponként egymás alatt (2026-10-19). A napi kártyák ugyanazok, mint a
// Ma/Holnap fülön (idő, megállók, Navigáció); a teendő-gombok a Ma fülön vannak.
export default async function Page() {
  const session = await requireSession();
  const napok = session.employeeId ? await getSoforNapokElore(session.employeeId) : [];
  if (napok.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-bold">Összes megbízás</h1>
        <div className="rounded-xl bg-[var(--m-surf)] p-4 text-sm text-[var(--m-muted)]">A következő két hétben nincs megbízás a kocsidon.</div>
      </div>
    );
  }
  const ma = budapestNapISO(new Date());
  const h = new Date(`${ma}T12:00:00Z`);
  h.setUTCDate(h.getUTCDate() + 1);
  const holnap = h.toISOString().slice(0, 10);
  return (
    <div className="flex flex-col gap-8">
      {napok.map((nap) => (
        <SoforNapNezet key={nap.napISO} nap={nap} ma={false} cim={nap.napISO === ma ? "Ma" : nap.napISO === holnap ? "Holnap" : ""} />
      ))}
    </div>
  );
}
