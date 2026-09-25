"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { osszevonPartnereket, updatePartner, type Partner } from "@/lib/fuvarozas2/partnerek";

type Javaslat = { a: Partner; b: Partner; indok: string };

export function PartnerekNezet({ partnerek, javaslatok, szerkeszthet, nyit }: { partnerek: Partner[]; javaslatok: Javaslat[]; szerkeszthet: boolean; nyit?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // A munkaasztal részletéből „?nyit=<id>” paraméterrel jövünk: a partner sora nyitva.
  const [nyitott, setNyitott] = useState<string | null>(nyit ?? null);
  const [kijelolt, setKijelolt] = useState<Set<string>>(new Set());

  function osszevon(celId: string, forrasIds: string[]) {
    if (!confirm("Összevonod? A beolvasztott partner megbízásai a megtartott partnerre kerülnek, a neve névváltozat lesz. Nem visszavonható.")) return;
    start(async () => {
      const r = await osszevonPartnereket(celId, forrasIds);
      toast.success(`Összevonva — ${r.megbizasok} megbízás átírva`);
      setKijelolt(new Set());
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {javaslatok.length > 0 && szerkeszthet ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Összevonási javaslatok — E5 (névváltozatok)</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {javaslatok.map((j) => (
              <div key={`${j.a.id}-${j.b.id}`} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 px-3 py-2">
                <span className="font-medium">{j.a.nev}</span><span className="text-muted-foreground">({j.a.megbizas_db})</span>
                <span className="text-muted-foreground">↔</span>
                <span className="font-medium">{j.b.nev}</span><span className="text-muted-foreground">({j.b.megbizas_db})</span>
                <span className="text-xs text-muted-foreground">· {j.indok}</span>
                <span className="ml-auto flex gap-1">
                  <Button size="xs" variant="outline" disabled={pending} onClick={() => osszevon(j.a.id, [j.b.id])}>„{j.a.nev}” marad</Button>
                  <Button size="xs" variant="outline" disabled={pending} onClick={() => osszevon(j.b.id, [j.a.id])}>„{j.b.nev}” marad</Button>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {kijelolt.size >= 2 && szerkeszthet ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm">
          {kijelolt.size} kijelölve — melyik maradjon?
          {[...kijelolt].map((id) => {
            const p = partnerek.find((x) => x.id === id);
            return p ? <Button key={id} size="xs" disabled={pending} onClick={() => osszevon(id, [...kijelolt])}>„{p.nev}” marad</Button> : null;
          })}
          <Button size="xs" variant="ghost" onClick={() => setKijelolt(new Set())}>Mégse</Button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              {szerkeszthet ? <th className="px-2 py-2" /> : null}
              <th className="px-3 py-2 font-medium">Partner</th>
              <th className="px-3 py-2 font-medium">Sablon</th>
              <th className="px-3 py-2 text-right font-medium">Megbízás</th>
              <th className="px-3 py-2 text-right font-medium">Fizet (nap)</th>
              <th className="px-3 py-2 text-right font-medium">Papír (nap)</th>
              <th className="px-3 py-2 font-medium">Számlázási e-mail</th>
              <th className="px-3 py-2 font-medium">Postázási cím</th>
              <th className="px-3 py-2 font-medium">Számlán kért szám</th>
            </tr>
          </thead>
          <tbody>
            {partnerek.map((p) => (
              <PartnerSor key={p.id} p={p} nyitott={nyitott === p.id} onNyit={() => setNyitott(nyitott === p.id ? null : p.id)}
                szerkeszthet={szerkeszthet} kijelolve={kijelolt.has(p.id)}
                onKijelol={(v) => setKijelolt((s) => { const n = new Set(s); if (v) n.add(p.id); else n.delete(p.id); return n; })} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PartnerSor({ p, nyitott, onNyit, szerkeszthet, kijelolve, onKijelol }: {
  p: Partner; nyitott: boolean; onNyit: () => void; szerkeszthet: boolean; kijelolve: boolean; onKijelol: (v: boolean) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState({
    nev: p.nev, fizetesi_hatarido_nap: p.fizetesi_hatarido_nap?.toString() ?? "", papir_bekuldesi_hatarido_nap: p.papir_bekuldesi_hatarido_nap?.toString() ?? "",
    szamlazasi_email: p.szamlazasi_email ?? "", postazasi_cim: p.postazasi_cim ?? "", szamlazasi_cim: p.szamlazasi_cim ?? "",
    szamlan_kert_szam: p.szamlan_kert_szam, szamla_email_nem_kell: p.szamla_email_nem_kell, posta_nem_kell: p.posta_nem_kell, megbizas_pdf_csatolva: p.megbizas_pdf_csatolva,
    nevvaltozatok: p.nevvaltozatok.join("; "), email_domainek: p.email_domainek.join("; "), megjegyzes: p.megjegyzes ?? "",
  });
  const szam = (s: string) => (s.trim() === "" ? null : Number(s));
  function ment() {
    start(async () => {
      await updatePartner(p.id, {
        nev: f.nev.trim(), fizetesi_hatarido_nap: szam(f.fizetesi_hatarido_nap), papir_bekuldesi_hatarido_nap: szam(f.papir_bekuldesi_hatarido_nap),
        szamlazasi_email: f.szamlazasi_email.trim() || null, postazasi_cim: f.postazasi_cim.trim() || null, szamlazasi_cim: f.szamlazasi_cim.trim() || null,
        szamlan_kert_szam: f.szamlan_kert_szam, szamla_email_nem_kell: f.szamla_email_nem_kell, posta_nem_kell: f.posta_nem_kell, megbizas_pdf_csatolva: f.megbizas_pdf_csatolva,
        nevvaltozatok: f.nevvaltozatok.split(";").map((s) => s.trim()).filter(Boolean), email_domainek: f.email_domainek.split(";").map((s) => s.trim()).filter(Boolean),
        megjegyzes: f.megjegyzes.trim() || null,
      });
      toast.success("Partner mentve");
      router.refresh();
    });
  }
  const M = (k: keyof typeof f, cimke: string, t: "text" | "number" = "text") => (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {cimke}
      <Input type={t} value={String(f[k])} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="h-8 text-sm text-foreground" />
    </label>
  );
  const K = (k: "szamla_email_nem_kell" | "posta_nem_kell" | "megbizas_pdf_csatolva", cimke: string) => (
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} />{cimke}</label>
  );
  return (
    <>
      <tr id={`p-${p.id}`} className="scroll-mt-20 border-t border-foreground/5 hover:bg-muted/40">
        {szerkeszthet ? <td className="px-2 py-2"><input type="checkbox" checked={kijelolve} onChange={(e) => onKijelol(e.target.checked)} aria-label="kijelölés összevonáshoz" /></td> : null}
        <td className="px-3 py-2">
          <button className="text-left font-medium hover:underline" onClick={onNyit}>{p.nev}</button>
          {p.nevvaltozatok.length > 0 ? <div className="text-xs text-muted-foreground">= {p.nevvaltozatok.join(", ")}</div> : null}
        </td>
        <td className="px-3 py-2 text-xs text-muted-foreground">{p.sablon_azonosito ?? <span className="opacity-60">LLM (nincs sablon)</span>}</td>
        <td className="px-3 py-2 text-right tabular-nums">
          <a href={`/fuvarozas2/megbizasok?partner=${p.id}`} className="hover:underline">{p.megbizas_db}</a>
          <div className="text-xs text-muted-foreground">{p.utolso_megbizas ?? ""}</div>
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{p.fizetesi_hatarido_nap ?? "—"}</td>
        <td className="px-3 py-2 text-right tabular-nums">{p.papir_bekuldesi_hatarido_nap ?? "—"}</td>
        <td className="max-w-[14rem] truncate px-3 py-2">{p.szamlazasi_email ?? <span className="text-muted-foreground">—</span>}</td>
        <td className="max-w-[16rem] truncate px-3 py-2">{p.postazasi_cim ?? <span className="text-muted-foreground">—</span>}</td>
        <td className="px-3 py-2 text-xs">{p.szamlan_kert_szam}{p.szamla_email_nem_kell ? " · nem kér e-mailt" : ""}{p.posta_nem_kell ? " · nem kér postát" : ""}</td>
      </tr>
      {nyitott ? (
        <tr className="border-t border-foreground/5 bg-muted/20">
          <td colSpan={szerkeszthet ? 9 : 8} className="px-3 py-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {M("nev", "Név")}
              {M("nevvaltozatok", "Névváltozatok (; elválasztva)")}
              {M("fizetesi_hatarido_nap", "Fizetési határidő (nap)", "number")}
              {M("papir_bekuldesi_hatarido_nap", "Papír beküldési határidő (nap)", "number")}
              {M("szamlazasi_email", "Számlázási e-mail")}
              {M("email_domainek", "E-mail domainek (; elválasztva)")}
              {M("postazasi_cim", "Postázási cím")}
              {M("szamlazasi_cim", "Számlázási cím")}
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">Számlán kért szám
                <select value={f.szamlan_kert_szam} onChange={(e) => setF({ ...f, szamlan_kert_szam: e.target.value })} className="h-8 rounded-lg border bg-background px-2 text-sm text-foreground">
                  <option value="pozicioszam">pozíciószám</option><option value="reise_id">Reise / Út ID</option><option value="hivatkozas">hivatkozás</option>
                </select>
              </label>
              <div className="flex flex-col gap-1 pt-4">{K("szamla_email_nem_kell", "nem kér számla-e-mailt")}{K("posta_nem_kell", "nem kér postát")}{K("megbizas_pdf_csatolva", "megbízás PDF-et is csatolni")}</div>
              {M("megjegyzes", "Megjegyzés")}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Kapcsolattartók</div>
                {p.kapcsolatok.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Még nincs kapcsolattartó a megbízásokból.</p>
                ) : (
                  <ul className="mt-1 flex flex-col gap-0.5 text-sm">
                    {p.kapcsolatok.map((k, i) => (
                      <li key={i}>{k.nev ?? "—"}{k.telefon ? ` · ${k.telefon}` : ""}{k.email ? ` · ${k.email}` : ""}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tanult rakodási idő</div>
                <p className="mt-1 text-sm">
                  felrakó {p.rakodasFelrako ? <b>{p.rakodasFelrako.perc} p</b> : "—"}
                  {p.rakodasFelrako ? <span className="text-xs text-muted-foreground"> ({p.rakodasFelrako.minta} minta)</span> : null}
                  {" · "}lerakó {p.rakodasLerako ? <b>{p.rakodasLerako.perc} p</b> : "—"}
                  {p.rakodasLerako ? <span className="text-xs text-muted-foreground"> ({p.rakodasLerako.minta} minta)</span> : null}
                </p>
                <p className="text-[11px] text-muted-foreground">A megállókon mért érkezés→távozás mediánja (min. 3 minta).</p>
              </div>
            </div>
            {szerkeszthet ? <div className="mt-3 flex gap-2"><Button size="sm" disabled={pending} onClick={ment}>Ment</Button><Button size="sm" variant="ghost" onClick={onNyit}>Bezár</Button></div> : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}
