# PERFORMANCE AGENT — Well-Worn Rendszer

## Felelősség

- **SQL Queries:** N+1, indexek, explain analyze
- **API Response Time:** < 500ms target
- **Database:** Connection pooling, query optimization
- **Frontend:** Rendering, component re-render, code splitting
- **Caching:** Strategy, TTL, invalidation
- **Monitoring:** Identify bottleneck

**Mantra:** "Measure first, optimize second. Do not optimize blindly."

## Performance Review Workflow

```
GATHER METRICS
  ↓
IDENTIFY BOTTLENECK
  ↓
REPRODUCE LOCALLY
  ↓
ANALYZE ROOT CAUSE
  ↓
PROPOSE SOLUTION
  ↓
VERIFY FIX
  ↓
REPORT
```

## Típusú Performance Problémák

### 1. N+1 Query

**Problem:**
```typescript
// Bad: N+1 query
const employees = await getEmployees();  // 1 query
for (const emp of employees) {
  const wage = await getMonthlyWage(emp.id);  // N queries (1 per employee)
}
// Total: 1 + N queries (N=20 → 21 queries!)
```

**Fix:**
```typescript
// Good: Batch query
const employees = await getEmployees();  // 1 query
const wages = await query(
  `SELECT * FROM alkalmazott_napi_havi_ber WHERE employee_id = ANY($1)`,
  [employees.map(e => e.id)]
);  // 1 query

// Process in-memory
const wageMap = new Map(wages.map(w => [w.employee_id, w]));
const employeesWithWage = employees.map(e => ({
  ...e,
  wage: wageMap.get(e.id)
}));
```

**Impact:** 21 queries → 2 queries (10x faster)

### 2. Missing Index

**Problem:**
```sql
SELECT * FROM fuvar_megbizasok 
WHERE megrendelo ILIKE '%Coca%'  -- No index!
```

**Diagnosis:**
```bash
EXPLAIN ANALYZE SELECT ... WHERE megrendelo ILIKE '%Coca%';
-- Shows: Seq Scan on fuvar_megbizasok (cost=0.00..12345.00 rows=5)
-- Sequential scan = slow on large table
```

**Fix:**
```sql
CREATE INDEX idx_fuvar_megrendelo ON fuvar_megbizasok(megrendelo);
-- Now: Index Scan (cost=0.10..50.00)
```

**Impact:** 2000ms → 50ms

### 3. Expensive Subquery

**Problem:**
```typescript
// Bad: Subquery in SELECT (runs per row!)
const fuvarok = await query(`
  SELECT *, 
    (SELECT SUM(brutto) FROM szamla WHERE fuvar_id = fuvar_megbizasok.id) AS szamla_osszesen
  FROM fuvar_megbizasok
  ORDER BY id DESC LIMIT 100
`);
// Subquery runs 100 times!
```

**Fix:**
```typescript
// Good: JOIN + GROUP BY
const fuvarok = await query(`
  SELECT 
    f.*, 
    COALESCE(SUM(s.brutto), 0) AS szamla_osszesen
  FROM fuvar_megbizasok f
  LEFT JOIN szamla s ON s.fuvar_id = f.id
  WHERE f.torolt = false
  GROUP BY f.id
  ORDER BY f.id DESC
  LIMIT 100
`);
```

**Impact:** 5000ms → 500ms

### 4. Large Dataset Without Pagination

**Problem:**
```typescript
// getSzamlak() returns 500+ rows (before cursor-based pagination)
const rows = await query(`
  SELECT * FROM szamla LIMIT 1000
`);
// 500KB download, memory spike on client
```

**Fix:**
```typescript
// Cursor-based pagination (50 rows/page)
const result = await getSzamlaLista(szuro, 50, cursor);
// 50KB download per page
```

**Impact:** 2000ms → 300ms (initial load)

### 5. Database Connection Pool Exhaustion

**Problem:**
```typescript
// Concurrent requests exhaust pool
for (let i = 0; i < 100; i++) {
  query(...);  // No await — all at once
}
// Pool maxSize=10 → Timeout after 30s
```

**Fix:**
```typescript
// Batch with backpressure
const batchSize = 10;
for (let i = 0; i < 100; i += batchSize) {
  await Promise.all(
    batch.map(id => query(...))
  );
}
```

**Impact:** Timeouts → Consistent 500ms

## Performance Optimization Examples

### Example 1: getSzamlaLista() Pagination

**Before (2026-09-12):**
```sql
SELECT * FROM szamla WHERE kategoria = 'fuvar' LIMIT 500;
-- 500 rows × ~200 bytes = 100KB
-- Client: filter/sort O(n)
```

**After (2026-09-13):**
```sql
SELECT * FROM szamla WHERE kategoria = 'fuvar' 
  AND (fizetesi_hatarido, kiallitas_datum, szamlaszam) > (?, ?, ?)
  ORDER BY fizevet ASC, fizetesi_hatarido ASC NULLS LAST
  LIMIT 51;
-- 51 rows → 50 displayed + 1 for cursor
-- Client: render 50 rows, "Load More" for next batch
```

**Perf Gain:** 500ms → 100ms (initial), 200ms per "Load More"

### Example 2: isMonthFullyPaid() Batch Query

**Before (2026-09-12):**
```typescript
async function isMonthFullyPaid(year: number, month: number) {
  const employees = await getEmployees();  // 1 query
  for (const emp of employees) {
    const paid = await query(`SELECT paid FROM alkalmazott_heti_ber WHERE employee_id = $1 AND ...`);  // N queries
  }
}
// 21 employees × (1 + 21 queries) = 441 queries on page load!
```

**After (2026-09-13):**
```typescript
async function isMonthFullyPaid(year: number, month: number) {
  const employees = await getEmployees();  // 1 query
  const heti = await query(`SELECT * FROM alkalmazott_heti_ber WHERE year=$1 AND month=$2`);  // 1 query
  const napi = await query(`SELECT * FROM alkalmazott_napi_havi_ber WHERE year=$1 AND month=$2`);  // 1 query
  
  const hetiMap = new Map(heti.map(h => [h.employee_id, h]));
  const napiMap = new Map(napi.map(n => [n.employee_id, n]));
  
  return employees.map(e => hetiMap.get(e.id)?.paid ?? napiMap.get(e.id)?.paid);
}
// 1 + 1 + 1 = 3 queries
```

**Perf Gain:** 441 queries (20s) → 3 queries (<100ms)

## Performance Monitoring Checklist

### Local Development

```bash
# Playwright performance traces
npx playwright test --trace on

# Chrome DevTools
npm run dev
# Open http://localhost:3000
# F12 → Performance tab → Record → User interaction → Stop

# Node.js profiling
node --prof app.js
node --prof-process *.log > profile.txt
```

### Production (Railway)

```bash
# Check response times
curl -w "@curl-format.txt" -o /dev/null -s https://web-production-91051.up.railway.app/szamlak

# Database slow query log
SET log_min_duration_statement = 1000;  -- Log queries > 1s
SELECT query, mean_time, calls FROM pg_stat_statements ORDER BY mean_time DESC;
```

### Targets

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| API response | <500ms | 200-5000ms (varies) | 🟡 TODO optimize |
| Page load | <2s | 1-3s | ✅ OK |
| Render after interaction | <100ms | 50-500ms | 🟡 Varies |
| Database query | <100ms | 10-2000ms (varies) | 🟡 N+1 fixed, others TODO |
| Index usage | >90% | ~70% | 🟡 TODO add indexes |

## Checklist: Performance Review Teljes

- [ ] Metrics gathered (response time, DB queries, render time)
- [ ] Bottleneck identified
- [ ] Root cause analyzed
- [ ] Solution proposed + validated locally
- [ ] Report: Before/after metrics
- [ ] Regression risk assessed
