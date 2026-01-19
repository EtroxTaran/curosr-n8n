import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import logger from "@/lib/logger";
import { query, queryOne, execute } from "@/lib/db";
import {
  createWorkflow,
  updateWorkflow,
  activateWorkflow,
  activateWorkflowWithRetry,
  verifyWorkflowActive,
  deactivateWorkflow,
  deleteWorkflow,
  findWorkflowByName,
  listWorkflows,
  extractWebhookPaths,
  getAvailableNodeTypeNames,
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
    | "updating"
    | "pending_activation"; // Phase 1 complete, waiting for Phase 2
  last_import_at: Date | null;
  last_error: string | null;
  retry_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface ImportResult {
  filename: string;
  name?: string; // Workflow name for display
  status: "imported" | "updated" | "skipped" | "failed" | "created" | "activation_failed";
  n8nWorkflowId?: string;
  webhookPaths?: string[];
  error?: string;
}

export interface ImportProgress {
  total: number;
  completed: number;
  current: string;
  status: "pending" | "importing" | "complete" | "error";
  phase?: "creating" | "activating" | "cleaning";
  results: ImportResult[];
  failedActivations?: Array<{
    filename: string;
    workflowId: string;
    error: string;
    cleaned?: boolean;
  }>;
}

/**
 * Track created workflows for rollback purposes.
 */
interface CreatedWorkflowInfo {
  filename: string;
  workflowId: string;
  workflowName: string;
  checksum: string;
  webhookPaths: string[];
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
 * Strips credentials and tags (read-only fields) for fresh imports.
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

  // IMPORTANT: Explicitly construct return object WITHOUT tags
  // Tags are read-only in n8n API and will cause 400 errors if included
  // Do NOT use spread operator on 'data' as it would include tags
  return {
    name: data.name,
    nodes,
    connections: data.connections || {},
    settings: data.settings,
    staticData: data.staticData,
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
// Pre-Import Validation
// ============================================

/**
 * Result of node compatibility validation.
 */
export interface NodeValidationResult {
  valid: boolean;
  totalNodes: number;
  missingNodes: Array<{
    nodeType: string;
    nodeName: string;
    workflowFile: string;
  }>;
  warnings: string[];
}

/**
 * Result of circular dependency detection.
 */
export interface CircularDependencyResult {
  hasCycle: boolean;
  cycles: Array<string[]>;
  dependencyOrder: string[];
}

/**
 * Combined pre-import validation result.
 */
export interface PreImportValidationResult {
  valid: boolean;
  nodeValidation: NodeValidationResult;
  dependencyValidation: CircularDependencyResult;
  errors: string[];
  warnings: string[];
}

/**
 * Validate that all node types in workflows exist in the target n8n instance.
 *
 * @param workflows - Array of bundled workflows to validate
 * @param configOverride - Optional n8n API config
 * @returns Validation result with any missing nodes
 */
export async function validateNodeCompatibility(
  workflows: BundledWorkflow[],
  workflowsDir: string = DEFAULT_WORKFLOWS_DIR,
  configOverride?: N8nApiConfig
): Promise<NodeValidationResult> {
  const result: NodeValidationResult = {
    valid: true,
    totalNodes: 0,
    missingNodes: [],
    warnings: [],
  };

  // Get available node types from n8n
  const config = configOverride || (await getN8nConfig());
  if (!config) {
    result.warnings.push("n8n not configured, skipping node validation");
    return result;
  }

  const availableNodes = await getAvailableNodeTypeNames(config);

  // If we couldn't get node types, skip validation with warning
  if (availableNodes.size === 0) {
    result.warnings.push(
      "Could not retrieve available node types from n8n, skipping node validation"
    );
    return result;
  }

  log.info("Validating node compatibility", {
    workflowCount: workflows.length,
    availableNodeTypes: availableNodes.size,
  });

  // Check each workflow's nodes
  for (const bundled of workflows) {
    try {
      const { workflow } = await readWorkflowFile(bundled.filename, workflowsDir);
      result.totalNodes += workflow.nodes.length;

      for (const node of workflow.nodes) {
        // Skip validation for certain internal node types
        if (
          node.type.startsWith("n8n-nodes-base.") ||
          node.type.startsWith("@n8n/")
        ) {
          // Check if this specific node type exists
          if (!availableNodes.has(node.type)) {
            result.missingNodes.push({
              nodeType: node.type,
              nodeName: node.name,
              workflowFile: bundled.filename,
            });
          }
        }
      }
    } catch (error) {
      result.warnings.push(
        `Failed to read workflow ${bundled.filename}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  result.valid = result.missingNodes.length === 0;

  if (!result.valid) {
    log.warn("Node compatibility validation failed", {
      missingNodes: result.missingNodes.length,
      details: result.missingNodes,
    });
  } else {
    log.info("Node compatibility validation passed", {
      totalNodes: result.totalNodes,
    });
  }

  return result;
}

/**
 * Detect circular dependencies in workflow graph.
 *
 * Uses depth-first search to find cycles in the dependency graph.
 *
 * @param workflows - Array of bundled workflows with dependencies
 * @returns Result with any detected cycles and safe import order
 */
export function detectCircularDependencies(
  workflows: BundledWorkflow[]
): CircularDependencyResult {
  const result: CircularDependencyResult = {
    hasCycle: false,
    cycles: [],
    dependencyOrder: [],
  };

  // Build dependency graph: workflow name -> dependencies (workflow names)
  const graph = new Map<string, string[]>();
  const workflowByFile = new Map<string, BundledWorkflow>();

  for (const workflow of workflows) {
    workflowByFile.set(workflow.filename, workflow);
    // Use workflow name as the key since dependencies reference names
    graph.set(workflow.name, workflow.dependencies || []);
  }

  // DFS-based cycle detection
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const finished = new Set<string>();

  function dfs(node: string, path: string[]): boolean {
    if (recursionStack.has(node)) {
      // Found a cycle - extract the cycle from the path
      const cycleStart = path.indexOf(node);
      const cycle = [...path.slice(cycleStart), node];
      result.cycles.push(cycle);
      result.hasCycle = true;
      return true;
    }

    if (finished.has(node)) {
      return false;
    }

    visited.add(node);
    recursionStack.add(node);

    const deps = graph.get(node) || [];
    for (const dep of deps) {
      // Only check dependencies that are in our workflow set
      if (graph.has(dep)) {
        dfs(dep, [...path, node]);
      }
    }

    recursionStack.delete(node);
    finished.add(node);
    result.dependencyOrder.unshift(node); // Add to front for topological order

    return false;
  }

  // Run DFS from each node
  for (const workflowName of graph.keys()) {
    if (!visited.has(workflowName)) {
      dfs(workflowName, []);
    }
  }

  if (result.hasCycle) {
    log.error("Circular dependencies detected in workflows", {
      cycles: result.cycles,
    });
  } else {
    log.info("No circular dependencies detected", {
      orderCount: result.dependencyOrder.length,
    });
  }

  return result;
}

/**
 * Run all pre-import validations.
 *
 * Validates:
 * 1. Node compatibility - all nodes exist in target n8n
 * 2. Circular dependencies - no cycles in workflow dependencies
 *
 * @param workflowsDir - Directory containing workflow files
 * @param configOverride - Optional n8n API config
 * @returns Combined validation result
 */
export async function validatePreImport(
  workflowsDir: string = DEFAULT_WORKFLOWS_DIR,
  configOverride?: N8nApiConfig
): Promise<PreImportValidationResult> {
  log.info("Running pre-import validation");

  const result: PreImportValidationResult = {
    valid: true,
    nodeValidation: {
      valid: true,
      totalNodes: 0,
      missingNodes: [],
      warnings: [],
    },
    dependencyValidation: {
      hasCycle: false,
      cycles: [],
      dependencyOrder: [],
    },
    errors: [],
    warnings: [],
  };

  try {
    // Get bundled workflows
    const workflows = await getBundledWorkflows(workflowsDir);

    if (workflows.length === 0) {
      result.errors.push("No workflows found to validate");
      result.valid = false;
      return result;
    }

    // Run validations in parallel
    const [nodeValidation, dependencyValidation] = await Promise.all([
      validateNodeCompatibility(workflows, workflowsDir, configOverride),
      Promise.resolve(detectCircularDependencies(workflows)),
    ]);

    result.nodeValidation = nodeValidation;
    result.dependencyValidation = dependencyValidation;

    // Aggregate warnings
    result.warnings.push(...nodeValidation.warnings);

    // Check for errors
    if (!nodeValidation.valid) {
      const missingTypes = [...new Set(nodeValidation.missingNodes.map((n) => n.nodeType))];
      result.errors.push(
        `Missing node types in n8n instance: ${missingTypes.join(", ")}`
      );
      result.valid = false;
    }

    if (dependencyValidation.hasCycle) {
      const cycleStrs = dependencyValidation.cycles.map((c) => c.join(" -> "));
      result.errors.push(`Circular dependencies detected: ${cycleStrs.join("; ")}`);
      result.valid = false;
    }

    log.info("Pre-import validation complete", {
      valid: result.valid,
      errors: result.errors.length,
      warnings: result.warnings.length,
    });

    return result;
  } catch (error) {
    result.errors.push(
      `Validation failed: ${error instanceof Error ? error.message : String(error)}`
    );
    result.valid = false;
    return result;
  }
}

// ============================================
// Dry-Run Import Preview
// ============================================

/**
 * Result of a dry-run import preview for a single workflow.
 */
export interface DryRunWorkflowResult {
  filename: string;
  name: string;
  action: "create" | "update" | "skip";
  reason: string;
  currentVersion?: string;
  newVersion: string;
  nodeCount: number;
  hasCredentials: boolean;
  webhookPaths: string[];
  dependencies: string[];
}

/**
 * Full dry-run import preview result.
 */
export interface DryRunResult {
  valid: boolean;
  validation: PreImportValidationResult;
  workflows: DryRunWorkflowResult[];
  summary: {
    total: number;
    toCreate: number;
    toUpdate: number;
    toSkip: number;
  };
  importOrder: string[];
}

/**
 * Perform a dry-run import preview.
 *
 * This simulates an import without making any changes, showing:
 * - Which workflows would be created, updated, or skipped
 * - Validation results (node compatibility, circular deps)
 * - Import order based on dependencies
 *
 * @param workflowsDir - Directory containing workflow files
 * @param configOverride - Optional n8n API config
 * @param forceUpdate - If true, all workflows would be updated
 * @returns Dry-run preview result
 */
export async function dryRunImport(
  workflowsDir: string = DEFAULT_WORKFLOWS_DIR,
  configOverride?: N8nApiConfig,
  forceUpdate: boolean = false
): Promise<DryRunResult> {
  log.info("Running dry-run import preview", { forceUpdate });

  // Run validation first
  const validation = await validatePreImport(workflowsDir, configOverride);

  // Get bundled workflows
  const bundled = await getBundledWorkflows(workflowsDir);

  // Get current registry state
  const registry = await getWorkflowRegistry();

  // Build preview for each workflow
  const workflows: DryRunWorkflowResult[] = [];
  let toCreate = 0;
  let toUpdate = 0;
  let toSkip = 0;

  for (const workflow of bundled) {
    const entry = registry.find((r) => r.workflow_file === workflow.filename);

    let action: "create" | "update" | "skip";
    let reason: string;

    if (!entry || !entry.n8n_workflow_id) {
      // Not imported yet
      action = "create";
      reason = "Workflow not yet imported";
      toCreate++;
    } else if (forceUpdate) {
      // Force update requested
      action = "update";
      reason = "Force update requested";
      toUpdate++;
    } else if (entry.local_checksum !== workflow.localVersion) {
      // Content changed
      action = "update";
      reason = "Workflow content changed (checksum mismatch)";
      toUpdate++;
    } else if (entry.import_status !== "imported") {
      // Previous import failed or incomplete
      action = "update";
      reason = `Previous import status: ${entry.import_status}`;
      toUpdate++;
    } else {
      // Already imported and up to date
      action = "skip";
      reason = "Already imported with matching version";
      toSkip++;
    }

    workflows.push({
      filename: workflow.filename,
      name: workflow.name,
      action,
      reason,
      currentVersion: entry?.local_checksum?.substring(0, 8),
      newVersion: workflow.localVersion.substring(0, 8),
      nodeCount: workflow.nodeCount,
      hasCredentials: workflow.hasCredentials,
      webhookPaths: workflow.webhookPaths,
      dependencies: workflow.dependencies,
    });
  }

  log.info("Dry-run preview complete", {
    total: workflows.length,
    toCreate,
    toUpdate,
    toSkip,
    validationPassed: validation.valid,
  });

  return {
    valid: validation.valid,
    validation,
    workflows,
    summary: {
      total: workflows.length,
      toCreate,
      toUpdate,
      toSkip,
    },
    importOrder: validation.dependencyValidation.dependencyOrder,
  };
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
    const resetCount = await execute(
      `UPDATE workflow_registry
       SET import_status = 'pending',
           last_error = 'Reset: Previous import was interrupted',
           updated_at = NOW()
       WHERE import_status IN ('importing', 'updating')`
    );

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
    skipActivation?: boolean; // For two-phase import: create only, activate later
  } = {}
): Promise<ImportResult> {
  const {
    forceUpdate = false,
    workflowsDir = DEFAULT_WORKFLOWS_DIR,
    skipActivation = false,
  } = options;

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
        name: workflow.name,
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

    // Extract webhook paths
    const webhookPaths = extractWebhookPaths(workflow);

    // Activate the workflow (unless skipActivation is set for two-phase import)
    let isActive = false;
    if (!skipActivation) {
      const activatedWorkflow = await activateWorkflow(n8nWorkflow.id, config);
      isActive = activatedWorkflow.active;
    }

    // Update registry with success
    await upsertWorkflowEntry({
      workflow_file: filename,
      workflow_name: workflow.name,
      n8n_workflow_id: n8nWorkflow.id,
      local_version: checksum.substring(0, 8),
      local_checksum: checksum,
      webhook_paths: webhookPaths,
      is_active: isActive,
      import_status: skipActivation ? "pending_activation" : "imported",
      last_import_at: new Date(),
      last_error: null,
    });

    return {
      filename,
      name: workflow.name,
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
      name: workflowName,
      status: "failed",
      error: errorMessage,
    };
  }
}

/**
 * Import all workflows using two-phase approach.
 *
 * Phase 1: Create ALL workflows (inactive)
 * Phase 2: Activate all workflows in dependency order
 *
 * This ensures all subworkflows exist before any parent workflow tries to
 * reference them during activation, solving the "workflow not published" error.
 *
 * If Phase 1 fails, all created workflows are rolled back (deleted).
 * If Phase 2 fails, workflows remain created but inactive (recoverable).
 *
 * Options:
 * - validateFirst: Run pre-import validation (node compatibility, circular deps)
 * - cleanupOnActivationFailure: Clean up workflows that fail activation
 * - cleanupOptions: Options for cleanup (delete vs deactivate)
 */
export async function importAllWorkflows(
  onProgress?: (progress: ImportProgress) => void,
  options: {
    forceUpdate?: boolean;
    workflowsDir?: string;
    configOverride?: N8nApiConfig;
    /** Run pre-import validation before importing */
    validateFirst?: boolean;
    /** Clean up workflows that fail activation (default: false, leave them for retry) */
    cleanupOnActivationFailure?: boolean;
    /** Options for cleanup if cleanupOnActivationFailure is true */
    cleanupOptions?: CleanupOptions;
    /** Clear all registry entries before import (prevents stale workflow ID issues) */
    clearRegistryFirst?: boolean;
  } = {}
): Promise<ImportProgress> {
  const {
    forceUpdate = false,
    workflowsDir = DEFAULT_WORKFLOWS_DIR,
    validateFirst = false,
    cleanupOnActivationFailure = false,
    cleanupOptions = {},
    clearRegistryFirst = false,
  } = options;

  const progress: ImportProgress = {
    total: WORKFLOW_IMPORT_ORDER.length,
    completed: 0,
    current: "",
    status: "pending",
    phase: "creating",
    results: [],
    failedActivations: [],
  };

  log.info("Starting two-phase workflow import", {
    total: progress.total,
    forceUpdate,
    validateFirst,
    cleanupOnActivationFailure,
    clearRegistryFirst,
  });

  // Get n8n config once for all operations
  const config = options.configOverride || (await getN8nConfig());
  if (!config) {
    throw new Error("n8n not configured");
  }

  // ============================================
  // OPTIONAL: Pre-import validation
  // ============================================
  if (validateFirst) {
    log.info("Running pre-import validation");
    progress.current = "Validating...";
    onProgress?.(progress);

    const validation = await validatePreImport(workflowsDir, config);

    if (!validation.valid) {
      log.error("Pre-import validation failed", {
        errors: validation.errors,
        warnings: validation.warnings,
      });

      progress.status = "error";
      progress.current = "";
      progress.results.push({
        filename: "validation",
        status: "failed",
        error: validation.errors.join("; "),
      });
      onProgress?.(progress);
      return progress;
    }

    log.info("Pre-import validation passed", {
      warnings: validation.warnings,
    });
  }

  progress.status = "importing";
  onProgress?.(progress);

  // ============================================
  // OPTIONAL: Clear registry before import
  // ============================================
  // This prevents 404 errors when old registry entries reference
  // workflows that no longer exist in n8n (stale workflow IDs)
  if (clearRegistryFirst) {
    log.info("Clearing workflow registry before import");
    progress.current = "Clearing old registry entries...";
    onProgress?.(progress);

    try {
      const clearedCount = await clearWorkflowRegistry();
      log.info("Workflow registry cleared", { clearedCount });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      log.warn("Failed to clear workflow registry, continuing with import", {
        error: errorMessage,
      });
      // Don't fail the import - continue anyway
    }
  }

  // Track successfully created workflows for rollback
  const createdWorkflows: CreatedWorkflowInfo[] = [];

  // ============================================
  // PHASE 1: Create all workflows (inactive)
  // ============================================
  log.info("Phase 1: Creating all workflows (inactive)");
  progress.phase = "creating";

  for (const filename of WORKFLOW_IMPORT_ORDER) {
    progress.current = filename;
    onProgress?.(progress);

    try {
      const result = await createWorkflowPhase1(filename, {
        forceUpdate,
        workflowsDir,
        config,
      });

      if (result.status === "skipped") {
        // Already imported and no update needed
        progress.results.push(result);
        progress.completed++;
        onProgress?.(progress);
        continue;
      }

      if (result.status === "failed") {
        // Phase 1 failure - rollback all created workflows
        log.error("Phase 1 failed, rolling back created workflows", {
          failedAt: filename,
          error: result.error,
          toRollback: createdWorkflows.length,
        });

        await rollbackCreatedWorkflows(createdWorkflows, config);

        progress.results.push(result);
        progress.status = "error";
        progress.current = "";
        onProgress?.(progress);
        return progress;
      }

      // Track successfully created workflow
      createdWorkflows.push({
        filename,
        workflowId: result.n8nWorkflowId!,
        workflowName: result.filename.replace(/\.json$/, ""),
        checksum: "",
        webhookPaths: result.webhookPaths || [],
      });

      progress.results.push(result);
      progress.completed++;
      onProgress?.(progress);

      // Brief delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (error) {
      // Unexpected error - rollback
      log.error("Unexpected error in Phase 1, rolling back", {
        filename,
        error,
        toRollback: createdWorkflows.length,
      });

      await rollbackCreatedWorkflows(createdWorkflows, config);

      progress.results.push({
        filename,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
      progress.status = "error";
      progress.current = "";
      onProgress?.(progress);
      return progress;
    }
  }

  // ============================================
  // PHASE 2: Activate all workflows in order
  // ============================================
  log.info("Phase 2: Activating all workflows in dependency order", {
    toActivate: createdWorkflows.length,
  });
  progress.phase = "activating";
  progress.completed = 0;

  for (const created of createdWorkflows) {
    progress.current = created.filename;
    onProgress?.(progress);

    try {
      // Use aggressive retry logic for activation to handle publish timing
      // n8n needs significant time to fully "publish" subworkflows before parent workflows can reference them
      // The subworkflow must be fully indexed and available, not just "active"
      await activateWorkflowWithRetry(created.workflowId, config, {
        maxRetries: 8,        // More retries for slow n8n instances
        initialDelayMs: 3000, // Start with 3 second delay, exponential backoff
      });

      // Update registry with activation success
      await upsertWorkflowEntry({
        workflow_file: created.filename,
        workflow_name: created.workflowName,
        n8n_workflow_id: created.workflowId,
        is_active: true,
        import_status: "imported",
        last_import_at: new Date(),
        last_error: null,
      });

      // Update result status from "created" to "imported"
      const resultIndex = progress.results.findIndex(
        (r) => r.filename === created.filename
      );
      if (resultIndex >= 0) {
        progress.results[resultIndex].status = "imported";
      }

      log.info("Workflow activated", {
        filename: created.filename,
        workflowId: created.workflowId,
      });

      progress.completed++;
      onProgress?.(progress);

      // Verify the workflow is truly active by querying n8n
      // This confirms n8n has processed the activation before we move on
      const isVerified = await verifyWorkflowActive(created.workflowId, config, {
        maxAttempts: 5,
        delayMs: 2000,
      });

      if (!isVerified) {
        log.warn("Workflow activation could not be verified", {
          filename: created.filename,
          workflowId: created.workflowId,
        });
      }

      // Wait for n8n to fully PUBLISH the workflow before activating the next one
      // This delay is CRITICAL - n8n needs time to index the workflow for subworkflow references
      // Even after the API says the workflow is active, n8n's internal publishing is asynchronous
      // and dependent workflows will fail with "workflow not published" errors without this delay.
      // 15 seconds provides a larger buffer for n8n's internal indexing to complete.
      await new Promise((resolve) => setTimeout(resolve, 15000));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      log.error("Failed to activate workflow", {
        filename: created.filename,
        workflowId: created.workflowId,
        error: errorMessage,
      });

      // Track failed activation for cleanup/retry
      progress.failedActivations!.push({
        filename: created.filename,
        workflowId: created.workflowId,
        error: errorMessage,
      });

      // Update registry with activation failure
      await upsertWorkflowEntry({
        workflow_file: created.filename,
        workflow_name: created.workflowName,
        n8n_workflow_id: created.workflowId,
        import_status: "failed",
        last_error: `Activation failed: ${errorMessage}`,
      });

      // Update result status
      const resultIndex = progress.results.findIndex(
        (r) => r.filename === created.filename
      );
      if (resultIndex >= 0) {
        progress.results[resultIndex].status = "activation_failed";
        progress.results[resultIndex].error = `Activation failed: ${errorMessage}`;
      }

      // Continue trying to activate other workflows - don't abort entirely
      progress.completed++;
      onProgress?.(progress);
    }
  }

  // ============================================
  // OPTIONAL PHASE 3: Cleanup failed activations
  // ============================================
  if (cleanupOnActivationFailure && progress.failedActivations!.length > 0) {
    log.info("Phase 3: Cleaning up failed workflow activations", {
      count: progress.failedActivations!.length,
    });
    progress.phase = "cleaning";
    progress.current = "Cleaning up...";
    onProgress?.(progress);

    const cleanupResults = await cleanupFailedActivations(
      progress.failedActivations!,
      config,
      cleanupOptions
    );

    // Update failedActivations with cleanup status
    for (const cleanupResult of cleanupResults) {
      const failedEntry = progress.failedActivations!.find(
        (f) => f.filename === cleanupResult.filename
      );
      if (failedEntry) {
        failedEntry.cleaned = cleanupResult.action !== "error";
      }
    }

    log.info("Cleanup complete", {
      total: cleanupResults.length,
      cleaned: cleanupResults.filter((r) => r.action !== "error").length,
      errors: cleanupResults.filter((r) => r.action === "error").length,
    });
  }

  // Calculate final status
  const failedCount = progress.results.filter(
    (r) => r.status === "failed" || r.status === "activation_failed"
  ).length;

  progress.status = failedCount > 0 ? "error" : "complete";
  progress.current = "";
  progress.phase = undefined;

  log.info("Two-phase workflow import complete", {
    total: progress.total,
    imported: progress.results.filter((r) => r.status === "imported").length,
    updated: progress.results.filter((r) => r.status === "updated").length,
    skipped: progress.results.filter((r) => r.status === "skipped").length,
    activationFailed: progress.failedActivations!.length,
    failed: failedCount,
  });

  onProgress?.(progress);
  return progress;
}

/**
 * Phase 1: Create a workflow without activating it.
 *
 * Returns "created" status on success, "skipped" if already imported,
 * or "failed" on error.
 */
async function createWorkflowPhase1(
  filename: string,
  options: {
    forceUpdate: boolean;
    workflowsDir: string;
    config: N8nApiConfig;
  }
): Promise<ImportResult> {
  const { forceUpdate, workflowsDir, config } = options;

  let workflowName: string = filename.replace(/\.json$/, "");
  let checksum: string = "";

  try {
    // Read workflow file
    const fileData = await readWorkflowFile(filename, workflowsDir);
    const workflow = fileData.workflow;
    checksum = fileData.checksum;
    workflowName = workflow.name;

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
    let isUpdate = false;

    // SAFETY: Explicitly ensure no tags property exists (n8n rejects tags in API requests)
    // This is a belt-and-suspenders check since parseWorkflowFile and stripReadOnlyFields
    // should already handle this, but we triple-check to avoid 400 errors
    const safeWorkflow: WorkflowDefinition = {
      name: workflow.name,
      nodes: workflow.nodes,
      connections: workflow.connections,
      settings: workflow.settings,
      staticData: workflow.staticData,
    };

    // Check if workflow already exists in n8n by name
    const existingWorkflow = await findWorkflowByName(safeWorkflow.name, config);

    if (existingWorkflow) {
      // Update existing workflow (leave activation state unchanged)
      n8nWorkflow = await updateWorkflow(existingWorkflow.id, safeWorkflow, config);
      isUpdate = true;
      log.info("Workflow updated (Phase 1)", {
        filename,
        id: n8nWorkflow.id,
        name: n8nWorkflow.name,
      });
    } else {
      // Create new workflow (inactive by default)
      n8nWorkflow = await createWorkflow(safeWorkflow, config);
      log.info("Workflow created (Phase 1)", {
        filename,
        id: n8nWorkflow.id,
        name: n8nWorkflow.name,
      });
    }

    // Extract webhook paths
    const webhookPaths = extractWebhookPaths(workflow);

    // Update registry with creation success (not yet activated)
    await upsertWorkflowEntry({
      workflow_file: filename,
      workflow_name: workflow.name,
      n8n_workflow_id: n8nWorkflow.id,
      local_version: checksum.substring(0, 8),
      local_checksum: checksum,
      webhook_paths: webhookPaths,
      is_active: false, // Will be updated in Phase 2
      import_status: "importing", // Still in progress
      last_import_at: new Date(),
      last_error: null,
    });

    return {
      filename,
      status: isUpdate ? "updated" : "created",
      n8nWorkflowId: n8nWorkflow.id,
      webhookPaths,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    log.error("Failed to create workflow (Phase 1)", {
      filename,
      workflowName,
      error: errorMessage,
    });

    // Update registry with failure
    const entry = await getWorkflowEntry(filename);
    await upsertWorkflowEntry({
      workflow_file: filename,
      workflow_name: workflowName,
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
 * Rollback created workflows by deleting them from n8n.
 *
 * Called when Phase 1 fails to clean up partially created state.
 */
async function rollbackCreatedWorkflows(
  created: CreatedWorkflowInfo[],
  config: N8nApiConfig
): Promise<void> {
  log.warn("Rolling back created workflows", { count: created.length });

  for (const workflow of created) {
    try {
      await deleteWorkflow(workflow.workflowId, config);

      // Reset registry entry
      await upsertWorkflowEntry({
        workflow_file: workflow.filename,
        n8n_workflow_id: null,
        import_status: "pending",
        is_active: false,
        last_error: "Rolled back due to import failure",
      });

      log.info("Rolled back workflow", {
        filename: workflow.filename,
        workflowId: workflow.workflowId,
      });
    } catch (error) {
      log.error("Failed to rollback workflow", {
        filename: workflow.filename,
        workflowId: workflow.workflowId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue with other rollbacks
    }
  }
}

/**
 * Options for cleaning up failed workflow activations.
 */
export interface CleanupOptions {
  /** Delete workflows that failed activation (default: false, just deactivate) */
  deleteWorkflows?: boolean;
  /** Reset registry to pending status (default: true) */
  resetRegistry?: boolean;
}

/**
 * Result of cleanup operation for a single workflow.
 */
export interface CleanupResult {
  filename: string;
  workflowId: string;
  action: "deactivated" | "deleted" | "error";
  error?: string;
}

/**
 * Clean up workflows that failed activation in Phase 2.
 *
 * By default, this deactivates the workflows (they remain in n8n but inactive).
 * Use deleteWorkflows: true to completely remove them from n8n.
 *
 * @param failedWorkflows - Array of workflows that failed activation
 * @param config - n8n API config
 * @param options - Cleanup options
 * @returns Array of cleanup results
 */
export async function cleanupFailedActivations(
  failedWorkflows: Array<{ filename: string; workflowId: string; error: string }>,
  config: N8nApiConfig,
  options: CleanupOptions = {}
): Promise<CleanupResult[]> {
  const { deleteWorkflows: shouldDelete = false, resetRegistry = true } = options;
  const results: CleanupResult[] = [];

  log.info("Cleaning up failed workflow activations", {
    count: failedWorkflows.length,
    action: shouldDelete ? "delete" : "deactivate",
  });

  for (const workflow of failedWorkflows) {
    const result: CleanupResult = {
      filename: workflow.filename,
      workflowId: workflow.workflowId,
      action: "error",
    };

    try {
      if (shouldDelete) {
        // Delete the workflow from n8n
        await deleteWorkflow(workflow.workflowId, config);
        result.action = "deleted";

        if (resetRegistry) {
          // Reset registry entry
          await upsertWorkflowEntry({
            workflow_file: workflow.filename,
            n8n_workflow_id: null,
            import_status: "pending",
            is_active: false,
            last_error: "Deleted after activation failure",
          });
        }

        log.info("Deleted workflow after activation failure", {
          filename: workflow.filename,
          workflowId: workflow.workflowId,
        });
      } else {
        // Just ensure the workflow is deactivated
        try {
          await deactivateWorkflow(workflow.workflowId, config);
        } catch (deactivateError) {
          // Workflow might already be inactive
          log.debug("Deactivate returned error (may already be inactive)", {
            workflowId: workflow.workflowId,
            error: deactivateError instanceof Error ? deactivateError.message : String(deactivateError),
          });
        }
        result.action = "deactivated";

        if (resetRegistry) {
          // Update registry to reflect failed state
          await upsertWorkflowEntry({
            workflow_file: workflow.filename,
            is_active: false,
            import_status: "failed",
            last_error: `Activation failed: ${workflow.error}`,
          });
        }

        log.info("Deactivated workflow after activation failure", {
          filename: workflow.filename,
          workflowId: workflow.workflowId,
        });
      }

      results.push(result);
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      results.push(result);

      log.error("Failed to cleanup workflow", {
        filename: workflow.filename,
        workflowId: workflow.workflowId,
        action: shouldDelete ? "delete" : "deactivate",
        error: result.error,
      });
    }
  }

  log.info("Cleanup complete", {
    total: failedWorkflows.length,
    successful: results.filter((r) => r.action !== "error").length,
    errors: results.filter((r) => r.action === "error").length,
  });

  return results;
}

/**
 * Retry activation for workflows that previously failed.
 *
 * @param failedWorkflows - Array of workflows to retry
 * @param config - n8n API config
 * @returns Import results for retried workflows
 */
export async function retryFailedActivations(
  failedWorkflows: Array<{ filename: string; workflowId: string }>,
  config: N8nApiConfig
): Promise<ImportResult[]> {
  const results: ImportResult[] = [];

  log.info("Retrying failed workflow activations", { count: failedWorkflows.length });

  for (const workflow of failedWorkflows) {
    try {
      // Update registry to "importing" status
      await upsertWorkflowEntry({
        workflow_file: workflow.filename,
        import_status: "importing",
        last_error: null,
      });

      // Try to activate with retry logic
      await activateWorkflowWithRetry(workflow.workflowId, config, {
        maxRetries: 8,
        initialDelayMs: 3000,
      });

      // Success - update registry
      await upsertWorkflowEntry({
        workflow_file: workflow.filename,
        is_active: true,
        import_status: "imported",
        last_import_at: new Date(),
        last_error: null,
      });

      results.push({
        filename: workflow.filename,
        status: "imported",
        n8nWorkflowId: workflow.workflowId,
      });

      log.info("Successfully retried workflow activation", {
        filename: workflow.filename,
        workflowId: workflow.workflowId,
      });

      // Verify the workflow is active and wait for n8n to publish
      await verifyWorkflowActive(workflow.workflowId, config, {
        maxAttempts: 5,
        delayMs: 2000,
      });

      // Wait for n8n to fully publish the workflow
      await new Promise((resolve) => setTimeout(resolve, 15000));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Update registry with failure
      await upsertWorkflowEntry({
        workflow_file: workflow.filename,
        import_status: "failed",
        last_error: `Retry activation failed: ${errorMessage}`,
      });

      results.push({
        filename: workflow.filename,
        status: "activation_failed",
        n8nWorkflowId: workflow.workflowId,
        error: errorMessage,
      });

      log.error("Retry activation failed", {
        filename: workflow.filename,
        workflowId: workflow.workflowId,
        error: errorMessage,
      });
    }
  }

  return results;
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

// ============================================
// Workflow Sync (Registry ↔ n8n)
// ============================================

export interface SyncResult {
  filename: string;
  workflowName: string;
  action: "no_change" | "marked_deleted" | "marked_inactive" | "marked_active" | "error";
  previousStatus?: string;
  newStatus?: string;
  error?: string;
}

export interface SyncProgress {
  total: number;
  synced: number;
  deleted: number;
  stateChanged: number;
  errors: number;
  results: SyncResult[];
}

/**
 * Sync workflow registry with actual n8n instance state.
 *
 * This function checks which workflows are actually deployed and active
 * in n8n and updates the registry to reflect the true state.
 *
 * Use cases:
 * - User manually deleted a workflow from n8n UI
 * - User manually activated/deactivated a workflow in n8n UI
 * - Dashboard shows stale state after n8n changes
 *
 * @returns SyncProgress with details of what changed
 */
export async function syncWorkflowRegistry(
  options: { configOverride?: N8nApiConfig } = {}
): Promise<SyncProgress> {
  log.info("Starting workflow registry sync with n8n");

  const progress: SyncProgress = {
    total: 0,
    synced: 0,
    deleted: 0,
    stateChanged: 0,
    errors: 0,
    results: [],
  };

  try {
    // Get n8n config
    const config = options.configOverride || (await getN8nConfig());
    if (!config) {
      throw new Error("n8n not configured");
    }

    // Get all workflows from n8n
    const n8nWorkflows = await listWorkflows(config);
    const n8nWorkflowMap = new Map<string, N8nWorkflow>();

    // Index by both ID and name for lookups
    for (const workflow of n8nWorkflows) {
      n8nWorkflowMap.set(workflow.id, workflow);
    }

    // Get current registry state
    const registry = await getWorkflowRegistry();
    progress.total = registry.length;

    // Check each registry entry against n8n
    for (const entry of registry) {
      const result: SyncResult = {
        filename: entry.workflow_file,
        workflowName: entry.workflow_name,
        action: "no_change",
      };

      try {
        // Skip entries that were never imported
        if (!entry.n8n_workflow_id) {
          result.action = "no_change";
          progress.results.push(result);
          progress.synced++;
          continue;
        }

        // Check if workflow exists in n8n
        const n8nWorkflow = n8nWorkflowMap.get(entry.n8n_workflow_id);

        if (!n8nWorkflow) {
          // Workflow was deleted from n8n
          log.info("Workflow deleted from n8n, updating registry", {
            filename: entry.workflow_file,
            workflowId: entry.n8n_workflow_id,
          });

          await upsertWorkflowEntry({
            workflow_file: entry.workflow_file,
            workflow_name: entry.workflow_name, // Preserve existing name
            n8n_workflow_id: null,
            is_active: false,
            import_status: "pending",
            last_error: "Workflow was deleted from n8n instance",
          });

          result.action = "marked_deleted";
          result.previousStatus = entry.import_status;
          result.newStatus = "pending";
          progress.deleted++;
        } else if (n8nWorkflow.active !== entry.is_active) {
          // Active state changed in n8n
          log.info("Workflow active state changed in n8n, updating registry", {
            filename: entry.workflow_file,
            previousActive: entry.is_active,
            currentActive: n8nWorkflow.active,
          });

          await upsertWorkflowEntry({
            workflow_file: entry.workflow_file,
            workflow_name: entry.workflow_name, // Preserve existing name
            is_active: n8nWorkflow.active,
            last_error: null,
          });

          result.action = n8nWorkflow.active ? "marked_active" : "marked_inactive";
          result.previousStatus = entry.is_active ? "active" : "inactive";
          result.newStatus = n8nWorkflow.active ? "active" : "inactive";
          progress.stateChanged++;
        } else {
          result.action = "no_change";
        }

        progress.synced++;
        progress.results.push(result);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error("Failed to sync workflow entry", {
          filename: entry.workflow_file,
          error: errorMessage,
        });

        result.action = "error";
        result.error = errorMessage;
        progress.errors++;
        progress.results.push(result);
      }
    }

    log.info("Workflow registry sync complete", {
      total: progress.total,
      synced: progress.synced,
      deleted: progress.deleted,
      stateChanged: progress.stateChanged,
      errors: progress.errors,
    });

    return progress;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error("Failed to sync workflow registry", { error: errorMessage });
    throw error;
  }
}

// ============================================
// Registry Helper Functions
// ============================================

/**
 * Get all workflow registry entries that have been imported to n8n.
 *
 * @returns Array of registry entries with valid n8n workflow IDs
 */
export async function getImportedWorkflowIds(): Promise<
  Array<{ filename: string; n8nWorkflowId: string; workflowName: string }>
> {
  const entries = await query<WorkflowRegistryEntry>(
    `SELECT workflow_file, n8n_workflow_id, workflow_name
     FROM workflow_registry
     WHERE n8n_workflow_id IS NOT NULL`
  );

  return entries.map((e) => ({
    filename: e.workflow_file,
    n8nWorkflowId: e.n8n_workflow_id!,
    workflowName: e.workflow_name,
  }));
}

/**
 * Truncate the workflow registry table.
 *
 * This removes all entries from the registry, effectively resetting
 * the import state. Does NOT delete workflows from n8n.
 *
 * @returns Number of entries deleted
 */
export async function truncateWorkflowRegistry(): Promise<number> {
  log.info("Truncating workflow registry");

  const countResult = await queryOne<{ count: string }>(
    "SELECT COUNT(*)::text as count FROM workflow_registry"
  );
  const count = parseInt(countResult?.count || "0", 10);

  await execute("DELETE FROM workflow_registry");

  log.info("Workflow registry truncated", { deletedCount: count });
  return count;
}

/**
 * Get a map of bundled workflow names to filenames.
 *
 * Used for matching orphaned workflows in n8n to bundled workflow files.
 *
 * @returns Map from workflow name to filename
 */
export async function getBundledWorkflowNameMap(
  workflowsDir: string = DEFAULT_WORKFLOWS_DIR
): Promise<Map<string, string>> {
  const bundled = await getBundledWorkflows(workflowsDir);
  const map = new Map<string, string>();

  for (const workflow of bundled) {
    map.set(workflow.name, workflow.filename);
  }

  return map;
}

// ============================================
// Reset Operations
// ============================================

/**
 * Error that occurred while deleting a workflow.
 */
export interface DeleteError {
  workflowId: string;
  workflowName: string;
  filename: string;
  error: string;
}

/**
 * Result of the full reset operation.
 */
export interface ResetResult {
  success: boolean;
  mode: "soft" | "full";
  deletedFromN8n: number;
  deleteErrors: DeleteError[];
  clearedFromRegistry: number;
  settingsReset: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Delete all imported workflows from n8n.
 *
 * This function:
 * 1. Gets all workflows from the registry that have n8n IDs
 * 2. Deactivates each workflow (to prevent errors)
 * 3. Deletes each workflow from n8n
 *
 * Continues on error for individual workflows to ensure as many
 * as possible are deleted.
 *
 * @param configOverride - Optional n8n API config
 * @returns Count of deleted workflows and any errors
 */
export async function deleteAllImportedWorkflows(
  configOverride?: N8nApiConfig
): Promise<{ deleted: number; errors: DeleteError[] }> {
  log.info("Deleting all imported workflows from n8n");

  const config = configOverride || (await getN8nConfig());
  if (!config) {
    throw new Error("n8n not configured");
  }

  const imported = await getImportedWorkflowIds();
  let deleted = 0;
  const errors: DeleteError[] = [];

  log.info("Found imported workflows to delete", { count: imported.length });

  for (const workflow of imported) {
    try {
      // First try to deactivate (ignore errors - might already be inactive)
      try {
        await deactivateWorkflow(workflow.n8nWorkflowId, config);
      } catch {
        // Ignore deactivation errors
      }

      // Delete the workflow
      await deleteWorkflow(workflow.n8nWorkflowId, config);
      deleted++;

      log.info("Deleted workflow from n8n", {
        filename: workflow.filename,
        workflowId: workflow.n8nWorkflowId,
      });

      // Brief delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check if workflow was already deleted (404)
      if (errorMessage.includes("404") || errorMessage.includes("not found")) {
        log.info("Workflow already deleted from n8n", {
          filename: workflow.filename,
          workflowId: workflow.n8nWorkflowId,
        });
        deleted++; // Count as deleted since it doesn't exist
        continue;
      }

      log.error("Failed to delete workflow from n8n", {
        filename: workflow.filename,
        workflowId: workflow.n8nWorkflowId,
        error: errorMessage,
      });

      errors.push({
        workflowId: workflow.n8nWorkflowId,
        workflowName: workflow.workflowName,
        filename: workflow.filename,
        error: errorMessage,
      });
    }
  }

  log.info("Finished deleting workflows from n8n", {
    deleted,
    errors: errors.length,
    total: imported.length,
  });

  return { deleted, errors };
}

/**
 * Clear the workflow registry table.
 *
 * This is a wrapper around truncateWorkflowRegistry for semantic clarity.
 *
 * @returns Number of entries cleared
 */
export async function clearWorkflowRegistry(): Promise<number> {
  return truncateWorkflowRegistry();
}

/**
 * Perform a full reset of the workflow setup.
 *
 * Modes:
 * - soft: Clear registry and settings only (workflows remain in n8n)
 * - full: Delete workflows from n8n, then clear registry and settings
 *
 * @param options.mode - Reset mode ("soft" or "full")
 * @param options.preserveN8nConfig - Keep n8n URL/API key (default: false for full)
 * @param options.onProgress - Optional progress callback
 * @returns Reset result with counts and any errors
 */
export async function performFullReset(options: {
  mode: "soft" | "full";
  preserveN8nConfig?: boolean;
  configOverride?: N8nApiConfig;
  onProgress?: (step: string, current: number, total: number) => void;
}): Promise<ResetResult> {
  const {
    mode,
    preserveN8nConfig = mode === "soft",
    onProgress,
  } = options;

  log.info("Performing workflow reset", { mode, preserveN8nConfig });

  const result: ResetResult = {
    success: false,
    mode,
    deletedFromN8n: 0,
    deleteErrors: [],
    clearedFromRegistry: 0,
    settingsReset: false,
    errors: [],
    warnings: [],
  };

  try {
    // For full reset, delete workflows from n8n first
    if (mode === "full") {
      onProgress?.("Deleting workflows from n8n", 0, 3);

      try {
        const config = options.configOverride || (await getN8nConfig());
        if (config) {
          const deleteResult = await deleteAllImportedWorkflows(config);
          result.deletedFromN8n = deleteResult.deleted;
          result.deleteErrors = deleteResult.errors;

          if (deleteResult.errors.length > 0) {
            result.warnings.push(
              `${deleteResult.errors.length} workflow(s) could not be deleted from n8n`
            );
          }
        } else {
          result.warnings.push(
            "n8n not configured - skipping workflow deletion from n8n instance"
          );
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.warnings.push(`Failed to delete workflows from n8n: ${errorMessage}`);
        log.warn("Failed to delete workflows from n8n during reset", { error: errorMessage });
      }
    }

    // Clear workflow registry
    onProgress?.("Clearing workflow registry", 1, 3);

    try {
      result.clearedFromRegistry = await clearWorkflowRegistry();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(`Failed to clear workflow registry: ${errorMessage}`);
      log.error("Failed to clear workflow registry during reset", { error: errorMessage });
    }

    // Reset settings (import dynamically to avoid circular dependency)
    onProgress?.("Resetting settings", 2, 3);

    try {
      const { resetAllSettings } = await import("@/lib/settings");
      await resetAllSettings({ preserveN8nConfig });
      result.settingsReset = true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(`Failed to reset settings: ${errorMessage}`);
      log.error("Failed to reset settings during reset", { error: errorMessage });
    }

    onProgress?.("Complete", 3, 3);

    // Determine overall success
    result.success = result.errors.length === 0;

    log.info("Workflow reset complete", {
      mode,
      success: result.success,
      deletedFromN8n: result.deletedFromN8n,
      clearedFromRegistry: result.clearedFromRegistry,
      settingsReset: result.settingsReset,
      errors: result.errors.length,
      warnings: result.warnings.length,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(`Reset failed: ${errorMessage}`);
    log.error("Workflow reset failed", { error: errorMessage });
    return result;
  }
}

// ============================================
// Orphan Detection
// ============================================

/**
 * A workflow that exists in n8n but is not tracked in the registry.
 */
export interface OrphanedWorkflow {
  n8nWorkflowId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  matchesBundled: boolean;
  matchedFilename?: string;
  suggestedAction: "ignore" | "import" | "investigate";
}

/**
 * Detect workflows in n8n that are not tracked in the registry.
 *
 * These "orphaned" workflows might be:
 * - Manually created workflows (action: ignore)
 * - Product Factory workflows created outside this dashboard (action: import)
 * - Leftover workflows from previous installations (action: investigate)
 *
 * @param configOverride - Optional n8n API config
 * @param workflowsDir - Directory containing bundled workflows
 * @returns Array of orphaned workflows with suggested actions
 */
export async function detectOrphanedWorkflows(
  configOverride?: N8nApiConfig,
  workflowsDir: string = DEFAULT_WORKFLOWS_DIR
): Promise<OrphanedWorkflow[]> {
  log.info("Detecting orphaned workflows in n8n");

  const config = configOverride || (await getN8nConfig());
  if (!config) {
    throw new Error("n8n not configured");
  }

  // Get all workflows from n8n
  const n8nWorkflows = await listWorkflows(config);

  // Get tracked workflow IDs from registry
  const registry = await getWorkflowRegistry();
  const trackedIds = new Set(
    registry
      .filter((e) => e.n8n_workflow_id)
      .map((e) => e.n8n_workflow_id)
  );

  // Get bundled workflow names for matching
  const bundledNameMap = await getBundledWorkflowNameMap(workflowsDir);

  // Find orphaned workflows
  const orphans: OrphanedWorkflow[] = [];

  for (const workflow of n8nWorkflows) {
    if (trackedIds.has(workflow.id)) {
      continue; // Already tracked
    }

    // Check if name matches a bundled workflow
    const matchedFilename = bundledNameMap.get(workflow.name);
    const matchesBundled = !!matchedFilename;

    // Determine suggested action
    let suggestedAction: OrphanedWorkflow["suggestedAction"];
    if (matchesBundled) {
      // Name matches a Product Factory workflow - likely needs to be imported
      suggestedAction = "import";
    } else if (workflow.name.includes("AI Product Factory") || workflow.name.includes("ai-product-factory")) {
      // Name contains Product Factory keywords but doesn't match exactly
      suggestedAction = "investigate";
    } else {
      // Unrelated workflow - ignore
      suggestedAction = "ignore";
    }

    orphans.push({
      n8nWorkflowId: workflow.id,
      name: workflow.name,
      isActive: workflow.active,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
      matchesBundled,
      matchedFilename,
      suggestedAction,
    });
  }

  log.info("Orphan detection complete", {
    totalInN8n: n8nWorkflows.length,
    tracked: trackedIds.size,
    orphans: orphans.length,
    toImport: orphans.filter((o) => o.suggestedAction === "import").length,
    toInvestigate: orphans.filter((o) => o.suggestedAction === "investigate").length,
    toIgnore: orphans.filter((o) => o.suggestedAction === "ignore").length,
  });

  return orphans;
}

// ============================================
// Conflict Detection
// ============================================

/**
 * A conflict between local workflow file and n8n state.
 */
export interface WorkflowConflict {
  filename: string;
  workflowName: string;
  n8nWorkflowId: string;
  conflictType: "content_mismatch" | "name_conflict" | "missing_in_n8n";
  details: string;
}

/**
 * Detect conflicts between local workflow files and n8n instance.
 *
 * Conflict types:
 * - content_mismatch: Checksum differs between registry and local file
 * - name_conflict: Same name exists in n8n but different workflow ID
 * - missing_in_n8n: Tracked in registry but not found in n8n
 *
 * @param configOverride - Optional n8n API config
 * @param workflowsDir - Directory containing bundled workflows
 * @returns Array of detected conflicts
 */
export async function detectWorkflowConflicts(
  configOverride?: N8nApiConfig,
  workflowsDir: string = DEFAULT_WORKFLOWS_DIR
): Promise<WorkflowConflict[]> {
  log.info("Detecting workflow conflicts");

  const config = configOverride || (await getN8nConfig());
  if (!config) {
    throw new Error("n8n not configured");
  }

  const conflicts: WorkflowConflict[] = [];

  // Get bundled workflows
  const bundled = await getBundledWorkflows(workflowsDir);

  // Get registry
  const registry = await getWorkflowRegistry();

  // Get all workflows from n8n
  const n8nWorkflows = await listWorkflows(config);
  const n8nByName = new Map<string, N8nWorkflow>();
  const n8nById = new Map<string, N8nWorkflow>();

  for (const workflow of n8nWorkflows) {
    n8nByName.set(workflow.name, workflow);
    n8nById.set(workflow.id, workflow);
  }

  for (const workflow of bundled) {
    const entry = registry.find((r) => r.workflow_file === workflow.filename);

    if (!entry || !entry.n8n_workflow_id) {
      // Not imported yet - not a conflict
      continue;
    }

    // Check if workflow exists in n8n by ID
    const n8nWorkflow = n8nById.get(entry.n8n_workflow_id);

    if (!n8nWorkflow) {
      // Tracked but not found in n8n
      conflicts.push({
        filename: workflow.filename,
        workflowName: workflow.name,
        n8nWorkflowId: entry.n8n_workflow_id,
        conflictType: "missing_in_n8n",
        details: `Workflow with ID ${entry.n8n_workflow_id} not found in n8n (may have been deleted)`,
      });
      continue;
    }

    // Check for name conflicts
    const workflowByName = n8nByName.get(workflow.name);
    if (workflowByName && workflowByName.id !== entry.n8n_workflow_id) {
      conflicts.push({
        filename: workflow.filename,
        workflowName: workflow.name,
        n8nWorkflowId: entry.n8n_workflow_id,
        conflictType: "name_conflict",
        details: `Workflow name "${workflow.name}" exists with different ID: ${workflowByName.id} vs tracked ${entry.n8n_workflow_id}`,
      });
    }

    // Check for content mismatch (local file changed)
    if (entry.local_checksum && entry.local_checksum !== workflow.localVersion) {
      conflicts.push({
        filename: workflow.filename,
        workflowName: workflow.name,
        n8nWorkflowId: entry.n8n_workflow_id,
        conflictType: "content_mismatch",
        details: `Local file changed (registry: ${entry.local_checksum.substring(0, 8)}, file: ${workflow.localVersion.substring(0, 8)})`,
      });
    }
  }

  log.info("Conflict detection complete", {
    totalWorkflows: bundled.length,
    conflicts: conflicts.length,
    contentMismatches: conflicts.filter((c) => c.conflictType === "content_mismatch").length,
    nameConflicts: conflicts.filter((c) => c.conflictType === "name_conflict").length,
    missingInN8n: conflicts.filter((c) => c.conflictType === "missing_in_n8n").length,
  });

  return conflicts;
}

// ============================================
// Enhanced Sync (with orphan detection)
// ============================================

/**
 * Enhanced sync progress with orphan and conflict information.
 */
export interface EnhancedSyncProgress extends SyncProgress {
  orphans: OrphanedWorkflow[];
  conflicts: WorkflowConflict[];
  pulled: number;
  mode: "detect" | "pull" | "reconcile";
}

/**
 * Enhanced workflow registry sync with orphan and conflict detection.
 *
 * Modes:
 * - detect (default): Read-only, report orphans and conflicts
 * - pull: Add orphaned workflows that match bundled names to registry
 * - reconcile: Pull + update registry to match n8n state (mark deleted, etc.)
 *
 * @param options.mode - Sync mode
 * @param options.includeOrphans - Whether to detect orphans (default: true)
 * @param options.configOverride - Optional n8n API config
 * @param options.workflowsDir - Directory containing bundled workflows
 * @returns Enhanced sync progress with orphan and conflict info
 */
export async function enhancedSyncWorkflowRegistry(options: {
  mode?: "detect" | "pull" | "reconcile";
  includeOrphans?: boolean;
  configOverride?: N8nApiConfig;
  workflowsDir?: string;
} = {}): Promise<EnhancedSyncProgress> {
  const {
    mode = "detect",
    includeOrphans = true,
    workflowsDir = DEFAULT_WORKFLOWS_DIR,
  } = options;

  log.info("Starting enhanced workflow registry sync", { mode, includeOrphans });

  // First, run the basic sync
  const basicSync = await syncWorkflowRegistry({
    configOverride: options.configOverride,
  });

  const progress: EnhancedSyncProgress = {
    ...basicSync,
    orphans: [],
    conflicts: [],
    pulled: 0,
    mode,
  };

  const config = options.configOverride || (await getN8nConfig());
  if (!config) {
    throw new Error("n8n not configured");
  }

  // Detect conflicts
  try {
    progress.conflicts = await detectWorkflowConflicts(config, workflowsDir);
  } catch (error) {
    log.error("Failed to detect conflicts during enhanced sync", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Detect orphans if requested
  if (includeOrphans) {
    try {
      progress.orphans = await detectOrphanedWorkflows(config, workflowsDir);
    } catch (error) {
      log.error("Failed to detect orphans during enhanced sync", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // In pull or reconcile mode, add matching orphans to registry
  if ((mode === "pull" || mode === "reconcile") && progress.orphans.length > 0) {
    const orphansToImport = progress.orphans.filter(
      (o) => o.suggestedAction === "import" && o.matchedFilename
    );

    log.info("Pulling orphaned workflows into registry", {
      count: orphansToImport.length,
    });

    for (const orphan of orphansToImport) {
      try {
        // Read the local workflow file to get checksum
        const fileData = await readWorkflowFile(orphan.matchedFilename!, workflowsDir);

        // Add to registry
        await upsertWorkflowEntry({
          workflow_file: orphan.matchedFilename!,
          workflow_name: orphan.name,
          n8n_workflow_id: orphan.n8nWorkflowId,
          local_version: fileData.checksum.substring(0, 8),
          local_checksum: fileData.checksum,
          webhook_paths: extractWebhookPaths(fileData.workflow),
          is_active: orphan.isActive,
          import_status: "imported",
          last_import_at: new Date(),
          last_error: null,
        });

        progress.pulled++;

        log.info("Pulled orphaned workflow into registry", {
          filename: orphan.matchedFilename,
          workflowId: orphan.n8nWorkflowId,
        });
      } catch (error) {
        log.error("Failed to pull orphaned workflow into registry", {
          filename: orphan.matchedFilename,
          workflowId: orphan.n8nWorkflowId,
          error: error instanceof Error ? error.message : String(error),
        });
        progress.errors++;
      }
    }
  }

  // In reconcile mode, also handle deleted/missing workflows
  if (mode === "reconcile") {
    const missingConflicts = progress.conflicts.filter(
      (c) => c.conflictType === "missing_in_n8n"
    );

    for (const conflict of missingConflicts) {
      try {
        // Mark as deleted in registry
        await upsertWorkflowEntry({
          workflow_file: conflict.filename,
          n8n_workflow_id: null,
          is_active: false,
          import_status: "pending",
          last_error: "Workflow was deleted from n8n instance (reconciled)",
        });

        progress.deleted++;

        log.info("Reconciled missing workflow", {
          filename: conflict.filename,
          previousId: conflict.n8nWorkflowId,
        });
      } catch (error) {
        log.error("Failed to reconcile missing workflow", {
          filename: conflict.filename,
          error: error instanceof Error ? error.message : String(error),
        });
        progress.errors++;
      }
    }
  }

  log.info("Enhanced workflow registry sync complete", {
    mode,
    total: progress.total,
    synced: progress.synced,
    deleted: progress.deleted,
    stateChanged: progress.stateChanged,
    orphans: progress.orphans.length,
    conflicts: progress.conflicts.length,
    pulled: progress.pulled,
    errors: progress.errors,
  });

  return progress;
}
