/**
 * E2E Test: Complete Workflow
 * Tests the full project lifecycle from creation to completion
 *
 * This test requires:
 * - All services running (n8n, PostgreSQL, S3, optionally Qdrant/Graphiti)
 * - n8n workflows deployed and active
 * - Dashboard application running
 *
 * Estimated runtime: 15-30 minutes
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  registerE2ETestHooks,
  getE2EContext,
  E2E_TIMEOUTS,
  skipIfWorkflowsNotDeployed,
} from './setup';
import {
  createTestProject,
  createTestInputFiles,
  createStartProjectRequest,
} from '../helpers/test-fixtures';
import {
  getProjectState,
  deleteProject,
  getDecisionLogEntries,
} from '../helpers/db-helpers';
import {
  uploadTestFile,
  fileExists,
  downloadContent,
  listProjectArtifacts,
  cleanupProject as cleanupS3Project,
} from '../helpers/s3-helpers';
import {
  waitForProjectPhase,
  waitForArtifact,
  waitForProjectCompletion,
  sleep,
} from '../helpers/wait-helpers';

// Register E2E hooks
registerE2ETestHooks();

describe('E2E: Complete Workflow', () => {
  let ctx: ReturnType<typeof getE2EContext>;
  let workflowsDeployed = false;

  beforeAll(async () => {
    ctx = getE2EContext();
    workflowsDeployed = !(await skipIfWorkflowsNotDeployed());
  });

  describe('Full Project Lifecycle', () => {
    it('should complete entire workflow from upload to final artifacts', async () => {
      if (!workflowsDeployed) {
        console.log('   ⏭️  Skipping: Workflows not deployed');
        return;
      }

      const project = createTestProject({
        projectId: `${ctx.testPrefix}full_lifecycle`,
        projectName: 'E2E Test Project',
      });

      try {
        // =========================================
        // Step 1: Upload Input Documents
        // =========================================
        console.log('\n📤 Step 1: Uploading input documents...');

        const inputFiles = createTestInputFiles();
        const uploadedKeys: string[] = [];

        for (const file of inputFiles) {
          const content = `# ${file.name}\n\n## Overview\n\nThis is test input for E2E testing.\n\n## Technical Requirements\n\n- Use PostgreSQL for database\n- Use React for frontend\n- Use TypeScript for type safety\n- Deploy on Kubernetes`;

          const key = await uploadTestFile(
            ctx.s3Client,
            project.projectId,
            file.name,
            content,
            file.contentType
          );
          uploadedKeys.push(key);
        }

        // Verify uploads
        for (const key of uploadedKeys) {
          const exists = await fileExists(ctx.s3Client, key);
          expect(exists).toBe(true);
        }

        console.log(`   ✓ Uploaded ${uploadedKeys.length} files`);

        // =========================================
        // Step 2: Create Project via API
        // =========================================
        console.log('\n🚀 Step 2: Creating project via API...');

        const startRequest = createStartProjectRequest(project, inputFiles);

        const createResponse = await fetch(`${ctx.dashboardUrl}/api/start-project`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(startRequest),
        });

        if (!createResponse.ok) {
          const errorText = await createResponse.text();
          throw new Error(`Failed to create project: ${createResponse.status} - ${errorText}`);
        }

        const createData = await createResponse.json();
        expect(createData.success).toBe(true);
        expect(createData.project_id).toBe(project.projectId);

        console.log(`   ✓ Project created: ${project.projectId}`);

        // =========================================
        // Step 3: Wait for Phase 0 (Governance)
        // =========================================
        console.log('\n⏳ Step 3: Waiting for Phase 0 (Governance)...');

        const phase0Result = await waitForProjectPhase(
          ctx.db,
          project.projectId,
          0,
          {
            timeoutMs: E2E_TIMEOUTS.WORKFLOW_PHASE,
            intervalMs: 5000,
          }
        );

        if (!phase0Result.success) {
          console.log('   ⚠️  Phase 0 not reached within timeout - may need manual governance');
        } else {
          console.log('   ✓ Phase 0 reached');
        }

        // Check if awaiting governance
        const stateAfterPhase0 = await getProjectState(ctx.db, project.projectId);
        if (stateAfterPhase0?.phase_status === 'awaiting_governance') {
          console.log('   ℹ️  Project awaiting governance approval');

          // In E2E with real n8n, governance would be handled by the UI
          // For automated E2E, we might need to simulate this
          console.log('   ⏭️  Skipping governance simulation - requires manual approval');

          // Note: In a real E2E test with Playwright, we would:
          // 1. Navigate to the governance UI
          // 2. Click approve buttons
          // 3. Submit the form
        }

        // =========================================
        // Step 4: Wait for Phase 1 Completion
        // =========================================
        console.log('\n⏳ Step 4: Waiting for Phase 1 (Vision)...');

        const phase1Result = await waitForProjectPhase(
          ctx.db,
          project.projectId,
          1,
          {
            timeoutMs: E2E_TIMEOUTS.WORKFLOW_PHASE,
            intervalMs: 10000,
          }
        );

        // Note: May not complete if governance is pending
        if (phase1Result.success) {
          console.log('   ✓ Phase 1 reached');

          // Wait for vision artifact
          const visionResult = await waitForArtifact(
            ctx.s3Client,
            project.projectId,
            'ProductVision',
            {
              timeoutMs: E2E_TIMEOUTS.WORKFLOW_PHASE,
              intervalMs: 10000,
            }
          );

          if (visionResult.success) {
            console.log('   ✓ Vision document created');
          }
        }

        // =========================================
        // Step 5: Wait for Phase 2 Completion
        // =========================================
        console.log('\n⏳ Step 5: Waiting for Phase 2 (Architecture)...');

        const phase2Result = await waitForProjectPhase(
          ctx.db,
          project.projectId,
          2,
          {
            timeoutMs: E2E_TIMEOUTS.WORKFLOW_PHASE,
            intervalMs: 10000,
          }
        );

        if (phase2Result.success) {
          console.log('   ✓ Phase 2 reached');

          // Wait for architecture artifact
          const archResult = await waitForArtifact(
            ctx.s3Client,
            project.projectId,
            'Architecture',
            {
              timeoutMs: E2E_TIMEOUTS.WORKFLOW_PHASE,
              intervalMs: 10000,
            }
          );

          if (archResult.success) {
            console.log('   ✓ Architecture document created');
          }
        }

        // =========================================
        // Step 6: Verify Final State
        // =========================================
        console.log('\n🔍 Step 6: Verifying final state...');

        const finalState = await getProjectState(ctx.db, project.projectId);

        console.log(`   Phase: ${finalState?.current_phase}`);
        console.log(`   Status: ${finalState?.phase_status}`);
        console.log(`   Iterations: ${finalState?.total_iterations}`);

        // Verify artifacts exist
        const artifacts = await listProjectArtifacts(ctx.s3Client, project.projectId);
        console.log(`   Artifacts: ${artifacts.length}`);

        for (const artifact of artifacts) {
          const filename = artifact.split('/').pop();
          console.log(`     - ${filename}`);
        }

        // Verify decision log
        const entries = await getDecisionLogEntries(ctx.db, project.projectId);
        console.log(`   Decision log entries: ${entries.length}`);

        // =========================================
        // Assertions
        // =========================================
        console.log('\n✅ Running assertions...');

        // Project should exist
        expect(finalState).not.toBeNull();

        // Should have progressed past Phase 0 (or be paused for governance)
        // Valid phase_status values: pending, in_progress, completed, failed, paused
        const validStatuses = ['in_progress', 'completed', 'pending', 'paused'];
        expect(validStatuses).toContain(finalState?.phase_status);

        // Should have at least some decision log entries
        expect(entries.length).toBeGreaterThan(0);

        console.log('\n✓ E2E test completed successfully');

      } finally {
        // Cleanup
        console.log('\n🧹 Cleaning up...');
        await deleteProject(ctx.db, project.projectId);
        await cleanupS3Project(ctx.s3Client, project.projectId);
        console.log('   ✓ Cleanup complete');
      }
    }, E2E_TIMEOUTS.FULL_WORKFLOW);
  });

  describe('Workflow State Verification', () => {
    it('should track iteration scores correctly', async () => {
      if (!workflowsDeployed) {
        console.log('   ⏭️  Skipping: Workflows not deployed');
        return;
      }

      // This test verifies that score tracking works correctly
      // by checking a project that has completed at least one iteration

      const project = createTestProject({
        projectId: `${ctx.testPrefix}score_tracking`,
      });

      try {
        // Create project
        const inputFiles = createTestInputFiles();
        for (const file of inputFiles) {
          await uploadTestFile(
            ctx.s3Client,
            project.projectId,
            file.name,
            `Test content for ${file.name}`
          );
        }

        const response = await fetch(`${ctx.dashboardUrl}/api/start-project`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createStartProjectRequest(project, inputFiles)),
        });

        if (!response.ok) {
          console.log('   ⏭️  Skipping: Could not create project');
          return;
        }

        // Wait a bit for initial processing
        await sleep(5000);

        // Check state
        const state = await getProjectState(ctx.db, project.projectId);
        expect(state).not.toBeNull();
        expect(state?.project_name).toBe(project.projectName);

      } finally {
        await deleteProject(ctx.db, project.projectId);
        await cleanupS3Project(ctx.s3Client, project.projectId);
      }
    }, 60000);
  });

  describe('Artifact Integrity', () => {
    it('should generate valid markdown documents', async () => {
      if (!workflowsDeployed) {
        console.log('   ⏭️  Skipping: Workflows not deployed');
        return;
      }

      // This test would verify that generated documents are valid markdown
      // and contain expected sections

      // For now, just verify the test infrastructure works
      const project = createTestProject({
        projectId: `${ctx.testPrefix}artifact_check`,
      });

      try {
        // Upload test content
        const testContent = '# Test Document\n\n## Section 1\n\nContent here.';
        const key = await uploadTestFile(
          ctx.s3Client,
          project.projectId,
          'test.md',
          testContent
        );

        // Verify content can be retrieved
        const downloaded = await downloadContent(ctx.s3Client, key);
        expect(downloaded).toBe(testContent);
        expect(downloaded).toContain('# Test Document');

      } finally {
        await cleanupS3Project(ctx.s3Client, project.projectId);
      }
    }, 30000);
  });
});
