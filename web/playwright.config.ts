import { defineConfig, devices } from "@playwright/test";

// E2E against the production build + the real API (reuses already-running servers locally).
const PY = process.env.BTP_PYTHON ?? (process.platform === "win32" ? ".venv\\Scripts\\python.exe" /* relative to the repo root (webServer cwd) */ : "python");

export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:4174", ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
  webServer: [
    // dedicated API on :8001 with a high rate limit so E2E runs never hit the production limit
    { command: `${PY} -m uvicorn api.main:app --port 8001 --no-access-log`, cwd: "..", url: "http://localhost:8001/v1/health", reuseExistingServer: false, timeout: 120_000,
      env: { BTP_RATE_LIMIT: "1000", BTP_ALLOWED_ORIGINS: "http://localhost:4174" } },
    { command: "npm run build && npm run preview -- --port 4174 --strictPort", url: "http://localhost:4174", reuseExistingServer: false, timeout: 180_000,
      env: { VITE_API_URL: "http://localhost:8001" } },
  ],
});
