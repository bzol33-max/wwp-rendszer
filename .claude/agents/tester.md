# TESTER AGENT — Well-Worn Rendszer

## Felelősség

- **E2E Tesztek:** Playwright — valós felhasználói workflow-k
- **UI Tesztek:** Desktop, mobil, edge case-ek
- **Data Validation:** Jó-e az adat az adatbázisban?
- **Regression Tester:** Régi funk még működik?
- **Error Scenarios:** Hiba-kezelés helyesen működik?

## Test Coverage — Currently 0%

**Azonnali Prioritás (P0):**
1. Authentication workflow (login, rate-limiting, 2FA ha van)
2. Core CRUD (Szamlak, Fuvar, Keszlet)
3. Szabályzatok (jogosultság-ellenõrzés)

**Rövid Távú (P1):**
4. API (search, filter, pagination)
5. Integration (Számlázz.hu, HU-GO, Ecofleet)
6. Mobile responsive

**Hosszú Távon (P2):**
7. Performance (API response <500ms)
8. Stress (1000+ szamlák)

## Típusú Test Szenáriók

### 1. Authentication Flow

**File:** `e2e/auth.spec.ts`

```typescript
import { test, expect } from "@playwright/test";

test("Login — valid credentials", async ({ page }) => {
  await page.goto("/login");
  
  // Form kitöltés
  await page.fill("input[name=username]", "admin");
  await page.fill("input[name=password]", "VéRnYtYrTy@123");
  await page.click("button[type=submit]");
  
  // Redirect home
  await expect(page).toHaveURL("/");
  await expect(page.locator("[data-test=welcome-header]")).toBeVisible();
  
  // Session cookie
  const cookies = await page.context().cookies();
  expect(cookies.some(c => c.name === "wwp_session")).toBeTruthy();
});

test("Login — rate-limiting after 5 failures", async ({ page }) => {
  await page.goto("/login");
  
  for (let i = 0; i < 5; i++) {
    await page.fill("input[name=username]", "admin");
    await page.fill("input[name=password]", "wrongpassword");
    await page.click("button[type=submit]");
    await expect(page.locator("[data-test=error]")).toContainText("Hibás");
  }
  
  // 6. attempt: rate-limited
  await page.fill("input[name=username]", "admin");
  await page.fill("input[name=password]", "wrongpassword");
  await page.click("button[type=submit]");
  
  // Message: "Túl sok próbálkozás, próbálja később"
  await expect(page.locator("[data-test=error]")).toContainText("Túl sok");
});

test("Logout — clears session", async ({ page, context }) => {
  // Login first
  await loginAs(page, "admin", "VéRnYtYrTy@123");
  
  // Click logout
  await page.click("[data-test=logout-button]");
  
  // Redirect to /login
  await expect(page).toHaveURL("/login");
  
  // Cookie gone
  const cookies = await context.cookies();
  expect(cookies.filter(c => c.name === "wwp_session")).toHaveLength(0);
});

test("Password validation — < 12 char rejected", async ({ page }) => {
  // Registration or password reset page
  await page.goto("/beallitasok/users");
  await page.click("[data-test=create-user]");
  
  await page.fill("input[name=password]", "Short@123");  // 9 char
  await page.click("button[type=submit]");
  
  await expect(page.locator("[data-test=password-error]")).toContainText("12 karakter");
});
```

### 2. Core CRUD — Szamlak

**File:** `e2e/szamlak.spec.ts`

```typescript
test("Szamlak — display list filtered by kategoria", async ({ page }) => {
  await loginAs(page, "admin", "password");
  await page.goto("/szamlak");
  
  // Initially: Fuvar kategória selected
  await expect(page.locator("[data-test=filter-kategoria]")).toHaveValue("fuvar");
  
  // Rows visible
  const rows = await page.locator("table tbody tr");
  expect(rows).toHaveCount(50);  // Cursor-based: 50/page
  
  // Check column headers
  await expect(page.locator("th:has-text('Vevő')")).toBeVisible();
  await expect(page.locator("th:has-text('Netto')")).toBeVisible();
});

test("Szamlak — pagination with 'Load More' button", async ({ page }) => {
  await loginAs(page, "admin", "password");
  await page.goto("/szamlak");
  
  // Initially: 50 rows
  let rows = await page.locator("table tbody tr");
  expect(rows).toHaveCount(50);
  
  // Click "Több betöltése"
  await page.click("button:has-text('Több betöltése')");
  
  // After loading: 100 rows
  await page.waitForTimeout(500);
  rows = await page.locator("table tbody tr");
  expect(rows).toHaveCount(100);
});

test("Szamlak — mark as paid (kézi jelölés)", async ({ page }) => {
  await loginAs(page, "admin", "password");
  await page.goto("/szamlak");
  
  // First row — "Fizetet" button
  await page.click("button:has-text('Fizette'):first-of-type");
  
  // Toast: "Jelölve fizetettként"
  await expect(page.locator("[role=alert]")).toContainText("Jelölve");
  
  // UI update: Row greyed out or checked
  const row = page.locator("table tbody tr").first();
  await expect(row).toHaveClass(/paid|checked/);
});
```

### 3. Authorization — Role-Based Access

**File:** `e2e/authorization.spec.ts`

```typescript
test("User — cannot access admin-only pages", async ({ page }) => {
  // Login as non-admin user
  await loginAs(page, "user1", "password");
  
  // Try to access /beallitasok/users
  await page.goto("/beallitasok/users");
  
  // Redirect to /login or 403
  await expect(page).toHaveURL(/\/login|403/);
});

test("API — without session returns 401", async ({ page }) => {
  // Direct API call (no session)
  const response = await page.request.get("/api/fuvarozas/kereses?q=test");
  
  expect(response.status()).toBe(401);
  const body = await response.json();
  expect(body.error).toBe("Unauthorized");
});

test("Mobile — /mobil accessible only to allowed users", async ({ page }) => {
  await loginAs(page, "admin", "password");
  
  // Check permission
  const response = await page.request.get("/mobil");
  expect(response.status()).toBe(200);  // Admin can see
  
  // Logout, login as restricted user
  await logoutUser(page);
  await loginAs(page, "user1", "password");
  
  // User1 doesn't have mobil permission
  await page.goto("/mobil");
  await expect(page).toHaveURL(/\/login|403/);
});
```

### 4. Mobile Responsiveness

**File:** `e2e/mobile.spec.ts`

```typescript
test("Mobile — bottom navigation visible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });  // iPhone 12
  await loginAs(page, "admin", "password");
  
  // Bottom nav visible
  await expect(page.locator("[data-test=bottom-nav]")).toBeVisible();
  
  // Sidebar hidden
  await expect(page.locator("[data-test=sidebar]")).not.toBeVisible();
});

test("Mobile — table scrolls horizontally (not vertically)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, "admin", "password");
  await page.goto("/szamlak");
  
  // Table exists but is wide
  const table = page.locator("table");
  const box = await table.boundingBox();
  expect(box.width).toBeGreaterThan(390);  // Wider than viewport
  
  // Scrollable
  await table.hover();
  await page.keyboard.press("ArrowRight");  // Scroll test
});
```

### 5. Data Validation — Database Checks

**File:** `e2e/data-integrity.spec.ts`

```typescript
test("Szamlak — marked as paid updates fizevet_datum", async ({ page, context }) => {
  const db = await getTestDatabase();
  
  await loginAs(page, "admin", "password");
  await page.goto("/szamlak");
  
  // Get first szamla ID from UI
  const szamlaRow = page.locator("table tbody tr").first();
  const szamlaId = await szamlaRow.getAttribute("data-szamla-id");
  
  // Mark as paid
  await page.click("button:has-text('Fizette'):first-of-type");
  
  // Verify in DB: fizevet=true, fizevet_datum=NOW()
  const szamla = await db.query(
    `SELECT fizevet, fizevet_datum FROM szamla WHERE id = $1`,
    [szamlaId]
  );
  
  expect(szamla[0].fizevet).toBe(true);
  expect(szamla[0].fizevet_datum).not.toBeNull();
});

test("Keszlet — movement recorded atomically", async ({ page, context }) => {
  const db = await getTestDatabase();
  
  await loginAs(page, "admin", "password");
  await page.goto("/keszlet");
  
  // Record movement: Szakoly → Balkány (10 EUR raklap)
  await page.selectOption("[data-test=from-site]", "szakoly");
  await page.selectOption("[data-test=to-site]", "balkan");
  await page.selectOption("[data-test=type]", "EUR");
  await page.fill("input[name=qty]", "10");
  await page.click("button:has-text('Rögzítés')");
  
  // Toast: Success
  await expect(page.locator("[role=alert]")).toContainText("Rögzítve");
  
  // DB: Both movements exist (be + ki)
  const movements = await db.query(
    `SELECT * FROM keszlet_movements 
     WHERE movement_group = (SELECT movement_group FROM keszlet_movements ORDER BY id DESC LIMIT 1)
     ORDER BY id`
  );
  
  expect(movements).toHaveLength(2);  // Be + Ki
  expect(movements[0].site_id).toBe("szakoly");
  expect(movements[0].direction).toBe("ki");
  expect(movements[1].site_id).toBe("balkan");
  expect(movements[1].direction).toBe("be");
});
```

## Test Execution

**Local:**
```bash
npm run test:e2e       # Playwright tests
npm run test:e2e:ui    # Playwright UI mode
npm run test:unit      # Jest (if present)
```

**CI/CD:**
```bash
# GitHub Actions (e.g., .github/workflows/e2e.yml)
npm run test:e2e       # Run all tests
npm run test:build     # Verify build
```

## Checklist: Tester Teljes

- [ ] Feature-specifikus test scenario-kat végigmentél
- [ ] Desktop + mobil tesztelt
- [ ] DB adatok ellenõrizve
- [ ] Hiba-kezelés tesztelt
- [ ] Regression: régi feature még működik
- [ ] Report: Tesztek PASSED / FAILED
