"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCanEdit } from "@/components/auth/edit-permission-context";
import { formatFt } from "@/components/fuvarozas2/kozos";
import { ForrasJel } from "@/components/fuvarozas2/forras-jel";
import { importalHuGoFajlt, rogzitKeziTankolast, torolKeziTankolast, type KoltsegekOldal } from "@/lib/fuvarozas2/koltsegek";
import type { HuGoImportEredmeny } from "@/lib/fuvarozas2/koltsegek-core";

// Fuvarozás — Költségek fül (5. fázis): HU-GO import, tankolások, beállítások.

function fajlBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = r.result as string;
      resolve(s.slice(s.indexOf(",") + 1));
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

const FORRAS_CIMKE: Record<string, string> = { oplusz_email: "kút e-mail", kezi: "kézi", import: "import" };

function HuGoImport() {
  const canEdit = useCanEdit();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [fut, setFut] = useState(false);
  const [eredmeny, setEredmeny] = useState<HuGoImportEredmeny | null>(null);

  async function feltolt(file: File) {
    setFut(true);
    try {
      const e = await importalHuGoFajlt(file.name, await fajlBase64(file));
      setEredmeny(e);
      toast.success(`${e.uj} új útdíj-tranzakció mentve${e.marVolt ? `, ${e.marVolt} már megvolt` : ""}.`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Az import nem sikerült.");
    } finally {
      setFut(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">HU-GO útdíj-import</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p className="text-muted-foreground">
          A HU-GO portál tranzakció-listájának exportja (.xlsx vagy .csv). Az oszlopokat a fejléc neve alapján ismerjük fel:
          dátum/időpont, rendszám, bruttó összeg, és ha van: útszakasz, km, kategória. Ugyanaz a fájl újra feltöltve nem duplikál; ha van tranzakció-azonosító oszlop, más formátumú exportból sem.
        </p>
        {canEdit ? (
          <div>
            <input ref={input} type="file" accept=".xlsx,.csv,.txt" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void feltolt(f); }} />
            <Button size="sm" disabled={fut} onClick={() => input.current?.click()}>
              <UploadIcon className="size-4" /> {fut ? "Feldolgozás…" : "Fájl feltöltése"}
            </Button>
          </div>
        ) : null}
        {eredmeny ? (
          <div className="rounded-lg bg-muted/50 px-3 py-2">
            <div className="font-medium">
              {eredmeny.beolvasva} tranzakció beolvasva · {eredmeny.uj} új · {eredmeny.marVolt} már megvolt · {formatFt(eredmeny.osszegFt)}
            </div>
            {eredmeny.idoszak ? <div className="text-xs text-muted-foreground">{eredmeny.idoszak.tol} – {eredmeny.idoszak.ig}</div> : null}
            {eredmeny.kocsiNelkul > 0 ? (
              <div className="text-xs text-[var(--f2-amb)]">{eredmeny.kocsiNelkul} sor rendszáma nem saját kocsié (pl. pótkocsi vagy idegen) — mentve, de kocsihoz nem számít.</div>
            ) : null}
            {Object.keys(eredmeny.oszlopok).length > 0 ? (
              <div className="text-xs text-muted-foreground">
                Felismert oszlopok: {Object.entries(eredmeny.oszlopok).map(([k, v]) => `${k} = „${v}”`).join(", ")}
              </div>
            ) : null}
            {eredmeny.hibak.length > 0 ? (
              <ul className="mt-1 list-disc pl-5 text-xs text-[var(--f2-red)]">
                {eredmeny.hibak.map((h) => <li key={h}>{h}</li>)}
              </ul>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function KeziTankolas({ jarmuvek }: { jarmuvek: KoltsegekOldal["jarmuvek"] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ido, setIdo] = useState("");
  const [jarmu, setJarmu] = useState(jarmuvek[0]?.kod ?? "");
  const [osszeg, setOsszeg] = useState("");
  const [liter, setLiter] = useState("");
  const [tranz, setTranz] = useState("");

  function ment() {
    if (!ido || !osszeg) { toast.error("Add meg az időpontot és az összeget."); return; }
    start(async () => {
      const r = await rogzitKeziTankolast({ idopont: ido, jarmuKod: jarmu, osszeg, liter, tranzakcioSzam: tranz });
      if (!r.ok) { toast.error(r.hiba); return; }
      toast.success(r.uj ? "Tankolás rögzítve." : "Ez a tankolás már szerepel.");
      setOsszeg(""); setLiter(""); setTranz("");
      router.refresh();
    });
  }

  const mezo = "flex flex-col gap-1 text-xs text-muted-foreground";
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
      <label className={mezo}>Időpont<Input type="datetime-local" value={ido} onChange={(e) => setIdo(e.target.value)} /></label>
      <label className={mezo}>Kocsi
        <select value={jarmu} onChange={(e) => setJarmu(e.target.value)} className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm text-foreground max-md:h-11">
          {jarmuvek.map((j) => <option key={j.kod} value={j.kod}>{j.nev}</option>)}
        </select>
      </label>
      <label className={mezo}>Összeg (Ft)<Input inputMode="decimal" placeholder="pl. 85 400" value={osszeg} onChange={(e) => setOsszeg(e.target.value)} /></label>
      <label className={mezo}>Liter (ha ismert)<Input inputMode="decimal" placeholder="pl. 142,5" value={liter} onChange={(e) => setLiter(e.target.value)} /></label>
      <label className={mezo}>Bizonylatszám<Input placeholder="nem kötelező" value={tranz} onChange={(e) => setTranz(e.target.value)} /></label>
      {/* Mindig aktív (a hiányzó mezőt a mentés jelzi) — üres űrlapnál a halvány, letiltott gomb nem tűnt kattinthatónak. */}
      <Button size="sm" disabled={pending} onClick={ment}>{pending ? "Mentés…" : "Rögzítés"}</Button>
    </div>
  );
}

export function KoltsegekNezet({ adat }: { adat: KoltsegekOldal }) {
  const canEdit = useCanEdit();
  const router = useRouter();
  const [pending, start] = useTransition();
  const b = adat.beallitas;
  const beallitasok: [string, string][] = [
    ["Napi költség (sofőr + kocsi)", `${b.napi_koltseg_ft.toLocaleString("hu-HU")} Ft/nap`],
    ["Alap fogyasztás", `${b.fogyasztas_alap_l_100km} l/100 km`],
    ["Mért fogyasztás küszöbe", `${b.meres_min_km} km`],
    ["Tankolási kedvezmény", `${b.tankolasi_kedvezmeny_ft_l} Ft/l (NAV-árból)`],
    ["Gázolajár-tartalék", `${b.gazolaj_ar_tartalek_ft} Ft/l`],
    ["Saját fuvar km-díja (tájékoztató)", `${b.sajat_fuvar_km_dij_ft} Ft/km`],
  ];

  return (
    <div className="flex flex-col gap-5">
      <HuGoImport />

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Tankolások</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3 p-0">
          <p className="px-4 text-sm text-muted-foreground">
            A kút „Értesítés bizonylat készítésről” leveleiből magától kerül ide (Gmail-figyelő), és kézzel is rögzíthető.
            Ahol a liter is ismert, a Kimutatás az aznapi tényleges Ft/l-rel számol a NAV-ár helyett.
          </p>
          {canEdit ? <div className="px-4"><KeziTankolas jarmuvek={adat.jarmuvek} /></div> : null}
          {/* Telefonon kártyák: a táblából 390 px-en az Összeg kilógott. */}
          <ul className="flex flex-col divide-y divide-foreground/5 border-t border-foreground/5 sm:hidden">
            {adat.tankolasok.length === 0 ? (
              <li className="px-4 py-4 text-center text-sm text-muted-foreground">Az utolsó két hónapban nincs rögzített tankolás.</li>
            ) : adat.tankolasok.map((t) => (
              <li key={t.id} className="flex flex-col gap-0.5 px-4 py-3 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{t.jarmuKod ?? <span className="text-[var(--f2-amb)]">{t.rendszam ?? "?"} (nem saját)</span>}</span>
                  <span className="whitespace-nowrap font-semibold tabular-nums">{formatFt(t.osszegFt)} <ForrasJel forras="teny" /></span>
                </div>
                <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                  <span className="tabular-nums">{t.idopont}</span>
                  <span className="whitespace-nowrap tabular-nums">
                    {t.liter != null ? `${t.liter.toLocaleString("hu-HU")} l` : "— l"}{t.ftPerLiter != null ? ` · ${t.ftPerLiter.toLocaleString("hu-HU")} Ft/l` : ""}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>{FORRAS_CIMKE[t.forras] ?? t.forras}{t.rogzitette && t.forras === "kezi" ? ` · ${t.rogzitette}` : ""}{t.tranzakcioSzam.startsWith("kezi:") ? "" : ` · ${t.tranzakcioSzam}`}</span>
                  {canEdit && t.forras === "kezi" ? (
                    <Button size="xs" variant="ghost" disabled={pending}
                      onClick={() => start(async () => { await torolKeziTankolast(t.id); router.refresh(); })}>Törlés</Button>
                  ) : null}
                </div>
                {t.figyelmeztetes ? <div className="text-xs text-[var(--f2-amb)]">⚠ {t.figyelmeztetes}</div> : null}
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[48rem] text-sm [&_td]:whitespace-nowrap">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Időpont</th>
                  <th className="px-3 py-2 font-medium">Kocsi</th>
                  <th className="px-3 py-2 text-right font-medium">Liter</th>
                  <th className="px-3 py-2 text-right font-medium">Összeg</th>
                  <th className="px-3 py-2 text-right font-medium">Ft/l</th>
                  <th className="px-3 py-2 font-medium">Bizonylat</th>
                  <th className="px-3 py-2 font-medium">Forrás</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {adat.tankolasok.length === 0 ? (
                  <tr><td colSpan={8} className="px-3 py-4 text-center text-muted-foreground">Az utolsó két hónapban nincs rögzített tankolás.</td></tr>
                ) : adat.tankolasok.map((t) => (
                  <tr key={t.id} className="border-t border-foreground/5">
                    <td className="px-3 py-2 tabular-nums">{t.idopont}</td>
                    <td className="px-3 py-2">{t.jarmuKod ?? <span className="text-[var(--f2-amb)]">{t.rendszam ?? "?"} (nem saját)</span>}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {t.liter != null ? t.liter.toLocaleString("hu-HU") : "—"}
                      {t.figyelmeztetes ? <div className="text-[10px] text-[var(--f2-amb)]" title={t.figyelmeztetes}>⚠ gyanús liter</div> : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatFt(t.osszegFt)} <ForrasJel forras="teny" /></td>
                    <td className="px-3 py-2 text-right tabular-nums">{t.ftPerLiter != null ? t.ftPerLiter.toLocaleString("hu-HU") : "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{t.tranzakcioSzam.startsWith("kezi:") ? "—" : t.tranzakcioSzam}</td>
                    <td className="px-3 py-2 text-xs">{FORRAS_CIMKE[t.forras] ?? t.forras}{t.rogzitette && t.forras === "kezi" ? ` · ${t.rogzitette}` : ""}</td>
                    <td className="px-3 py-2 text-right">
                      {canEdit && t.forras === "kezi" ? (
                        <Button size="xs" variant="ghost" disabled={pending}
                          onClick={() => start(async () => { await torolKeziTankolast(t.id); router.refresh(); })}>Törlés</Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Importált útdíj havonta</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Hónap</th>
                  <th className="px-3 py-2 text-right font-medium">Tranzakció</th>
                  <th className="px-3 py-2 text-right font-medium">Bruttó</th>
                  <th className="px-3 py-2 text-right font-medium">Kocsi nélkül</th>
                </tr>
              </thead>
              <tbody>
                {adat.utdijHonapok.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">Még nincs importált HU-GO tranzakció.</td></tr>
                ) : adat.utdijHonapok.map((u) => (
                  <tr key={u.honap} className="border-t border-foreground/5">
                    <td className="px-3 py-2 tabular-nums">{u.honap}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{u.db}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatFt(u.osszegFt)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{u.kocsiNelkul}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {adat.utolsoUtdijImport ? <p className="px-3 py-2 text-xs text-muted-foreground">Utolsó import: {adat.utolsoUtdijImport}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">A számítás beállításai</CardTitle></CardHeader>
          <CardContent className="text-sm">
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
              {beallitasok.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">Csak olvasható — a fuvar_beallitas táblából (030-as migráció).</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
