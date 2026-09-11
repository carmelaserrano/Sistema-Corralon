import { defineConfig, devices } from '@playwright/test'
import { loadEnvFile } from 'node:process'

loadEnvFile('.env.qa.local')

export default defineConfig({
  testDir: './e2e',
  testMatch: 'smoke.spec.js',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  outputDir: 'qa/playwright/results',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'qa/playwright/report', open: 'never' }],
  ],
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
    // Traces can contain login credentials and session tokens. Keep disabled.
    trace: 'off',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --host localhost --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
