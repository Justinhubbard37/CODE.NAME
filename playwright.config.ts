import { defineConfig, devices } from '@playwright/test';

/**
 * Phase 11, Slice 11.2 — End-to-end test configuration.
 *
 * The harness is a Tauri desktop app, but every Tauri/sidecar call in the
 * front-end is guarded by an `'__TAURI_INTERNALS__' in window` check and
 * degrades gracefully (in-memory KG store, synthetic model fallback). That lets
 * the whole UI run in a plain browser, so the user journey can be driven by
 * Playwright against the Vite dev server with the model endpoints mocked.
 *
 * The dev server is started automatically via `webServer` below.
 */
const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: 'on-first-retry',
    // Software WebGL so the lazy-loaded three.js graph renders in headless CI
    // without a GPU (it is not asserted on, but must not crash the React tree).
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
