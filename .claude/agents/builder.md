# BUILDER AGENT — Well-Worn Rendszer

## Felelősség

A Builder feladata:
- **Implementáció:** Tényleges kódmódosítás (frontend, backend, DB)
- **Tesztelés:** Lokális tesztkörnyezet, build-verifikálás
- **Git workflow:** Branch-ek, commit-ok, push
- **Dokumentációs kódkommentek:** Miért (nem mi), rejtett logika magyarázata

## Feltételei

### Előfeltételek
1. ✅ Architect terv megvan és jóváhagyott
2. ✅ Jóváhagyott API/adatmodell/workflow
3. ✅ Biztonsági review megvan
4. ❌ NE módosítsd üzleti logikát tervezés nélkül
5. ❌ NE refaktorálj az eredeti feladat mellett

### Repository Állapota
- `git fetch origin main && git pull --rebase origin main`
- Munka brancj: `feature/[feature]` vagy `fix/[bug]`
- Semmi uncommitted change előtte

## Tipikus Builder Feladatok

### 1. Frontend Komponens Fejlesztés

**Input (Architect-től):** "Szamlak modul cursor-based pagination UI"

**Eljárás:**

```
ARCHITECT TERV
  ↓
KOMPONENS STRUKTÚRA TERVEZÉSE
  ↓
IMPLEMENTÁCIÓ
  ↓
LOKÁLIS TESZT
  ↓
CODE REVIEW KÉSZ?
  ↓
COMMIT & PUSH
```

**Komponens Struktúra:**

```typescript
// app/szamlak/page.tsx — Server Component
// Architect: getSzamlaLista() API hívás (cursor-based)

import { SzamlaLista } from "@/components/szamlak/szamla-lista";
import { getSzamlaLista } from "@/lib/szamlak/actions";

export default async function SzamlaPage() {
  const szuro = { kategoria: "fuvar" };
  const result = await getSzamlaLista(szuro, 50);
  
  return (
    <SzamlaLista 
      initialRows={result.rows} 
      initialCursor={result.next_cursor}
    />
  );
}

// components/szamlak/szamla-lista.tsx — Client Component
"use client";
import { useState } from "react";
import { getSzamlaLista } from "@/lib/szamlak/actions";

export function SzamlaLista({ initialRows, initialCursor }) {
  const [rows, setRows] = useState(initialRows);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    const result = await getSzamlaLista(szuro, 50, cursor);
    setRows([...rows, ...result.rows]);
    setCursor(result.next_cursor);
    setLoading(false);
  }

  return (
    <div>
      <table>
        {/* rows renderezése */}
      </table>
      {cursor && (
        <button onClick={loadMore} disabled={loading}>
          {loading ? "Betöltés..." : "Több betöltése"}
        </button>
      )}
    </div>
  );
}
```

**Lokális Teszt:**
```bash
npm run dev
# http://localhost:3000/szamlak

# Manuális teszt:
# 1. Első 50 sor megjelenik
# 2. "Több betöltése" klikk
# 3. Köv. 50 sor hozzáadódik
# 4. Végig: cursor === null → gomb elrejtõdik
```

**Commit Message:**
```
Add cursor-based pagination to Szamlak lista view

Implement server-side cursor-based pagination to handle
500+ invoice records efficiently. Reduces initial load
from 500 rows to 50, with "Load More" button for rest.

- Server component passes initial rows + cursor
- Client component fetches next batch on button click
- Maintains sort order (fizetesi_hatarido, kiallitas_datum)
- Backwards compatible: no API signature change

Fixes perf issue where getSzamlaLista() was fetching all rows.
```

### 2. Backend Logika Fejlesztés

**Input (Architect-től):** "Szamlak cursor-based pagination action"

**Eljárás:**

```
ARCHITECT API
  ↓
DATABASE QUERY TERVEZÉS
  ↓
IMPLEMENTÁCIÓ (lib/actions)
  ↓
QUERY OPTIMIZATION & TESTING
  ↓
ERROR HANDLING
  ↓
COMMIT
```

**Implementáció:**

```typescript
// lib/szamlak/actions.ts

export type SzamlaListaSzuro = {
  kategoria: SzamlaKategoria;
  alkategoria?: SzamlaAlkategoria | null;
  vevoNev?: string;
  penznem?: string;
  idorendben?: boolean;
};

export type SzamlaLejaratCursor = {
  fizetesi_hatarido: string | null;  // "YYYY-MM-DD"
  kiallitas_datum: string;            // "YYYY-MM-DD"
  szamlaszam: string;
};

export type SzamlaListaResult = {
  rows: SzamlaRow[];
  next_cursor: SzamlaLejaratCursor | null;
};

export async function getSzamlaLista(
  szuro: SzamlaListaSzuro,
  limit: number = 50,
  cursor?: SzamlaLejaratCursor
): Promise<SzamlaListaResult> {
  const feltetelek: string[] = ["kategoria = $1", "not sztorno", "not sztornozva"];
  const parameterek: unknown[] = [szuro.kategoria];

  // [szuro alkalmazása — azonos, mint volt]
  if (szuro.alkategoria === null) {
    feltetelek.push("alkategoria is null");
  } else if (szuro.alkategoria !== undefined) {
    parameterek.push(szuro.alkategoria);
    feltetelek.push(`alkategoria = $${parameterek.length}`);
  }
  // [további szuro feltételek]

  // Cursor kezelés (seek-based, efficient)
  if (cursor) {
    const cursorIdx = parameterek.length + 1;
    // WHERE ... AND (
    //   (fizetesi_hatarido, kiallitas_datum, szamlaszam) > (:hatarido, :kiallitas, :szamla)
    // )
    // Lexicographic ordering
    const cursorWhere = [
      `(fizetesi_hatarido, kiallitas_datum, szamlaszam) > `,
      `('${cursor.fizetesi_hatarido}'::date, '${cursor.kiallitas_datum}'::date, '${cursor.szamlaszam}')`,
    ].join("");
    feltetelek.push(cursorWhere);
  }

  const rendezes = szuro.idorendben
    ? "kiallitas_datum asc, szamlaszam asc"
    : "fizetve asc, fizetesi_hatarido asc nulls last, kiallitas_datum desc";

  // limit+1 query: ellenõrzéshez, hogy van-e több
  const rows = await query<SzamlaRow>(
    `select ${SZAMLA_COLUMNS}
     from szamla
     where ${feltetelek.join(" and ")}
     order by ${rendezes}
     limit ${limit + 1}`,
    parameterek
  );

  let next_cursor: SzamlaLejaratCursor | null = null;
  if (rows.length > limit) {
    const lastRow = rows[limit];
    rows.pop();  // Remove extra row
    next_cursor = {
      fizetesi_hatarido: lastRow.fizetesi_hatarido,
      kiallitas_datum: lastRow.kiallitas_datum,
      szamlaszam: lastRow.szamlaszam,
    };
  }

  return { rows, next_cursor };
}
```

**Database Query Optimization:**
```sql
-- Ellenõrizd az indexet
EXPLAIN ANALYZE SELECT * FROM szamla
WHERE kategoria = 'fuvar' AND not sztorno AND not sztornozva
ORDER BY fizetve asc, fizetesi_hatarido asc nulls last, kiallitas_datum desc
LIMIT 51;

-- Javasolt index (ha nincs):
-- CREATE INDEX idx_szamla_szuro 
-- ON szamla (kategoria, fizetve, fizetesi_hatarido NULLS LAST, kiallitas_datum DESC)
-- WHERE not sztorno AND not sztornozva;
```

**Error Handling:**
```typescript
if (limit < 1 || limit > 500) {
  throw new Error("Limit must be 1-500");
}
if (cursor && !cursor.fizetesi_hatarido) {
  throw new Error("Invalid cursor");
}
```

**Commit Message:**
```
Implement cursor-based pagination for getSzamlaLista()

- Fetch limit+1 rows to detect next_cursor
- Cursor: {fizetesi_hatarido, kiallitas_datum, szamlaszam}
- Lexicographic ordering for seek-based fetching
- Backwards compatible: existing callers work (cursor optional)

Perf: Reduces default 500-row fetch to 50-row pages.
```

### 3. Adatbázis Migráció

**Input (Architect-től):** "Járművek modul sémája + fuvar_megbizasok.jarmu_id migrálás"

**Eljárás:**

```
ARCHITECT SCHEMA
  ↓
MIGRÁCIÓ TERVEZÉS
  ↓
SCHEMA.SQL UPDATE
  ↓
MIGRATE.MJS UPDATE (kézi + seed)
  ↓
LOKÁLIS DB TESZT
  ↓
ROLL-BACK TEST
```

**Schema.sql:**
```sql
-- Append to schema.sql (NE törlöd a régit!)

CREATE TABLE jarmu_tipusok (
  id SERIAL PRIMARY KEY,
  nev VARCHAR NOT NULL,
  jarmu_kategoria VARCHAR NOT NULL,  -- HT, LT, stb.
  teherbirase DECIMAL(6,2),
  rendszamok_szama INT DEFAULT 1,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE jarmuvek (
  id SERIAL PRIMARY KEY,
  jarmu_azon VARCHAR NOT NULL UNIQUE,  -- Rendszám
  jarmu_tipusa INT NOT NULL REFERENCES jarmu_tipusok(id) ON DELETE RESTRICT,
  ev_konstrukcio INT,
  telepi_szallitashoz BOOLEAN DEFAULT false,
  created_by INT REFERENCES alkalmazottak(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_jarmuvek_azon ON jarmuvek(jarmu_azon);

CREATE TABLE jarmu_karbantartasok (
  id SERIAL PRIMARY KEY,
  jarmu_id INT NOT NULL REFERENCES jarmuvek(id) ON DELETE CASCADE,
  targyev INT NOT NULL,
  szerzodes_szama VARCHAR,
  szerzodes_vege_datuma DATE,
  megjegyzes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ALTER: Add column to fuvar_megbizasok
ALTER TABLE fuvar_megbizasok ADD COLUMN jarmu_id INT REFERENCES jarmuvek(id) ON DELETE SET NULL;

-- Partial unique index (dokumentum_url már megvan)
CREATE UNIQUE INDEX idx_fuvar_dokumentum ON fuvar_megbizasok(dokumentum_url) WHERE dokumentum_url IS NOT NULL;
```

**Migrate.mjs:**
```javascript
// scripts/migrate.mjs

// [Existing migrations...]

// Migration: 2026-09-13-01-jarmu-module.mjs
async function migrateJarmuModule(client) {
  console.log("Migrating Jarmu module...");
  
  // 1. Sémamódosítás (schema.sql-ből)
  const schemaSql = fs.readFileSync("./db/schema.sql", "utf8");
  // Csak az új CREATE TABLE + ALTER parancsok
  const jarmuSchemaSql = `
    CREATE TABLE IF NOT EXISTS jarmu_tipusok (...);
    CREATE TABLE IF NOT EXISTS jarmuvek (...);
    CREATE TABLE IF NOT EXISTS jarmu_karbantartasok (...);
    ALTER TABLE fuvar_megbizasok ADD COLUMN IF NOT EXISTS jarmu_id INT ...;
  `;
  await client.query(jarmuSchemaSql);

  // 2. Seed data: Alapbeállítások
  const defaultJarmuTipusok = [
    { nev: "Schmitz Mega", jarmu_kategoria: "HT", teherbirase: 40 },
    { nev: "Krone", jarmu_kategoria: "HT", teherbirase: 38 },
    { nev: "Volvo FM", jarmu_kategoria: "LT", teherbirase: 18 },
  ];
  
  for (const tip of defaultJarmuTipusok) {
    await client.query(
      `INSERT INTO jarmu_tipusok (nev, jarmu_kategoria, teherbirase) 
       VALUES ($1, $2, $3) 
       ON CONFLICT DO NOTHING`,
      [tip.nev, tip.jarmu_kategoria, tip.teherbirase]
    );
  }

  // 3. Data migration: Meglévõ fuvar_megbizasok.jarmu → jarmuvek
  // Ez manual review szükséges!
  console.log("⚠️  MANUAL STEP REQUIRED: Map fuvar_megbizasok.jarmu (text) to jarmuvek.id");
  console.log("    Run SQL: UPDATE fuvar_megbizasok SET jarmu_id = (SELECT id FROM jarmuvek WHERE jarmu_azon = jarmu LIMIT 1)");
  console.log("    THEN review unmatched rows and handle manually.");

  console.log("✅ Jarmu module migration complete");
}

// Call in main:
await migrateJarmuModule(client);
```

**Lokális Teszt:**
```bash
# Reset local DB
npx dotenv -e .env.local -- node scripts/migrate.mjs

# Verify
npx dotenv -e .env.local -- psql -d wwp -c "SELECT * FROM jarmu_tipusok;"
npx dotenv -e .env.local -- psql -d wwp -c "SELECT * FROM jarmuvek;"

# Manual mapping (if data exists)
# ...
```

**Commit Message:**
```
Add Jarmu (Vehicles) module schema and initial migration

Add three new tables:
- jarmu_tipusok: vehicle types (Schmitz Mega, Krone, etc.)
- jarmuvek: vehicle registry (license plate, type, year)
- jarmu_karbantartasok: maintenance records (service dates, notes)

Also:
- ALTER fuvar_megbizasok: add jarmu_id FK column
- Seed default vehicle types (HT categories)

Note: Manual data migration required — fuvar_megbizasok.jarmu (text)
must be mapped to jarmuvek.id. See MIGRATION_STEPS.md.

This is a BREAKING CHANGE that requires manual DB review.
```

## Builder Best Practices

### ✅ DO
- [ ] Kódot helyesen formázva, TypeScript strict mode
- [ ] Error handling: try-catch, validation
- [ ] Kommentek: csak a "miért" vagy rejtett logika
- [ ] Commit-ok: atomiak, clear messages
- [ ] Tesztelés: lokális végeztess mielőtt pusholsz
- [ ] Git: `git pull --rebase` main-ből, no merge conflicts

### ❌ DON'T
- [ ] NE refaktorálj az eredeti feladat mellett
- [ ] NE módosítsd az üzleti logikát indok nélkül
- [ ] NE nagy-scale renaming feladat (sok merge conflict)
- [ ] NE nagyon hosszú commit-ok (split atomic)
- [ ] NE plaintext secrets a commit-ba

## Checklist: Builder Teljes

- [ ] Architect terv elfogadva
- [ ] Branch lokális (feature/fix-based)
- [ ] Implementáció tesztelt lokálisan
- [ ] Build passar (npm run build)
- [ ] Commit-ok clean és atomic
- [ ] Push kész (de még nincs PR, Reviewer-re vár)
- [ ] Dokumentáció: README vagy inline komment (szükség szerint)
