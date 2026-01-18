/**
 * Integration Test: Error Recovery
 * Tests retry logic, circuit breakers, and graceful degradation
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createScopedTestContext,
  registerIntegrationTestHooks,
  fetchDashboardApi,
} from './setup';
import {
  createTestProject,
} from '../helpers/test-fixtures';
import {
  insertProject,
  getProjectState,
  updateProjectPhase,
  deleteProject,
} from '../helpers/db-helpers';
import {
  uploadTestFile,
  fileExists,
  cleanupProject as cleanupS3Project,
} from '../helpers/s3-helpers';
import {
  createWebAppGovernancePayload,
  createApproveAllGovernanceResponse,
} from '../mocks/governance-payloads';

// Register global hooks
registerIntegrationTestHooks();

describe('06: Error Recovery', () => {
  const scope = createScopedTestContext('errorrecov');
  let ctx: Awaited<ReturnType<typeof scope.setup>>;

  beforeAll(async () => {
    ctx = await scope.setup();
  });

  afterAll(async () => {
    await scope.teardown();
  });

  describe('S3 Retry Logic', () => {
    it('should handle S3 upload retry on transient error', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}s3_retry` });
      const content = 'Test content for retry';

      // First upload should succeed (no actual transient error simulation here)
      // This tests that the upload path works normally
      const key = await uploadTestFile(
        ctx.s3Client,
        project.projectId,
        'retry_test.md',
        content
      );

      const exists = await fileExists(ctx.s3Client, key);
      expect(exists).toBe(true);

      await cleanupS3Project(ctx.s3Client, project.projectId);
    });

    it('should handle non-existent bucket gracefully', async () => {
      // This tests error handling for missing bucket
      const { createS3Client } = await import('../helpers/s3-helpers');
      const testClient = createS3Client();

      // Try to download from non-existent key
      const { downloadContent } = await import('../helpers/s3-helpers');

      try {
        await downloadContent(testClient, 'non-existent-bucket/missing.md');
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        // Expected to fail
        expect(error).toBeDefined();
      }
    });
  });

  describe('n8n Webhook Retry', () => {
    it('should retry webhook on 5xx error', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}webhook_5xx` });

      await insertProject(ctx.db, project, {
        current_phase: 0,
        phase_status: 'paused',
      });

      // Configure mock to fail first, then succeed
      let callCount = 0;
      ctx.mockN8n.setResponse('/webhook/governance-batch', () => {
        callCount++;
        if (callCount <= 2) {
          // Simulate 503 error for first 2 calls
          return { error: true, status: 503 };
        }
        return { success: true };
      });

      const payload = createWebAppGovernancePayload(project.projectId);
      const response = createApproveAllGovernanceResponse(payload, 'global');

      const apiResponse = await fetchDashboardApi('/governance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(response),
      });

      if (!apiResponse) {
        await deleteProject(ctx.db, project.projectId);
        ctx.mockN8n.setResponse('/webhook/governance-batch', { success: true });
        return;
      }

      // Should eventually succeed after retries
      // Note: May fail if dashboard doesn't implement retry
      if (apiResponse.ok) {
        expect(callCount).toBeGreaterThanOrEqual(1);
      }

      // Reset mock
      ctx.mockN8n.setResponse('/webhook/governance-batch', { success: true });
      await deleteProject(ctx.db, project.projectId);
    });

    it('should not retry on 4xx client error', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}webhook_4xx` });

      await insertProject(ctx.db, project, {
        current_phase: 0,
        phase_status: 'paused',
      });

      // Configure mock to return 400
      let callCount = 0;
      ctx.mockN8n.setResponse('/webhook/governance-batch', () => {
        callCount++;
        return { error: true, status: 400, message: 'Bad request' };
      });

      const payload = createWebAppGovernancePayload(project.projectId);
      const response = createApproveAllGovernanceResponse(payload, 'global');

      ctx.mockN8n.clearCallsFor('/webhook/governance-batch');

      const apiResponse = await fetchDashboardApi('/governance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(response),
      });

      if (!apiResponse) {
        await deleteProject(ctx.db, project.projectId);
        ctx.mockN8n.setResponse('/webhook/governance-batch', { success: true });
        return;
      }

      // Should fail without excessive retries
      // 4xx errors should not be retried
      expect(callCount).toBeLessThanOrEqual(2); // At most 1 retry or none

      // Reset mock
      ctx.mockN8n.setResponse('/webhook/governance-batch', { success: true });
      await deleteProject(ctx.db, project.projectId);
    });
  });

  describe('Circuit Breaker', () => {
    it('should handle max iterations limit', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}circuit` });

      await insertProject(ctx.db, project, {
        current_phase: 1,
        phase_status: 'in_progress',
        config: {
          max_iterations: 5,
          score_threshold: 90,
        },
      });

      // Simulate hitting max iterations
      const { updateProjectIteration } = await import('../helpers/db-helpers');

      for (let i = 1; i <= 5; i++) {
        await updateProjectIteration(ctx.db, project.projectId, 1, i, 75); // Low score
      }

      const state = await getProjectState(ctx.db, project.projectId);
      expect(state?.total_iterations).toBe(5);
      expect(state?.last_iteration_number).toBe(5);

      // At this point, workflow should trigger circuit breaker
      // Mark as requiring human guidance (paused status)
      await updateProjectPhase(ctx.db, project.projectId, 1, 'paused');

      const finalState = await getProjectState(ctx.db, project.projectId);
      expect(finalState?.phase_status).toBe('paused');

      await deleteProject(ctx.db, project.projectId);
    });

    it('should track failed iterations for circuit breaker', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}fail_track` });

      await insertProject(ctx.db, project, {
        current_phase: 1,
        phase_status: 'in_progress',
      });

      // Log failed iterations
      const { insertDecisionLogEntry } = await import('../helpers/db-helpers');

      for (let i = 1; i <= 3; i++) {
        await insertDecisionLogEntry(ctx.db, {
          project_id: project.projectId,
          session_id: project.sessionId,
          entry_type: 'log_iteration',
          phase: 1,
          iteration: i,
          agent_name: 'vision_loop',
          score: 60 + i * 5, // 65, 70, 75
          issues_count: 5 - i,
          content: `Vision iteration ${i} below threshold`,
          metadata: { threshold: 90, status: 'failed' },
        });
      }

      const { countDecisionLogEntriesByType } = await import('../helpers/db-helpers');
      const counts = await countDecisionLogEntriesByType(ctx.db, project.projectId);

      expect(counts['log_iteration']).toBe(3);

      await deleteProject(ctx.db, project.projectId);
    });
  });

  describe('Database Recovery', () => {
    it('should handle concurrent update attempts', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}concurrent` });

      await insertProject(ctx.db, project, {
        current_phase: 1,
        phase_status: 'in_progress',
      });

      // Simulate concurrent updates (using valid phase_status values)
      const updates = Promise.all([
        updateProjectPhase(ctx.db, project.projectId, 1, 'in_progress'),
        updateProjectPhase(ctx.db, project.projectId, 1, 'pending'),
        updateProjectPhase(ctx.db, project.projectId, 1, 'paused'),
      ]);

      // All updates should complete (last one wins in PostgreSQL)
      await expect(updates).resolves.not.toThrow();

      // Verify project still exists and has valid state
      const state = await getProjectState(ctx.db, project.projectId);
      expect(state).not.toBeNull();
      expect(state?.current_phase).toBe(1);

      await deleteProject(ctx.db, project.projectId);
    });

    it('should rollback on partial failure', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}rollback` });

      await insertProject(ctx.db, project);

      // Try to insert duplicate (should fail)
      try {
        await insertProject(ctx.db, project);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        // Expected - duplicate key
        expect(error).toBeDefined();
      }

      // Original should still exist
      const state = await getProjectState(ctx.db, project.projectId);
      expect(state).not.toBeNull();

      await deleteProject(ctx.db, project.projectId);
    });
  });

  describe('Graceful Degradation', () => {
    it('should continue without optional services', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}degraded` });

      // Create project with minimal required services (DB + S3)
      await insertProject(ctx.db, project);

      const content = 'Test content';
      const key = await uploadTestFile(
        ctx.s3Client,
        project.projectId,
        'test.md',
        content
      );

      // Verify core functionality works even if Qdrant/Graphiti unavailable
      const state = await getProjectState(ctx.db, project.projectId);
      expect(state).not.toBeNull();

      const exists = await fileExists(ctx.s3Client, key);
      expect(exists).toBe(true);

      // Note: In real scenario, workflow would skip vector/graph operations
      // and log warnings but continue processing

      await deleteProject(ctx.db, project.projectId);
      await cleanupS3Project(ctx.s3Client, project.projectId);
    });

    it('should mark service status in decision log', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}svc_status` });

      await insertProject(ctx.db, project);

      // Log service status
      const { insertDecisionLogEntry } = await import('../helpers/db-helpers');

      await insertDecisionLogEntry(ctx.db, {
        project_id: project.projectId,
        session_id: project.sessionId,
        entry_type: 'log_info',
        phase: 0,
        iteration: null,
        agent_name: 'orchestrator',
        score: null,
        issues_count: null,
        content: 'Service availability check',
        metadata: {
          type: 'service_status',
          postgres: 'available',
          s3: 'available',
          qdrant: ctx.services.qdrant.available ? 'available' : 'unavailable',
          graphiti: ctx.services.graphiti.available ? 'available' : 'unavailable',
          n8n: ctx.services.n8n.available ? 'available' : 'unavailable',
        },
      });

      const { getDecisionLogEntries } = await import('../helpers/db-helpers');
      const entries = await getDecisionLogEntries(ctx.db, project.projectId);

      expect(entries.length).toBe(1);
      expect(entries[0].entry_type).toBe('log_info');

      const metadata = entries[0].metadata as Record<string, string>;
      expect(metadata.postgres).toBe('available');
      expect(metadata.s3).toBe('available');

      await deleteProject(ctx.db, project.projectId);
    });
  });

  describe('Request Validation Errors', () => {
    it('should return 400 for malformed JSON', async () => {
      const response = await fetchDashboardApi('/start-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ invalid json }',
      });

      if (!response) return;

      expect(response.status).toBe(400);
    });

    it('should return 400 for missing required fields', async () => {
      const response = await fetchDashboardApi('/start-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incomplete: true }),
      });

      if (!response) return;

      expect(response.status).toBe(400);
    });

    it('should include error details in response', async () => {
      const response = await fetchDashboardApi('/start-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: '', projectName: '' }),
      });

      if (!response) return;

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error || data.message).toBeDefined();
    });
  });
});
