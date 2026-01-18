import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest configuration for integration tests
 *
 * Integration tests use real PostgreSQL, S3, and mock n8n server.
 * They require docker-compose.test.yml services to be running.
 *
 * Usage: npm run test:integration
 */
export default defineConfig({
  test: {
    globals: true,
    include: ['tests/integration/**/*.test.ts'],
    exclude: ['node_modules/**', 'frontend/**'],

    // Integration tests need longer timeouts for service communication
    testTimeout: 60000,    // 60s per test
    hookTimeout: 30000,    // 30s for setup/teardown

    // Run tests sequentially to avoid DB/S3 state conflicts
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,  // Run all tests in single fork
      },
    },

    // Retry flaky tests once
    retry: 1,

    // Reporter configuration
    reporters: ['verbose'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage/integration',
      include: [
        'frontend/lib/**/*.ts',
        'frontend/app/routes/api/**/*.ts',
      ],
      exclude: [
        'node_modules/**',
        '**/*.test.ts',
        '**/*.config.ts',
        'frontend/tests/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './frontend'),
      '@tests': path.resolve(__dirname, './tests'),
    },
  },
});
