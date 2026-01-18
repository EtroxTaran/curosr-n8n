import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest configuration for end-to-end tests
 *
 * E2E tests require ALL services to be running including:
 * - PostgreSQL
 * - SeaweedFS (S3)
 * - n8n with workflows deployed
 * - Qdrant
 * - Graphiti
 *
 * These tests execute complete workflow scenarios and may take 15-30 minutes.
 *
 * Usage: npm run test:e2e
 */
export default defineConfig({
  test: {
    globals: true,
    include: ['tests/e2e/**/*.test.ts'],
    exclude: ['node_modules/**', 'frontend/**'],

    // E2E tests need very long timeouts for full workflow execution
    testTimeout: 1800000,   // 30 minutes per test
    hookTimeout: 120000,    // 2 minutes for setup/teardown

    // Run tests sequentially - E2E tests are expensive
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,  // Run all tests in single fork
      },
    },

    // No retry for E2E - they should be deterministic
    retry: 0,

    // Reporter configuration
    reporters: ['verbose'],

    // No coverage for E2E tests - use integration tests for coverage
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './frontend'),
      '@tests': path.resolve(__dirname, './tests'),
    },
  },
});
