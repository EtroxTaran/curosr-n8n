/**
 * Structured Logging Utility
 *
 * Provides consistent, structured logging across the application.
 * In production, outputs JSON for log aggregation systems.
 * In development, outputs human-readable formatted logs.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  /** Request correlation ID for tracing */
  correlationId?: string;
  /** User ID if authenticated */
  userId?: string;
  /** Project ID if in project context */
  projectId?: string;
  /** Additional metadata */
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

// Log level hierarchy for filtering
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Determine current environment
const isDevelopment = process.env.NODE_ENV === "development";
const isTest = process.env.NODE_ENV === "test";

// Minimum log level from environment (default: info in production, debug in development)
const MIN_LOG_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) || (isDevelopment ? "debug" : "info");

/**
 * Format error for logging
 */
function formatError(
  error: unknown
): { name: string; message: string; stack?: string } | undefined {
  if (!error) return undefined;

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: isDevelopment ? error.stack : undefined,
    };
  }

  return {
    name: "UnknownError",
    message: String(error),
  };
}

/**
 * Create a structured log entry
 */
function createLogEntry(
  level: LogLevel,
  message: string,
  context?: LogContext,
  error?: unknown
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    context: context && Object.keys(context).length > 0 ? context : undefined,
    error: formatError(error),
  };
}

/**
 * Output log entry based on environment
 */
function outputLog(entry: LogEntry): void {
  // Skip if below minimum log level
  if (LOG_LEVELS[entry.level] < LOG_LEVELS[MIN_LOG_LEVEL]) {
    return;
  }

  // Suppress logs in test environment unless explicitly enabled
  if (isTest && !process.env.ENABLE_TEST_LOGS) {
    return;
  }

  if (isDevelopment) {
    // Human-readable format for development
    const levelColors: Record<LogLevel, string> = {
      debug: "\x1b[36m", // cyan
      info: "\x1b[32m", // green
      warn: "\x1b[33m", // yellow
      error: "\x1b[31m", // red
    };
    const reset = "\x1b[0m";
    const color = levelColors[entry.level];

    const contextStr = entry.context
      ? ` ${JSON.stringify(entry.context)}`
      : "";

    const timestamp = entry.timestamp.split("T")[1].split(".")[0]; // HH:MM:SS
    const logFn = entry.level === "error" ? console.error : console.log;

    logFn(
      `${color}[${timestamp}] ${entry.level.toUpperCase().padEnd(5)}${reset} ${entry.message}${contextStr}`
    );

    if (entry.error?.stack) {
      console.error(entry.error.stack);
    }
  } else {
    // JSON format for production (log aggregation)
    const logFn = entry.level === "error" ? console.error : console.log;
    logFn(JSON.stringify(entry));
  }
}

/**
 * Logger class with chainable context
 */
export class Logger {
  private context: LogContext;

  constructor(context: LogContext = {}) {
    this.context = context;
  }

  /**
   * Create a child logger with additional context
   */
  child(additionalContext: LogContext): Logger {
    return new Logger({ ...this.context, ...additionalContext });
  }

  /**
   * Log a debug message
   */
  debug(message: string, context?: LogContext): void {
    outputLog(
      createLogEntry("debug", message, { ...this.context, ...context })
    );
  }

  /**
   * Log an info message
   */
  info(message: string, context?: LogContext): void {
    outputLog(createLogEntry("info", message, { ...this.context, ...context }));
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: LogContext): void {
    outputLog(createLogEntry("warn", message, { ...this.context, ...context }));
  }

  /**
   * Log an error message
   */
  error(message: string, error?: unknown, context?: LogContext): void {
    outputLog(
      createLogEntry("error", message, { ...this.context, ...context }, error)
    );
  }
}

// Default logger instance
export const logger = new Logger();

/**
 * Create a logger with request context
 */
export function createRequestLogger(correlationId: string): Logger {
  return new Logger({ correlationId });
}

/**
 * Create a logger for a specific project
 */
export function createProjectLogger(
  projectId: string,
  correlationId?: string
): Logger {
  return new Logger({ projectId, correlationId });
}

/**
 * Generate a correlation ID for request tracing
 */
export function generateCorrelationId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

export default logger;
