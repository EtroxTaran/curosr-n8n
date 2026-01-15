import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  extractCorrelationId,
  createRequestContext,
  createResponseHeaders,
  withCorrelationId,
  logRequestStart,
  logRequestComplete,
  logRequestError,
  CORRELATION_ID_HEADERS,
} from '@/lib/request-context';

// Mock console methods
const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

beforeEach(() => {
  process.env.ENABLE_TEST_LOGS = 'true';
  process.env.NODE_ENV = 'development';
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.ENABLE_TEST_LOGS;
  process.env.NODE_ENV = 'test';
});

describe('extractCorrelationId', () => {
  it('should extract x-correlation-id header', () => {
    const headers = new Headers();
    headers.set('x-correlation-id', 'test-correlation-123');

    const result = extractCorrelationId(headers);
    expect(result).toBe('test-correlation-123');
  });

  it('should extract x-request-id header', () => {
    const headers = new Headers();
    headers.set('x-request-id', 'request-456');

    const result = extractCorrelationId(headers);
    expect(result).toBe('request-456');
  });

  it('should extract x-trace-id header', () => {
    const headers = new Headers();
    headers.set('x-trace-id', 'trace-789');

    const result = extractCorrelationId(headers);
    expect(result).toBe('trace-789');
  });

  it('should extract trace-id from W3C traceparent header', () => {
    const headers = new Headers();
    // W3C Trace Context format: version-trace_id-parent_id-trace_flags
    headers.set('traceparent', '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');

    const result = extractCorrelationId(headers);
    expect(result).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
  });

  it('should prioritize x-correlation-id over other headers', () => {
    const headers = new Headers();
    headers.set('x-correlation-id', 'correlation-first');
    headers.set('x-request-id', 'request-second');
    headers.set('x-trace-id', 'trace-third');

    const result = extractCorrelationId(headers);
    expect(result).toBe('correlation-first');
  });

  it('should generate new ID when no correlation header exists', () => {
    const headers = new Headers();

    const result = extractCorrelationId(headers);
    expect(result).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
  });

  it('should generate unique IDs for different requests', () => {
    const headers = new Headers();

    const id1 = extractCorrelationId(headers);
    const id2 = extractCorrelationId(headers);

    expect(id1).not.toBe(id2);
  });
});

describe('createRequestContext', () => {
  it('should create context from request', () => {
    const request = new Request('https://example.com/api/test', {
      method: 'POST',
      headers: {
        'x-correlation-id': 'ctx-123',
        'user-agent': 'Test Agent/1.0',
      },
    });

    const ctx = createRequestContext(request);

    expect(ctx.correlationId).toBe('ctx-123');
    expect(ctx.method).toBe('POST');
    expect(ctx.path).toBe('/api/test');
    expect(ctx.userAgent).toBe('Test Agent/1.0');
    expect(ctx.logger).toBeDefined();
  });

  it('should extract client IP from x-forwarded-for', () => {
    const request = new Request('https://example.com/api/test', {
      method: 'GET',
      headers: {
        'x-forwarded-for': '192.168.1.1, 10.0.0.1',
      },
    });

    const ctx = createRequestContext(request);
    expect(ctx.clientIp).toBe('192.168.1.1');
  });

  it('should extract client IP from cf-connecting-ip (Cloudflare)', () => {
    const request = new Request('https://example.com/api/test', {
      method: 'GET',
      headers: {
        'cf-connecting-ip': '203.0.113.195',
      },
    });

    const ctx = createRequestContext(request);
    expect(ctx.clientIp).toBe('203.0.113.195');
  });

  it('should handle request without user-agent', () => {
    const request = new Request('https://example.com/api/test');

    const ctx = createRequestContext(request);
    expect(ctx.userAgent).toBeUndefined();
  });

  it('should generate correlation ID when none provided', () => {
    const request = new Request('https://example.com/api/test');

    const ctx = createRequestContext(request);
    expect(ctx.correlationId).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
  });
});

describe('createResponseHeaders', () => {
  it('should create headers with correlation ID', () => {
    const headers = createResponseHeaders('resp-correlation-123');

    expect(headers.get('x-correlation-id')).toBe('resp-correlation-123');
  });

  it('should include additional headers', () => {
    const headers = createResponseHeaders('resp-123', {
      'Content-Type': 'application/json',
      'X-Custom-Header': 'custom-value',
    });

    expect(headers.get('x-correlation-id')).toBe('resp-123');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-Custom-Header')).toBe('custom-value');
  });
});

describe('withCorrelationId', () => {
  it('should add correlation ID to response', () => {
    const originalResponse = new Response(JSON.stringify({ data: 'test' }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const newResponse = withCorrelationId(originalResponse, 'wrapped-123');

    expect(newResponse.headers.get('x-correlation-id')).toBe('wrapped-123');
    expect(newResponse.headers.get('Content-Type')).toBe('application/json');
    expect(newResponse.status).toBe(200);
  });

  it('should preserve response body', async () => {
    const body = { message: 'Hello' };
    const originalResponse = new Response(JSON.stringify(body), {
      status: 200,
    });

    const newResponse = withCorrelationId(originalResponse, 'body-test');
    const responseBody = await newResponse.json();

    expect(responseBody).toEqual(body);
  });

  it('should preserve status code', () => {
    const originalResponse = new Response(null, { status: 404 });

    const newResponse = withCorrelationId(originalResponse, 'status-test');
    expect(newResponse.status).toBe(404);
  });

  it('should preserve status text', () => {
    const originalResponse = new Response(null, {
      status: 404,
      statusText: 'Not Found',
    });

    const newResponse = withCorrelationId(originalResponse, 'status-text-test');
    expect(newResponse.statusText).toBe('Not Found');
  });
});

describe('logRequestStart', () => {
  it('should log request start information', () => {
    const request = new Request('https://example.com/api/users', {
      method: 'GET',
      headers: {
        'x-correlation-id': 'log-start-123',
        'user-agent': 'TestAgent',
      },
    });
    const ctx = createRequestContext(request);

    logRequestStart(ctx);

    expect(consoleLogSpy).toHaveBeenCalled();
    const call = consoleLogSpy.mock.calls[0][0];
    expect(call).toContain('Request started');
    expect(call).toContain('GET');
    expect(call).toContain('/api/users');
  });
});

describe('logRequestComplete', () => {
  it('should log successful request completion', () => {
    const request = new Request('https://example.com/api/test', {
      method: 'POST',
      headers: { 'x-correlation-id': 'complete-123' },
    });
    const ctx = createRequestContext(request);

    logRequestComplete(ctx, 200, 150);

    expect(consoleLogSpy).toHaveBeenCalled();
    const call = consoleLogSpy.mock.calls[0][0];
    expect(call).toContain('Request completed');
    expect(call).toContain('200');
    expect(call).toContain('150');
  });

  it('should log error status codes as warnings', () => {
    const request = new Request('https://example.com/api/test', {
      method: 'GET',
      headers: { 'x-correlation-id': 'error-status-123' },
    });
    const ctx = createRequestContext(request);

    logRequestComplete(ctx, 500, 50);

    expect(consoleLogSpy).toHaveBeenCalled();
    const call = consoleLogSpy.mock.calls[0][0];
    // Error status codes (>= 400) are logged at warn level
    expect(call).toMatch(/warn/i);
    expect(call).toContain('500');
  });

  it('should log 4xx status codes as warnings', () => {
    const request = new Request('https://example.com/api/test', {
      method: 'GET',
      headers: { 'x-correlation-id': '4xx-123' },
    });
    const ctx = createRequestContext(request);

    logRequestComplete(ctx, 400, 30);

    expect(consoleLogSpy).toHaveBeenCalled();
    const call = consoleLogSpy.mock.calls[0][0];
    expect(call).toMatch(/warn/i);
  });
});

describe('logRequestError', () => {
  it('should log request errors', () => {
    const request = new Request('https://example.com/api/test', {
      method: 'POST',
      headers: { 'x-correlation-id': 'req-error-123' },
    });
    const ctx = createRequestContext(request);
    const error = new Error('Database connection failed');

    logRequestError(ctx, error, 500);

    expect(consoleErrorSpy).toHaveBeenCalled();
    const call = consoleErrorSpy.mock.calls[0][0];
    expect(call).toContain('Request failed');
  });

  it('should use default status code of 500', () => {
    const request = new Request('https://example.com/api/test', {
      headers: { 'x-correlation-id': 'default-status' },
    });
    const ctx = createRequestContext(request);

    logRequestError(ctx, new Error('test'));

    expect(consoleErrorSpy).toHaveBeenCalled();
    const call = consoleErrorSpy.mock.calls[0][0];
    expect(call).toContain('500');
  });
});

describe('CORRELATION_ID_HEADERS', () => {
  it('should contain expected header names', () => {
    expect(CORRELATION_ID_HEADERS).toContain('x-correlation-id');
    expect(CORRELATION_ID_HEADERS).toContain('x-request-id');
    expect(CORRELATION_ID_HEADERS).toContain('x-trace-id');
    expect(CORRELATION_ID_HEADERS).toContain('traceparent');
  });

  it('should be in priority order', () => {
    // x-correlation-id should be checked first
    expect(CORRELATION_ID_HEADERS[0]).toBe('x-correlation-id');
  });
});
