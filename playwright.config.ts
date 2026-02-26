import { defineConfig, devices } from "@playwright/test";

const frontendBaseUrl = process.env.FRONTEND_BASE_URL || "http://localhost:5174";
const apiBaseUrl = process.env.API_BASE_URL || "http://localhost:5000";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: frontendBaseUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    headless: true,
  },
  webServer: [
    {
      command: "npm run start",
      cwd: "backend",
      port: 5000,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        NODE_ENV: "test",
        LOGIN_RATE_LIMIT_MAX: "1000",
        LOGIN_RATE_LIMIT_WINDOW_MS: "1000",
      },
    },
    {
      command: "npx vite --host 0.0.0.0 --port 5174 --strictPort",
      cwd: "frontend/admin-dashboard",
      port: 5174,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "npx vite --host 0.0.0.0 --port 5173 --strictPort",
      cwd: "frontend/user-app",
      port: 5173,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "chromium",
      testMatch: ["tests/e2e/**/*.spec.ts"],
      use: {
        ...devices["Desktop Chrome"],
        baseURL: frontendBaseUrl,
      },
    },
    {
      name: "api",
      testMatch: ["tests/api/**/*.spec.ts"],
      use: {
        baseURL: apiBaseUrl,
      },
    },
  ],
});
