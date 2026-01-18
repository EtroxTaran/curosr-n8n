/**
 * Integration Test: Artifact Storage
 * Tests S3 artifact storage for vision, architecture, and decision logs
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createScopedTestContext,
  registerIntegrationTestHooks,
} from './setup';
import {
  createTestProject,
  createVisionDocumentContent,
  createArchitectureDocumentContent,
  createDecisionLogContent,
} from '../helpers/test-fixtures';
import {
  insertProject,
  updateProjectArtifacts,
  getProjectState,
  deleteProject,
} from '../helpers/db-helpers';
import {
  uploadTestArtifact,
  downloadContent,
  fileExists,
  listProjectArtifacts,
  generateDownloadUrl,
  cleanupProject as cleanupS3Project,
  setupCompleteProjectStructure,
} from '../helpers/s3-helpers';

// Register global hooks
registerIntegrationTestHooks();

describe('05: Artifact Storage', () => {
  const scope = createScopedTestContext('artifacts');
  let ctx: Awaited<ReturnType<typeof scope.setup>>;

  beforeAll(async () => {
    ctx = await scope.setup();
  });

  afterAll(async () => {
    await scope.teardown();
  });

  describe('Vision Document Storage', () => {
    it('should store vision draft during iterations', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}vision_draft` });

      await insertProject(ctx.db, project, {
        current_phase: 1,
        phase_status: 'in_progress',
      });

      // Upload vision draft
      const visionContent = createVisionDocumentContent(project.projectName, 1);
      const key = await uploadTestArtifact(
        ctx.s3Client,
        project.projectId,
        'ProductVision_v1.md',
        visionContent
      );

      // Verify file exists
      const exists = await fileExists(ctx.s3Client, key);
      expect(exists).toBe(true);

      // Verify content
      const downloaded = await downloadContent(ctx.s3Client, key);
      expect(downloaded).toBe(visionContent);
      expect(downloaded).toContain(`# Product Vision: ${project.projectName}`);

      // Update database with artifact path
      await updateProjectArtifacts(ctx.db, project.projectId, {
        vision_draft: key,
      });

      const state = await getProjectState(ctx.db, project.projectId);
      expect(state?.artifact_vision_draft).toBe(key);

      await deleteProject(ctx.db, project.projectId);
      await cleanupS3Project(ctx.s3Client, project.projectId);
    });

    it('should store vision final when score threshold met', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}vision_final` });

      await insertProject(ctx.db, project, {
        current_phase: 1,
        phase_status: 'in_progress',
      });

      // Upload final vision
      const visionContent = createVisionDocumentContent(project.projectName, 3);
      const key = await uploadTestArtifact(
        ctx.s3Client,
        project.projectId,
        'ProductVision_FINAL.md',
        visionContent
      );

      // Update database
      await updateProjectArtifacts(ctx.db, project.projectId, {
        vision_final: key,
      });

      const state = await getProjectState(ctx.db, project.projectId);
      expect(state?.artifact_vision_final).toBe(key);

      await deleteProject(ctx.db, project.projectId);
      await cleanupS3Project(ctx.s3Client, project.projectId);
    });

    it('should maintain version history of vision documents', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}vision_history` });

      await insertProject(ctx.db, project);

      // Upload multiple versions
      const versions = [1, 2, 3];
      for (const v of versions) {
        const content = createVisionDocumentContent(project.projectName, v);
        await uploadTestArtifact(
          ctx.s3Client,
          project.projectId,
          `ProductVision_v${v}.md`,
          content
        );
      }

      // List artifacts
      const artifacts = await listProjectArtifacts(ctx.s3Client, project.projectId);

      expect(artifacts.length).toBe(3);
      expect(artifacts.some((k) => k.includes('ProductVision_v1.md'))).toBe(true);
      expect(artifacts.some((k) => k.includes('ProductVision_v2.md'))).toBe(true);
      expect(artifacts.some((k) => k.includes('ProductVision_v3.md'))).toBe(true);

      await deleteProject(ctx.db, project.projectId);
      await cleanupS3Project(ctx.s3Client, project.projectId);
    });
  });

  describe('Architecture Document Storage', () => {
    it('should store architecture drafts and final', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}arch` });

      await insertProject(ctx.db, project, {
        current_phase: 2,
        phase_status: 'in_progress',
      });

      // Upload draft
      const draftContent = createArchitectureDocumentContent(project.projectName, 1);
      const draftKey = await uploadTestArtifact(
        ctx.s3Client,
        project.projectId,
        'Architecture_v1.md',
        draftContent
      );

      await updateProjectArtifacts(ctx.db, project.projectId, {
        architecture_draft: draftKey,
      });

      // Upload final
      const finalContent = createArchitectureDocumentContent(project.projectName, 2);
      const finalKey = await uploadTestArtifact(
        ctx.s3Client,
        project.projectId,
        'Architecture_FINAL.md',
        finalContent
      );

      await updateProjectArtifacts(ctx.db, project.projectId, {
        architecture_final: finalKey,
      });

      // Verify database
      const state = await getProjectState(ctx.db, project.projectId);
      expect(state?.artifact_architecture_draft).toBe(draftKey);
      expect(state?.artifact_architecture_final).toBe(finalKey);

      // Verify content
      const downloadedFinal = await downloadContent(ctx.s3Client, finalKey);
      expect(downloadedFinal).toContain('Architecture Vision');
      expect(downloadedFinal).toContain('C4 Level');

      await deleteProject(ctx.db, project.projectId);
      await cleanupS3Project(ctx.s3Client, project.projectId);
    });
  });

  describe('Decision Log Storage', () => {
    it('should store decision log continuously', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}declog` });

      await insertProject(ctx.db, project);

      // Upload initial decision log
      let logContent = createDecisionLogContent(project.projectId, []);
      const key = await uploadTestArtifact(
        ctx.s3Client,
        project.projectId,
        'decision_log.md',
        logContent
      );

      // Verify initial upload
      let exists = await fileExists(ctx.s3Client, key);
      expect(exists).toBe(true);

      // Simulate appending new entries by re-uploading
      logContent = createDecisionLogContent(project.projectId, [
        { type: 'tech_discovery', content: 'Found PostgreSQL' },
        { type: 'governance', content: 'Approved tech stack' },
      ]);

      await uploadTestArtifact(
        ctx.s3Client,
        project.projectId,
        'decision_log.md',
        logContent
      );

      // Verify updated content
      const downloaded = await downloadContent(ctx.s3Client, key);
      expect(downloaded).toContain('tech_discovery');
      expect(downloaded).toContain('governance');

      await deleteProject(ctx.db, project.projectId);
      await cleanupS3Project(ctx.s3Client, project.projectId);
    });

    it('should link decision log in database', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}declog_db` });

      await insertProject(ctx.db, project);

      const logContent = createDecisionLogContent(project.projectId, []);
      const key = await uploadTestArtifact(
        ctx.s3Client,
        project.projectId,
        'decision_log.md',
        logContent
      );

      await updateProjectArtifacts(ctx.db, project.projectId, {
        decision_log: key,
      });

      const state = await getProjectState(ctx.db, project.projectId);
      expect(state?.artifact_decision_log).toBe(key);

      await deleteProject(ctx.db, project.projectId);
      await cleanupS3Project(ctx.s3Client, project.projectId);
    });
  });

  describe('Presigned Download URLs', () => {
    it('should generate presigned download URL for artifacts', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}presigned` });

      await insertProject(ctx.db, project);

      // Upload artifact
      const content = createVisionDocumentContent(project.projectName, 1);
      const key = await uploadTestArtifact(
        ctx.s3Client,
        project.projectId,
        'ProductVision_FINAL.md',
        content
      );

      // Generate presigned URL
      const url = await generateDownloadUrl(ctx.s3Client, key);

      expect(url).toBeDefined();
      expect(url).toContain(project.projectId);
      expect(url).toContain('X-Amz-Signature');

      // Verify URL works
      const response = await fetch(url);
      expect(response.ok).toBe(true);

      const downloadedContent = await response.text();
      expect(downloadedContent).toBe(content);

      await deleteProject(ctx.db, project.projectId);
      await cleanupS3Project(ctx.s3Client, project.projectId);
    });
  });

  describe('Complete Project Structure', () => {
    it('should create complete project structure with all artifacts', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}complete` });

      // Create complete structure
      const visionContent = createVisionDocumentContent(project.projectName, 3);
      const archContent = createArchitectureDocumentContent(project.projectName, 2);
      const logContent = createDecisionLogContent(project.projectId, [
        { type: 'phase_complete', content: 'Workflow complete' },
      ]);

      const { input, artifacts } = await setupCompleteProjectStructure(
        ctx.s3Client,
        project.projectId,
        visionContent,
        archContent,
        logContent
      );

      // Verify input files
      expect(input.length).toBe(2);

      // Verify artifacts
      expect(artifacts.length).toBe(3);
      expect(artifacts.some((k) => k.includes('ProductVision_FINAL.md'))).toBe(true);
      expect(artifacts.some((k) => k.includes('Architecture_FINAL.md'))).toBe(true);
      expect(artifacts.some((k) => k.includes('decision_log.md'))).toBe(true);

      await cleanupS3Project(ctx.s3Client, project.projectId);
    });

    it('should list all project files by category', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}list_all` });

      const visionContent = createVisionDocumentContent(project.projectName, 1);
      const archContent = createArchitectureDocumentContent(project.projectName, 1);
      const logContent = createDecisionLogContent(project.projectId, []);

      await setupCompleteProjectStructure(
        ctx.s3Client,
        project.projectId,
        visionContent,
        archContent,
        logContent
      );

      // Import and use listAllProjectFiles
      const { listAllProjectFiles } = await import('../helpers/s3-helpers');
      const files = await listAllProjectFiles(ctx.s3Client, project.projectId);

      expect(files.input.length).toBeGreaterThan(0);
      expect(files.artifacts.length).toBeGreaterThan(0);
      expect(files.state.length).toBeGreaterThan(0); // project_state.json

      await cleanupS3Project(ctx.s3Client, project.projectId);
    });
  });

  describe('Content Validation', () => {
    it('should preserve markdown formatting in vision document', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}markdown` });

      const content = `# Product Vision

## Executive Summary

This is a **bold** statement and *italic* text.

### Features
- Feature 1
- Feature 2
- Feature 3

\`\`\`typescript
const code = "example";
\`\`\`

| Column 1 | Column 2 |
|----------|----------|
| Value 1  | Value 2  |
`;

      const key = await uploadTestArtifact(
        ctx.s3Client,
        project.projectId,
        'test.md',
        content,
        'text/markdown'
      );

      const downloaded = await downloadContent(ctx.s3Client, key);

      // Verify markdown preserved exactly
      expect(downloaded).toBe(content);
      expect(downloaded).toContain('**bold**');
      expect(downloaded).toContain('```typescript');
      expect(downloaded).toContain('| Column 1 |');

      await cleanupS3Project(ctx.s3Client, project.projectId);
    });

    it('should handle large documents', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}large_doc` });

      // Generate large content (~100KB)
      let content = '# Large Document\n\n';
      for (let i = 0; i < 1000; i++) {
        content += `## Section ${i}\n\nThis is section ${i} with some content. `.repeat(10) + '\n\n';
      }

      const key = await uploadTestArtifact(
        ctx.s3Client,
        project.projectId,
        'large_document.md',
        content
      );

      const downloaded = await downloadContent(ctx.s3Client, key);
      expect(downloaded.length).toBe(content.length);
      expect(downloaded).toBe(content);

      await cleanupS3Project(ctx.s3Client, project.projectId);
    });

    it('should handle special characters in content', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}special` });

      const content = `# Special Characters Test

Unicode: 你好世界 🚀 émojis ñ

Special: < > & " ' \` $ { } [ ]

Code: \`const x = 1 && 2 || 3;\`

Math: 2 + 2 = 4, 5 > 3, 2 < 4
`;

      const key = await uploadTestArtifact(
        ctx.s3Client,
        project.projectId,
        'special.md',
        content
      );

      const downloaded = await downloadContent(ctx.s3Client, key);
      expect(downloaded).toBe(content);
      expect(downloaded).toContain('你好世界');
      expect(downloaded).toContain('🚀');

      await cleanupS3Project(ctx.s3Client, project.projectId);
    });
  });
});
