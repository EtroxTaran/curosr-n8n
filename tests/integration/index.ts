/**
 * Integration Tests Index
 * Re-exports setup utilities for test files
 */

export {
  setupIntegrationTests,
  teardownIntegrationTests,
  getTestContext,
  registerIntegrationTestHooks,
  createScopedTestContext,
  shouldSkipIfServiceUnavailable,
  isServiceAvailable,
  getMockN8nUrl,
  getDashboardApiUrl,
  type IntegrationTestContext,
} from './setup';
