import { defineConfig } from 'vitest/config';
import path from 'path';

// Root vitest config - for backend tests only
// Frontend tests run separately in frontend/ directory
export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules/**', 'frontend/**'],
    testTimeout: 30000, // 30s for integration tests
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage/backend',
      include: ['tests/**/*.ts'],
      exclude: [
        'node_modules/**',
        'frontend/**',
        '**/*.test.ts',
        '**/*.config.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './frontend'),
    },
  },
});
