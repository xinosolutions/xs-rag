import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @xs-rag/api start:dev',
      url: 'http://localhost:4000/health',
      reuseExistingServer: true,
      timeout: 60000,
      cwd: '../..',
    },
    {
      command: 'pnpm --filter @xs-rag/web dev',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 60000,
      cwd: '../..',
    },
  ],
});
