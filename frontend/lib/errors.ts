/**
 * Structured Error Handling Utilities
 *
 * This module provides type-safe error classes and handling utilities
 * following best practices for 2025-2026:
 * - Structured error types with error codes
 * - Consistent error responses across API routes
 * - Serializable errors for client/server boundary
 */

/**
 * Error codes for categorizing errors
 * These help with error tracking and user-facing messages
 */
export const ErrorCode = {
  // Validation errors
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_INPUT: "INVALID_INPUT",
  MISSING_FIELD: "MISSING_FIELD",

  // Authentication errors
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  SESSION_EXPIRED: "SESSION_EXPIRED",

  // Resource errors
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  DUPLICATE: "DUPLICATE",

  // External service errors
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  EXTERNAL_API_ERROR: "EXTERNAL_API_ERROR",
  TIMEOUT: "TIMEOUT",

  // Internal errors
  INTERNAL_ERROR: "INTERNAL_ERROR",
  DATABASE_ERROR: "DATABASE_ERROR",
  UNKNOWN: "UNKNOWN",
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Structured error response format
 * This is what gets sent to clients
 */
export interface ErrorResponse {
  error: {
    code: ErrorCodeType;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
  };
}

/**
 * Base class for application errors
 * All custom errors should extend this
 */
export class AppError extends Error {
  public readonly code: ErrorCodeType;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    code: ErrorCodeType = ErrorCode.INTERNAL_ERROR,
    statusCode: number = 500,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true; // Operational errors are expected and handled

    // Maintain proper stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert to JSON-serializable error response
   */
  toResponse(requestId?: string): ErrorResponse {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
        requestId,
      },
    };
  }

  /**
   * Convert to Response object for API routes
   */
  toHttpResponse(requestId?: string): Response {
    return Response.json(this.toResponse(requestId), {
      status: this.statusCode,
    });
  }
}

/**
 * Validation error for invalid input data
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ErrorCode.VALIDATION_ERROR, 400, details);
  }
}

/**
 * Authentication error for unauthorized access
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = "Authentication required") {
    super(message, ErrorCode.UNAUTHORIZED, 401);
  }
}

/**
 * Forbidden error for access control violations
 */
export class ForbiddenError extends AppError {
  constructor(message: string = "Access denied") {
    super(message, ErrorCode.FORBIDDEN, 403);
  }
}

/**
 * Not found error for missing resources
 */
export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    const message = identifier
      ? `${resource} not found: ${identifier}`
      : `${resource} not found`;
    super(message, ErrorCode.NOT_FOUND, 404);
  }
}

/**
 * Conflict error for duplicate resources
 */
export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ErrorCode.CONFLICT, 409, details);
  }
}

/**
 * External service error for third-party API failures
 */
export class ExternalServiceError extends AppError {
  constructor(
    service: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(`${service}: ${message}`, ErrorCode.EXTERNAL_API_ERROR, 502, details);
  }
}

/**
 * Timeout error for operations that take too long
 */
export class TimeoutError extends AppError {
  constructor(operation: string, timeoutMs: number) {
    super(
      `${operation} timed out after ${timeoutMs}ms`,
      ErrorCode.TIMEOUT,
      504,
      { operation, timeoutMs }
    );
  }
}

/**
 * Database error for database operation failures
 */
export class DatabaseError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ErrorCode.DATABASE_ERROR, 500, details);
  }
}

/**
 * Check if an error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Convert any error to an AppError
 * Use this to ensure consistent error handling
 */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError(
      error.message,
      ErrorCode.INTERNAL_ERROR,
      500,
      process.env.NODE_ENV === "development"
        ? { stack: error.stack }
        : undefined
    );
  }

  return new AppError(
    typeof error === "string" ? error : "An unknown error occurred",
    ErrorCode.UNKNOWN,
    500
  );
}

/**
 * Error handler wrapper for API routes
 * Wraps async handlers and converts errors to proper responses
 */
export function withErrorHandler<T>(
  handler: () => Promise<T>
): Promise<T | Response> {
  return handler().catch((error) => {
    const appError = toAppError(error);

    // Log error for monitoring
    console.error(`[${appError.code}] ${appError.message}`, {
      statusCode: appError.statusCode,
      details: appError.details,
      stack: appError.stack,
    });

    return appError.toHttpResponse();
  });
}

/**
 * Create a standardized success response
 */
export function successResponse<T>(
  data: T,
  status: number = 200
): Response {
  return Response.json(data, { status });
}

/**
 * Retry helper with exponential backoff
 * Use for external service calls that may transiently fail
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    onRetry?: (error: Error, attempt: number) => void;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    onRetry,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
        // Add jitter (±20%)
        const jitter = delay * 0.2 * (Math.random() * 2 - 1);
        const finalDelay = Math.round(delay + jitter);

        if (onRetry) {
          onRetry(lastError, attempt + 1);
        }

        await new Promise((resolve) => setTimeout(resolve, finalDelay));
      }
    }
  }

  throw lastError;
}
