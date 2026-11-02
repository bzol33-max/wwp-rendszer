import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/dal";
import { getProtoPenz } from "@/lib/proto/adat";
import { idoszakBol } from "../idoszak";

const FORRAS = { teny: "Tény", reszben: "Részben becsült", becsles: "Becslés" } as const;

export async function GET(req: NextRequest) {
  await requireAdmin();
  const sp = req.nextUrl.searchParams;
  const { kezdet, veg } = idoszakBol({ idoszak: sp.get("idoszak") ?? undefined, tol: sp.get("tol") ?? undefined, ig: sp.get("ig") ?? undefined });
  const p = await getProtoPenz(kezdet, veg);

  const wb = new ExcelJS.Workbook();
  const lap = wb.addWorksheet("Fuvarok");
  lap.columns = [
    { header: "Nap", key: "nap", width: 12 }, { header: "Kocsi", key: "kocsi", width: 12 }, { header: "Jelleg", key: "jelleg", width: 8 },
    { header: "Partner", key: "partner", width: 28 }, { header: "Hivatkozás", key: "hivatkozas", width: 16 }, { header: "Felrakó", key: "felrako", width: 30 }, { header: "Lerakó", key: "lerako", width: 30 },
    { header: "Km", key: "km", width: 8 }, { header: "Üres km", key: "uresKm", width: 8 }, { header: "Eredeti EUR", key: "eur", width: 11 }, { header: "Bevétel Ft", key: "bevetelFt", width: 12 },
    { header: "Üzemanyag Ft", key: "uzemanyagFt", width: 12 }, { header: "Útdíj Ft", key: "utdijFt", width: 11 }, { header: "Egyéb Ft", key: "egyebFt", width: 10 }, { header: "Üres út Ft", key: "uresKoltsegFt", width: 11 },
    { header: "Fedezet Ft", key: "fedezetFt", width: 12 }, { header: "Sofőr Ft", key: "soforFt", width: 11 }, { header: "Nettó Ft", key: "nettoFt", width: 12 }, { header: "Adat", key: "forras", width: 15 }, { header: "Hiányzik", key: "hianyok", width: 24 },
  ];
  lap.getRow(1).font = { bold: true };
  lap.views = [{ state: "frozen", ySplit: 1 }];
  for (const f of p.fuvarok) {
    lap.addRow({ ...f, jelleg: f.jelleg === "ber" ? "Bér" : "Saját", eur: f.bevetelEur, bevetelFt: f.kimarad ? null : f.bevetelFt, fedezetFt: f.kimarad ? null : f.fedezetFt, nettoFt: f.kimarad ? null : f.nettoFt, forras: FORRAS[f.forras], hianyok: f.hianyok.join(", ") });
  }
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="wwp-penz-${kezdet}_${veg}.xlsx"`,
    },
  });
}
