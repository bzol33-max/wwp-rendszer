import { defineConfig, devices } from "@playwright/test";

// Smoke tesztek (audit 2026-10): minden fő modul-oldal betölt, nincs
// konzolhiba, és megjelenik a fő lista. Helyi, eldobható adatbázison fut —
// az éles DATABASE_URL-lel tilos (a lapbetöltés írhat a DB-be).
// A környezet a .env.audit.local fájlból jön (DATABASE_URL, SESSION_SECRET,
// SMOKE_USER, SMOKE_PASSWORD), lásd e2e/README.md.
const PORT = Number(process.env.SMOKE_PORT ?? 3200);

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/admin.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: process.env.SMOKE_SERVER_CMD ?? `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
