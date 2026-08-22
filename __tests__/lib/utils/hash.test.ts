import { describe, it, expect } from 'vitest';
import {
  isWebCryptoAvailable,
  calculateSha1,
  InsecureContextError
} from '@/lib/utils/hash';

describe('isWebCryptoAvailable', () => {
  it('returns true in jsdom (node crypto is available)', () => {
    // vitest の jsdom + node 22 は crypto.subtle が使える
    expect(isWebCryptoAvailable()).toBe(true);
  });
});

describe('calculateSha1', () => {
  it('computes correct SHA-1 for empty buffer', async () => {
    const buf = new ArrayBuffer(0);
    const hash = await calculateSha1(buf);
    // SHA-1 of empty string
    expect(hash).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
  });

  it('computes correct SHA-1 for "abc"', async () => {
    const buf = new TextEncoder().encode('abc').buffer as ArrayBuffer;
    const hash = await calculateSha1(buf);
    // SHA-1("abc") = a9993e364706816aba3e25717850c26c9cd0d89d
    expect(hash).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
  });

  it('returns 40-char hex string', async () => {
    const buf = new TextEncoder().encode('hello world').buffer as ArrayBuffer;
    const hash = await calculateSha1(buf);
    expect(hash).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe('InsecureContextError', () => {
  it('has proper name and message', () => {
    const e = new InsecureContextError();
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('InsecureContextError');
    expect(e.message).toContain('Web Crypto');
  });
});
