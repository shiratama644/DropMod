/**
 * useProfilesStore: NODE_ENV=development 時の devtools middleware 分岐
 *
 * store.ts は module 評価時に `process.env.NODE_ENV === 'development'` を
 * 読み、dev 時のみ devtools middleware を適用する。
 * vitest は NODE_ENV='test' のため通常この分岐は実行されないため、
 * vi.stubEnv + vi.resetModules で development として再 import して検証する。
 * （本ファイルは独立しており、モジュールキャッシュのリセットが
 *   他のテストファイルへ影響しない）
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import { act } from '@testing-library/react';

async function loadStoreIn(env: 'development' | 'production') {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', env);
  const mod = (await import('@/features/profiles')) as {
    useProfilesStore: {
      getState: () => {
        profiles: unknown[];
        currentProfileId: string;
        hasHydrated: boolean;
        theme: string;
        setProfiles: (p: unknown[]) => void;
        toggleTheme: () => void;
      };
    };
  };
  return mod.useProfilesStore;
}

describe('useProfilesStore (devtools middleware 分岐)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('NODE_ENV=development でも devtools ラップ後も正常に動作する', async () => {
    const store = await loadStoreIn('development');
    // devtools middleware が適用されても store は正常に動作する
    expect(store.getState().hasHydrated).toBe(false);
    expect(store.getState().theme).toBe('dark');
    act(() => store.getState().toggleTheme());
    expect(store.getState().theme).toBe('light');
  });

  it('NODE_ENV=production では devtools なしで動作する', async () => {
    const store = await loadStoreIn('production');
    expect(store.getState().currentProfileId).toBe('default-profile');
    act(() =>
      store.getState().setProfiles([
        { id: 'x', name: 'X', environment: {}, description: '', mods: [] }
      ])
    );
    expect(store.getState().profiles).toHaveLength(1);
  });
});
