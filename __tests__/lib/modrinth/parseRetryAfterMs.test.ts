import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseRetryAfterMs } from '@/lib/modrinth/server';

describe('parseRetryAfterMs', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null for null / empty string', () => {
    expect(parseRetryAfterMs(null)).toBeNull();
    expect(parseRetryAfterMs('')).toBeNull();
  });

  it('parses number of seconds and converts to ms (capped at 8000)', () => {
    expect(parseRetryAfterMs('5')).toBe(5000);
    expect(parseRetryAfterMs('0')).toBe(0);
    // 30s → 30000ms だが Vercel Hobby 10s timeout 対応で 8000 に clamp
    expect(parseRetryAfterMs('30')).toBe(8000);
  });

  it('handles fractional seconds', () => {
    expect(parseRetryAfterMs('2.5')).toBe(2500);
  });

  it('rejects negative numbers (returns null)', () => {
    expect(parseRetryAfterMs('-5')).toBeNull();
  });

  it('parses HTTP-date and returns diff in ms (capped)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    // 5 秒後
    const future = new Date('2026-01-01T00:00:05Z').toUTCString();
    expect(parseRetryAfterMs(future)).toBe(5000);

    // 100 秒後 → 100_000ms だが 8000 に clamp
    const farFuture = new Date('2026-01-01T00:01:40Z').toUTCString();
    expect(parseRetryAfterMs(farFuture)).toBe(8000);
  });

  it('past date returns null (no wait needed)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const past = new Date('2025-12-31T23:59:00Z').toUTCString();
    expect(parseRetryAfterMs(past)).toBeNull();
  });

  it('returns null for unparseable garbage', () => {
    expect(parseRetryAfterMs('not-a-date')).toBeNull();
  });
});
