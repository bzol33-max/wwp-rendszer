# WELL-WORN AI ENGINEERING STRATEGY

**Koordinációs dokumentum** — Az AI Engineering workflow és az ügynöki réteg-terv összekapcsolása

---

## Hierarchia

```
Well-Worn AI Engineering System (Architect/Builder/Reviewer/...)
           ↓
        V1 Stabilizálás (Phase 0–2)
           ↓
        V2 Architektúra (Phase 3–5)
           ↓
    CLAUDE ÜGYNÖKI RÉTEG (Phase 11)
           ↓
10 Specializált Ügynök (Email, Pénzügy, CRM, Szállítás, stb.)
```

---

## Phase-by-Phase Plan

### PHASE 0: V1 Teljes Audit ✅ DONE
- **Feladat:** Well-Worn rendszer teljes feltérképezése
- **Output:** `.claude/WELL-WORN-SYSTEM-AUDIT.md` (kész 2026-09-13)
- **Dokumentáció:** `SYSTEM_AUDIT`, `SYSTEM_MAP`, `ARCHITECTURE_MAP`, etc.
- **AI Engineering Agent:** Explore (Architect)
- **Status:** ✅ Kész

### PHASE 1: V1 Dokumentáció ✅ IN PROGRESS
- **Feladat:** Strukturált dokumentáció az audit alapján
- **Output:** `.claude/agents/` (architect.md, builder.md, reviewer.md, etc.)
- **Scope:**
  - Architect: Tervek, ADR-ek, hatásvizsgálatok
  - Builder: Implementáció, kód-szervezés
  - Reviewer: Code review, regresszió
  - Business Logic: Üzleti szabályok, workflow-k
  - Security: Biztonsági auditok
  - Tester: E2E teszt-szenáriók
  - Performance: Query-optimalizálás
  - Final Review: Gate-keeper
- **AI Engineering Agent:** Architect (tervez), Builder (dokumentál)
- **Status:** 🟡 Folyamatban (8 agent-file kész)

### PHASE 2: V1 Stabilizálás 🟡 PLANNED
- **Feladat:** Phase 0–1 auditok alapján kritikus fixes
- **Scope:**
  - Partner-törzs: Egyedi adatmodell (szöveg helyett strukturált)
  - Audit/napló tábla: Minden kritikus mutáció nyomon követése
  - EUR-árfolyam: Fuvarok pénznem-kezelése
  - Fuvarozás–Számlák valódi FK kapcsolat
  - Mobil kártyanézet (táblázatok)
  - CSS font fix + brand color
- **AI Engineering Agents:** Architect (terv), Builder (fix), Reviewer, Security, Tester
- **Timeline:** 2-3 hét
- **Gates:**
  - Audit-napló működik (created_by, created_at, action minden kritikus táblánál)
  - Partner-törzs strukturált (nem szöveg)
  - EUR-fuvarok jól kezeltek
  - 0% → 30% test coverage (E2E)

### PHASE 3: V2 Architektúra 🟠 PLANNED
- **Feladat:** Új szubrendszerek tervezése
- **Scope:**
  - Ecofleet-bővítés (getTrips + geofence)
  - Bank API tervezés (nem implementáció, csak terv)
  - CRM/Partner-törzs integrálás
  - Jogosultság-modell: Module-based → action-based
- **AI Engineering Agent:** Architect (ADR-ek)
- **Timeline:** 2 hét
- **Gate:** ADR-ek jóváhagyva, no blocking issues

### PHASE 4–10: V2 Implementáció & Testing
- **PHASE 4:** Új Dashboard (10 koncepció → 1 egységes)
- **PHASE 5:** Mobil (dolgozói egységesítés, /attekintes)
- **PHASE 6:** Playwright tesztek (>50% coverage)
- **PHASE 7:** Security review (penetration test)
- **PHASE 8:** Performance review (DB query optimization)
- **PHASE 9:** V1↔V2 feature comparison
- **PHASE 10:** Ready for deploy

**AI Engineering Agents:** Builder (implementáció), Reviewer (QA), Tester (E2E), Performance (optimization), Final Review (gate)

---

### PHASE 11: CLAUDE ÜGYNÖKI RÉTEG 🌟 VISION
**Csak akkor indulhat, ha Phase 0–10 COMPLETE.**

```
PHASE 11.1  Készlet/Telephely ügynök (FIRST MOVER — már stabil adaton)
            - Ügynök feladat: Készlet-szint elemzés, beszerzési javaslat
            - Adat-forrás: belső DB (Készlet modul) ✅ stabil
            - Szükséges MCP: PostgreSQL direkts lekérdezés

PHASE 11.2  Email + Dokumentum/PDF ügynök
            - Ügynök feladat: Beérkező levelek feldolgozása, PDF-fuvarlevél-felismerés
            - Adat-forrás: Gmail, Google Drive ✅ elérhető
            - Szükséges MCP: Gmail, Google Drive (már van)
            - Függőség: PDF-feldolgozás workflow (Phase 3 vége)

PHASE 11.3  Értékesítés/CRM + Beszerzés ügynök
            - Ügynök feladat: Ügyfél-előzmények, ajánlat-követés
            - Adat-forrás: CRM/ERP (= wwp-rendszer Partner-törzs)
            - Szükséges: Partner-törzs strukturált (Phase 2)

PHASE 11.4  Szállítás/Fuvar ügynök
            - Ügynök feladat: GPS-nyomon követés, ETA-előrejelzés, költség-optimalizálás
            - Adat-forrás: Ecofleet, Fuvarozás modul
            - Szükséges: Ecofleet-bővítés getTrips/geofence (Phase 3)

PHASE 11.5  Pénzügy/Bank egyeztető ügynök
            - Ügynök feladat: Számla↔bank párosítás, fizetési státusz, egyeztetés
            - Adat-forrás: Szamlak modul, Bank API
            - Szükséges: Bank API beépítés (Phase 3)
            - Függőség-lánc: LEGHOSSZABB (Bank API nem könnyen elérhető)

PHASE 11.6  Vezetői riport + Költség/Profit ügynök
            - Ügynök feladat: Napi/heti/havi KPI-k, jövedelmezőség-elemzés
            - Adat-forrás: Összes modul (Szamlak, Fuvar, Készlet, Dolgozók)
            - Szükséges: EUR-árfolyam kezelés (Phase 2)
            - Függőség-lánc: 11.3–11.5-re épül (utolsó)

PHASE 11.7  Web/Marketing ügynök (OPCIONÁLIS)
            - Ügynök feladat: Weboldalak, hirdetések, lead-kezelés
            - Adat-forrás: Web/CMS (még nincs)
            - Függőség: Független — bármikor jöhet
```

---

## MCP-Kiterjesztések a Phase 11-hez

| MCP | Phase 11 Ügynökök | Jelenlegi állapot | Szükséges |
|-----|-------------------|------------------|-----------|
| **PostgreSQL Driver** | Készlet, Email, Szállítás, Pénzügy, Vezetői | Nincs | ✅ |
| **Gmail** | Email | elérhető | ✅ már van |
| **Google Drive** | Email, Dokumentum/PDF | elérhető | ✅ már van |
| **Google Sheets** | Vezetői (reporting) | elérhető | ✅ már van |
| **Playwright** | Tesztelés (Phase 6) | Nincs | ✅ |
| **Bank API** | Pénzügy/Bank | Nincs | 🔴 Külön fejlesztés |
| **Ecofleet API** | Szállítás/Fuvar | Részleges (getLastData csak) | ⚠️ Bővítés szükséges |
| **Slack/Email Notifier** | Összes ügynök (status reporting) | Nincs | 🟡 Nice-to-have |

---

## AI Engineering Workflow ↔ Ügynöki Réteg Integrálása

**Az AI Engineering workflow-ban minden módosítás:
1. Architect: Terv jóváhagyott
2. Builder: Implementáció (ügynöki réteg-készítésre kész adaton)
3. Reviewer: Code review
4. Business Logic: Üzleti szabályok
5. Security: Biztonság
6. Tester: E2E teszt (Phase 6+)
7. Performance: Optimalizálás
8. Final Review: Gate — szükséges Phase 11 ügynöki-réteg-hez?**

**Kritikus:** Ügynök-réteg fejlesztők (Phase 11) az AI Engineering agent-ek tanácsait követik!

```
v1 Stabilizálás (Architect/Builder/Reviewer/...)
           ↓
        Stabil adatmodell
           ↓
v2 Architektúra (Architect/Builder/Reviewer/...)
           ↓
        Stabil API-k & integrációk
           ↓
   Phase 11 Ügynöki Réteg
    (Email, CRM, Szállítás, Pénzügy, Vezetői)
           ↓
  10 Szakosított Ügynök → Orchestrator
           ↓
    WWP Központi Tudás- és Döntési Mag
```

---

## Kritikus Path (Critical Path)

```
Phase 0 (Audit)
    ↓
Phase 1 (Documentation) ← YOU ARE HERE
    ↓
Phase 2 (Stabilization)
    ├─ Partner-törzs
    ├─ Audit/napló
    └─ EUR-árfolyam
        ↓
Phase 3 (V2 Architecture)
    ├─ Ecofleet-bővítés (Phase 11.4-hez)
    ├─ Bank API-terv (Phase 11.5-hez)
    └─ CRM-integrálás (Phase 11.3-hoz)
        ↓
Phase 4–10 (Implementation & Testing)
    ├─ Dashboard
    ├─ Playwright tests (Phase 6)
    ├─ Security review (Phase 7)
    └─ Performance (Phase 8)
        ↓
PHASE 11 READY-FOR-LAUNCH
    ├─ 11.1 Készlet ügynök (START HERE)
    ├─ 11.2 Email + PDF ügynök
    ├─ 11.3 CRM ügynök (Partner-törzstől függ)
    ├─ 11.4 Szállítás ügynök (Ecofleet-tõl függ)
    ├─ 11.5 Pénzügy ügynök (Bank API-tól függ)
    └─ 11.6 Vezetői ügynök (Min. 11.3–11.5)
```

**Critical Dependency:** Phase 2 & 3 **NE** csúsznak el, vagy a Phase 11 ügynökök "jó adat" helyett "szét férzékezett adat" elemzésevel futnak.

---

## KPI-k az Egyes Fázisokon

| Phase | Cél | Success Criteria |
|-------|-----|------------------|
| 0 | Audit | Teljes feltérképezés, 0 hiányzó dokumentáció |
| 1 | Dokumentáció | 8 agent-file kész (architect→final-review) |
| 2 | Stabilizálás | Partner-törzs strukturált, audit-napló működik, 30% test coverage |
| 3 | V2 Arch | ADR-ek jóváhagyva, API-terv, no blocking issues |
| 4–10 | Implementáció | >50% test, security review PASS, perf <500ms |
| 11 | Ügynöki réteg | 11.1 (Készlet) LIVE, 11.2–11.6 ready-for-testing |

---

## Mely Módosítás Melyik Phase-hez Tartozik?

**Phase 2 (Stabilizálás):**
- 🔴 Kritikus biztonsági fix (auth, SQL injection) — haladéktalanul, no waiting for Phase
- 🟡 Partner-törzs strukturálás — Phase 2
- 🟡 Audit/napló tábla — Phase 2
- 🟡 EUR-árfolyam — Phase 2

**Phase 3 (V2 Arch):**
- Új modul (Járművek) — Phase 3 architektúra-tervvel
- Ecofleet getTrips/geofence — Phase 3
- Bank API terv — Phase 3

**Phase 4–10 (Implementáció):**
- Új dashboard — Phase 4
- Playwright tesztek — Phase 6
- Mobil egységesítés — Phase 5

**Phase 11 (Ügynöki Réteg):**
- Email ügynök — Phase 11.2
- CRM ügynök — Phase 11.3
- Szállítás ügynök — Phase 11.4

---

## Összefoglalás

1. **Phase 1 (Most):** AI Engineering dokumentáció kész (8 agent-file)
2. **Phase 2 (2–3 hét):** Kritikus stabilizálási fixek (Partner, audit-log, EUR)
3. **Phase 3–10:** V2 architektúra + implementáció + tesztelés
4. **Phase 11:** Claude ügynöki réteg — 10 szakosított ügynök

**Az AI Engineering workflow** (`architect.md`, `builder.md`, stb.) a **kritikus út** — ha ezt jól csináljuk, a Phase 11 ügynökök **stabil, jó-minőségű adat** fölött futnak.

**A Phase 11 ügynök-réteg** pedig a **végső cél** — a Well-Worn Pallet Kft. valódi AI-orchestrator-a.
