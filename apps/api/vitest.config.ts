import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Smoke testler için 10sn yeter; integration ileride genişler
    testTimeout: 10_000,
    hookTimeout: 10_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/scripts/**', 'src/index.ts'],
    },
  },
  resolve: {
    alias: {
      '@damga/shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@damga/db': path.resolve(__dirname, '../../packages/db/src'),
      '@damga/verification': path.resolve(__dirname, '../../packages/verification/src'),
    },
  },
});
