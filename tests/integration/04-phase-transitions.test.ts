/**
 * Integration Test: Phase Transitions
 * Tests workflow state machine: Phase 0 → 1 → 2 → 3
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createScopedTestContext,
  registerIntegrationTestHooks,
} from './setup';
import {
  createTestProject,
} from '../helpers/test-fixtures';
import {
  insertProject,
  getProjectState,
  updateProjectPhase,
  updateProjectIteration,
  completeProject,
  deleteProject,
  insertDecisionLogEntry,
  getDecisionLogEntries,
  countDecisionLogEntriesByType,
} from '../helpers/db-helpers';
import {
  cleanupProject as cleanupS3Project,
} from '../helpers/s3-helpers';
import { getVisionResponse, getArchitectureResponse } from '../mocks/ai-responses';

// Register global hooks
registerIntegrationTestHooks();

describe('04: Phase Transitions', () => {
  const scope = createScopedTestContext('phases');
  let ctx: Awaited<ReturnType<typeof scope.setup>>;

  beforeAll(async () => {
    ctx = await scope.setup();
  });

  afterAll(async () => {
    await scope.teardown();
  });

  describe('Phase 0 → 1 (After Governance)', () => {
    it('should transition from phase 0 to phase 1 after governance', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}p0_to_p1` });

      // Start at phase 0 (paused for governance)
      await insertProject(ctx.db, project, {
        current_phase: 0,
        phase_status: 'paused',
      });

      // Verify initial state
      let state = await getProjectState(ctx.db, project.projectId);
      expect(state?.current_phase).toBe(0);

      // Simulate governance completion - update to phase 1
      await updateProjectPhase(ctx.db, project.projectId, 1, 'in_progress');

      // Verify transition
      state = await getProjectState(ctx.db, project.projectId);
      expect(state?.current_phase).toBe(1);
      expect(state?.phase_status).toBe('in_progress');

      await deleteProject(ctx.db, project.projectId);
    });

    it('should log phase transition in decision log', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}p0_log` });

      await insertProject(ctx.db, project);

      // Log phase start
      await insertDecisionLogEntry(ctx.db, {
        project_id: project.projectId,
        session_id: project.sessionId,
        entry_type: 'log_phase_start',
        phase: 1,
        iteration: 0,
        agent_name: 'orchestrator',
        score: null,
        issues_count: null,
        content: 'Starting Phase 1: Vision Loop',
        metadata: { previous_phase: 0 },
      });

      const entries = await getDecisionLogEntries(ctx.db, project.projectId);
      expect(entries.length).toBe(1);
      expect(entries[0].entry_type).toBe('log_phase_start');
      expect(entries[0].phase).toBe(1);

      await deleteProject(ctx.db, project.projectId);
    });
  });

  describe('Phase 1 → 2 (Vision Complete)', () => {
    it('should transition from phase 1 to phase 2 when score >= 90', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}p1_to_p2` });

      await insertProject(ctx.db, project, {
        current_phase: 1,
        phase_status: 'in_progress',
      });

      // Simulate vision iterations
      const visionResponse = getVisionResponse(project.projectName, 3); // Score: 92
      expect(visionResponse.score).toBeGreaterThanOrEqual(90);

      // Update iteration tracking
      await updateProjectIteration(ctx.db, project.projectId, 1, 3, visionResponse.score);

      // Transition to phase 2
      await updateProjectPhase(ctx.db, project.projectId, 2, 'in_progress');

      const state = await getProjectState(ctx.db, project.projectId);
      expect(state?.current_phase).toBe(2);
      // PostgreSQL NUMERIC returns as string
      expect(parseFloat(String(state?.last_iteration_score))).toBe(visionResponse.score);

      await deleteProject(ctx.db, project.projectId);
    });

    it('should track iteration count during vision loop', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}p1_iter` });

      await insertProject(ctx.db, project, {
        current_phase: 1,
        phase_status: 'in_progress',
      });

      // Simulate 3 iterations
      for (let i = 1; i <= 3; i++) {
        const response = getVisionResponse(project.projectName, i);
        await updateProjectIteration(ctx.db, project.projectId, 1, i, response.score);
      }

      const state = await getProjectState(ctx.db, project.projectId);
      expect(state?.total_iterations).toBe(3);
      expect(state?.last_iteration_number).toBe(3);
      expect(state?.last_iteration_phase).toBe(1);

      await deleteProject(ctx.db, project.projectId);
    });

    it('should log iterations in decision log', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}p1_iterlog` });

      await insertProject(ctx.db, project, {
        current_phase: 1,
        phase_status: 'in_progress',
      });

      // Log iterations
      for (let i = 1; i <= 3; i++) {
        const response = getVisionResponse(project.projectName, i);
        await insertDecisionLogEntry(ctx.db, {
          project_id: project.projectId,
          session_id: project.sessionId,
          entry_type: 'log_iteration',
          phase: 1,
          iteration: i,
          agent_name: 'vision_loop',
          score: response.score,
          issues_count: response.issues.length,
          content: `Vision iteration ${i} complete`,
          metadata: { issues: response.issues },
        });
      }

      const counts = await countDecisionLogEntriesByType(ctx.db, project.projectId);
      expect(counts['log_iteration']).toBe(3);

      await deleteProject(ctx.db, project.projectId);
    });
  });

  describe('Phase 2 → 3 (Architecture Complete)', () => {
    it('should transition from phase 2 to phase 3 when score >= 90', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}p2_to_p3` });

      await insertProject(ctx.db, project, {
        current_phase: 2,
        phase_status: 'in_progress',
      });

      // Simulate architecture iterations
      const archResponse = getArchitectureResponse(project.projectName, 3); // Score: 93
      expect(archResponse.score).toBeGreaterThanOrEqual(90);

      await updateProjectIteration(ctx.db, project.projectId, 2, 3, archResponse.score);

      // Complete project
      await completeProject(ctx.db, project.projectId, 1200000); // 20 minutes

      const state = await getProjectState(ctx.db, project.projectId);
      expect(state?.current_phase).toBe(3);
      expect(state?.phase_status).toBe('completed');
      expect(state?.completed_at).not.toBeNull();

      await deleteProject(ctx.db, project.projectId);
    });

    it('should track total duration when completing', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}p3_duration` });

      await insertProject(ctx.db, project, {
        current_phase: 2,
        phase_status: 'in_progress',
      });

      const durationMs = 1500000; // 25 minutes
      await completeProject(ctx.db, project.projectId, durationMs);

      const state = await getProjectState(ctx.db, project.projectId);
      // PostgreSQL BIGINT returns as string
      expect(parseInt(String(state?.total_duration_ms), 10)).toBe(durationMs);

      await deleteProject(ctx.db, project.projectId);
    });
  });

  describe('Score Threshold Behavior', () => {
    it('should continue iterating when score < 90', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}low_score` });

      await insertProject(ctx.db, project, {
        current_phase: 1,
        phase_status: 'in_progress',
      });

      // First iteration - low score
      const response1 = getVisionResponse(project.projectName, 1); // Score: 65
      expect(response1.score).toBeLessThan(90);

      await updateProjectIteration(ctx.db, project.projectId, 1, 1, response1.score);

      // Should still be in phase 1
      const state = await getProjectState(ctx.db, project.projectId);
      expect(state?.current_phase).toBe(1);
      // PostgreSQL NUMERIC returns as string
      expect(parseFloat(String(state?.last_iteration_score))).toBe(response1.score);

      await deleteProject(ctx.db, project.projectId);
    });

    it('should track score progression across iterations', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}score_prog` });

      await insertProject(ctx.db, project, {
        current_phase: 1,
        phase_status: 'in_progress',
      });

      const scores: number[] = [];

      // Simulate multiple iterations
      for (let i = 1; i <= 3; i++) {
        const response = getVisionResponse(project.projectName, i);
        scores.push(response.score);
        await updateProjectIteration(ctx.db, project.projectId, 1, i, response.score);

        // Log iteration
        await insertDecisionLogEntry(ctx.db, {
          project_id: project.projectId,
          session_id: project.sessionId,
          entry_type: 'log_iteration',
          phase: 1,
          iteration: i,
          agent_name: 'vision_loop',
          score: response.score,
          issues_count: response.issues.length,
          content: `Iteration ${i}`,
          metadata: {},
        });
      }

      // Verify scores increased
      expect(scores[1]).toBeGreaterThan(scores[0]);
      expect(scores[2]).toBeGreaterThan(scores[1]);
      expect(scores[2]).toBeGreaterThanOrEqual(90);

      await deleteProject(ctx.db, project.projectId);
    });
  });

  describe('Phase Status Tracking', () => {
    it('should track pending → in_progress → completed status', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}status` });

      // Phase 0: pending
      await insertProject(ctx.db, project, {
        current_phase: 0,
        phase_status: 'pending',
      });

      let state = await getProjectState(ctx.db, project.projectId);
      expect(state?.phase_status).toBe('pending');

      // Phase 0: in_progress
      await updateProjectPhase(ctx.db, project.projectId, 0, 'in_progress');
      state = await getProjectState(ctx.db, project.projectId);
      expect(state?.phase_status).toBe('in_progress');

      // Phase 0: paused (awaiting governance approval)
      await updateProjectPhase(ctx.db, project.projectId, 0, 'paused');
      state = await getProjectState(ctx.db, project.projectId);
      expect(state?.phase_status).toBe('paused');

      // Phase 1: in_progress
      await updateProjectPhase(ctx.db, project.projectId, 1, 'in_progress');
      state = await getProjectState(ctx.db, project.projectId);
      expect(state?.current_phase).toBe(1);
      expect(state?.phase_status).toBe('in_progress');

      await deleteProject(ctx.db, project.projectId);
    });

    it('should handle failed phase status', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}failed` });

      await insertProject(ctx.db, project, {
        current_phase: 1,
        phase_status: 'in_progress',
      });

      // Mark as failed
      await updateProjectPhase(ctx.db, project.projectId, 1, 'failed');

      const state = await getProjectState(ctx.db, project.projectId);
      expect(state?.phase_status).toBe('failed');
      expect(state?.current_phase).toBe(1); // Phase doesn't advance on failure

      await deleteProject(ctx.db, project.projectId);
    });
  });

  describe('Decision Log Completeness', () => {
    it('should have complete decision log after full workflow', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}complete_log` });

      await insertProject(ctx.db, project);

      // Simulate full workflow decision log
      // Valid entry_types: 'log_decision', 'log_iteration', 'log_approval', 'log_phase_start', 'log_phase_end', 'log_error', 'log_info'
      const entries = [
        { entry_type: 'log_phase_start', phase: 0, content: 'Starting Phase 0' },
        { entry_type: 'log_decision', phase: 0, content: 'Found PostgreSQL' },
        { entry_type: 'log_approval', phase: 0, content: 'Approved tech stack' },
        { entry_type: 'log_phase_start', phase: 1, content: 'Starting Phase 1' },
        { entry_type: 'log_iteration', phase: 1, content: 'Vision v1' },
        { entry_type: 'log_iteration', phase: 1, content: 'Vision v2' },
        { entry_type: 'log_iteration', phase: 1, content: 'Vision v3 FINAL' },
        { entry_type: 'log_phase_start', phase: 2, content: 'Starting Phase 2' },
        { entry_type: 'log_iteration', phase: 2, content: 'Architecture v1' },
        { entry_type: 'log_iteration', phase: 2, content: 'Architecture v2 FINAL' },
        { entry_type: 'log_phase_end', phase: 3, content: 'Workflow complete' },
      ];

      for (const entry of entries) {
        await insertDecisionLogEntry(ctx.db, {
          project_id: project.projectId,
          session_id: project.sessionId,
          entry_type: entry.entry_type,
          phase: entry.phase,
          iteration: entry.entry_type === 'iteration' ? 1 : null,
          agent_name: 'test',
          score: null,
          issues_count: null,
          content: entry.content,
          metadata: {},
        });
      }

      const counts = await countDecisionLogEntriesByType(ctx.db, project.projectId);

      expect(counts['log_phase_start']).toBe(3);
      expect(counts['log_iteration']).toBe(5);
      expect(counts['log_decision']).toBe(1);
      expect(counts['log_approval']).toBe(1);
      expect(counts['log_phase_end']).toBe(1);

      await deleteProject(ctx.db, project.projectId);
    });
  });
});
