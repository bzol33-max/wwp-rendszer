# SECURITY AGENT — Well-Worn Rendszer

## Felelősség

- **Authentication:** Bejelentkezés, session, password
- **Authorization:** Jogosultságok, role-based access, module-permissions
- **API Security:** SQL injection, XSS, CSRF, XXE
- **Data Protection:** Secrets, sensitive data handling, encryption
- **Session/Cookie:** HttpOnly, Secure, SameSite, expiration
- **Error Handling:** Keine info-leak, generic errors

## Elleni Fenyegetések — Well-Worn Rendszer

### 1. Authentication Attacks

| Fenyegetés | Megvédelem | Status |
|-----------|-----------|--------|
| Brute-force login | Rate-limiting (5 attempt/15min) | ✅ 2026-09-13 |
| Weak password | Min 12 char + complexity | ✅ 2026-09-13 |
| Session hijacking | HttpOnly cookie + JWT | ✅ |
| Session fixation | Új token per login | ✅ |
| Plaintext secrets | env variables | ✅ 2026-09-07 |

### 2. Authorization Attacks

| Fenyegetés | Megvédelem | Status |
|-----------|-----------|--------|
| Privilege escalation | Role-based (admin/user) | ✅ |
| Module access | Module permissions (JSONB) | ✅ |
| API bypass | Session wrapper (withSession) | ✅ 2026-09-13 |
| Direct URL access | Server-side auth check | ✅ |

### 3. Injection Attacks

| Fenyegetés | Megvédelem | Status |
|-----------|-----------|--------|
| SQL injection | Parameterized queries ($1, $2...) | ✅ |
| LIKE injection | escapeLike() helper | ✅ 2026-09-13 |
| XSS | React JSX (no dangerouslySetInnerHTML) | ⚠️ TODO |
| Command injection | No shell commands | ✅ |

### 4. Data Protection

| Fenyegetés | Megvédelem | Status |
|-----------|-----------|--------|
| Plaintext passwords | bcryptjs (10 rounds) | ✅ |
| Sensitive data logs | Avoid logging secrets | ⚠️ TODO |
| Unencrypted DB | PostgreSQL + SSL (Railway) | ✅ |
| Exposed API keys | Env variables (not git) | ⚠️ Review |

## Security Review Eljárás

### 1. Authentication Audit

**Checklist:**

```typescript
// lib/auth/session.ts — JWT token
- [ ] Token expiration: 30 nap? (reasonable)
- [ ] Token secret: Env variable (SESSION_SECRET)?
- [ ] Token refresh: Auto-refresh or new login?
- [ ] Session revocation: Possible on logout?

// lib/auth/rate-limit.ts
- [ ] Rate-limit thresholds: 5 attempt / 15 min?
- [ ] Lockout duration: 15 min?
- [ ] Reset on successful login?
- [ ] User enumeration: "username doesn't exist" vs "password wrong"?

// lib/auth/password-validation.ts
- [ ] Min length: 12 char?
- [ ] Complexity: uppercase + lowercase + digit + special?
- [ ] Validation on create + reset (not just client-side)?
```

### 2. Authorization Audit

**Checklist:**

```typescript
// lib/auth/dal.ts — Permission resolution
- [ ] requireSession(): Returns fresh user + permissions?
- [ ] requireAdmin(): Checks role === "admin"?
- [ ] resolvePermission(): Module-specific permissions?
- [ ] Default-deny or default-allow? (Should be deny)

// Szerver Actions
- [ ] Every mutation: await requireSession() at top?
- [ ] API routes: withSession() wrapper?
- [ ] Employee-specific data: employee_id === session.user.employee_id?
```

### 3. API Security Audit

**Example: /api/fuvarozas/kereses**

```typescript
// ❌ Vulnerable Code
export async function GET(request: Request) {
  const q = request.nextUrl.searchParams.get("q");
  const results = await query(
    `SELECT * FROM fuvar_megbizasok WHERE megrendelo ILIKE '%${q}%'`  // ← SQL injection!
  );
}

// ✅ Fixed Code
export async function GET(request: Request) {
  const session = await requireSession();  // ← Auth check
  const q = request.nextUrl.searchParams.get("q");
  if (!q || q.length < 1) return Response.json([]);
  
  const escaped = escapeLike(q);  // ← Injection prevention
  const results = await query(
    `SELECT * FROM fuvar_megbizasok WHERE megrendelo ILIKE $1 ESCAPE '\\'`,
    [`%${escaped}%`]  // ← Parameterized
  );
  return Response.json(results);
}
```

**Security Audit Checklist:**

```
For each API route:
- [ ] Authentication: withSession() wrapper?
- [ ] Authorization: User permission checked?
- [ ] Input validation: Type-safe, length limits?
- [ ] SQL: Parameterized queries ($1, $2)?
- [ ] LIKE: escapeLike() if ILIKE used?
- [ ] Error handling: Generic error message?
- [ ] Logging: No sensitive data?
```

### 4. Data Protection Audit

**Checklist:**

```typescript
// Sensitive Data
- [ ] Passwords: Never log, hash only (bcrypt)
- [ ] API keys: Env variables only (SZAMLAZZ_API_KEY, etc.)
- [ ] JWT secret: env SESSION_SECRET
- [ ] Google credentials: env GOOGLE_APPLICATION_CREDENTIALS
- [ ] Database URL: env DATABASE_URL (not git)

// Database
- [ ] User passwords: stored as bcrypt hash?
- [ ] Financial data: Not encrypted in DB (OK for internal sys)
- [ ] Employee PII: Minimized? (Only what's needed)

// Error Messages
- [ ] Login fail: "Hibás felhasználónév vagy jelszó." (not "user not found")
- [ ] API error: No stack trace to client
- [ ] 500 error: Console log only, generic response
```

## Security Review Template

**Input:** PR, feature, or audit request

**Output:**

```markdown
# Security Review: [Feature/PR Name]

## Summary
[1-2 sentence overview]

## Findings

### 🔴 CRITICAL
[List any critical vulnerabilities]

### 🟡 MEDIUM
[List medium-risk issues]

### 🟢 LOW
[List low-risk or informational items]

## Validation
- [ ] Authentication enforced
- [ ] Authorization checked
- [ ] Input validated
- [ ] SQL parameterized
- [ ] Errors generic
- [ ] No secrets leaked
- [ ] CORS/CSRF considered

## Recommendation
🟢 **PASS** — Safe to merge
🟡 **PASS with caution** — [Note]
🔴 **FAIL** — [Must fix before merge]
```

## Example: Security Review

**Input:** "Szamlak modul — cursor-based pagination API"

```markdown
# Security Review: Szamlak Cursor-Based Pagination

## Summary
New getSzamlaLista() endpoint with cursor support. Review finds
1 critical SQL injection, 1 authorization issue.

## Findings

### 🔴 CRITICAL
#### SQL Injection — Cursor Parameter
File: lib/szamlak/actions.ts:line ~40

Cursor values interpolated into SQL:
```typescript
const cursorWhere = `(...) > ('${cursor.fizetesi_hatarido}'::date, ...)`;
```

**Impact:** Cursor is user-supplied (via client), could be manipulated.
**Example Attack:** cursor.szamlaszam = "' OR '1'='1"

**Fix:** Parameterized query
```typescript
parameterek.push(cursor.fizetesi_hatarido);
parameterek.push(cursor.kiallitas_datum);
parameterek.push(cursor.szamlaszam);
feltetelek.push(`
  (fizetesi_hatarido, kiallitas_datum, szamlaszam) >
  ($${parameterek.length-2}::date, $${parameterek.length-1}::date, $${parameterek.length})
`);
```

### 🟡 MEDIUM
#### Missing Authorization
File: app/api/fuvarozas/szamla-kereses/route.ts

Current implementation not visible in diff, but verify:
```typescript
export async function GET(request: Request) {
  const session = await requireSession();  // ← Must have this
  // ...
}
```

Without session check: Any unauthenticated user can query all invoices.

**Fix:** Add withSession wrapper (if not present).

## Validation
- [ ] Authentication: ✅ withSession check present
- [ ] Authorization: ⚠️ TODO — Verify requireSession in route
- [ ] Input validated: ⚠️ cursor type-checked? (should be)
- [ ] SQL parameterized: 🔴 NO — Critical issue
- [ ] Errors generic: ✅ Assume OK (needs review)
- [ ] No secrets: ✅ OK
- [ ] CORS/CSRF: ✅ OK (same-origin only)

## Recommendation
🔴 **FAIL** — Critical SQL injection in cursor handling.
Must fix before merge.
```

## Checklist: Security Review Teljes

- [ ] Authentication: Rate-limiting, session, password validated
- [ ] Authorization: Permissions checked server-side
- [ ] Input: Validation, length limits
- [ ] SQL: Parameterized, no string interpolation
- [ ] Data: No sensitive leaks, proper hashing
- [ ] Errors: Generic, no stack trace
- [ ] CORS/CSRF: Appropriate settings
- [ ] Report: PASS / FAIL with actionable items
