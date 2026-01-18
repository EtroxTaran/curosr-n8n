/**
 * S3 test helpers for integration tests
 * Provides utilities for file upload, download, and cleanup
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { TEST_CONFIG } from './service-availability';

// ============================================
// S3 Client Creation
// ============================================

/**
 * Create S3 client with test configuration
 */
export function createS3Client(): S3Client {
  return new S3Client({
    endpoint: TEST_CONFIG.S3_ENDPOINT,
    region: 'us-east-1',
    credentials: {
      accessKeyId: TEST_CONFIG.S3_ACCESS_KEY,
      secretAccessKey: TEST_CONFIG.S3_SECRET_KEY,
    },
    forcePathStyle: true,
  });
}

// ============================================
// Bucket Operations
// ============================================

/**
 * Ensure test bucket exists
 */
export async function ensureBucketExists(
  client: S3Client,
  bucket = TEST_CONFIG.S3_BUCKET
): Promise<void> {
  try {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  } catch (err: unknown) {
    // Bucket already exists is fine
    if (err && typeof err === 'object') {
      const errName = 'name' in err ? (err as { name: string }).name : '';
      const errCode =
        '$metadata' in err
          ? (err as { $metadata?: { httpStatusCode?: number } }).$metadata
              ?.httpStatusCode
          : 0;

      if (
        errName === 'BucketAlreadyOwnedByYou' ||
        errName === 'BucketAlreadyExists' ||
        errCode === 409
      ) {
        return;
      }
    }
    throw err;
  }
}

// ============================================
// File Upload Operations
// ============================================

/**
 * Upload a string content to S3
 */
export async function uploadContent(
  client: S3Client,
  key: string,
  content: string,
  contentType = 'text/plain',
  bucket = TEST_CONFIG.S3_BUCKET
): Promise<{ etag: string; key: string }> {
  const response = await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: content,
      ContentType: contentType,
    })
  );

  return {
    etag: response.ETag || '',
    key,
  };
}

/**
 * Upload a test file to a project's input folder
 */
export async function uploadTestFile(
  client: S3Client,
  projectId: string,
  filename: string,
  content: string,
  contentType = 'text/plain'
): Promise<string> {
  const key = `projects/${projectId}/input/${filename}`;
  await uploadContent(client, key, content, contentType);
  return key;
}

/**
 * Upload a test artifact to a project's artifacts folder
 */
export async function uploadTestArtifact(
  client: S3Client,
  projectId: string,
  filename: string,
  content: string,
  contentType = 'text/markdown'
): Promise<string> {
  const key = `projects/${projectId}/artifacts/${filename}`;
  await uploadContent(client, key, content, contentType);
  return key;
}

/**
 * Generate a presigned upload URL
 */
export async function generateUploadUrl(
  client: S3Client,
  key: string,
  contentType: string,
  expiresIn = 3600,
  bucket = TEST_CONFIG.S3_BUCKET
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(client, command, { expiresIn });
}

/**
 * Upload using presigned URL (simulates browser upload)
 */
export async function uploadWithPresignedUrl(
  presignedUrl: string,
  content: string,
  contentType: string
): Promise<Response> {
  return fetch(presignedUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    body: content,
  });
}

// ============================================
// File Download Operations
// ============================================

/**
 * Download file content from S3
 */
export async function downloadContent(
  client: S3Client,
  key: string,
  bucket = TEST_CONFIG.S3_BUCKET
): Promise<string> {
  const response = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );

  const body = response.Body;
  if (!body) {
    throw new Error(`Empty response body for key: ${key}`);
  }

  // Handle different body types
  if ('transformToString' in body) {
    return body.transformToString();
  }

  // Fallback for stream
  const chunks: Uint8Array[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/**
 * Generate a presigned download URL
 */
export async function generateDownloadUrl(
  client: S3Client,
  key: string,
  expiresIn = 3600,
  bucket = TEST_CONFIG.S3_BUCKET
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  return getSignedUrl(client, command, { expiresIn });
}

// ============================================
// File Verification Operations
// ============================================

/**
 * Check if a file exists in S3
 */
export async function fileExists(
  client: S3Client,
  key: string,
  bucket = TEST_CONFIG.S3_BUCKET
): Promise<boolean> {
  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Get file metadata
 */
export async function getFileMetadata(
  client: S3Client,
  key: string,
  bucket = TEST_CONFIG.S3_BUCKET
): Promise<{
  exists: boolean;
  size?: number;
  contentType?: string;
  etag?: string;
  lastModified?: Date;
}> {
  try {
    const response = await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    return {
      exists: true,
      size: response.ContentLength,
      contentType: response.ContentType,
      etag: response.ETag,
      lastModified: response.LastModified,
    };
  } catch {
    return { exists: false };
  }
}

/**
 * Download and verify content matches expected
 */
export async function verifyFileContent(
  client: S3Client,
  key: string,
  expectedContent: string,
  bucket = TEST_CONFIG.S3_BUCKET
): Promise<boolean> {
  try {
    const content = await downloadContent(client, key, bucket);
    return content === expectedContent;
  } catch {
    return false;
  }
}

// ============================================
// List Operations
// ============================================

/**
 * List all files under a prefix
 */
export async function listFiles(
  client: S3Client,
  prefix: string,
  bucket = TEST_CONFIG.S3_BUCKET
): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );

    if (response.Contents) {
      keys.push(...response.Contents.map((obj) => obj.Key!).filter(Boolean));
    }

    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return keys;
}

/**
 * List files in a project's input folder
 */
export async function listProjectInputFiles(
  client: S3Client,
  projectId: string
): Promise<string[]> {
  return listFiles(client, `projects/${projectId}/input/`);
}

/**
 * List files in a project's artifacts folder
 */
export async function listProjectArtifacts(
  client: S3Client,
  projectId: string
): Promise<string[]> {
  return listFiles(client, `projects/${projectId}/artifacts/`);
}

/**
 * List all files for a project
 */
export async function listAllProjectFiles(
  client: S3Client,
  projectId: string
): Promise<{
  input: string[];
  artifacts: string[];
  state: string[];
  iterations: string[];
  standards: string[];
}> {
  const [input, artifacts, state, iterations, standards] = await Promise.all([
    listFiles(client, `projects/${projectId}/input/`),
    listFiles(client, `projects/${projectId}/artifacts/`),
    listFiles(client, `projects/${projectId}/state/`),
    listFiles(client, `projects/${projectId}/iterations/`),
    listFiles(client, `projects/${projectId}/standards/`),
  ]);

  return { input, artifacts, state, iterations, standards };
}

// ============================================
// Cleanup Operations
// ============================================

/**
 * Delete a single file
 */
export async function deleteFile(
  client: S3Client,
  key: string,
  bucket = TEST_CONFIG.S3_BUCKET
): Promise<void> {
  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
  } catch {
    // Ignore deletion errors
  }
}

/**
 * Delete all files under a prefix
 */
export async function deleteByPrefix(
  client: S3Client,
  prefix: string,
  bucket = TEST_CONFIG.S3_BUCKET
): Promise<number> {
  const keys = await listFiles(client, prefix, bucket);

  if (keys.length === 0) {
    return 0;
  }

  // Delete in batches of 1000 (S3 limit)
  const batchSize = 1000;
  let deletedCount = 0;

  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);

    try {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: batch.map((key) => ({ Key: key })),
            Quiet: true,
          },
        })
      );
      deletedCount += batch.length;
    } catch {
      // Continue with other batches
    }
  }

  return deletedCount;
}

/**
 * Delete all files for a project
 */
export async function cleanupProject(
  client: S3Client,
  projectId: string
): Promise<number> {
  return deleteByPrefix(client, `projects/${projectId}/`);
}

/**
 * Delete all files matching a test prefix
 */
export async function cleanupByTestPrefix(
  client: S3Client,
  testPrefix: string
): Promise<number> {
  return deleteByPrefix(client, `projects/${testPrefix}`);
}

// ============================================
// Test Setup Helpers
// ============================================

/**
 * Setup a project with input files
 */
export async function setupProjectWithFiles(
  client: S3Client,
  projectId: string,
  files: Array<{ name: string; content: string; contentType?: string }>
): Promise<string[]> {
  await ensureBucketExists(client);

  const keys: string[] = [];
  for (const file of files) {
    const key = await uploadTestFile(
      client,
      projectId,
      file.name,
      file.content,
      file.contentType || 'text/plain'
    );
    keys.push(key);
  }

  return keys;
}

/**
 * Setup a project with artifacts
 */
export async function setupProjectWithArtifacts(
  client: S3Client,
  projectId: string,
  artifacts: Array<{ name: string; content: string; contentType?: string }>
): Promise<string[]> {
  await ensureBucketExists(client);

  const keys: string[] = [];
  for (const artifact of artifacts) {
    const key = await uploadTestArtifact(
      client,
      projectId,
      artifact.name,
      artifact.content,
      artifact.contentType || 'text/markdown'
    );
    keys.push(key);
  }

  return keys;
}

/**
 * Create a complete project structure for testing
 */
export async function setupCompleteProjectStructure(
  client: S3Client,
  projectId: string,
  visionContent: string,
  architectureContent: string,
  decisionLogContent: string
): Promise<{
  input: string[];
  artifacts: string[];
}> {
  await ensureBucketExists(client);

  // Create input files
  const inputFiles = await setupProjectWithFiles(client, projectId, [
    { name: 'requirements.md', content: '# Requirements\n\n## Feature 1\n...', contentType: 'text/markdown' },
    { name: 'architecture.md', content: '# Architecture Overview\n...', contentType: 'text/markdown' },
  ]);

  // Create artifacts
  const artifactFiles = await setupProjectWithArtifacts(client, projectId, [
    { name: 'ProductVision_FINAL.md', content: visionContent },
    { name: 'Architecture_FINAL.md', content: architectureContent },
    { name: 'decision_log.md', content: decisionLogContent },
  ]);

  // Create state file
  const stateContent = JSON.stringify({
    project_id: projectId,
    current_phase: 3,
    phase_status: 'completed',
  });
  await uploadContent(
    client,
    `projects/${projectId}/state/project_state.json`,
    stateContent,
    'application/json'
  );

  return {
    input: inputFiles,
    artifacts: artifactFiles,
  };
}
