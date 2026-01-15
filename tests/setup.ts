import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Cleanup after each test case
afterEach(() => {
  cleanup();
});

// Mock fetch for Node.js environment
if (typeof globalThis.fetch === 'undefined') {
  // @ts-expect-error - fetch will be available in test environment
  globalThis.fetch = async (url: string, options?: RequestInit) => {
    const { default: nodeFetch } = await import('node-fetch');
    return nodeFetch(url, options as any);
  };
}
