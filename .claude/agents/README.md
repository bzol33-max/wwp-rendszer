# Well-Worn AI Engineering Agents

**8 Szakosított Ügynök a wwp-rendszer fejlesztéséhez**

---

## Szerep-Összefoglalása

```
REQUEST (Felhasználó/PM)
    ↓
ARCHITECT
  • Terv + ADR + hatásvizsgálat
  • API + adatmodell + workflow
  
    ↓
BUILDER
  • Implementáció (frontend, backend, DB)
  • Kód-írás, git-commit
  
    ↓
REVIEWER
  • Code review (logika, regresszió, duplikáció)
  • Edge case-ek
  
    ↓
BUSINESS LOGIC
  • Üzleti szabályok ellenõrzése
  • Workflow-k validálása
  
    ↓
SECURITY
  • Auth, authz, SQL injection, XSS
  • Secrets, error messages
  
    ↓
TESTER
  • E2E Playwright tesztek
  • Data validáció, regression
  
    ↓
PERFORMANCE
  • Query optimization, indexek
  • Response time, memory
  
    ↓
FINAL REVIEW
  • Gate-keeper: PASS / FAIL
  • Post-deploy steps dokumentálva
  
    ↓
✅ MERGE → main
   Railway auto-deploy
```

---

## Agent-Fájlok

| File | Cél | Use When |
|------|-----|----------|
| **architect.md** | Tervez | Új funkció, modul, vagy jelentős módosítás előtt |
| **builder.md** | Implementál | Architect terv után, kódírás & git workflow |
| **reviewer.md** | Code review | Builder PR után, logikai hibák, regresszió |
| **business-logic.md** | Üzleti validálás | Felhasználó-felé terv után, workflow-k ellenõrzése |
| **security.md** | Biztonság-audit | API, auth, secrets, SQL injection ellenõrzése |
| **tester.md** | E2E tesztek | Performance-critical vagy user-facing feature |
| **performance.md** | Query optimization | Lassú query, N+1, missing index |
| **final-review.md** | Gate-keeper | Merge előtti végső ellenõrzés |

---

## Workflow Példa: Szamlak Cursor-Based Pagination

**Szenárió:** Szamlak modul 500+ soros lista lassú. Paginálni kell.

```
1. ARCHITECT
   Input: "Szamlak lista 500+ sor, paginálni kell"
   Process: Cursor-based pagination terv
   Output: ADR-1 (decision record)
   → Builder-nek: Terv jóváhagyott
   
2. BUILDER
   Input: ADR-1 terv
   Process: 
     - Szerver: getSzamlaLista(szuro, limit, cursor)
     - Frontend: Szamlalista component + "Load More"
     - Database: Index check
   Output: PR szamlak-pagination branch-en
   → Reviewer-nek: Review-re kész
   
3. REVIEWER
   Input: PR diff
   Process:
     - Logika: Cursor-tuple compare OK?
     - Edge case: Üres lista, last page?
     - SQL: Parameterized query? ← 🔴 BUG Found!
   Output: Finding: SQL injection
   → Builder-nek: Fix szükséges
   
4. BUILDER (resubmit)
   Input: SQL injection finding
   Process: Cursor parameterized
   Output: PR updated
   → Reviewer-nek: Re-review
   
5. REVIEWER (pass)
   Output: ✅ PASS
   → Business Logic-nek
   
6. BUSINESS LOGIC
   Input: PASS from Reviewer
   Process: 
     - Szamlak szûrés: továbbra is teljes ✅
     - Rendezés: fizetesi_hatarido alapján ✅
   Output: ✅ Üzleti OK
   → Security-nek
   
7. SECURITY
   Input: ✅ from Business Logic
   Process:
     - SQL injection: Fixed ✅
     - Auth check: withSession() OK ✅
     - Error messages: Generic ✅
   Output: ✅ Security OK
   → Tester-nek
   
8. TESTER
   Input: ✅ from Security
   Process:
     - E2E: "Load More" button test PASS
     - Data: 50 rows per page, cursor works
     - Regression: Existing filter/sort OK
   Output: ✅ E2E PASS
   → Performance-nek
   
9. PERFORMANCE
   Input: ✅ from Tester
   Process:
     - Initial load: 500 rows → 50 (10x faster)
     - "Load More": 200ms (OK)
     - Index: Present (OK)
   Output: ✅ Perf OK
   → Final Review-nak
   
10. FINAL REVIEW
    Input: ✅ All gates pass
    Process:
      - Checklist: Arch ✅ Builder ✅ Reviewer ✅ ...
      - Summary: Clear PR title/desc
      - Risk: MEDIUM (cursor handling critical)
      - Post-deploy: None
    Output: 🟢 GO
    → MERGE to main
    
11. MERGE & DEPLOY
    - Branch → main
    - Railway: auto-deploy
    - 2 min később: live
```

---

## Mikor Használj Melyik Ügynököt?

### ARCHITECT
- ✅ Új modul/feature terv
- ✅ API-tervezés
- ✅ Database schema változás
- ✅ Workflow dokumentáció
- ❌ Egy-sorozott bugfix

### BUILDER
- ✅ Architect terv után kódolás
- ✅ Git workflow, commit, branch-kezelés
- ✅ Frontend/backend implementáció
- ✅ Database migráció
- ❌ Code review (az Reviewer dolga)

### REVIEWER
- ✅ Code review (logika, regresszió)
- ✅ SQL injection, duplikáció
- ✅ Edge case-ek gondolata
- ❌ Üzleti szabályok (Business Logic feladata)
- ❌ Security audit (Security Agent feladata)

### BUSINESS LOGIC
- ✅ Üzleti workflow-ok ellenõrzése
- ✅ Jogosultságok, pénzügyi hatás
- ✅ Üzleti kockázatok azonosítása
- ❌ Kód-logika hibák (Reviewer feladata)

### SECURITY
- ✅ SQL injection, XSS, auth bypass
- ✅ Secrets, session, encryption
- ✅ CORS, CSRF, rate-limiting
- ❌ Kód-stílus (Reviewer feladata)

### TESTER
- ✅ E2E Playwright tesztek
- ✅ User workflow-k tesztelése
- ✅ Regression check
- ❌ Unit tesztek (ha nincs infrastructure)

### PERFORMANCE
- ✅ Lassú query-k, N+1
- ✅ Missing index-ek
- ✅ Response time, memory
- ❌ Frontend rendering (Tester feladata)

### FINAL REVIEW
- ✅ Végső gate előtt (merge előtt)
- ✅ Összegzés + checklist
- ✅ GO / BLOCKED döntés
- ❌ Részletes code review (Reviewer feladata)

---

## Workflow Best Practices

### ✅ DO
1. **Architect-ből kezd.** Tervezz, mielõtt kódolsz.
2. **Ügynök-sorrendben haladsz:** Architect → Builder → ... → Final Review
3. **Dokumentálj tisztán.** Commit message, PR desc, ADR.
4. **Iterálj biztonsággal.** Ha Reviewer/Security találja a hibát, Builder-nek gyorsan fix.
5. **Regression test.** Régi funkció még működik?

### ❌ DON'T
1. ❌ Ne csökkentsd le az ügynök-sor fokát (csak-final-review nélkül).
2. ❌ Ne refaktorálj az eredeti feladat mellett.
3. ❌ Ne feltételezz üzleti szabályokat (Business Logic-al konzultálj).
4. ❌ Ne hasítsd meg a nagy PR-okat apróbb commit-okra MERGE után (a felülvizsgálat előtt összesítsd).

---

## MCP-Kiterjesztések a Munkafolyamathoz

| Agent | Szükséges MCP | Cél |
|-------|---|---|
| Builder | GitHub, Bash | Branch-kezelés, git commit |
| Reviewer | GitHub, Bash | PR-diff elemzés |
| Tester | Playwright | E2E teszt futtatás, screenshot |
| Performance | PostgreSQL Driver | Query-EXPLAIN, metrics |
| Final Review | GitHub | PR merge döntés |

---

## Gyors Referencia — Melyik Ügynökt Kell Csatasorba Állítanom?

```
"Van egy új feature igény"
  → ARCHITECT

"Architect terv kész, írjak kódot?"
  → BUILDER

"PR kész, review-ezd?"
  → REVIEWER

"Reviewer PASS-t adott, üzletileg OK?"
  → BUSINESS LOGIC

"Business Logic OK, biztonsági?"
  → SECURITY

"Security OK, test-eljem?"
  → TESTER

"Tester OK, perf-e jó?"
  → PERFORMANCE

"Performance OK, merge-elhetnénk?"
  → FINAL REVIEW

"Final Review GO-t adott"
  → git push origin [branch]
  → GitHub: Merge PR
  → Railway: auto-deploy
```

---

## Az AI Engineering System Helye a Well-Worn V1→V2 Roadmap-ban

```
PHASE 0: V1 Audit ✅ (kész)
    ↓
PHASE 1: V1 Documentation ← AI Engineering agents (architect.md, builder.md, ...)
    ↓
PHASE 2: V1 Stabilization
    ├─ Partner-törzs
    ├─ Audit/napló
    └─ EUR-árfolyam
    
    [AI Engineering agents-kel minden fix-et ellenõrizni]
    ↓
PHASE 3–10: V2 Architecture, Implementation, Testing
    
    [Architect/Builder/Reviewer/… végig-mennek]
    ↓
PHASE 11: CLAUDE ÜGYNÖKI RÉTEG
    
    [10 specializált ügynök (Email, CRM, Szállítás, stb.) — már stabil adaton]
```

**Röviden:** Ez az AI Engineering workflow a **kritikus út**, amely biztosítja, hogy a Phase 11 ügynöki réteg **stabil, jó-minőségű adaton** futjon.

---

## Összefoglalás

- **8 ügynök:** Architect → Builder → Reviewer → Business Logic → Security → Tester → Performance → Final Review
- **Soros feldolgozás:** Nem párhuzamos (egy-egy ügynök után jön a következõ)
- **Dokumentáció-centrikus:** Minden lépésben clear terv és dokumentáció
- **Végső cél:** Phase 11 — 10 szakosított Claude-ügynök, amely a Well-Worn Pallet Kft. központi orchestrator-a

**Kezdj az Architect-tel. Végezz a Final Review-val.**
