/**
 * Request Context Utilities
 *
 * Provides utilities for extracting and managing request context,
 * including correlation IDs for distributed tracing.
 */

import {
  generateCorrelationId,
  createRequestLogger,
  type LogContext,
} from "./logger";
import type { Logger } from "./logger";

// Re-export Logger type for convenience
export type { Logger };

/**
 * Standard header names for correlation ID
 * Supports multiple conventions for compatibility
 */
export const CORRELATION_ID_HEADERS = [
  "x-correlation-id",
  "x-request-id",
  "x-trace-id",
  "traceparent", // W3C Trace Context
] as const;

/**
 * Request context extracted from an incoming request
 */
export interface RequestContext {
  /** Correlation ID for request tracing */
  correlationId: string;
  /** Request method (GET, POST, etc.) */
  method: string;
  /** Request URL path */
  path: string;
  /** User agent string */
  userAgent?: string;
  /** Client IP address */
  clientIp?: string;
  /** Logger instance with request context */
  logger: Logger;
}

/**
 * Extract correlation ID from request headers
 * Falls back to generating a new one if not found
 */
export function extractCorrelationId(headers: Headers): string {
  for (const headerName of CORRELATION_ID_HEADERS) {
    const value = headers.get(headerName);
    if (value) {
      // For W3C traceparent, extract the trace-id portion
      if (headerName === "traceparent") {
        const parts = value.split("-");
        if (parts.length >= 2) {
          return parts[1];
        }
      }
      return value;
    }
  }
  return generateCorrelationId();
}

/**
 * Extract client IP from request headers
 * Handles common proxy headers
 */
function extractClientIp(headers: Headers): string | undefined {
  // Try various proxy headers in order of preference
  const proxyHeaders = [
    "x-forwarded-for",
    "x-real-ip",
    "cf-connecting-ip", // Cloudflare
    "true-client-ip", // Akamai
  ];

  for (const header of proxyHeaders) {
    const value = headers.get(header);
    if (value) {
      // x-forwarded-for may contain multiple IPs, take the first (client)
      return value.split(",")[0].trim();
    }
  }

  return undefined;
}

/**
 * Create request context from a Request object
 */
export function createRequestContext(request: Request): RequestContext {
  const url = new URL(request.url);
  const correlationId = extractCorrelationId(request.headers);

  return {
    correlationId,
    method: request.method,
    path: url.pathname,
    userAgent: request.headers.get("user-agent") || undefined,
    clientIp: extractClientIp(request.headers),
    logger: createRequestLogger(correlationId),
  };
}

/**
 * Create a logger with additional context for a specific operation
 */
export function createOperationLogger(
  ctx: RequestContext,
  operation: string,
  additionalContext?: LogContext
): Logger {
  return ctx.logger.child({
    operation,
    ...additionalContext,
  });
}

/**
 * Log the start of a request (call at the beginning of route handlers)
 */
export function logRequestStart(ctx: RequestContext): void {
  ctx.logger.info("Request started", {
    method: ctx.method,
    path: ctx.path,
    userAgent: ctx.userAgent,
    clientIp: ctx.clientIp,
  });
}

/**
 * Log the completion of a request
 */
export function logRequestComplete(
  ctx: RequestContext,
  statusCode: number,
  durationMs: number
): void {
  const level = statusCode >= 400 ? "warn" : "info";
  ctx.logger[level]("Request completed", {
    method: ctx.method,
    path: ctx.path,
    statusCode,
    durationMs,
  });
}

/**
 * Log an error during request processing
 */
export function logRequestError(
  ctx: RequestContext,
  error: unknown,
  statusCode: number = 500
): void {
  ctx.logger.error("Request failed", error, {
    method: ctx.method,
    path: ctx.path,
    statusCode,
  });
}

/**
 * Create response headers with correlation ID for client tracing
 */
export function createResponseHeaders(
  correlationId: string,
  additionalHeaders?: Record<string, string>
): Headers {
  const headers = new Headers(additionalHeaders);
  headers.set("x-correlation-id", correlationId);
  return headers;
}

/**
 * Wrap a Response with correlation ID header
 */
export function withCorrelationId(
  response: Response,
  correlationId: string
): Response {
  const headers = new Headers(response.headers);
  headers.set("x-correlation-id", correlationId);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
