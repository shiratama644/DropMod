import { describe, it, expect } from 'vitest';
import { nextDuplicateName } from '@/lib/utils/nextDuplicateName';

describe('nextDuplicateName', () => {
  it('未使用なら name (1)', () => {
    expect(nextDuplicateName('軽量化', ['軽量化'])).toBe('軽量化 (1)');
  });

  it('(1) が埋まっていれば (2)', () => {
    expect(nextDuplicateName('軽量化', ['軽量化', '軽量化 (1)'])).toBe('軽量化 (2)');
  });

  it('末尾の (N) は基準名から外す', () => {
    expect(nextDuplicateName('軽量化 (1)', ['軽量化', '軽量化 (1)'])).toBe('軽量化 (2)');
  });

  it('空文字はフォールバック名', () => {
    expect(nextDuplicateName('   ', [])).toBe('プロファイル (1)');
  });
});
