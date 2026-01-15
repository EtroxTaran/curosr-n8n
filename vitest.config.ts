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
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './frontend'),
    },
  },
});
