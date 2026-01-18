/**
 * Backend Test Setup
 *
 * Provides mocking utilities for testing n8n API client and workflow importer
 * without requiring real services.
 */

import { vi, beforeEach, afterEach } from 'vitest';

// ============================================
// Types for Mocking
// ============================================

export interface MockResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

export interface MockFetchConfig {
  [pattern: string]: MockResponse | ((url: string, init?: RequestInit) => MockResponse | Promise<MockResponse>);
}

// ============================================
// Mock n8n Config
// ============================================

export const mockN8nConfig = {
  apiUrl: 'https://n8n.test.local',
  apiKey: 'test-api-key-12345',
  webhookBaseUrl: 'https://n8n.test.local',
};

// ============================================
// Mock Workflow Responses
// ============================================

export const mockWorkflowResponse = {
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

export const mockWorkflowList = {
  data: [
    {
      id: 'wf-1',
      name: 'Workflow 1',
      active: true,
      versionId: 'v1',
      createdAt: '2026-01-10T10:00:00.000Z',
      updatedAt: '2026-01-10T10:00:00.000Z',
    },
    {
      id: 'wf-2',
      name: 'Workflow 2',
      active: false,
      versionId: 'v1',
      createdAt: '2026-01-11T10:00:00.000Z',
      updatedAt: '2026-01-11T10:00:00.000Z',
    },
    {
      id: 'wf-3',
      name: 'Workflow 3',
      active: true,
      versionId: 'v2',
      createdAt: '2026-01-12T10:00:00.000Z',
      updatedAt: '2026-01-12T10:00:00.000Z',
    },
  ],
};

// ============================================
// Fetch Mocking
// ============================================

/**
 * Create a mock fetch implementation that responds based on URL patterns.
 *
 * @param config - Object mapping URL patterns to responses
 * @returns Mocked fetch function
 *
 * @example
 * ```ts
 * const fetchMock = createMockFetch({
 *   '/healthz': { status: 200, body: 'OK' },
 *   '/api/v1/workflows': { status: 200, body: { data: [] } },
 *   '/api/v1/workflows/': (url) => {
 *     const id = url.split('/').pop();
 *     return { status: 200, body: { id, name: 'Test' } };
 *   },
 * });
 * ```
 */
export function createMockFetch(config: MockFetchConfig) {
  return vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();

    // Find matching pattern
    for (const [pattern, responseOrFn] of Object.entries(config)) {
      if (url.includes(pattern)) {
        const response = typeof responseOrFn === 'function'
          ? await responseOrFn(url, init)
          : responseOrFn;

        return new Response(
          typeof response.body === 'string' ? response.body : JSON.stringify(response.body),
          {
            status: response.status,
            headers: {
              'Content-Type': 'application/json',
              ...response.headers,
            },
          }
        );
      }
    }

    // Default: 404 Not Found
    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

/**
 * Setup mock fetch globally and return cleanup function.
 */
export function setupMockFetch(config: MockFetchConfig): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = createMockFetch(config);

  return () => {
    globalThis.fetch = originalFetch;
  };
}

/**
 * Create a mock fetch that simulates n8n API responses.
 */
export function createN8nMockFetch(overrides: Partial<MockFetchConfig> = {}) {
  const defaultConfig: MockFetchConfig = {
    '/healthz': { status: 200, body: 'OK' },
    '/api/v1/workflows?limit=1': { status: 200, body: { data: [mockWorkflowList.data[0]] } },
    '/api/v1/workflows': (_url, init) => {
      // POST = create workflow
      if (init?.method === 'POST') {
        const body = JSON.parse(init.body as string);
        return {
          status: 201,
          body: {
            ...mockWorkflowResponse,
            id: `wf-new-${Date.now()}`,
            name: body.name,
          },
        };
      }
      // GET = list workflows
      return { status: 200, body: mockWorkflowList };
    },
    '/api/v1/': { status: 200, body: { version: '1.50.0', publicApi: true } },
  };

  // Filter out undefined values from overrides before merging
  const filteredOverrides: MockFetchConfig = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      filteredOverrides[key] = value;
    }
  }

  return createMockFetch({ ...defaultConfig, ...filteredOverrides });
}

// ============================================
// Database Mocking
// ============================================

/**
 * Mock database query results.
 */
export interface MockDbConfig {
  queryResults?: Record<string, unknown[]>;
  queryOneResults?: Record<string, unknown | null>;
  executeResults?: Record<string, { rowCount: number }>;
  errors?: Record<string, Error>;
}

/**
 * Create mocked database module.
 */
export function createMockDb(config: MockDbConfig = {}) {
  const {
    queryResults = {},
    queryOneResults = {},
    executeResults = {},
    errors = {},
  } = config;

  return {
    query: vi.fn().mockImplementation(async (sql: string) => {
      // Check for error
      for (const [pattern, error] of Object.entries(errors)) {
        if (sql.includes(pattern)) {
          throw error;
        }
      }
      // Return matching result or empty array
      for (const [pattern, result] of Object.entries(queryResults)) {
        if (sql.includes(pattern)) {
          return result;
        }
      }
      return [];
    }),

    queryOne: vi.fn().mockImplementation(async (sql: string) => {
      // Check for error
      for (const [pattern, error] of Object.entries(errors)) {
        if (sql.includes(pattern)) {
          throw error;
        }
      }
      // Return matching result or null
      for (const [pattern, result] of Object.entries(queryOneResults)) {
        if (sql.includes(pattern)) {
          return result;
        }
      }
      return null;
    }),

    execute: vi.fn().mockImplementation(async (sql: string) => {
      // Check for error
      for (const [pattern, error] of Object.entries(errors)) {
        if (sql.includes(pattern)) {
          throw error;
        }
      }
      // Return matching result or default
      for (const [pattern, result] of Object.entries(executeResults)) {
        if (sql.includes(pattern)) {
          return result;
        }
      }
      return { rowCount: 1 };
    }),
  };
}

// ============================================
// Settings Mocking
// ============================================

/**
 * Create mock settings module.
 */
export function createMockSettings(config: { n8nConfigured?: boolean; config?: typeof mockN8nConfig } = {}) {
  const { n8nConfigured = true, config: configValue = mockN8nConfig } = config;

  return {
    getN8nConfig: vi.fn().mockResolvedValue(n8nConfigured ? configValue : null),
    isN8nConfigured: vi.fn().mockResolvedValue(n8nConfigured),
    saveN8nConfig: vi.fn().mockResolvedValue(undefined),
    clearN8nConfig: vi.fn().mockResolvedValue(undefined),
    getSetting: vi.fn().mockResolvedValue(null),
    setSetting: vi.fn().mockResolvedValue(undefined),
  };
}

// ============================================
// File System Mocking
// ============================================

/**
 * Create mock file system for workflow files.
 */
export function createMockFs(files: Record<string, string> = {}) {
  return {
    readFile: vi.fn().mockImplementation(async (path: string) => {
      const normalizedPath = path.replace(/\\/g, '/');
      for (const [filePath, content] of Object.entries(files)) {
        if (normalizedPath.includes(filePath) || normalizedPath.endsWith(filePath)) {
          return content;
        }
      }
      const error = new Error(`ENOENT: no such file or directory, open '${path}'`);
      (error as NodeJS.ErrnoException).code = 'ENOENT';
      throw error;
    }),
    access: vi.fn().mockImplementation(async (path: string) => {
      const normalizedPath = path.replace(/\\/g, '/');
      const exists = Object.keys(files).some(
        (f) => normalizedPath.includes(f) || normalizedPath.endsWith(f)
      );
      if (!exists) {
        const error = new Error(`ENOENT: no such file or directory, access '${path}'`);
        (error as NodeJS.ErrnoException).code = 'ENOENT';
        throw error;
      }
    }),
    readdir: vi.fn().mockResolvedValue(Object.keys(files)),
    stat: vi.fn().mockResolvedValue({ isFile: () => true, isDirectory: () => false }),
  };
}

// ============================================
// Logger Mocking
// ============================================

/**
 * Create silent mock logger.
 */
export function createMockLogger() {
  const noOp = vi.fn();
  return {
    debug: noOp,
    info: noOp,
    warn: noOp,
    error: noOp,
    child: vi.fn().mockReturnThis(),
  };
}

// ============================================
// Test Utilities
// ============================================

/**
 * Wait for a condition to be true (useful for async assertions).
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 5000, interval = 100 } = options;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Create a delayed promise for testing timeouts.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create AbortController with auto-timeout.
 */
export function createTimeoutController(ms: number): AbortController {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller;
}

// ============================================
// Environment Variable Helpers
// ============================================

/**
 * Setup test environment variables.
 */
export function setupTestEnv() {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', 'postgres://test:test@localhost:5432/test');
    vi.stubEnv('AUTH_SECRET', 'test-auth-secret-32-characters!!');
    vi.stubEnv('S3_BUCKET', 'test-bucket');
    vi.stubEnv('S3_ENDPOINT', 'http://localhost:8888');
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('WORKFLOWS_DIR', '/test/workflows');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });
}

// ============================================
// Error Creation Helpers
// ============================================

/**
 * Create a mock N8nApiError.
 */
export function createN8nApiError(
  message: string,
  statusCode: number,
  response?: unknown
): Error & { statusCode: number; response?: unknown } {
  const error = new Error(message) as Error & { statusCode: number; response?: unknown };
  error.statusCode = statusCode;
  error.response = response;
  return error;
}

/**
 * Create a network/timeout error.
 */
export function createNetworkError(type: 'timeout' | 'abort' | 'network'): Error {
  const error = new Error(
    type === 'timeout'
      ? 'Request timed out'
      : type === 'abort'
        ? 'Request aborted'
        : 'Network error'
  );
  error.name = type === 'timeout' ? 'TimeoutError' : type === 'abort' ? 'AbortError' : 'TypeError';
  return error;
}
