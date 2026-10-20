import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export default defineConfig({
  testDir: './e2e', testMatch: 'a2ui-runtime.spec.mjs', workers: 1, timeout: 60_000,
  outputDir: 'output/playwright/a2ui-runtime-results',
  reporter: [['list'], ['json', { outputFile: 'output/playwright/a2ui-runtime-report.json' }]],
  metadata: { scope: 'Real FastAPI, LangGraph, SQLite, production Web build and Chromium; no API/SSE interception' },
  use: {
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {},
    viewport: { width: 1440, height: 1100 }, trace: 'retain-on-failure',
  },
});
