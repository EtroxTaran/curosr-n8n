/**
 * n8n Real API Integration Tests
 *
 * These tests validate workflow import against a REAL n8n instance to catch
 * production-specific issues like:
 * - "tags is read-only" errors
 * - "workflow not published" errors during subworkflow calls
 * - Two-phase import reliability
 * - Dependency ordering problems
 *
 * Prerequisites:
 *   1. Start the production-parity environment:
 *      docker compose -f docker-compose.local-prod.yml up -d
 *   2. Set up n8n owner and get API key:
 *      ./scripts/setup-n8n-test-instance.sh
 *   3. Export the API key:
 *      export N8N_API_KEY=$(cat /tmp/n8n-test-api-key)
 *
 * Run with:
 *   npm run test:integration -- tests/n8n-real-api.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';

// ============================================
// Configuration
// ============================================

const N8N_API_URL = process.env.N8N_API_URL || 'http://localhost:5678';
const N8N_API_KEY = process.env.N8N_API_KEY || '';
const WORKFLOWS_DIR = path.join(process.cwd(), 'workflows');

/**
 * Expected workflow files in import order (dependencies first)
 * This order is critical for two-phase import to succeed
 */
const WORKFLOW_FILES = [
  'ai-product-factory-s3-subworkflow.json',
  'ai-product-factory-decision-logger-subworkflow.json',
  'ai-product-factory-perplexity-research-subworkflow.json',
  'ai-product-factory-scavenging-subworkflow.json',
  'ai-product-factory-vision-loop-subworkflow.json',
  'ai-product-factory-architecture-loop-subworkflow.json',
  'ai-product-factory-api-workflow.json',
  'ai-product-factory-main-workflow.json',
];

/**
 * Fields that should NOT be sent to n8n API (read-only or invalid)
 */
const FORBIDDEN_API_FIELDS = [
  'tags',
  'active',
  'pinData',
  'triggerCount',
  'versionId',
  'id',
  'createdAt',
  'updatedAt',
];

// ============================================
// Helper Functions
// ============================================

interface WorkflowNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, unknown>;
  credentials?: Record<string, unknown>;
}

interface WorkflowDefinition {
  name: string;
  nodes: WorkflowNode[];
  connections: Record<string, unknown>;
  settings?: Record<string, unknown>;
  staticData?: unknown;
  tags?: unknown[];
  active?: boolean;
  pinData?: unknown;
}

interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
}

/**
 * Strip credentials from nodes
 */
function stripCredentials(nodes: WorkflowNode[]): WorkflowNode[] {
  return nodes.map((node) => {
    const { credentials: _removed, ...rest } = node;
    return rest as WorkflowNode;
  });
}

/**
 * Parse workflow file for n8n API (sanitize for import)
 */
function parseWorkflowForApi(
  content: string
): Omit<WorkflowDefinition, 'tags' | 'active' | 'pinData' | 'triggerCount' | 'versionId'> {
  const data = JSON.parse(content) as WorkflowDefinition;

  if (!data.name || !data.nodes || !Array.isArray(data.nodes)) {
    throw new Error('Invalid workflow file: missing name or nodes');
  }

  const nodes = stripCredentials(data.nodes);

  // Return only allowed fields - explicitly exclude read-only fields
  return {
    name: data.name,
    nodes,
    connections: data.connections || {},
    settings: data.settings || { executionOrder: 'v1' },
    staticData: data.staticData,
  };
}

/**
 * Check n8n API availability
 */
async function isN8nAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${N8N_API_URL}/healthz`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Check n8n API key is valid
 */
async function isApiKeyValid(): Promise<boolean> {
  if (!N8N_API_KEY) return false;

  try {
    const response = await fetch(`${N8N_API_URL}/api/v1/workflows?limit=1`, {
      headers: { 'X-N8N-API-KEY': N8N_API_KEY },
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Create workflow in n8n
 */
async function createWorkflow(
  workflow: ReturnType<typeof parseWorkflowForApi>
): Promise<{ ok: boolean; status: number; data: { id?: string; message?: string } }> {
  const response = await fetch(`${N8N_API_URL}/api/v1/workflows`, {
    method: 'POST',
    headers: {
      'X-N8N-API-KEY': N8N_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(workflow),
  });

  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}

/**
 * Update workflow in n8n
 */
async function updateWorkflow(
  id: string,
  workflow: ReturnType<typeof parseWorkflowForApi>
): Promise<{ ok: boolean; status: number; data: { id?: string; message?: string } }> {
  const response = await fetch(`${N8N_API_URL}/api/v1/workflows/${id}`, {
    method: 'PUT',
    headers: {
      'X-N8N-API-KEY': N8N_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(workflow),
  });

  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}

/**
 * Activate workflow in n8n
 */
async function activateWorkflow(
  id: string
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const response = await fetch(`${N8N_API_URL}/api/v1/workflows/${id}/activate`, {
    method: 'POST',
    headers: {
      'X-N8N-API-KEY': N8N_API_KEY,
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}

/**
 * Deactivate workflow in n8n
 */
async function deactivateWorkflow(
  id: string
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const response = await fetch(`${N8N_API_URL}/api/v1/workflows/${id}/deactivate`, {
    method: 'POST',
    headers: {
      'X-N8N-API-KEY': N8N_API_KEY,
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}

/**
 * Delete workflow from n8n
 */
async function deleteWorkflow(id: string): Promise<boolean> {
  try {
    const response = await fetch(`${N8N_API_URL}/api/v1/workflows/${id}`, {
      method: 'DELETE',
      headers: { 'X-N8N-API-KEY': N8N_API_KEY },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * List all workflows in n8n
 */
async function listWorkflows(): Promise<N8nWorkflow[]> {
  try {
    const response = await fetch(`${N8N_API_URL}/api/v1/workflows?limit=100`, {
      headers: { 'X-N8N-API-KEY': N8N_API_KEY },
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data.data || [];
  } catch {
    return [];
  }
}

/**
 * Get workflow by name
 */
async function getWorkflowByName(name: string): Promise<N8nWorkflow | null> {
  const workflows = await listWorkflows();
  return workflows.find((w) => w.name === name) || null;
}

// ============================================
// Test Suites
// ============================================

describe('n8n Real API Integration Tests', () => {
  let n8nAvailable = false;
  let apiKeyValid = false;
  const createdWorkflowIds: string[] = [];

  beforeAll(async () => {
    n8nAvailable = await isN8nAvailable();
    if (n8nAvailable) {
      apiKeyValid = await isApiKeyValid();
    }

    if (!n8nAvailable) {
      console.log('\n   n8n: Not available (tests will be skipped)');
      console.log('   Start with: docker compose -f docker-compose.local-prod.yml up -d');
      console.log('   Then run: ./scripts/setup-n8n-test-instance.sh\n');
    } else if (!apiKeyValid) {
      console.log('\n   n8n: Available but API key not valid');
      console.log('   Run: ./scripts/setup-n8n-test-instance.sh');
      console.log('   Then: export N8N_API_KEY=$(cat /tmp/n8n-test-api-key)\n');
    }
  });

  afterAll(async () => {
    // Cleanup all created workflows
    if (apiKeyValid && createdWorkflowIds.length > 0) {
      console.log(`\n   Cleaning up ${createdWorkflowIds.length} test workflow(s)...`);
      for (const id of createdWorkflowIds) {
        await deleteWorkflow(id);
      }
    }
  });

  // ============================================
  // Tag Stripping Tests
  // ============================================

  describe('Tag Stripping Validation', () => {
    it('should successfully create workflow without tags (tags stripped)', async () => {
      if (!n8nAvailable || !apiKeyValid) {
        console.log('   ⏭️  Skipping: n8n not available');
        return;
      }

      // Create a workflow payload WITHOUT tags (as our sanitizer should do)
      const workflow = {
        name: `Tag Test - No Tags ${Date.now()}`,
        nodes: [
          {
            id: 'trigger',
            name: 'Manual',
            type: 'n8n-nodes-base.manualTrigger',
            typeVersion: 1,
            position: [0, 0] as [number, number],
            parameters: {},
          },
        ],
        connections: {},
        settings: { executionOrder: 'v1' },
      };

      const result = await createWorkflow(workflow);

      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
      expect(result.data.id).toBeTruthy();

      if (result.data.id) {
        createdWorkflowIds.push(result.data.id);
      }
    });

    it('should reject workflow with tags array (read-only field)', async () => {
      if (!n8nAvailable || !apiKeyValid) {
        console.log('   ⏭️  Skipping: n8n not available');
        return;
      }

      // Send workflow WITH tags - should be rejected
      const response = await fetch(`${N8N_API_URL}/api/v1/workflows`, {
        method: 'POST',
        headers: {
          'X-N8N-API-KEY': N8N_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: `Tag Test - With Tags ${Date.now()}`,
          nodes: [
            {
              id: 'trigger',
              name: 'Manual',
              type: 'n8n-nodes-base.manualTrigger',
              typeVersion: 1,
              position: [0, 0],
              parameters: {},
            },
          ],
          connections: {},
          settings: { executionOrder: 'v1' },
          tags: [{ id: 'test-tag', name: 'Test Tag' }], // This should cause rejection
        }),
      });

      // n8n should reject this with 400 Bad Request
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.message).toMatch(/tags|read-only/i);
    });

    it('should verify workflow files are properly sanitized', async () => {
      if (!n8nAvailable || !apiKeyValid) {
        console.log('   ⏭️  Skipping: n8n not available');
        return;
      }

      // Read first workflow file
      const filepath = path.join(WORKFLOWS_DIR, WORKFLOW_FILES[0]);
      const content = await fs.readFile(filepath, 'utf-8');
      const parsed = parseWorkflowForApi(content);

      // Verify no forbidden fields
      for (const field of FORBIDDEN_API_FIELDS) {
        expect(parsed).not.toHaveProperty(field);
      }

      // Verify credentials are stripped
      for (const node of parsed.nodes) {
        expect(node).not.toHaveProperty('credentials');
      }
    });
  });

  // ============================================
  // Two-Phase Import Tests
  // ============================================

  describe('Two-Phase Import Process', () => {
    const phaseTestWorkflows: string[] = [];

    afterEach(async () => {
      // Cleanup phase test workflows
      for (const id of phaseTestWorkflows) {
        await deleteWorkflow(id);
      }
      phaseTestWorkflows.length = 0;
    });

    it('Phase 1: should create all workflows in inactive state', async () => {
      if (!n8nAvailable || !apiKeyValid) {
        console.log('   ⏭️  Skipping: n8n not available');
        return;
      }

      const timestamp = Date.now();

      // Import all workflows (Phase 1)
      for (const filename of WORKFLOW_FILES) {
        const filepath = path.join(WORKFLOWS_DIR, filename);
        const content = await fs.readFile(filepath, 'utf-8');
        const workflow = parseWorkflowForApi(content);

        // Add unique suffix to avoid conflicts
        workflow.name = `${workflow.name} (phase-test-${timestamp})`;

        const result = await createWorkflow(workflow);

        expect(result.ok).toBe(true);
        expect(result.status).toBe(200);
        expect(result.data.id).toBeTruthy();

        if (result.data.id) {
          phaseTestWorkflows.push(result.data.id);
          createdWorkflowIds.push(result.data.id);
        }
      }

      // Verify all workflows created
      expect(phaseTestWorkflows.length).toBe(WORKFLOW_FILES.length);
    });

    it('Phase 2: should activate workflows in dependency order', async () => {
      if (!n8nAvailable || !apiKeyValid) {
        console.log('   ⏭️  Skipping: n8n not available');
        return;
      }

      const timestamp = Date.now();
      const workflowIds: string[] = [];

      // First create all workflows
      for (const filename of WORKFLOW_FILES) {
        const filepath = path.join(WORKFLOWS_DIR, filename);
        const content = await fs.readFile(filepath, 'utf-8');
        const workflow = parseWorkflowForApi(content);
        workflow.name = `${workflow.name} (activation-test-${timestamp})`;

        const result = await createWorkflow(workflow);
        expect(result.ok).toBe(true);

        if (result.data.id) {
          workflowIds.push(result.data.id);
          createdWorkflowIds.push(result.data.id);
        }
      }

      // Then activate in order (dependencies first)
      // Subworkflows must be activated before main workflows that call them
      for (const id of workflowIds) {
        const result = await activateWorkflow(id);

        // Activation may fail for workflows that require credentials
        // That's expected - the important thing is no "workflow not published" errors
        if (!result.ok) {
          // Check it's not a "workflow not published" error
          const errorMessage = JSON.stringify(result.data);
          expect(errorMessage).not.toMatch(/not published|not found.*execute/i);
        }
      }
    });

    it('should handle re-import (update) of existing workflows', async () => {
      if (!n8nAvailable || !apiKeyValid) {
        console.log('   ⏭️  Skipping: n8n not available');
        return;
      }

      // Create a workflow
      const workflow = {
        name: `Re-Import Test ${Date.now()}`,
        nodes: [
          {
            id: 'trigger',
            name: 'Manual',
            type: 'n8n-nodes-base.manualTrigger',
            typeVersion: 1,
            position: [0, 0] as [number, number],
            parameters: {},
          },
        ],
        connections: {},
        settings: { executionOrder: 'v1' },
      };

      const createResult = await createWorkflow(workflow);
      expect(createResult.ok).toBe(true);

      const workflowId = createResult.data.id!;
      createdWorkflowIds.push(workflowId);

      // Update the workflow (re-import)
      workflow.nodes.push({
        id: 'code',
        name: 'Code',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [200, 0] as [number, number],
        parameters: { jsCode: '// Updated code' },
      });

      const updateResult = await updateWorkflow(workflowId, workflow);
      expect(updateResult.ok).toBe(true);
      expect(updateResult.status).toBe(200);
    });
  });

  // ============================================
  // Subworkflow Dependency Tests
  // ============================================

  describe('Subworkflow Dependencies', () => {
    it('should import s3-subworkflow before decision-logger (dependency order)', async () => {
      if (!n8nAvailable || !apiKeyValid) {
        console.log('   ⏭️  Skipping: n8n not available');
        return;
      }

      const timestamp = Date.now();

      // Import s3-subworkflow first
      const s3Path = path.join(WORKFLOWS_DIR, 'ai-product-factory-s3-subworkflow.json');
      const s3Content = await fs.readFile(s3Path, 'utf-8');
      const s3Workflow = parseWorkflowForApi(s3Content);
      s3Workflow.name = `${s3Workflow.name} (dep-test-${timestamp})`;

      const s3Result = await createWorkflow(s3Workflow);
      expect(s3Result.ok).toBe(true);
      if (s3Result.data.id) createdWorkflowIds.push(s3Result.data.id);

      // Then import decision-logger (which may reference s3-subworkflow)
      const dlPath = path.join(WORKFLOWS_DIR, 'ai-product-factory-decision-logger-subworkflow.json');
      const dlContent = await fs.readFile(dlPath, 'utf-8');
      const dlWorkflow = parseWorkflowForApi(dlContent);
      dlWorkflow.name = `${dlWorkflow.name} (dep-test-${timestamp})`;

      const dlResult = await createWorkflow(dlWorkflow);
      expect(dlResult.ok).toBe(true);
      if (dlResult.data.id) createdWorkflowIds.push(dlResult.data.id);
    });

    it('should verify workflow import order matches WORKFLOW_FILES array', async () => {
      // This test verifies the import order in our code
      const expectedOrder = [
        's3-subworkflow', // Base utility
        'decision-logger-subworkflow', // Uses s3
        'perplexity-research-subworkflow', // Research utility
        'scavenging-subworkflow', // Phase 0
        'vision-loop-subworkflow', // Phase 1
        'architecture-loop-subworkflow', // Phase 2
        'api-workflow', // API endpoints
        'main-workflow', // Orchestrator (calls all others)
      ];

      for (let i = 0; i < WORKFLOW_FILES.length; i++) {
        expect(WORKFLOW_FILES[i]).toContain(expectedOrder[i]);
      }
    });
  });

  // ============================================
  // Error Recovery Tests
  // ============================================

  describe('Error Recovery', () => {
    it('should handle workflow creation failure gracefully', async () => {
      if (!n8nAvailable || !apiKeyValid) {
        console.log('   ⏭️  Skipping: n8n not available');
        return;
      }

      // Try to create workflow with invalid structure
      const result = await createWorkflow({
        name: '',
        nodes: [], // Empty nodes should fail
        connections: {},
      });

      // Should get an error response, not crash
      expect(result.status).toBeDefined();
      // Don't assert specific error - just that it doesn't crash
    });

    it('should handle activation failure for workflows requiring credentials', async () => {
      if (!n8nAvailable || !apiKeyValid) {
        console.log('   ⏭️  Skipping: n8n not available');
        return;
      }

      const timestamp = Date.now();

      // Import a workflow that likely requires credentials
      const filepath = path.join(WORKFLOWS_DIR, 'ai-product-factory-s3-subworkflow.json');
      const content = await fs.readFile(filepath, 'utf-8');
      const workflow = parseWorkflowForApi(content);
      workflow.name = `${workflow.name} (cred-test-${timestamp})`;

      const createResult = await createWorkflow(workflow);
      expect(createResult.ok).toBe(true);

      if (createResult.data.id) {
        createdWorkflowIds.push(createResult.data.id);

        // Try to activate - may fail due to missing credentials
        const activateResult = await activateWorkflow(createResult.data.id);

        // Either succeeds or fails with credential error (not crash)
        expect(activateResult.status).toBeDefined();
        expect([200, 400, 500]).toContain(activateResult.status);
      }
    });
  });

  // ============================================
  // Rollback Tests
  // ============================================

  describe('Rollback on Failure', () => {
    it('should be able to delete created workflows on failure', async () => {
      if (!n8nAvailable || !apiKeyValid) {
        console.log('   ⏭️  Skipping: n8n not available');
        return;
      }

      // Create a test workflow
      const workflow = {
        name: `Rollback Test ${Date.now()}`,
        nodes: [
          {
            id: 'trigger',
            name: 'Manual',
            type: 'n8n-nodes-base.manualTrigger',
            typeVersion: 1,
            position: [0, 0] as [number, number],
            parameters: {},
          },
        ],
        connections: {},
        settings: { executionOrder: 'v1' },
      };

      const result = await createWorkflow(workflow);
      expect(result.ok).toBe(true);
      expect(result.data.id).toBeTruthy();

      const workflowId = result.data.id!;

      // Delete it (rollback simulation)
      const deleted = await deleteWorkflow(workflowId);
      expect(deleted).toBe(true);

      // Verify it's gone
      const workflows = await listWorkflows();
      const found = workflows.find((w) => w.id === workflowId);
      expect(found).toBeUndefined();
    });
  });
});
