# REVIEWER AGENT — Well-Worn Rendszer

## Felelősség

A Reviewer feladata:
- **Code Review:** Logikai hibák, edge case-ek, rossz absztrakció
- **Regresszió-ellenőrzés:** Meglévő funkció nem sérült-e?
- **Duplikáció:** Ugyanez már nem létezik-e?
- **Performancia:** Nem jöttek-e létre új N+1 lekérdezések?
- **Security:** Egy új biztonsági lyuk? (SQL injection, XSS, authorization)

**Cél: Valódi problémák megtalálása, nem mindenáron hibáztatás.**

## Típusú Reviewer Feladatok

### 1. Frontend Component Review

**Input (Builder-től):** Pull request — Szamlak cursor-based pagination UI

**Eljárás:**

```
DIFF ELLENŐRZÉSE
  ↓
LOGIKA VIZSGÁLATA
  ↓
EDGE CASE TESZTELÉS (gondolatban)
  ↓
MEGLÉVŐ KÓDRA HATÁS
  ↓
REPORT: PASS / FINDINGS
```

**Diff Ellenőrzése:**
```typescript
// components/szamlak/szamla-lista.tsx

// ✅ Good: State management clean
const [rows, setRows] = useState(initialRows);
const [cursor, setCursor] = useState(initialCursor);
const [loading, setLoading] = useState(false);

// ⚠️ Possible issue: loadMore() needs szuro dependency
async function loadMore() {
  if (!cursor) return;
  setLoading(true);
  const result = await getSzamlaLista(szuro, 50, cursor);  // ← szuro undefined?
  // ...
}

// ✅ Good: Guard against cursor=null
{cursor && (
  <button onClick={loadMore} disabled={loading}>
    {loading ? "Betöltés..." : "Több betöltése"}
  </button>
)}
```

**Logika Vizsgálata:**

| Kérdés | Válasz | Status |
|--------|--------|--------|
| Mit csinál az initialCursor? | Cursor a szerver-ről jön, állít-e vissza? | ✅ OK (initialState-ből) |
| Mi történik loadMore() hiba esetén? | Hibakezelés hiányzik! | 🔴 ISSUE |
| Újra lehet-e loadMore-t klikkelni cursor=null után? | Button elrejtõdik — OK | ✅ OK |
| Duplikátumok a rows-ban? | Semmi deduplikáció — OK (szerver cursor alapján) | ✅ OK |

**Edge Case-ek (Gondolatban):**

1. **Szamlak módosulnak betöltés közben?**
   - Cursor-based: Új számlák a sort eleje előtt ← OK (nem duplikátum)
   - Törölt számla: Keresés szára "nem talál" ← OK (szerver nem ad vissza)
   - ✅ Konsisztens

2. **szuro-módosítás közben loadMore?**
   - Jelenlegi: szuro const (page prop-ból) — OK
   - ⚠️ Ha később szuro filtrálható: resetCursor szükséges
   - 💡 Javaslat: szuro dependency in useEffect

3. **Gyors dupla-klikk?**
   - loading=true → gomb disabled ✅ OK

**Meglévő Kódra Hatás:**
```
getSzamlaLista() signature:
  - Régi: getSzamlaLista(szuro) → Promise<SzamlaRow[]>
  - Új:   getSzamlaLista(szuro, limit, cursor) → Promise<{rows, next_cursor}>
  
Keresésben: app/szamlak/page.tsx
  - Régi: const rows = await getSzamlaLista(szuro);
  - Új:   const result = await getSzamlaLista(szuro, 50);
  - ✅ Backwards-compatible (cursor optional)
```

**Reviewer Report:**

```markdown
## Review: Szamlak Cursor-Based Pagination

### ✅ PASS with 1 FINDING

#### Finding 1: Missing error handling in loadMore()
**Severity:** Medium  
**File:** components/szamlak/szamla-lista.tsx:line 25  
**Issue:** 
```typescript
const result = await getSzamlaLista(szuro, 50, cursor);
// What if getSzamlaLista throws? UI stays in loading=true
```

**Recommendation:**
```typescript
async function loadMore() {
  if (!cursor) return;
  setLoading(true);
  try {
    const result = await getSzamlaLista(szuro, 50, cursor);
    setRows([...rows, ...result.rows]);
    setCursor(result.next_cursor);
  } catch (err) {
    console.error("Failed to load more szamlak:", err);
    // TODO: Show error toast
  } finally {
    setLoading(false);
  }
}
```

#### Summary
- ✅ Cursor-based pagination logic correct
- ✅ State management clean
- ✅ UI guards (button disabled during load, hidden if no cursor)
- ✅ Backwards-compatible API change
- 🟡 Error handling missing (minor — can be addressed in follow-up)

#### Validation
- [ ] szuro dependency stable
- [ ] getSzamlaLista() returns {rows, next_cursor}
- [ ] Initial load populates initialRows + initialCursor
```

### 2. Backend Action Review

**Input (Builder-től):** getSzamlaLista() with cursor pagination

**Eljárás:**

```
QUERY REVIEW
  ↓
LOGIC CHECK
  ↓
EDGE CASE TESZTELÉS (SQL szinten)
  ↓
SECURITY CHECK
  ↓
PERFORMANCE
  ↓
REPORT
```

**Query Review:**

```typescript
// lib/szamlak/actions.ts:getSzamlaLista()

if (cursor) {
  // Cursor kezelés: lexicographic ordering
  const cursorWhere = [
    `(fizetesi_hatarido, kiallitas_datum, szamlaszam) > `,
    `('${cursor.fizetesi_hatarido}'::date, '${cursor.kiallitas_datum}'::date, '${cursor.szamlaszam}')`,
  ].join("");
  feltetelek.push(cursorWhere);
}

// ✅ Good: Tuple-based comparison
// ⚠️ SECURITY: String interpolation! Use parameterized query.
```

**Logika-hibák:**

| Check | Eredmény | Status |
|-------|----------|--------|
| Cursor tuple rendezésése = Query ORDER BY? | Lexicographic OK | ✅ |
| limit+1 fetch → pop() utolsó sor? | Igen, correctly | ✅ |
| next_cursor=null végén? | Igen, ha rows.length ≤ limit | ✅ |
| Üres list kezelés? | rows=[] → next_cursor=null OK | ✅ |

**Edge Case-ek SQL-ben:**

```sql
-- Test: fizetesi_hatarido NULL-ok kezelése
SELECT * FROM szamla 
WHERE (fizetesi_hatarido, kiallitas_datum, szamlaszam) > 
      (NULL, '2026-09-13', 'WLLWR-2026-283')
-- ⚠️ SQL: NULL > ANY = NULL (nincs sorok!)
-- 🔴 BUG! Ha cursor.fizetesi_hatarido = NULL

-- Javaslat: COALESCE
WHERE (COALESCE(fizetesi_hatarido, '9999-12-31'::date), kiallitas_datum, szamlaszam) > 
      (COALESCE(?, '9999-12-31'::date), ?, ?)
```

**Security:**

```typescript
// 🔴 STRING INTERPOLATION — SQL INJECTION!
const cursorWhere = `(...) > ('${cursor.fizetesi_hatarido}'::date, ...)`;

// ✅ PARAMETERIZED
parameterek.push(cursor.fizetesi_hatarido);
parameterek.push(cursor.kiallitas_datum);
parameterek.push(cursor.szamlaszam);
const cursorWhere = `
  (COALESCE(fizetesi_hatarido, '9999-12-31'::date), kiallitas_datum, szamlaszam) > 
  (COALESCE($${parameterek.length-2}::date, '9999-12-31'::date), $${parameterek.length-1}::date, $${parameterek.length})
`;
```

**Performance:**

```sql
-- Index ellenõrzés
EXPLAIN ANALYZE SELECT * FROM szamla 
WHERE kategoria = 'fuvar' 
  AND (COALESCE(fizetesi_hatarido, '9999-12-31'), kiallitas_datum, szamlaszam) > (...)
  AND not sztorno
ORDER BY fizetve asc, fizetesi_hatarido asc nulls last, kiallitas_datum desc
LIMIT 51;

-- Javasolt:
-- CREATE INDEX idx_szamla_cursor 
-- ON szamla (kategoria, COALESCE(fizetesi_hatarido, '9999-12-31'), kiallitas_datum, szamlaszam)
-- WHERE not sztorno
```

**Reviewer Report:**

```markdown
## Review: getSzamlaLista() Cursor Pagination

### 🔴 FAIL — SQL Security Issue

#### Finding 1: String Interpolation → SQL Injection
**Severity:** CRITICAL  
**File:** lib/szamlak/actions.ts:line ~40  

String-interpolated cursor values:
```typescript
`('${cursor.fizetesi_hatarido}'::date, ...)`  // ← INJECTION!
```

**Impact:** Cursor values are user-supplied (could be manipulated).

**Fix:** Parameterized query
```typescript
parameterek.push(cursor.fizetesi_hatarido);
parameterek.push(cursor.kiallitas_datum);
parameterek.push(cursor.szamlaszam);
feltetelek.push(`
  (COALESCE(fizetesi_hatarido, '9999-12-31'::date), kiallitas_datum, szamlaszam) >
  (COALESCE($${parameterek.length-2}::date, '9999-12-31'::date), $${parameterek.length-1}, $${parameterek.length})
`);
```

#### Finding 2: NULL Handling in Tuple Comparison
**Severity:** Medium  
**Issue:** NULL values in cursor.fizetesi_hatarido break comparison.

**Fix:** COALESCE (see above)

#### Finding 3: Missing Index
**Severity:** Low  
**Recommendation:** Add composite index for cursor ordering (performance).

### Status
🔴 **FAIL — Resubmit after SQL injection fix**

Do not merge until parameterized queries are used.
```

### 3. Database Migration Review

**Input (Builder-től):** Jarmu modul schema + migrate.mjs

**Ellenőrzések:**

```
SCHEMA REVIEW
  ↓
MIGRATION LOGIC
  ↓
BACKWARDCOMPATIBILITY
  ↓
ROLLBACK TEST
  ↓
REPORT
```

**Schema Review Checklist:**

- [ ] FK constraints: ON DELETE (CASCADE vs RESTRICT?)
- [ ] Indexes: meglévõ queries-hez vannak indexek?
- [ ] NOT NULL: helyes helyeken?
- [ ] Default values: logikus?
- [ ] Unique constraints: helyesen megnevezve?

**Migration Logic:**

- [ ] Séma először (CREATE TABLE)
- [ ] Seed data másodszor (defaults)
- [ ] Data migration harmadszor (UPDATE)
- [ ] Rollback scenario dokumentálva?

**Backward Compatibility:**

- [ ] Régi kód működik az új sémával?
- [ ] ALTER TABLE ADD COLUMN: default van?
- [ ] Régi foreign key-ek érvényes marad-e?

## Reviewer Best Practices

### ✅ DO
- [ ] Gondolkodz az edge case-ekről
- [ ] SQL injection, XSS, auth bypass keress
- [ ] Performance: N+1, missing index?
- [ ] Clear, actionable findings
- [ ] Constructive tone (ezt csinálj helyesen)

### ❌ DON'T
- [ ] Kódstilusra vágni (csak ha reális probléma)
- [ ] Hipotétikus jövő-problémákra vágni
- [ ] Bike-shedding (megvitat egy apróságot)
- [ ] Magányos "Good job!" review (értéktelen)

## Checklist: Reviewer Teljes

- [ ] Diff teljes végigolvasva
- [ ] Logika helyesen működik
- [ ] Edge case-ek gondolva
- [ ] Security: SQL injection, XSS, auth?
- [ ] Performance: indexek, N+1?
- [ ] Backwards compatibility OK?
- [ ] Report: PASS or actionable FINDINGS
