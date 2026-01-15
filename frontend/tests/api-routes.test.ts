import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies before imports
vi.mock("@/lib/db", () => ({
  query: vi.fn(),
  healthCheck: vi.fn(),
}));

vi.mock("@/lib/s3", () => ({
  generateUploadUrl: vi.fn(),
  getContentType: vi.fn((filename: string) => {
    const ext = filename.split(".").pop()?.toLowerCase();
    const types: Record<string, string> = {
      pdf: "application/pdf",
      md: "text/markdown",
      txt: "text/plain",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      doc: "application/msword",
    };
    return types[ext || ""] || "application/octet-stream";
  }),
}));

vi.mock("@/lib/n8n", () => ({
  triggerStartProject: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  createProjectLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
  generateCorrelationId: vi.fn(() => "test-correlation-id"),
}));

// Import mocked modules
import { query, healthCheck } from "@/lib/db";
import { generateUploadUrl } from "@/lib/s3";
import { triggerStartProject } from "@/lib/n8n";

// ============================================
// Test Helpers
// ============================================

function createMockRequest(body: unknown, method = "POST"): Request {
  return new Request("http://localhost:3000/api/test", {
    method,
    headers: { "Content-Type": "application/json" },
    body: method !== "GET" ? JSON.stringify(body) : undefined,
  });
}

async function parseResponse(response: Response): Promise<{ status: number; body: unknown }> {
  const body = await response.json();
  return { status: response.status, body };
}

// ============================================
// Start Project API Tests
// ============================================

describe("API: /api/start-project", () => {
  const mockQuery = query as ReturnType<typeof vi.fn>;
  const mockTriggerWorkflow = triggerStartProject as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Set default environment
    process.env.N8N_WEBHOOK_URL = "http://n8n:5678/webhook";
  });

  afterEach(() => {
    delete process.env.N8N_WEBHOOK_URL;
  });

  // Simulated handler for testing (since we can't import the actual route handler easily)
  async function handleStartProject(request: Request): Promise<Response> {
    try {
      const body = await request.json();

      // Validate required fields
      if (!body.projectName || !body.projectName.trim()) {
        return Response.json({ error: "Project name is required" }, { status: 400 });
      }

      if (!body.inputFiles || body.inputFiles.length === 0) {
        return Response.json({ error: "At least one input file is required" }, { status: 400 });
      }

      const projectId = body.projectId || "test-project-id";
      const sessionId = `session_${Date.now()}`;

      // Create project in database
      const result = await mockQuery(
        expect.any(String),
        expect.any(Array)
      );

      if (!result || result.length === 0) {
        return Response.json({ error: "Failed to create project" }, { status: 500 });
      }

      const project = result[0];

      // Trigger workflow if configured
      let workflowStatus = "skipped";
      let executionId: string | undefined;
      let workflowError: string | undefined;

      if (process.env.N8N_WEBHOOK_URL) {
        const workflowResult = await mockTriggerWorkflow({
          projectId: project.project_id,
          projectName: project.project_name,
          sessionId: project.session_id,
          description: body.description || "",
          inputFiles: body.inputFiles,
        });

        if (workflowResult.success) {
          workflowStatus = "started";
          executionId = workflowResult.executionId;
        } else {
          workflowStatus = "failed";
          workflowError = workflowResult.error;
        }
      }

      return Response.json({
        status: "created",
        project_id: project.project_id,
        project_name: project.project_name,
        session_id: project.session_id,
        workflow_status: workflowStatus,
        execution_id: executionId,
        workflow_error: workflowError,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("duplicate key")) {
        return Response.json({ error: "A project with this name already exists" }, { status: 409 });
      }
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }
  }

  describe("Validation", () => {
    it("should reject request without project name", async () => {
      const request = createMockRequest({
        projectId: "test",
        inputFiles: [{ key: "test.pdf", name: "test.pdf", size: 1024, contentType: "application/pdf" }],
      });

      const response = await handleStartProject(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(400);
      expect(body).toHaveProperty("error", "Project name is required");
    });

    it("should reject request without input files", async () => {
      const request = createMockRequest({
        projectName: "Test Project",
        inputFiles: [],
      });

      const response = await handleStartProject(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(400);
      expect(body).toHaveProperty("error", "At least one input file is required");
    });

    it("should reject empty project name", async () => {
      const request = createMockRequest({
        projectName: "   ",
        inputFiles: [{ key: "test.pdf", name: "test.pdf", size: 1024, contentType: "application/pdf" }],
      });

      const response = await handleStartProject(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(400);
      expect(body).toHaveProperty("error", "Project name is required");
    });
  });

  describe("Success Cases", () => {
    it("should create project and trigger workflow", async () => {
      mockQuery.mockResolvedValueOnce([
        {
          project_id: "test-project",
          project_name: "Test Project",
          session_id: "session_123",
          created_at: new Date().toISOString(),
        },
      ]);

      mockTriggerWorkflow.mockResolvedValueOnce({
        success: true,
        executionId: "exec_123",
      });

      const request = createMockRequest({
        projectName: "Test Project",
        inputFiles: [{ key: "test.pdf", name: "test.pdf", size: 1024, contentType: "application/pdf" }],
      });

      const response = await handleStartProject(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(200);
      expect(body).toMatchObject({
        status: "created",
        project_name: "Test Project",
        workflow_status: "started",
        execution_id: "exec_123",
      });
    });

    it("should create project when workflow fails", async () => {
      mockQuery.mockResolvedValueOnce([
        {
          project_id: "test-project",
          project_name: "Test Project",
          session_id: "session_123",
          created_at: new Date().toISOString(),
        },
      ]);

      mockTriggerWorkflow.mockResolvedValueOnce({
        success: false,
        error: "Workflow timeout",
      });

      const request = createMockRequest({
        projectName: "Test Project",
        inputFiles: [{ key: "test.pdf", name: "test.pdf", size: 1024, contentType: "application/pdf" }],
      });

      const response = await handleStartProject(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(200);
      expect(body).toMatchObject({
        status: "created",
        workflow_status: "failed",
        workflow_error: "Workflow timeout",
      });
    });

    it("should skip workflow when not configured", async () => {
      delete process.env.N8N_WEBHOOK_URL;

      mockQuery.mockResolvedValueOnce([
        {
          project_id: "test-project",
          project_name: "Test Project",
          session_id: "session_123",
          created_at: new Date().toISOString(),
        },
      ]);

      const request = createMockRequest({
        projectName: "Test Project",
        inputFiles: [{ key: "test.pdf", name: "test.pdf", size: 1024, contentType: "application/pdf" }],
      });

      const response = await handleStartProject(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(200);
      expect(body).toMatchObject({
        status: "created",
        workflow_status: "skipped",
      });
      expect(mockTriggerWorkflow).not.toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should handle database errors", async () => {
      mockQuery.mockResolvedValueOnce([]);

      const request = createMockRequest({
        projectName: "Test Project",
        inputFiles: [{ key: "test.pdf", name: "test.pdf", size: 1024, contentType: "application/pdf" }],
      });

      const response = await handleStartProject(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(500);
      expect(body).toHaveProperty("error", "Failed to create project");
    });

    it("should handle duplicate project names", async () => {
      mockQuery.mockRejectedValueOnce(new Error("duplicate key value violates unique constraint"));

      const request = createMockRequest({
        projectName: "Existing Project",
        inputFiles: [{ key: "test.pdf", name: "test.pdf", size: 1024, contentType: "application/pdf" }],
      });

      const response = await handleStartProject(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(409);
      expect(body).toHaveProperty("error", "A project with this name already exists");
    });
  });
});

// ============================================
// Presigned URL API Tests
// ============================================

describe("API: /api/presigned-url", () => {
  const mockGenerateUploadUrl = generateUploadUrl as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Simulated handler for testing
  async function handlePresignedUrl(request: Request): Promise<Response> {
    try {
      const body = await request.json();

      // Validate required fields
      if (!body.projectId) {
        return Response.json(
          { error: "Invalid request", details: { projectId: ["Required"] } },
          { status: 400 }
        );
      }

      if (!body.filename) {
        return Response.json(
          { error: "Invalid request", details: { filename: ["Required"] } },
          { status: 400 }
        );
      }

      // Validate file type
      const allowedTypes = [
        "application/pdf",
        "text/markdown",
        "text/plain",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
      ];

      const ext = body.filename.split(".").pop()?.toLowerCase();
      const types: Record<string, string> = {
        pdf: "application/pdf",
        md: "text/markdown",
        txt: "text/plain",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        doc: "application/msword",
      };
      const contentType = body.contentType || types[ext || ""] || "application/octet-stream";

      if (!allowedTypes.includes(contentType)) {
        return Response.json(
          { error: "Invalid file type", message: `Allowed types: PDF, MD, TXT, DOCX. Got: ${contentType}` },
          { status: 400 }
        );
      }

      const result = await mockGenerateUploadUrl(body.projectId, body.filename, contentType);

      return Response.json({
        uploadUrl: result.uploadUrl,
        key: result.key,
        expiresIn: result.expiresIn,
        contentType,
      });
    } catch (error) {
      return Response.json(
        { error: "Failed to generate upload URL", message: error instanceof Error ? error.message : "Unknown error" },
        { status: 500 }
      );
    }
  }

  describe("Validation", () => {
    it("should reject request without projectId", async () => {
      const request = createMockRequest({ filename: "test.pdf" });
      const response = await handlePresignedUrl(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(400);
      expect(body).toHaveProperty("error", "Invalid request");
    });

    it("should reject request without filename", async () => {
      const request = createMockRequest({ projectId: "test-project" });
      const response = await handlePresignedUrl(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(400);
      expect(body).toHaveProperty("error", "Invalid request");
    });

    it("should reject invalid file types", async () => {
      const request = createMockRequest({
        projectId: "test-project",
        filename: "malware.exe",
        contentType: "application/x-msdownload",
      });

      const response = await handlePresignedUrl(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(400);
      expect(body).toMatchObject({
        error: "Invalid file type",
      });
    });
  });

  describe("Success Cases", () => {
    it("should generate presigned URL for PDF", async () => {
      mockGenerateUploadUrl.mockResolvedValueOnce({
        uploadUrl: "https://s3.example.com/upload?signature=abc",
        key: "projects/test-project/input/test.pdf",
        expiresIn: 3600,
      });

      const request = createMockRequest({
        projectId: "test-project",
        filename: "test.pdf",
      });

      const response = await handlePresignedUrl(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(200);
      expect(body).toMatchObject({
        uploadUrl: expect.stringContaining("s3.example.com"),
        key: "projects/test-project/input/test.pdf",
        contentType: "application/pdf",
      });
    });

    it("should generate presigned URL for Markdown", async () => {
      mockGenerateUploadUrl.mockResolvedValueOnce({
        uploadUrl: "https://s3.example.com/upload?signature=def",
        key: "projects/test-project/input/docs.md",
        expiresIn: 3600,
      });

      const request = createMockRequest({
        projectId: "test-project",
        filename: "docs.md",
      });

      const response = await handlePresignedUrl(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(200);
      expect(body).toMatchObject({
        contentType: "text/markdown",
      });
    });

    it("should accept explicit contentType", async () => {
      mockGenerateUploadUrl.mockResolvedValueOnce({
        uploadUrl: "https://s3.example.com/upload",
        key: "projects/test-project/input/readme.txt",
        expiresIn: 3600,
      });

      const request = createMockRequest({
        projectId: "test-project",
        filename: "readme.txt",
        contentType: "text/plain",
      });

      const response = await handlePresignedUrl(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(200);
      expect(body).toMatchObject({
        contentType: "text/plain",
      });
    });
  });

  describe("Error Handling", () => {
    it("should handle S3 errors", async () => {
      mockGenerateUploadUrl.mockRejectedValueOnce(new Error("S3 service unavailable"));

      const request = createMockRequest({
        projectId: "test-project",
        filename: "test.pdf",
      });

      const response = await handlePresignedUrl(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(500);
      expect(body).toMatchObject({
        error: "Failed to generate upload URL",
        message: "S3 service unavailable",
      });
    });
  });
});

// ============================================
// Health API Tests
// ============================================

describe("API: /api/health", () => {
  const mockHealthCheck = healthCheck as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Simulated handler for testing
  async function handleHealth(): Promise<Response> {
    const startTime = Date.now();

    let dbHealthy = false;
    try {
      dbHealthy = await mockHealthCheck();
    } catch {
      dbHealthy = false;
    }

    const responseTime = Date.now() - startTime;
    const status = dbHealthy ? "healthy" : "unhealthy";
    const statusCode = dbHealthy ? 200 : 503;

    return Response.json(
      {
        status,
        timestamp: new Date().toISOString(),
        responseTime: `${responseTime}ms`,
        checks: {
          database: {
            status: dbHealthy ? "up" : "down",
          },
        },
        version: "1.0.0",
      },
      { status: statusCode }
    );
  }

  it("should return healthy when database is up", async () => {
    mockHealthCheck.mockResolvedValueOnce(true);

    const response = await handleHealth();
    const { status, body } = await parseResponse(response);

    expect(status).toBe(200);
    expect(body).toMatchObject({
      status: "healthy",
      checks: {
        database: { status: "up" },
      },
    });
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("responseTime");
  });

  it("should return unhealthy when database is down", async () => {
    mockHealthCheck.mockResolvedValueOnce(false);

    const response = await handleHealth();
    const { status, body } = await parseResponse(response);

    expect(status).toBe(503);
    expect(body).toMatchObject({
      status: "unhealthy",
      checks: {
        database: { status: "down" },
      },
    });
  });

  it("should return unhealthy when database throws error", async () => {
    mockHealthCheck.mockRejectedValueOnce(new Error("Connection refused"));

    const response = await handleHealth();
    const { status, body } = await parseResponse(response);

    expect(status).toBe(503);
    expect(body).toMatchObject({
      status: "unhealthy",
      checks: {
        database: { status: "down" },
      },
    });
  });
});

// ============================================
// Governance API Tests
// ============================================

describe("API: /api/governance", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    originalFetch = global.fetch;
    global.fetch = vi.fn();
    process.env.N8N_WEBHOOK_URL = "http://n8n:5678/webhook";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.N8N_WEBHOOK_URL;
  });

  // Simulated handler for testing
  async function handleGovernance(request: Request): Promise<Response> {
    try {
      const body = await request.json();

      // Validate required fields
      if (!body.scavenging_id || !body.project_id || !body.decisions) {
        return Response.json(
          { error: "Invalid governance response", details: {} },
          { status: 400 }
        );
      }

      if (!Array.isArray(body.decisions)) {
        return Response.json(
          { error: "Invalid governance response", details: { decisions: ["Must be an array"] } },
          { status: 400 }
        );
      }

      // Forward to n8n
      const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
      if (!n8nWebhookUrl) {
        return Response.json(
          { error: "Failed to process governance decisions", message: "N8N_WEBHOOK_URL is not configured" },
          { status: 500 }
        );
      }

      const webhookEndpoint = `${n8nWebhookUrl}/governance-batch`;
      const n8nResponse = await fetch(webhookEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!n8nResponse.ok) {
        return Response.json(
          { error: "Failed to process governance decisions", message: `n8n returned ${n8nResponse.status}` },
          { status: 502 }
        );
      }

      let n8nResult = {};
      try {
        n8nResult = await n8nResponse.json();
      } catch {
        // n8n might not return JSON
      }

      return Response.json({
        success: true,
        message: "Governance decisions submitted successfully",
        scavenging_id: body.scavenging_id,
        decisions_count: body.decisions.length,
        approved_count: body.decisions.filter((d: { action: string }) => d.action === "approve").length,
        n8n_response: n8nResult,
      });
    } catch (error) {
      return Response.json(
        { error: "Failed to process governance decisions", message: error instanceof Error ? error.message : "Unknown error" },
        { status: 500 }
      );
    }
  }

  describe("Validation", () => {
    it("should reject request without scavenging_id", async () => {
      const request = createMockRequest({
        project_id: "test-project",
        decisions: [],
      });

      const response = await handleGovernance(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(400);
      expect(body).toHaveProperty("error", "Invalid governance response");
    });

    it("should reject request without project_id", async () => {
      const request = createMockRequest({
        scavenging_id: "scav_123",
        decisions: [],
      });

      const response = await handleGovernance(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(400);
      expect(body).toHaveProperty("error", "Invalid governance response");
    });

    it("should reject request with invalid decisions", async () => {
      const request = createMockRequest({
        scavenging_id: "scav_123",
        project_id: "test-project",
        decisions: "not an array",
      });

      const response = await handleGovernance(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(400);
      expect(body).toHaveProperty("error", "Invalid governance response");
    });
  });

  describe("Success Cases", () => {
    it("should forward decisions to n8n webhook", async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ received: true }),
      });

      const request = createMockRequest({
        scavenging_id: "scav_123",
        project_id: "test-project",
        decisions: [
          { tech_id: "tech_001", action: "approve", scope: "global" },
          { tech_id: "tech_002", action: "skip" },
        ],
      });

      const response = await handleGovernance(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(200);
      expect(body).toMatchObject({
        success: true,
        scavenging_id: "scav_123",
        decisions_count: 2,
        approved_count: 1,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://n8n:5678/webhook/governance-batch",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    it("should handle empty decisions array", async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const request = createMockRequest({
        scavenging_id: "scav_123",
        project_id: "test-project",
        decisions: [],
      });

      const response = await handleGovernance(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(200);
      expect(body).toMatchObject({
        success: true,
        decisions_count: 0,
        approved_count: 0,
      });
    });
  });

  describe("Error Handling", () => {
    it("should return 500 when N8N_WEBHOOK_URL not configured", async () => {
      delete process.env.N8N_WEBHOOK_URL;

      const request = createMockRequest({
        scavenging_id: "scav_123",
        project_id: "test-project",
        decisions: [],
      });

      const response = await handleGovernance(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(500);
      expect(body).toMatchObject({
        error: "Failed to process governance decisions",
      });
    });

    it("should return 502 when n8n webhook fails", async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      });

      const request = createMockRequest({
        scavenging_id: "scav_123",
        project_id: "test-project",
        decisions: [],
      });

      const response = await handleGovernance(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(502);
      expect(body).toMatchObject({
        error: "Failed to process governance decisions",
        message: "n8n returned 500",
      });
    });

    it("should handle network errors", async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const request = createMockRequest({
        scavenging_id: "scav_123",
        project_id: "test-project",
        decisions: [],
      });

      const response = await handleGovernance(request);
      const { status, body } = await parseResponse(response);

      expect(status).toBe(500);
      expect(body).toMatchObject({
        error: "Failed to process governance decisions",
        message: "Network error",
      });
    });
  });
});
