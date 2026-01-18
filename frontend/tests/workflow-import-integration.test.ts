/**
 * Workflow Import Integration Tests
 *
 * Tests requiring PostgreSQL database (via docker-compose.test.yml).
 * These tests verify the actual database operations for workflow registry.
 *
 * Run with: npm run test:integration
 * Requires: Docker services running (npm run test:env:up)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

// ============================================
// Service Availability Detection
// ============================================

let postgresAvailable = false;
const TEST_TIMEOUT = 30000;

// Database configuration for test environment
const TEST_DB_CONFIG = {
  host: process.env.TEST_POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.TEST_POSTGRES_PORT || '5432', 10),
  database: process.env.TEST_POSTGRES_DB || 'dashboard',
  user: process.env.TEST_POSTGRES_USER || 'n8n',
  password: process.env.TEST_POSTGRES_PASSWORD || 'n8n',
};

/**
 * Check if PostgreSQL is available for testing.
 */
async function checkPostgresConnectivity(): Promise<boolean> {
  try {
    // Dynamic import to avoid issues when pg is not installed
    const { Pool } = await import('pg');
    const pool = new Pool({
      ...TEST_DB_CONFIG,
      connectionTimeoutMillis: 3000,
      max: 1,
    });

    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    await pool.end();
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a database pool for tests.
 */
async function createTestPool() {
  const { Pool } = await import('pg');
  return new Pool({
    ...TEST_DB_CONFIG,
    max: 5,
  });
}

// ============================================
// Test Setup
// ============================================

beforeAll(async () => {
  console.log('\n📋 Workflow Import Integration Tests - Checking service availability...');

  postgresAvailable = await checkPostgresConnectivity();

  console.log(`   PostgreSQL: ${postgresAvailable ? '✅ Available' : '⚠️  Not available (tests will be skipped)'}`);

  if (!postgresAvailable) {
    console.log('\n   💡 To run integration tests, start the test environment:');
    console.log('      npm run test:env:up\n');
  }
}, TEST_TIMEOUT);

// ============================================
// Database Schema Tests
// ============================================

describe('Database Schema', () => {
  it('should have workflow_registry table', async () => {
    if (!postgresAvailable) {
      console.log('   ⏭️  Skipping: PostgreSQL not available');
      return;
    }

    const pool = await createTestPool();
    try {
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'workflow_registry'
        ) as exists
      `);
      expect(result.rows[0].exists).toBe(true);
    } finally {
      await pool.end();
    }
  });

  it('should have app_settings table', async () => {
    if (!postgresAvailable) {
      console.log('   ⏭️  Skipping: PostgreSQL not available');
      return;
    }

    const pool = await createTestPool();
    try {
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'app_settings'
        ) as exists
      `);
      expect(result.rows[0].exists).toBe(true);
    } finally {
      await pool.end();
    }
  });

  it('should have required columns in workflow_registry', async () => {
    if (!postgresAvailable) {
      console.log('   ⏭️  Skipping: PostgreSQL not available');
      return;
    }

    const pool = await createTestPool();
    try {
      const result = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'workflow_registry'
        ORDER BY ordinal_position
      `);

      const columns = result.rows.map((r) => r.column_name);

      // Required columns based on schema
      const requiredColumns = [
        'id',
        'workflow_name',
        'workflow_file',
        'n8n_workflow_id',
        'local_version',
        'webhook_paths',
        'is_active',
        'import_status',
        'last_import_at',
        'last_error',
        'created_at',
        'updated_at',
      ];

      for (const col of requiredColumns) {
        expect(columns).toContain(col);
      }
    } finally {
      await pool.end();
    }
  });

  it('should have unique constraint on workflow_file', async () => {
    if (!postgresAvailable) {
      console.log('   ⏭️  Skipping: PostgreSQL not available');
      return;
    }

    const pool = await createTestPool();
    try {
      const result = await pool.query(`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_name = 'workflow_registry'
        AND constraint_type = 'UNIQUE'
      `);

      // Should have a unique constraint (on workflow_file)
      expect(result.rows.length).toBeGreaterThan(0);
    } finally {
      await pool.end();
    }
  });
});

// ============================================
// Workflow Registry CRUD Tests
// ============================================

describe('Workflow Registry Operations', () => {
  const TEST_WORKFLOW_FILE = 'test-workflow-integration.json';
  let pool: any;

  beforeAll(async () => {
    if (postgresAvailable) {
      pool = await createTestPool();
    }
  });

  afterAll(async () => {
    if (pool) {
      // Cleanup test data
      await pool.query('DELETE FROM workflow_registry WHERE workflow_file = $1', [TEST_WORKFLOW_FILE]);
      await pool.end();
    }
  });

  beforeEach(async () => {
    if (pool) {
      // Clean up before each test
      await pool.query('DELETE FROM workflow_registry WHERE workflow_file = $1', [TEST_WORKFLOW_FILE]);
    }
  });

  it('should insert new workflow registry entry', async () => {
    if (!postgresAvailable) {
      console.log('   ⏭️  Skipping: PostgreSQL not available');
      return;
    }

    const result = await pool.query(
      `
      INSERT INTO workflow_registry (
        workflow_name, workflow_file, n8n_workflow_id, local_version,
        webhook_paths, is_active, import_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `,
      [
        'Test Workflow',
        TEST_WORKFLOW_FILE,
        'wf-test-123',
        '1.0.0',
        JSON.stringify(['/webhook/test']),
        false,
        'imported',
      ]
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].workflow_name).toBe('Test Workflow');
    expect(result.rows[0].n8n_workflow_id).toBe('wf-test-123');
    expect(result.rows[0].import_status).toBe('imported');
  });

  it('should update existing workflow registry entry', async () => {
    if (!postgresAvailable) {
      console.log('   ⏭️  Skipping: PostgreSQL not available');
      return;
    }

    // Insert first
    await pool.query(
      `
      INSERT INTO workflow_registry (
        workflow_name, workflow_file, n8n_workflow_id, local_version,
        import_status
      ) VALUES ($1, $2, $3, $4, $5)
    `,
      ['Test Workflow', TEST_WORKFLOW_FILE, 'wf-test-123', '1.0.0', 'imported']
    );

    // Update
    const result = await pool.query(
      `
      UPDATE workflow_registry
      SET local_version = $1, is_active = $2, updated_at = NOW()
      WHERE workflow_file = $3
      RETURNING *
    `,
      ['2.0.0', true, TEST_WORKFLOW_FILE]
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].local_version).toBe('2.0.0');
    expect(result.rows[0].is_active).toBe(true);
  });

  it('should query workflow by file name', async () => {
    if (!postgresAvailable) {
      console.log('   ⏭️  Skipping: PostgreSQL not available');
      return;
    }

    // Insert
    await pool.query(
      `
      INSERT INTO workflow_registry (
        workflow_name, workflow_file, n8n_workflow_id, local_version,
        import_status
      ) VALUES ($1, $2, $3, $4, $5)
    `,
      ['Test Workflow', TEST_WORKFLOW_FILE, 'wf-test-123', '1.0.0', 'imported']
    );

    // Query
    const result = await pool.query('SELECT * FROM workflow_registry WHERE workflow_file = $1', [
      TEST_WORKFLOW_FILE,
    ]);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].workflow_name).toBe('Test Workflow');
  });

  it('should return empty for non-existent workflow', async () => {
    if (!postgresAvailable) {
      console.log('   ⏭️  Skipping: PostgreSQL not available');
      return;
    }

    const result = await pool.query('SELECT * FROM workflow_registry WHERE workflow_file = $1', [
      'non-existent-workflow.json',
    ]);

    expect(result.rows).toHaveLength(0);
  });

  it('should handle JSONB webhook_paths correctly', async () => {
    if (!postgresAvailable) {
      console.log('   ⏭️  Skipping: PostgreSQL not available');
      return;
    }

    const webhooks = ['/webhook/start', '/webhook/callback', '/webhook-test/form'];

    await pool.query(
      `
      INSERT INTO workflow_registry (
        workflow_name, workflow_file, n8n_workflow_id, local_version,
        webhook_paths, import_status
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `,
      ['Test Workflow', TEST_WORKFLOW_FILE, 'wf-test-123', '1.0.0', JSON.stringify(webhooks), 'imported']
    );

    const result = await pool.query('SELECT webhook_paths FROM workflow_registry WHERE workflow_file = $1', [
      TEST_WORKFLOW_FILE,
    ]);

    // JSONB should be returned as parsed array
    expect(result.rows[0].webhook_paths).toEqual(webhooks);
  });

  it('should store and retrieve last_error', async () => {
    if (!postgresAvailable) {
      console.log('   ⏭️  Skipping: PostgreSQL not available');
      return;
    }

    const errorMessage = 'Failed to import: Connection refused';

    await pool.query(
      `
      INSERT INTO workflow_registry (
        workflow_name, workflow_file, local_version,
        import_status, last_error
      ) VALUES ($1, $2, $3, $4, $5)
    `,
      ['Test Workflow', TEST_WORKFLOW_FILE, '1.0.0', 'failed', errorMessage]
    );

    const result = await pool.query(
      'SELECT import_status, last_error FROM workflow_registry WHERE workflow_file = $1',
      [TEST_WORKFLOW_FILE]
    );

    expect(result.rows[0].import_status).toBe('failed');
    expect(result.rows[0].last_error).toBe(errorMessage);
  });
});

// ============================================
// App Settings Tests
// ============================================

describe('App Settings Operations', () => {
  const TEST_SETTING_KEY = 'test.integration.setting';
  let pool: any;

  beforeAll(async () => {
    if (postgresAvailable) {
      pool = await createTestPool();
    }
  });

  afterAll(async () => {
    if (pool) {
      // Cleanup test data
      await pool.query('DELETE FROM app_settings WHERE setting_key LIKE $1', ['test.%']);
      await pool.end();
    }
  });

  beforeEach(async () => {
    if (pool) {
      await pool.query('DELETE FROM app_settings WHERE setting_key LIKE $1', ['test.%']);
    }
  });

  it('should insert new setting', async () => {
    if (!postgresAvailable) {
      console.log('   ⏭️  Skipping: PostgreSQL not available');
      return;
    }

    const result = await pool.query(
      `
      INSERT INTO app_settings (setting_key, setting_value, setting_type, is_sensitive)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `,
      [TEST_SETTING_KEY, JSON.stringify({ value: 'test-value' }), 'string', false]
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].setting_key).toBe(TEST_SETTING_KEY);
    expect(result.rows[0].setting_value).toEqual({ value: 'test-value' });
  });

  it('should update existing setting (upsert pattern)', async () => {
    if (!postgresAvailable) {
      console.log('   ⏭️  Skipping: PostgreSQL not available');
      return;
    }

    // Insert first
    await pool.query(
      `
      INSERT INTO app_settings (setting_key, setting_value, setting_type)
      VALUES ($1, $2, $3)
    `,
      [TEST_SETTING_KEY, JSON.stringify({ value: 'original' }), 'string']
    );

    // Upsert (ON CONFLICT pattern)
    const result = await pool.query(
      `
      INSERT INTO app_settings (setting_key, setting_value, setting_type)
      VALUES ($1, $2, $3)
      ON CONFLICT (setting_key) DO UPDATE SET
        setting_value = EXCLUDED.setting_value,
        updated_at = NOW()
      RETURNING *
    `,
      [TEST_SETTING_KEY, JSON.stringify({ value: 'updated' }), 'string']
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].setting_value).toEqual({ value: 'updated' });
  });

  it('should query setting by key', async () => {
    if (!postgresAvailable) {
      console.log('   ⏭️  Skipping: PostgreSQL not available');
      return;
    }

    await pool.query(
      `
      INSERT INTO app_settings (setting_key, setting_value, setting_type)
      VALUES ($1, $2, $3)
    `,
      [TEST_SETTING_KEY, JSON.stringify('my-api-url'), 'string']
    );

    const result = await pool.query('SELECT * FROM app_settings WHERE setting_key = $1', [TEST_SETTING_KEY]);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].setting_value).toBe('my-api-url');
  });

  it('should mark sensitive settings correctly', async () => {
    if (!postgresAvailable) {
      console.log('   ⏭️  Skipping: PostgreSQL not available');
      return;
    }

    await pool.query(
      `
      INSERT INTO app_settings (setting_key, setting_value, setting_type, is_sensitive)
      VALUES ($1, $2, $3, $4)
    `,
      ['test.api.key', JSON.stringify('encrypted-value-here'), 'string', true]
    );

    const result = await pool.query('SELECT is_sensitive FROM app_settings WHERE setting_key = $1', ['test.api.key']);

    expect(result.rows[0].is_sensitive).toBe(true);
  });

  it('should delete setting', async () => {
    if (!postgresAvailable) {
      console.log('   ⏭️  Skipping: PostgreSQL not available');
      return;
    }

    await pool.query(
      `
      INSERT INTO app_settings (setting_key, setting_value, setting_type)
      VALUES ($1, $2, $3)
    `,
      [TEST_SETTING_KEY, JSON.stringify('to-delete'), 'string']
    );

    await pool.query('DELETE FROM app_settings WHERE setting_key = $1', [TEST_SETTING_KEY]);

    const result = await pool.query('SELECT * FROM app_settings WHERE setting_key = $1', [TEST_SETTING_KEY]);

    expect(result.rows).toHaveLength(0);
  });
});

// ============================================
// Concurrent Import Tests
// ============================================

describe('Concurrent Import Handling', () => {
  let pool: any;

  beforeAll(async () => {
    if (postgresAvailable) {
      pool = await createTestPool();
    }
  });

  afterAll(async () => {
    if (pool) {
      await pool.query('DELETE FROM workflow_registry WHERE workflow_file LIKE $1', ['concurrent-test-%']);
      await pool.end();
    }
  });

  it('should handle concurrent inserts with unique constraint', async () => {
    if (!postgresAvailable) {
      console.log('   ⏭️  Skipping: PostgreSQL not available');
      return;
    }

    const workflowFile = 'concurrent-test-unique.json';

    // Simulate concurrent inserts
    const insertPromise1 = pool.query(
      `
      INSERT INTO workflow_registry (workflow_name, workflow_file, local_version, import_status)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (workflow_file) DO NOTHING
      RETURNING *
    `,
      ['Workflow 1', workflowFile, '1.0.0', 'imported']
    );

    const insertPromise2 = pool.query(
      `
      INSERT INTO workflow_registry (workflow_name, workflow_file, local_version, import_status)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (workflow_file) DO NOTHING
      RETURNING *
    `,
      ['Workflow 2', workflowFile, '1.0.0', 'imported']
    );

    const [result1, result2] = await Promise.all([insertPromise1, insertPromise2]);

    // Only one should have inserted (the other gets ON CONFLICT DO NOTHING)
    const totalInserted = result1.rows.length + result2.rows.length;
    expect(totalInserted).toBe(1);

    // Verify only one record exists
    const countResult = await pool.query('SELECT COUNT(*) as count FROM workflow_registry WHERE workflow_file = $1', [
      workflowFile,
    ]);
    expect(parseInt(countResult.rows[0].count, 10)).toBe(1);
  });

  it('should handle upsert pattern correctly', async () => {
    if (!postgresAvailable) {
      console.log('   ⏭️  Skipping: PostgreSQL not available');
      return;
    }

    const workflowFile = 'concurrent-test-upsert.json';

    // First insert
    await pool.query(
      `
      INSERT INTO workflow_registry (workflow_name, workflow_file, local_version, import_status)
      VALUES ($1, $2, $3, $4)
    `,
      ['Original Name', workflowFile, '1.0.0', 'pending']
    );

    // Upsert with updated values
    const result = await pool.query(
      `
      INSERT INTO workflow_registry (workflow_name, workflow_file, local_version, import_status, n8n_workflow_id)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (workflow_file) DO UPDATE SET
        workflow_name = EXCLUDED.workflow_name,
        local_version = EXCLUDED.local_version,
        import_status = EXCLUDED.import_status,
        n8n_workflow_id = EXCLUDED.n8n_workflow_id,
        updated_at = NOW()
      RETURNING *
    `,
      ['Updated Name', workflowFile, '2.0.0', 'imported', 'wf-123']
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].workflow_name).toBe('Updated Name');
    expect(result.rows[0].local_version).toBe('2.0.0');
    expect(result.rows[0].import_status).toBe('imported');
    expect(result.rows[0].n8n_workflow_id).toBe('wf-123');
  });
});

// ============================================
// Settings + n8n Config Integration
// ============================================

describe('n8n Configuration Integration', () => {
  let pool: any;

  beforeAll(async () => {
    if (postgresAvailable) {
      pool = await createTestPool();
    }
  });

  afterAll(async () => {
    if (pool) {
      await pool.query('DELETE FROM app_settings WHERE setting_key LIKE $1', ['n8n.test.%']);
      await pool.end();
    }
  });

  beforeEach(async () => {
    if (pool) {
      await pool.query('DELETE FROM app_settings WHERE setting_key LIKE $1', ['n8n.test.%']);
    }
  });

  it('should store n8n API URL', async () => {
    if (!postgresAvailable) {
      console.log('   ⏭️  Skipping: PostgreSQL not available');
      return;
    }

    await pool.query(
      `
      INSERT INTO app_settings (setting_key, setting_value, setting_type, is_sensitive)
      VALUES ($1, $2, $3, $4)
    `,
      ['n8n.test.api_url', JSON.stringify('https://n8n.example.com'), 'string', false]
    );

    const result = await pool.query('SELECT setting_value FROM app_settings WHERE setting_key = $1', [
      'n8n.test.api_url',
    ]);

    expect(result.rows[0].setting_value).toBe('https://n8n.example.com');
  });

  it('should store n8n API key as sensitive', async () => {
    if (!postgresAvailable) {
      console.log('   ⏭️  Skipping: PostgreSQL not available');
      return;
    }

    // In real code, this would be encrypted
    const encryptedKey = 'AES256_ENCRYPTED_KEY_HERE';

    await pool.query(
      `
      INSERT INTO app_settings (setting_key, setting_value, setting_type, is_sensitive)
      VALUES ($1, $2, $3, $4)
    `,
      ['n8n.test.api_key', JSON.stringify(encryptedKey), 'string', true]
    );

    const result = await pool.query('SELECT setting_value, is_sensitive FROM app_settings WHERE setting_key = $1', [
      'n8n.test.api_key',
    ]);

    expect(result.rows[0].is_sensitive).toBe(true);
    expect(result.rows[0].setting_value).toBe(encryptedKey);
  });

  it('should check if n8n is configured via multiple settings', async () => {
    if (!postgresAvailable) {
      console.log('   ⏭️  Skipping: PostgreSQL not available');
      return;
    }

    // Insert both URL and API key
    await pool.query(
      `
      INSERT INTO app_settings (setting_key, setting_value, setting_type, is_sensitive)
      VALUES
        ($1, $2, 'string', false),
        ($3, $4, 'string', true)
    `,
      ['n8n.test.api_url', JSON.stringify('https://n8n.example.com'), 'n8n.test.api_key', JSON.stringify('encrypted')]
    );

    // Query to check if both exist
    const result = await pool.query(
      `
      SELECT COUNT(*) as count
      FROM app_settings
      WHERE setting_key IN ('n8n.test.api_url', 'n8n.test.api_key')
    `
    );

    expect(parseInt(result.rows[0].count, 10)).toBe(2);
  });
});

// ============================================
// Full Import Flow Simulation
// ============================================

describe('Full Import Flow Simulation', () => {
  let pool: any;

  beforeAll(async () => {
    if (postgresAvailable) {
      pool = await createTestPool();
    }
  });

  afterAll(async () => {
    if (pool) {
      await pool.query('DELETE FROM workflow_registry WHERE workflow_file LIKE $1', ['flow-test-%']);
      await pool.end();
    }
  });

  it('should simulate complete import lifecycle', async () => {
    if (!postgresAvailable) {
      console.log('   ⏭️  Skipping: PostgreSQL not available');
      return;
    }

    const workflowFile = 'flow-test-lifecycle.json';

    // Step 1: Insert as pending
    await pool.query(
      `
      INSERT INTO workflow_registry (
        workflow_name, workflow_file, local_version, import_status
      ) VALUES ($1, $2, $3, $4)
    `,
      ['Lifecycle Test', workflowFile, '1.0.0', 'pending']
    );

    // Verify pending state
    let result = await pool.query('SELECT import_status FROM workflow_registry WHERE workflow_file = $1', [
      workflowFile,
    ]);
    expect(result.rows[0].import_status).toBe('pending');

    // Step 2: Update to importing
    await pool.query(
      `
      UPDATE workflow_registry
      SET import_status = 'importing', updated_at = NOW()
      WHERE workflow_file = $1
    `,
      [workflowFile]
    );

    result = await pool.query('SELECT import_status FROM workflow_registry WHERE workflow_file = $1', [workflowFile]);
    expect(result.rows[0].import_status).toBe('importing');

    // Step 3: Complete import with n8n ID and webhooks
    await pool.query(
      `
      UPDATE workflow_registry
      SET
        import_status = 'imported',
        n8n_workflow_id = $1,
        webhook_paths = $2,
        last_import_at = NOW(),
        updated_at = NOW()
      WHERE workflow_file = $3
    `,
      ['wf-lifecycle-123', JSON.stringify(['/webhook/test']), workflowFile]
    );

    result = await pool.query(
      `
      SELECT import_status, n8n_workflow_id, webhook_paths, last_import_at
      FROM workflow_registry WHERE workflow_file = $1
    `,
      [workflowFile]
    );

    expect(result.rows[0].import_status).toBe('imported');
    expect(result.rows[0].n8n_workflow_id).toBe('wf-lifecycle-123');
    expect(result.rows[0].webhook_paths).toEqual(['/webhook/test']);
    expect(result.rows[0].last_import_at).not.toBeNull();

    // Step 4: Activate workflow
    await pool.query(
      `
      UPDATE workflow_registry
      SET is_active = true, updated_at = NOW()
      WHERE workflow_file = $1
    `,
      [workflowFile]
    );

    result = await pool.query('SELECT is_active FROM workflow_registry WHERE workflow_file = $1', [workflowFile]);
    expect(result.rows[0].is_active).toBe(true);
  });

  it('should simulate import failure and recovery', async () => {
    if (!postgresAvailable) {
      console.log('   ⏭️  Skipping: PostgreSQL not available');
      return;
    }

    const workflowFile = 'flow-test-failure.json';

    // Step 1: Insert as pending
    await pool.query(
      `
      INSERT INTO workflow_registry (
        workflow_name, workflow_file, local_version, import_status
      ) VALUES ($1, $2, $3, $4)
    `,
      ['Failure Test', workflowFile, '1.0.0', 'pending']
    );

    // Step 2: Simulate failure
    const errorMessage = 'n8n API error: 500 Internal Server Error';
    await pool.query(
      `
      UPDATE workflow_registry
      SET
        import_status = 'failed',
        last_error = $1,
        updated_at = NOW()
      WHERE workflow_file = $2
    `,
      [errorMessage, workflowFile]
    );

    let result = await pool.query('SELECT import_status, last_error FROM workflow_registry WHERE workflow_file = $1', [
      workflowFile,
    ]);
    expect(result.rows[0].import_status).toBe('failed');
    expect(result.rows[0].last_error).toBe(errorMessage);

    // Step 3: Retry and succeed
    await pool.query(
      `
      UPDATE workflow_registry
      SET
        import_status = 'imported',
        n8n_workflow_id = $1,
        last_error = NULL,
        last_import_at = NOW(),
        updated_at = NOW()
      WHERE workflow_file = $2
    `,
      ['wf-retry-123', workflowFile]
    );

    result = await pool.query(
      'SELECT import_status, n8n_workflow_id, last_error FROM workflow_registry WHERE workflow_file = $1',
      [workflowFile]
    );
    expect(result.rows[0].import_status).toBe('imported');
    expect(result.rows[0].n8n_workflow_id).toBe('wf-retry-123');
    expect(result.rows[0].last_error).toBeNull();
  });
});
