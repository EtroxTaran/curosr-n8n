/**
 * E2E Test Setup
 * Requires all services to be running (n8n, PostgreSQL, S3, Qdrant, Graphiti)
 */

import { beforeAll, afterAll } from 'vitest';
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

// ============================================
// Global E2E Test State
// ============================================

export interface E2ETestContext {
  s3Client: S3Client;
  db: ReturnType<typeof postgres>;
  services: AllServicesStatus;
  testPrefix: string;
  n8nWebhookUrl: string;
  dashboardUrl: string;
}

let globalContext: E2ETestContext | null = null;

// ============================================
// Environment Configuration
// ============================================

const E2E_CONFIG = {
  // Use environment variables or defaults
  N8N_WEBHOOK_URL: process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook',
  DASHBOARD_URL: process.env.DASHBOARD_URL || 'http://localhost:3000',
  // E2E tests require all services
  REQUIRED_SERVICES: ['n8n', 'postgres', 's3'] as const,
  // Optional services (tests will skip related assertions if unavailable)
  OPTIONAL_SERVICES: ['qdrant', 'graphiti', 'redis'] as const,
  // Timeouts for E2E tests (longer than integration)
  WORKFLOW_TIMEOUT_MS: 300000, // 5 minutes per phase
  FULL_WORKFLOW_TIMEOUT_MS: 900000, // 15 minutes total
};

// ============================================
// Setup/Teardown Functions
// ============================================

/**
 * Global E2E setup - runs once before all E2E tests
 */
export async function setupE2ETests(): Promise<E2ETestContext> {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║     E2E Test Suite - Setup                                    ║');
  console.log('║     (Requires ALL services running)                           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Check all services with longer timeout for E2E
  console.log('Checking service availability (timeout: 10s per service)...\n');
  const services = await checkAllServices(10000);
  logServiceStatus(services);

  // Verify required services
  const missingRequired: string[] = [];
  for (const service of E2E_CONFIG.REQUIRED_SERVICES) {
    if (!services[service].available) {
      missingRequired.push(service);
    }
  }

  if (missingRequired.length > 0) {
    console.error('\n❌ Required services not available for E2E tests:');
    for (const service of missingRequired) {
      console.error(`   - ${service}: Not available`);
    }
    console.error('\nStart all services with: npm run test:env:up');
    console.error('Or for full E2E: docker-compose -f docker-compose.local-prod.yml up -d\n');
    throw new Error(`Required services not available: ${missingRequired.join(', ')}`);
  }

  // Warn about optional services
  const missingOptional: string[] = [];
  for (const service of E2E_CONFIG.OPTIONAL_SERVICES) {
    if (!services[service].available) {
      missingOptional.push(service);
    }
  }

  if (missingOptional.length > 0) {
    console.warn('\n⚠️  Optional services not available (some tests will be skipped):');
    for (const service of missingOptional) {
      console.warn(`   - ${service}`);
    }
  }

  // Create clients
  const s3Client = createTestS3Client();
  const db = createTestDbClient();

  // Ensure S3 bucket exists
  await ensureBucketExists(s3Client);

  // Generate unique test prefix for this E2E run
  const testPrefix = `e2e_${Date.now()}_`;

  const context: E2ETestContext = {
    s3Client,
    db,
    services,
    testPrefix,
    n8nWebhookUrl: E2E_CONFIG.N8N_WEBHOOK_URL,
    dashboardUrl: E2E_CONFIG.DASHBOARD_URL,
  };

  globalContext = context;

  console.log('\n✓ E2E test setup complete');
  console.log(`  Test prefix: ${testPrefix}`);
  console.log(`  n8n URL: ${context.n8nWebhookUrl}`);
  console.log(`  Dashboard URL: ${context.dashboardUrl}`);
  console.log('\n════════════════════════════════════════════════════════════════\n');

  return context;
}

/**
 * Global E2E teardown - runs once after all E2E tests
 */
export async function teardownE2ETests(): Promise<void> {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('E2E Test Suite - Teardown');
  console.log('════════════════════════════════════════════════════════════════\n');

  if (!globalContext) {
    console.log('No context to clean up');
    return;
  }

  const { s3Client, db, testPrefix } = globalContext;

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

  console.log('\n✓ E2E test teardown complete\n');
}

/**
 * Get the global E2E test context
 */
export function getE2EContext(): E2ETestContext {
  if (!globalContext) {
    throw new Error('E2E test context not initialized. Call setupE2ETests() first.');
  }
  return globalContext;
}

// ============================================
// Vitest Hooks
// ============================================

/**
 * Register global E2E setup/teardown hooks
 */
export function registerE2ETestHooks(): void {
  beforeAll(async () => {
    await setupE2ETests();
  }, E2E_CONFIG.FULL_WORKFLOW_TIMEOUT_MS);

  afterAll(async () => {
    await teardownE2ETests();
  });
}

// ============================================
// E2E Test Helpers
// ============================================

/**
 * Check if n8n workflows are deployed and active
 */
export async function checkWorkflowsDeployed(): Promise<boolean> {
  const ctx = getE2EContext();

  try {
    // Try to hit the start-project webhook
    const response = await fetch(`${ctx.n8nWebhookUrl}/start-project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true }),
    });

    // 404 means workflow not deployed
    // 400 means workflow exists but request was invalid (which is expected)
    return response.status !== 404;
  } catch {
    return false;
  }
}

/**
 * Get E2E timeouts
 */
export const E2E_TIMEOUTS = {
  WORKFLOW_PHASE: E2E_CONFIG.WORKFLOW_TIMEOUT_MS,
  FULL_WORKFLOW: E2E_CONFIG.FULL_WORKFLOW_TIMEOUT_MS,
  WEBHOOK_RESPONSE: 30000,
  FILE_UPLOAD: 10000,
  DATABASE_QUERY: 5000,
};

/**
 * Skip test if workflows are not deployed
 */
export async function skipIfWorkflowsNotDeployed(): Promise<boolean> {
  const deployed = await checkWorkflowsDeployed();
  if (!deployed) {
    console.log('   ⏭️  Skipping: n8n workflows not deployed');
    return true;
  }
  return false;
}
