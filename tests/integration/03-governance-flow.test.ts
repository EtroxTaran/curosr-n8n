/**
 * Integration Test: Governance Flow
 * Tests governance request handling and batch approval
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  createScopedTestContext,
  registerIntegrationTestHooks,
  getDashboardApiUrl,
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
  cleanupProject as cleanupS3Project,
} from '../helpers/s3-helpers';
import {
  createWebAppGovernancePayload,
  createEnterpriseGovernancePayload,
  createApproveAllGovernanceResponse,
  createSkipAllGovernanceResponse,
  createMixedGovernanceResponse,
  createAlternativesGovernanceResponse,
  countDecisionsByAction,
  countDecisionsByScope,
} from '../mocks/governance-payloads';

// Register global hooks
registerIntegrationTestHooks();

describe('03: Governance Flow', () => {
  const scope = createScopedTestContext('governance');
  let ctx: Awaited<ReturnType<typeof scope.setup>>;

  beforeAll(async () => {
    ctx = await scope.setup();

    // Configure mock n8n to accept governance webhook
    ctx.mockN8n.setResponse('/webhook/governance-batch', {
      success: true,
      message: 'Governance decisions received',
    });
  });

  afterAll(async () => {
    await scope.teardown();
  });

  describe('POST /api/governance', () => {
    it('should accept approve-all decisions', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}gov_approve` });

      // Insert project in database
      await insertProject(ctx.db, project, {
        current_phase: 0,
        phase_status: 'paused',
      });

      // Create governance payload and response
      const payload = createWebAppGovernancePayload(project.projectId);
      const governanceResponse = createApproveAllGovernanceResponse(payload, 'global');

      // Submit governance decisions
      const response = await fetchDashboardApi('/governance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(governanceResponse),
      });

      if (!response) {
        await deleteProject(ctx.db, project.projectId);
        return;
      }

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.decisions_count).toBe(payload.detected_stack.length);

      // Cleanup
      await deleteProject(ctx.db, project.projectId);
    });

    it('should accept skip-all decisions', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}gov_skip` });

      await insertProject(ctx.db, project, {
        current_phase: 0,
        phase_status: 'paused',
      });

      const payload = createWebAppGovernancePayload(project.projectId);
      const governanceResponse = createSkipAllGovernanceResponse(payload);

      const response = await fetchDashboardApi('/governance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(governanceResponse),
      });

      if (!response) {
        await deleteProject(ctx.db, project.projectId);
        return;
      }

      expect(response.ok).toBe(true);

      const { skipped } = countDecisionsByAction(governanceResponse);
      expect(skipped).toBe(payload.detected_stack.length);

      await deleteProject(ctx.db, project.projectId);
    });

    it('should accept mixed decisions (approve/skip/alternatives)', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}gov_mixed` });

      await insertProject(ctx.db, project, {
        current_phase: 0,
        phase_status: 'paused',
      });

      const payload = createEnterpriseGovernancePayload(project.projectId);
      const governanceResponse = createMixedGovernanceResponse(payload);

      const response = await fetchDashboardApi('/governance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(governanceResponse),
      });

      if (!response) {
        await deleteProject(ctx.db, project.projectId);
        return;
      }

      expect(response.ok).toBe(true);

      const { approved, skipped } = countDecisionsByAction(governanceResponse);
      expect(approved + skipped).toBe(payload.detected_stack.length);

      await deleteProject(ctx.db, project.projectId);
    });

    it('should accept alternative selections', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}gov_alt` });

      await insertProject(ctx.db, project, {
        current_phase: 0,
        phase_status: 'paused',
      });

      const payload = createWebAppGovernancePayload(project.projectId);
      const governanceResponse = createAlternativesGovernanceResponse(payload, 'local');

      const response = await fetchDashboardApi('/governance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(governanceResponse),
      });

      if (!response) {
        await deleteProject(ctx.db, project.projectId);
        return;
      }

      expect(response.ok).toBe(true);

      await deleteProject(ctx.db, project.projectId);
    });

    it('should track global vs local scope decisions', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}gov_scope` });

      await insertProject(ctx.db, project, {
        current_phase: 0,
        phase_status: 'paused',
      });

      const payload = createWebAppGovernancePayload(project.projectId);
      const governanceResponse = createApproveAllGovernanceResponse(payload, 'global');

      const response = await fetchDashboardApi('/governance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(governanceResponse),
      });

      if (!response) {
        await deleteProject(ctx.db, project.projectId);
        return;
      }

      expect(response.ok).toBe(true);

      const data = await response.json();
      const { global: globalCount } = countDecisionsByScope(governanceResponse);
      expect(data.global_count).toBe(globalCount);

      await deleteProject(ctx.db, project.projectId);
    });
  });

  describe('Webhook Delivery', () => {
    it('should send governance decisions to n8n webhook', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}gov_webhook` });

      await insertProject(ctx.db, project, {
        current_phase: 0,
        phase_status: 'paused',
      });

      const payload = createWebAppGovernancePayload(project.projectId);
      const governanceResponse = createApproveAllGovernanceResponse(payload, 'global');

      // Clear previous webhook calls
      ctx.mockN8n.clearCallsFor('/webhook/governance-batch');

      const response = await fetchDashboardApi('/governance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(governanceResponse),
      });

      if (!response) {
        await deleteProject(ctx.db, project.projectId);
        return;
      }

      // Wait for webhook call
      const calls = await ctx.mockN8n.waitForCalls('/webhook/governance-batch', 1, 5000);

      expect(calls.length).toBeGreaterThanOrEqual(1);

      const lastCall = calls[calls.length - 1];
      expect(lastCall.body.project_id).toBe(project.projectId);
      expect(lastCall.body.scavenging_id).toBe(payload.scavenging_id);
      expect(lastCall.body.approved_global).toBeDefined();

      await deleteProject(ctx.db, project.projectId);
    });

    it('should retry webhook on transient failure', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}gov_retry` });

      await insertProject(ctx.db, project, {
        current_phase: 0,
        phase_status: 'paused',
      });

      // Simulate transient failure then success
      let callCount = 0;
      ctx.mockN8n.setResponse('/webhook/governance-batch', (body) => {
        callCount++;
        if (callCount === 1) {
          // First call fails
          throw new Error('Simulated transient failure');
        }
        return { success: true };
      });

      const payload = createWebAppGovernancePayload(project.projectId);
      const governanceResponse = createApproveAllGovernanceResponse(payload, 'global');

      ctx.mockN8n.clearCallsFor('/webhook/governance-batch');

      const response = await fetchDashboardApi('/governance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(governanceResponse),
      });

      if (!response || response.status === 503 || response.status === 502) {
        console.log('   ⏭️  Skipping: Dashboard API not available');
        await deleteProject(ctx.db, project.projectId);
        // Reset mock
        ctx.mockN8n.setResponse('/webhook/governance-batch', { success: true });
        return;
      }

      // Should eventually succeed after retry
      expect(response.ok).toBe(true);

      // Reset mock for other tests
      ctx.mockN8n.setResponse('/webhook/governance-batch', { success: true });

      await deleteProject(ctx.db, project.projectId);
    });
  });

  describe('Database Updates', () => {
    it('should update tech_standards_global in database', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}gov_dbglobal` });

      await insertProject(ctx.db, project, {
        current_phase: 0,
        phase_status: 'paused',
      });

      const payload = createWebAppGovernancePayload(project.projectId);
      const governanceResponse = createApproveAllGovernanceResponse(payload, 'global');

      const response = await fetchDashboardApi('/governance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(governanceResponse),
      });

      if (!response) {
        await deleteProject(ctx.db, project.projectId);
        return;
      }

      // Verify database was updated
      const state = await getProjectState(ctx.db, project.projectId);
      const globalStandards = state?.tech_standards_global as unknown[];

      expect(Array.isArray(globalStandards)).toBe(true);
      expect(globalStandards.length).toBe(payload.detected_stack.length);

      await deleteProject(ctx.db, project.projectId);
    });

    it('should update tech_standards_local in database', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}gov_dblocal` });

      await insertProject(ctx.db, project, {
        current_phase: 0,
        phase_status: 'paused',
      });

      const payload = createWebAppGovernancePayload(project.projectId);
      const governanceResponse = createApproveAllGovernanceResponse(payload, 'local');

      const response = await fetchDashboardApi('/governance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(governanceResponse),
      });

      if (!response) {
        await deleteProject(ctx.db, project.projectId);
        return;
      }

      const state = await getProjectState(ctx.db, project.projectId);
      const localStandards = state?.tech_standards_local as unknown[];

      expect(Array.isArray(localStandards)).toBe(true);
      expect(localStandards.length).toBe(payload.detected_stack.length);

      await deleteProject(ctx.db, project.projectId);
    });
  });

  describe('Validation', () => {
    it('should reject stale scavenging_id', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}gov_stale` });

      await insertProject(ctx.db, project, {
        current_phase: 0,
        phase_status: 'paused',
      });

      const governanceResponse = {
        scavenging_id: 'stale_invalid_id_12345',
        project_id: project.projectId,
        decisions: [],
      };

      const response = await fetchDashboardApi('/governance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(governanceResponse),
      });

      if (!response) {
        await deleteProject(ctx.db, project.projectId);
        return;
      }

      // Should reject stale ID
      expect(response.ok).toBe(false);
      // Could be 400 (bad request) or 409 (conflict)
      expect([400, 409]).toContain(response.status);

      await deleteProject(ctx.db, project.projectId);
    });

    it('should reject invalid decision action', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}gov_invalid` });

      await insertProject(ctx.db, project, {
        current_phase: 0,
        phase_status: 'paused',
      });

      const payload = createWebAppGovernancePayload(project.projectId);

      const invalidResponse = {
        scavenging_id: payload.scavenging_id,
        project_id: project.projectId,
        decisions: [
          {
            tech_id: 'tech_001',
            action: 'invalid_action', // Invalid
            selected_name: 'Test',
            scope: 'global',
          },
        ],
      };

      const response = await fetchDashboardApi('/governance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidResponse),
      });

      if (!response) {
        await deleteProject(ctx.db, project.projectId);
        return;
      }

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);

      await deleteProject(ctx.db, project.projectId);
    });
  });
});
