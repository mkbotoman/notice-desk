import { defineConfig } from '@playwright/test';

// A separate port and a throwaway password, so the tests never touch a dev server or real secrets.
// Set E2E_PORT to run several copies at once (for example from different git worktrees).
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `pnpm build && pnpm start -p ${PORT}`,
    url: `http://localhost:${PORT}/gate`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: { ACCESS_PASSWORD: 'e2e-password' },
  },
});
