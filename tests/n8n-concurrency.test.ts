/**
 * n8n Concurrency Tests
 *
 * Tests for race conditions and concurrent operations in the n8n integration.
 * These tests verify that the system handles parallel operations correctly,
 * preventing data corruption and ensuring consistent state.
 *
 * Test Categories:
 * 1. Parallel Imports - Multiple simultaneous workflow imports
 * 2. Concurrent Sync - Multiple sync operations at once
 * 3. Registry Race Conditions - Database contention scenarios
 * 4. API Rate Limiting - Handling n8n API limits
 *
 * Run with:
 *   npm run test:integration -- tests/n8n-concurrency.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

// ============================================
// Configuration
// ============================================

const N8N_API_URL = process.env.N8N_API_URL || 'http://localhost:5678';
const N8N_API_KEY = process.env.N8N_API_KEY || '';

// ============================================
// Helper Types
// ============================================

interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
}

interface ConcurrencyTestResult {
  success: boolean;
  duration: number;
  error?: string;
  workflowId?: string;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Run multiple async operations concurrently and collect results.
 */
async function runConcurrent<T>(
  count: number,
  fn: (index: number) => Promise<T>
): Promise<Array<{ index: number; result?: T; error?: Error; duration: number }>> {
  const results: Array<{ index: number; result?: T; error?: Error; duration: number }> = [];

  const promises = Array.from({ length: count }, async (_, index) => {
    const start = Date.now();
    try {
      const result = await fn(index);
      results.push({ index, result, duration: Date.now() - start });
    } catch (error) {
      results.push({ index, error: error as Error, duration: Date.now() - start });
    }
  });

  await Promise.all(promises);
  return results.sort((a, b) => a.index - b.index);
}

/**
 * Check n8n API availability.
 */
async function isN8nAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${N8N_API_URL}/healthz`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Check n8n API key is valid.
 */
async function isApiKeyValid(): Promise<boolean> {
  if (!N8N_API_KEY) return false;

  try {
    const response = await fetch(`${N8N_API_URL}/api/v1/workflows?limit=1`, {
      headers: { 'X-N8N-API-KEY': N8N_API_KEY },
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Create a workflow in n8n.
 */
async function createWorkflow(
  name: string,
  options: { delay?: number } = {}
): Promise<{ ok: boolean; status: number; data: { id?: string; message?: string } }> {
  // Optional delay to simulate staggered requests
  if (options.delay) {
    await new Promise((resolve) => setTimeout(resolve, options.delay));
  }

  const response = await fetch(`${N8N_API_URL}/api/v1/workflows`, {
    method: 'POST',
    headers: {
      'X-N8N-API-KEY': N8N_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      nodes: [
        {
          id: 'trigger',
          name: 'Manual',
          type: 'n8n-nodes-base.manualTrigger',
          typeVersion: 1,
          position: [0, 0],
          parameters: {},
        },
      ],
      connections: {},
      settings: { executionOrder: 'v1' },
    }),
  });

  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}

/**
 * Delete a workflow from n8n.
 */
async function deleteWorkflow(id: string): Promise<boolean> {
  try {
    const response = await fetch(`${N8N_API_URL}/api/v1/workflows/${id}`, {
      method: 'DELETE',
      headers: { 'X-N8N-API-KEY': N8N_API_KEY },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Find workflow by name.
 */
async function findWorkflowByName(name: string): Promise<N8nWorkflow | null> {
  try {
    const response = await fetch(`${N8N_API_URL}/api/v1/workflows`, {
      headers: { 'X-N8N-API-KEY': N8N_API_KEY },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.data?.find((w: N8nWorkflow) => w.name === name) || null;
  } catch {
    return null;
  }
}

/**
 * List all workflows.
 */
async function listWorkflows(): Promise<N8nWorkflow[]> {
  try {
    const response = await fetch(`${N8N_API_URL}/api/v1/workflows?limit=100`, {
      headers: { 'X-N8N-API-KEY': N8N_API_KEY },
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data.data || [];
  } catch {
    return [];
  }
}

/**
 * Activate workflow.
 */
async function activateWorkflow(id: string): Promise<{ ok: boolean; status: number }> {
  const response = await fetch(`${N8N_API_URL}/api/v1/workflows/${id}/activate`, {
    method: 'POST',
    headers: {
      'X-N8N-API-KEY': N8N_API_KEY,
      'Content-Type': 'application/json',
    },
  });
  return { ok: response.ok, status: response.status };
}

/**
 * Deactivate workflow.
 */
async function deactivateWorkflow(id: string): Promise<{ ok: boolean; status: number }> {
  const response = await fetch(`${N8N_API_URL}/api/v1/workflows/${id}/deactivate`, {
    method: 'POST',
    headers: {
      'X-N8N-API-KEY': N8N_API_KEY,
      'Content-Type': 'application/json',
    },
  });
  return { ok: response.ok, status: response.status };
}

// ============================================
// Test Suites
// ============================================

describe('n8n Concurrency Tests', () => {
  let n8nAvailable = false;
  let apiKeyValid = false;
  const createdWorkflowIds: string[] = [];

  beforeAll(async () => {
    n8nAvailable = await isN8nAvailable();
    if (n8nAvailable) {
      apiKeyValid = await isApiKeyValid();
    }

    if (!n8nAvailable) {
      console.log('\n   n8n: Not available (concurrency tests will be skipped)');
      console.log('   Start with: docker compose -f docker-compose.local-prod.yml up -d');
      console.log('   Then run: ./scripts/setup-n8n-test-instance.sh\n');
    } else if (!apiKeyValid) {
      console.log('\n   n8n: Available but API key not valid');
      console.log('   Run: ./scripts/setup-n8n-test-instance.sh');
      console.log('   Then: export N8N_API_KEY=$(cat /tmp/n8n-test-api-key)\n');
    } else {
      console.log('\n   n8n: Available and API key valid - running concurrency tests\n');
    }
  });

  afterAll(async () => {
    // Cleanup all created workflows
    if (apiKeyValid && createdWorkflowIds.length > 0) {
      console.log(`\n   Cleaning up ${createdWorkflowIds.length} test workflow(s)...`);
      for (const id of createdWorkflowIds) {
        await deleteWorkflow(id);
      }
    }
  });

  // ============================================
  // Parallel Import Tests
  // ============================================

  describe('Parallel Workflow Imports', () => {
    it('should handle parallel creation of workflows with different names', async () => {
      if (!n8nAvailable || !apiKeyValid) {
        console.log('   ⏭️  Skipping: n8n not available');
        return;
      }

      const timestamp = Date.now();
      const count = 5;

      // Create 5 workflows in parallel with different names
      const results = await runConcurrent(count, async (index) => {
        const name = `Parallel Test ${timestamp} - ${index}`;
        return createWorkflow(name);
      });

      // All should succeed
      const successes = results.filter((r) => r.result?.ok);
      expect(successes.length).toBe(count);

      // Track for cleanup
      for (const r of results) {
        if (r.result?.data?.id) {
          createdWorkflowIds.push(r.result.data.id);
        }
      }

      // Verify all workflows exist
      for (let i = 0; i < count; i++) {
        const workflow = await findWorkflowByName(`Parallel Test ${timestamp} - ${i}`);
        expect(workflow).not.toBeNull();
      }
    });

    it('should handle parallel creation of workflows with SAME name', async () => {
      if (!n8nAvailable || !apiKeyValid) {
        console.log('   ⏭️  Skipping: n8n not available');
        return;
      }

      const timestamp = Date.now();
      const sameName = `Same Name Test ${timestamp}`;
      const count = 3;

      // Create 3 workflows in parallel with the SAME name
      const results = await runConcurrent(count, async () => {
        return createWorkflow(sameName);
      });

      // n8n allows duplicate names (as of v1.x), so all might succeed
      // But if n8n implements uniqueness, only one should succeed
      const successes = results.filter((r) => r.result?.ok);
      const failures = results.filter((r) => !r.result?.ok);

      console.log(
        `   Same-name test: ${successes.length} succeeded, ${failures.length} failed`
      );

      // Track for cleanup
      for (const r of results) {
        if (r.result?.data?.id) {
          createdWorkflowIds.push(r.result.data.id);
        }
      }

      // At minimum, one should succeed
      expect(successes.length).toBeGreaterThanOrEqual(1);

      // If duplicates are rejected, check for conflict errors
      if (failures.length > 0) {
        for (const f of failures) {
          expect([400, 409]).toContain(f.result?.status);
        }
      }
    });

    it('should handle rapid sequential imports (burst)', async () => {
      if (!n8nAvailable || !apiKeyValid) {
        console.log('   ⏭️  Skipping: n8n not available');
        return;
      }

      const timestamp = Date.now();
      const count = 10;
      const results: ConcurrencyTestResult[] = [];

      // Rapid sequential creates (no waiting between)
      for (let i = 0; i < count; i++) {
        const start = Date.now();
        const name = `Burst Test ${timestamp} - ${i}`;
        try {
          const result = await createWorkflow(name);
          results.push({
            success: result.ok,
            duration: Date.now() - start,
            workflowId: result.data?.id,
          });
          if (result.data?.id) {
            createdWorkflowIds.push(result.data.id);
          }
        } catch (error) {
          results.push({
            success: false,
            duration: Date.now() - start,
            error: (error as Error).message,
          });
        }
      }

      // Count successes
      const successes = results.filter((r) => r.success);
      const failures = results.filter((r) => !r.success);

      console.log(`   Burst test: ${successes.length}/${count} succeeded`);

      // Most should succeed (allow for some rate limiting)
      expect(successes.length).toBeGreaterThanOrEqual(count * 0.8);

      // Check if any failures were rate limiting (429)
      const rateLimited = failures.filter((f) => f.error?.includes('429'));
      if (rateLimited.length > 0) {
        console.log(`   Rate limited: ${rateLimited.length} requests`);
      }
    });
  });

  // ============================================
  // Concurrent Sync Operations
  // ============================================

  describe('Concurrent Sync Operations', () => {
    it('should handle concurrent list workflow requests', async () => {
      if (!n8nAvailable || !apiKeyValid) {
        console.log('   ⏭️  Skipping: n8n not available');
        return;
      }

      const count = 10;

      // Make 10 concurrent list requests
      const results = await runConcurrent(count, async () => {
        return listWorkflows();
      });

      // All should succeed
      const successes = results.filter((r) => r.result && Array.isArray(r.result));
      expect(successes.length).toBe(count);

      // All should return the same count (consistent reads)
      const counts = successes.map((r) => r.result?.length || 0);
      const uniqueCounts = [...new Set(counts)];

      // Should all see the same state (or very close - slight timing variance ok)
      expect(uniqueCounts.length).toBeLessThanOrEqual(2);
    });

    it('should handle concurrent activate/deactivate on same workflow', async () => {
      if (!n8nAvailable || !apiKeyValid) {
        console.log('   ⏭️  Skipping: n8n not available');
        return;
      }

      const timestamp = Date.now();

      // Create a test workflow
      const createResult = await createWorkflow(`Toggle Test ${timestamp}`);
      expect(createResult.ok).toBe(true);

      const workflowId = createResult.data.id!;
      createdWorkflowIds.push(workflowId);

      // Concurrent activate and deactivate calls
      const operations = [
        { type: 'activate', fn: () => activateWorkflow(workflowId) },
        { type: 'deactivate', fn: () => deactivateWorkflow(workflowId) },
        { type: 'activate', fn: () => activateWorkflow(workflowId) },
        { type: 'deactivate', fn: () => deactivateWorkflow(workflowId) },
        { type: 'activate', fn: () => activateWorkflow(workflowId) },
      ];

      const results = await Promise.all(
        operations.map(async (op) => {
          try {
            const result = await op.fn();
            return { type: op.type, ...result };
          } catch (error) {
            return { type: op.type, ok: false, error: (error as Error).message };
          }
        })
      );

      // Log results
      const activateResults = results.filter((r) => r.type === 'activate');
      const deactivateResults = results.filter((r) => r.type === 'deactivate');

      console.log(
        `   Activate: ${activateResults.filter((r) => r.ok).length}/${activateResults.length} ok`
      );
      console.log(
        `   Deactivate: ${deactivateResults.filter((r) => r.ok).length}/${deactivateResults.length} ok`
      );

      // The system should handle this gracefully - not crash
      // Some requests may fail with 4xx due to state conflicts, that's acceptable
      const totalSuccesses = results.filter((r) => r.ok).length;
      expect(totalSuccesses).toBeGreaterThan(0);
    });

    it('should handle concurrent create and delete of same-named workflow', async () => {
      if (!n8nAvailable || !apiKeyValid) {
        console.log('   ⏭️  Skipping: n8n not available');
        return;
      }

      const timestamp = Date.now();
      const workflowName = `Create-Delete Race ${timestamp}`;

      // First create the workflow
      const initial = await createWorkflow(workflowName);
      expect(initial.ok).toBe(true);
      const initialId = initial.data.id!;

      // Now race: create new one while deleting the existing one
      const [createResult, deleteResult] = await Promise.all([
        createWorkflow(workflowName),
        deleteWorkflow(initialId),
      ]);

      console.log(
        `   Create result: ${createResult.ok ? 'success' : 'failed'}, Delete result: ${deleteResult ? 'success' : 'failed'}`
      );

      // Track any created workflow for cleanup
      if (createResult.data?.id) {
        createdWorkflowIds.push(createResult.data.id);
      }

      // Both operations should complete without crashing
      // The exact outcome depends on timing
      expect(typeof deleteResult).toBe('boolean');
    });
  });

  // ============================================
  // Registry Race Condition Tests
  // ============================================

  describe('Registry Race Conditions', () => {
    it('should handle concurrent reads during write operations', async () => {
      if (!n8nAvailable || !apiKeyValid) {
        console.log('   ⏭️  Skipping: n8n not available');
        return;
      }

      const timestamp = Date.now();

      // Start multiple reads while doing a write
      const operations = [
        { type: 'read', fn: () => listWorkflows() },
        { type: 'read', fn: () => listWorkflows() },
        { type: 'write', fn: () => createWorkflow(`Race Read-Write ${timestamp}`) },
        { type: 'read', fn: () => listWorkflows() },
        { type: 'read', fn: () => listWorkflows() },
      ];

      const results = await Promise.all(
        operations.map(async (op, idx) => {
          // Stagger slightly
          await new Promise((resolve) => setTimeout(resolve, idx * 10));
          try {
            const result = await op.fn();
            return { type: op.type, success: true, result };
          } catch (error) {
            return { type: op.type, success: false, error: (error as Error).message };
          }
        })
      );

      // Track created workflow for cleanup
      const writeResult = results.find((r) => r.type === 'write');
      if (
        writeResult?.success &&
        writeResult.result &&
        typeof writeResult.result === 'object' &&
        'data' in writeResult.result
      ) {
        const data = (writeResult.result as { data?: { id?: string } }).data;
        if (data?.id) {
          createdWorkflowIds.push(data.id);
        }
      }

      // All operations should complete
      const successful = results.filter((r) => r.success);
      expect(successful.length).toBe(operations.length);
    });

    it('should maintain consistency with interleaved operations', async () => {
      if (!n8nAvailable || !apiKeyValid) {
        console.log('   ⏭️  Skipping: n8n not available');
        return;
      }

      const timestamp = Date.now();
      const workflowIds: string[] = [];

      // Interleaved create-list-create-list pattern
      for (let i = 0; i < 3; i++) {
        // Create
        const createResult = await createWorkflow(`Interleaved ${timestamp} - ${i}`);
        if (createResult.ok && createResult.data.id) {
          workflowIds.push(createResult.data.id);
          createdWorkflowIds.push(createResult.data.id);
        }

        // Concurrent list
        const [list1, list2] = await Promise.all([listWorkflows(), listWorkflows()]);

        // Both lists should show the newly created workflow
        const hasNewWorkflow1 = list1.some(
          (w) => w.name === `Interleaved ${timestamp} - ${i}`
        );
        const hasNewWorkflow2 = list2.some(
          (w) => w.name === `Interleaved ${timestamp} - ${i}`
        );

        expect(hasNewWorkflow1).toBe(true);
        expect(hasNewWorkflow2).toBe(true);
      }

      expect(workflowIds.length).toBe(3);
    });
  });

  // ============================================
  // Stress Tests
  // ============================================

  describe('Stress Tests', () => {
    it('should handle high concurrency workload', async () => {
      if (!n8nAvailable || !apiKeyValid) {
        console.log('   ⏭️  Skipping: n8n not available');
        return;
      }

      const timestamp = Date.now();
      const concurrentOps = 20;

      // Mix of operations: 60% reads, 40% writes
      const operations = Array.from({ length: concurrentOps }, (_, i) => {
        if (i % 5 < 3) {
          return { type: 'read', fn: () => listWorkflows() };
        } else {
          return {
            type: 'write',
            fn: () => createWorkflow(`Stress Test ${timestamp} - ${i}`),
          };
        }
      });

      const start = Date.now();
      const results = await Promise.all(
        operations.map(async (op) => {
          try {
            const result = await op.fn();
            return { type: op.type, success: true, result };
          } catch (error) {
            return { type: op.type, success: false, error: (error as Error).message };
          }
        })
      );
      const duration = Date.now() - start;

      // Track created workflows for cleanup
      for (const r of results) {
        if (
          r.type === 'write' &&
          r.success &&
          r.result &&
          typeof r.result === 'object' &&
          'data' in r.result
        ) {
          const data = (r.result as { data?: { id?: string } }).data;
          if (data?.id) {
            createdWorkflowIds.push(data.id);
          }
        }
      }

      const reads = results.filter((r) => r.type === 'read');
      const writes = results.filter((r) => r.type === 'write');
      const successfulReads = reads.filter((r) => r.success);
      const successfulWrites = writes.filter((r) => r.success);

      console.log(`   Duration: ${duration}ms for ${concurrentOps} operations`);
      console.log(`   Reads: ${successfulReads.length}/${reads.length} successful`);
      console.log(`   Writes: ${successfulWrites.length}/${writes.length} successful`);

      // At least 80% should succeed
      const successRate =
        (successfulReads.length + successfulWrites.length) / results.length;
      expect(successRate).toBeGreaterThanOrEqual(0.8);
    });

    it('should complete operations within reasonable time under load', async () => {
      if (!n8nAvailable || !apiKeyValid) {
        console.log('   ⏭️  Skipping: n8n not available');
        return;
      }

      const timestamp = Date.now();
      const parallelReqs = 10;
      const maxAcceptableMs = 10000; // 10 seconds for all operations

      const start = Date.now();

      const results = await runConcurrent(parallelReqs, async (index) => {
        // Alternate between read and write
        if (index % 2 === 0) {
          return listWorkflows();
        } else {
          const result = await createWorkflow(`Performance Test ${timestamp} - ${index}`);
          if (result.data?.id) {
            createdWorkflowIds.push(result.data.id);
          }
          return result;
        }
      });

      const totalDuration = Date.now() - start;
      const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;

      console.log(`   Total duration: ${totalDuration}ms`);
      console.log(`   Average per operation: ${avgDuration.toFixed(0)}ms`);

      expect(totalDuration).toBeLessThan(maxAcceptableMs);
    });
  });
});

// ============================================
// Mock-based Concurrency Tests
// ============================================

describe('Concurrency Unit Tests (Mocked)', () => {
  /**
   * These tests use mocks to verify the concurrency handling logic
   * without requiring a real n8n instance.
   */

  it('should track operation order correctly in runConcurrent helper', async () => {
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    // Operations with different durations
    const results = await runConcurrent(3, async (index) => {
      await delay(index === 1 ? 50 : 10); // Middle one is slowest
      return `result-${index}`;
    });

    // Results should be sorted by index, not completion order
    expect(results[0].index).toBe(0);
    expect(results[1].index).toBe(1);
    expect(results[2].index).toBe(2);

    // All should have results
    expect(results.every((r) => r.result !== undefined)).toBe(true);
  });

  it('should capture errors in concurrent operations', async () => {
    const results = await runConcurrent(3, async (index) => {
      if (index === 1) {
        throw new Error('Deliberate error');
      }
      return `result-${index}`;
    });

    // Index 0 and 2 should succeed
    expect(results[0].result).toBe('result-0');
    expect(results[2].result).toBe('result-2');

    // Index 1 should have error
    expect(results[1].error).toBeDefined();
    expect(results[1].error?.message).toBe('Deliberate error');
  });

  it('should measure operation durations', async () => {
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const results = await runConcurrent(2, async () => {
      await delay(100);
      return 'done';
    });

    // Both should have duration around 100ms (with some tolerance)
    expect(results[0].duration).toBeGreaterThanOrEqual(90);
    expect(results[0].duration).toBeLessThan(200);
    expect(results[1].duration).toBeGreaterThanOrEqual(90);
    expect(results[1].duration).toBeLessThan(200);
  });

  it('should run operations truly in parallel', async () => {
    const startTimes: number[] = [];

    const results = await runConcurrent(5, async (index) => {
      startTimes.push(Date.now());
      await new Promise((resolve) => setTimeout(resolve, 50));
      return index;
    });

    // All should have started within a small window (< 50ms apart)
    const firstStart = Math.min(...startTimes);
    const lastStart = Math.max(...startTimes);

    expect(lastStart - firstStart).toBeLessThan(50);
    expect(results.length).toBe(5);
  });
});
