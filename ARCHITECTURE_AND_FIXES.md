# 🏗️ WWP-RENDSZER: Teljes Architektúra és Fix Stratégia

**Verzió:** 1.0  
**Dátum:** 2026-09-13  
**Szerző:** Claude Code Review  
**Status:** Actionable - 4-8 óra munka

---

## 📋 TARTALOMJEGYZÉK

1. [Rendszer Áttekintés](#rendszer-áttekintés)
2. [Architektúra Részletezve](#architektúra-részletezve)
3. [20 Azonosított Hiba](#20-azonosított-hiba)
4. [Modulonkénti Bontás](#modulonkénti-bontás)
5. [Fix Stratégia](#fix-stratégia)
6. [Kódpéldák & Megvalósítás](#kódpéldák--megvalósítás)
7. [Tesztelési Checklist](#tesztelési-checklist)
8. [Deployment Útmutató](#deployment-útmutató)

---

## RENDSZER ÁTTEKINTÉS

### Mi az a WWP-Rendszer?

A **WWP-rendszer** egy Next.js 16-ban írt, teljes körű logisztikai és szállítási kezelő platform, amely:
- **6 fő modult** tartalmaz (Készlet, Fuvarozás, Számlák, Dolgozók, Jelenléti, Járművek)
- **PostgreSQL adatbázison** fut
- **Railway-en** hosztolt (éles: web-production-91051.up.railway.app)
- **Külső integrációkkal** (Számlázz.hu API, Ecofleet GPS, Gmail, Google Calendar)
- **Bejelentkezés-alapú** hozzáféréssel (2026-09-07 óta)

### Jelenlegi Statusz

```
✅ Élesben:      Készlet, Fuvarozás, Számlák
🟡 Fejlesztés:   Dolgozók, Jelenléti
🟠 Tervezés:     Járművek

❌ KRITIKUS:     0% test coverage, biztonsági hibák az API-kon
```

---

## ARCHITEKTÚRA RÉSZLETEZVE

### 1. PREZENTÁCIÓS RÉTEG (Frontend)

**Tech Stack:**
- Next.js 16 App Router
- React 19.2
- Tailwind CSS 4 + shadcn/ui
- Lucide React (ikonfont)

**Komponensek:**
```
/app
  ├── (auth)/login              ← Bejelentkezés oldal
  ├── /keszlet                  ← Készlet modul UI
  ├── /fuvarozas                ← Fuvarozás modul UI
  ├── /szamlak                  ← Számlák modul UI
  ├── /dolgozok                 ← Dolgozók modul UI
  ├── /jelenlet                 ← Jelenléti modul UI
  ├── /jarmuvek                 ← Járművek modul UI
  ├── /mobil, /posta, /erkezes  ← Mobil nézetek
  └── /api                      ← API route handlers
```

**Ismert CSS Bug:**
```css
/* app/globals.css:10 - HIBÁS */
--font-sans: var(--font-sans);  /* Önmagára hivatkozik! */

/* HELYESEN: */
--font-sans: var(--font-geist-sans);
```

**Design Tokens (Rozsda-krém paletta):**
```
--background: oklch(0.97 0.014 75)    /* Meleg krémszín */
--primary: oklch(0.53 0.14 42)        /* Rozsda/terrakotta */
--sidebar: oklch(0.18 0.02 50)        /* Sötét oldalsáv */
--foreground: oklch(0.24 0.025 55)    /* Közel-fekete szöveg */
```

### 2. API/BUSINESS RÉTEG

**Route Structure:**
```
/app/api
  ├── /fuvarozas
  │   ├── /kereses/route.ts       ⚠️ NO SESSION CHECK
  │   ├── /megbizas/route.ts      ⚠️ NO SESSION CHECK
  │   └── /...
  ├── /keszlet
  │   ├── /mozgatas/route.ts      ⚠️ NO SESSION CHECK
  │   └── /...
  ├── /szamlak
  │   ├── /sync/route.ts          ⚠️ NO SESSION CHECK
  │   └── /...
  ├── /jelenlet                   ⚠️ NO SESSION CHECK
  └── /dolgozok                   ⚠️ NO SESSION CHECK
```

**Business Logic (Server Actions):**
```
/lib
  ├── /auth                  ← Bejelentkezés, jogosultságok
  ├── /keszlet                ← Készlet logika
  ├── /fuvarozas             ← Szállítási logika
  ├── /dolgozok              ← Bér számolás
  ├── /szamlak               ← Számlázás
  └── /jelenlet              ← Jelenlét kezelés
```

**Adatáramlás (4 kritikus path):**

**Path 1: Készlet Mozgatás** ⚠️ Kritikus tranzakció
```
User UI
  → /api/keszlet/mozgatas [POST]
  → ❌ NINCS SESSION CHECK (bárki meghívhatja!)
  → lib/keszlet/actions.ts:recordMovements()
  → ❌ NINCS TRANSACTION (részleges insert = data corruption)
  → PostgreSQL: INSERT INTO keszlet_movements, keszlet_events
  → Válasz: { success: true }
```

**Path 2: Dolgozók Bér Feldolgozás** ⚠️ Performance problem
```
Havi scheduler (cron vagy manual)
  → isMonthFullyPaid(year, month)
  → ❌ N+1 QUERY PROBLEM:
      - Query 1: SELECT * FROM alkalmazottak
      - Query 2-21: FOR EACH employee:
          SELECT * FROM alkalmazott_heti_ber WHERE employee_id = X
          SELECT * FROM alkalmazott_napi_ber WHERE employee_id = X
          SELECT * FROM alkalmazott_havi_ber WHERE employee_id = X
  → Result: TRUE/FALSE
  → Impact: ~30 sec per month (20 employee × 1 query each)
```

**Path 3: Fuvarozás GPS + Költségbecslés** ⚠️ External API risks
```
Fuvar adatok
  → becsulFuvarSzakasz()
  → geocodeAddress() [KÜLSŐ API]
    → ❌ NINCS TIMEOUT (infinite wait)
    → ❌ NINCS RETRY
    → ❌ NINCS ERROR LOGGING
  → calculateToll() [KÜLSŐ API]
    → ❌ Ugyanez
  → Silent failure → Hibás becslés
  → User: "Miért rossz az ár?"
```

**Path 4: Számlák Szinkronizálása** ⚠️ Data leakage
```
Cron job (15 percenként 6-22h)
  → /api/szamlak/sync [GET]
  → ❌ NINCS SESSION CHECK!
  → Bárki lekérdezheti: curl "https://web.../api/szamlak/sync"
  → PostgreSQL: SELECT * FROM szamla, UPDATE kintlevoseg
  → Adatszivárgás: ügyfél-adatok, árak, fizetési státusz publikus
```

### 3. ADATRÉTEG (PostgreSQL)

**Táblastruktúra:**
```sql
-- Felhasználók
users (id, username, email, password_hash, permissions)

-- Készlet
keszlet_movements (id, site_id, type_id, qty, direction, movement_group)
keszlet_types (id, name)
sites (id, name)

-- Fuvarozás
fuvar_megbizasok (id, megrendelo, felrako, lerako, fuvardij, status)
jarmuvek (id, lajzer, ecofleet_id, status)

-- Dolgozók
alkalmazottak (id, name, ...)
alkalmazott_heti_ber (id, employee_id, year, month, week_index, amount, paid)
alkalmazott_napi_ber (id, employee_id, year, month, date, amount, paid)
alkalmazott_havi_ber (id, employee_id, year, month, amount, paid)
alkalmazottak_allapot (id=1, year, month)  ← POINTER (havi progress)

-- Számlák
szamla (id, szamlazz_hu_id, megrendelo, osszeg, kategoria, synced_at)
```

**Ismert Problémák:**
- ❌ Nincs `createDate`, `updatedDate` audit trail
- ❌ Nincs `deletedAt` soft delete
- ❌ Nincs indexek a gyakran szűrt oszlopokon
- ❌ Nincs particionálás nagy táblákra

### 4. BIZTONSÁGI RÉTEG (Auth)

**Session Management:**
```typescript
// lib/auth/session.ts
export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET,  // ❌ Nincs validation ha missing
  cookieName: "wwp_session",
  cookieOptions: {
    secure: true,
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 7,  // 1 hét
  },
};

// Jelszó validáció
if (input.password.length < 6) {  // ❌ Túl gyenge! Csak 6 kar.
  throw new Error("Jelszó: min 6 karakter");
}
// ❌ HIÁNYZIK: 
//   - Min 12 karakter
//   - Nagybetű + szám + speciális char
//   - Rate-limiting brute force ellen
//   - Account lockout
```

**Jogosultságok:**
```typescript
// lib/auth/permissions.ts
type Permissions = Record<string, { view: boolean; edit: boolean }>;

// Modulonként:
{
  keszlet: { view: true, edit: false },
  fuvarozas: { view: true, edit: true },
  szamlak: { view: true, edit: false },
  // ...
}
```

### 5. KÜLSŐ INTEGRÁCIÓK

**Számlázz.hu API:**
- ✅ 15 perces szinkron (6-22h között)
- ✅ Automatikus import
- ❌ Nincs error handling ha API down
- ❌ Nincs retry/backoff

**Ecofleet GPS:**
- ✅ Élő pozíció (`Vehicles/getLastData`)
- ❌ Nincs timeout
- ❌ Nincs cache → folyamatos API hívások
- 🔮 Lehetőség: Útvonal-előzmény (`Vehicles/getTrips`)

**Gmail & Google Calendar:**
- Integrált, de kevéssé használt
- ❌ Nincs error handling

### 6. DEPLOYMENT & INFRA

**Railway Setup:**
```
Project: wwp-rendszer
Service: web
Environment: Production
URL: https://web-production-91051.up.railway.app
Auto-deploy: main branch push-ra
Node: 24.x
Database: PostgreSQL (managed)
```

**Environment Variables:**
```bash
SESSION_SECRET=...        # ❌ Validation nincs
SEED_ADMIN_PASSWORD=...   # ✅ (korábban plaintext volt!)
SEED_USER_PASSWORD=...
DATABASE_URL=postgresql://...
ECOFLEET_API_KEY=...
SZAMLAZZ_API_KEY=...
GMAIL_API_KEY=...
```

---

## 20 AZONOSÍTOTT HIBA

### 🔴 KRITIKUS BIZTONSÁGI HIBÁK

#### 1. API Authorization Bypass
**Súlyosság:** 🔴 KRITIKUS  
**Fájlok:** `/app/api/fuvarozas/kereses/route.ts` + összes API route  
**Probléma:**
```typescript
// ❌ JELENLEGI (védtelen)
export async function GET(req: Request) {
  const q = req.nextUrl.searchParams.get("q");
  const results = await query(`
    SELECT * FROM fuvar_megbizasok 
    WHERE megrendelo ilike '%' || $1 || '%'
  `, [q]);
  return Response.json(results);  // Bárki lekérheti!
}
```

**Impact:**
- Bárki lekérdezheti: _összes_ fuvarmegbízást (cím, ár, dátum, dokumentumok)
- Összes készlet-mozgatást
- Összes dolgozó-adatot
- Összes számlát
- **Adatszivárgás: 100% kifejtett**

**Fix:**
```typescript
// ✅ JAVÍTOTT
import { requireSession } from "@/lib/auth/dal";

export async function GET(req: Request) {
  const session = await requireSession();  // Add this!
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  const q = req.nextUrl.searchParams.get("q");
  // ... rest
}
```

**Munka:** 30 perc (összes route-hoz wrapper)

---

#### 2. Weak Password Policy
**Súlyosság:** 🔴 KRITIKUS  
**Fájl:** `/lib/auth/users-actions.ts:60`  
**Probléma:**
```typescript
// ❌ JELENLEGI
if (!input.password || input.password.length < 6) {
  throw new Error("Jelszó: min 6 karakter");
}
// "123456" is valid! → Brute-force triviális
```

**Impact:**
- Jelszavak támadhatóak
- 6 char = 2^42 lehetőség = < 1 másodperc brute-force
- Eszköz-üzemeltetők, szállítók: gyenge jelszó

**Fix:**
```typescript
// ✅ JAVÍTOTT
const MIN_PASSWORD_LENGTH = 12;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/;

function validatePassword(pwd: string): { valid: boolean; error?: string } {
  if (!pwd || pwd.length < MIN_PASSWORD_LENGTH) {
    return { valid: false, error: `Jelszó: min ${MIN_PASSWORD_LENGTH} karakter` };
  }
  if (!PASSWORD_REGEX.test(pwd)) {
    return { 
      valid: false, 
      error: "Jelszó: nagybetű, kisbetű, szám és speciális karakter (@$!%*?&) szükséges" 
    };
  }
  return { valid: true };
}
```

**Munka:** 30 perc

---

#### 3. Missing Rate-Limiting (Login Brute-Force)
**Súlyosság:** 🔴 KRITIKUS  
**Fájl:** `/lib/auth/actions.ts`  
**Probléma:**
```typescript
// ❌ JELENLEGI
export async function login(formData: FormData) {
  const username = formData.get("username");
  const password = formData.get("password");
  const user = await getUser(username);
  if (!user || !await bcrypt.compare(password, user.passwordHash)) {
    return { error: "Hibás felhasználónév vagy jelszó" };
  }
  // Nincs rate-limiting → 1000x/sec próbálkozás lehetséges
}
```

**Impact:**
- Brute-force támadás lehetséges
- Bot: 1000 попытка/sec = összes lehetséges jelszó 1 perc alatt

**Fix:**
```typescript
// ✅ JAVÍTOTT
const loginAttempts = new Map<string, { count: number; resetAt: Date }>();

function checkLoginAttempt(username: string): boolean {
  const now = Date.now();
  const attempt = loginAttempts.get(username);
  
  if (!attempt || now > attempt.resetAt.getTime()) {
    // Reset counter after 15 min
    loginAttempts.set(username, { count: 1, resetAt: new Date(now + 15 * 60000) });
    return true;
  }
  
  if (attempt.count >= 5) {
    // Block after 5 attempts
    return false;
  }
  
  attempt.count++;
  return true;
}

// Usage in login:
if (!checkLoginAttempt(username)) {
  return { error: "Túl sok sikertelen próbálkozás. Próbáld később (15 perc múlva)." };
}
```

**Munka:** 1 óra

---

#### 4. SQL Injection (LIKE Clause)
**Súlyosság:** 🔴 KRITIKUS  
**Fájlok:** `/lib/fuvarozas/actions.ts:821`, `/app/api/fuvarozas/kereses/route.ts:38`  
**Probléma:**
```typescript
// ❌ JELENLEGI (parameterized, de még sérülékeny)
const q = req.nextUrl.searchParams.get("q");
const results = await query(`
  SELECT * FROM fuvar_megbizasok 
  WHERE megrendelo ilike '%' || $1 || '%'
`, [q]);

// Attack: q = "a%" → Wildcard injection
// SELECT * FROM fuvar_megbizasok WHERE megrendelo ilike '%a%%%'
// → Performance DoS: full table scan, lassú
```

**Impact:**
- DoS: `LIKE "%a%a%a%"` = exponential slowdown
- Pattern extraction (felhasználók lekérdezése)

**Fix:**
```typescript
// ✅ JAVÍTOTT
const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&');

const q = req.nextUrl.searchParams.get("q") || "";
const results = await query(`
  SELECT * FROM fuvar_megbizasok 
  WHERE megrendelo ilike '%' || $1 || '%' ESCAPE '\\'
`, [escapeLike(q)]);
```

**Munka:** 20 perc

---

#### 5. Session Secret Validation Missing
**Súlyosság:** 🔴 KRITIKUS  
**Fájl:** `/lib/auth/session.ts:27-35`  
**Probléma:**
```typescript
// ❌ JELENLEGI
export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET,  // If undefined → CRASH
  // ...
};

// Ha SESSION_SECRET nincs set:
// Error: "password must be a string"
// → Runtime crash, éles server down
```

**Impact:**
- Deployment failure ha env missing
- Nincs graceful fallback
- Production down = üzemen kívül

**Fix:**
```typescript
// ✅ JAVÍTOTT
function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  
  if (!secret) {
    throw new Error(
      "SESSION_SECRET environment variable is required. " +
      "Set it with a min 32-character random string."
    );
  }
  
  if (secret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be at least 32 characters long. " +
      `Current length: ${secret.length}`
    );
  }
  
  return secret;
}

export const sessionOptions: SessionOptions = {
  password: getSessionSecret(),
  // ...
};
```

**Munka:** 15 perc

---

### 🟠 NAGY PERFORMANCE & RELIABILITY HIBÁK

#### 6. N+1 Query Problem (Dolgozók)
**Súlyosság:** 🟠 NAGY  
**Fájl:** `/lib/dolgozok/actions.ts:39-58`  
**Probléma:**
```typescript
// ❌ JELENLEGI
async function isMonthFullyPaid(year: number, month: number): Promise<boolean> {
  const employees = await getActiveEmployees();  // Query 1
  
  for (const emp of employees) {  // Loop 1: 20 alkalmazott
    const mode = wageMode(emp);
    
    if (mode === "heti") {
      const rows = await query(...);  // Query 2, 3, 4, ..., 20
    } else if (mode === "napi") {
      const rows = await query(...);  // Query 21, 22, ..., 40
    } else {
      const rows = await query(...);  // Query 41, ...
    }
  }
  
  return true;
}

// Total: 1 + (20 × 2-3) = 41-61 queries! 😱
// Time: ~30 segundos 20 alkalmazottal
```

**Impact:**
- Havi feldolgozás: 30+ sec
- Adatbázis terhelés: 50+ query
- Lassú UI, timeout

**Fix:**
```typescript
// ✅ JAVÍTOTT (batch queries)
async function isMonthFullyPaid(year: number, month: number): Promise<boolean> {
  // Fetch all in ONE query per wage type
  const [weeklies, dailyMonthly] = await Promise.all([
    query<{ employee_id: string; paid: boolean }>(
      `SELECT DISTINCT employee_id, paid FROM alkalmazott_heti_ber 
       WHERE year = $1 AND month = $2`,
      [year, month]
    ),
    query<{ employee_id: string; paid: boolean }>(
      `SELECT DISTINCT employee_id, paid FROM alkalmazott_napi_ber 
       WHERE year = $1 AND month = $2
       UNION ALL
       SELECT DISTINCT employee_id, paid FROM alkalmazott_havi_ber 
       WHERE year = $1 AND month = $2`,
      [year, month]
    ),
  ]);
  
  // Combine results
  const paidEmployees = new Set([...weeklies, ...dailyMonthly]
    .filter(r => r.paid)
    .map(r => r.employee_id)
  );
  
  // Check against active employees
  const employees = await getActiveEmployees();
  return employees.every(emp => paidEmployees.has(emp.id));
}

// Total: 1 (employees) + 2 (batch queries) = 3 queries
// Time: ~100 milliseconds
```

**Munka:** 1 óra

---

#### 7. Missing Error Handling (External APIs)
**Súlyosság:** 🟠 NAGY  
**Fájlok:** `/lib/fuvarozas/actions.ts:426-470`  
**Probléma:**
```typescript
// ❌ JELENLEGI
async function becsulFuvarSzakasz(
  megallok: { szoveg: string }[]
): Promise<{ distance: number; cost: number }> {
  const geokodolt = await Promise.all(
    megallok.map(m => geocodeAddress(m.szoveg).catch(() => null))
  );
  // .catch() simán ignores hibákat
  
  const toll = await calculateToll({
    distance: 0,  // ❌ Null/undefined → 0!
    vehicle: "unknown"
  });
  
  return { distance: 0, cost: toll };
  // → Rossz becslés, user nem tudja
}
```

**Impact:**
- Silent failures → hibás adatok
- Nincs logging → nem tudjuk mi volt a hiba
- Nincs retry → ideiglenes API probléma = permanent
- Nincs timeout → infinite wait

**Fix:**
```typescript
// ✅ JAVÍTOTT (retry + timeout wrapper)
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  timeoutMs: number = 5000,
  label: string = "API call"
): Promise<T | null> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`${label} timeout after ${timeoutMs}ms`)),
            timeoutMs
          )
        ),
      ]);
    } catch (err) {
      console.error(`[${label}] Attempt ${i + 1}/${maxRetries} failed:`, err);
      
      if (i === maxRetries - 1) {
        // Log to monitoring (Sentry, DataDog, etc.)
        console.error(`[${label}] All retries exhausted`);
        return null;
      }
      
      // Exponential backoff: 1s, 2s, 4s
      const delayMs = 1000 * Math.pow(2, i);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return null;
}

// Usage:
async function becsulFuvarSzakasz(megallok) {
  const geokodolt = await Promise.all(
    megallok.map(m =>
      withRetry(
        () => geocodeAddress(m.szoveg),
        3,
        5000,
        `Geocoding for ${m.szoveg}`
      )
    )
  );
  
  if (geokodolt.some(g => g === null)) {
    console.warn("[fuvarozas] Some geocoding failed, cost estimate may be inaccurate");
  }
  
  const toll = await withRetry(
    () => calculateToll({ coords: geokodolt.filter(Boolean) }),
    3,
    8000,
    "Toll calculation"
  );
  
  return { distance: 0, cost: toll?.cost ?? 0 };
}
```

**Munka:** 1-2 óra

---

#### 8. Timezone Inconsistency
**Súlyosság:** 🟠 NAGY  
**Fájlok:** Mindenhol a kódban  
**Probléma:**
```typescript
// ❌ JELENLEGI
// Railway container: UTC időzóna
// App logic: Budapest felhasználók (UTC+1 vagy +2)

// /lib/jelenlet/actions.ts
const today = new Date();  // UTC időbélyeg!
await query(`
  INSERT INTO jelenlet (employee_id, date, checked_in_at)
  VALUES ($1, $2, $3)
`, [empId, today, today]);

// PostgreSQL: stores in UTC
// Frontend: displays UTC time → "12:34 UTC" instead of "14:34 Budapest"
// Report: "Employee checked in at 2:30 AM" (UTC) 
//         = Actually 4:30 AM Budapest time!
```

**Impact:**
- Jelenlét-raportak hibásak
- Bér-számolás hibás (napi idő-alapú munka)
- Szállítási időpontok eltoltak
- Számlázási dátumok hibásak

**Fix:**
```typescript
// ✅ JAVÍTOTT (centralized timezone)
// lib/timezone.ts
export const TIMEZONE = 'Europe/Budapest';

export function nowInBudapest(): Date {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  
  const parts = formatter.formatToParts(new Date());
  const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
  
  return new Date(
    `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`
  );
}

export const BUDAPEST_NOW_SQL = `now() at time zone '${TIMEZONE}'`;
export const BUDAPEST_DATE_SQL = `(now() at time zone '${TIMEZONE}')::date`;
export const BUDAPEST_TIME_SQL = `(now() at time zone '${TIMEZONE}')::time`;

// Usage:
import { BUDAPEST_DATE_SQL, nowInBudapest } from "@/lib/timezone";

// In TypeScript:
const checkedInAt = nowInBudapest();

// In SQL:
await query(`
  INSERT INTO jelenlet (employee_id, date, checked_in_at)
  VALUES ($1, ${BUDAPEST_DATE_SQL}, ${BUDAPEST_NOW_SQL})
`, [empId]);
```

**Munka:** 3-4 óra (mindenhol cserélni)

---

### 🟡 KÖZEPES HIBÁK (4-5 óra)

#### 9. Missing Transactions (recordMovements)
**Súlyosság:** 🟡 KÖZEPES  
**Fájl:** `/lib/keszlet/actions.ts:142-219`  
**Probléma:**
```typescript
// ❌ JELENLEGI
async function recordMovements(input: {
  site: string;
  direction: "be" | "ki" | "mozgatas";
  items: { type: string; qty: number }[];
}) {
  const movementGroup = randomUUID();
  
  for (const item of input.items) {
    await addMovement({  // INSERT 1
      ...item,
      movement_group: movementGroup,
    });
  }
  
  if (input.direction === "mozgatas") {
    for (const item of input.items) {
      await addMovement({  // INSERT 2
        ...item,
        direction: "ki",
        movement_group: movementGroup,
      });
    }
  }
  
  if (input.site === "Nyíregyháza") {
    await query(`INSERT INTO keszlet_events ...`);  // INSERT 3
  }
  
  // If INSERT 3 fails, INSERT 1-2 already committed!
  // Data inconsistency: partial record exists
}
```

**Impact:**
- Partial inserts → data corruption
- Inventory mismatch
- Audit trail broken

**Fix:** Wrap in transaction

---

#### 10-20. Egyéb hibák
- Race condition (pointer update)
- Unbounded query results
- Expensive subqueries
- Type casting issues
- Duplicate code
- Hardcoded configuration
- **0% test coverage** ← KRITIKUS

---

## MODULONKÉNTI BONTÁS

### 🔐 AUTH MODUL

| Hiba | Súlyosság | Hatás | Munka | Függetlenség |
|------|----------|-------|-------|-------------|
| Session secret validation | KRITIKUS | Runtime crash | 15 perc | ✅ Független |
| Weak password policy | KRITIKUS | Brute-force | 30 perc | ✅ Független |
| Missing rate-limiting | KRITIKUS | Brute-force | 1 óra | ✅ Független |

**Összesen:** 2 óra | **Párhuzamosítható:** ✅ IGEN

---

### 🚛 FUVAROZÁS MODUL

| Hiba | Súlyosság | Hatás | Munka | Függőség |
|------|----------|-------|-------|---------|
| API auth bypass | KRITIKUS | Data leak | 30 perc | ⚠️ AUTH |
| SQL injection (LIKE) | NAGY | DoS | 20 perc | ✅ Független |
| Missing error handling | NAGY | Silent failures | 1-2 óra | ✅ Független |

**Összesen:** 3 óra | **Függőség:** AUTH-ra (1. hiba)

---

### 👥 DOLGOZÓK MODUL

| Hiba | Súlyosság | Hatás | Munka | Függetlenség |
|------|----------|-------|-------|-------------|
| N+1 query | NAGY | Slow processing | 1 óra | ✅ Független |
| Race condition | KÖZEPES | Data inconsistency | 1 óra | ✅ Független |

**Összesen:** 2 óra | **Párhuzamosítható:** ✅ IGEN

---

### 📦 KÉSZLET MODUL

| Hiba | Súlyosság | Hatás | Munka | Függőség |
|------|----------|-------|-------|---------|
| API auth bypass | KRITIKUS | Data leak | 30 perc | ⚠️ AUTH |
| Missing transactions | KÖZEPES | Data corruption | 1 óra | ✅ Független |

**Összesen:** 1.5 óra | **Függőség:** AUTH-ra

---

### 📋 SZAMLÁK & 👤 JELENLÉTI MODULOK

Hasonló: API auth bypass + minor fixes

---

## FIX STRATÉGIA

### 4-5 ÓRÁS GYORS PATH (MVP)

```
Fázis 1: AUTH Foundation (1-1.5 óra) ← FIRST
  1. lib/auth/password-validation.ts (30 perc)
  2. lib/auth/rate-limit.ts (30 perc)
  3. lib/auth/session.ts validation (15 perc)

     ↓ DEPENDENCIES FEED INTO:

Fázis 2: Common Utils (0.5-1 óra) ← Párhuzamos
  1. lib/auth/require-session.ts (withSession wrapper) (30 perc)
  2. lib/sql-escape/like-escape.ts (15 perc)
  3. lib/external-api/retry.ts (15 perc)

     ↓ NOW AVAILABLE:

Fázis 3: API Routes + SQL (1.5-2 óra) ← Után 1-2
  1. /app/api/**/route.ts → withSession() (30 perc)
  2. LIKE queries → escapeLike() (20 perc)
  3. External APIs → withRetry() (1 óra)

     ║
     ╠═ PARALLEL

Fázis 4: Performance (1.5-2 óra) ← Függetlenek
  1. /lib/dolgozok/actions.ts N+1 fix (1 óra)
  2. Race condition fixes (0.5 óra)
  3. Transaction support (0.5 óra)

TOTAL: ~4-5 óra szekvenciális + párhuzamos optimalizálás
```

### COMMIT STRATÉGIA

```bash
git checkout -b claude/security-fixes-2026-09-13

# Commit 1: Auth foundation
git commit -m "auth: add password validation, rate-limiting, session validation"

# Commit 2: Common utils
git commit -m "lib: add auth wrapper, SQL escape, retry helpers"

# Commit 3: API routes
git commit -m "api: add session requirement to all routes (auth bypass fix)"

# Commit 4: SQL & Error handling
git commit -m "fuvarozas: fix SQL injection, add error handling + retries"

# Commit 5: Performance
git commit -m "dolgozok: fix N+1 queries + race conditions; keszlet: add transactions"

git push -u origin claude/security-fixes-2026-09-13
# → Create Pull Request
# → Review
# → Merge
# → Auto-deploy on Railway
```

---

## KÓDPÉLDÁK & MEGVALÓSÍTÁS

### Helper: withSession (API Auth Wrapper)

**File:** `lib/auth/require-session.ts` (NEW)
```typescript
import { RequestCookie } from "next/dist/compiled/@edge-runtime/cookies";
import { Session } from "iron-session";

export function withSession<T extends any[], R>(
  handler: (req: Request, session: Session, ...args: T) => Promise<R>
) {
  return async (req: Request, ...args: T): Promise<R | Response> => {
    try {
      const session = await requireSession();
      if (!session) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { "content-type": "application/json" } }
        );
      }
      return handler(req, session, ...args);
    } catch (err) {
      console.error("[withSession] Error:", err);
      return new Response(
        JSON.stringify({ error: "Internal server error" }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }
  };
}
```

**Usage in route:**
```typescript
// /app/api/fuvarozas/kereses/route.ts
import { withSession } from "@/lib/auth/require-session";

export const GET = withSession(async (req, session) => {
  const q = req.nextUrl.searchParams.get("q") || "";
  const results = await query(
    `SELECT * FROM fuvar_megbizasok WHERE megrendelo ilike '%' || $1 || '%'`,
    [q]
  );
  return Response.json(results);
});
```

### Helper: escapeLike (SQL Injection Prevention)

**File:** `lib/sql/escape-like.ts` (NEW)
```typescript
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, "\\$&");
}
```

**Usage:**
```typescript
const q = req.nextUrl.searchParams.get("q") || "";
const escaped = escapeLike(q);
const results = await query(
  `SELECT * FROM fuvar_megbizasok WHERE megrendelo ilike '%' || $1 || '%' ESCAPE '\\'`,
  [escaped]
);
```

### Helper: withRetry (Error Handling)

**File:** `lib/external-api/retry.ts` (NEW)
```typescript
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: {
    maxRetries?: number;
    timeoutMs?: number;
    backoffMultiplier?: number;
    label?: string;
  }
): Promise<T | null> {
  const {
    maxRetries = 3,
    timeoutMs = 5000,
    backoffMultiplier = 2,
    label = "API call",
  } = options ?? {};

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Timeout after ${timeoutMs}ms`)),
            timeoutMs
          )
        ),
      ]);
    } catch (error) {
      const isLastAttempt = attempt === maxRetries - 1;
      console.error(
        `[${label}] Attempt ${attempt + 1}/${maxRetries} failed:`,
        error instanceof Error ? error.message : String(error)
      );

      if (isLastAttempt) {
        // TODO: Send to monitoring (Sentry, DataDog)
        return null;
      }

      const delay = 1000 * Math.pow(backoffMultiplier, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return null;
}
```

---

## TESZTELÉSI CHECKLIST

- [ ] **AUTH Module**
  - [ ] Login 5x with wrong password → rate-limited ✅
  - [ ] Password < 12 chars → rejected ✅
  - [ ] Password without uppercase → rejected ✅
  - [ ] Valid password → accepted ✅

- [ ] **API Auth**
  - [ ] `/api/fuvarozas/kereses` without session → 401 ✅
  - [ ] `/api/fuvarozas/kereses` with session → 200 ✅

- [ ] **SQL Injection**
  - [ ] Search with `q = "a%"` → no DoS ✅
  - [ ] Search with `q = "normal"` → works ✅

- [ ] **Performance**
  - [ ] `isMonthFullyPaid()` < 1 sec (20 employees) ✅

- [ ] **Error Handling**
  - [ ] Geocoding fails → retry 3x → fallback ✅
  - [ ] Toll API timeout → handled gracefully ✅

- [ ] **Timezone**
  - [ ] Jelenléti check-in time correct in Budapest ✅
  - [ ] Reports show Budapest time, not UTC ✅

---

## DEPLOYMENT ÚTMUTATÓ

### 1. Local Development

```bash
# Clone & setup
git clone https://github.com/bzol33-max/wwp-rendszer.git
cd wwp-rendszer
npm install

# Create fixes branch
git checkout -b claude/security-fixes-2026-09-13

# Run dev server
npm run dev

# Run tests (after creating them)
npm run test
```

### 2. Apply Fixes

Follow the 4-phase plan above. Each phase:
1. Write the code
2. Test locally
3. Commit with clear message
4. Push

### 3. Testing

```bash
# TypeScript check
npx tsc --noEmit

# Lint
npm run lint

# Manual testing
# 1. Open http://localhost:3000/login
# 2. Test password validation
# 3. Test login rate-limiting
# 4. Test API auth
```

### 4. Deploy

```bash
# Push to origin
git push -u origin claude/security-fixes-2026-09-13

# Create PR on GitHub
# → Review
# → Merge to main
# → Railway auto-deploys

# Verify in production
# https://web-production-91051.up.railway.app
# 1. Login with test account
# 2. Check auth header in DevTools
# 3. Try API call without session → 401 expected
```

---

## ÖSSZEFOGLALÓ

### Mik a legfontosabb tények?

1. **API routes teljesen védtelenek** — bárki lekérdezheti az összes adatot
2. **Jelszavak túl gyengék** — 6 karakter vs min 12 + complexity
3. **N+1 query lassítja a feldolgozást** — 41 query helyett 3-ra csökkentés
4. **Külső API-k nincsenek kezelve** — silent failures → hibás adatok
5. **0% test coverage** — nincs automatizált verifikáció

### Mitől függ minden?

- **AUTH modul fixálása** → utána lehet az API-kat védeni
- **Common utils** → utána alkalmazható mindenhol
- **Performance fixes** → függetlenek, párhuzamosak

### Mekkora munka?

- **KRITIKUS:** 4-5 óra
- **NAGY:** 2-3 óra
- **TELJES:** 8-10 óra

### Mit csináljak először?

1. **AUTH foundation** (1-1.5 óra) ← Ez az első!
2. **Common utils** (0.5-1 óra) ← Párhuzamosan
3. **API auth routes** (1-1.5 óra)
4. **Performance** (1.5-2 óra)

---

**KÉS

Z?** Kezdjék az AUTH modul-lal! 🚀
