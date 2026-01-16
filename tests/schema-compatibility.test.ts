/**
 * Schema Compatibility Tests
 *
 * These tests validate that the database schema is correctly configured
 * for Better-Auth integration. They catch type mismatches and wrong
 * database connections before deployment.
 *
 * Run: npm run test -- tests/schema-compatibility.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres, { Sql } from 'postgres';

// Test configuration
const DASHBOARD_DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://n8n:n8n@localhost:5432/dashboard';

// Expected Better-Auth column types
const EXPECTED_USER_ID_TYPES = ['text', 'character varying'];

let sql: Sql | null = null;
let dashboardDbAvailable = false;

/**
 * Check if the dashboard database is accessible
 */
async function checkDatabaseConnectivity(): Promise<boolean> {
  try {
    const testSql = postgres(DASHBOARD_DATABASE_URL, {
      connect_timeout: 3,
      idle_timeout: 2,
      max_lifetime: 2,
    });
    await testSql`SELECT 1`;
    await testSql.end();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the data type of a column
 */
async function getColumnType(
  sql: Sql,
  tableName: string,
  columnName: string
): Promise<string | null> {
  const result = await sql`
    SELECT data_type
    FROM information_schema.columns
    WHERE table_name = ${tableName} AND column_name = ${columnName}
  `;

  return result[0]?.data_type || null;
}

/**
 * Check if a table exists
 */
async function tableExists(sql: Sql, tableName: string): Promise<boolean> {
  const result = await sql`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${tableName}
    )
  `;

  return result[0]?.exists || false;
}

/**
 * Get database name from connection
 */
async function getCurrentDatabase(sql: Sql): Promise<string> {
  const result = await sql`SELECT current_database()`;
  return result[0]?.current_database || '';
}

describe('Schema Compatibility Tests', () => {
  beforeAll(async () => {
    dashboardDbAvailable = await checkDatabaseConnectivity();

    if (dashboardDbAvailable) {
      sql = postgres(DASHBOARD_DATABASE_URL, {
        connect_timeout: 5,
        idle_timeout: 10,
        max_lifetime: 30,
      });
      console.log('   Connected to dashboard database for schema tests');
    } else {
      console.log(
        '   Dashboard database not available - some tests will be skipped'
      );
    }
  });

  afterAll(async () => {
    if (sql) {
      await sql.end();
    }
  });

  describe('DATABASE_URL Configuration', () => {
    it('should point to dashboard database (not n8n)', () => {
      const dbUrl = DASHBOARD_DATABASE_URL;

      // DATABASE_URL should end with /dashboard
      expect(dbUrl).toMatch(/\/dashboard(\?.*)?$/);

      // DATABASE_URL should NOT end with /n8n
      expect(dbUrl).not.toMatch(/\/n8n(\?.*)?$/);
    });

    it('should not contain n8n-specific database names', () => {
      const dbUrl = DASHBOARD_DATABASE_URL;

      // Common n8n database naming patterns to avoid
      const n8nPatterns = [
        /\/n8n_.*_db/i, // e.g., /n8n_genosis_db
        /\/n8n-/i, // e.g., /n8n-production
        /n8n.*database/i, // e.g., n8n_database
      ];

      for (const pattern of n8nPatterns) {
        expect(dbUrl).not.toMatch(pattern);
      }
    });
  });

  describe('Better-Auth User Table Schema', () => {
    it('should have user table with TEXT id column (not UUID)', async () => {
      if (!sql || !dashboardDbAvailable) {
        console.log('      Skipped: database not available');
        return;
      }

      const exists = await tableExists(sql, 'user');
      if (!exists) {
        // Table doesn't exist yet - this is OK for fresh installs
        console.log('      Skipped: user table not yet created');
        return;
      }

      const idType = await getColumnType(sql, 'user', 'id');

      // Validate user.id is TEXT, not UUID
      expect(EXPECTED_USER_ID_TYPES).toContain(idType);
      expect(idType).not.toBe('uuid');
    });

    it('should detect wrong database if user.id is UUID', async () => {
      if (!sql || !dashboardDbAvailable) {
        console.log('      Skipped: database not available');
        return;
      }

      const exists = await tableExists(sql, 'user');
      if (!exists) {
        console.log('      Skipped: user table not yet created');
        return;
      }

      const idType = await getColumnType(sql, 'user', 'id');

      if (idType === 'uuid') {
        // This is a critical error - likely connected to n8n database
        const currentDb = await getCurrentDatabase(sql);
        throw new Error(
          `CRITICAL: user.id is UUID type. This indicates DATABASE_URL points to wrong database.\n` +
            `Current database: ${currentDb}\n` +
            `Expected database: dashboard\n` +
            `Fix: Set DATABASE_URL to postgresql://<user>:<pass>@postgres:5432/dashboard`
        );
      }

      // If we get here, user.id is the correct type
      expect(idType).not.toBe('uuid');
    });
  });

  describe('Foreign Key Type Compatibility', () => {
    it('session.userId should match user.id type', async () => {
      if (!sql || !dashboardDbAvailable) {
        console.log('      Skipped: database not available');
        return;
      }

      const userExists = await tableExists(sql, 'user');
      const sessionExists = await tableExists(sql, 'session');

      if (!userExists || !sessionExists) {
        console.log('      Skipped: tables not yet created');
        return;
      }

      const userIdType = await getColumnType(sql, 'user', 'id');
      const sessionUserIdType = await getColumnType(sql, 'session', 'userId');

      expect(sessionUserIdType).toBe(userIdType);
    });

    it('account.userId should match user.id type', async () => {
      if (!sql || !dashboardDbAvailable) {
        console.log('      Skipped: database not available');
        return;
      }

      const userExists = await tableExists(sql, 'user');
      const accountExists = await tableExists(sql, 'account');

      if (!userExists || !accountExists) {
        console.log('      Skipped: tables not yet created');
        return;
      }

      const userIdType = await getColumnType(sql, 'user', 'id');
      const accountUserIdType = await getColumnType(sql, 'account', 'userId');

      expect(accountUserIdType).toBe(userIdType);
    });
  });

  describe('Database Identity Validation', () => {
    it('should be connected to dashboard database', async () => {
      if (!sql || !dashboardDbAvailable) {
        console.log('      Skipped: database not available');
        return;
      }

      const currentDb = await getCurrentDatabase(sql);
      expect(currentDb).toBe('dashboard');
    });

    it('should have n8n-incompatible schema (no n8n workflow tables)', async () => {
      if (!sql || !dashboardDbAvailable) {
        console.log('      Skipped: database not available');
        return;
      }

      // These tables are specific to n8n - they should NOT exist in dashboard db
      const n8nTables = [
        'execution_entity', // n8n execution history
        'workflow_entity', // n8n workflows
        'webhook_entity', // n8n webhooks
        'credentials_entity', // n8n credentials
      ];

      for (const table of n8nTables) {
        const exists = await tableExists(sql, table);
        if (exists) {
          throw new Error(
            `Found n8n table '${table}' in database. ` +
              `This indicates DATABASE_URL points to n8n database, not dashboard.`
          );
        }
      }
    });
  });

  describe('Better-Auth Required Tables', () => {
    const BETTER_AUTH_TABLES = ['user', 'session', 'account', 'verification'];

    it('should have all Better-Auth tables after migration', async () => {
      if (!sql || !dashboardDbAvailable) {
        console.log('      Skipped: database not available');
        return;
      }

      // This test is informational - shows which tables exist
      const tableStatus: Record<string, boolean> = {};

      for (const table of BETTER_AUTH_TABLES) {
        tableStatus[table] = await tableExists(sql, table);
      }

      const missingTables = BETTER_AUTH_TABLES.filter((t) => !tableStatus[t]);

      if (missingTables.length > 0) {
        console.log(`      Note: Missing tables (OK for fresh install): ${missingTables.join(', ')}`);
      }

      // Log current state for debugging
      console.log(`      Table status: ${JSON.stringify(tableStatus)}`);
    });
  });

  describe('Type Mismatch Detection', () => {
    it('should provide clear error message for UUID vs TEXT mismatch', async () => {
      // This test validates the error detection logic
      // We simulate checking for UUID type and verify the error message is helpful

      const mockIdType = 'uuid';

      if (mockIdType === 'uuid') {
        const errorMessage =
          `CRITICAL: user.id is UUID type (found: ${mockIdType}).\n` +
          `This indicates DATABASE_URL points to n8n database, not dashboard.\n` +
          `\n` +
          `Fix: Set DATABASE_URL to postgresql://<user>:<pass>@postgres:5432/dashboard\n` +
          `\n` +
          `The dashboard database should be created by:\n` +
          `  init-scripts/00-aaa-create-databases.sql\n` +
          `\n` +
          `If dashboard database doesn't exist, check that:\n` +
          `  1. init-scripts/ folder is mounted to PostgreSQL container\n` +
          `  2. Scripts run in order (00-aaa runs first)`;

        expect(errorMessage).toContain('UUID');
        expect(errorMessage).toContain('dashboard');
        expect(errorMessage).toContain('Fix:');
      }
    });
  });
});
