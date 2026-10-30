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
    env: {
      ACCESS_PASSWORD: 'e2e-password',
      // Blank, not absent: Next would otherwise fill them from .env.local and the tests would make
      // real, billed gateway calls. With no credentials the AI routes take their fallback path.
      AI_GATEWAY_API_KEY: '',
      VERCEL_OIDC_TOKEN: '',
    },
  },
});
