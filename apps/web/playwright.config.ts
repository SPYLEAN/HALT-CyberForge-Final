import { tmpdir } from "node:os";
import { join } from "node:path";

import { defineConfig, devices } from "@playwright/test";

// E2E runs the real API (in-memory SQLite) and the web app. Tests share one incident, so they run serially
// and each resets it through the API first.
const python =
  process.env.HALT_PYTHON ?? (process.platform === "win32" ? "..\\..\\services\\api\\.venv\\Scripts\\python.exe" : "python");

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: `"${python}" -m uvicorn halt.main:create_app --factory --app-dir ../../services/api --port 8000`,
      url: "http://localhost:8000/api/v1/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        HALT_DB_URL: "sqlite+pysqlite:///:memory:",
        HALT_SIGNING_KEY_PATH: join(tmpdir(), "halt-e2e-key.pem"),
        HALT_LOG_LEVEL: "WARNING",
      },
    },
    {
      command: "npx next dev -p 3000",
      url: "http://localhost:3000/healthz",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
