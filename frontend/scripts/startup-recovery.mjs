#!/usr/bin/env node
/**
 * Startup Recovery Script
 *
 * Runs on container startup to recover from interrupted states:
 * - Resets stuck workflow imports ("importing"/"updating" → "pending")
 *
 * This handles the case where the container was restarted during an import,
 * leaving workflows stuck in an incomplete state forever.
 *
 * Usage: node scripts/startup-recovery.mjs
 *
 * Environment:
 *   DATABASE_URL - PostgreSQL connection string (required)
 */

import pg from 'pg';

const { Pool } = pg;

/**
 * Reset stuck workflow imports back to pending state
 */
async function resetStuckImports(pool) {
  try {
    // Check if table exists first
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'workflow_registry'
      )
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('ℹ️  workflow_registry table does not exist yet, skipping reset');
      return 0;
    }

    // Reset stuck imports
    const result = await pool.query(`
      UPDATE workflow_registry
      SET import_status = 'pending',
          last_error = 'Reset: Previous import was interrupted',
          updated_at = NOW()
      WHERE import_status IN ('importing', 'updating')
      RETURNING workflow_file
    `);

    const resetCount = result.rowCount ?? 0;

    if (resetCount > 0) {
      console.log(`⚠️  Reset ${resetCount} stuck workflow import(s):`);
      result.rows.forEach(row => {
        console.log(`   - ${row.workflow_file}`);
      });
      console.log('   These will be retried on next import');
    }

    return resetCount;
  } catch (error) {
    console.error('❌ Failed to reset stuck imports:', error.message);
    // Don't throw - this is a recovery operation, not critical
    return 0;
  }
}

/**
 * Main startup recovery routine
 */
async function runStartupRecovery() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.log('ℹ️  DATABASE_URL not set, skipping startup recovery');
    return;
  }

  console.log('🔄 Running startup recovery...');

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    // Test connection
    await pool.query('SELECT 1');

    // Reset stuck imports
    await resetStuckImports(pool);

    console.log('✅ Startup recovery complete');
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('ℹ️  Database not ready, skipping startup recovery');
    } else {
      console.error('⚠️  Startup recovery error:', error.message);
    }
    // Don't exit with error - let the app start anyway
  } finally {
    await pool.end();
  }
}

// Run recovery
runStartupRecovery();
