import { test, expect, type Page } from "@playwright/test";

// Modulonként: az oldal betölt (nem irányít a /login-ra, nincs 5xx), nincs
// konzolhiba / el nem kapott kivétel, és a fő lista megjelenik.
// A „SMOKE …” sorokat az e2e/fixtures/smoke-adat.sql tölti be.

function figyeldAHibakat(page: Page) {
  const hibak: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") hibak.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => hibak.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 500) hibak.push(`HTTP ${r.status()}: ${r.url()}`);
  });
  return hibak;
}

async function megnyit(page: Page, url: string) {
  const valasz = await page.goto(url);
  expect(valasz?.status(), `${url} státusz`).toBeLessThan(400);
  await expect(page).not.toHaveURL(/\/login/);
}

test.describe("smoke", () => {
  let hibak: string[];

  test.beforeEach(({ page }) => {
    hibak = figyeldAHibakat(page);
  });

  test.afterEach(async ({ page }) => {
    // A késve érkező hibák (kliens-oldali betöltés) is számítsanak.
    await page.waitForTimeout(1500);
    expect(hibak, "konzol- és oldalhibák").toEqual([]);
  });

  test("Készlet", async ({ page }) => {
    await megnyit(page, "/keszlet");
    await expect(page.getByRole("heading", { name: "Készlet", level: 1 })).toBeVisible();
    for (const ful of ["Nyíregyháza", "Balkány", "Szakoly", "Összkészlet"]) {
      await expect(page.getByRole("tab", { name: ful, exact: true })).toBeVisible();
    }
    await expect(page.locator("table").first()).toBeVisible();
  });

  test("Fuvarozás — Kocsik", async ({ page }) => {
    await megnyit(page, "/fuvarozas2");
    await expect(page.getByRole("heading", { name: "Kocsik" })).toBeVisible();
    await expect(page.getByText("Ellenőrzésre vár").first()).toBeVisible();
  });

  test("Fuvarozás — Megbízások", async ({ page }) => {
    await megnyit(page, "/fuvarozas2/megbizasok");
    await expect(page.getByRole("heading", { name: "Megbízások", level: 1 })).toBeVisible();
    await expect(page.getByText("SMOKE Teszt Kft.").first()).toBeVisible();
  });

  test("Számlák", async ({ page }) => {
    await megnyit(page, "/szamlak");
    await expect(page.getByRole("heading", { name: "Számlák", level: 1 })).toBeVisible();
    await expect(page.getByText("SMOKE-2026-001").first()).toBeVisible();
  });

  test("Járművek", async ({ page }) => {
    await megnyit(page, "/jarmuvek");
    await expect(page.getByRole("heading", { name: "Járművek", level: 1 })).toBeVisible();
    await expect(page.locator("table").first().locator("tbody tr").first()).toBeVisible();
  });

  test("Dolgozók", async ({ page }) => {
    await megnyit(page, "/dolgozok");
    await expect(page.getByRole("heading", { name: "Alkalmazottak", level: 1 })).toBeVisible();
    await expect(page.getByText("Bér", { exact: true }).first()).toBeVisible();
  });
});
