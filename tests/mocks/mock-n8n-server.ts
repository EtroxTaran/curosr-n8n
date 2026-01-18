/**
 * Mock n8n Webhook Server for integration tests
 * Simulates n8n webhook endpoints without requiring actual n8n
 */

import http, { IncomingMessage, ServerResponse } from 'http';

// ============================================
// Types
// ============================================

export interface WebhookCall {
  path: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  timestamp: Date;
}

export type WebhookHandler = (body: unknown, request: IncomingMessage) => unknown;

export interface MockWebhookConfig {
  /** Response to return (or function to generate response) */
  response?: unknown | WebhookHandler;
  /** Delay before responding (ms) */
  delayMs?: number;
  /** HTTP status code */
  statusCode?: number;
  /** Error to simulate */
  error?: {
    statusCode: number;
    message: string;
  };
}

// ============================================
// Default Handlers
// ============================================

const DEFAULT_HANDLERS: Record<string, WebhookHandler> = {
  '/healthz': () => ({ status: 'ok' }),

  '/webhook/start-project': (body: unknown) => {
    const data = body as { projectId?: string; projectName?: string };
    if (!data.projectId) {
      throw { statusCode: 400, message: 'Missing projectId' };
    }
    return {
      status: 'accepted',
      executionId: `exec_${Date.now()}`,
      projectId: data.projectId,
      message: 'Workflow started',
    };
  },

  '/webhook/governance-batch': (body: unknown) => {
    const data = body as { decisions?: unknown[] };
    return {
      status: 'received',
      decisionsCount: data.decisions?.length || 0,
      message: 'Governance decisions processed',
    };
  },

  '/webhook/ai-product-factory-chat': (body: unknown) => {
    const data = body as { chatInput?: string };
    return {
      output: `Mock response to: ${data.chatInput || 'empty message'}`,
      executionId: `exec_${Date.now()}`,
    };
  },
};

// ============================================
// Mock Server Class
// ============================================

export class MockN8nServer {
  private server: http.Server | null = null;
  private calls: Map<string, WebhookCall[]> = new Map();
  private configs: Map<string, MockWebhookConfig> = new Map();
  private port: number = 0;

  /**
   * Start the mock server
   */
  async start(port = 5679): Promise<void> {
    if (this.server) {
      throw new Error('Server already running');
    }

    this.port = port;
    this.server = http.createServer(this.handleRequest.bind(this));

    return new Promise((resolve, reject) => {
      this.server!.on('error', reject);
      this.server!.listen(port, () => {
        console.log(`Mock n8n server started on port ${port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the mock server
   */
  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.server = null;
        this.calls.clear();
        this.configs.clear();
        console.log('Mock n8n server stopped');
        resolve();
      });
    });
  }

  /**
   * Get the base URL of the mock server
   */
  getBaseUrl(): string {
    return `http://localhost:${this.port}`;
  }

  /**
   * Get webhook URL for a specific path
   */
  getWebhookUrl(path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.getBaseUrl()}${normalizedPath}`;
  }

  // ============================================
  // Configuration Methods
  // ============================================

  /**
   * Set custom response for a webhook endpoint
   */
  setResponse(path: string, response: unknown | WebhookHandler): void {
    const config = this.configs.get(path) || {};
    config.response = response;
    this.configs.set(path, config);
  }

  /**
   * Set delay for a webhook endpoint
   */
  setDelay(path: string, delayMs: number): void {
    const config = this.configs.get(path) || {};
    config.delayMs = delayMs;
    this.configs.set(path, config);
  }

  /**
   * Set status code for a webhook endpoint
   */
  setStatusCode(path: string, statusCode: number): void {
    const config = this.configs.get(path) || {};
    config.statusCode = statusCode;
    this.configs.set(path, config);
  }

  /**
   * Simulate an error for a webhook endpoint
   */
  simulateError(path: string, statusCode: number, message: string): void {
    const config = this.configs.get(path) || {};
    config.error = { statusCode, message };
    this.configs.set(path, config);
  }

  /**
   * Clear error simulation for a webhook endpoint
   */
  clearError(path: string): void {
    const config = this.configs.get(path);
    if (config) {
      delete config.error;
    }
  }

  /**
   * Reset all configurations
   */
  resetConfigs(): void {
    this.configs.clear();
  }

  // ============================================
  // Call Inspection Methods
  // ============================================

  /**
   * Get all calls to a specific endpoint
   */
  getCalls(path: string): WebhookCall[] {
    return this.calls.get(path) || [];
  }

  /**
   * Get the most recent call to an endpoint
   */
  getLastCall(path: string): WebhookCall | undefined {
    const calls = this.getCalls(path);
    return calls[calls.length - 1];
  }

  /**
   * Get call count for an endpoint
   */
  getCallCount(path: string): number {
    return this.getCalls(path).length;
  }

  /**
   * Get all calls across all endpoints
   */
  getAllCalls(): WebhookCall[] {
    const allCalls: WebhookCall[] = [];
    for (const calls of this.calls.values()) {
      allCalls.push(...calls);
    }
    return allCalls.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Clear all recorded calls
   */
  clearCalls(): void {
    this.calls.clear();
  }

  /**
   * Clear calls for a specific endpoint
   */
  clearCallsFor(path: string): void {
    this.calls.delete(path);
  }

  /**
   * Wait for a specific number of calls to an endpoint
   */
  async waitForCalls(
    path: string,
    count: number,
    timeoutMs = 10000
  ): Promise<WebhookCall[]> {
    const startTime = Date.now();
    const pollInterval = 100;

    while (Date.now() - startTime < timeoutMs) {
      const calls = this.getCalls(path);
      if (calls.length >= count) {
        return calls;
      }
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(
      `Timeout waiting for ${count} calls to ${path}. Got ${this.getCallCount(path)}`
    );
  }

  // ============================================
  // Request Handler
  // ============================================

  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const path = req.url || '/';
    const method = req.method || 'GET';

    // Parse request body
    let body: unknown = null;
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      body = await this.parseBody(req);
    }

    // Record the call
    const call: WebhookCall = {
      path,
      method,
      headers: req.headers as Record<string, string | string[] | undefined>,
      body,
      timestamp: new Date(),
    };

    const calls = this.calls.get(path) || [];
    calls.push(call);
    this.calls.set(path, calls);

    // Get configuration for this endpoint
    const config = this.configs.get(path) || {};

    // Apply delay if configured
    if (config.delayMs && config.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, config.delayMs));
    }

    // Check for error simulation
    if (config.error) {
      res.writeHead(config.error.statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: config.error.message }));
      return;
    }

    // Get response handler
    let response: unknown;
    const statusCode = config.statusCode || 200;

    try {
      if (config.response) {
        response =
          typeof config.response === 'function'
            ? config.response(body, req)
            : config.response;
      } else if (DEFAULT_HANDLERS[path]) {
        response = DEFAULT_HANDLERS[path](body, req);
      } else {
        // Default 404 for unknown endpoints
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found', path }));
        return;
      }

      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    } catch (err: unknown) {
      // Handle thrown errors as response errors
      if (err && typeof err === 'object' && 'statusCode' in err) {
        const error = err as { statusCode: number; message: string };
        res.writeHead(error.statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: err instanceof Error ? err.message : 'Internal server error',
          })
        );
      }
    }
  }

  private parseBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];

      req.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        try {
          resolve(body ? JSON.parse(body) : null);
        } catch {
          resolve(body);
        }
      });

      req.on('error', reject);
    });
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create and start a mock n8n server
 */
export async function createMockN8nServer(port = 5679): Promise<MockN8nServer> {
  const server = new MockN8nServer();
  await server.start(port);
  return server;
}

/**
 * Create mock server with pre-configured responses for full workflow
 */
export async function createFullWorkflowMockServer(
  port = 5679
): Promise<MockN8nServer> {
  const server = new MockN8nServer();
  await server.start(port);

  // Configure start-project to return execution ID
  server.setResponse('/webhook/start-project', (body) => {
    const data = body as { projectId: string; projectName: string };
    return {
      status: 'accepted',
      executionId: `exec_${Date.now()}`,
      projectId: data.projectId,
      projectName: data.projectName,
      message: 'Workflow started successfully',
      nextPhase: 'scavenging',
    };
  });

  // Configure governance to trigger next phase
  server.setResponse('/webhook/governance-batch', (body) => {
    const data = body as { decisions: unknown[]; project_id: string };
    return {
      status: 'processed',
      decisionsCount: data.decisions.length,
      projectId: data.project_id,
      message: 'Governance decisions processed',
      nextPhase: 'vision',
    };
  });

  // Configure chat to return phase updates
  let visionIterations = 0;
  let archIterations = 0;

  server.setResponse('/webhook/ai-product-factory-chat', (body) => {
    const data = body as { chatInput: string; projectId: string };

    // Simulate different responses based on input
    if (data.chatInput.toLowerCase().includes('status')) {
      return {
        output: 'Current status: In progress',
        executionId: `exec_${Date.now()}`,
        phase: 1,
        iteration: visionIterations,
      };
    }

    // Default response
    return {
      output: `Processing: ${data.chatInput}`,
      executionId: `exec_${Date.now()}`,
    };
  });

  return server;
}
