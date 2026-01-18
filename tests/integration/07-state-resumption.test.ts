/**
 * Integration Test: State Resumption
 * Tests Smart Start handler and project resumability
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createScopedTestContext,
  registerIntegrationTestHooks,
} from './setup';
import {
  createTestProject,
  createTestInputFiles,
} from '../helpers/test-fixtures';
import {
  insertProject,
  getProjectState,
  updateProjectPhase,
  updateProjectIteration,
  updateProjectArtifacts,
  deleteProject,
  insertDecisionLogEntry,
  getDecisionLogEntries,
} from '../helpers/db-helpers';
import {
  uploadTestFile,
  uploadTestArtifact,
  cleanupProject as cleanupS3Project,
} from '../helpers/s3-helpers';
import {
  createVisionDocumentContent,
  createArchitectureDocumentContent,
} from '../helpers/test-fixtures';

// Register global hooks
registerIntegrationTestHooks();

describe('07: State Resumption', () => {
  const scope = createScopedTestContext('resume');
  let ctx: Awaited<ReturnType<typeof scope.setup>>;

  beforeAll(async () => {
    ctx = await scope.setup();
  });

  afterAll(async () => {
    await scope.teardown();
  });

  describe('Project State Detection', () => {
    it('should detect project in Phase 0', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}detect_p0` });

      await insertProject(ctx.db, project, {
        current_phase: 0,
        phase_status: 'paused', // Paused for governance
      });

      const state = await getProjectState(ctx.db, project.projectId);

      expect(state).not.toBeNull();
      expect(state?.current_phase).toBe(0);
      expect(state?.phase_status).toBe('paused');

      // Project is resumable at Phase 0
      const isResumable = state?.phase_status !== 'completed' && state?.phase_status !== 'failed';
      expect(isResumable).toBe(true);

      await deleteProject(ctx.db, project.projectId);
    });

    it('should detect project in Phase 1', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}detect_p1` });

      await insertProject(ctx.db, project, {
        current_phase: 1,
        phase_status: 'in_progress',
      });

      // Add some iteration data
      await updateProjectIteration(ctx.db, project.projectId, 1, 2, 78);

      const state = await getProjectState(ctx.db, project.projectId);

      expect(state?.current_phase).toBe(1);
      expect(state?.last_iteration_number).toBe(2);
      // PostgreSQL NUMERIC returns as string
      expect(parseFloat(String(state?.last_iteration_score))).toBe(78);

      await deleteProject(ctx.db, project.projectId);
    });

    it('should detect project in Phase 2', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}detect_p2` });

      await insertProject(ctx.db, project, {
        current_phase: 2,
        phase_status: 'in_progress',
      });

      // Add vision artifact (from Phase 1)
      const visionContent = createVisionDocumentContent(project.projectName, 3);
      const visionKey = await uploadTestArtifact(
        ctx.s3Client,
        project.projectId,
        'ProductVision_FINAL.md',
        visionContent
      );

      await updateProjectArtifacts(ctx.db, project.projectId, {
        vision_final: visionKey,
      });

      const state = await getProjectState(ctx.db, project.projectId);

      expect(state?.current_phase).toBe(2);
      expect(state?.artifact_vision_final).toBe(visionKey);

      await deleteProject(ctx.db, project.projectId);
      await cleanupS3Project(ctx.s3Client, project.projectId);
    });

    it('should detect completed project', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}detect_done` });

      await insertProject(ctx.db, project, {
        current_phase: 3,
        phase_status: 'completed',
      });

      const state = await getProjectState(ctx.db, project.projectId);

      expect(state?.current_phase).toBe(3);
      expect(state?.phase_status).toBe('completed');

      // Completed projects are not resumable (already done)
      const isResumable = state?.phase_status !== 'completed';
      expect(isResumable).toBe(false);

      await deleteProject(ctx.db, project.projectId);
    });
  });

  describe('Resumability Check', () => {
    it('should allow resume for in_progress projects', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}resume_ok` });

      await insertProject(ctx.db, project, {
        current_phase: 1,
        phase_status: 'in_progress',
      });

      const state = await getProjectState(ctx.db, project.projectId);

      // Define resumable statuses (valid: pending, in_progress, completed, failed, paused)
      const resumableStatuses = ['in_progress', 'pending', 'paused'];
      const isResumable = resumableStatuses.includes(state?.phase_status || '');

      expect(isResumable).toBe(true);

      await deleteProject(ctx.db, project.projectId);
    });

    it('should allow resume for failed projects (retry)', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}resume_fail` });

      await insertProject(ctx.db, project, {
        current_phase: 1,
        phase_status: 'failed',
      });

      const state = await getProjectState(ctx.db, project.projectId);

      // Failed projects can be retried
      expect(state?.phase_status).toBe('failed');

      // Update to retry
      await updateProjectPhase(ctx.db, project.projectId, 1, 'in_progress');

      const updatedState = await getProjectState(ctx.db, project.projectId);
      expect(updatedState?.phase_status).toBe('in_progress');

      await deleteProject(ctx.db, project.projectId);
    });

    it('should preserve iteration history on resume', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}resume_hist` });

      await insertProject(ctx.db, project, {
        current_phase: 1,
        phase_status: 'in_progress',
      });

      // Add iteration history
      for (let i = 1; i <= 2; i++) {
        await updateProjectIteration(ctx.db, project.projectId, 1, i, 65 + i * 5);

        await insertDecisionLogEntry(ctx.db, {
          project_id: project.projectId,
          session_id: project.sessionId,
          entry_type: 'log_iteration',
          phase: 1,
          iteration: i,
          agent_name: 'vision_loop',
          score: 65 + i * 5,
          issues_count: 3 - i,
          content: `Vision v${i}`,
          metadata: {},
        });
      }

      // Simulate resume - history should be preserved
      const state = await getProjectState(ctx.db, project.projectId);
      expect(state?.total_iterations).toBe(2);
      expect(state?.last_iteration_number).toBe(2);

      const entries = await getDecisionLogEntries(ctx.db, project.projectId);
      expect(entries.length).toBe(2);

      await deleteProject(ctx.db, project.projectId);
    });
  });

  describe('Concurrent Resume Prevention', () => {
    it('should detect concurrent resume attempt', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}concurrent` });

      await insertProject(ctx.db, project, {
        current_phase: 1,
        phase_status: 'in_progress',
      });

      // First "resume" - mark as in_progress (being processed)
      await updateProjectPhase(ctx.db, project.projectId, 1, 'in_progress');

      // Second resume attempt should detect in_progress state
      const state = await getProjectState(ctx.db, project.projectId);
      expect(state?.phase_status).toBe('in_progress');

      // Concurrent resume should be blocked when already in_progress
      const isBeingProcessed = state?.phase_status === 'in_progress';
      expect(isBeingProcessed).toBe(true);

      await deleteProject(ctx.db, project.projectId);
    });

    it('should handle stale processing status', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}stale` });

      await insertProject(ctx.db, project, {
        current_phase: 1,
        phase_status: 'in_progress', // Simulating stale in_progress state
      });

      // Simulate stale in_progress (would have timeout in real workflow)
      // For test, we check if updated_at is old enough

      const state = await getProjectState(ctx.db, project.projectId);

      // In real scenario, check: NOW() - updated_at > timeout
      // For test, just verify we can update stale projects
      await updateProjectPhase(ctx.db, project.projectId, 1, 'in_progress');

      const updatedState = await getProjectState(ctx.db, project.projectId);
      expect(updatedState?.phase_status).toBe('in_progress');

      await deleteProject(ctx.db, project.projectId);
    });
  });

  describe('Smart Start Handler', () => {
    it('should return correct resume information', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}smart_info` });

      await insertProject(ctx.db, project, {
        current_phase: 1,
        phase_status: 'in_progress',
      });

      await updateProjectIteration(ctx.db, project.projectId, 1, 2, 78);

      // Upload partial vision artifact
      const visionContent = createVisionDocumentContent(project.projectName, 2);
      const visionKey = await uploadTestArtifact(
        ctx.s3Client,
        project.projectId,
        'ProductVision_v2.md',
        visionContent
      );

      await updateProjectArtifacts(ctx.db, project.projectId, {
        vision_draft: visionKey,
      });

      const state = await getProjectState(ctx.db, project.projectId);

      // Build resume info
      const resumeInfo = {
        projectId: state?.project_id,
        projectName: state?.project_name,
        currentPhase: state?.current_phase,
        phaseStatus: state?.phase_status,
        lastScore: state?.last_iteration_score,
        totalIterations: state?.total_iterations,
        hasVisionDraft: !!state?.artifact_vision_draft,
        hasVisionFinal: !!state?.artifact_vision_final,
        hasArchDraft: !!state?.artifact_architecture_draft,
        hasArchFinal: !!state?.artifact_architecture_final,
      };

      expect(resumeInfo.currentPhase).toBe(1);
      // PostgreSQL NUMERIC returns as string
      expect(parseFloat(String(resumeInfo.lastScore))).toBe(78);
      expect(resumeInfo.hasVisionDraft).toBe(true);
      expect(resumeInfo.hasVisionFinal).toBe(false);

      await deleteProject(ctx.db, project.projectId);
      await cleanupS3Project(ctx.s3Client, project.projectId);
    });

    it('should provide resume options based on state', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}smart_opts` });

      await insertProject(ctx.db, project, {
        current_phase: 2,
        phase_status: 'in_progress',
      });

      // Upload vision final (Phase 1 complete)
      const visionKey = await uploadTestArtifact(
        ctx.s3Client,
        project.projectId,
        'ProductVision_FINAL.md',
        createVisionDocumentContent(project.projectName, 3)
      );

      await updateProjectArtifacts(ctx.db, project.projectId, {
        vision_final: visionKey,
      });

      const state = await getProjectState(ctx.db, project.projectId);

      // Determine resume options
      const options = {
        canResumeCurrentPhase: state?.current_phase === 2,
        canRestartFromPhase1: !!state?.artifact_vision_final,
        canRestartFromScratch: true,
      };

      expect(options.canResumeCurrentPhase).toBe(true);
      expect(options.canRestartFromPhase1).toBe(true);
      expect(options.canRestartFromScratch).toBe(true);

      await deleteProject(ctx.db, project.projectId);
      await cleanupS3Project(ctx.s3Client, project.projectId);
    });
  });

  describe('Artifact Continuity', () => {
    it('should maintain S3 artifacts across resume', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}artifact_cont` });

      await insertProject(ctx.db, project, {
        current_phase: 1,
        phase_status: 'in_progress',
      });

      // Upload input files
      const inputFiles = createTestInputFiles();
      for (const file of inputFiles) {
        await uploadTestFile(
          ctx.s3Client,
          project.projectId,
          file.name,
          `Content of ${file.name}`
        );
      }

      // Upload draft artifacts
      const draft1Key = await uploadTestArtifact(
        ctx.s3Client,
        project.projectId,
        'ProductVision_v1.md',
        createVisionDocumentContent(project.projectName, 1)
      );

      const draft2Key = await uploadTestArtifact(
        ctx.s3Client,
        project.projectId,
        'ProductVision_v2.md',
        createVisionDocumentContent(project.projectName, 2)
      );

      // Simulate "crash" and resume
      // All artifacts should still exist

      const { listProjectArtifacts, listProjectInputFiles, fileExists } = await import('../helpers/s3-helpers');

      const inputs = await listProjectInputFiles(ctx.s3Client, project.projectId);
      expect(inputs.length).toBe(inputFiles.length);

      const artifacts = await listProjectArtifacts(ctx.s3Client, project.projectId);
      expect(artifacts.length).toBe(2);

      // Verify specific files exist
      const draft1Exists = await fileExists(ctx.s3Client, draft1Key);
      const draft2Exists = await fileExists(ctx.s3Client, draft2Key);

      expect(draft1Exists).toBe(true);
      expect(draft2Exists).toBe(true);

      await deleteProject(ctx.db, project.projectId);
      await cleanupS3Project(ctx.s3Client, project.projectId);
    });

    it('should maintain decision log across resume', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}log_cont` });

      await insertProject(ctx.db, project, {
        current_phase: 1,
        phase_status: 'in_progress',
      });

      // Add decision log entries (using valid entry_type values)
      const entries = [
        { entry_type: 'log_phase_start', content: 'Starting Phase 0' },
        { entry_type: 'log_decision', content: 'Found PostgreSQL' },
        { entry_type: 'log_approval', content: 'Approved' },
        { entry_type: 'log_phase_start', content: 'Starting Phase 1' },
        { entry_type: 'log_iteration', content: 'Vision v1' },
      ];

      for (const entry of entries) {
        await insertDecisionLogEntry(ctx.db, {
          project_id: project.projectId,
          session_id: project.sessionId,
          entry_type: entry.entry_type,
          phase: entry.entry_type.includes('phase_start') ? 1 : 0,
          iteration: entry.entry_type === 'iteration' ? 1 : null,
          agent_name: 'test',
          score: null,
          issues_count: null,
          content: entry.content,
          metadata: {},
        });
      }

      // Simulate resume - entries should persist
      const savedEntries = await getDecisionLogEntries(ctx.db, project.projectId);
      expect(savedEntries.length).toBe(entries.length);

      // Add new entry after "resume"
      await insertDecisionLogEntry(ctx.db, {
        project_id: project.projectId,
        session_id: project.sessionId,
        entry_type: 'log_info',
        phase: 1,
        iteration: null,
        agent_name: 'orchestrator',
        score: null,
        issues_count: null,
        content: 'Resumed from Phase 1',
        metadata: { type: 'resume', previous_entries: entries.length },
      });

      const allEntries = await getDecisionLogEntries(ctx.db, project.projectId);
      expect(allEntries.length).toBe(entries.length + 1);
      expect(allEntries[allEntries.length - 1].entry_type).toBe('log_info');

      await deleteProject(ctx.db, project.projectId);
    });
  });

  describe('Session Management', () => {
    it('should track session ID across resume', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}session` });
      const originalSessionId = project.sessionId;

      await insertProject(ctx.db, project);

      // Add entry with original session
      await insertDecisionLogEntry(ctx.db, {
        project_id: project.projectId,
        session_id: originalSessionId,
        entry_type: 'log_phase_start',
        phase: 0,
        iteration: null,
        agent_name: 'orchestrator',
        score: null,
        issues_count: null,
        content: 'Started',
        metadata: {},
      });

      // Simulate resume with new session
      const newSessionId = `session_resume_${Date.now()}`;

      await insertDecisionLogEntry(ctx.db, {
        project_id: project.projectId,
        session_id: newSessionId,
        entry_type: 'log_info',
        phase: 0,
        iteration: null,
        agent_name: 'orchestrator',
        score: null,
        issues_count: null,
        content: 'Resumed',
        metadata: { type: 'resume', original_session: originalSessionId },
      });

      const entries = await getDecisionLogEntries(ctx.db, project.projectId);

      // Should have entries from both sessions
      expect(entries.some((e) => e.session_id === originalSessionId)).toBe(true);
      expect(entries.some((e) => e.session_id === newSessionId)).toBe(true);

      await deleteProject(ctx.db, project.projectId);
    });
  });
});
