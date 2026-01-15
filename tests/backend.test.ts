import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import postgres from 'postgres';

// Environment configuration
const S3_ENDPOINT = process.env.S3_ENDPOINT || 'http://localhost:8888';
// SECURITY: Default test credentials match docker-compose.test.yml
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || 'testadmin';
const S3_SECRET_KEY = process.env.S3_SECRET_KEY || 'testsecret123';
const S3_BUCKET = process.env.S3_BUCKET || 'product-factory-artifacts';
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://n8n:n8n@localhost:5432/n8n';
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678';

// Service availability flags
let n8nAvailable = false;
let postgresAvailable = false;
let s3Available = false;

// Quick connectivity check with timeout
async function checkN8nConnectivity(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(`${N8N_WEBHOOK_URL}/healthz`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

async function checkPostgresConnectivity(): Promise<boolean> {
  try {
    const testDb = postgres(DATABASE_URL, {
      connect_timeout: 2,
      idle_timeout: 2,
      max_lifetime: 2,
    });
    await testDb`SELECT 1`;
    await testDb.end();
    return true;
  } catch {
    return false;
  }
}

async function checkS3Connectivity(s3Client: S3Client): Promise<boolean> {
  try {
    // Add timeout using AbortController
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    // Try to create bucket (will succeed or return "already exists")
    try {
      await s3Client.send(new CreateBucketCommand({
        Bucket: S3_BUCKET,
      }), { abortSignal: controller.signal });
      clearTimeout(timeout);
      return true;
    } catch (createErr: unknown) {
      clearTimeout(timeout);
      // If bucket already exists, that's fine - we're connected
      if (createErr && typeof createErr === 'object') {
        const errName = 'name' in createErr ? (createErr as { name: string }).name : '';
        const errCode = '$metadata' in createErr ?
          ((createErr as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode) : 0;

        // These are all "connection works" scenarios
        if (errName === 'BucketAlreadyOwnedByYou' ||
            errName === 'BucketAlreadyExists' ||
            errCode === 409 || // Conflict = bucket exists
            errCode === 200) {
          return true;
        }
      }
      throw createErr;
    }
  } catch (err: unknown) {
    // Log for debugging
    console.log('S3 connectivity check failed:', err);
    return false;
  }
}

// Wrapper to add timeout to any promise
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => resolve(null), timeoutMs);
  });

  const result = await Promise.race([promise, timeoutPromise]);
  clearTimeout(timeoutId!);
  return result;
}

describe('AI Product Factory - Backend Integration Tests', () => {
  let s3Client: S3Client;
  let db: ReturnType<typeof postgres>;
  const testProjectId = `test-project-${Date.now()}`;
  const testFileKey = `projects/${testProjectId}/input/test-file.txt`;

  beforeAll(async () => {
    // Initialize S3 client
    s3Client = new S3Client({
      endpoint: S3_ENDPOINT,
      region: 'us-east-1',
      credentials: {
        accessKeyId: S3_ACCESS_KEY,
        secretAccessKey: S3_SECRET_KEY,
      },
      forcePathStyle: true,
    });

    // Check service availability in parallel with strict timeouts
    const [n8nResult, pgResult, s3Result] = await Promise.all([
      withTimeout(checkN8nConnectivity(), 3000),
      withTimeout(checkPostgresConnectivity(), 3000),
      withTimeout(checkS3Connectivity(s3Client), 3000),
    ]);

    const n8n = n8nResult === true;
    const pg = pgResult === true;
    const s3 = s3Result === true;

    // Initialize database connection only if PostgreSQL is available
    if (pg) {
      db = postgres(DATABASE_URL, { connect_timeout: 5 });
    } else {
      // Create a dummy db object that won't actually connect
      db = postgres(DATABASE_URL, { connect_timeout: 1, max: 0 });
    }

    n8nAvailable = n8n;
    postgresAvailable = pg;
    s3Available = s3;

    // Log availability status
    console.log('\n📋 Backend Integration Tests - Service Availability:');
    console.log(`   n8n:        ${n8nAvailable ? '✅ Available' : '⏭️  Skipped (not running)'}`);
    console.log(`   PostgreSQL: ${postgresAvailable ? '✅ Available' : '⏭️  Skipped (not running)'}`);
    console.log(`   S3:         ${s3Available ? '✅ Available' : '⏭️  Skipped (not running)'}`);
    console.log('');

    if (!n8nAvailable && !postgresAvailable && !s3Available) {
      console.log('   ℹ️  No services available. Start Docker Compose to run integration tests:');
      console.log('      docker-compose up -d postgres seaweedfs n8n\n');
    }
  }, 10000); // 10s timeout for beforeAll

  afterAll(async () => {
    // Cleanup: Delete test file from S3
    if (s3Available) {
      try {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: S3_BUCKET,
          Key: testFileKey,
        }));
      } catch {
        // Ignore cleanup errors
      }
    }

    // Cleanup: Delete test project from database
    if (postgresAvailable) {
      try {
        await db`DELETE FROM project_state WHERE project_id = ${testProjectId}`;
      } catch {
        // Ignore cleanup errors
      }
    }

    // Close database connection
    try {
      await db.end();
    } catch {
      // Ignore close errors
    }
  });

  describe('Test 1: n8n Webhook Handshake', () => {
    beforeEach(() => {
      if (!n8nAvailable) {
        console.log('   ⏭️  Skipping: n8n not available');
      }
    });

    it('should return expected JSON schema from start-project webhook', async () => {
      if (!n8nAvailable) {
        return; // Skip silently
      }

      const response = await fetch(`${N8N_WEBHOOK_URL}/webhook/start-project`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          projectName: 'Test Project',
          sessionId: 'test-session-123',
          description: 'Integration test project',
          inputFiles: [],
        }),
      });

      // If workflow not deployed (404), skip the test
      if (response.status === 404) {
        console.log('   ⏭️  Skipping: start-project workflow not deployed in test n8n instance');
        return;
      }

      // Should accept the request (may return 200 or 201)
      expect(response.status).toBeLessThan(300);

      const data = await response.json();

      // Verify response schema has expected fields
      expect(data).toHaveProperty('status');
      // n8n webhooks typically return the workflow output
      expect(['ok', 'success', 'accepted', 'received'].some(s =>
        JSON.stringify(data).toLowerCase().includes(s)
      )).toBe(true);
    });

    it('should reject malformed requests with 400', async () => {
      if (!n8nAvailable) {
        return; // Skip silently
      }

      const response = await fetch(`${N8N_WEBHOOK_URL}/webhook/start-project`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Missing required projectId
          projectName: 'Invalid Project',
        }),
      });

      // Should return client error
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Test 2: Database Integrity', () => {
    beforeEach(() => {
      if (!postgresAvailable) {
        console.log('   ⏭️  Skipping: PostgreSQL not available');
      }
    });

    it('should insert project with default current_phase = 0', async () => {
      if (!postgresAvailable) {
        return; // Skip silently
      }

      const sessionId = `session-${Date.now()}`;

      const result = await db`
        INSERT INTO project_state (
          project_id,
          project_name,
          session_id,
          config
        ) VALUES (
          ${testProjectId},
          ${'Test Integration Project'},
          ${sessionId},
          ${JSON.stringify({ max_iterations: 5, score_threshold: 90 })}
        )
        RETURNING project_id, current_phase, phase_status, created_at
      `;

      expect(result).toHaveLength(1);
      expect(result[0].project_id).toBe(testProjectId);
      expect(result[0].current_phase).toBe(0); // Default value
      expect(result[0].phase_status).toBe('pending'); // Default value
      expect(result[0].created_at).toBeDefined();
    });

    it('should have all required columns in project_state table', async () => {
      if (!postgresAvailable) {
        return; // Skip silently
      }

      const columns = await db`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'project_state'
        ORDER BY ordinal_position
      `;

      const columnNames = columns.map(c => c.column_name);

      // Verify essential columns exist
      expect(columnNames).toContain('project_id');
      expect(columnNames).toContain('project_name');
      expect(columnNames).toContain('session_id');
      expect(columnNames).toContain('current_phase');
      expect(columnNames).toContain('phase_status');
      expect(columnNames).toContain('tech_standards_global');
      expect(columnNames).toContain('tech_standards_local');
      expect(columnNames).toContain('artifact_vision_final');
      expect(columnNames).toContain('artifact_architecture_final');
    });

    it('should enforce foreign key on decision_log_entries', async () => {
      if (!postgresAvailable) {
        return; // Skip silently
      }

      // Attempt to insert decision log for non-existent project
      await expect(
        db`
          INSERT INTO decision_log_entries (
            project_id,
            entry_type,
            content
          ) VALUES (
            ${'non-existent-project-12345'},
            ${'log_decision'},
            ${'Test entry'}
          )
        `
      ).rejects.toThrow(); // Should throw foreign key violation
    });
  });

  describe('Test 3: S3 Connectivity', () => {
    beforeEach(() => {
      if (!s3Available) {
        console.log('   ⏭️  Skipping: S3/SeaweedFS not available');
      }
    });

    it('should successfully upload a 1KB text file', async () => {
      if (!s3Available) {
        return; // Skip silently
      }

      const testContent = 'A'.repeat(1024); // 1KB of 'A' characters

      const putCommand = new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: testFileKey,
        Body: testContent,
        ContentType: 'text/plain',
      });

      const response = await s3Client.send(putCommand);

      // S3 returns ETag for successful uploads
      expect(response.ETag).toBeDefined();
      expect(response.$metadata.httpStatusCode).toBe(200);
    });

    it('should verify uploaded file exists', async () => {
      if (!s3Available) {
        return; // Skip silently
      }

      const headCommand = new HeadObjectCommand({
        Bucket: S3_BUCKET,
        Key: testFileKey,
      });

      const response = await s3Client.send(headCommand);

      expect(response.ContentLength).toBe(1024);
      expect(response.ContentType).toBe('text/plain');
    });

    it('should handle non-existent file gracefully', async () => {
      if (!s3Available) {
        return; // Skip silently
      }

      const headCommand = new HeadObjectCommand({
        Bucket: S3_BUCKET,
        Key: 'non-existent-file-12345.txt',
      });

      await expect(s3Client.send(headCommand)).rejects.toThrow();
    });
  });

  describe('Test 4: Governance Webhook Contract', () => {
    beforeEach(() => {
      if (!n8nAvailable) {
        console.log('   ⏭️  Skipping: n8n not available');
      }
    });

    it('should accept valid governance batch payload', async () => {
      if (!n8nAvailable) {
        return; // Skip silently
      }

      const governancePayload = {
        scavenging_id: 'sc_test_123',
        project_id: testProjectId,
        decisions: [
          {
            tech_id: 'tech_001',
            action: 'approve',
            scope: 'local',
            selected_alternative: null,
            notes: 'Test approval',
          },
        ],
        submitted_at: new Date().toISOString(),
      };

      const response = await fetch(`${N8N_WEBHOOK_URL}/webhook/governance-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(governancePayload),
      });

      // If workflow not deployed (404), skip the test
      if (response.status === 404) {
        console.log('   ⏭️  Skipping: governance-batch workflow not deployed in test n8n instance');
        return;
      }

      expect(response.status).toBeLessThan(300);
    });
  });
});
