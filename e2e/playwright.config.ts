import { defineConfig, devices } from "@playwright/test";

// End-to-end tests: the real frontend, backend, Postgres and Redis, driven
// in a real browser.
//
// Locally: have the app running (`npm run dev` in my-app, plus Postgres and
// Redis), then `npm test` here. The running servers are reused.
// In CI: the two servers below are started fresh (see .github/workflows).

const CI = !!process.env.CI;
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: "./tests",
  // One at a time: sign-up is rate-limited per IP (10 per 2 minutes), and the
  // two-tab tests are easier to read when nothing else is moving.
  workers: 1,
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }],
  // Both are checked at 127.0.0.1, and Vite is told to listen there: on Linux
  // "localhost" can resolve to ::1 (IPv6) while a server listens on IPv4 only,
  // and the readiness check then waits forever. Their output is shown, so a
  // server that fails to start says why.
  webServer: [
    {
      // the backend, with the env from the shell (CI sets it; locally, backend/.env)
      command: "npm run dev",
      cwd: "../backend",
      // on 4000, where Vite's proxy sends /api and /socket.io; without a .env
      // (as in CI) the backend would otherwise pick its own default port
      env: { ...process.env, PORT: "4000" } as Record<string, string>,
      url: "http://127.0.0.1:4000/api/auth/me",
      reuseExistingServer: !CI,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "npx vite --host 127.0.0.1 --port 5173 --strictPort",
      cwd: "../my-app",
      // CI sets E2E_BASE_URL to the 127.0.0.1 address; locally this finds
      // the `npm run dev` already running on localhost
      url: BASE_URL,
      reuseExistingServer: !CI,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
