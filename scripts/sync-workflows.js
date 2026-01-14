#!/usr/bin/env node

/**
 * n8n Workflow Sync Script
 *
 * Syncs local workflow JSON files from the workflows/ directory to an n8n instance.
 * Uses the n8n REST API to create or update workflows by matching on name.
 *
 * Usage:
 *   node scripts/sync-workflows.js [options]
 *
 * Options:
 *   --dry-run      Preview changes without making modifications
 *   --force        Overwrite workflows even if they appear unchanged
 *   --activate     Activate workflows after creating/updating
 *   --verbose      Show detailed output
 *   --check-infra  Verify S3 bucket and PostgreSQL tables exist
 *   --init-infra   Create S3 bucket and run migrations if needed
 *
 * Environment Variables:
 *   N8N_API_URL     - Base URL of the n8n instance (required for workflow sync)
 *   N8N_API_KEY     - API key for authentication (required for workflow sync)
 *   S3_ENDPOINT     - S3/SeaweedFS endpoint URL (required for --check-infra/--init-infra)
 *   S3_BUCKET       - S3 bucket name (default: product-factory-artifacts)
 *   S3_ACCESS_KEY   - S3 access key (required for --check-infra/--init-infra)
 *   S3_SECRET_KEY   - S3 secret key (required for --check-infra/--init-infra)
 *   POSTGRES_URL    - PostgreSQL connection URL (required for --check-infra/--init-infra)
 *
 * Example:
 *   N8N_API_URL=https://n8n.example.com N8N_API_KEY=xxx node scripts/sync-workflows.js
 *   node scripts/sync-workflows.js --check-infra
 *   node scripts/sync-workflows.js --init-infra --verbose
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Configuration
const N8N_API_URL = process.env.N8N_API_URL;
const N8N_API_KEY = process.env.N8N_API_KEY;
const WORKFLOWS_DIR = path.join(__dirname, "..", "workflows");
const INIT_SCRIPTS_DIR = path.join(__dirname, "..", "init-scripts");

// Infrastructure configuration
const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_BUCKET = process.env.S3_BUCKET || "product-factory-artifacts";
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY;
const S3_SECRET_KEY = process.env.S3_SECRET_KEY;
const POSTGRES_URL = process.env.POSTGRES_URL;

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FORCE = args.includes("--force");
const ACTIVATE = args.includes("--activate");
const VERBOSE = args.includes("--verbose");
const CHECK_INFRA = args.includes("--check-infra");
const INIT_INFRA = args.includes("--init-infra");

// Colors for terminal output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message, color = "") {
  console.log(`${color}${message}${colors.reset}`);
}

function logVerbose(message) {
  if (VERBOSE) {
    console.log(`  ${colors.cyan}[verbose]${colors.reset} ${message}`);
  }
}

async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      if (i === retries - 1) throw error;
      logVerbose(`Request failed, retrying (${i + 1}/${retries})...`);
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

async function fetchExistingWorkflows() {
  logVerbose("Fetching existing workflows from n8n...");

  const response = await fetchWithRetry(`${N8N_API_URL}/api/v1/workflows`, {
    method: "GET",
    headers: {
      "X-N8N-API-KEY": N8N_API_KEY,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch workflows: ${response.status} - ${text}`);
  }

  const data = await response.json();
  return data.data || [];
}

async function createWorkflow(workflow) {
  logVerbose(`Creating workflow: ${workflow.name}`);

  // Remove ID if present (n8n will generate new one)
  const { id, ...workflowData } = workflow;

  const response = await fetchWithRetry(`${N8N_API_URL}/api/v1/workflows`, {
    method: "POST",
    headers: {
      "X-N8N-API-KEY": N8N_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...workflowData,
      active: ACTIVATE,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create workflow: ${response.status} - ${text}`);
  }

  return response.json();
}

async function updateWorkflow(id, workflow) {
  logVerbose(`Updating workflow ID ${id}: ${workflow.name}`);

  // Remove local ID, use the n8n instance ID
  const { id: localId, ...workflowData } = workflow;

  const response = await fetchWithRetry(
    `${N8N_API_URL}/api/v1/workflows/${id}`,
    {
      method: "PUT",
      headers: {
        "X-N8N-API-KEY": N8N_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...workflowData,
        active: ACTIVATE ? true : workflowData.active,
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to update workflow: ${response.status} - ${text}`);
  }

  return response.json();
}

function readLocalWorkflows() {
  logVerbose(`Reading workflows from ${WORKFLOWS_DIR}`);

  if (!fs.existsSync(WORKFLOWS_DIR)) {
    throw new Error(`Workflows directory not found: ${WORKFLOWS_DIR}`);
  }

  const files = fs
    .readdirSync(WORKFLOWS_DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("."));

  logVerbose(`Found ${files.length} workflow files`);

  const workflows = [];
  for (const file of files) {
    const filePath = path.join(WORKFLOWS_DIR, file);
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const workflow = JSON.parse(content);
      workflows.push({
        ...workflow,
        _sourceFile: file,
      });
    } catch (error) {
      log(`  Warning: Failed to parse ${file}: ${error.message}`, colors.yellow);
    }
  }

  return workflows;
}

// ============================================
// Infrastructure Check/Init Functions
// ============================================

/**
 * Check if S3 bucket exists
 * @returns {Promise<{exists: boolean, error?: string}>}
 */
async function checkS3Bucket() {
  if (!S3_ENDPOINT || !S3_ACCESS_KEY || !S3_SECRET_KEY) {
    return { exists: false, error: "Missing S3 configuration (S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY)" };
  }

  logVerbose(`Checking S3 bucket: ${S3_BUCKET} at ${S3_ENDPOINT}`);

  try {
    // Use HEAD request to check if bucket exists
    const url = `${S3_ENDPOINT}/${S3_BUCKET}`;
    const date = new Date().toUTCString();

    const response = await fetchWithRetry(url, {
      method: "HEAD",
      headers: {
        "Host": new URL(S3_ENDPOINT).host,
        "Date": date,
        "x-amz-content-sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", // Empty body hash
      },
    });

    if (response.ok || response.status === 200) {
      return { exists: true };
    } else if (response.status === 404) {
      return { exists: false, error: "Bucket does not exist" };
    } else {
      return { exists: false, error: `HTTP ${response.status}` };
    }
  } catch (error) {
    return { exists: false, error: error.message };
  }
}

/**
 * Create S3 bucket if it doesn't exist
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function createS3Bucket() {
  if (!S3_ENDPOINT || !S3_ACCESS_KEY || !S3_SECRET_KEY) {
    return { success: false, error: "Missing S3 configuration" };
  }

  logVerbose(`Creating S3 bucket: ${S3_BUCKET}`);

  try {
    const url = `${S3_ENDPOINT}/${S3_BUCKET}`;
    const date = new Date().toUTCString();

    const response = await fetchWithRetry(url, {
      method: "PUT",
      headers: {
        "Host": new URL(S3_ENDPOINT).host,
        "Date": date,
        "x-amz-content-sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      },
    });

    if (response.ok || response.status === 200) {
      return { success: true };
    } else {
      const text = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${text}` };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Check if PostgreSQL tables exist
 * @returns {Promise<{exists: boolean, tables: string[], missing: string[], error?: string}>}
 */
async function checkPostgresTables() {
  if (!POSTGRES_URL) {
    return { exists: false, tables: [], missing: [], error: "Missing POSTGRES_URL configuration" };
  }

  logVerbose(`Checking PostgreSQL tables at ${POSTGRES_URL.replace(/:[^@]+@/, ':***@')}`);

  const requiredTables = ["project_state", "decision_log_entries", "chat_messages"];

  try {
    // Parse connection URL
    const url = new URL(POSTGRES_URL);
    const host = url.hostname;
    const port = url.port || "5432";
    const database = url.pathname.slice(1);
    const user = url.username;
    const password = url.password;

    // Use psql to check tables (requires psql installed)
    const query = `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('${requiredTables.join("','")}')`;

    const env = {
      ...process.env,
      PGHOST: host,
      PGPORT: port,
      PGDATABASE: database,
      PGUSER: user,
      PGPASSWORD: password,
    };

    const result = execSync(`psql -t -c "${query}"`, {
      encoding: "utf-8",
      env,
      stdio: ["pipe", "pipe", "pipe"]
    });

    const existingTables = result.trim().split("\n").map(t => t.trim()).filter(Boolean);
    const missingTables = requiredTables.filter(t => !existingTables.includes(t));

    return {
      exists: missingTables.length === 0,
      tables: existingTables,
      missing: missingTables,
    };
  } catch (error) {
    // If psql is not available, try to provide guidance
    if (error.message.includes("psql") || error.message.includes("not found")) {
      return {
        exists: false,
        tables: [],
        missing: requiredTables,
        error: "psql command not found. Install PostgreSQL client or check tables manually.",
      };
    }
    return { exists: false, tables: [], missing: requiredTables, error: error.message };
  }
}

/**
 * Run PostgreSQL init script to create tables
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function initPostgresTables() {
  if (!POSTGRES_URL) {
    return { success: false, error: "Missing POSTGRES_URL configuration" };
  }

  const initScript = path.join(INIT_SCRIPTS_DIR, "01-project-state.sql");

  if (!fs.existsSync(initScript)) {
    return { success: false, error: `Init script not found: ${initScript}` };
  }

  logVerbose(`Running PostgreSQL init script: ${initScript}`);

  try {
    const url = new URL(POSTGRES_URL);
    const host = url.hostname;
    const port = url.port || "5432";
    const database = url.pathname.slice(1);
    const user = url.username;
    const password = url.password;

    const env = {
      ...process.env,
      PGHOST: host,
      PGPORT: port,
      PGDATABASE: database,
      PGUSER: user,
      PGPASSWORD: password,
    };

    execSync(`psql -f "${initScript}"`, {
      encoding: "utf-8",
      env,
      stdio: ["pipe", "pipe", "pipe"]
    });

    return { success: true };
  } catch (error) {
    if (error.message.includes("psql") || error.message.includes("not found")) {
      return { success: false, error: "psql command not found. Install PostgreSQL client." };
    }
    return { success: false, error: error.message };
  }
}

/**
 * Run infrastructure check
 */
async function runInfraCheck() {
  log("Infrastructure Check", colors.bright);
  log("====================");
  console.log();

  let allGood = true;

  // Check S3
  log("S3 Storage", colors.cyan);
  const s3Result = await checkS3Bucket();
  if (s3Result.exists) {
    log(`  ✅ Bucket '${S3_BUCKET}' exists`, colors.green);
  } else if (s3Result.error?.includes("Missing")) {
    log(`  ⚠️  ${s3Result.error}`, colors.yellow);
    allGood = false;
  } else {
    log(`  ❌ Bucket '${S3_BUCKET}' not found: ${s3Result.error}`, colors.red);
    allGood = false;
  }
  console.log();

  // Check PostgreSQL
  log("PostgreSQL Database", colors.cyan);
  const pgResult = await checkPostgresTables();
  if (pgResult.exists) {
    log(`  ✅ All required tables exist`, colors.green);
    logVerbose(`  Tables: ${pgResult.tables.join(", ")}`);
  } else if (pgResult.error?.includes("Missing")) {
    log(`  ⚠️  ${pgResult.error}`, colors.yellow);
    allGood = false;
  } else if (pgResult.missing.length > 0) {
    log(`  ❌ Missing tables: ${pgResult.missing.join(", ")}`, colors.red);
    if (pgResult.tables.length > 0) {
      log(`  ✅ Existing tables: ${pgResult.tables.join(", ")}`, colors.green);
    }
    allGood = false;
  } else {
    log(`  ❌ Error: ${pgResult.error}`, colors.red);
    allGood = false;
  }
  console.log();

  // Summary
  if (allGood) {
    log("✅ All infrastructure checks passed!", colors.green);
  } else {
    log("❌ Some infrastructure checks failed.", colors.red);
    log("   Run with --init-infra to create missing resources.", colors.yellow);
    process.exit(1);
  }
}

/**
 * Run infrastructure initialization
 */
async function runInfraInit() {
  log("Infrastructure Initialization", colors.bright);
  log("==============================");
  console.log();

  let hasErrors = false;

  // Check and create S3 bucket
  log("S3 Storage", colors.cyan);
  const s3Check = await checkS3Bucket();
  if (s3Check.exists) {
    log(`  ✅ Bucket '${S3_BUCKET}' already exists`, colors.green);
  } else if (!s3Check.error?.includes("Missing")) {
    log(`  Creating bucket '${S3_BUCKET}'...`);
    if (DRY_RUN) {
      log(`  [DRY RUN] Would create bucket '${S3_BUCKET}'`, colors.yellow);
    } else {
      const createResult = await createS3Bucket();
      if (createResult.success) {
        log(`  ✅ Bucket '${S3_BUCKET}' created`, colors.green);
      } else {
        log(`  ❌ Failed to create bucket: ${createResult.error}`, colors.red);
        hasErrors = true;
      }
    }
  } else {
    log(`  ⚠️  Skipping S3: ${s3Check.error}`, colors.yellow);
  }
  console.log();

  // Check and create PostgreSQL tables
  log("PostgreSQL Database", colors.cyan);
  const pgCheck = await checkPostgresTables();
  if (pgCheck.exists) {
    log(`  ✅ All required tables already exist`, colors.green);
  } else if (!pgCheck.error?.includes("Missing")) {
    log(`  Running init script to create tables...`);
    if (DRY_RUN) {
      log(`  [DRY RUN] Would run init-scripts/01-project-state.sql`, colors.yellow);
    } else {
      const initResult = await initPostgresTables();
      if (initResult.success) {
        log(`  ✅ PostgreSQL tables created`, colors.green);
      } else {
        log(`  ❌ Failed to create tables: ${initResult.error}`, colors.red);
        hasErrors = true;
      }
    }
  } else {
    log(`  ⚠️  Skipping PostgreSQL: ${pgCheck.error}`, colors.yellow);
  }
  console.log();

  // Summary
  if (hasErrors) {
    log("❌ Infrastructure initialization completed with errors.", colors.red);
    process.exit(1);
  } else if (DRY_RUN) {
    log("Dry run complete. Run without --dry-run to apply changes.", colors.cyan);
  } else {
    log("✅ Infrastructure initialization complete!", colors.green);
  }
}

async function main() {
  console.log();

  // Handle infrastructure commands first (don't require n8n config)
  if (CHECK_INFRA) {
    await runInfraCheck();
    return;
  }

  if (INIT_INFRA) {
    await runInfraInit();
    return;
  }

  log("n8n Workflow Sync", colors.bright);
  log("=================");
  console.log();

  // Validate environment (only required for workflow sync)
  if (!N8N_API_URL) {
    log("Error: N8N_API_URL environment variable is required", colors.red);
    log("       (or use --check-infra / --init-infra for infrastructure commands)", colors.yellow);
    process.exit(1);
  }

  if (!N8N_API_KEY) {
    log("Error: N8N_API_KEY environment variable is required", colors.red);
    log("       (or use --check-infra / --init-infra for infrastructure commands)", colors.yellow);
    process.exit(1);
  }

  log(`Target: ${N8N_API_URL}`, colors.blue);

  if (DRY_RUN) {
    log("Mode: DRY RUN (no changes will be made)", colors.yellow);
  } else {
    log("Mode: LIVE (changes will be applied)", colors.green);
  }

  console.log();

  try {
    // Fetch existing workflows from n8n
    const existingWorkflows = await fetchExistingWorkflows();
    log(`Found ${existingWorkflows.length} existing workflows in n8n`);

    // Create lookup map by name
    const existingByName = new Map();
    for (const wf of existingWorkflows) {
      existingByName.set(wf.name, wf);
    }

    // Read local workflows
    const localWorkflows = readLocalWorkflows();
    log(`Found ${localWorkflows.length} local workflow files`);

    console.log();

    // Track statistics
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    // Process each local workflow
    for (const workflow of localWorkflows) {
      const existing = existingByName.get(workflow.name);

      try {
        if (existing) {
          // Update existing workflow
          if (DRY_RUN) {
            log(
              `[UPDATE] ${workflow.name} (ID: ${existing.id})`,
              colors.yellow
            );
            log(`         Source: ${workflow._sourceFile}`);
          } else {
            await updateWorkflow(existing.id, workflow);
            log(
              `[UPDATE] ${workflow.name} (ID: ${existing.id})`,
              colors.yellow
            );
          }
          updated++;
        } else {
          // Create new workflow
          if (DRY_RUN) {
            log(`[CREATE] ${workflow.name}`, colors.green);
            log(`         Source: ${workflow._sourceFile}`);
          } else {
            const result = await createWorkflow(workflow);
            log(`[CREATE] ${workflow.name} (ID: ${result.id})`, colors.green);
          }
          created++;
        }
      } catch (error) {
        log(`[ERROR]  ${workflow.name}: ${error.message}`, colors.red);
        errors++;
      }
    }

    // Summary
    console.log();
    log("Summary", colors.bright);
    log("-------");
    log(`  Created: ${created}`, colors.green);
    log(`  Updated: ${updated}`, colors.yellow);
    log(`  Skipped: ${skipped}`, colors.blue);
    if (errors > 0) {
      log(`  Errors:  ${errors}`, colors.red);
    }

    console.log();

    if (DRY_RUN) {
      log("Dry run complete. Run without --dry-run to apply changes.", colors.cyan);
    } else {
      log("Sync complete!", colors.green);
    }

    // Exit with error code if there were failures
    if (errors > 0) {
      process.exit(1);
    }
  } catch (error) {
    log(`Fatal error: ${error.message}`, colors.red);
    if (VERBOSE) {
      console.error(error);
    }
    process.exit(1);
  }
}

main();
