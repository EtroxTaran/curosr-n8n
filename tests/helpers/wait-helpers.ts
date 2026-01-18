/**
 * Wait/polling helpers for integration tests
 * Provides utilities for waiting on async conditions
 */

import postgres from 'postgres';
import { S3Client } from '@aws-sdk/client-s3';
import { getProjectState } from './db-helpers';
import { fileExists, downloadContent } from './s3-helpers';

// ============================================
// Types
// ============================================

export interface WaitOptions {
  /** Polling interval in milliseconds */
  intervalMs?: number;
  /** Maximum wait time in milliseconds */
  timeoutMs?: number;
  /** Callback called on each poll */
  onPoll?: (elapsed: number) => void;
  /** Message to show on timeout */
  timeoutMessage?: string;
}

export interface WaitResult<T> {
  success: boolean;
  value?: T;
  elapsedMs: number;
  polls: number;
}

const DEFAULT_OPTIONS: Required<Omit<WaitOptions, 'onPoll' | 'timeoutMessage'>> = {
  intervalMs: 1000,
  timeoutMs: 60000,
};

// ============================================
// Core Wait Utilities
// ============================================

/**
 * Wait for a condition to become true
 */
export async function waitForCondition(
  condition: () => Promise<boolean>,
  options?: WaitOptions
): Promise<WaitResult<boolean>> {
  const {
    intervalMs = DEFAULT_OPTIONS.intervalMs,
    timeoutMs = DEFAULT_OPTIONS.timeoutMs,
    onPoll,
    timeoutMessage,
  } = options || {};

  const startTime = Date.now();
  let polls = 0;

  while (Date.now() - startTime < timeoutMs) {
    polls++;
    const elapsed = Date.now() - startTime;

    if (onPoll) {
      onPoll(elapsed);
    }

    try {
      const result = await condition();
      if (result) {
        return {
          success: true,
          value: true,
          elapsedMs: Date.now() - startTime,
          polls,
        };
      }
    } catch (err) {
      // Log error but continue polling
      console.debug(`Poll ${polls} failed:`, err);
    }

    await sleep(intervalMs);
  }

  if (timeoutMessage) {
    console.warn(`Timeout: ${timeoutMessage} (after ${timeoutMs}ms, ${polls} polls)`);
  }

  return {
    success: false,
    elapsedMs: Date.now() - startTime,
    polls,
  };
}

/**
 * Wait for a value to be returned (non-null)
 */
export async function waitForValue<T>(
  getter: () => Promise<T | null | undefined>,
  options?: WaitOptions
): Promise<WaitResult<T>> {
  const {
    intervalMs = DEFAULT_OPTIONS.intervalMs,
    timeoutMs = DEFAULT_OPTIONS.timeoutMs,
    onPoll,
    timeoutMessage,
  } = options || {};

  const startTime = Date.now();
  let polls = 0;

  while (Date.now() - startTime < timeoutMs) {
    polls++;
    const elapsed = Date.now() - startTime;

    if (onPoll) {
      onPoll(elapsed);
    }

    try {
      const value = await getter();
      if (value !== null && value !== undefined) {
        return {
          success: true,
          value,
          elapsedMs: Date.now() - startTime,
          polls,
        };
      }
    } catch (err) {
      console.debug(`Poll ${polls} failed:`, err);
    }

    await sleep(intervalMs);
  }

  if (timeoutMessage) {
    console.warn(`Timeout: ${timeoutMessage} (after ${timeoutMs}ms, ${polls} polls)`);
  }

  return {
    success: false,
    elapsedMs: Date.now() - startTime,
    polls,
  };
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options?: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
    shouldRetry?: (error: Error) => boolean;
  }
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    backoffMultiplier = 2,
    shouldRetry = () => true,
  } = options || {};

  let lastError: Error | null = null;
  let delay = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt === maxRetries || !shouldRetry(lastError)) {
        throw lastError;
      }

      console.debug(`Retry ${attempt + 1}/${maxRetries} after ${delay}ms:`, lastError.message);
      await sleep(delay);
      delay = Math.min(delay * backoffMultiplier, maxDelayMs);
    }
  }

  throw lastError;
}

// ============================================
// Project State Waiting
// ============================================

/**
 * Wait for project to reach a specific phase
 */
export async function waitForProjectPhase(
  db: ReturnType<typeof postgres>,
  projectId: string,
  expectedPhase: number,
  options?: WaitOptions
): Promise<WaitResult<{
  phase: number;
  status: string;
}>> {
  return waitForValue(
    async () => {
      const state = await getProjectState(db, projectId);
      if (state && state.current_phase >= expectedPhase) {
        return {
          phase: state.current_phase,
          status: state.phase_status,
        };
      }
      return null;
    },
    {
      ...options,
      timeoutMessage: `Project ${projectId} to reach phase ${expectedPhase}`,
    }
  );
}

/**
 * Wait for project to complete
 */
export async function waitForProjectCompletion(
  db: ReturnType<typeof postgres>,
  projectId: string,
  options?: WaitOptions
): Promise<WaitResult<{
  phase: number;
  status: string;
  completedAt: Date | null;
}>> {
  return waitForValue(
    async () => {
      const state = await getProjectState(db, projectId);
      if (state && state.phase_status === 'completed') {
        return {
          phase: state.current_phase,
          status: state.phase_status,
          completedAt: state.completed_at,
        };
      }
      return null;
    },
    {
      ...options,
      timeoutMessage: `Project ${projectId} to complete`,
    }
  );
}

/**
 * Wait for project to have specific status
 */
export async function waitForProjectStatus(
  db: ReturnType<typeof postgres>,
  projectId: string,
  expectedStatus: string,
  options?: WaitOptions
): Promise<WaitResult<{
  phase: number;
  status: string;
}>> {
  return waitForValue(
    async () => {
      const state = await getProjectState(db, projectId);
      if (state && state.phase_status === expectedStatus) {
        return {
          phase: state.current_phase,
          status: state.phase_status,
        };
      }
      return null;
    },
    {
      ...options,
      timeoutMessage: `Project ${projectId} to have status ${expectedStatus}`,
    }
  );
}

/**
 * Wait for project iteration score to meet threshold
 */
export async function waitForScoreThreshold(
  db: ReturnType<typeof postgres>,
  projectId: string,
  threshold: number,
  options?: WaitOptions
): Promise<WaitResult<{
  phase: number;
  iteration: number;
  score: number;
}>> {
  return waitForValue(
    async () => {
      const state = await getProjectState(db, projectId);
      if (
        state &&
        state.last_iteration_score !== null &&
        state.last_iteration_score >= threshold
      ) {
        return {
          phase: state.last_iteration_phase || 0,
          iteration: state.last_iteration_number || 0,
          score: state.last_iteration_score,
        };
      }
      return null;
    },
    {
      ...options,
      timeoutMessage: `Project ${projectId} to reach score ${threshold}`,
    }
  );
}

// ============================================
// S3 Artifact Waiting
// ============================================

/**
 * Wait for file to exist in S3
 */
export async function waitForFile(
  s3Client: S3Client,
  key: string,
  options?: WaitOptions
): Promise<WaitResult<boolean>> {
  return waitForCondition(() => fileExists(s3Client, key), {
    ...options,
    timeoutMessage: `File ${key} to exist`,
  });
}

/**
 * Wait for artifact file to exist
 */
export async function waitForArtifact(
  s3Client: S3Client,
  projectId: string,
  artifactName: string,
  options?: WaitOptions
): Promise<WaitResult<string>> {
  const key = `projects/${projectId}/artifacts/${artifactName}`;

  return waitForValue(
    async () => {
      const exists = await fileExists(s3Client, key);
      if (exists) {
        const content = await downloadContent(s3Client, key);
        return content;
      }
      return null;
    },
    {
      ...options,
      timeoutMessage: `Artifact ${artifactName} for project ${projectId}`,
    }
  );
}

/**
 * Wait for vision document to be finalized
 */
export async function waitForVisionFinal(
  s3Client: S3Client,
  projectId: string,
  options?: WaitOptions
): Promise<WaitResult<string>> {
  return waitForArtifact(s3Client, projectId, 'ProductVision_FINAL.md', options);
}

/**
 * Wait for architecture document to be finalized
 */
export async function waitForArchitectureFinal(
  s3Client: S3Client,
  projectId: string,
  options?: WaitOptions
): Promise<WaitResult<string>> {
  return waitForArtifact(s3Client, projectId, 'Architecture_FINAL.md', options);
}

/**
 * Wait for decision log to exist
 */
export async function waitForDecisionLog(
  s3Client: S3Client,
  projectId: string,
  options?: WaitOptions
): Promise<WaitResult<string>> {
  return waitForArtifact(s3Client, projectId, 'decision_log.md', options);
}

// ============================================
// HTTP/Webhook Waiting
// ============================================

/**
 * Wait for HTTP endpoint to be available
 */
export async function waitForEndpoint(
  url: string,
  options?: WaitOptions & {
    expectedStatus?: number;
    method?: 'GET' | 'HEAD';
  }
): Promise<WaitResult<number>> {
  const { expectedStatus = 200, method = 'GET', ...waitOptions } = options || {};

  return waitForValue(
    async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(url, {
          method,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.status === expectedStatus) {
          return response.status;
        }
        return null;
      } catch {
        return null;
      }
    },
    {
      ...waitOptions,
      timeoutMessage: `Endpoint ${url} to return ${expectedStatus}`,
    }
  );
}

/**
 * Wait for webhook to receive a call (requires mock server)
 */
export async function waitForWebhookCall(
  getCallsFn: () => unknown[],
  expectedCount = 1,
  options?: WaitOptions
): Promise<WaitResult<unknown[]>> {
  return waitForValue(
    async () => {
      const calls = getCallsFn();
      if (calls.length >= expectedCount) {
        return calls;
      }
      return null;
    },
    {
      ...options,
      timeoutMessage: `Webhook to receive ${expectedCount} call(s)`,
    }
  );
}

// ============================================
// Composite Waiting
// ============================================

/**
 * Wait for multiple conditions to be true
 */
export async function waitForAll(
  conditions: Array<{
    name: string;
    check: () => Promise<boolean>;
  }>,
  options?: WaitOptions
): Promise<WaitResult<string[]>> {
  const results: string[] = [];

  return waitForValue(
    async () => {
      const checks = await Promise.all(
        conditions.map(async ({ name, check }) => ({
          name,
          passed: await check(),
        }))
      );

      const allPassed = checks.every((c) => c.passed);
      const passed = checks.filter((c) => c.passed).map((c) => c.name);

      if (allPassed) {
        return passed;
      }

      return null;
    },
    {
      ...options,
      timeoutMessage: `All conditions to pass: ${conditions.map((c) => c.name).join(', ')}`,
    }
  );
}

/**
 * Wait for any of multiple conditions to be true
 */
export async function waitForAny(
  conditions: Array<{
    name: string;
    check: () => Promise<boolean>;
  }>,
  options?: WaitOptions
): Promise<WaitResult<string>> {
  return waitForValue(
    async () => {
      for (const { name, check } of conditions) {
        try {
          if (await check()) {
            return name;
          }
        } catch {
          // Continue to next condition
        }
      }
      return null;
    },
    {
      ...options,
      timeoutMessage: `Any condition to pass: ${conditions.map((c) => c.name).join(', ')}`,
    }
  );
}

// ============================================
// Utility Functions
// ============================================

/**
 * Create a timeout promise that rejects after specified time
 */
export function createTimeout(ms: number, message?: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(message || `Operation timed out after ${ms}ms`));
    }, ms);
  });
}

/**
 * Race a promise against a timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message?: string
): Promise<T> {
  return Promise.race([promise, createTimeout(ms, message)]);
}

/**
 * Create a deferred promise (resolvable/rejectable externally)
 */
export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}
