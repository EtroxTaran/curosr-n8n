/**
 * Integration Test Setup
 * Handles global setup/teardown for integration tests
 */

import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import type { S3Client } from '@aws-sdk/client-s3';
import type postgres from 'postgres';
import {
  checkAllServices,
  waitForServices,
  logServiceStatus,
  createTestS3Client,
  createTestDbClient,
  type AllServicesStatus,
} from '../helpers/service-availability';
import {
  ensureBucketExists,
  cleanupByTestPrefix as cleanupS3ByTestPrefix,
} from '../helpers/s3-helpers';
import {
  cleanupByTestPrefix as cleanupDbByTestPrefix,
} from '../helpers/db-helpers';
import { MockN8nServer } from '../mocks/mock-n8n-server';

// ============================================
// Global Test State
// ============================================

export interface IntegrationTestContext {
  s3Client: S3Client;
  db: ReturnType<typeof postgres>;
  mockN8n: MockN8nServer;
  services: AllServicesStatus;
  testPrefix: string;
  dashboardAvailable: boolean;
}

let globalContext: IntegrationTestContext | null = null;

// ============================================
// Setup/Teardown Functions
// ============================================

/**
 * Global setup - runs once before all integration tests
 */
export async function setupIntegrationTests(): Promise<IntegrationTestContext> {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║     Integration Test Suite - Setup                           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Check service availability
  console.log('Checking service availability...\n');
  const services = await checkAllServices(5000);
  logServiceStatus(services);

  // Require at least PostgreSQL and S3 for integration tests
  if (!services.postgres.available || !services.s3.available) {
    console.error('\n❌ Required services not available:');
    if (!services.postgres.available) console.error('   - PostgreSQL: Not available');
    if (!services.s3.available) console.error('   - S3: Not available');
    console.error('\nStart required services with: npm run test:env:up\n');
    throw new Error('Required services not available for integration tests');
  }

  // Create clients
  const s3Client = createTestS3Client();
  const db = createTestDbClient();

  // Ensure S3 bucket exists
  await ensureBucketExists(s3Client);

  // Start mock n8n server (use port 5679 to avoid conflict with real n8n)
  const mockN8n = new MockN8nServer();
  await mockN8n.start(5679);
  console.log('\n✓ Mock n8n server started on port 5679');

  // Check if dashboard is available (quick check with 2s timeout)
  let dashboardAvailable = false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const dashboardResponse = await fetch('http://localhost:3000/api/health', {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    dashboardAvailable = dashboardResponse.ok;
  } catch {
    dashboardAvailable = false;
  }

  if (dashboardAvailable) {
    console.log('✓ Dashboard API is available at http://localhost:3000');
  } else {
    console.log('⚠ Dashboard API not available - API integration tests will be skipped');
  }

  // Generate unique test prefix for this run
  const testPrefix = `inttest_${Date.now()}_`;

  const context: IntegrationTestContext = {
    s3Client,
    db,
    mockN8n,
    services,
    testPrefix,
    dashboardAvailable,
  };

  globalContext = context;

  console.log('\n✓ Integration test setup complete\n');
  console.log('════════════════════════════════════════════════════════════════\n');

  return context;
}

/**
 * Global teardown - runs once after all integration tests
 */
export async function teardownIntegrationTests(): Promise<void> {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('Integration Test Suite - Teardown');
  console.log('════════════════════════════════════════════════════════════════\n');

  if (!globalContext) {
    console.log('No context to clean up');
    return;
  }

  const { s3Client, db, mockN8n, testPrefix } = globalContext;

  // Stop mock n8n server
  await mockN8n.stop();
  console.log('✓ Mock n8n server stopped');

  // Clean up test data from S3
  try {
    const s3Deleted = await cleanupS3ByTestPrefix(s3Client, testPrefix);
    console.log(`✓ Cleaned up ${s3Deleted} files from S3`);
  } catch (error) {
    console.warn('⚠ S3 cleanup failed:', error);
  }

  // Clean up test data from database
  try {
    const dbResult = await cleanupDbByTestPrefix(db, testPrefix);
    console.log(`✓ Cleaned up ${dbResult.deleted} projects from database`);
  } catch (error) {
    console.warn('⚠ Database cleanup failed:', error);
  }

  // Close database connection
  try {
    await db.end();
    console.log('✓ Database connection closed');
  } catch (error) {
    console.warn('⚠ Failed to close database connection:', error);
  }

  globalContext = null;

  console.log('\n✓ Integration test teardown complete\n');
}

/**
 * Get the global test context
 */
export function getTestContext(): IntegrationTestContext {
  if (!globalContext) {
    throw new Error('Integration test context not initialized. Call setupIntegrationTests() first.');
  }
  return globalContext;
}

// ============================================
// Vitest Hooks
// ============================================

/**
 * Register global setup/teardown hooks
 */
export function registerIntegrationTestHooks(): void {
  beforeAll(async () => {
    await setupIntegrationTests();
  });

  afterAll(async () => {
    await teardownIntegrationTests();
  });
}

/**
 * Create a scoped test context for a single test file
 * This provides test isolation with unique prefixes
 */
export function createScopedTestContext(suiteName: string): {
  setup: () => Promise<IntegrationTestContext & { suitePrefix: string }>;
  teardown: () => Promise<void>;
} {
  let suiteContext: (IntegrationTestContext & { suitePrefix: string }) | null = null;

  return {
    async setup() {
      const ctx = getTestContext();
      const suitePrefix = `${ctx.testPrefix}${suiteName}_`;

      suiteContext = {
        ...ctx,
        suitePrefix,
      };

      return suiteContext;
    },

    async teardown() {
      if (!suiteContext) return;

      const { s3Client, db, suitePrefix } = suiteContext;

      // Clean up suite-specific data
      try {
        await cleanupS3ByTestPrefix(s3Client, `projects/${suitePrefix}`);
      } catch {
        // Ignore cleanup errors
      }

      try {
        await cleanupDbByTestPrefix(db, suitePrefix);
      } catch {
        // Ignore cleanup errors
      }

      suiteContext = null;
    },
  };
}

// ============================================
// Test Helpers
// ============================================

/**
 * Check if a service is unavailable and log skip message
 * Returns true if the test should be skipped
 */
export function shouldSkipIfServiceUnavailable(
  serviceName: 'n8n' | 'postgres' | 's3' | 'qdrant' | 'graphiti' | 'redis'
): boolean {
  const ctx = getTestContext();
  const status = ctx.services[serviceName];

  if (!status.available) {
    console.log(`⏭️  Skipping: ${serviceName} not available`);
    return true;
  }
  return false;
}

/**
 * Check if a service is available
 */
export function isServiceAvailable(
  serviceName: 'n8n' | 'postgres' | 's3' | 'qdrant' | 'graphiti' | 'redis'
): boolean {
  const ctx = getTestContext();
  return ctx.services[serviceName].available;
}

/**
 * Get the mock n8n base URL
 */
export function getMockN8nUrl(): string {
  return 'http://localhost:5679';
}

/**
 * Get the dashboard API base URL
 */
export function getDashboardApiUrl(): string {
  return 'http://localhost:3000/api';
}

/**
 * Check if dashboard API is available
 */
export function isDashboardAvailable(): boolean {
  const ctx = getTestContext();
  return ctx.dashboardAvailable;
}

/**
 * Wrapper for fetch with fast timeout for dashboard API calls
 * Returns null if dashboard is not available instead of hanging
 */
export async function fetchDashboardApi(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response | null> {
  const ctx = getTestContext();
  if (!ctx.dashboardAvailable) {
    console.log(`   ⏭️  Skipping: Dashboard API not available`);
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

  try {
    const response = await fetch(`${getDashboardApiUrl()}${endpoint}`, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response;
  } catch (err) {
    clearTimeout(timeout);
    console.log(`   ⏭️  Dashboard API request failed: ${err}`);
    return null;
  }
}
