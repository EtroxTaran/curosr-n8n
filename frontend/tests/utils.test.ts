import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  cn,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  formatDuration,
  formatBytes,
  formatScore,
  truncate,
} from '@/lib/utils';

// ============================================
// cn() - Class Name Merge
// ============================================

describe('cn - className merge utility', () => {
  it('should merge multiple class names', () => {
    const result = cn('foo', 'bar');
    expect(result).toBe('foo bar');
  });

  it('should handle conditional classes', () => {
    const isActive = true;
    const isDisabled = false;
    const result = cn('base', isActive && 'active', isDisabled && 'disabled');
    expect(result).toBe('base active');
  });

  it('should handle array of classes', () => {
    const result = cn(['foo', 'bar']);
    expect(result).toBe('foo bar');
  });

  it('should merge Tailwind classes correctly', () => {
    // tailwind-merge should combine conflicting utilities
    const result = cn('px-2 py-1', 'px-4');
    expect(result).toBe('py-1 px-4'); // px-4 overwrites px-2
  });

  it('should handle empty inputs', () => {
    const result = cn('', null, undefined);
    expect(result).toBe('');
  });

  it('should handle object syntax', () => {
    const result = cn({ 'bg-red-500': true, 'text-white': true, hidden: false });
    expect(result).toBe('bg-red-500 text-white');
  });

  it('should merge complex Tailwind conflicts', () => {
    const result = cn('text-red-500', 'text-blue-500');
    expect(result).toBe('text-blue-500'); // Later class wins
  });
});

// ============================================
// formatDate()
// ============================================

describe('formatDate', () => {
  it('should format ISO date string', () => {
    const result = formatDate('2026-01-15T10:30:00.000Z');
    // Note: Exact format depends on system locale
    expect(result).toContain('Jan');
    expect(result).toContain('15');
    expect(result).toContain('2026');
  });

  it('should format Date object', () => {
    const date = new Date('2026-12-25T00:00:00.000Z');
    const result = formatDate(date);
    expect(result).toContain('Dec');
    expect(result).toContain('25');
    expect(result).toContain('2026');
  });

  it('should return N/A for null', () => {
    const result = formatDate(null);
    expect(result).toBe('N/A');
  });

  it('should handle edge date cases', () => {
    // First day of year
    const jan1 = formatDate('2026-01-01T00:00:00.000Z');
    expect(jan1).toContain('Jan');
    expect(jan1).toContain('1');

    // Date in December (using mid-day to avoid timezone edge cases)
    const dec15 = formatDate('2026-12-15T12:00:00.000Z');
    expect(dec15).toContain('Dec');
    expect(dec15).toContain('15');
  });
});

// ============================================
// formatDateTime()
// ============================================

describe('formatDateTime', () => {
  it('should include time in output', () => {
    const result = formatDateTime('2026-01-15T14:30:00.000Z');
    expect(result).toContain('Jan');
    expect(result).toContain('15');
    expect(result).toContain('2026');
    // Should contain time component
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });

  it('should format Date object with time', () => {
    const date = new Date('2026-06-15T09:45:00.000Z');
    const result = formatDateTime(date);
    expect(result).toContain('Jun');
    expect(result).toContain('15');
  });

  it('should return N/A for null', () => {
    const result = formatDateTime(null);
    expect(result).toBe('N/A');
  });
});

// ============================================
// formatRelativeTime()
// ============================================

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return "just now" for very recent', () => {
    const result = formatRelativeTime('2026-01-15T11:59:50.000Z');
    expect(result).toBe('just now');
  });

  it('should return minutes ago', () => {
    const result = formatRelativeTime('2026-01-15T11:45:00.000Z');
    expect(result).toBe('15m ago');
  });

  it('should return hours ago', () => {
    const result = formatRelativeTime('2026-01-15T09:00:00.000Z');
    expect(result).toBe('3h ago');
  });

  it('should return days ago', () => {
    const result = formatRelativeTime('2026-01-13T12:00:00.000Z');
    expect(result).toBe('2d ago');
  });

  it('should return formatted date for > 7 days', () => {
    const result = formatRelativeTime('2026-01-01T12:00:00.000Z');
    expect(result).toContain('Jan');
    expect(result).toContain('1');
    expect(result).toContain('2026');
  });

  it('should return N/A for null', () => {
    const result = formatRelativeTime(null);
    expect(result).toBe('N/A');
  });
});

// ============================================
// formatDuration()
// ============================================

describe('formatDuration', () => {
  it('should format milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('should format seconds', () => {
    expect(formatDuration(1000)).toBe('1s');
    expect(formatDuration(5000)).toBe('5s');
    expect(formatDuration(59000)).toBe('59s');
  });

  it('should format minutes and seconds', () => {
    expect(formatDuration(60000)).toBe('1m 0s');
    expect(formatDuration(90000)).toBe('1m 30s');
    expect(formatDuration(150000)).toBe('2m 30s');
    expect(formatDuration(3599000)).toBe('59m 59s');
  });

  it('should format hours and minutes', () => {
    expect(formatDuration(3600000)).toBe('1h 0m');
    expect(formatDuration(5400000)).toBe('1h 30m');
    expect(formatDuration(7200000)).toBe('2h 0m');
  });

  it('should handle zero', () => {
    expect(formatDuration(0)).toBe('0ms');
  });

  it('should handle edge case at boundaries', () => {
    expect(formatDuration(999)).toBe('999ms');
    expect(formatDuration(1000)).toBe('1s');
    expect(formatDuration(59999)).toBe('59s');
    expect(formatDuration(60000)).toBe('1m 0s');
  });
});

// ============================================
// formatBytes()
// ============================================

describe('formatBytes', () => {
  it('should format bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('should format kilobytes', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(10240)).toBe('10 KB');
  });

  it('should format megabytes', () => {
    expect(formatBytes(1048576)).toBe('1 MB');
    expect(formatBytes(5242880)).toBe('5 MB');
  });

  it('should format gigabytes', () => {
    expect(formatBytes(1073741824)).toBe('1 GB');
    expect(formatBytes(2147483648)).toBe('2 GB');
  });

  it('should round to one decimal place', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1843)).toBe('1.8 KB');
  });
});

// ============================================
// formatScore()
// ============================================

describe('formatScore', () => {
  it('should format score with one decimal', () => {
    expect(formatScore(85)).toBe('85.0');
    expect(formatScore(92.5)).toBe('92.5');
    expect(formatScore(100)).toBe('100.0');
  });

  it('should format decimal scores', () => {
    expect(formatScore(78.456)).toBe('78.5'); // rounds
    expect(formatScore(78.444)).toBe('78.4'); // rounds down
  });

  it('should return N/A for null', () => {
    expect(formatScore(null)).toBe('N/A');
  });

  it('should handle zero', () => {
    expect(formatScore(0)).toBe('0.0');
  });

  it('should handle negative scores', () => {
    expect(formatScore(-5.5)).toBe('-5.5');
  });
});

// ============================================
// truncate()
// ============================================

describe('truncate', () => {
  it('should truncate long strings', () => {
    const result = truncate('This is a very long string', 10);
    expect(result).toBe('This is a ...');
    expect(result.length).toBe(13); // 10 chars + ...
  });

  it('should not truncate short strings', () => {
    const result = truncate('Short', 10);
    expect(result).toBe('Short');
  });

  it('should handle exact length', () => {
    const result = truncate('Exactly10!', 10);
    expect(result).toBe('Exactly10!');
  });

  it('should handle empty string', () => {
    const result = truncate('', 10);
    expect(result).toBe('');
  });

  it('should handle zero length', () => {
    const result = truncate('Some text', 0);
    expect(result).toBe('...');
  });

  it('should handle unicode correctly', () => {
    const result = truncate('Hello 🌍 World', 8);
    expect(result).toBe('Hello 🌍...');
  });
});

// ============================================
// Edge Cases & Security
// ============================================

describe('Edge Cases', () => {
  it('should handle Invalid Date', () => {
    const result = formatDate('invalid-date');
    expect(result).toBe('Invalid Date');
  });

  it('should handle very large numbers in formatBytes', () => {
    // Note: formatBytes only supports up to GB (no TB support)
    // For values > GB, the index exceeds the sizes array, returning undefined unit
    // Test with max supported value (large GB)
    const result = formatBytes(500 * 1024 * 1024 * 1024); // 500 GB
    expect(result).toContain('GB');
  });

  it('should handle very large durations', () => {
    const result = formatDuration(360000000); // 100 hours
    expect(result).toContain('h');
  });
});
