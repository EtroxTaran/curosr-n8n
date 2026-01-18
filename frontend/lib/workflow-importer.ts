import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import logger from "@/lib/logger";
import { query, queryOne, execute } from "@/lib/db";
import {
  createWorkflow,
  updateWorkflow,
  activateWorkflow,
  findWorkflowByName,
  extractWebhookPaths,
  type WorkflowDefinition,
  type N8nWorkflow,
  type N8nNode,
  type N8nApiConfig,
} from "@/lib/n8n-api";
import { getN8nConfig } from "@/lib/settings";

/**
 * Workflow importer module.
 *
 * Handles importing bundled workflow JSON files into n8n instance,
 * tracking versions, and managing updates.
 */

const log = logger.child({ component: "workflow-importer" });

// ============================================
// Types
// ============================================

export interface BundledWorkflow {
  filename: string;
  name: string;
  description?: string;
  localVersion: string; // SHA-256 checksum of file content
  webhookPaths: string[];
  nodeCount: number;
  hasCredentials: boolean;
  dependencies: string[]; // Names of workflows this depends on
}

export interface WorkflowRegistryEntry {
  id: string;
  workflow_name: string;
  workflow_file: string;
  n8n_workflow_id: string | null;
  n8n_workflow_version: number;
  local_version: string;
  local_checksum: string | null;
  webhook_paths: string[];
  is_active: boolean;
  import_status:
    | "pending"
    | "importing"
    | "imported"
    | "failed"
    | "update_available"
    | "updating";
  last_import_at: Date | null;
  last_error: string | null;
  retry_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface ImportResult {
  filename: string;
  status: "imported" | "updated" | "skipped" | "failed";
  n8nWorkflowId?: string;
  webhookPaths?: string[];
  error?: string;
}

export interface ImportProgress {
  total: number;
  completed: number;
  current: string;
  status: "pending" | "importing" | "complete" | "error";
  results: ImportResult[];
}

// ============================================
// Constants
// ============================================

// Default workflows directory (relative to project root)
const DEFAULT_WORKFLOWS_DIR =
  process.env.WORKFLOWS_DIR || path.join(process.cwd(), "..", "workflows");

// Workflows to import and their dependency order
// Dependencies are imported first
const WORKFLOW_IMPORT_ORDER = [
  // Phase 1: Foundation subworkflows (no dependencies)
  "ai-product-factory-s3-subworkflow.json",
  "ai-product-factory-decision-logger-subworkflow.json",

  // Phase 2: Research subworkflow
  "ai-product-factory-perplexity-research-subworkflow.json",

  // Phase 3: Agent loops (depend on research)
  "ai-product-factory-scavenging-subworkflow.json",
  "ai-product-factory-vision-loop-subworkflow.json",
  "ai-product-factory-architecture-loop-subworkflow.json",

  // Phase 4: API and Main (depend on all above)
  "ai-product-factory-api-workflow.json",
  "ai-product-factory-main-workflow.json",
];

// ============================================
// Utility Functions
// ============================================

/**
 * Calculate SHA-256 checksum of content.
 */
function calculateChecksum(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Strip credential references from workflow nodes.
 *
 * When importing workflows to a fresh n8n instance, credential IDs from the
 * source instance won't exist. n8n returns 400 Bad Request if we try to
 * reference non-existent credentials.
 *
 * This function removes credential references so workflows can be imported,
 * then users configure credentials manually in the n8n UI.
 */
function stripCredentials(
  nodes: N8nNode[],
  options: { logStripped?: boolean } = {}
): N8nNode[] {
  const strippedCredentials: Array<{ nodeName: string; credType: string }> = [];

  const cleanedNodes = nodes.map((node) => {
    if (node.credentials && Object.keys(node.credentials).length > 0) {
      // Log which credentials were stripped
      for (const credType of Object.keys(node.credentials)) {
        strippedCredentials.push({ nodeName: node.name, credType });
      }
      // Return node without credentials
      const { credentials: _removed, ...nodeWithoutCreds } = node;
      return nodeWithoutCreds as N8nNode;
    }
    return node;
  });

  if (options.logStripped && strippedCredentials.length > 0) {
    log.info("Stripped credentials from workflow nodes", {
      count: strippedCredentials.length,
      credentials: strippedCredentials,
    });
  }

  return cleanedNodes;
}

/**
 * Parse workflow JSON file content.
 * Optionally strips credentials for fresh imports.
 */
function parseWorkflowFile(
  content: string,
  options: { stripCredentials?: boolean } = { stripCredentials: true }
): WorkflowDefinition {
  const data = JSON.parse(content);

  // Validate required fields
  if (!data.name || !data.nodes || !Array.isArray(data.nodes)) {
    throw new Error("Invalid workflow file: missing name or nodes");
  }

  // Strip credentials by default to avoid 400 errors on fresh n8n instances
  let nodes = data.nodes;
  if (options.stripCredentials !== false) {
    nodes = stripCredentials(data.nodes, { logStripped: true });
  }

  return {
    name: data.name,
    nodes,
    connections: data.connections || {},
    settings: data.settings,
    staticData: data.staticData,
    tags: data.tags,
  };
}

/**
 * Detect workflow dependencies by looking for "Execute Workflow" nodes.
 */
function detectDependencies(workflow: WorkflowDefinition): string[] {
  const deps: string[] = [];

  for (const node of workflow.nodes) {
    if (
      node.type === "n8n-nodes-base.executeWorkflow" ||
      node.type === "@n8n/n8n-nodes-langchain.toolWorkflow"
    ) {
      const workflowName = node.parameters?.workflowId as string | undefined;
      if (workflowName && !deps.includes(workflowName)) {
        deps.push(workflowName);
      }
    }
  }

  return deps;
}

/**
 * Check if workflow has credential references.
 */
function hasCredentialReferences(workflow: WorkflowDefinition): boolean {
  for (const node of workflow.nodes) {
    if (node.credentials && Object.keys(node.credentials).length > 0) {
      return true;
    }
  }
  return false;
}

// ============================================
// Workflow Directory Validation
// ============================================

export interface WorkflowDirectoryValidation {
  valid: boolean;
  workflowsDir: string;
  filesFound: number;
  error?: string;
}

/**
 * Validate that workflow files are accessible.
 * Call this at application startup or API requests to fail fast if misconfigured.
 */
export async function validateWorkflowsDirectory(
  workflowsDir: string = DEFAULT_WORKFLOWS_DIR
): Promise<WorkflowDirectoryValidation> {
  log.debug("Validating workflows directory", {
    workflowsDir,
    cwd: process.cwd(),
    envVar: process.env.WORKFLOWS_DIR || "(not set)",
  });

  try {
    await fs.access(workflowsDir);
    const files = await fs.readdir(workflowsDir);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    if (jsonFiles.length === 0) {
      log.warn("No workflow JSON files found", { workflowsDir });
      return {
        valid: false,
        workflowsDir,
        filesFound: 0,
        error: `No workflow JSON files found in ${workflowsDir}`,
      };
    }

    log.info("Workflows directory validated", {
      workflowsDir,
      filesFound: jsonFiles.length,
    });

    return {
      valid: true,
      workflowsDir,
      filesFound: jsonFiles.length,
    };
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Directory not accessible";
    log.error("Workflows directory validation failed", {
      workflowsDir,
      cwd: process.cwd(),
      envVar: process.env.WORKFLOWS_DIR || "(not set)",
      error: errorMsg,
    });

    return {
      valid: false,
      workflowsDir,
      filesFound: 0,
      error: errorMsg,
    };
  }
}

// ============================================
// Bundled Workflow Discovery
// ============================================

/**
 * Get list of bundled workflows from the workflows directory.
 */
export async function getBundledWorkflows(
  workflowsDir: string = DEFAULT_WORKFLOWS_DIR
): Promise<BundledWorkflow[]> {
  const workflows: BundledWorkflow[] = [];

  try {
    // Check if directory exists
    await fs.access(workflowsDir);
  } catch (error) {
    log.error("Workflows directory not accessible", {
      workflowsDir,
      cwd: process.cwd(),
      envVar: process.env.WORKFLOWS_DIR || "(not set)",
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }

  // Get ordered list of workflow files
  for (const filename of WORKFLOW_IMPORT_ORDER) {
    const filepath = path.join(workflowsDir, filename);

    try {
      const content = await fs.readFile(filepath, "utf-8");
      // Don't strip credentials here - we need to know which workflows require credential config
      const workflow = parseWorkflowFile(content, { stripCredentials: false });

      workflows.push({
        filename,
        name: workflow.name,
        description: `${workflow.nodes.length} nodes`,
        localVersion: calculateChecksum(content),
        webhookPaths: extractWebhookPaths(workflow),
        nodeCount: workflow.nodes.length,
        hasCredentials: hasCredentialReferences(workflow),
        dependencies: detectDependencies(workflow),
      });
    } catch (error) {
      log.error("Failed to read workflow file", { filename, error });
      // Continue with other files
    }
  }

  return workflows;
}

/**
 * Read a specific workflow file.
 */
export async function readWorkflowFile(
  filename: string,
  workflowsDir: string = DEFAULT_WORKFLOWS_DIR
): Promise<{ content: string; workflow: WorkflowDefinition; checksum: string }> {
  const filepath = path.join(workflowsDir, filename);
  const content = await fs.readFile(filepath, "utf-8");
  const workflow = parseWorkflowFile(content);
  const checksum = calculateChecksum(content);

  return { content, workflow, checksum };
}

// ============================================
// Database Operations
// ============================================

/**
 * Get workflow registry entries from database.
 */
export async function getWorkflowRegistry(): Promise<WorkflowRegistryEntry[]> {
  return query<WorkflowRegistryEntry>(
    "SELECT * FROM workflow_registry ORDER BY created_at ASC"
  );
}

/**
 * Get a specific workflow registry entry.
 */
export async function getWorkflowEntry(
  filename: string
): Promise<WorkflowRegistryEntry | null> {
  return queryOne<WorkflowRegistryEntry>(
    "SELECT * FROM workflow_registry WHERE workflow_file = $1",
    [filename]
  );
}

/**
 * Upsert a workflow registry entry.
 */
async function upsertWorkflowEntry(
  entry: Partial<WorkflowRegistryEntry> & { workflow_file: string }
): Promise<void> {
  const {
    workflow_file,
    workflow_name,
    n8n_workflow_id,
    local_version,
    local_checksum,
    webhook_paths,
    is_active,
    import_status,
    last_import_at,
    last_error,
    retry_count,
  } = entry;

  await execute(
    `INSERT INTO workflow_registry (
      workflow_file, workflow_name, n8n_workflow_id, local_version, local_checksum,
      webhook_paths, is_active, import_status, last_import_at, last_error, retry_count
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (workflow_file) DO UPDATE SET
      workflow_name = COALESCE(EXCLUDED.workflow_name, workflow_registry.workflow_name),
      n8n_workflow_id = COALESCE(EXCLUDED.n8n_workflow_id, workflow_registry.n8n_workflow_id),
      local_version = COALESCE(EXCLUDED.local_version, workflow_registry.local_version),
      local_checksum = COALESCE(EXCLUDED.local_checksum, workflow_registry.local_checksum),
      webhook_paths = COALESCE(EXCLUDED.webhook_paths, workflow_registry.webhook_paths),
      is_active = COALESCE(EXCLUDED.is_active, workflow_registry.is_active),
      import_status = COALESCE(EXCLUDED.import_status, workflow_registry.import_status),
      last_import_at = COALESCE(EXCLUDED.last_import_at, workflow_registry.last_import_at),
      last_error = EXCLUDED.last_error,
      retry_count = COALESCE(EXCLUDED.retry_count, workflow_registry.retry_count)`,
    [
      workflow_file,
      workflow_name ?? null,
      n8n_workflow_id ?? null,
      local_version ?? "",
      local_checksum ?? null,
      JSON.stringify(webhook_paths ?? []),
      is_active ?? false,
      import_status ?? "pending",
      last_import_at ?? null,
      last_error ?? null,
      retry_count ?? 0,
    ]
  );
}

// ============================================
// Recovery Operations
// ============================================

/**
 * Reset stuck imports back to pending state.
 *
 * This handles the case where the container was restarted during an import,
 * leaving workflows stuck in "importing" or "updating" status forever.
 *
 * Called automatically on startup to recover from interrupted imports.
 *
 * @returns Number of workflows reset
 */
export async function resetStuckImports(): Promise<number> {
  try {
    const result = await execute(
      `UPDATE workflow_registry
       SET import_status = 'pending',
           last_error = 'Reset: Previous import was interrupted',
           updated_at = NOW()
       WHERE import_status IN ('importing', 'updating')
       RETURNING workflow_file`
    );

    const resetCount = result.rowCount ?? 0;

    if (resetCount > 0) {
      log.warn("Reset stuck workflow imports", {
        count: resetCount,
        reason: "Previous import was interrupted (container restart or timeout)",
      });
    } else {
      log.debug("No stuck imports to reset");
    }

    return resetCount;
  } catch (error) {
    // Table might not exist yet on fresh install - that's OK
    if (
      error instanceof Error &&
      error.message.includes("relation \"workflow_registry\" does not exist")
    ) {
      log.debug("workflow_registry table does not exist yet, skipping reset");
      return 0;
    }
    log.error("Failed to reset stuck imports", { error });
    throw error;
  }
}

// ============================================
// Import Operations
// ============================================

/**
 * Import a single workflow to n8n.
 */
export async function importWorkflow(
  filename: string,
  options: {
    forceUpdate?: boolean;
    workflowsDir?: string;
    configOverride?: N8nApiConfig;
  } = {}
): Promise<ImportResult> {
  const { forceUpdate = false, workflowsDir = DEFAULT_WORKFLOWS_DIR } = options;

  log.info("Importing workflow", { filename, forceUpdate });

  // Declare workflow variables outside try block so they're accessible in catch
  let workflowName: string = filename.replace(/\.json$/, ""); // Fallback to filename
  let checksum: string = "";

  try {
    // Get n8n config
    const config = options.configOverride || (await getN8nConfig());
    if (!config) {
      throw new Error("n8n not configured");
    }

    // Read workflow file
    const fileData = await readWorkflowFile(filename, workflowsDir);
    const workflow = fileData.workflow;
    checksum = fileData.checksum;
    workflowName = workflow.name; // Update with actual name from file

    // Check current registry status
    const entry = await getWorkflowEntry(filename);

    // Skip if already imported and no force update
    if (
      entry &&
      entry.import_status === "imported" &&
      entry.local_checksum === checksum &&
      !forceUpdate
    ) {
      log.info("Workflow already imported, skipping", { filename });
      return {
        filename,
        status: "skipped",
        n8nWorkflowId: entry.n8n_workflow_id ?? undefined,
        webhookPaths: entry.webhook_paths,
      };
    }

    // Mark as importing
    await upsertWorkflowEntry({
      workflow_file: filename,
      workflow_name: workflow.name,
      local_version: checksum.substring(0, 8),
      local_checksum: checksum,
      import_status: entry?.n8n_workflow_id ? "updating" : "importing",
    });

    let n8nWorkflow: N8nWorkflow;

    // Check if workflow already exists in n8n by name
    const existingWorkflow = await findWorkflowByName(workflow.name, config);

    if (existingWorkflow) {
      // Update existing workflow
      n8nWorkflow = await updateWorkflow(existingWorkflow.id, workflow, config);
      log.info("Workflow updated", {
        filename,
        id: n8nWorkflow.id,
        name: n8nWorkflow.name,
      });
    } else {
      // Create new workflow
      n8nWorkflow = await createWorkflow(workflow, config);
      log.info("Workflow created", {
        filename,
        id: n8nWorkflow.id,
        name: n8nWorkflow.name,
      });
    }

    // Activate the workflow
    const activatedWorkflow = await activateWorkflow(n8nWorkflow.id, config);

    // Extract webhook paths
    const webhookPaths = extractWebhookPaths(workflow);

    // Update registry with success
    await upsertWorkflowEntry({
      workflow_file: filename,
      workflow_name: workflow.name,
      n8n_workflow_id: n8nWorkflow.id,
      local_version: checksum.substring(0, 8),
      local_checksum: checksum,
      webhook_paths: webhookPaths,
      is_active: activatedWorkflow.active,
      import_status: "imported",
      last_import_at: new Date(),
      last_error: null,
    });

    return {
      filename,
      status: existingWorkflow ? "updated" : "imported",
      n8nWorkflowId: n8nWorkflow.id,
      webhookPaths,
    };
  } catch (error) {
    // Extract detailed error message
    let errorMessage: string;
    if (error instanceof Error) {
      // Check if this is an n8n API error with response details
      const apiError = error as Error & { response?: unknown; statusCode?: number };
      if (apiError.response) {
        // Try to extract meaningful message from n8n response
        const response = apiError.response;
        if (typeof response === "object" && response !== null) {
          const respObj = response as Record<string, unknown>;
          errorMessage = respObj.message as string ||
            respObj.error as string ||
            JSON.stringify(response);
        } else {
          errorMessage = String(response);
        }
        errorMessage = `n8n API error (${apiError.statusCode}): ${errorMessage}`;
      } else {
        errorMessage = error.message;
      }
    } else {
      errorMessage = String(error);
    }

    log.error("Failed to import workflow", {
      filename,
      workflowName,
      error: errorMessage,
    });

    // Update registry with failure - use workflowName which is accessible here
    const entry = await getWorkflowEntry(filename);
    await upsertWorkflowEntry({
      workflow_file: filename,
      workflow_name: workflowName, // Now accessible from outer scope
      local_version: checksum ? checksum.substring(0, 8) : "unknown",
      local_checksum: checksum || null,
      import_status: "failed",
      last_error: errorMessage,
      retry_count: (entry?.retry_count ?? 0) + 1,
    });

    return {
      filename,
      status: "failed",
      error: errorMessage,
    };
  }
}

/**
 * Import all workflows with dependency ordering.
 */
export async function importAllWorkflows(
  onProgress?: (progress: ImportProgress) => void,
  options: {
    forceUpdate?: boolean;
    workflowsDir?: string;
    configOverride?: N8nApiConfig;
  } = {}
): Promise<ImportProgress> {
  const { workflowsDir = DEFAULT_WORKFLOWS_DIR } = options;

  const progress: ImportProgress = {
    total: WORKFLOW_IMPORT_ORDER.length,
    completed: 0,
    current: "",
    status: "pending",
    results: [],
  };

  log.info("Starting workflow import", {
    total: progress.total,
    forceUpdate: options.forceUpdate,
  });

  progress.status = "importing";
  onProgress?.(progress);

  for (const filename of WORKFLOW_IMPORT_ORDER) {
    progress.current = filename;
    onProgress?.(progress);

    const result = await importWorkflow(filename, {
      ...options,
      workflowsDir,
    });

    progress.results.push(result);
    progress.completed++;
    onProgress?.(progress);

    // Brief delay between imports to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const failedCount = progress.results.filter(
    (r) => r.status === "failed"
  ).length;

  progress.status = failedCount > 0 ? "error" : "complete";
  progress.current = "";

  log.info("Workflow import complete", {
    total: progress.total,
    imported: progress.results.filter((r) => r.status === "imported").length,
    updated: progress.results.filter((r) => r.status === "updated").length,
    skipped: progress.results.filter((r) => r.status === "skipped").length,
    failed: failedCount,
  });

  onProgress?.(progress);
  return progress;
}

// ============================================
// Version Checking
// ============================================

/**
 * Check for workflow updates.
 */
export async function checkForUpdates(
  workflowsDir: string = DEFAULT_WORKFLOWS_DIR
): Promise<
  Array<{
    filename: string;
    name: string;
    currentVersion: string;
    newVersion: string;
    hasUpdate: boolean;
  }>
> {
  const results: Array<{
    filename: string;
    name: string;
    currentVersion: string;
    newVersion: string;
    hasUpdate: boolean;
  }> = [];

  const registry = await getWorkflowRegistry();
  const bundled = await getBundledWorkflows(workflowsDir);

  for (const workflow of bundled) {
    const entry = registry.find((r) => r.workflow_file === workflow.filename);

    results.push({
      filename: workflow.filename,
      name: workflow.name,
      currentVersion: entry?.local_checksum?.substring(0, 8) || "not imported",
      newVersion: workflow.localVersion.substring(0, 8),
      hasUpdate:
        !entry ||
        entry.import_status !== "imported" ||
        entry.local_checksum !== workflow.localVersion,
    });
  }

  return results;
}

/**
 * Get combined status of bundled workflows and registry.
 */
export async function getWorkflowStatus(
  workflowsDir: string = DEFAULT_WORKFLOWS_DIR
): Promise<
  Array<{
    filename: string;
    name: string;
    localVersion: string;
    n8nWorkflowId: string | null;
    isActive: boolean;
    importStatus: WorkflowRegistryEntry["import_status"];
    webhookPaths: string[];
    hasCredentials: boolean;
    lastImportAt: Date | null;
    lastError: string | null;
  }>
> {
  const registry = await getWorkflowRegistry();
  const bundled = await getBundledWorkflows(workflowsDir);

  return bundled.map((workflow) => {
    const entry = registry.find((r) => r.workflow_file === workflow.filename);

    return {
      filename: workflow.filename,
      name: workflow.name,
      localVersion: workflow.localVersion.substring(0, 8),
      n8nWorkflowId: entry?.n8n_workflow_id ?? null,
      isActive: entry?.is_active ?? false,
      importStatus: entry?.import_status ?? "pending",
      webhookPaths: entry?.webhook_paths ?? workflow.webhookPaths,
      hasCredentials: workflow.hasCredentials,
      lastImportAt: entry?.last_import_at ?? null,
      lastError: entry?.last_error ?? null,
    };
  });
}
