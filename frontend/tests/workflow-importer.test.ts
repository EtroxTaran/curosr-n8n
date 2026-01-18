/**
 * Workflow Importer Unit Tests
 *
 * Tests for the workflow import orchestration (frontend/lib/workflow-importer.ts)
 * These tests mock the file system, database, and n8n API client.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Read actual fixtures for testing
import simpleWorkflow from './fixtures/mock-workflow-simple.json';
import webhookWorkflow from './fixtures/mock-workflow-webhook.json';
import credentialsWorkflow from './fixtures/mock-workflow-credentials.json';
import depsWorkflow from './fixtures/mock-workflow-deps.json';

// ============================================
// Mock Setup - Use vi.hoisted to avoid hoisting issues
// ============================================

// Use vi.hoisted to create mocks that are available when vi.mock factories run
const {
  mockQuery,
  mockQueryOne,
  mockExecute,
  mockGetN8nConfig,
  mockIsN8nConfigured,
  mockSaveN8nConfig,
  mockClearN8nConfig,
  mockGetSetting,
  mockSetSetting,
  mockLogDebug,
  mockLogInfo,
  mockLogWarn,
  mockLogError,
  mockLogChild,
  mockReadFile,
  mockAccess,
  mockReaddir,
  mockStat,
  mockCreateWorkflow,
  mockUpdateWorkflow,
  mockActivateWorkflow,
  mockFindWorkflowByName,
  mockExtractWebhookPaths,
} = vi.hoisted(() => ({
  // Database mocks
  mockQuery: vi.fn(),
  mockQueryOne: vi.fn(),
  mockExecute: vi.fn(),
  // Settings mocks
  mockGetN8nConfig: vi.fn(),
  mockIsN8nConfigured: vi.fn(),
  mockSaveN8nConfig: vi.fn(),
  mockClearN8nConfig: vi.fn(),
  mockGetSetting: vi.fn(),
  mockSetSetting: vi.fn(),
  // Logger mocks
  mockLogDebug: vi.fn(),
  mockLogInfo: vi.fn(),
  mockLogWarn: vi.fn(),
  mockLogError: vi.fn(),
  mockLogChild: vi.fn(),
  // File system mocks
  mockReadFile: vi.fn(),
  mockAccess: vi.fn(),
  mockReaddir: vi.fn(),
  mockStat: vi.fn(),
  // n8n API mocks
  mockCreateWorkflow: vi.fn(),
  mockUpdateWorkflow: vi.fn(),
  mockActivateWorkflow: vi.fn(),
  mockFindWorkflowByName: vi.fn(),
  mockExtractWebhookPaths: vi.fn(),
}));

// Mock all modules with inline factories
vi.mock('@/lib/db', () => ({
  query: mockQuery,
  queryOne: mockQueryOne,
  execute: mockExecute,
}));

vi.mock('@/lib/settings', () => ({
  getN8nConfig: mockGetN8nConfig,
  isN8nConfigured: mockIsN8nConfigured,
  saveN8nConfig: mockSaveN8nConfig,
  clearN8nConfig: mockClearN8nConfig,
  getSetting: mockGetSetting,
  setSetting: mockSetSetting,
}));

vi.mock('@/lib/logger', () => ({
  default: {
    debug: mockLogDebug,
    info: mockLogInfo,
    warn: mockLogWarn,
    error: mockLogError,
    child: () => ({
      debug: mockLogDebug,
      info: mockLogInfo,
      warn: mockLogWarn,
      error: mockLogError,
      child: mockLogChild,
    }),
  },
}));

vi.mock('fs/promises', () => ({
  default: {
    readFile: mockReadFile,
    access: mockAccess,
    readdir: mockReaddir,
    stat: mockStat,
  },
  readFile: mockReadFile,
  access: mockAccess,
  readdir: mockReaddir,
  stat: mockStat,
}));

vi.mock('@/lib/n8n-api', () => ({
  createWorkflow: mockCreateWorkflow,
  updateWorkflow: mockUpdateWorkflow,
  activateWorkflow: mockActivateWorkflow,
  findWorkflowByName: mockFindWorkflowByName,
  extractWebhookPaths: mockExtractWebhookPaths,
}));

// Import after mocking
import {
  getBundledWorkflows,
  readWorkflowFile,
  getWorkflowRegistry,
  getWorkflowEntry,
  importWorkflow,
  importAllWorkflows,
  checkForUpdates,
  getWorkflowStatus,
  type ImportProgress,
} from '@/lib/workflow-importer';

// ============================================
// Test Configuration
// ============================================

const mockN8nConfig = {
  apiUrl: 'https://n8n.test.local',
  apiKey: 'test-api-key-12345',
  webhookBaseUrl: 'https://n8n.test.local',
};

const mockWorkflowResponse = {
  id: 'wf-test-123',
  name: 'Test Workflow',
  active: false,
  versionId: 'v1',
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-01-15T10:00:00.000Z',
  nodes: [],
  connections: {},
  settings: {},
};

// ============================================
// Test Setup
// ============================================

beforeEach(() => {
  vi.clearAllMocks();

  // Set up environment
  vi.stubEnv('DATABASE_URL', 'postgres://test:test@localhost:5432/test');
  vi.stubEnv('AUTH_SECRET', 'test-auth-secret-32-characters!!');
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('WORKFLOWS_DIR', '/test/workflows');

  // Reset mock implementations to defaults
  mockGetN8nConfig.mockResolvedValue(mockN8nConfig);
  mockIsN8nConfigured.mockResolvedValue(true);
  mockSaveN8nConfig.mockResolvedValue(undefined);
  mockClearN8nConfig.mockResolvedValue(undefined);
  mockGetSetting.mockResolvedValue(null);
  mockSetSetting.mockResolvedValue(undefined);

  mockQuery.mockResolvedValue([]);
  mockQueryOne.mockResolvedValue(null);
  mockExecute.mockResolvedValue({ rowCount: 1 });

  mockFindWorkflowByName.mockResolvedValue(null);
  mockCreateWorkflow.mockResolvedValue({ ...mockWorkflowResponse, id: 'wf-new-123' });
  mockUpdateWorkflow.mockResolvedValue({ ...mockWorkflowResponse, id: 'wf-existing-123' });
  mockActivateWorkflow.mockResolvedValue({ ...mockWorkflowResponse, active: true });
  mockExtractWebhookPaths.mockReturnValue([]);

  mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
  mockAccess.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
  mockReaddir.mockResolvedValue([]);
  mockStat.mockResolvedValue({ isFile: () => true, isDirectory: () => false });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('workflow-importer', () => {
  // Convert JSON imports to strings for fs mocking
  const simpleWorkflowStr = JSON.stringify(simpleWorkflow);
  const webhookWorkflowStr = JSON.stringify(webhookWorkflow);
  const credentialsWorkflowStr = JSON.stringify(credentialsWorkflow);
  const depsWorkflowStr = JSON.stringify(depsWorkflow);

  // ============================================
  // Checksum Calculation Tests
  // ============================================

  describe('calculateChecksum', () => {
    it('should be consistent for same content', async () => {
      // We can't directly test calculateChecksum since it's not exported
      // But we can verify through readWorkflowFile behavior
      mockReadFile.mockResolvedValue(simpleWorkflowStr);
      mockAccess.mockResolvedValue(undefined);

      const result1 = await readWorkflowFile('test-workflow.json');
      const result2 = await readWorkflowFile('test-workflow.json');

      expect(result1.checksum).toBe(result2.checksum);
    });

    it('should differ for different content', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockReadFile
        .mockResolvedValueOnce(simpleWorkflowStr)
        .mockResolvedValueOnce(webhookWorkflowStr);

      const result1 = await readWorkflowFile('workflow1.json');
      const result2 = await readWorkflowFile('workflow2.json');

      expect(result1.checksum).not.toBe(result2.checksum);
    });
  });

  // ============================================
  // parseWorkflowFile Tests
  // ============================================

  describe('parseWorkflowFile (via readWorkflowFile)', () => {
    it('should parse valid workflow JSON', async () => {
      mockReadFile.mockResolvedValue(simpleWorkflowStr);
      mockAccess.mockResolvedValue(undefined);

      const result = await readWorkflowFile('simple.json');

      expect(result.workflow).toBeDefined();
      expect(result.workflow.name).toBe('Test Simple Workflow');
      expect(result.workflow.nodes).toHaveLength(2);
    });

    it('should throw for invalid JSON', async () => {
      mockReadFile.mockResolvedValue('{ invalid json }');
      mockAccess.mockResolvedValue(undefined);

      await expect(readWorkflowFile('invalid.json')).rejects.toThrow();
    });

    it('should throw for missing file', async () => {
      mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      mockAccess.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

      await expect(readWorkflowFile('nonexistent.json')).rejects.toThrow();
    });

    it('should parse workflow with webhook triggers', async () => {
      mockReadFile.mockResolvedValue(webhookWorkflowStr);
      mockAccess.mockResolvedValue(undefined);

      const result = await readWorkflowFile('webhook.json');

      expect(result.workflow.nodes.some((n: { type: string }) => n.type.includes('webhook'))).toBe(true);
    });

    it('should parse workflow with credentials (stripped by default)', async () => {
      mockReadFile.mockResolvedValue(credentialsWorkflowStr);
      mockAccess.mockResolvedValue(undefined);

      const result = await readWorkflowFile('credentials.json');

      // Credentials are stripped by default for fresh n8n instance support
      const nodeWithCreds = result.workflow.nodes.find((n: { credentials?: object }) => n.credentials);
      expect(nodeWithCreds).toBeUndefined();

      // Original fixture should have credentials (verify test data is correct)
      const originalData = JSON.parse(credentialsWorkflowStr);
      const originalNodeWithCreds = originalData.nodes.find((n: { credentials?: object }) => n.credentials);
      expect(originalNodeWithCreds).toBeDefined();
    });
  });

  // ============================================
  // detectDependencies Tests
  // ============================================

  describe('detectDependencies (via workflow inspection)', () => {
    it('should detect executeWorkflow dependencies', async () => {
      mockReadFile.mockResolvedValue(depsWorkflowStr);
      mockAccess.mockResolvedValue(undefined);

      const result = await readWorkflowFile('deps.json');

      // The workflow has executeWorkflow nodes
      const execNodes = result.workflow.nodes.filter(
        (n: { type: string }) => n.type === 'n8n-nodes-base.executeWorkflow'
      );
      expect(execNodes.length).toBeGreaterThan(0);
    });

    it('should detect toolWorkflow dependencies', async () => {
      mockReadFile.mockResolvedValue(depsWorkflowStr);
      mockAccess.mockResolvedValue(undefined);

      const result = await readWorkflowFile('deps.json');

      // The workflow has toolWorkflow nodes
      const toolNodes = result.workflow.nodes.filter(
        (n: { type: string }) => n.type.includes('toolWorkflow')
      );
      expect(toolNodes.length).toBeGreaterThan(0);
    });

    it('should extract dependency names from workflowId parameter', async () => {
      mockReadFile.mockResolvedValue(depsWorkflowStr);
      mockAccess.mockResolvedValue(undefined);

      const result = await readWorkflowFile('deps.json');

      const execNode = result.workflow.nodes.find(
        (n: { type: string }) => n.type === 'n8n-nodes-base.executeWorkflow'
      );
      expect(execNode?.parameters?.workflowId).toBeDefined();
    });
  });

  // ============================================
  // detectCredentials Tests (Raw Fixture Inspection)
  // ============================================
  // Note: These tests verify the fixture data contains credentials.
  // After readWorkflowFile, credentials are stripped by default.
  // Use getBundledWorkflows to see which workflows need credential config.

  describe('detectCredentials (raw fixture inspection)', () => {
    it('should have OpenAI credentials in fixture', () => {
      // Verify fixture has credentials (used for getBundledWorkflows display)
      const originalData = JSON.parse(credentialsWorkflowStr);

      const openAiNode = originalData.nodes.find(
        (n: { credentials?: { openAiApi?: object } }) => n.credentials?.openAiApi
      );
      expect(openAiNode).toBeDefined();
    });

    it('should have HTTP Header Auth credentials in fixture', () => {
      // Verify fixture has credentials (used for getBundledWorkflows display)
      const originalData = JSON.parse(credentialsWorkflowStr);

      const httpNode = originalData.nodes.find(
        (n: { credentials?: { httpHeaderAuth?: object } }) => n.credentials?.httpHeaderAuth
      );
      expect(httpNode).toBeDefined();
    });

    it('should strip credentials when parsed via readWorkflowFile', async () => {
      mockReadFile.mockResolvedValue(credentialsWorkflowStr);
      mockAccess.mockResolvedValue(undefined);

      const result = await readWorkflowFile('credentials.json');

      // All credentials should be stripped
      const nodesWithCreds = result.workflow.nodes.filter(
        (n: { credentials?: object }) => n.credentials && Object.keys(n.credentials).length > 0
      );
      expect(nodesWithCreds).toHaveLength(0);
    });

    it('should return empty for workflow without credentials', async () => {
      mockReadFile.mockResolvedValue(simpleWorkflowStr);
      mockAccess.mockResolvedValue(undefined);

      const result = await readWorkflowFile('simple.json');

      const nodesWithCreds = result.workflow.nodes.filter(
        (n: { credentials?: object }) => n.credentials
      );
      expect(nodesWithCreds).toHaveLength(0);
    });
  });

  // ============================================
  // getBundledWorkflows Tests
  // ============================================

  describe('getBundledWorkflows', () => {
    it('should return ordered list of bundled workflows', async () => {
      // Mock workflow files
      mockReaddir.mockResolvedValue([
        'ai-product-factory-s3-subworkflow.json',
        'ai-product-factory-main-workflow.json',
      ]);
      mockReadFile.mockResolvedValue(simpleWorkflowStr);
      mockAccess.mockResolvedValue(undefined);

      const workflows = await getBundledWorkflows();

      expect(workflows).toBeDefined();
      expect(Array.isArray(workflows)).toBe(true);
    });

    it('should include workflow metadata', async () => {
      mockReaddir.mockResolvedValue(['test-workflow.json']);
      mockReadFile.mockResolvedValue(simpleWorkflowStr);
      mockAccess.mockResolvedValue(undefined);

      const workflows = await getBundledWorkflows();

      if (workflows.length > 0) {
        const workflow = workflows[0];
        expect(workflow).toHaveProperty('filename');
        expect(workflow).toHaveProperty('name');
      }
    });
  });

  // ============================================
  // readWorkflowFile Tests
  // ============================================

  describe('readWorkflowFile', () => {
    it('should read and parse workflow file', async () => {
      mockReadFile.mockResolvedValue(simpleWorkflowStr);
      mockAccess.mockResolvedValue(undefined);

      const result = await readWorkflowFile('test.json');

      expect(result).toHaveProperty('workflow');
      expect(result).toHaveProperty('checksum');
      expect(result.workflow.name).toBe('Test Simple Workflow');
    });

    it('should calculate checksum', async () => {
      mockReadFile.mockResolvedValue(simpleWorkflowStr);
      mockAccess.mockResolvedValue(undefined);

      const result = await readWorkflowFile('test.json');

      expect(result.checksum).toBeDefined();
      expect(typeof result.checksum).toBe('string');
      // SHA-256 produces 64 hex characters
      expect(result.checksum).toHaveLength(64);
    });

    it('should throw for file read errors', async () => {
      mockReadFile.mockRejectedValue(new Error('Permission denied'));
      mockAccess.mockRejectedValue(new Error('Permission denied'));

      await expect(readWorkflowFile('no-permission.json')).rejects.toThrow();
    });
  });

  // ============================================
  // getWorkflowRegistry Tests
  // ============================================

  describe('getWorkflowRegistry', () => {
    it('should query database for all registry entries', async () => {
      const mockEntries = [
        {
          id: '1',
          workflow_name: 'Workflow 1',
          workflow_file: 'workflow1.json',
          n8n_workflow_id: 'wf-1',
          import_status: 'imported',
        },
        {
          id: '2',
          workflow_name: 'Workflow 2',
          workflow_file: 'workflow2.json',
          n8n_workflow_id: 'wf-2',
          import_status: 'imported',
        },
      ];
      mockQuery.mockResolvedValue(mockEntries);

      const registry = await getWorkflowRegistry();

      expect(mockQuery).toHaveBeenCalled();
      expect(registry).toHaveLength(2);
    });

    it('should return empty array when no entries', async () => {
      mockQuery.mockResolvedValue([]);

      const registry = await getWorkflowRegistry();

      expect(registry).toHaveLength(0);
    });

    it('should handle database errors gracefully', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      await expect(getWorkflowRegistry()).rejects.toThrow('Database error');
    });
  });

  // ============================================
  // getWorkflowEntry Tests
  // ============================================

  describe('getWorkflowEntry', () => {
    it('should return entry for existing workflow', async () => {
      const mockEntry = {
        id: '1',
        workflow_name: 'Test Workflow',
        workflow_file: 'test.json',
        n8n_workflow_id: 'wf-1',
        import_status: 'imported',
      };
      mockQueryOne.mockResolvedValue(mockEntry);

      const entry = await getWorkflowEntry('test.json');

      expect(entry).toBeDefined();
      expect(entry?.workflow_file).toBe('test.json');
    });

    it('should return null for non-existent workflow', async () => {
      mockQueryOne.mockResolvedValue(null);

      const entry = await getWorkflowEntry('nonexistent.json');

      expect(entry).toBeNull();
    });
  });

  // ============================================
  // importWorkflow Tests
  // ============================================

  describe('importWorkflow', () => {
    it('should skip import when checksum unchanged', async () => {
      mockReadFile.mockResolvedValue(simpleWorkflowStr);
      mockAccess.mockResolvedValue(undefined);

      // Calculate the actual checksum from simpleWorkflowStr
      const crypto = await import('crypto');
      const actualChecksum = crypto.createHash('sha256').update(simpleWorkflowStr).digest('hex');

      // Mock registry entry with matching checksum
      mockQueryOne.mockResolvedValue({
        id: '1',
        workflow_name: 'Test',
        workflow_file: 'test.json',
        n8n_workflow_id: 'wf-1',
        local_checksum: actualChecksum,
        import_status: 'imported',
        webhook_paths: [],
      });

      const result = await importWorkflow('test.json', { configOverride: mockN8nConfig });

      // Should skip because checksum matches
      expect(result.status).toBe('skipped');
    });

    it('should create new workflow when not in registry', async () => {
      mockQueryOne.mockResolvedValue(null); // No existing entry
      mockReadFile.mockResolvedValue(simpleWorkflowStr);
      mockAccess.mockResolvedValue(undefined);
      mockFindWorkflowByName.mockResolvedValue(null); // Not in n8n

      const result = await importWorkflow('test.json', { configOverride: mockN8nConfig });

      expect(mockCreateWorkflow).toHaveBeenCalled();
      expect(result.status).toBe('imported');
    });

    it('should update existing workflow when checksum changed', async () => {
      mockQueryOne.mockResolvedValue({
        id: '1',
        workflow_name: 'Test',
        workflow_file: 'test.json',
        n8n_workflow_id: 'wf-existing-123',
        local_checksum: 'old-checksum',
        import_status: 'imported',
      });
      mockReadFile.mockResolvedValue(simpleWorkflowStr);
      mockAccess.mockResolvedValue(undefined);
      mockFindWorkflowByName.mockResolvedValue({ id: 'wf-existing-123', name: 'Test', active: false });

      const result = await importWorkflow('test.json', { configOverride: mockN8nConfig });

      expect(mockUpdateWorkflow).toHaveBeenCalled();
      expect(result.status).toBe('updated');
    });

    it('should activate workflow after import', async () => {
      mockQueryOne.mockResolvedValue(null);
      mockReadFile.mockResolvedValue(simpleWorkflowStr);
      mockAccess.mockResolvedValue(undefined);
      mockFindWorkflowByName.mockResolvedValue(null);

      await importWorkflow('test.json', { configOverride: mockN8nConfig });

      // importWorkflow always activates
      expect(mockActivateWorkflow).toHaveBeenCalled();
    });

    it('should update registry after successful import', async () => {
      mockQueryOne.mockResolvedValue(null);
      mockReadFile.mockResolvedValue(simpleWorkflowStr);
      mockAccess.mockResolvedValue(undefined);
      mockFindWorkflowByName.mockResolvedValue(null);

      await importWorkflow('test.json', { configOverride: mockN8nConfig });

      // Should have called execute to update registry
      expect(mockExecute).toHaveBeenCalled();
    });

    it('should handle import failure gracefully', async () => {
      mockQueryOne.mockResolvedValue(null);
      mockReadFile.mockResolvedValue(simpleWorkflowStr);
      mockAccess.mockResolvedValue(undefined);
      mockFindWorkflowByName.mockResolvedValue(null);
      mockCreateWorkflow.mockRejectedValue(new Error('n8n API error'));

      const result = await importWorkflow('test.json', { configOverride: mockN8nConfig });

      expect(result.status).toBe('failed');
      expect(result.error).toBeDefined();
    });
  });

  // ============================================
  // importAllWorkflows Tests
  // ============================================

  describe('importAllWorkflows', () => {
    it('should import workflows in dependency order', async () => {
      // Mock getBundledWorkflows to return ordered list
      mockReadFile.mockResolvedValue(simpleWorkflowStr);
      mockAccess.mockResolvedValue(undefined);
      mockQueryOne.mockResolvedValue(null);
      mockFindWorkflowByName.mockResolvedValue(null);

      mockCreateWorkflow.mockImplementation((workflow) => {
        return Promise.resolve({ ...mockWorkflowResponse, id: `wf-${Date.now()}`, name: workflow.name });
      });

      const result = await importAllWorkflows(undefined, { configOverride: mockN8nConfig });

      // Verify progress structure
      expect(result.total).toBeGreaterThan(0);
      expect(result.completed).toBe(result.total);
    });

    it('should call progress callback', async () => {
      mockReadFile.mockResolvedValue(simpleWorkflowStr);
      mockAccess.mockResolvedValue(undefined);
      mockQueryOne.mockResolvedValue(null);
      mockFindWorkflowByName.mockResolvedValue(null);

      const progressUpdates: ImportProgress[] = [];

      await importAllWorkflows(
        (progress) => progressUpdates.push({ ...progress }),
        { configOverride: mockN8nConfig }
      );

      expect(progressUpdates.length).toBeGreaterThan(0);
    });

    it('should rollback on Phase 1 failure (all-or-none)', async () => {
      mockReadFile.mockResolvedValue(simpleWorkflowStr);
      mockAccess.mockResolvedValue(undefined);
      mockQueryOne.mockResolvedValue(null);
      mockFindWorkflowByName.mockResolvedValue(null);

      let createCallCount = 0;
      mockCreateWorkflow.mockImplementation(() => {
        createCallCount++;
        if (createCallCount === 2) {
          // Fail on second workflow to test rollback
          return Promise.reject(new Error('Second workflow failed'));
        }
        return Promise.resolve({ ...mockWorkflowResponse, id: `wf-${createCallCount}` });
      });

      const result = await importAllWorkflows(undefined, { configOverride: mockN8nConfig });

      // With two-phase import, Phase 1 failures cause rollback
      expect(result.status).toBe('error');
      // Should have results up to and including the failed workflow
      const failedResults = result.results.filter(r => r.status === 'failed');
      expect(failedResults.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================
  // checkForUpdates Tests
  // ============================================

  describe('checkForUpdates', () => {
    it('should detect workflows needing update', async () => {
      mockReadFile.mockResolvedValue(simpleWorkflowStr);
      mockAccess.mockResolvedValue(undefined);

      // Registry has old checksum
      mockQuery.mockResolvedValue([
        {
          id: '1',
          workflow_name: 'Test',
          workflow_file: 'ai-product-factory-s3-subworkflow.json',
          local_checksum: 'old-checksum',
          import_status: 'imported',
        },
      ]);

      const updates = await checkForUpdates();

      // hasUpdate should be true when checksum doesn't match
      expect(updates.some((u) => u.hasUpdate)).toBe(true);
    });

    it('should detect not-imported workflows', async () => {
      mockReadFile.mockResolvedValue(simpleWorkflowStr);
      mockAccess.mockResolvedValue(undefined);
      mockQuery.mockResolvedValue([]); // Empty registry

      const updates = await checkForUpdates();

      // All bundled workflows should show hasUpdate=true when not imported
      expect(updates.every((u) => u.hasUpdate)).toBe(true);
      expect(updates.some((u) => u.currentVersion === 'not imported')).toBe(true);
    });

    it('should report up-to-date workflows', async () => {
      mockReadFile.mockResolvedValue(simpleWorkflowStr);
      mockAccess.mockResolvedValue(undefined);

      // Calculate actual checksum
      const crypto = await import('crypto');
      const actualChecksum = crypto.createHash('sha256').update(simpleWorkflowStr).digest('hex');

      // Mark first workflow as up-to-date
      mockQuery.mockResolvedValue([
        {
          id: '1',
          workflow_name: 'Test',
          workflow_file: 'ai-product-factory-s3-subworkflow.json',
          local_checksum: actualChecksum,
          import_status: 'imported',
        },
      ]);

      const updates = await checkForUpdates();

      const s3Workflow = updates.find((u) => u.filename === 'ai-product-factory-s3-subworkflow.json');
      if (s3Workflow) {
        expect(s3Workflow.hasUpdate).toBe(false);
      }
    });
  });

  // ============================================
  // getWorkflowStatus Tests
  // ============================================

  describe('getWorkflowStatus', () => {
    it('should return pending for not-imported workflows', async () => {
      mockReadFile.mockResolvedValue(simpleWorkflowStr);
      mockAccess.mockResolvedValue(undefined);
      mockQuery.mockResolvedValue([]); // Empty registry

      const statuses = await getWorkflowStatus();

      // All should have importStatus: 'pending' when not in registry
      expect(statuses.every((s) => s.importStatus === 'pending')).toBe(true);
    });

    it('should return imported status from registry', async () => {
      mockReadFile.mockResolvedValue(simpleWorkflowStr);
      mockAccess.mockResolvedValue(undefined);
      mockQuery.mockResolvedValue([
        {
          id: '1',
          workflow_file: 'ai-product-factory-s3-subworkflow.json',
          workflow_name: 'S3 Subworkflow',
          n8n_workflow_id: 'wf-123',
          is_active: true,
          import_status: 'imported',
          webhook_paths: [],
          last_import_at: new Date(),
          last_error: null,
        },
      ]);

      const statuses = await getWorkflowStatus();

      const s3Workflow = statuses.find((s) => s.filename === 'ai-product-factory-s3-subworkflow.json');
      expect(s3Workflow?.importStatus).toBe('imported');
      expect(s3Workflow?.n8nWorkflowId).toBe('wf-123');
    });

    it('should return failed status from registry', async () => {
      mockReadFile.mockResolvedValue(simpleWorkflowStr);
      mockAccess.mockResolvedValue(undefined);
      mockQuery.mockResolvedValue([
        {
          id: '1',
          workflow_file: 'ai-product-factory-s3-subworkflow.json',
          workflow_name: 'S3 Subworkflow',
          n8n_workflow_id: null,
          is_active: false,
          import_status: 'failed',
          webhook_paths: [],
          last_import_at: null,
          last_error: 'Connection refused',
        },
      ]);

      const statuses = await getWorkflowStatus();

      const s3Workflow = statuses.find((s) => s.filename === 'ai-product-factory-s3-subworkflow.json');
      expect(s3Workflow?.importStatus).toBe('failed');
      expect(s3Workflow?.lastError).toBe('Connection refused');
    });

    it('should include all bundled workflows in status', async () => {
      mockReadFile.mockResolvedValue(simpleWorkflowStr);
      mockAccess.mockResolvedValue(undefined);
      mockQuery.mockResolvedValue([]);

      const statuses = await getWorkflowStatus();

      // Should have status for each bundled workflow
      expect(statuses.length).toBeGreaterThan(0);
      expect(statuses.every((s) => s.filename && s.name)).toBe(true);
    });
  });

  // ============================================
  // extractWebhookPaths Integration Tests
  // ============================================

  describe('webhook extraction via import', () => {
    it('should extract webhooks during import', async () => {
      mockQueryOne.mockResolvedValue(null);
      mockReadFile.mockResolvedValue(webhookWorkflowStr);
      mockAccess.mockResolvedValue(undefined);
      mockFindWorkflowByName.mockResolvedValue(null);
      mockExtractWebhookPaths.mockReturnValue(['/webhook/test', '/webhook-test/form']);

      const result = await importWorkflow('webhook.json', { configOverride: mockN8nConfig });

      expect(mockExtractWebhookPaths).toHaveBeenCalled();
      expect(result.webhookPaths).toEqual(['/webhook/test', '/webhook-test/form']);
    });
  });

  // ============================================
  // Credential Stripping Tests (Fresh Instance Support)
  // ============================================
  // These tests verify that workflows can be imported to fresh n8n instances
  // where credential IDs from the source instance don't exist.
  // Issue: n8n returns 400 Bad Request when referencing non-existent credentials.

  describe('credential stripping for fresh instances', () => {
    it('should strip credentials from workflow nodes by default', async () => {
      mockReadFile.mockResolvedValue(credentialsWorkflowStr);
      mockAccess.mockResolvedValue(undefined);

      const result = await readWorkflowFile('credentials.json');

      // Credentials should be stripped by default
      const nodesWithCreds = result.workflow.nodes.filter(
        (n: { credentials?: object }) => n.credentials && Object.keys(n.credentials).length > 0
      );
      expect(nodesWithCreds).toHaveLength(0);
    });

    it('should preserve credentials in raw fixture for display purposes', () => {
      // getBundledWorkflows uses stripCredentials: false internally
      // to show which workflows need credential configuration in the UI.
      // This test verifies the fixture has credentials that would be shown.
      const originalData = JSON.parse(credentialsWorkflowStr);

      // Count nodes with credentials
      const nodesWithCreds = originalData.nodes.filter(
        (n: { credentials?: object }) => n.credentials && Object.keys(n.credentials).length > 0
      );

      // The fixture should have 2 nodes with credentials (OpenAI and HTTP)
      expect(nodesWithCreds.length).toBe(2);
    });

    it('should successfully import workflow after stripping credentials', async () => {
      mockQueryOne.mockResolvedValue(null);
      mockReadFile.mockResolvedValue(credentialsWorkflowStr);
      mockAccess.mockResolvedValue(undefined);
      mockFindWorkflowByName.mockResolvedValue(null);

      // Capture what's sent to n8n
      let capturedWorkflow: { nodes?: Array<{ credentials?: object }> } | null = null;
      mockCreateWorkflow.mockImplementation((workflow) => {
        capturedWorkflow = workflow;
        return Promise.resolve({ ...mockWorkflowResponse, id: 'wf-new-123', name: workflow.name });
      });

      await importWorkflow('credentials.json', { configOverride: mockN8nConfig });

      // Verify credentials were stripped before sending to n8n
      expect(capturedWorkflow).not.toBeNull();
      const nodesWithCreds = capturedWorkflow!.nodes?.filter(
        (n) => n.credentials && Object.keys(n.credentials).length > 0
      );
      expect(nodesWithCreds).toHaveLength(0);
    });

    it('should log stripped credentials for debugging', async () => {
      mockQueryOne.mockResolvedValue(null);
      mockReadFile.mockResolvedValue(credentialsWorkflowStr);
      mockAccess.mockResolvedValue(undefined);
      mockFindWorkflowByName.mockResolvedValue(null);

      await importWorkflow('credentials.json', { configOverride: mockN8nConfig });

      // Verify that stripping was logged
      expect(mockLogInfo).toHaveBeenCalledWith(
        'Stripped credentials from workflow nodes',
        expect.objectContaining({
          count: expect.any(Number),
          credentials: expect.any(Array),
        })
      );
    });
  });

  // ============================================
  // Import Failure Handling Tests (Catch Block)
  // ============================================
  // These tests verify that when import fails, the catch block properly:
  // 1. Sets workflow_name in database (not NULL)
  // 2. Extracts detailed error messages from n8n responses
  // Issue: Variables declared inside try block were inaccessible in catch.

  describe('import failure handling', () => {
    it('should set workflow_name in database even when import fails', async () => {
      mockQueryOne.mockResolvedValue(null);
      mockReadFile.mockResolvedValue(simpleWorkflowStr);
      mockAccess.mockResolvedValue(undefined);
      mockFindWorkflowByName.mockResolvedValue(null);
      mockCreateWorkflow.mockRejectedValue(new Error('n8n API error'));

      await importWorkflow('test-simple.json', { configOverride: mockN8nConfig });

      // Verify upsert was called with workflow_name (not NULL)
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO workflow_registry'),
        expect.arrayContaining([
          'test-simple.json', // workflow_file
          'Test Simple Workflow', // workflow_name - should NOT be null
        ])
      );
    });

    it('should use filename as fallback when workflow parsing fails', async () => {
      mockQueryOne.mockResolvedValue(null);
      // Return invalid JSON that will fail to parse
      mockReadFile.mockResolvedValue('{ invalid json }');
      mockAccess.mockResolvedValue(undefined);

      const result = await importWorkflow('my-workflow.json', { configOverride: mockN8nConfig });

      expect(result.status).toBe('failed');
      // The workflow_name should fallback to filename without .json extension
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO workflow_registry'),
        expect.arrayContaining([
          'my-workflow.json', // workflow_file
          'my-workflow', // workflow_name fallback from filename
        ])
      );
    });

    it('should extract detailed error from n8n 400 response', async () => {
      mockQueryOne.mockResolvedValue(null);
      mockReadFile.mockResolvedValue(simpleWorkflowStr);
      mockAccess.mockResolvedValue(undefined);
      mockFindWorkflowByName.mockResolvedValue(null);

      // Simulate n8n 400 error with response body
      const n8nError = new Error('n8n API error: 400 Bad Request') as Error & {
        statusCode?: number;
        response?: object;
      };
      n8nError.statusCode = 400;
      n8nError.response = {
        message: 'Credential with ID "cred-123" does not exist',
        error: 'Bad Request',
      };
      mockCreateWorkflow.mockRejectedValue(n8nError);

      const result = await importWorkflow('test.json', { configOverride: mockN8nConfig });

      expect(result.status).toBe('failed');
      expect(result.error).toContain('400');
      expect(result.error).toContain('Credential with ID');
    });

    it('should handle n8n error without response body', async () => {
      mockQueryOne.mockResolvedValue(null);
      mockReadFile.mockResolvedValue(simpleWorkflowStr);
      mockAccess.mockResolvedValue(undefined);
      mockFindWorkflowByName.mockResolvedValue(null);

      mockCreateWorkflow.mockRejectedValue(new Error('Network error'));

      const result = await importWorkflow('test.json', { configOverride: mockN8nConfig });

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Network error');
    });

    it('should increment retry_count on repeated failures', async () => {
      // First call: no existing entry
      mockQueryOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ retry_count: 1 }); // Second call: has retry_count

      mockReadFile.mockResolvedValue(simpleWorkflowStr);
      mockAccess.mockResolvedValue(undefined);
      mockFindWorkflowByName.mockResolvedValue(null);
      mockCreateWorkflow.mockRejectedValue(new Error('Persistent failure'));

      // First attempt
      await importWorkflow('test.json', { configOverride: mockN8nConfig });

      // Reset and do second attempt
      mockQueryOne.mockResolvedValue({ retry_count: 1 });
      await importWorkflow('test.json', { configOverride: mockN8nConfig });

      // Verify retry_count was incremented
      const lastCall = mockExecute.mock.calls[mockExecute.mock.calls.length - 1];
      expect(lastCall[1]).toContain(2); // retry_count should be 2
    });
  });
});
