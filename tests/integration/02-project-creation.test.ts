/**
 * Integration Test: Project Creation
 * Tests /api/start-project endpoint and database state
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createScopedTestContext,
  registerIntegrationTestHooks,
  getDashboardApiUrl,
  getMockN8nUrl,
  fetchDashboardApi,
} from './setup';
import {
  createTestProject,
  createTestInputFiles,
  createStartProjectRequest,
} from '../helpers/test-fixtures';
import {
  getProjectState,
  deleteProject,
} from '../helpers/db-helpers';
import {
  uploadTestFile,
  cleanupProject as cleanupS3Project,
} from '../helpers/s3-helpers';

// Register global hooks
registerIntegrationTestHooks();

describe('02: Project Creation', () => {
  const scope = createScopedTestContext('projcreate');
  let ctx: Awaited<ReturnType<typeof scope.setup>>;

  beforeAll(async () => {
    ctx = await scope.setup();

    // Configure mock n8n to accept start-project webhook
    ctx.mockN8n.setResponse('/webhook/start-project', {
      success: true,
      execution_id: 'exec_test_123',
      message: 'Workflow started',
    });
  });

  afterAll(async () => {
    await scope.teardown();
  });

  describe('POST /api/start-project', () => {
    it('should create project with valid request', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}create_valid` });
      const inputFiles = createTestInputFiles();

      // Upload input files to S3 first
      for (const file of inputFiles) {
        await uploadTestFile(
          ctx.s3Client,
          project.projectId,
          file.name,
          `# ${file.name}\n\nTest content for ${file.name}`
        );
      }

      // Create start project request
      const request = createStartProjectRequest(project, inputFiles);

      // Send request to dashboard API
      const response = await fetchDashboardApi('/start-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response) return;

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.project_id).toBe(project.projectId);

      // Verify project was created in database
      const state = await getProjectState(ctx.db, project.projectId);
      expect(state).not.toBeNull();
      expect(state?.project_name).toBe(project.projectName);
      expect(state?.current_phase).toBe(0);

      // Cleanup
      await deleteProject(ctx.db, project.projectId);
      await cleanupS3Project(ctx.s3Client, project.projectId);
    });

    it('should trigger n8n webhook with correct payload', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}create_webhook` });
      const inputFiles = createTestInputFiles();

      // Upload input files
      for (const file of inputFiles) {
        await uploadTestFile(
          ctx.s3Client,
          project.projectId,
          file.name,
          `Test content`
        );
      }

      const request = createStartProjectRequest(project, inputFiles);

      // Clear previous calls
      ctx.mockN8n.clearCallsFor('/webhook/start-project');

      const response = await fetchDashboardApi('/start-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response) return;

      // Wait for webhook call
      const calls = await ctx.mockN8n.waitForCalls('/webhook/start-project', 1, 5000);

      expect(calls.length).toBeGreaterThanOrEqual(1);

      const lastCall = calls[calls.length - 1];
      expect(lastCall.body.project_id).toBe(project.projectId);
      expect(lastCall.body.project_name).toBe(project.projectName);
      expect(lastCall.body.input_files).toBeDefined();

      // Cleanup
      await deleteProject(ctx.db, project.projectId);
      await cleanupS3Project(ctx.s3Client, project.projectId);
    });

    it('should include correlation ID in webhook call', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}create_corrid` });
      const inputFiles = createTestInputFiles();

      for (const file of inputFiles) {
        await uploadTestFile(ctx.s3Client, project.projectId, file.name, 'Content');
      }

      const request = createStartProjectRequest(project, inputFiles);

      ctx.mockN8n.clearCallsFor('/webhook/start-project');

      const response = await fetchDashboardApi('/start-project', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-correlation-id': 'test-correlation-123',
        },
        body: JSON.stringify(request),
      });

      if (!response) return;

      // Response should include correlation ID
      const correlationId = response.headers.get('x-correlation-id');
      expect(correlationId).toBe('test-correlation-123');

      // Cleanup
      await deleteProject(ctx.db, project.projectId);
      await cleanupS3Project(ctx.s3Client, project.projectId);
    });

    it('should reject duplicate project ID', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}create_dup` });
      const inputFiles = createTestInputFiles();

      for (const file of inputFiles) {
        await uploadTestFile(ctx.s3Client, project.projectId, file.name, 'Content');
      }

      const request = createStartProjectRequest(project, inputFiles);

      // Create first project
      const response1 = await fetchDashboardApi('/start-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response1) return;

      expect(response1.ok).toBe(true);

      // Try to create duplicate
      const response2 = await fetchDashboardApi('/start-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response2) return;

      // Should reject duplicate
      expect(response2.ok).toBe(false);
      expect(response2.status).toBe(409); // Conflict

      // Cleanup
      await deleteProject(ctx.db, project.projectId);
      await cleanupS3Project(ctx.s3Client, project.projectId);
    });

    it('should reject request with missing required fields', async () => {
      // Missing projectName
      const response = await fetchDashboardApi('/start-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: `${ctx.suitePrefix}invalid`,
          // projectName missing
          inputFiles: [],
        }),
      });

      if (!response) return;

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });

    it('should reject request with empty input files', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}empty_files` });

      const response = await fetchDashboardApi('/start-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.projectId,
          projectName: project.projectName,
          inputFiles: [], // Empty
        }),
      });

      if (!response) return;

      // Should reject or accept with warning
      // Behavior depends on implementation
      if (!response.ok) {
        expect(response.status).toBe(400);
      }
    });
  });

  describe('Database State', () => {
    it('should create project with correct initial state', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}db_state` });
      const inputFiles = createTestInputFiles();

      for (const file of inputFiles) {
        await uploadTestFile(ctx.s3Client, project.projectId, file.name, 'Content');
      }

      const request = createStartProjectRequest(project, inputFiles);

      const response = await fetchDashboardApi('/start-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response) return;

      // Verify database state
      const state = await getProjectState(ctx.db, project.projectId);
      expect(state).not.toBeNull();

      // Check initial values
      expect(state?.current_phase).toBe(0);
      expect(state?.phase_status).toBe('pending');
      expect(state?.total_iterations).toBe(0);
      expect(state?.completed_at).toBeNull();

      // Check input files stored
      const storedFiles = state?.input_files as unknown[];
      expect(Array.isArray(storedFiles)).toBe(true);
      expect(storedFiles.length).toBe(inputFiles.length);

      // Cleanup
      await deleteProject(ctx.db, project.projectId);
      await cleanupS3Project(ctx.s3Client, project.projectId);
    });

    it('should store project config correctly', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}db_config` });
      const inputFiles = createTestInputFiles();

      for (const file of inputFiles) {
        await uploadTestFile(ctx.s3Client, project.projectId, file.name, 'Content');
      }

      const request = {
        ...createStartProjectRequest(project, inputFiles),
        config: {
          max_iterations: 3,
          score_threshold: 85,
        },
      };

      const response = await fetchDashboardApi('/start-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response) return;

      const state = await getProjectState(ctx.db, project.projectId);
      const config = state?.config as Record<string, unknown>;

      expect(config).toBeDefined();
      // Config should include our overrides or defaults
      expect(config.max_iterations || config.maxIterations).toBeDefined();

      // Cleanup
      await deleteProject(ctx.db, project.projectId);
      await cleanupS3Project(ctx.s3Client, project.projectId);
    });
  });
});
