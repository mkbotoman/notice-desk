import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.{ts,mjs}'],
    exclude: ['**/node_modules/**', '.claude/**'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // Pure logic that must stay fully branch-covered. Contracts hold no logic of their own.
      include: ['src/domain/**', 'scripts/ingest/**'],
      exclude: [
        '**/*.test.*',
        'src/domain/types.ts',
        'src/domain/schemas.ts',
        'scripts/ingest/index.ts',
      ],
      thresholds: {
        'src/domain/**': { branches: 100 },
        'scripts/ingest/**': { branches: 90, lines: 95 },
      },
    },
  },
});
