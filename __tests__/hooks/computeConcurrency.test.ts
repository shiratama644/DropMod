import { describe, it, expect, vi, afterEach } from 'vitest';
import { computeConcurrency } from '@/hooks/useZipExport';

describe('computeConcurrency', () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    // jsdom の navigator を復元
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator
    });
    vi.unstubAllGlobals();
  });

  function stubNavigator(connection?: {
    effectiveType?: string;
    downlink?: number;
    saveData?: boolean;
  }) {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { connection }
    });
  }

  it('defaults to 4 when navigator.connection is undefined and mods count is neutral', () => {
    stubNavigator(undefined);
    expect(computeConcurrency(30)).toBe(4); // 10 <= mods < 50 で無補正
  });

  it('adds +2 when totalMods >= 100', () => {
    stubNavigator(undefined);
    expect(computeConcurrency(150)).toBe(6);
    expect(computeConcurrency(100)).toBe(6);
  });

  it('adds +1 when 50 <= totalMods < 100', () => {
    stubNavigator(undefined);
    expect(computeConcurrency(50)).toBe(5); // 4 + 1
    expect(computeConcurrency(99)).toBe(5);
  });

  it('subtracts -1 when totalMods < 10', () => {
    stubNavigator(undefined);
    expect(computeConcurrency(5)).toBe(3);
  });

  it('caps at 10 (CONCURRENCY_MAX) even for extreme conditions (theoretical)', () => {
    // 現実にはこの条件でも 4+2+2=8 で 10 に届かない (実装上限)。
    // clamp が「min 2 max 10」であることを確認するテストとして残す。
    stubNavigator({ effectiveType: '4g', downlink: 100 });
    expect(computeConcurrency(1000)).toBe(8);
    expect(computeConcurrency(1000)).toBeLessThanOrEqual(10);
  });

  it('drops to 2 (CONCURRENCY_MIN) when saveData is true', () => {
    stubNavigator({ saveData: true });
    expect(computeConcurrency(50)).toBe(2);
    expect(computeConcurrency(1000)).toBe(2);
  });

  it('subtracts -3 for slow-2g and clamps to min', () => {
    stubNavigator({ effectiveType: 'slow-2g' });
    expect(computeConcurrency(100)).toBe(3); // 4 + 2 - 3 = 3
    expect(computeConcurrency(5)).toBe(2); // 4 - 1 - 3 = 0 → clamp 2
  });

  it('subtracts -2 for 3g', () => {
    stubNavigator({ effectiveType: '3g' });
    expect(computeConcurrency(100)).toBe(4); // 4 + 2 - 2 = 4
  });

  it('subtracts -2 when downlink < 2', () => {
    stubNavigator({ effectiveType: '4g', downlink: 1.5 });
    // 4 (default) + 1 (mods>=50) - 2 (downlink<2) = 3
    expect(computeConcurrency(50)).toBe(3);
  });

  it('adds +2 when 4g && downlink >= 10', () => {
    stubNavigator({ effectiveType: '4g', downlink: 20 });
    // 4 (default) + 1 (mods>=50) + 2 (fast 4g) = 7
    expect(computeConcurrency(50)).toBe(7);
  });

  it('never returns less than 2', () => {
    stubNavigator({ effectiveType: 'slow-2g' });
    for (let n = 0; n < 5; n++) {
      expect(computeConcurrency(n)).toBeGreaterThanOrEqual(2);
    }
  });
});
