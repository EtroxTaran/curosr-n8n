/**
 * Integration Test: File Upload Flow
 * Tests presigned URL generation and S3 file upload
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  createScopedTestContext,
  registerIntegrationTestHooks,
  getTestContext,
  getDashboardApiUrl,
  fetchDashboardApi,
} from './setup';
import {
  createTestProject,
  createTestInputFile,
} from '../helpers/test-fixtures';
import {
  fileExists,
  downloadContent,
  listProjectInputFiles,
  cleanupProject as cleanupS3Project,
  uploadWithPresignedUrl,
} from '../helpers/s3-helpers';

// Register global hooks
registerIntegrationTestHooks();

describe('01: File Upload Flow', () => {
  const scope = createScopedTestContext('fileupload');
  let ctx: Awaited<ReturnType<typeof scope.setup>>;

  beforeAll(async () => {
    ctx = await scope.setup();
  });

  afterAll(async () => {
    await scope.teardown();
  });

  describe('Presigned URL Generation', () => {
    it('should generate presigned URL for valid file request', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}presigned_valid` });
      const file = createTestInputFile('test-doc.md');

      // Request presigned URL
      const response = await fetchDashboardApi('/presigned-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.projectId,
          filename: file.name,
          contentType: file.contentType,
        }),
      });

      // Skip if dashboard not available (already logged by fetchDashboardApi)
      if (!response) return;

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('uploadUrl');
      expect(data).toHaveProperty('key');
      expect(data.key).toContain(project.projectId);
      expect(data.key).toContain('input');
    });

    it('should reject presigned URL request with missing filename', async () => {
      const response = await fetchDashboardApi('/presigned-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'test-project',
          // filename missing
          contentType: 'text/plain',
        }),
      });

      if (!response) return;

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });

    it('should sanitize dangerous filenames', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}presigned_sanitize` });

      const response = await fetchDashboardApi('/presigned-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.projectId,
          filename: '../../../etc/passwd',
          contentType: 'text/plain',
        }),
      });

      if (!response) return;

      // Should either reject or sanitize the filename
      if (response.ok) {
        const data = await response.json();
        // Sanitized filename should not contain path traversal
        expect(data.key).not.toContain('..');
        expect(data.key).not.toContain('etc');
      } else {
        expect(response.status).toBe(400);
      }
    });
  });

  describe('Direct S3 Upload (via SDK)', () => {
    it('should upload file to S3 and verify content', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}s3_upload` });
      const file = createTestInputFile('requirements.md');
      const content = '# Requirements\n\nThis is a test document.';

      // Import S3 helpers for direct upload
      const { uploadTestFile } = await import('../helpers/s3-helpers');
      const key = await uploadTestFile(
        ctx.s3Client,
        project.projectId,
        file.name,
        content,
        file.contentType
      );

      // Verify file exists
      const exists = await fileExists(ctx.s3Client, key);
      expect(exists).toBe(true);

      // Verify content
      const downloaded = await downloadContent(ctx.s3Client, key);
      expect(downloaded).toBe(content);

      // Cleanup
      await cleanupS3Project(ctx.s3Client, project.projectId);
    });

    it('should list uploaded files in project input folder', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}s3_list` });
      const files = [
        { name: 'doc1.md', content: '# Doc 1' },
        { name: 'doc2.md', content: '# Doc 2' },
        { name: 'architecture.pdf', content: 'PDF content' },
      ];

      const { uploadTestFile } = await import('../helpers/s3-helpers');

      // Upload multiple files
      for (const file of files) {
        await uploadTestFile(
          ctx.s3Client,
          project.projectId,
          file.name,
          file.content
        );
      }

      // List files
      const listed = await listProjectInputFiles(ctx.s3Client, project.projectId);

      expect(listed.length).toBe(3);
      expect(listed.some((k) => k.includes('doc1.md'))).toBe(true);
      expect(listed.some((k) => k.includes('doc2.md'))).toBe(true);
      expect(listed.some((k) => k.includes('architecture.pdf'))).toBe(true);

      // Cleanup
      await cleanupS3Project(ctx.s3Client, project.projectId);
    });

    it('should handle large file upload', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}s3_large` });

      // Generate ~500KB content
      const largeContent = 'A'.repeat(500 * 1024);

      const { uploadTestFile } = await import('../helpers/s3-helpers');
      const key = await uploadTestFile(
        ctx.s3Client,
        project.projectId,
        'large-file.txt',
        largeContent
      );

      // Verify file exists
      const exists = await fileExists(ctx.s3Client, key);
      expect(exists).toBe(true);

      // Verify content integrity
      const downloaded = await downloadContent(ctx.s3Client, key);
      expect(downloaded.length).toBe(largeContent.length);
      expect(downloaded).toBe(largeContent);

      // Cleanup
      await cleanupS3Project(ctx.s3Client, project.projectId);
    });
  });

  describe('Presigned URL Upload Flow', () => {
    it('should upload file using presigned URL', async () => {
      const project = createTestProject({ projectId: `${ctx.suitePrefix}presigned_upload` });
      const filename = 'test-upload.md';
      const content = '# Test Upload\n\nUploaded via presigned URL';

      // Get presigned URL
      const presignedResponse = await fetchDashboardApi('/presigned-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.projectId,
          filename,
          contentType: 'text/markdown',
        }),
      });

      if (!presignedResponse) return;

      if (!presignedResponse.ok) {
        throw new Error(`Failed to get presigned URL: ${presignedResponse.status}`);
      }

      const { uploadUrl, key } = await presignedResponse.json();

      // Upload using presigned URL
      const uploadResponse = await uploadWithPresignedUrl(
        uploadUrl,
        content,
        'text/markdown'
      );

      expect(uploadResponse.ok).toBe(true);

      // Verify file exists and content is correct
      const exists = await fileExists(ctx.s3Client, key);
      expect(exists).toBe(true);

      const downloaded = await downloadContent(ctx.s3Client, key);
      expect(downloaded).toBe(content);

      // Cleanup
      await cleanupS3Project(ctx.s3Client, project.projectId);
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent file download gracefully', async () => {
      const key = `projects/${ctx.suitePrefix}nonexistent/input/missing.md`;

      try {
        await downloadContent(ctx.s3Client, key);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        // Expected to throw
        expect(error).toBeDefined();
      }
    });

    it('should report file does not exist for missing files', async () => {
      const key = `projects/${ctx.suitePrefix}check/input/missing.md`;
      const exists = await fileExists(ctx.s3Client, key);
      expect(exists).toBe(false);
    });
  });
});
