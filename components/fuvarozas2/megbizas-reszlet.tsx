"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { valtAllapot, setSzamlaSzam, setMegjegyzes, torolMegbizast } from "@/lib/fuvarozas2/megbizasok";
import type { MegbizasSor, Megallo, Esemeny, Dokumentum } from "@/lib/fuvarozas2/megbizasok";
import type { Allapot } from "@/lib/fuvarozas/allapot";
import type { PartnerAdatJavaslat } from "@/lib/fuvarozas2/partnerek";
import { AdatJavaslatSor, PostacimBevitel } from "@/components/fuvarozas2/partner-adat-javaslat";
import { ALLAPOT_CIMKE, LepesBadge, JellegBadge, formatFt, formatIdo, formatNap } from "@/components/fuvarozas2/kozos";

const GOMB_CIMKE: Partial<Record<Allapot, string>> = {
  tervezett: "Jóváhagyás → Tervezett",
  folyamatban: "Megérkezett → Folyamatban",
  teljesitve: "Teljesítve",
  szamlazva: "Számlázva",
  postazva: "Postázva ✓ (kész)",
  lezart: "Lezárás",
};
// Visszalépő élek — kevésbé hangsúlyos gomb.
const VISSZA: Partial<Record<string, string>> = {
  "folyamatban>tervezett": "Visszaállítás tervezettre",
  "szamlazhato>teljesitve": "Fotó visszavonása",
  "szamlazva>teljesitve": "Számla visszavonása",
  "lezart>postazva": "Visszaállítás (lezárt → postázva)",
};

export function MegbizasReszlet({
  sor, megallok, esemenyek, dokumentumok, celok, partnerJavaslatok = [], szerkeszthet, elszamolasJog, fuvarozasJog, egyOszlop = false,
}: {
  sor: MegbizasSor; megallok: Megallo[]; esemenyek: Esemeny[]; dokumentumok: Dokumentum[]; celok: Allapot[];
  partnerJavaslatok?: PartnerAdatJavaslat[];
  szerkeszthet: boolean; elszamolasJog: boolean;
  /** A megjegyzés és a törlés csak a Fuvarozás szerkesztőjéé (setMegjegyzes, torolMegbizast) — az elszámolás-jog ehhez kevés. */
  fuvarozasJog: boolean;
  /** A munkaasztal keskeny jobb oszlopában egy oszlopba rendeződik. */
  egyOszlop?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [szamla, setSzamla] = useState(sor.szamla_szam ?? "");
  const [megj, setMegj] = useState(sor.megjegyzes ?? "");
  const fuvarlevelek = dokumentumok.filter((d) => d.tipus === "fuvarlevel");
  const fuvarlevelDb = fuvarlevelek.length;

  function valt(hova: Allapot, kezi = false) {
    start(async () => {
      const r = await valtAllapot(sor.id, hova, { kezi, kliensUuid: crypto.randomUUID() });
      if (r.ok) { toast.success(`${ALLAPOT_CIMKE[hova]}`); router.refresh(); }
      else toast.error(r.hiba);
    });
  }

  const elore = celok.filter((c) => !VISSZA[`${sor.allapot}>${c}`]);
  const vissza = celok.filter((c) => VISSZA[`${sor.allapot}>${c}`]);
  // Kézi kiskapu, amit az ellenőrző csak kontextussal enged:
  const keziLezaras = sor.allapot === "teljesitve" && sor.jelleg === "sajat" && !celok.includes("lezart");

  return (
    <div className={egyOszlop ? "flex flex-col gap-4" : "grid gap-4 lg:grid-cols-[2fr_1fr]"}>
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <JellegBadge jelleg={sor.jelleg} />
              <span>{sor.partner_nev ?? "(nincs megbízó)"}</span>
              <span className="text-muted-foreground">·</span>
              <span className="font-mono text-sm">{sor.hivatkozas ?? (sor.hivatkozas_nincs ? "nincs hivatkozás" : "—")}</span>
              <LepesBadge allapot={sor.allapot} className="ml-auto" />
            </CardTitle>
          </CardHeader>
          <CardContent className={egyOszlop ? "grid gap-y-2 text-sm" : "grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2"}>
            <div><span className="text-muted-foreground">Kocsi:</span> {sor.jarmu_cimke ?? "kocsi nélkül"}{sor.sofor ? ` · ${sor.sofor}` : ""}</div>
            <div><span className="text-muted-foreground">Díj:</span> {sor.jelleg === "ber" ? formatFt(sor.fuvardij, sor.fuvardij_penznem) : "saját fuvar"}</div>
            <div><span className="text-muted-foreground">Áru:</span> {sor.aru ?? "—"}{sor.mennyiseg ? ` · ${sor.mennyiseg}` : ""}</div>
            {sor.kitol ? <div><span className="text-muted-foreground">Kitől:</span> {sor.kitol} → {sor.partner_nev ?? "?"}</div> : null}
            {sor.jelleg === "sajat" ? <div><span className="text-muted-foreground">Szállítólevél:</span> {sor.szallitolevel ?? "még nincs párosítva"}</div> : null}
            <div><span className="text-muted-foreground">Forrás:</span> {sor.forras}{sor.dokumentum_url ? <> · <a className="underline" href={sor.dokumentum_url} target="_blank" rel="noreferrer">megbízás PDF</a></> : null}</div>
            {Array.isArray(sor.hianylista) && sor.hianylista.length > 0 ? (
              <div className="sm:col-span-2 rounded-lg bg-[var(--f2-amb-l)] px-2 py-1 text-[var(--f2-amb)]">Hiánylista: {sor.hianylista.map(String).join(", ")}</div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Megállók</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {megallok.length === 0 ? <p className="text-muted-foreground">Nincs megálló rögzítve — {sor.felrako ?? "—"} → {sor.lerako ?? "—"}</p> : null}
            {megallok.map((m) => (
              <div key={m.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg bg-muted/40 px-3 py-2">
                <span className="w-16 shrink-0 text-xs font-medium uppercase text-muted-foreground">{m.sorszam}. {m.tipus === "felrako" ? "felrakó" : "lerakó"}</span>
                <span className="min-w-0 flex-1">{m.cim_nyers}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  terv {formatNap(m.tervezett_nap)}{m.ablak_tol ? ` ${formatIdo(m.ablak_tol).slice(-5)}` : ""}{m.ablak_ig ? `–${formatIdo(m.ablak_ig).slice(-5)}` : ""}
                  {m.gps_erkezes ? ` · GPS érk ${formatIdo(m.gps_erkezes)}` : ""}{m.gps_tavozas ? ` táv ${formatIdo(m.gps_tavozas)}` : ""}
                  {m.sofor_kesz_at ? ` · kész ${formatIdo(m.sofor_kesz_at)} (${m.sofor_kesz_by ?? "sofőr"})` : ""}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Napló</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            {esemenyek.map((e) => (
              <div key={e.id} className="flex flex-wrap gap-x-2 border-b border-foreground/5 py-1 last:border-0">
                <span className="w-24 shrink-0 tabular-nums text-muted-foreground">{formatIdo(e.mikor)}</span>
                <span className="font-medium">{e.esemeny}</span>
                {e.allapot_utan ? <span className="text-muted-foreground">{e.allapot_elott ?? "—"} → {e.allapot_utan}</span> : null}
                <span className="text-xs text-muted-foreground">{e.forras}{e.ki ? ` · ${e.ki}` : ""}{e.reszletek?.forras_trigger ? " · régi jelölőből" : ""}{e.reszletek?.indok ? ` · ${String(e.reszletek.indok)}` : ""}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Műveletek</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {!szerkeszthet ? <p className="text-sm text-muted-foreground">Csak megtekintés.</p> : null}
            {szerkeszthet && elore.map((c) => (
              <Button key={c} size="sm" disabled={pending} onClick={() => valt(c)}>{GOMB_CIMKE[c] ?? ALLAPOT_CIMKE[c]}</Button>
            ))}
            {szerkeszthet && keziLezaras ? (
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => valt("lezart", true)}>Lezárás (szállítólevél nélkül, kézi)</Button>
            ) : null}
            {szerkeszthet && vissza.map((c) => (
              <Button key={c} size="sm" variant="outline" disabled={pending} onClick={() => valt(c)}>{VISSZA[`${sor.allapot}>${c}`]}</Button>
            ))}
            {szerkeszthet && elore.length === 0 && vissza.length === 0 && !keziLezaras ? (
              <p className="text-xs text-muted-foreground">Innen nincs engedett lépés — {sor.allapot === "szamlazhato" || sor.allapot === "teljesitve" ? "a számlaszám (lent) viszi tovább — a Számlázz.hu-ból magától is párosul." : "nézd a naplót."}</p>
            ) : null}
          </CardContent>
        </Card>

        {sor.jelleg === "ber" ? (
          <Card>
            <CardHeader><CardTitle className="text-base">Elszámolás</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span>Fuvarlevél-fotó</span>
                <span className={sor.foto_van ? "font-medium text-[var(--f2-mint)]" : "text-muted-foreground"}>{sor.foto_van ? "megvan" : "nincs"}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span>Számlaszám</span>
                <div className="flex gap-2">
                  <Input value={szamla} onChange={(e) => setSzamla(e.target.value)} placeholder="WLLWR-2026-…" disabled={!elszamolasJog || pending} />
                  <Button size="sm" variant="secondary" disabled={!elszamolasJog || pending || szamla.trim() === (sor.szamla_szam ?? "")}
                    onClick={() => start(async () => { const r = await setSzamlaSzam(sor.id, szamla); if (r.ok) { toast.success("Számlaszám mentve"); router.refresh(); } else toast.error(r.hiba); })}>
                    Ment
                  </Button>
                </div>
                {sor.kieg_szamla_szamok?.length ? (
                  <span className="text-xs text-muted-foreground">+ kiegészítő: {sor.kieg_szamla_szamok.join(", ")}</span>
                ) : null}
              </div>
              {sor.email_elment_at ? <div className="flex items-center justify-between gap-2"><span>E-mail elment</span><span className="text-muted-foreground">{formatIdo(sor.email_elment_at)}</span></div> : null}
              <div className="flex items-center justify-between gap-2"><span>Postázva</span><span className="text-muted-foreground">{sor.postazva_at ? formatIdo(sor.postazva_at) : "—"}</span></div>
              <div className="flex flex-col gap-1">
                <span>Postázási cím</span>
                {sor.postazasi_cim ? (
                  <span className="text-muted-foreground">{sor.postazasi_cim}</span>
                ) : partnerJavaslatok.some((j) => j.mezo === "postazasi_cim") ? (
                  partnerJavaslatok.filter((j) => j.mezo === "postazasi_cim").map((j) => <AdatJavaslatSor key={j.id} j={j} szerkeszthet={fuvarozasJog} mezoNelkul />)
                ) : sor.partner_id && fuvarozasJog ? (
                  <PostacimBevitel partnerId={sor.partner_id} />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
              {partnerJavaslatok.some((j) => j.mezo !== "postazasi_cim") ? (
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">A partner további hiányzó adatai — javaslat:</span>
                  {partnerJavaslatok.filter((j) => j.mezo !== "postazasi_cim").map((j) => <AdatJavaslatSor key={j.id} j={j} szerkeszthet={fuvarozasJog} />)}
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-2"><span>Fizetési határidő</span><span className="text-muted-foreground">{sor.fizetesi_hatarido_nap != null ? `${sor.fizetesi_hatarido_nap} nap` : "—"}</span></div>
              {sor.partner_id ? <a href={`/fuvarozas2/partnerek?nyit=${sor.partner_id}#p-${sor.partner_id}`} className="text-xs font-semibold text-[var(--f2-blue)] hover:underline">A partner adatainak szerkesztése →</a> : null}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader><CardTitle className="text-base">Dokumentumok</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            {dokumentumok.length === 0 ? <p className="text-muted-foreground">Nincs.</p> : null}
            {fuvarlevelDb > 0 ? (
              <a
                href={`/api/fuvarozas/fuvarlevel-pdf/${sor.id}`}
                target="_blank"
                rel="noreferrer"
                className="mb-1 w-fit rounded-lg border border-[var(--f2-mint)] px-3 py-1.5 text-sm font-semibold text-[var(--f2-mint)] hover:bg-[var(--f2-mint-l)]"
              >
                Fuvarlevél PDF ({fuvarlevelDb} oldal)
              </a>
            ) : null}
            {dokumentumok.map((d) => {
              // Többoldalas fuvarlevél: az oldalak sorszámot kapnak (1/10, 2/10…).
              const oldal = d.tipus === "fuvarlevel" ? fuvarlevelek.indexOf(d) + 1 : 0;
              const felirat = oldal > 0 ? `Fuvarlevél ${oldal}/${fuvarlevelDb}` : d.fajlnev ?? d.dokumentum_url ?? "—";
              return (
                <div key={d.id} className="flex gap-2">
                  <span className="w-24 shrink-0 text-xs uppercase text-muted-foreground">{d.tipus ?? "egyéb"}</span>
                  {d.dokumentum_url ? <a className="truncate underline" href={d.dokumentum_url} target="_blank" rel="noreferrer">{felirat}</a> : <span className="truncate">{felirat}</span>}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Megjegyzés</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            <textarea value={megj} onChange={(e) => setMegj(e.target.value)} disabled={!fuvarozasJog || pending} rows={3}
              aria-label="Megjegyzés" className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
            <Button size="sm" variant="secondary" disabled={!fuvarozasJog || pending || megj === (sor.megjegyzes ?? "")}
              onClick={() => start(async () => {
                try { await setMegjegyzes(sor.id, megj); toast.success("Mentve"); router.refresh(); }
                catch { toast.error("A megjegyzés nem mentődött el."); }
              })}>Ment</Button>
          </CardContent>
        </Card>

        {fuvarozasJog && !sor.torolt ? (
          sor.szamla_szam || sor.kieg_szamla_szamok?.length ? (
            <p className="text-xs text-muted-foreground">Számlázott fuvar nem törölhető.</p>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!confirm(`Biztosan törlöd? (#${sor.id} · ${sor.partner_nev ?? "megbízó nélkül"} · ${formatNap(sor.felrakas_nap)})`)) return;
                start(async () => {
                  const r = await torolMegbizast(sor.id).catch(() => ({ ok: false as const, hiba: "A törlés nem sikerült." }));
                  if (!r.ok) { toast.error(r.hiba); return; }
                  toast.success("Fuvar törölve");
                  router.push("/fuvarozas2/megbizasok");
                  router.refresh();
                });
              }}
              className="self-start text-sm font-semibold text-[var(--f2-red)] hover:underline disabled:opacity-45"
            >
              Fuvar törlése
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}
