import Link from "next/link";
import type { MegbizasSor } from "@/lib/fuvarozas2/megbizasok";
import { AllapotBadge, JellegBadge, formatFt, formatNap } from "@/components/fuvarozas2/kozos";

export function MegbizasLista({ sorok, ures = "Nincs megbízás." }: { sorok: MegbizasSor[]; ures?: string }) {
  if (sorok.length === 0) return <p className="py-6 text-sm text-muted-foreground">{ures}</p>;
  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Nap</th>
            <th className="px-3 py-2 font-medium">Megbízó · hivatkozás</th>
            <th className="px-3 py-2 font-medium">Útvonal</th>
            <th className="px-3 py-2 font-medium">Kocsi</th>
            <th className="px-3 py-2 text-right font-medium">Díj</th>
            <th className="px-3 py-2 font-medium">Állapot</th>
          </tr>
        </thead>
        <tbody>
          {sorok.map((s) => (
            <tr key={s.id} className="border-t border-foreground/5 hover:bg-muted/40">
              <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                {formatNap(s.felrakas_nap)}
                {s.lerakas_nap && s.lerakas_nap !== s.felrakas_nap ? ` → ${formatNap(s.lerakas_nap)}` : ""}
              </td>
              <td className="px-3 py-2">
                <Link href={`/fuvarozas2/megbizasok/${s.id}`} className="font-medium hover:underline">
                  {s.partner_nev ?? <span className="text-muted-foreground">(nincs megbízó)</span>}
                </Link>
                <div className="text-xs text-muted-foreground">
                  <JellegBadge jelleg={s.jelleg} /> {s.hivatkozas ?? (s.hivatkozas_nincs ? "nincs hivatkozás" : "—")}
                  {Array.isArray(s.hianylista) && s.hianylista.length > 0 ? ` · hiány: ${s.hianylista.length}` : ""}
                </div>
              </td>
              <td className="max-w-[28rem] px-3 py-2">
                <div className="truncate">{s.felrako ?? "—"}</div>
                <div className="truncate text-xs text-muted-foreground">→ {s.lerako ?? "—"}{s.megallo_db > 2 ? ` · ${s.megallo_db} megálló` : ""}</div>
              </td>
              <td className="whitespace-nowrap px-3 py-2">
                {s.jarmu_kod ?? <span className="font-medium text-[var(--f2-red)]">kocsi nélkül</span>}
                {s.sofor ? <div className="text-xs text-muted-foreground">{s.sofor}</div> : null}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{s.jelleg === "ber" ? formatFt(s.fuvardij, s.fuvardij_penznem) : "—"}</td>
              <td className="px-3 py-2"><AllapotBadge allapot={s.allapot} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
