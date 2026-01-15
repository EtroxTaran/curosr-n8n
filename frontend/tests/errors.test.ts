import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ErrorCode,
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ExternalServiceError,
  TimeoutError,
  DatabaseError,
  isAppError,
  toAppError,
  withErrorHandler,
  successResponse,
  withRetry,
} from '@/lib/errors';

// ============================================
// ErrorCode Constants
// ============================================

describe('ErrorCode', () => {
  it('should have all expected error codes', () => {
    // Validation errors
    expect(ErrorCode.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
    expect(ErrorCode.INVALID_INPUT).toBe('INVALID_INPUT');
    expect(ErrorCode.MISSING_FIELD).toBe('MISSING_FIELD');

    // Authentication errors
    expect(ErrorCode.UNAUTHORIZED).toBe('UNAUTHORIZED');
    expect(ErrorCode.FORBIDDEN).toBe('FORBIDDEN');
    expect(ErrorCode.SESSION_EXPIRED).toBe('SESSION_EXPIRED');

    // Resource errors
    expect(ErrorCode.NOT_FOUND).toBe('NOT_FOUND');
    expect(ErrorCode.CONFLICT).toBe('CONFLICT');
    expect(ErrorCode.DUPLICATE).toBe('DUPLICATE');

    // External service errors
    expect(ErrorCode.SERVICE_UNAVAILABLE).toBe('SERVICE_UNAVAILABLE');
    expect(ErrorCode.EXTERNAL_API_ERROR).toBe('EXTERNAL_API_ERROR');
    expect(ErrorCode.TIMEOUT).toBe('TIMEOUT');

    // Internal errors
    expect(ErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
    expect(ErrorCode.DATABASE_ERROR).toBe('DATABASE_ERROR');
    expect(ErrorCode.UNKNOWN).toBe('UNKNOWN');
  });
});

// ============================================
// AppError Base Class
// ============================================

describe('AppError', () => {
  it('should create error with default values', () => {
    const error = new AppError('Something went wrong');
    expect(error.message).toBe('Something went wrong');
    expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(error.statusCode).toBe(500);
    expect(error.isOperational).toBe(true);
  });

  it('should create error with custom values', () => {
    const error = new AppError(
      'Custom error',
      ErrorCode.VALIDATION_ERROR,
      400,
      { field: 'email' }
    );
    expect(error.message).toBe('Custom error');
    expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(error.statusCode).toBe(400);
    expect(error.details).toEqual({ field: 'email' });
  });

  it('should extend Error', () => {
    const error = new AppError('Test');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
  });

  it('should have stack trace', () => {
    const error = new AppError('Test');
    expect(error.stack).toBeDefined();
  });

  describe('toResponse', () => {
    it('should convert to ErrorResponse format', () => {
      const error = new AppError('Test message', ErrorCode.NOT_FOUND, 404);
      const response = error.toResponse();

      expect(response.error.code).toBe(ErrorCode.NOT_FOUND);
      expect(response.error.message).toBe('Test message');
    });

    it('should include requestId if provided', () => {
      const error = new AppError('Test');
      const response = error.toResponse('req_123');

      expect(response.error.requestId).toBe('req_123');
    });

    it('should include details if present', () => {
      const error = new AppError('Test', ErrorCode.VALIDATION_ERROR, 400, {
        field: 'name',
        reason: 'required',
      });
      const response = error.toResponse();

      expect(response.error.details).toEqual({
        field: 'name',
        reason: 'required',
      });
    });
  });

  describe('toHttpResponse', () => {
    it('should create Response with correct status', () => {
      const error = new AppError('Not found', ErrorCode.NOT_FOUND, 404);
      const response = error.toHttpResponse();

      expect(response.status).toBe(404);
    });

    it('should create JSON response', async () => {
      const error = new AppError('Error message', ErrorCode.VALIDATION_ERROR, 400);
      const response = error.toHttpResponse('req_456');
      const body = await response.json();

      expect(body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(body.error.message).toBe('Error message');
      expect(body.error.requestId).toBe('req_456');
    });
  });
});

// ============================================
// Specialized Error Classes
// ============================================

describe('ValidationError', () => {
  it('should have correct defaults', () => {
    const error = new ValidationError('Invalid input');
    expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(error.statusCode).toBe(400);
  });

  it('should accept details', () => {
    const error = new ValidationError('Invalid email', { field: 'email' });
    expect(error.details).toEqual({ field: 'email' });
  });
});

describe('UnauthorizedError', () => {
  it('should have correct defaults', () => {
    const error = new UnauthorizedError();
    expect(error.message).toBe('Authentication required');
    expect(error.code).toBe(ErrorCode.UNAUTHORIZED);
    expect(error.statusCode).toBe(401);
  });

  it('should accept custom message', () => {
    const error = new UnauthorizedError('Token expired');
    expect(error.message).toBe('Token expired');
  });
});

describe('ForbiddenError', () => {
  it('should have correct defaults', () => {
    const error = new ForbiddenError();
    expect(error.message).toBe('Access denied');
    expect(error.code).toBe(ErrorCode.FORBIDDEN);
    expect(error.statusCode).toBe(403);
  });
});

describe('NotFoundError', () => {
  it('should format message with resource', () => {
    const error = new NotFoundError('Project');
    expect(error.message).toBe('Project not found');
    expect(error.code).toBe(ErrorCode.NOT_FOUND);
    expect(error.statusCode).toBe(404);
  });

  it('should include identifier in message', () => {
    const error = new NotFoundError('User', 'user_123');
    expect(error.message).toBe('User not found: user_123');
  });
});

describe('ConflictError', () => {
  it('should have correct values', () => {
    const error = new ConflictError('Project already exists');
    expect(error.code).toBe(ErrorCode.CONFLICT);
    expect(error.statusCode).toBe(409);
  });
});

describe('ExternalServiceError', () => {
  it('should format message with service name', () => {
    const error = new ExternalServiceError('n8n', 'Connection refused');
    expect(error.message).toBe('n8n: Connection refused');
    expect(error.code).toBe(ErrorCode.EXTERNAL_API_ERROR);
    expect(error.statusCode).toBe(502);
  });

  it('should accept details', () => {
    const error = new ExternalServiceError('S3', 'Upload failed', {
      bucket: 'my-bucket',
      key: 'file.pdf',
    });
    expect(error.details).toEqual({ bucket: 'my-bucket', key: 'file.pdf' });
  });
});

describe('TimeoutError', () => {
  it('should format message with operation and timeout', () => {
    const error = new TimeoutError('Database query', 5000);
    expect(error.message).toBe('Database query timed out after 5000ms');
    expect(error.code).toBe(ErrorCode.TIMEOUT);
    expect(error.statusCode).toBe(504);
    expect(error.details).toEqual({ operation: 'Database query', timeoutMs: 5000 });
  });
});

describe('DatabaseError', () => {
  it('should have correct values', () => {
    const error = new DatabaseError('Connection failed');
    expect(error.code).toBe(ErrorCode.DATABASE_ERROR);
    expect(error.statusCode).toBe(500);
  });
});

// ============================================
// Error Helper Functions
// ============================================

describe('isAppError', () => {
  it('should return true for AppError instances', () => {
    expect(isAppError(new AppError('test'))).toBe(true);
    expect(isAppError(new ValidationError('test'))).toBe(true);
    expect(isAppError(new NotFoundError('Project'))).toBe(true);
  });

  it('should return false for regular errors', () => {
    expect(isAppError(new Error('test'))).toBe(false);
  });

  it('should return false for non-errors', () => {
    expect(isAppError('string')).toBe(false);
    expect(isAppError(null)).toBe(false);
    expect(isAppError(undefined)).toBe(false);
    expect(isAppError({})).toBe(false);
  });
});

describe('toAppError', () => {
  it('should return AppError as-is', () => {
    const original = new ValidationError('test');
    const result = toAppError(original);
    expect(result).toBe(original);
  });

  it('should wrap regular Error', () => {
    const error = new Error('Regular error');
    const result = toAppError(error);

    expect(result).toBeInstanceOf(AppError);
    expect(result.message).toBe('Regular error');
    expect(result.code).toBe(ErrorCode.INTERNAL_ERROR);
  });

  it('should handle string error', () => {
    const result = toAppError('Something bad happened');
    expect(result.message).toBe('Something bad happened');
    expect(result.code).toBe(ErrorCode.UNKNOWN);
  });

  it('should handle unknown error types', () => {
    const result = toAppError({ weird: 'object' });
    expect(result.message).toBe('An unknown error occurred');
    expect(result.code).toBe(ErrorCode.UNKNOWN);
  });
});

describe('withErrorHandler', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return result on success', async () => {
    const handler = () => Promise.resolve({ data: 'success' });
    const result = await withErrorHandler(handler);
    expect(result).toEqual({ data: 'success' });
  });

  it('should convert AppError to Response', async () => {
    const handler = () => Promise.reject(new NotFoundError('Project'));
    const result = await withErrorHandler(handler);

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(404);
  });

  it('should convert regular Error to Response', async () => {
    const handler = () => Promise.reject(new Error('Regular error'));
    const result = await withErrorHandler(handler);

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(500);
  });

  it('should log errors', async () => {
    const handler = () => Promise.reject(new ValidationError('test'));
    await withErrorHandler(handler);

    expect(console.error).toHaveBeenCalled();
  });
});

describe('successResponse', () => {
  it('should create JSON response with 200 status by default', async () => {
    const response = successResponse({ message: 'OK' });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toEqual({ message: 'OK' });
  });

  it('should use custom status code', async () => {
    const response = successResponse({ id: '123' }, 201);
    expect(response.status).toBe(201);
  });
});

// ============================================
// withRetry
// ============================================

describe('withRetry', () => {
  // Use real timers with short delays for reliability

  it('should return result on first success', async () => {
    const operation = vi.fn().mockResolvedValue('success');
    const result = await withRetry(operation);

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and eventually succeed', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockResolvedValue('success');

    const result = await withRetry(operation, {
      maxRetries: 2,
      baseDelayMs: 10, // Short delay for fast tests
    });

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should throw after max retries', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('Always fails'));

    await expect(
      withRetry(operation, { maxRetries: 2, baseDelayMs: 10 })
    ).rejects.toThrow('Always fails');

    expect(operation).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('should call onRetry callback', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('Fail'))
      .mockResolvedValue('success');
    const onRetry = vi.fn();

    await withRetry(operation, {
      maxRetries: 2,
      baseDelayMs: 10,
      onRetry,
    });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1);
  });

  it('should handle non-Error thrown values', async () => {
    const operation = vi.fn().mockRejectedValue('string error');

    await expect(
      withRetry(operation, { maxRetries: 0 })
    ).rejects.toThrow('string error');
  });

  it('should handle zero retries', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('Immediate fail'));

    await expect(
      withRetry(operation, { maxRetries: 0 })
    ).rejects.toThrow('Immediate fail');

    expect(operation).toHaveBeenCalledTimes(1);
  });
});
