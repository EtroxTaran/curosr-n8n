/**
 * Service availability detection utilities for integration tests
 * Provides graceful skip patterns when services are unavailable
 */

import { S3Client, CreateBucketCommand } from '@aws-sdk/client-s3';
import postgres from 'postgres';

// Environment configuration with defaults for test environment
export const TEST_CONFIG = {
  S3_ENDPOINT: process.env.S3_ENDPOINT || 'http://localhost:8888',
  S3_ACCESS_KEY: process.env.S3_ACCESS_KEY || 'testadmin',
  S3_SECRET_KEY: process.env.S3_SECRET_KEY || 'testsecret123',
  S3_BUCKET: process.env.S3_BUCKET || 'product-factory-artifacts',
  DATABASE_URL: process.env.DATABASE_URL || 'postgres://n8n:n8n@localhost:5432/dashboard',
  N8N_WEBHOOK_URL: process.env.N8N_WEBHOOK_URL || 'http://localhost:5678',
  N8N_API_URL: process.env.N8N_API_URL || 'http://localhost:5678',
  QDRANT_URL: process.env.QDRANT_URL || 'http://localhost:6333',
  GRAPHITI_URL: process.env.GRAPHITI_URL || 'http://localhost:8000',
  REDIS_URL: process.env.REDIS_URL || 'redis://:testpassword@localhost:6379',
};

export interface ServiceStatus {
  available: boolean;
  version?: string;
  error?: string;
  responseTimeMs?: number;
}

export interface AllServicesStatus {
  n8n: ServiceStatus;
  postgres: ServiceStatus;
  s3: ServiceStatus;
  qdrant: ServiceStatus;
  graphiti: ServiceStatus;
  redis: ServiceStatus;
}

/**
 * Generic timeout wrapper for any promise
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage = 'Operation timed out'
): Promise<T | null> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => resolve(null), timeoutMs);
  });

  const result = await Promise.race([promise, timeoutPromise]);
  clearTimeout(timeoutId!);
  return result;
}

/**
 * Check n8n health endpoint
 */
export async function checkN8nConnectivity(
  url = TEST_CONFIG.N8N_WEBHOOK_URL
): Promise<ServiceStatus> {
  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(`${url}/healthz`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    return {
      available: response.ok,
      responseTimeMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      available: false,
      error: err instanceof Error ? err.message : 'Unknown error',
      responseTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Check PostgreSQL connectivity
 */
export async function checkPostgresConnectivity(
  url = TEST_CONFIG.DATABASE_URL
): Promise<ServiceStatus> {
  const startTime = Date.now();
  try {
    const testDb = postgres(url, {
      connect_timeout: 2,
      idle_timeout: 2,
      max_lifetime: 2,
    });

    const result = await testDb`SELECT version()`;
    await testDb.end();

    return {
      available: true,
      version: result[0]?.version?.split(' ')[1] || 'unknown',
      responseTimeMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      available: false,
      error: err instanceof Error ? err.message : 'Unknown error',
      responseTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Check S3/SeaweedFS connectivity
 */
export async function checkS3Connectivity(
  s3Client?: S3Client,
  bucket = TEST_CONFIG.S3_BUCKET
): Promise<ServiceStatus> {
  const startTime = Date.now();
  const client =
    s3Client ||
    new S3Client({
      endpoint: TEST_CONFIG.S3_ENDPOINT,
      region: 'us-east-1',
      credentials: {
        accessKeyId: TEST_CONFIG.S3_ACCESS_KEY,
        secretAccessKey: TEST_CONFIG.S3_SECRET_KEY,
      },
      forcePathStyle: true,
    });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      await client.send(
        new CreateBucketCommand({ Bucket: bucket }),
        { abortSignal: controller.signal }
      );
      clearTimeout(timeout);
      return {
        available: true,
        responseTimeMs: Date.now() - startTime,
      };
    } catch (createErr: unknown) {
      clearTimeout(timeout);
      // Bucket already exists = connected successfully
      if (createErr && typeof createErr === 'object') {
        const errName =
          'name' in createErr ? (createErr as { name: string }).name : '';
        const errCode =
          '$metadata' in createErr
            ? (createErr as { $metadata?: { httpStatusCode?: number } }).$metadata
                ?.httpStatusCode
            : 0;

        if (
          errName === 'BucketAlreadyOwnedByYou' ||
          errName === 'BucketAlreadyExists' ||
          errCode === 409 ||
          errCode === 200
        ) {
          return {
            available: true,
            responseTimeMs: Date.now() - startTime,
          };
        }
      }
      throw createErr;
    }
  } catch (err) {
    return {
      available: false,
      error: err instanceof Error ? err.message : 'Unknown error',
      responseTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Check Qdrant vector database connectivity
 */
export async function checkQdrantConnectivity(
  url = TEST_CONFIG.QDRANT_URL
): Promise<ServiceStatus> {
  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(`${url}/collections`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      return {
        available: true,
        version: data.time?.toString() || 'unknown',
        responseTimeMs: Date.now() - startTime,
      };
    }

    return {
      available: false,
      error: `HTTP ${response.status}`,
      responseTimeMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      available: false,
      error: err instanceof Error ? err.message : 'Unknown error',
      responseTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Check Graphiti knowledge graph connectivity
 */
export async function checkGraphitiConnectivity(
  url = TEST_CONFIG.GRAPHITI_URL
): Promise<ServiceStatus> {
  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(`${url}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    return {
      available: response.ok,
      responseTimeMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      available: false,
      error: err instanceof Error ? err.message : 'Unknown error',
      responseTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Check Redis connectivity
 */
export async function checkRedisConnectivity(
  url = TEST_CONFIG.REDIS_URL
): Promise<ServiceStatus> {
  const startTime = Date.now();
  try {
    // Parse Redis URL to extract host and port
    const match = url.match(/redis:\/\/(?::([^@]+)@)?([^:]+):(\d+)/);
    if (!match) {
      return { available: false, error: 'Invalid Redis URL' };
    }

    const [, password, host, port] = match;

    // Use TCP connection check via fetch to a health endpoint
    // Since we can't use Redis client directly, we check if the port is open
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    // Try to connect to Redis port
    try {
      const net = await import('net');
      const socket = new net.Socket();

      const connected = await new Promise<boolean>((resolve) => {
        socket.connect(parseInt(port), host, () => {
          socket.destroy();
          resolve(true);
        });
        socket.on('error', () => {
          socket.destroy();
          resolve(false);
        });
        setTimeout(() => {
          socket.destroy();
          resolve(false);
        }, 2000);
      });

      clearTimeout(timeout);
      return {
        available: connected,
        responseTimeMs: Date.now() - startTime,
      };
    } catch {
      clearTimeout(timeout);
      return {
        available: false,
        error: 'Could not check Redis connectivity',
        responseTimeMs: Date.now() - startTime,
      };
    }
  } catch (err) {
    return {
      available: false,
      error: err instanceof Error ? err.message : 'Unknown error',
      responseTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Check all services in parallel with timeouts
 */
export async function checkAllServices(
  timeoutMs = 3000
): Promise<AllServicesStatus> {
  const [n8n, postgres, s3, qdrant, graphiti, redis] = await Promise.all([
    withTimeout(checkN8nConnectivity(), timeoutMs).then(
      (r) => r || { available: false, error: 'Timeout' }
    ),
    withTimeout(checkPostgresConnectivity(), timeoutMs).then(
      (r) => r || { available: false, error: 'Timeout' }
    ),
    withTimeout(checkS3Connectivity(), timeoutMs).then(
      (r) => r || { available: false, error: 'Timeout' }
    ),
    withTimeout(checkQdrantConnectivity(), timeoutMs).then(
      (r) => r || { available: false, error: 'Timeout' }
    ),
    withTimeout(checkGraphitiConnectivity(), timeoutMs).then(
      (r) => r || { available: false, error: 'Timeout' }
    ),
    withTimeout(checkRedisConnectivity(), timeoutMs).then(
      (r) => r || { available: false, error: 'Timeout' }
    ),
  ]);

  return { n8n, postgres, s3, qdrant, graphiti, redis };
}

/**
 * Wait for specific services to become available
 */
export async function waitForServices(
  services: (keyof AllServicesStatus)[],
  maxWaitMs = 60000,
  pollIntervalMs = 2000
): Promise<AllServicesStatus> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const status = await checkAllServices();
    const allRequiredAvailable = services.every((s) => status[s].available);

    if (allRequiredAvailable) {
      return status;
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  // Return final status even if not all services are available
  return checkAllServices();
}

/**
 * Check if service is unavailable and log skip message
 * Returns true if the test should be skipped (use in beforeEach)
 */
export function shouldSkipIfServiceUnavailable(
  status: ServiceStatus,
  serviceName: string
): boolean {
  if (!status.available) {
    console.log(`   ⏭️  Skipping: ${serviceName} not available`);
    return true;
  }
  return false;
}

/**
 * Log service availability status
 */
export function logServiceStatus(status: AllServicesStatus): void {
  console.log('\n📋 Integration Tests - Service Availability:');
  const formatStatus = (s: ServiceStatus, name: string) =>
    `   ${name.padEnd(12)}: ${s.available ? '✅ Available' : '⏭️  Skipped'}${
      s.version ? ` (v${s.version})` : ''
    }${s.error ? ` - ${s.error}` : ''}`;

  console.log(formatStatus(status.n8n, 'n8n'));
  console.log(formatStatus(status.postgres, 'PostgreSQL'));
  console.log(formatStatus(status.s3, 'S3'));
  console.log(formatStatus(status.qdrant, 'Qdrant'));
  console.log(formatStatus(status.graphiti, 'Graphiti'));
  console.log(formatStatus(status.redis, 'Redis'));
  console.log('');

  const availableCount = Object.values(status).filter((s) => s.available).length;
  if (availableCount === 0) {
    console.log('   ℹ️  No services available. Start Docker Compose:');
    console.log('      npm run test:env:up\n');
  }
}

/**
 * Create S3 client with test configuration
 */
export function createTestS3Client(): S3Client {
  return new S3Client({
    endpoint: TEST_CONFIG.S3_ENDPOINT,
    region: 'us-east-1',
    credentials: {
      accessKeyId: TEST_CONFIG.S3_ACCESS_KEY,
      secretAccessKey: TEST_CONFIG.S3_SECRET_KEY,
    },
    forcePathStyle: true,
  });
}

/**
 * Create PostgreSQL client with test configuration
 */
export function createTestDbClient(): ReturnType<typeof postgres> {
  return postgres(TEST_CONFIG.DATABASE_URL, {
    connect_timeout: 5,
    idle_timeout: 10,
  });
}
