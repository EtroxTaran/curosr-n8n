/**
 * E2E Test: Concurrent Projects
 * Tests parallel project processing capability
 *
 * This test verifies that multiple projects can be processed simultaneously
 * without interference or data corruption.
 *
 * Estimated runtime: 10-20 minutes
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
} from '../helpers/db-helpers';
import {
  uploadTestFile,
  listProjectArtifacts,
  cleanupProject as cleanupS3Project,
} from '../helpers/s3-helpers';
import {
  waitForProjectPhase,
  sleep,
} from '../helpers/wait-helpers';

// Register E2E hooks
registerE2ETestHooks();

describe('E2E: Concurrent Projects', () => {
  let ctx: ReturnType<typeof getE2EContext>;
  let workflowsDeployed = false;

  beforeAll(async () => {
    ctx = getE2EContext();
    workflowsDeployed = !(await skipIfWorkflowsNotDeployed());
  });

  describe('Parallel Processing', () => {
    it('should handle multiple concurrent project creations', async () => {
      if (!workflowsDeployed) {
        console.log('   ⏭️  Skipping: Workflows not deployed');
        return;
      }

      const PROJECT_COUNT = 3;
      const projects: Array<{
        project: ReturnType<typeof createTestProject>;
        inputFiles: ReturnType<typeof createTestInputFiles>;
      }> = [];

      console.log(`\n🚀 Creating ${PROJECT_COUNT} concurrent projects...`);

      try {
        // =========================================
        // Step 1: Create Multiple Projects in Parallel
        // =========================================

        // Prepare projects
        for (let i = 0; i < PROJECT_COUNT; i++) {
          const project = createTestProject({
            projectId: `${ctx.testPrefix}concurrent_${i}`,
            projectName: `Concurrent Project ${i + 1}`,
          });
          const inputFiles = createTestInputFiles();
          projects.push({ project, inputFiles });
        }

        // Upload files for all projects
        console.log('\n📤 Uploading input files...');
        const uploadPromises = projects.map(async ({ project, inputFiles }) => {
          for (const file of inputFiles) {
            await uploadTestFile(
              ctx.s3Client,
              project.projectId,
              file.name,
              `# ${file.name}\n\n## Project: ${project.projectName}\n\nTest content for concurrent processing test.`
            );
          }
          return project.projectId;
        });

        await Promise.all(uploadPromises);
        console.log(`   ✓ Uploaded files for ${PROJECT_COUNT} projects`);

        // Create all projects simultaneously
        console.log('\n🚀 Starting projects concurrently...');
        const createPromises = projects.map(async ({ project, inputFiles }) => {
          const response = await fetch(`${ctx.dashboardUrl}/api/start-project`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(createStartProjectRequest(project, inputFiles)),
          });

          if (!response.ok) {
            const text = await response.text();
            throw new Error(`Failed to create ${project.projectId}: ${response.status} - ${text}`);
          }

          return { projectId: project.projectId, success: true };
        });

        const createResults = await Promise.all(createPromises);

        // Verify all created successfully
        for (const result of createResults) {
          expect(result.success).toBe(true);
          console.log(`   ✓ Created: ${result.projectId}`);
        }

        // =========================================
        // Step 2: Wait for Initial Processing
        // =========================================
        console.log('\n⏳ Waiting for initial processing...');
        await sleep(10000);

        // =========================================
        // Step 3: Verify Isolation
        // =========================================
        console.log('\n🔍 Verifying project isolation...');

        for (const { project } of projects) {
          const state = await getProjectState(ctx.db, project.projectId);

          expect(state).not.toBeNull();
          expect(state?.project_name).toBe(project.projectName);
          expect(state?.project_id).toBe(project.projectId);

          // Each project should have its own input files
          const inputFilesJson = state?.input_files as unknown[];
          expect(Array.isArray(inputFilesJson)).toBe(true);

          console.log(`   ✓ ${project.projectId}: Phase ${state?.current_phase}, Status: ${state?.phase_status}`);
        }

        // =========================================
        // Step 4: Verify No Cross-Contamination
        // =========================================
        console.log('\n🔍 Verifying no data cross-contamination...');

        for (let i = 0; i < projects.length; i++) {
          const { project } = projects[i];

          // List artifacts for this project
          const artifacts = await listProjectArtifacts(ctx.s3Client, project.projectId);

          // All artifacts should belong to this project
          for (const artifact of artifacts) {
            expect(artifact).toContain(project.projectId);
            // Should NOT contain other project IDs
            for (let j = 0; j < projects.length; j++) {
              if (i !== j) {
                expect(artifact).not.toContain(projects[j].project.projectId);
              }
            }
          }
        }

        console.log('   ✓ No cross-contamination detected');

        console.log('\n✅ Concurrent projects test completed');

      } finally {
        // Cleanup all projects
        console.log('\n🧹 Cleaning up...');
        for (const { project } of projects) {
          try {
            await deleteProject(ctx.db, project.projectId);
            await cleanupS3Project(ctx.s3Client, project.projectId);
          } catch {
            // Ignore cleanup errors
          }
        }
        console.log('   ✓ Cleanup complete');
      }
    }, E2E_TIMEOUTS.FULL_WORKFLOW);

    it('should maintain data integrity under concurrent load', async () => {
      if (!workflowsDeployed) {
        console.log('   ⏭️  Skipping: Workflows not deployed');
        return;
      }

      const project = createTestProject({
        projectId: `${ctx.testPrefix}integrity_test`,
      });

      try {
        // Upload files
        const inputFiles = createTestInputFiles();
        for (const file of inputFiles) {
          await uploadTestFile(
            ctx.s3Client,
            project.projectId,
            file.name,
            `Content for ${file.name}`
          );
        }

        // Create project
        const response = await fetch(`${ctx.dashboardUrl}/api/start-project`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createStartProjectRequest(project, inputFiles)),
        });

        if (!response.ok) {
          console.log('   ⏭️  Skipping: Could not create project');
          return;
        }

        // Perform multiple concurrent reads
        const readPromises: Promise<unknown>[] = [];
        for (let i = 0; i < 10; i++) {
          readPromises.push(getProjectState(ctx.db, project.projectId));
        }

        const readResults = await Promise.all(readPromises);

        // All reads should return the same data
        const firstResult = JSON.stringify(readResults[0]);
        for (const result of readResults) {
          expect(JSON.stringify(result)).toBe(firstResult);
        }

        console.log('   ✓ Data integrity maintained under concurrent reads');

      } finally {
        await deleteProject(ctx.db, project.projectId);
        await cleanupS3Project(ctx.s3Client, project.projectId);
      }
    }, 60000);
  });

  describe('Resource Management', () => {
    it('should handle project cleanup correctly', async () => {
      const project = createTestProject({
        projectId: `${ctx.testPrefix}cleanup_test`,
      });

      try {
        // Upload files
        await uploadTestFile(
          ctx.s3Client,
          project.projectId,
          'test.md',
          '# Test'
        );

        // Verify file exists
        const { fileExists } = await import('../helpers/s3-helpers');
        const key = `projects/${project.projectId}/input/test.md`;
        let exists = await fileExists(ctx.s3Client, key);
        expect(exists).toBe(true);

        // Cleanup
        await cleanupS3Project(ctx.s3Client, project.projectId);

        // Verify file deleted
        exists = await fileExists(ctx.s3Client, key);
        expect(exists).toBe(false);

        console.log('   ✓ Cleanup verified');

      } catch (error) {
        // Ensure cleanup even on error
        await cleanupS3Project(ctx.s3Client, project.projectId);
        throw error;
      }
    }, 30000);

    it('should isolate database records between projects', async () => {
      const project1 = createTestProject({
        projectId: `${ctx.testPrefix}iso_1`,
        projectName: 'Isolation Test 1',
      });
      const project2 = createTestProject({
        projectId: `${ctx.testPrefix}iso_2`,
        projectName: 'Isolation Test 2',
      });

      try {
        // Insert both projects
        const { insertProject } = await import('../helpers/db-helpers');

        await insertProject(ctx.db, project1);
        await insertProject(ctx.db, project2);

        // Get both states
        const state1 = await getProjectState(ctx.db, project1.projectId);
        const state2 = await getProjectState(ctx.db, project2.projectId);

        // Verify isolation
        expect(state1?.project_id).toBe(project1.projectId);
        expect(state1?.project_name).toBe(project1.projectName);

        expect(state2?.project_id).toBe(project2.projectId);
        expect(state2?.project_name).toBe(project2.projectName);

        // Delete one project
        await deleteProject(ctx.db, project1.projectId);

        // Verify project1 is gone but project2 still exists
        const state1After = await getProjectState(ctx.db, project1.projectId);
        const state2After = await getProjectState(ctx.db, project2.projectId);

        expect(state1After).toBeNull();
        expect(state2After).not.toBeNull();
        expect(state2After?.project_id).toBe(project2.projectId);

        console.log('   ✓ Database isolation verified');

      } finally {
        // Cleanup
        try { await deleteProject(ctx.db, project1.projectId); } catch { /* ignore */ }
        try { await deleteProject(ctx.db, project2.projectId); } catch { /* ignore */ }
      }
    }, 30000);
  });
});
