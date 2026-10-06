import "server-only";
import type { Querier } from "@/lib/db";
import { ellenorizAtmenet, type Allapot, type AtmenetForras } from "@/lib/megbizasok/allapotgep";
import { SOR_SQL, kontextus } from "@/lib/megbizasok/repo";
import type { MegbizasSor } from "@/lib/fuvarozas2/megbizasok";

export type AllapotOpciok = { kezi?: boolean; megjegyzes?: string; kliensUuid?: string };
export type AllapotValtas = { ok: true; allapot: Allapot } | { ok: false; hiba: string };

/** Állapotváltási mag már megnyitott tranzakcióban (2026-10-06). */
export async function valtAllapotTx(
  tx: Querier, id: string, hova: Allapot, opciok: AllapotOpciok, ki: string | null,
): Promise<AllapotValtas> {
  // A publikus út megtartja az optimista ellenőrzést; a számlaszám-mentés
  // hívója maga zárolta a sort `FOR UPDATE`-tel ugyanebben a tranzakcióban.
  const [sor] = await tx<MegbizasSor>(`${SOR_SQL} where m.id = $1`, [id]);
  if (!sor?.allapot) return { ok: false, hiba: "Nincs ilyen megbízás." };
  const k = await kontextus(sor, undefined, tx);
  if (opciok.kezi && hova === "szamlazhato") k.fotoVan = true;
  // Saját fuvar kézi lezárása szállítólevél-párosítás nélkül, naplózva.
  if (opciok.kezi && hova === "lezart" && sor.jelleg === "sajat") k.fotoVan = true;
  const forras: AtmenetForras = "ember";
  const e = ellenorizAtmenet(sor.allapot, hova, forras, k);
  if (!e.ok) return { ok: false, hiba: e.hiba };

  await tx(`select set_config('fuvarozas2.uj_kod', '1', true)`);
  const regi: string[] = [];
  const set = (sql: string) => regi.push(sql);
  switch (hova) {
    case "tervezett": set("ellenorzott = true"); if (sor.allapot === "folyamatban") set("teljesitve = false, teljesitve_at = null"); break;
    case "folyamatban": set("ellenorzott = true"); break;
    case "teljesitve":
      set("ellenorzott = true, teljesitve = true, teljesitve_at = coalesce(teljesitve_at, now())");
      if (sor.allapot === "szamlazhato" || sor.allapot === "szamlazva") set("szamla_szam = null");
      break;
    case "szamlazhato": set("teljesitve = true, teljesitve_at = coalesce(teljesitve_at, now())"); break;
    case "szamlazva": if (sor.allapot === "postazva") set("postazva = false, postazva_at = null"); break;
    case "postazva": set("postazva = true, postazva_at = coalesce(postazva_at, now()), papirok_beerkeztek_at = coalesce(papirok_beerkeztek_at, now())"); break;
    case "lezart": if (sor.jelleg === "ber") set("postazva = true, postazva_at = coalesce(postazva_at, now() - interval '6 minutes')"); else set("teljesitve = true, teljesitve_at = coalesce(teljesitve_at, now())"); break;
  }
  // Állapotfeltételes írás az optimista zár megtartásához.
  const irt = await tx<{ id: string }>(
    `update fuvar_megbizasok set allapot = $2, allapot_at = now()${regi.length ? ", " + regi.join(", ") : ""} where id = $1 and allapot = $3 returning id::text`,
    [id, hova, sor.allapot],
  );
  if (irt.length === 0) return { ok: false, hiba: "A megbízás állapota közben megváltozott — frissítsd az oldalt, és próbáld újra." };
  if (sor.jelleg === "ber") {
    await tx(`insert into fuvar_elszamolas (megbizas_id) values ($1) on conflict (megbizas_id) do nothing`, [id]);
    if (hova === "postazva") await tx(`update fuvar_elszamolas set postazva_at = coalesce(postazva_at, now()), postazva_by = $2, papirok_beerkeztek_at = coalesce(papirok_beerkeztek_at, now()), papirok_beerkeztek_by = coalesce(papirok_beerkeztek_by, $2), frissitve_at = now() where megbizas_id = $1`, [id, ki]);
    if (hova === "szamlazva" && sor.allapot === "postazva") await tx(`update fuvar_elszamolas set postazva_at = null, postazva_by = null, frissitve_at = now() where megbizas_id = $1`, [id]);
    if (hova === "email_elment") await tx(`update fuvar_elszamolas set email_elment_at = coalesce(email_elment_at, now()), email_elment_by = $2, frissitve_at = now() where megbizas_id = $1`, [id, ki]);
    if (hova === "teljesitve" && sor.allapot === "szamlazva") await tx(`update fuvar_elszamolas set szamla_id = null, szamla_szam = null, szamla_kelte = null, frissitve_at = now() where megbizas_id = $1`, [id]);
  }
  const esemeny =
    hova === "teljesitve" && ["szamlazhato", "szamlazva"].includes(sor.allapot) ? "visszaallitas"
    : hova === "tervezett" && sor.allapot === "folyamatban" ? "visszaallitas"
    : hova === "postazva" && sor.allapot === "lezart" ? "visszaallitas"
    : hova === "szamlazva" && sor.allapot === "postazva" ? "visszaallitas"
    : hova === "tervezett" ? "jovahagyva"
    : hova === "folyamatban" ? "megerkezett"
    : hova === "teljesitve" ? "teljesitve"
    : hova === "szamlazhato" ? "szamlazhato"
    : hova === "szamlazva" ? "szamla_parositva"
    : hova === "email_elment" ? "szamla_email_elkuldve"
    : hova === "postazva" ? "postazva" : "lezart";
  await tx(`insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, allapot_elott, allapot_utan, forras, ki, reszletek, kliens_uuid) values ($1, $4, $5, $2, 'ember', $3, $6, $7) on conflict do nothing`,
    [id, hova, ki, esemeny, sor.allapot, JSON.stringify({ atmenet: e.atmenet.szam, megjegyzes: opciok.megjegyzes ?? null, kezi: !!opciok.kezi }), opciok.kliensUuid ?? null]);
  const lezar = hova === "postazva" && sor.allapot !== "lezart" && ellenorizAtmenet("postazva", "lezart", "rendszer", { ...k, postazva: true }).ok;
  if (lezar) {
    await tx(`update fuvar_megbizasok set allapot = 'lezart', allapot_at = now() where id = $1`, [id]);
    await tx(`insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, allapot_elott, allapot_utan, forras, ki, reszletek) values ($1, 'lezart', 'postazva', 'lezart', 'rendszer', $2, $3)`, [id, ki, JSON.stringify({ atmenet: 11, automatikus: true })]);
  }
  return { ok: true, allapot: lezar ? "lezart" : hova };
}
