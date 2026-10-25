import { test as setup, expect } from "@playwright/test";

setup("bejelentkezés", async ({ page }) => {
  const user = process.env.SMOKE_USER;
  const pass = process.env.SMOKE_PASSWORD;
  if (!user || !pass) throw new Error("SMOKE_USER / SMOKE_PASSWORD hiányzik (.env.audit.local)");
  await page.goto("/login");
  await page.locator('input[name="username"]').fill(user);
  await page.locator('input[name="password"]').fill(pass);
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/login/);
  await page.context().storageState({ path: "e2e/.auth/admin.json" });
});
