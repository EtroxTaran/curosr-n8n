import logger from "@/lib/logger";
import { getN8nConfig } from "@/lib/settings";

/**
 * n8n REST API client for workflow management.
 *
 * This module provides functions to interact with the n8n Public API
 * for creating, updating, and managing workflows programmatically.
 *
 * API Documentation: https://docs.n8n.io/api/api-reference/
 */

const log = logger.child({ component: "n8n-api" });

// ============================================
// Types
// ============================================

export interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  versionId?: string;
  createdAt: string;
  updatedAt: string;
  nodes?: N8nNode[];
  connections?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  staticData?: Record<string, unknown>;
  tags?: Array<{ id: string; name: string }>;
}

export interface N8nNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, unknown>;
  credentials?: Record<string, unknown>;
}

export interface WorkflowDefinition {
  name: string;
  nodes: N8nNode[];
  connections: Record<string, unknown>;
  settings?: Record<string, unknown>;
  staticData?: Record<string, unknown>;
  tags?: string[];
}

export interface N8nApiConfig {
  apiUrl: string;
  apiKey: string;
}

export interface N8nConnectionTestResult {
  success: boolean;
  version?: string;
  instanceId?: string;
  publicApi?: boolean;
  error?: string;
}

export interface N8nApiError extends Error {
  statusCode?: number;
  response?: unknown;
}

// ============================================
// API Client
// ============================================

/**
 * Make an authenticated request to the n8n API.
 */
async function n8nFetch<T>(
  config: N8nApiConfig,
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${config.apiUrl}/api/v1${endpoint}`;

  const headers: HeadersInit = {
    "X-N8N-API-KEY": config.apiKey,
    "Content-Type": "application/json",
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = await response.text();
    }

    // Extract human-readable error message from n8n response
    let errorDetail = "";
    if (typeof errorBody === "object" && errorBody !== null) {
      const errObj = errorBody as Record<string, unknown>;
      errorDetail = (errObj.message || errObj.error || errObj.reason || "") as string;
      if (!errorDetail && errObj.errors && Array.isArray(errObj.errors)) {
        // n8n sometimes returns errors as an array
        errorDetail = errObj.errors.map((e: unknown) =>
          typeof e === "object" && e !== null ? (e as Record<string, unknown>).message || JSON.stringify(e) : String(e)
        ).join("; ");
      }
    } else if (typeof errorBody === "string") {
      errorDetail = errorBody;
    }

    const error = new Error(
      `n8n API error: ${response.status} ${response.statusText}${errorDetail ? ` - ${errorDetail}` : ""}`
    ) as N8nApiError;
    error.statusCode = response.status;
    error.response = errorBody;

    log.error("n8n API request failed", {
      endpoint,
      status: response.status,
      statusText: response.statusText,
      errorDetail: errorDetail || "(no detail)",
      errorBody: typeof errorBody === "object" ? JSON.stringify(errorBody) : errorBody,
    });

    throw error;
  }

  return response.json();
}

/**
 * Test connection to n8n instance.
 * Verifies URL is reachable and API key is valid.
 */
export async function testConnection(
  apiUrl: string,
  apiKey: string
): Promise<N8nConnectionTestResult> {
  try {
    // First, check if the instance is reachable
    const healthResponse = await fetch(`${apiUrl}/healthz`, {
      method: "GET",
      signal: AbortSignal.timeout(10000),
    });

    if (!healthResponse.ok) {
      return {
        success: false,
        error: `n8n instance not reachable (status: ${healthResponse.status})`,
      };
    }

    // Now test API access
    const config: N8nApiConfig = { apiUrl, apiKey };

    // Try to list workflows - this validates the API key
    const workflows = await n8nFetch<{ data: N8nWorkflow[] }>(
      config,
      "/workflows?limit=1"
    );

    // Try to get instance info if available
    let version: string | undefined;
    let instanceId: string | undefined;
    try {
      // Note: This endpoint may not be available on all n8n versions
      const about = await n8nFetch<{
        version?: string;
        instanceId?: string;
        publicApi?: boolean;
      }>(config, "/");
      version = about.version;
      instanceId = about.instanceId;
    } catch {
      // Info endpoint not available, that's OK
    }

    log.info("n8n connection test successful", {
      apiUrl,
      version,
      workflowsAccessible: Array.isArray(workflows.data),
    });

    return {
      success: true,
      version,
      instanceId,
      publicApi: true,
    };
  } catch (error) {
    const apiError = error as N8nApiError;

    if (apiError.statusCode === 401 || apiError.statusCode === 403) {
      return {
        success: false,
        error: "Invalid API key or insufficient permissions",
      };
    }

    if (apiError.name === "AbortError" || apiError.name === "TimeoutError") {
      return {
        success: false,
        error: "Connection timeout - n8n instance not reachable",
      };
    }

    log.error("n8n connection test failed", { error });
    return {
      success: false,
      error: apiError.message || "Unknown error",
    };
  }
}

/**
 * Get n8n config from database and create client functions.
 * Throws if n8n is not configured.
 */
async function getConfigOrThrow(): Promise<N8nApiConfig> {
  const config = await getN8nConfig();
  if (!config) {
    throw new Error("n8n is not configured. Please complete the setup wizard.");
  }
  return config;
}

// ============================================
// Workflow Operations
// ============================================

/**
 * List all workflows in n8n.
 */
export async function listWorkflows(
  configOverride?: N8nApiConfig
): Promise<N8nWorkflow[]> {
  const config = configOverride || (await getConfigOrThrow());
  const response = await n8nFetch<{ data: N8nWorkflow[] }>(
    config,
    "/workflows"
  );
  return response.data;
}

/**
 * Get a specific workflow by ID.
 */
export async function getWorkflow(
  workflowId: string,
  configOverride?: N8nApiConfig
): Promise<N8nWorkflow> {
  const config = configOverride || (await getConfigOrThrow());
  return n8nFetch<N8nWorkflow>(config, `/workflows/${workflowId}`);
}

/**
 * Strip read-only fields from workflow before sending to n8n API.
 * The tags field is read-only and will cause a 400 error if included.
 */
function stripReadOnlyFields(workflow: WorkflowDefinition | Partial<WorkflowDefinition>): Omit<typeof workflow, 'tags'> {
  const { tags: _tags, ...cleanWorkflow } = workflow;
  return cleanWorkflow;
}

/**
 * Create a new workflow.
 */
export async function createWorkflow(
  workflow: WorkflowDefinition,
  configOverride?: N8nApiConfig
): Promise<N8nWorkflow> {
  const config = configOverride || (await getConfigOrThrow());

  log.info("Creating workflow", { name: workflow.name });

  // Strip read-only fields like tags before sending
  const cleanWorkflow = stripReadOnlyFields(workflow);

  return n8nFetch<N8nWorkflow>(config, "/workflows", {
    method: "POST",
    body: JSON.stringify(cleanWorkflow),
  });
}

/**
 * Update an existing workflow.
 */
export async function updateWorkflow(
  workflowId: string,
  workflow: Partial<WorkflowDefinition>,
  configOverride?: N8nApiConfig
): Promise<N8nWorkflow> {
  const config = configOverride || (await getConfigOrThrow());

  log.info("Updating workflow", { id: workflowId, name: workflow.name });

  // Strip read-only fields like tags before sending
  const cleanWorkflow = stripReadOnlyFields(workflow);

  return n8nFetch<N8nWorkflow>(config, `/workflows/${workflowId}`, {
    method: "PUT",
    body: JSON.stringify(cleanWorkflow),
  });
}

/**
 * Delete a workflow.
 */
export async function deleteWorkflow(
  workflowId: string,
  configOverride?: N8nApiConfig
): Promise<void> {
  const config = configOverride || (await getConfigOrThrow());

  log.info("Deleting workflow", { id: workflowId });

  await n8nFetch<void>(config, `/workflows/${workflowId}`, {
    method: "DELETE",
  });
}

/**
 * Activate a workflow.
 */
export async function activateWorkflow(
  workflowId: string,
  configOverride?: N8nApiConfig
): Promise<N8nWorkflow> {
  const config = configOverride || (await getConfigOrThrow());

  log.info("Activating workflow", { id: workflowId });

  return n8nFetch<N8nWorkflow>(config, `/workflows/${workflowId}/activate`, {
    method: "POST",
  });
}

/**
 * Deactivate a workflow.
 */
export async function deactivateWorkflow(
  workflowId: string,
  configOverride?: N8nApiConfig
): Promise<N8nWorkflow> {
  const config = configOverride || (await getConfigOrThrow());

  log.info("Deactivating workflow", { id: workflowId });

  return n8nFetch<N8nWorkflow>(config, `/workflows/${workflowId}/deactivate`, {
    method: "POST",
  });
}

/**
 * Find a workflow by name.
 */
export async function findWorkflowByName(
  name: string,
  configOverride?: N8nApiConfig
): Promise<N8nWorkflow | null> {
  const workflows = await listWorkflows(configOverride);
  return workflows.find((w) => w.name === name) || null;
}

// ============================================
// Health Check
// ============================================

/**
 * Check if n8n is healthy (basic connectivity).
 */
export async function healthCheck(
  configOverride?: N8nApiConfig
): Promise<boolean> {
  try {
    const config = configOverride || (await getN8nConfig());
    if (!config) {
      return false;
    }

    const response = await fetch(`${config.apiUrl}/healthz`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Perform a comprehensive health check of n8n API.
 */
export async function comprehensiveHealthCheck(
  configOverride?: N8nApiConfig
): Promise<{
  healthy: boolean;
  healthEndpoint: boolean;
  apiAccess: boolean;
  workflowCount: number;
  activeWorkflows: number;
  error?: string;
}> {
  const result = {
    healthy: false,
    healthEndpoint: false,
    apiAccess: false,
    workflowCount: 0,
    activeWorkflows: 0,
    error: undefined as string | undefined,
  };

  try {
    const config = configOverride || (await getN8nConfig());
    if (!config) {
      result.error = "n8n not configured";
      return result;
    }

    // Check health endpoint
    try {
      const healthResponse = await fetch(`${config.apiUrl}/healthz`, {
        signal: AbortSignal.timeout(5000),
      });
      result.healthEndpoint = healthResponse.ok;
    } catch {
      result.healthEndpoint = false;
    }

    // Check API access and get workflow counts
    try {
      const workflows = await listWorkflows(config);
      result.apiAccess = true;
      result.workflowCount = workflows.length;
      result.activeWorkflows = workflows.filter((w) => w.active).length;
    } catch (error) {
      result.apiAccess = false;
      result.error = (error as Error).message;
    }

    result.healthy = result.healthEndpoint && result.apiAccess;
    return result;
  } catch (error) {
    result.error = (error as Error).message;
    return result;
  }
}

// ============================================
// Batch Operations (Two-Phase Import Support)
// ============================================

/**
 * Activate workflow with retry logic.
 *
 * n8n sometimes needs time to "publish" subworkflows before parent workflows
 * can successfully reference them. This function retries activation with
 * exponential backoff.
 *
 * @param workflowId - The workflow ID to activate
 * @param configOverride - Optional API config override
 * @param options - Retry options
 * @returns The activated workflow
 */
export async function activateWorkflowWithRetry(
  workflowId: string,
  configOverride?: N8nApiConfig,
  options: {
    maxRetries?: number;
    initialDelayMs?: number;
  } = {}
): Promise<N8nWorkflow> {
  // Increased defaults: 5 retries starting at 2 seconds
  const { maxRetries = 5, initialDelayMs = 2000 } = options;
  const config = configOverride || (await getConfigOrThrow());

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await activateWorkflow(workflowId, config);
      if (attempt > 0) {
        log.info("Workflow activated after retry", { workflowId, attempt });
      }
      return result;
    } catch (error) {
      lastError = error as Error;
      // Check for subworkflow dependency errors
      const isSubworkflowError =
        lastError.message.includes("not published") ||
        lastError.message.includes("references workflow") ||
        lastError.message.includes("Cannot publish workflow");

      if (attempt < maxRetries && isSubworkflowError) {
        const delay = initialDelayMs * Math.pow(2, attempt);
        log.warn("Activation failed due to subworkflow dependency, retrying", {
          workflowId,
          attempt: attempt + 1,
          maxRetries,
          delayMs: delay,
          error: lastError.message,
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        break;
      }
    }
  }

  throw lastError;
}

// ============================================
// Webhook URL Extraction
// ============================================

/**
 * Extract webhook paths from a workflow definition.
 */
export function extractWebhookPaths(workflow: WorkflowDefinition): string[] {
  const webhooks: string[] = [];

  for (const node of workflow.nodes) {
    if (node.type === "n8n-nodes-base.webhook") {
      const path = node.parameters?.path as string | undefined;
      if (path) {
        // Normalize path
        const normalizedPath = path.startsWith("/") ? path : `/${path}`;
        webhooks.push(`/webhook${normalizedPath}`);
      }
    }

    // Also check for form triggers
    if (node.type === "n8n-nodes-base.formTrigger") {
      const path = node.parameters?.path as string | undefined;
      if (path) {
        const normalizedPath = path.startsWith("/") ? path : `/${path}`;
        webhooks.push(`/form${normalizedPath}`);
      }
    }

    // Chat trigger
    if (node.type === "@n8n/n8n-nodes-langchain.chatTrigger") {
      const path = node.parameters?.path as string | undefined;
      if (path) {
        const normalizedPath = path.startsWith("/") ? path : `/${path}`;
        webhooks.push(`/webhook${normalizedPath}`);
      }
    }
  }

  return webhooks;
}

/**
 * Get webhook URLs for a workflow in n8n.
 */
export async function getWorkflowWebhooks(
  workflowId: string,
  configOverride?: N8nApiConfig
): Promise<string[]> {
  const config = configOverride || (await getConfigOrThrow());
  const workflow = await getWorkflow(workflowId, config);

  if (!workflow.nodes) {
    return [];
  }

  const webhookPaths = extractWebhookPaths({
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections || {},
  });

  // Combine with base URL
  const baseUrl = config.apiUrl;
  return webhookPaths.map((path) => `${baseUrl}${path}`);
}
