"use client";

import { useState } from "react";
import { AlertTriangle, Camera, Check, X } from "lucide-react";
import { JARMU_SZIN_DOT_CLASS } from "@/lib/fuvarozas/vehicles";
import { varosNev } from "@/lib/fuvarozas/varos";
import type {
  JarmuFuvarCsoport,
  JarmuMaiFuvar,
  JarmuMaiMegallo,
  JarmuMegbizasMegallo,
  JarmuMegbizasSor,
  JarmuPoziciSor,
} from "@/lib/attekintes/actions";

/** "6 perce" / "2 órája" — a pontos óra helyett, mennyivel ezelőtti az adat. */
function formatEltelt(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso.replace(" ", "T").replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  if (Number.isNaN(d.getTime())) return null;
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "most";
  if (diffMin < 60) return `${diffMin} perce`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} órája`;
  return d.toLocaleDateString("hu-HU", { day: "numeric", month: "short", timeZone: "Europe/Budapest" });
}

function budapestNapIso(eltolasNap = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + eltolasNap);
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Budapest" });
}

/** "Ma" / "Holnap" — null, ha egyik sem (ilyenkor a m.date jelenik meg helyette). */
function napCimke(datumIso: string): string | null {
  if (datumIso === budapestNapIso()) return "Ma";
  if (datumIso === budapestNapIso(1)) return "Holnap";
  return null;
}

/** "25 perc" / "1 óra 10 perc" */
function percSzoveg(perc: number): string {
  if (perc < 60) return `${perc} perc`;
  const ora = Math.floor(perc / 60);
  const maradek = perc % 60;
  return maradek ? `${ora} óra ${maradek} perc` : `${ora} óra`;
}

export function fuvarlevelFotoUrl(dokId: string): string {
  return `/api/fuvarozas/dokumentum/${dokId}`;
}

function Utvonal({ megallok }: { megallok: JarmuMegbizasMegallo[] }) {
  if (megallok.length === 0) return null;
  return (
    <div className="mt-2">
      <div className="flex items-center gap-1">
        {megallok.map((m, i) => (
          <div key={i} className="flex flex-1 items-center gap-1 last:flex-none">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                m.tipus === "felrako" ? "bg-[var(--at-positive)]" : "bg-[var(--at-negative)]"
              }`}
            />
            {i < megallok.length - 1 && (
              <span
                className="h-px flex-1"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(90deg, var(--at-border) 0 4px, transparent 4px 8px)",
                }}
              />
            )}
          </div>
        ))}
      </div>
      <div className="mt-0.5 flex justify-between text-[11px] text-[var(--at-muted)]">
        {megallok.map((m, i) => (
          <span key={i} className={i === 0 ? "" : i === megallok.length - 1 ? "text-right" : "text-center"}>
            {m.varos}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Egy mai fuvar egy állomása: bal oldalt az állapotjel (kész pipa / épp itt
 * / még hátra van), középen a város, jobbra az idő — kész megállónál a
 * tényleges érkezés, egyébként a becsült. Alatta a sofőr által jelölt
 * várakozás, ha van.
 */
function MaiMegalloSor({ m, kovetkezo, reszletes }: { m: JarmuMaiMegallo; kovetkezo: boolean; reszletes: boolean }) {
  const jel = m.kesz ? (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--at-positive)] text-white">
      <Check className="h-3 w-3" strokeWidth={3} />
    </span>
  ) : m.eppenItt ? (
    <span className="flex h-5 w-5 items-center justify-center">
      <span className="h-3 w-3 rounded-full bg-[var(--at-accent)] ring-4 ring-[var(--at-accent)]/25" />
    </span>
  ) : (
    <span className="flex h-5 w-5 items-center justify-center">
      <span
        className={`h-2.5 w-2.5 rounded-full border-2 ${
          m.tipus === "felrako" ? "border-[var(--at-positive)]" : "border-[var(--at-negative)]"
        } ${kovetkezo ? "bg-[var(--at-card)]" : "bg-transparent"}`}
      />
    </span>
  );

  const napJel = m.napElteres === -1 ? "tegnap" : m.napElteres === 1 ? "holnap" : m.napElteres !== 0 ? `${m.napElteres > 0 ? "+" : ""}${m.napElteres} nap` : null;
  const ido = m.eppenItt && !m.kesz ? "itt áll" : m.ido ? (m.kesz ? m.ido : `kb. ${m.ido}`) : null;

  return (
    <div className="flex items-start gap-2 py-1">
      <div className="pt-px">{jel}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={`truncate text-sm ${
              kovetkezo ? "font-semibold" : m.kesz ? "text-[var(--at-muted)]" : ""
            }`}
          >
            {m.varos}
            {reszletes && m.tipus === "felrako" && (
              <span className="ml-1 text-[11px] font-normal text-[var(--at-muted)]">felrakó</span>
            )}
          </span>
          <span className={`shrink-0 text-xs ${kovetkezo ? "font-semibold text-[var(--at-accent)]" : "text-[var(--at-muted)]"}`}>
            {napJel && <span className="mr-1">{napJel}</span>}
            {ido}
          </span>
        </div>
        {reszletes && m.cim !== m.varos && (
          <div className="truncate text-[11px] text-[var(--at-muted)]">{m.cim}</div>
        )}
        {(m.varakozasPerc !== null || (reszletes && m.kesz && m.keszForras === "kezi" && m.keszBy)) && (
          <div className="mt-0.5 flex flex-wrap gap-1 text-[11px]">
            {m.varakozasPerc !== null && (
              <span
                className={`rounded px-1.5 py-0.5 font-medium ${
                  m.varakozik ? "bg-amber-100 text-amber-800" : "bg-[var(--at-tile)] text-[var(--at-muted)]"
                }`}
              >
                {m.varakozik ? `várakozik ${percSzoveg(m.varakozasPerc)} óta` : `várt ${percSzoveg(m.varakozasPerc)}`}
              </span>
            )}
            {reszletes && m.kesz && m.keszForras === "kezi" && m.keszBy && (
              <span className="text-[var(--at-muted)]">jelölte: {m.keszBy}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MaiFuvarBlokk({ f, reszletes }: { f: JarmuMaiFuvar; reszletes: boolean }) {
  const kovetkezoIndex = f.megallok.find((m) => !m.kesz && !m.eppenItt)?.index ?? null;
  return (
    <div className={reszletes ? "rounded-lg bg-[var(--at-tile)] p-3" : "border-t border-[var(--at-border)] pt-2.5"}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--at-muted)]">
          <span className="shrink-0">{f.csuszo ? "Csúszó fuvar" : "Ma"}</span>
          {f.megrendelo && (
            <>
              <span className="shrink-0">·</span>
              <span className="truncate normal-case tracking-normal">{f.megrendelo}</span>
            </>
          )}
        </span>
        {f.pozicioszam && (
          <span className="shrink-0 text-[11px] font-medium text-[var(--at-muted)]">{f.pozicioszam}</span>
        )}
      </div>
      <div className="mt-1">
        {f.megallok.map((m) => (
          <MaiMegalloSor key={m.index} m={m} kovetkezo={m.index === kovetkezoIndex} reszletes={reszletes} />
        ))}
      </div>
      {f.gondok.map((g, i) => (
        <div key={i} className="mt-1 flex items-start gap-1.5 rounded bg-red-50 px-2 py-1 text-xs text-red-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className={reszletes ? "" : "line-clamp-2"}>{g}</span>
        </div>
      ))}
      {(f.fuvarlevelFotoDb > 0 || reszletes) && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs">
          {f.fuvarlevelFotoDb > 0 && f.fuvarlevelFotoId ? (
            // A kártya maga egy gomb, abba nem kerülhet link — ott csak jelzés, a részletnézetben nyitható meg.
            reszletes ? (
              <a
                href={fuvarlevelFotoUrl(f.fuvarlevelFotoId)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 font-medium text-[var(--at-accent)] underline underline-offset-2"
              >
                <Camera className="h-3.5 w-3.5" />
                Fuvarlevél fotó{f.fuvarlevelFotoDb > 1 ? ` (${f.fuvarlevelFotoDb})` : ""}
              </a>
            ) : (
              <span className="flex items-center gap-1 font-medium text-[var(--at-accent)]">
                <Camera className="h-3.5 w-3.5" />
                Fuvarlevél fotó{f.fuvarlevelFotoDb > 1 ? ` (${f.fuvarlevelFotoDb})` : ""}
              </span>
            )
          ) : (
            reszletes && (
              <span className="flex items-center gap-1 text-[var(--at-muted)]">
                <Camera className="h-3.5 w-3.5" />
                Még nincs fuvarlevél fotó
              </span>
            )
          )}
          {reszletes && (
            <span className="ml-auto rounded bg-[var(--at-card)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--at-muted)]">
              {f.cimke} fuvar
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Egy jövőbeli megbízás kompakt sora a kártyán: "KÖVETKEZŐ" fejléc, Felrakó → Lerakó, nap-jelvény. */
function MegbizasSor({ cim, m, szamlalo }: { cim: string; m: JarmuMegbizasSor; szamlalo?: string }) {
  const nap = napCimke(m.datumIso);
  return (
    <div className="border-t border-[var(--at-border)] pt-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--at-muted)]">
          {cim}
          {szamlalo && ` · ${szamlalo}`}
        </span>
        <span className="text-[11px] font-medium text-[var(--at-muted)]">
          {nap ?? m.date}
          {m.idopont && ` · ${m.idopont}`}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-sm font-medium">
        <span>{m.felrako ? varosNev(m.felrako) : "?"}</span>
        <span className="text-[var(--at-muted)]">→</span>
        <span>{varosNev(m.lerako)}</span>
      </div>
      {m.megrendelo && <div className="text-xs text-[var(--at-muted)]">{m.megrendelo}</div>}
    </div>
  );
}

export function MegbizasReszlet({ m }: { m: JarmuMegbizasSor }) {
  const nap = napCimke(m.datumIso);
  return (
    <div className="rounded-lg bg-[var(--at-tile)] p-3 text-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
            m.cimke === "Saját" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
          }`}
        >
          {m.cimke} fuvar
        </span>
        {nap && (
          <span className="rounded bg-[var(--at-accent)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--at-accent)]">
            {nap}
          </span>
        )}
        <span className="ml-auto text-xs text-[var(--at-muted)]">
          {m.date}
          {m.idopont && ` · ${m.idopont}`}
        </span>
      </div>
      {m.megrendelo && <div className="mt-1.5 font-medium">{m.megrendelo}</div>}
      {m.pozicioszam && (
        <div className="text-xs text-[var(--at-muted)]">Pozíciószám: {m.pozicioszam}</div>
      )}
      <Utvonal megallok={m.megallok} />
    </div>
  );
}

export function JarmuKartya({
  csoport,
  pozicio,
}: {
  csoport: JarmuFuvarCsoport;
  pozicio: JarmuPoziciSor | undefined;
}) {
  const { jarmu, mai, kovetkezok, eloEta } = csoport;
  const [nyitva, setNyitva] = useState(false);
  const eltelt = formatEltelt(pozicio?.frissitve ?? null);
  const vanGps = !!pozicio?.cim;
  const nincsSemmi = mai.length === 0 && kovetkezok.length === 0;

  // A kártyán a mai fuvarok közül az ELSŐ látszik teljes állomás-listával
  // (ez a kocsi aktuális munkája); a további maiak és a legközelebbi
  // jövőbeli egy-egy sorban. A többi a részletnézetben.
  const [elsoMai, ...tobbiMai] = mai;
  const kovetkezo = kovetkezok[0];
  const rejtettDb = Math.max(0, kovetkezok.length - 1);

  return (
    <>
      <button
        type="button"
        onClick={() => setNyitva(true)}
        className="w-full rounded-xl border border-[var(--at-border)] bg-[var(--at-card)] p-4 text-left"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-base font-bold">
            <span className={`h-3 w-3 shrink-0 rounded-full ${JARMU_SZIN_DOT_CLASS[jarmu.szin]}`} />
            {jarmu.sofor}
          </span>
          <span className={`text-sm font-bold ${pozicio?.motorFut ? "text-[var(--at-accent)]" : "text-[var(--at-muted)]"}`}>
            {vanGps ? (pozicio?.sebesseg !== null ? `${Math.round(pozicio!.sebesseg!)} km/h` : "Áll") : "—"}
          </span>
        </div>

        {vanGps ? (
          <div className="mt-0.5 text-sm text-[var(--at-muted)]">
            {pozicio?.cim}
            {eltelt && ` · ${eltelt}`}
          </div>
        ) : (
          <p className="mt-0.5 text-sm text-[var(--at-muted)]">Nincs GPS-adat.</p>
        )}
        {eloEta && (
          <div className="mt-0.5 text-xs font-medium text-[var(--at-accent)]">
            Érkezés: {eloEta.cel} kb. {eloEta.ido}
          </div>
        )}

        {nincsSemmi ? (
          <p className="mt-2.5 border-t border-[var(--at-border)] pt-2.5 text-sm text-[var(--at-muted)]">
            Nincs folyamatban lévő megbízás.
          </p>
        ) : (
          <div className="mt-2.5 flex flex-col gap-2.5">
            {elsoMai && <MaiFuvarBlokk f={elsoMai} reszletes={false} />}
            {tobbiMai.map((f) => (
              <div key={f.id} className="border-t border-[var(--at-border)] pt-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--at-muted)]">
                    Ma még
                  </span>
                  {f.pozicioszam && (
                    <span className="text-[11px] font-medium text-[var(--at-muted)]">{f.pozicioszam}</span>
                  )}
                </div>
                <div className="mt-1 truncate text-sm font-medium">
                  {f.megallok.map((m) => m.varos).join(" → ")}
                </div>
                {f.megrendelo && <div className="text-xs text-[var(--at-muted)]">{f.megrendelo}</div>}
              </div>
            ))}
            {kovetkezo && (
              <MegbizasSor
                cim="Következő"
                m={kovetkezo}
                szamlalo={kovetkezok.length > 1 ? `1/${kovetkezok.length}` : undefined}
              />
            )}
            {rejtettDb > 0 && (
              <p className="text-xs text-[var(--at-muted)]">+{rejtettDb} további megbízás — koppints a részletekért</p>
            )}
          </div>
        )}
      </button>

      {nyitva && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[var(--at-bg)] text-[var(--at-text)]">
          <div className="flex items-center justify-between border-b border-[var(--at-border)] px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${JARMU_SZIN_DOT_CLASS[jarmu.szin]}`} />
              {jarmu.sofor} — {jarmu.label}
            </div>
            <button
              type="button"
              onClick={() => setNyitva(false)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--at-muted)] hover:text-[var(--at-text)]"
              aria-label="Bezárás"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="mx-auto flex max-w-md flex-col gap-4">
              <div className="rounded-xl border border-[var(--at-border)] bg-[var(--at-card)] p-4">
                {vanGps ? (
                  <div className="text-sm">
                    <div>{pozicio?.cim}</div>
                    <div className="mt-1 flex items-center justify-between text-xs text-[var(--at-muted)]">
                      <span>{pozicio?.sebesseg !== null ? `${Math.round(pozicio!.sebesseg!)} km/h` : "—"} · {pozicio?.motorFut ? "fut a motor" : "áll"}</span>
                      {eltelt && <span>{eltelt}</span>}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--at-muted)]">Nincs GPS-adat.</p>
                )}
                {eloEta && (
                  <div className="mt-1 text-xs font-medium text-[var(--at-accent)]">
                    Érkezés: {eloEta.cel} kb. {eloEta.ido}
                  </div>
                )}
                {csoport.hiba && <p className="mt-1 text-xs text-[var(--at-negative)]">{csoport.hiba}</p>}
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold">Ma</h3>
                {mai.length === 0 ? (
                  <p className="text-sm text-[var(--at-muted)]">Mára nincs fuvar ezen a kocsin.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {mai.map((f) => (
                      <MaiFuvarBlokk key={f.id} f={f} reszletes />
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold">Következő napok</h3>
                {kovetkezok.length === 0 ? (
                  <p className="text-sm text-[var(--at-muted)]">Nincs későbbre beütemezett megbízás.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {kovetkezok.map((m) => (
                      <MegbizasReszlet key={m.id} m={m} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
