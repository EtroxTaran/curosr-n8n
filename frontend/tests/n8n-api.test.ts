/**
 * n8n API Client Unit Tests
 *
 * Tests for the n8n REST API client (frontend/lib/n8n-api.ts)
 * These tests use mocked fetch to test the client logic without a real n8n instance.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createMockFetch,
  mockN8nConfig,
  mockWorkflowResponse,
  mockWorkflowList,
  createNetworkError,
  setupTestEnv,
} from './setup-backend';

// Mock dependencies before importing the module
vi.mock('@/lib/logger', () => ({
  default: {
    child: vi.fn().mockReturnValue({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

vi.mock('@/lib/settings', () => ({
  getN8nConfig: vi.fn(),
}));

// Import after mocking
import {
  testConnection,
  listWorkflows,
  getWorkflow,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  activateWorkflow,
  deactivateWorkflow,
  findWorkflowByName,
  healthCheck,
  comprehensiveHealthCheck,
  extractWebhookPaths,
  getWorkflowWebhooks,
  type WorkflowDefinition,
  type N8nApiConfig,
} from '@/lib/n8n-api';
import { getN8nConfig } from '@/lib/settings';

// Setup test environment
setupTestEnv();

describe('n8n-api', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ============================================
  // extractWebhookPaths - Pure function tests
  // ============================================

  describe('extractWebhookPaths', () => {
    it('should extract webhook trigger paths', () => {
      const workflow: WorkflowDefinition = {
        name: 'Test',
        nodes: [
          {
            id: '1',
            name: 'Webhook',
            type: 'n8n-nodes-base.webhook',
            typeVersion: 1,
            position: [0, 0],
            parameters: { path: 'my-webhook' },
          },
        ],
        connections: {},
      };

      const paths = extractWebhookPaths(workflow);
      expect(paths).toEqual(['/webhook/my-webhook']);
    });

    it('should extract form trigger paths', () => {
      const workflow: WorkflowDefinition = {
        name: 'Test',
        nodes: [
          {
            id: '1',
            name: 'Form',
            type: 'n8n-nodes-base.formTrigger',
            typeVersion: 1,
            position: [0, 0],
            parameters: { path: 'my-form' },
          },
        ],
        connections: {},
      };

      const paths = extractWebhookPaths(workflow);
      expect(paths).toEqual(['/form/my-form']);
    });

    it('should extract chat trigger paths', () => {
      const workflow: WorkflowDefinition = {
        name: 'Test',
        nodes: [
          {
            id: '1',
            name: 'Chat',
            type: '@n8n/n8n-nodes-langchain.chatTrigger',
            typeVersion: 1,
            position: [0, 0],
            parameters: { path: 'my-chat' },
          },
        ],
        connections: {},
      };

      const paths = extractWebhookPaths(workflow);
      expect(paths).toEqual(['/webhook/my-chat']);
    });

    it('should normalize paths with leading slash', () => {
      const workflow: WorkflowDefinition = {
        name: 'Test',
        nodes: [
          {
            id: '1',
            name: 'Webhook',
            type: 'n8n-nodes-base.webhook',
            typeVersion: 1,
            position: [0, 0],
            parameters: { path: '/already-has-slash' },
          },
        ],
        connections: {},
      };

      const paths = extractWebhookPaths(workflow);
      expect(paths).toEqual(['/webhook/already-has-slash']);
    });

    it('should return empty array for workflows without triggers', () => {
      const workflow: WorkflowDefinition = {
        name: 'Test',
        nodes: [
          {
            id: '1',
            name: 'Code',
            type: 'n8n-nodes-base.code',
            typeVersion: 2,
            position: [0, 0],
            parameters: {},
          },
        ],
        connections: {},
      };

      const paths = extractWebhookPaths(workflow);
      expect(paths).toEqual([]);
    });

    it('should handle multiple webhooks in same workflow', () => {
      const workflow: WorkflowDefinition = {
        name: 'Test',
        nodes: [
          {
            id: '1',
            name: 'Webhook 1',
            type: 'n8n-nodes-base.webhook',
            typeVersion: 1,
            position: [0, 0],
            parameters: { path: 'webhook-1' },
          },
          {
            id: '2',
            name: 'Webhook 2',
            type: 'n8n-nodes-base.webhook',
            typeVersion: 1,
            position: [0, 100],
            parameters: { path: 'webhook-2' },
          },
          {
            id: '3',
            name: 'Form',
            type: 'n8n-nodes-base.formTrigger',
            typeVersion: 1,
            position: [0, 200],
            parameters: { path: 'form-1' },
          },
        ],
        connections: {},
      };

      const paths = extractWebhookPaths(workflow);
      expect(paths).toHaveLength(3);
      expect(paths).toContain('/webhook/webhook-1');
      expect(paths).toContain('/webhook/webhook-2');
      expect(paths).toContain('/form/form-1');
    });

    it('should skip nodes without path parameter', () => {
      const workflow: WorkflowDefinition = {
        name: 'Test',
        nodes: [
          {
            id: '1',
            name: 'Webhook',
            type: 'n8n-nodes-base.webhook',
            typeVersion: 1,
            position: [0, 0],
            parameters: {}, // No path
          },
        ],
        connections: {},
      };

      const paths = extractWebhookPaths(workflow);
      expect(paths).toEqual([]);
    });
  });

  // ============================================
  // testConnection
  // ============================================

  describe('testConnection', () => {
    it('should return success with version when n8n is reachable', async () => {
      globalThis.fetch = createMockFetch({
        '/healthz': { status: 200, body: 'OK' },
        '/api/v1/workflows?limit=1': { status: 200, body: { data: [] } },
        '/api/v1/': { status: 200, body: { version: '1.50.0', instanceId: 'inst-123', publicApi: true } },
      });

      const result = await testConnection(mockN8nConfig.apiUrl, mockN8nConfig.apiKey);

      expect(result.success).toBe(true);
      expect(result.version).toBe('1.50.0');
      expect(result.instanceId).toBe('inst-123');
      expect(result.publicApi).toBe(true);
    });

    it('should return error when health endpoint fails', async () => {
      globalThis.fetch = createMockFetch({
        '/healthz': { status: 503, body: 'Service Unavailable' },
      });

      const result = await testConnection(mockN8nConfig.apiUrl, mockN8nConfig.apiKey);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not reachable');
    });

    it('should return auth error for 401 response', async () => {
      globalThis.fetch = createMockFetch({
        '/healthz': { status: 200, body: 'OK' },
        '/api/v1/workflows?limit=1': { status: 401, body: { message: 'Unauthorized' } },
      });

      const result = await testConnection(mockN8nConfig.apiUrl, mockN8nConfig.apiKey);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid API key');
    });

    it('should return auth error for 403 response', async () => {
      globalThis.fetch = createMockFetch({
        '/healthz': { status: 200, body: 'OK' },
        '/api/v1/workflows?limit=1': { status: 403, body: { message: 'Forbidden' } },
      });

      const result = await testConnection(mockN8nConfig.apiUrl, mockN8nConfig.apiKey);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid API key');
    });

    it('should return timeout error when request times out', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(createNetworkError('timeout'));

      const result = await testConnection(mockN8nConfig.apiUrl, mockN8nConfig.apiKey);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });

    it('should handle network errors gracefully', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(createNetworkError('network'));

      const result = await testConnection(mockN8nConfig.apiUrl, mockN8nConfig.apiKey);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should work even when version endpoint is unavailable', async () => {
      globalThis.fetch = createMockFetch({
        '/healthz': { status: 200, body: 'OK' },
        '/api/v1/workflows?limit=1': { status: 200, body: { data: [] } },
        '/api/v1/': { status: 404, body: 'Not Found' }, // Version endpoint unavailable
      });

      const result = await testConnection(mockN8nConfig.apiUrl, mockN8nConfig.apiKey);

      expect(result.success).toBe(true);
      expect(result.version).toBeUndefined();
    });
  });

  // ============================================
  // listWorkflows
  // ============================================

  describe('listWorkflows', () => {
    it('should return array of workflows', async () => {
      globalThis.fetch = createMockFetch({
        '/api/v1/workflows': { status: 200, body: mockWorkflowList },
      });

      const workflows = await listWorkflows(mockN8nConfig);

      expect(workflows).toHaveLength(3);
      expect(workflows[0].name).toBe('Workflow 1');
      expect(workflows[1].name).toBe('Workflow 2');
    });

    it('should throw when config not provided and not configured', async () => {
      vi.mocked(getN8nConfig).mockResolvedValue(null);

      await expect(listWorkflows()).rejects.toThrow('n8n is not configured');
    });

    it('should handle empty workflow list', async () => {
      globalThis.fetch = createMockFetch({
        '/api/v1/workflows': { status: 200, body: { data: [] } },
      });

      const workflows = await listWorkflows(mockN8nConfig);

      expect(workflows).toEqual([]);
    });

    it('should use configOverride when provided', async () => {
      const customConfig: N8nApiConfig = {
        apiUrl: 'https://custom.n8n.test',
        apiKey: 'custom-key',
      };

      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), { status: 200 })
      );

      await listWorkflows(customConfig);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://custom.n8n.test/api/v1/workflows',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-N8N-API-KEY': 'custom-key',
          }),
        })
      );
    });
  });

  // ============================================
  // createWorkflow
  // ============================================

  describe('createWorkflow', () => {
    const testWorkflow: WorkflowDefinition = {
      name: 'New Test Workflow',
      nodes: [{ id: '1', name: 'Start', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0], parameters: {} }],
      connections: {},
    };

    it('should POST workflow definition to /api/v1/workflows', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ...mockWorkflowResponse, name: testWorkflow.name }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await createWorkflow(testWorkflow, mockN8nConfig);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${mockN8nConfig.apiUrl}/api/v1/workflows`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(testWorkflow),
        })
      );
      expect(result.name).toBe(testWorkflow.name);
    });

    it('should return created workflow with id', async () => {
      globalThis.fetch = createMockFetch({
        '/api/v1/workflows': {
          status: 201,
          body: { ...mockWorkflowResponse, id: 'wf-new-123', name: testWorkflow.name },
        },
      });

      const result = await createWorkflow(testWorkflow, mockN8nConfig);

      expect(result.id).toBe('wf-new-123');
      expect(result.name).toBe(testWorkflow.name);
    });

    it('should handle validation errors from n8n', async () => {
      globalThis.fetch = createMockFetch({
        '/api/v1/workflows': {
          status: 400,
          body: { message: 'Invalid workflow: missing required field' },
        },
      });

      await expect(createWorkflow(testWorkflow, mockN8nConfig)).rejects.toThrow();
    });

    it('should handle duplicate name errors', async () => {
      globalThis.fetch = createMockFetch({
        '/api/v1/workflows': {
          status: 409,
          body: { message: 'Workflow with this name already exists' },
        },
      });

      await expect(createWorkflow(testWorkflow, mockN8nConfig)).rejects.toThrow();
    });
  });

  // ============================================
  // updateWorkflow
  // ============================================

  describe('updateWorkflow', () => {
    const workflowId = 'wf-123';
    const updateData: Partial<WorkflowDefinition> = {
      name: 'Updated Workflow Name',
    };

    it('should PUT workflow definition to /api/v1/workflows/:id', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ...mockWorkflowResponse, ...updateData }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      await updateWorkflow(workflowId, updateData, mockN8nConfig);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${mockN8nConfig.apiUrl}/api/v1/workflows/${workflowId}`,
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(updateData),
        })
      );
    });

    it('should return updated workflow', async () => {
      globalThis.fetch = createMockFetch({
        [`/workflows/${workflowId}`]: {
          status: 200,
          body: { ...mockWorkflowResponse, id: workflowId, name: 'Updated Name' },
        },
      });

      const result = await updateWorkflow(workflowId, { name: 'Updated Name' }, mockN8nConfig);

      expect(result.name).toBe('Updated Name');
    });

    it('should handle 404 for non-existent workflow', async () => {
      globalThis.fetch = createMockFetch({
        [`/workflows/${workflowId}`]: {
          status: 404,
          body: { message: 'Workflow not found' },
        },
      });

      await expect(updateWorkflow(workflowId, updateData, mockN8nConfig)).rejects.toThrow();
    });
  });

  // ============================================
  // deleteWorkflow
  // ============================================

  describe('deleteWorkflow', () => {
    const workflowId = 'wf-to-delete';

    it('should DELETE /api/v1/workflows/:id', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      await deleteWorkflow(workflowId, mockN8nConfig);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${mockN8nConfig.apiUrl}/api/v1/workflows/${workflowId}`,
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });

    it('should handle 404 for non-existent workflow', async () => {
      globalThis.fetch = createMockFetch({
        [`/workflows/${workflowId}`]: {
          status: 404,
          body: { message: 'Workflow not found' },
        },
      });

      await expect(deleteWorkflow(workflowId, mockN8nConfig)).rejects.toThrow();
    });
  });

  // ============================================
  // activateWorkflow
  // ============================================

  describe('activateWorkflow', () => {
    const workflowId = 'wf-to-activate';

    it('should POST to /api/v1/workflows/:id/activate', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ...mockWorkflowResponse, id: workflowId, active: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      await activateWorkflow(workflowId, mockN8nConfig);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${mockN8nConfig.apiUrl}/api/v1/workflows/${workflowId}/activate`,
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should return workflow with active=true', async () => {
      globalThis.fetch = createMockFetch({
        [`/workflows/${workflowId}/activate`]: {
          status: 200,
          body: { ...mockWorkflowResponse, id: workflowId, active: true },
        },
      });

      const result = await activateWorkflow(workflowId, mockN8nConfig);

      expect(result.active).toBe(true);
    });

    it('should handle activation errors (missing credentials)', async () => {
      globalThis.fetch = createMockFetch({
        [`/workflows/${workflowId}/activate`]: {
          status: 400,
          body: { message: 'Workflow cannot be activated: missing credentials for node "OpenAI"' },
        },
      });

      await expect(activateWorkflow(workflowId, mockN8nConfig)).rejects.toThrow();
    });
  });

  // ============================================
  // deactivateWorkflow
  // ============================================

  describe('deactivateWorkflow', () => {
    const workflowId = 'wf-to-deactivate';

    it('should POST to /api/v1/workflows/:id/deactivate', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ...mockWorkflowResponse, id: workflowId, active: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      await deactivateWorkflow(workflowId, mockN8nConfig);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${mockN8nConfig.apiUrl}/api/v1/workflows/${workflowId}/deactivate`,
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should return workflow with active=false', async () => {
      globalThis.fetch = createMockFetch({
        [`/workflows/${workflowId}/deactivate`]: {
          status: 200,
          body: { ...mockWorkflowResponse, id: workflowId, active: false },
        },
      });

      const result = await deactivateWorkflow(workflowId, mockN8nConfig);

      expect(result.active).toBe(false);
    });
  });

  // ============================================
  // findWorkflowByName
  // ============================================

  describe('findWorkflowByName', () => {
    it('should return workflow when found', async () => {
      globalThis.fetch = createMockFetch({
        '/api/v1/workflows': { status: 200, body: mockWorkflowList },
      });

      const result = await findWorkflowByName('Workflow 2', mockN8nConfig);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Workflow 2');
      expect(result?.id).toBe('wf-2');
    });

    it('should return null when not found', async () => {
      globalThis.fetch = createMockFetch({
        '/api/v1/workflows': { status: 200, body: mockWorkflowList },
      });

      const result = await findWorkflowByName('Non-existent Workflow', mockN8nConfig);

      expect(result).toBeNull();
    });

    it('should use exact name matching', async () => {
      globalThis.fetch = createMockFetch({
        '/api/v1/workflows': { status: 200, body: mockWorkflowList },
      });

      // Should not match partial names
      const result = await findWorkflowByName('Workflow', mockN8nConfig);

      expect(result).toBeNull();
    });
  });

  // ============================================
  // healthCheck
  // ============================================

  describe('healthCheck', () => {
    it('should return true when /healthz responds ok', async () => {
      vi.mocked(getN8nConfig).mockResolvedValue(mockN8nConfig);
      globalThis.fetch = createMockFetch({
        '/healthz': { status: 200, body: 'OK' },
      });

      const result = await healthCheck();

      expect(result).toBe(true);
    });

    it('should return false when /healthz fails', async () => {
      vi.mocked(getN8nConfig).mockResolvedValue(mockN8nConfig);
      globalThis.fetch = createMockFetch({
        '/healthz': { status: 503, body: 'Service Unavailable' },
      });

      const result = await healthCheck();

      expect(result).toBe(false);
    });

    it('should return false when config not set', async () => {
      vi.mocked(getN8nConfig).mockResolvedValue(null);

      const result = await healthCheck();

      expect(result).toBe(false);
    });

    it('should use configOverride when provided', async () => {
      const customConfig: N8nApiConfig = {
        apiUrl: 'https://custom.n8n.test',
        apiKey: 'custom-key',
      };

      globalThis.fetch = vi.fn().mockResolvedValue(new Response('OK', { status: 200 }));

      await healthCheck(customConfig);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://custom.n8n.test/healthz',
        expect.anything()
      );
    });
  });

  // ============================================
  // comprehensiveHealthCheck
  // ============================================

  describe('comprehensiveHealthCheck', () => {
    it('should return full health status when all checks pass', async () => {
      vi.mocked(getN8nConfig).mockResolvedValue(mockN8nConfig);
      globalThis.fetch = createMockFetch({
        '/healthz': { status: 200, body: 'OK' },
        '/api/v1/workflows': { status: 200, body: mockWorkflowList },
      });

      const result = await comprehensiveHealthCheck();

      expect(result.healthy).toBe(true);
      expect(result.healthEndpoint).toBe(true);
      expect(result.apiAccess).toBe(true);
      expect(result.workflowCount).toBe(3);
      expect(result.activeWorkflows).toBe(2); // 2 active in mockWorkflowList
    });

    it('should count workflows correctly', async () => {
      vi.mocked(getN8nConfig).mockResolvedValue(mockN8nConfig);
      globalThis.fetch = createMockFetch({
        '/healthz': { status: 200, body: 'OK' },
        '/api/v1/workflows': {
          status: 200,
          body: {
            data: [
              { id: '1', name: 'W1', active: true },
              { id: '2', name: 'W2', active: false },
              { id: '3', name: 'W3', active: false },
              { id: '4', name: 'W4', active: true },
              { id: '5', name: 'W5', active: true },
            ],
          },
        },
      });

      const result = await comprehensiveHealthCheck();

      expect(result.workflowCount).toBe(5);
      expect(result.activeWorkflows).toBe(3);
    });

    it('should handle partial failures gracefully', async () => {
      vi.mocked(getN8nConfig).mockResolvedValue(mockN8nConfig);
      globalThis.fetch = createMockFetch({
        '/healthz': { status: 200, body: 'OK' },
        '/api/v1/workflows': { status: 401, body: { message: 'Unauthorized' } },
      });

      const result = await comprehensiveHealthCheck();

      expect(result.healthy).toBe(false);
      expect(result.healthEndpoint).toBe(true);
      expect(result.apiAccess).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error when config not set', async () => {
      vi.mocked(getN8nConfig).mockResolvedValue(null);

      const result = await comprehensiveHealthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toBe('n8n not configured');
    });
  });

  // ============================================
  // getWorkflow
  // ============================================

  describe('getWorkflow', () => {
    const workflowId = 'wf-test-123';

    it('should GET /api/v1/workflows/:id', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ...mockWorkflowResponse, id: workflowId }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      await getWorkflow(workflowId, mockN8nConfig);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${mockN8nConfig.apiUrl}/api/v1/workflows/${workflowId}`,
        expect.anything()
      );
    });

    it('should return workflow details', async () => {
      globalThis.fetch = createMockFetch({
        [`/workflows/${workflowId}`]: {
          status: 200,
          body: { ...mockWorkflowResponse, id: workflowId, name: 'Test Workflow' },
        },
      });

      const result = await getWorkflow(workflowId, mockN8nConfig);

      expect(result.id).toBe(workflowId);
      expect(result.name).toBe('Test Workflow');
    });

    it('should throw for non-existent workflow', async () => {
      globalThis.fetch = createMockFetch({
        [`/workflows/${workflowId}`]: {
          status: 404,
          body: { message: 'Workflow not found' },
        },
      });

      await expect(getWorkflow(workflowId, mockN8nConfig)).rejects.toThrow();
    });
  });

  // ============================================
  // getWorkflowWebhooks
  // ============================================

  describe('getWorkflowWebhooks', () => {
    const workflowId = 'wf-webhook-test';

    it('should return full webhook URLs', async () => {
      vi.mocked(getN8nConfig).mockResolvedValue(mockN8nConfig);
      globalThis.fetch = createMockFetch({
        [`/workflows/${workflowId}`]: {
          status: 200,
          body: {
            ...mockWorkflowResponse,
            id: workflowId,
            nodes: [
              {
                id: '1',
                name: 'Webhook',
                type: 'n8n-nodes-base.webhook',
                typeVersion: 1,
                position: [0, 0],
                parameters: { path: 'my-webhook' },
              },
            ],
            connections: {},
          },
        },
      });

      const webhooks = await getWorkflowWebhooks(workflowId, mockN8nConfig);

      expect(webhooks).toHaveLength(1);
      expect(webhooks[0]).toBe(`${mockN8nConfig.apiUrl}/webhook/my-webhook`);
    });

    it('should return empty array for workflow without nodes', async () => {
      vi.mocked(getN8nConfig).mockResolvedValue(mockN8nConfig);
      globalThis.fetch = createMockFetch({
        [`/workflows/${workflowId}`]: {
          status: 200,
          body: {
            ...mockWorkflowResponse,
            id: workflowId,
            nodes: undefined, // No nodes
          },
        },
      });

      const webhooks = await getWorkflowWebhooks(workflowId, mockN8nConfig);

      expect(webhooks).toEqual([]);
    });
  });

  // ============================================
  // Error Handling
  // ============================================

  describe('Error Handling', () => {
    it('should include X-N8N-API-KEY header in requests', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      await listWorkflows(mockN8nConfig);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-N8N-API-KEY': mockN8nConfig.apiKey,
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should parse JSON error responses', async () => {
      globalThis.fetch = createMockFetch({
        '/api/v1/workflows': {
          status: 500,
          body: { message: 'Internal server error', code: 'INTERNAL_ERROR' },
        },
      });

      await expect(listWorkflows(mockN8nConfig)).rejects.toThrow('n8n API error: 500');
    });

    it('should handle non-JSON error responses', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response('Plain text error', {
          status: 500,
          headers: { 'Content-Type': 'text/plain' },
        })
      );

      await expect(listWorkflows(mockN8nConfig)).rejects.toThrow();
    });
  });
});
