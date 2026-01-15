import type {
  ChatRequest,
  ChatResponse,
  N8nWebhookRequest,
  N8nWebhookResponse,
} from "@/types/chat";
import { logger, type Logger } from "./logger";

/**
 * Retry configuration options
 */
export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
  onRetry?: (error: Error, attempt: number) => void;
  /** Optional logger instance for structured logging */
  logger?: Logger;
}

const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, "onRetry" | "logger">> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  timeoutMs: 60000, // 1 minute default timeout
};

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateBackoff(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponentialDelay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
  // Add jitter (±20%)
  const jitter = exponentialDelay * 0.2 * (Math.random() * 2 - 1);
  return Math.round(exponentialDelay + jitter);
}

/**
 * Check if an error is retryable
 * Network errors and 5xx server errors are retryable
 */
function isRetryableError(error: unknown, statusCode?: number): boolean {
  // Network errors are always retryable
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return true;
  }

  // Server errors (5xx) are retryable
  if (statusCode && statusCode >= 500 && statusCode < 600) {
    return true;
  }

  // Connection errors
  if (error instanceof Error) {
    const retryableMessages = [
      "ECONNREFUSED",
      "ECONNRESET",
      "ETIMEDOUT",
      "ENOTFOUND",
      "network",
      "timeout",
      "socket hang up",
    ];
    return retryableMessages.some((msg) =>
      error.message.toLowerCase().includes(msg.toLowerCase())
    );
  }

  return false;
}

/**
 * Execute a fetch request with retry logic
 * Exported for use in other API endpoints (e.g., governance)
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retryOptions: RetryOptions = {}
): Promise<Response> {
  const {
    maxRetries = DEFAULT_RETRY_OPTIONS.maxRetries,
    baseDelayMs = DEFAULT_RETRY_OPTIONS.baseDelayMs,
    maxDelayMs = DEFAULT_RETRY_OPTIONS.maxDelayMs,
    timeoutMs = DEFAULT_RETRY_OPTIONS.timeoutMs,
    onRetry,
    logger: log = logger.child({ component: "n8n" }),
  } = retryOptions;

  let lastError: Error | undefined;
  let lastStatusCode: number | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // If response is OK or a client error (4xx), return immediately
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }

      // Server error - may be retryable
      lastStatusCode = response.status;
      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);

      if (!isRetryableError(lastError, lastStatusCode) || attempt >= maxRetries) {
        return response;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable
      if (!isRetryableError(error) || attempt >= maxRetries) {
        throw lastError;
      }
    }

    // Calculate delay and wait before retry
    const delay = calculateBackoff(attempt, baseDelayMs, maxDelayMs);

    if (onRetry) {
      onRetry(lastError!, attempt + 1);
    }

    log.warn("Request failed, retrying", {
      attempt: attempt + 1,
      maxAttempts: maxRetries + 1,
      delayMs: delay,
      error: lastError?.message,
      url,
    });

    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  throw lastError || new Error("Max retries exceeded");
}

function getWebhookUrl(): string {
  const url = process.env.N8N_WEBHOOK_URL;
  if (!url) {
    throw new Error("N8N_WEBHOOK_URL environment variable is not set");
  }
  return url;
}

export async function sendChatMessage(
  request: ChatRequest,
  retryOptions?: RetryOptions
): Promise<ChatResponse> {
  const webhookUrl = getWebhookUrl();
  const sessionId =
    request.sessionId || `dashboard_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const payload: N8nWebhookRequest = {
    chatInput: request.message,
    projectId: request.projectId,
    sessionId,
    source: "dashboard",
  };

  try {
    const response = await fetchWithRetry(
      `${webhookUrl}/ai-product-factory-chat`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      retryOptions
    );

    if (!response.ok) {
      const errorText = await response.text();
      return {
        message: "",
        error: `n8n returned ${response.status}: ${errorText}`,
      };
    }

    const data: N8nWebhookResponse = await response.json();

    // n8n can return the message in different fields
    const message =
      data.output || data.text || data.response || data.message || "";

    return {
      message,
      executionId: data.executionId,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return {
      message: "",
      error: `Failed to send message to n8n: ${errorMessage}`,
    };
  }
}

export async function triggerWorkflow(
  workflowName: string,
  payload: Record<string, unknown>,
  retryOptions?: RetryOptions
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const webhookUrl = getWebhookUrl();

  try {
    const response = await fetchWithRetry(
      `${webhookUrl}/${workflowName}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      retryOptions
    );

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `n8n returned ${response.status}: ${errorText}`,
      };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      error: `Failed to trigger workflow: ${errorMessage}`,
    };
  }
}

/**
 * Start project request payload
 */
export interface StartProjectPayload {
  projectId: string;
  projectName: string;
  sessionId: string;
  description?: string;
  inputFiles: Array<{
    key: string;
    name: string;
    size: number;
    contentType: string;
  }>;
}

/**
 * Start project response
 */
export interface StartProjectResponse {
  success: boolean;
  executionId?: string;
  error?: string;
}

/**
 * Trigger the start-project workflow with retry logic
 * This is a dedicated function for the start-project API to ensure
 * proper error handling and visibility into workflow execution.
 */
export async function triggerStartProject(
  payload: StartProjectPayload,
  retryOptions?: RetryOptions
): Promise<StartProjectResponse> {
  const webhookUrl = getWebhookUrl();

  const log = logger.child({ component: "n8n", operation: "start-project" });

  // Use more aggressive retry for workflow triggers
  const options: RetryOptions = {
    maxRetries: 3,
    baseDelayMs: 2000, // Start with 2 seconds
    maxDelayMs: 30000,
    timeoutMs: 120000, // 2 minutes timeout for long-running operations
    logger: log,
    ...retryOptions,
    onRetry: (error, attempt) => {
      log.warn("Start project webhook retry", {
        attempt,
        error: error.message,
        projectId: payload.projectId,
      });
      retryOptions?.onRetry?.(error, attempt);
    },
  };

  try {
    const response = await fetchWithRetry(
      `${webhookUrl}/webhook/start-project`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      options
    );

    if (!response.ok) {
      const errorText = await response.text();
      log.error("Start project webhook failed", new Error(errorText), {
        statusCode: response.status,
        projectId: payload.projectId,
      });
      return {
        success: false,
        error: `n8n returned ${response.status}: ${errorText}`,
      };
    }

    // Try to parse response, but don't fail if it's empty
    try {
      const data = await response.json();
      return {
        success: true,
        executionId: data.executionId || data.execution_id,
      };
    } catch {
      // Some workflows may return empty or non-JSON response
      return { success: true };
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    log.error("Start project webhook error", error, {
      projectId: payload.projectId,
    });
    return {
      success: false,
      error: `Failed to trigger start-project workflow: ${errorMessage}`,
    };
  }
}

export async function checkN8nHealth(): Promise<boolean> {
  try {
    // n8n doesn't have a standard health endpoint, but we can try the webhook base
    const webhookUrl = getWebhookUrl();
    const response = await fetch(webhookUrl, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    // Even a 404 means n8n is running
    return response.status < 500;
  } catch {
    return false;
  }
}
