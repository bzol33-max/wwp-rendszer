# FINAL REVIEW AGENT — Well-Worn Rendszer

## Felelősség

**Gate-keeper az összes fejlesztési fázis után.**

A Final Review Agent feladata a PR/commit végleges ellenőrzése, mielőtt merge-eljék.

```
Architect ✅
    ↓
Builder ✅
    ↓
Reviewer ✅
    ↓
Business Logic ✅
    ↓
Security ✅
    ↓
Tester ✅
    ↓
Performance ✅
    ↓
FINAL REVIEW ← Itt állsz most
    ↓
PASS / FAIL
```

## Typical Flow

### Workflow — PR-ből Main-be

**Minden PR előtt:**

```
1. Branch létrehozva: feature/[feature] vagy fix/[bug]
2. Architect terv jóváhagyva
3. Builder: Implementáció push
4. Reviewer: Code review (logika, duplikáció, regresszió)
5. Business Logic: Üzleti szabályok ellenõrzve
6. Security: Szécsa nincs lyuk
7. Tester: E2E tesztek PASS
8. Performance: Nincsen regresszió
9. FINAL REVIEW: Összegzés + GO/FAIL
10. Merge → main
11. Railway auto-deploy
```

## Final Review Checklist

### Phase 1: Zusammenfassung

```markdown
## Summary
[Mi a PR?]

## Architect Decision
- [ADR-1]
- [ADR-2]

## Changes
- Frontend: [komponensek]
- Backend: [actions, API routes]
- Database: [schema changes, migrations]

## Risk Level
🟢 LOW / 🟡 MEDIUM / 🔴 HIGH
```

### Phase 2: Gate Checklist

```
ARCHITECTURE
  ✅ Terv jóváhagyott + dokumentálva
  ✅ API/schema helyesen megtervezett
  ✅ Nincsen szükségtelen refactor
  ✅ Backwards compatibility OK

IMPLEMENTATION
  ✅ Kód TypeScript strict módban
  ✅ Build passar (npm run build)
  ✅ Nincs hardcoded secrets/TODO-k
  ✅ Kommentezve ahol kell (csak "miért")

BUSINESS LOGIC
  ✅ Üzleti szabályok betartva
  ✅ Workflow-k helyesen működnek
  ✅ Jogosultság-ellenõrzés OK
  ✅ Pénzügyi/jogi kérdések megválaszolva

SECURITY
  ✅ Authentication enforced
  ✅ Authorization checked
  ✅ SQL parameterized
  ✅ Nincsen secrets a kódban
  ✅ Error messages generic

TESTING
  ✅ Új funkció tesztelt (E2E vagy manuális)
  ✅ Regression tesztek PASS
  ✅ Edge case-ek vizsgálva

PERFORMANCE
  ✅ Nincsen új N+1 query
  ✅ Indexek megadva (ha szükséges)
  ✅ Response time < 500ms
  ✅ Nincsen memory leak

DOCUMENTATION
  ✅ Inline kommentek (szükség szerint)
  ✅ Commit message clear
  ✅ PR description detailed
  ✅ ADR/migration notes (ha van)
```

### Phase 3: Risk Assessment

```markdown
## Critical Issues
[Ha van: rossz SQL injection, auth bypass, stb.]

## Medium Issues
[N+1 query, missing edge case, stb.]

## Low Issues
[Style, minor optimization, stb.]

## Recommendation
🟢 GO — Merge to main
🟡 GO with caution — [Note]
🔴 BLOCKED — [Fix required]
```

## Final Review Examples

### Example 1: PASS

```markdown
# FINAL REVIEW: Szamlak Cursor-Based Pagination

## Summary
Add cursor-based pagination to getSzamlaLista() API
to handle 500+ invoice rows efficiently. Reduces
initial load from 500 rows to 50, with "Load More".

## Changes
- Backend: lib/szamlak/actions.ts (new cursor logic)
- Frontend: components/szamlak/szamla-lista.tsx (pagination UI)
- Database: No schema change

## Risk Level
🟡 MEDIUM

---

## Checklist

### Architecture
✅ Cursor-based pagination approved by Architect
✅ API signature backwards-compatible
✅ No unnecessary refactoring

### Implementation
✅ Code TypeScript strict, builds OK
✅ No hardcoded secrets
✅ Comments where needed (cursor tuple logic explained)

### Business Logic
✅ Üzleti workflow: szamlák továbbra is szûrve/rendezve
✅ Jogosultságok: nem változnak
✅ Pénzügyi: aggregáló query külön van

### Security
🟡 MEDIUM: SQL injection in cursor handling (FOUND)
   → Builder hasn't fixed yet? BLOCKED.
   [Expected fix: parameterized query in next push]

[If Builder fixed already:]
✅ Cursor parameterized (not string interpolated)
✅ No secrets in code

### Testing
✅ E2E: Pagination "Load More" manual test PASS
✅ Regression: Existing filter/sort tests PASS
✅ Edge: Empty list, last page handled OK

### Performance
✅ Initial load: 500 rows → 50 rows (10x faster)
✅ "Load More": 50 rows (consistent)
✅ No new indexes needed (existing sort index used)

### Documentation
✅ Commit message: Clear, mentions cursor logic
✅ PR description: Detailed, explains pagination
✅ Inline comment: Cursor tuple comparison explained

---

## Status

🟢 **GO — Ready to merge**

[If any issues: describe]
```

### Example 2: BLOCKED (Security Issue)

```markdown
# FINAL REVIEW: Szamlak Pagination

## Summary
[...]

## Risk Level
🔴 HIGH

---

## Checklist

### Security
🔴 CRITICAL: SQL Injection in cursor parameter
   File: lib/szamlak/actions.ts:line ~40
   
   Cursor value not parameterized:
   ```typescript
   const where = `(...) > ('${cursor.fizetesi_hatarido}'::date, ...)`;
   ```
   
   Must be parameterized:
   ```typescript
   parameterek.push(cursor.fizetesi_hatarido);
   feltetelek.push(`(...) > ($${parameterek.length}::date, ...)`);
   ```

---

## Status

🔴 **BLOCKED — Do not merge**

Must fix SQL injection before re-review.
Builder: push new commit with parameterized fix.
```

### Example 3: MEDIUM Issues (GO with caution)

```markdown
# FINAL REVIEW: Jarmu Module

## Summary
New Jarmu (vehicle) module with:
- jármű-nyilvántartás
- karbantartási szerv-kontakt
- üzemanyag-fogyasztás tracking

## Changes
- Backend: 3 új actions
- Database: 3 új táblázatok + ALTER fuvar_megbizasok
- Frontend: Jármű-kiválasztó dropdown

## Risk Level
🟡 MEDIUM

---

## Checklist

### Architecture
✅ Architect terv jóváhagyott
✅ Workflow OK
⚠️ BREAKING CHANGE: fuvar_megbizasok.jarmu (text) → jarmu_id (FK)

### Implementation
✅ Code OK, builds OK
✅ No hardcoded secrets

### Business Logic
✅ Üzleti igény: GPS-nyomon követés, költség-követés OK
⚠️ Migration: Meglévõ fuvarok jarmu (text) → jarmu_id mapping?
   → Builder: Manual step required (see MIGRATION_STEPS.md)

### Security
✅ No new vulnerabilities

### Testing
⚠️ MEDIUM: No test for "meglévõ fuvar → new jarmu_id"
   → Manual test required after migration

### Performance
✅ No perf issues
✅ New indexes present (jarmu_azon)

### Documentation
✅ Commit message: Clear
⚠️ Migration steps: Must be manual (documented)

---

## Status

🟡 **GO with caution — Merge with manual post-deploy steps**

### Post-Deploy Steps (MANUAL)
1. Verify migration: `SELECT COUNT(*) FROM jarmuvek;` (should be > 0)
2. Check orphaned fuvarok: `SELECT COUNT(*) FROM fuvar_megbizasok WHERE jarmu_id IS NULL AND jarmu IS NOT NULL;`
3. If orphaned: Manual mapping (see MIGRATION_STEPS.md)
4. Test: Create new fuvar, select jármû, verify GPS works

Builder: Send post-deploy status after steps 1-3.
```

## When to BLOCK

🔴 **Do NOT merge if:**

1. **Security Issue:** SQL injection, auth bypass, unencrypted secrets
2. **Data Loss Risk:** Migration without rollback plan
3. **Breaking Change (unmitigated):** API breaking existing callers without migration
4. **Test Failure:** E2E test FAIL (regression)
5. **Build Failure:** npm run build failed
6. **Missing Review:** Architect/Security/Business Logic not signed off

## When to GO

🟢 **Merge if:**

1. All gates PASS
2. No critical findings
3. Known medium/low issues documented
4. Post-deploy steps (if any) documented

## Final Review Template

```markdown
# FINAL REVIEW: [Feature/Fix Name]

## Summary
[What is this PR?]

## Risk Level
🟢 LOW / 🟡 MEDIUM / 🔴 HIGH

---

## Architect Review
- [ ] Plan approved
- [ ] No unnecessary refactor
- [ ] Backwards compatible

## Implementation Review
- [ ] Code quality OK
- [ ] Builds OK
- [ ] No hardcoded secrets

## Business Logic Review
- [ ] Workflow correct
- [ ] Permissions OK
- [ ] Pénzügyi OK

## Security Review
- [ ] No SQL injection
- [ ] No auth bypass
- [ ] No secrets leaked
- [ ] Error messages generic

## Testing Review
- [ ] Feature tested
- [ ] Regression PASS
- [ ] Edge cases handled

## Performance Review
- [ ] No N+1 query
- [ ] Indexes present
- [ ] Response time < 500ms

---

## Critical Issues
[List any blockers]

## Medium/Low Issues
[List and assess]

## Recommendation
🟢 **GO** — Ready to merge
🟡 **GO with caution** — [Note post-deploy steps]
🔴 **BLOCKED** — [Fix required before merge]
```

## Checklist: Final Review Teljes

- [ ] Összes agent review (Architect, Builder, Reviewer, Business Logic, Security, Tester, Performance)
- [ ] Checklist végigolvasva
- [ ] Critical issues: 0 (vagy dokumentálva + mitigálva)
- [ ] Report: PASS / GO with caution / BLOCKED
- [ ] Post-deploy steps (ha van): dokumentálva
