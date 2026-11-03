import { budapestNapISO } from "@/lib/fuvarozas/idozona";
import { hetfo } from "@/lib/proto/adat";

export type IdoszakParam = { idoszak?: string; tol?: string; ig?: string };

const NAP = /^\d{4}-\d{2}-\d{2}$/;

export function idoszakBol(p: IdoszakParam): { kezdet: string; veg: string; idoszak: string } {
  const ma = budapestNapISO();
  if (p.tol && p.ig && NAP.test(p.tol) && NAP.test(p.ig) && p.tol <= p.ig) return { kezdet: p.tol, veg: p.ig, idoszak: "egyedi" };
  if (p.idoszak === "ma") return { kezdet: ma, veg: ma, idoszak: "ma" };
  if (p.idoszak === "het") return { kezdet: hetfo(ma), veg: ma, idoszak: "het" };
  if (p.idoszak === "elozo") {
    const d = new Date(`${ma.slice(0, 7)}-01T12:00:00Z`);
    d.setUTCDate(0);
    const veg = d.toISOString().slice(0, 10);
    return { kezdet: `${veg.slice(0, 7)}-01`, veg, idoszak: "elozo" };
  }
  return { kezdet: `${ma.slice(0, 7)}-01`, veg: ma, idoszak: "ho" };
}
