/**
 * useCurrentProfileWithFallback test (B33 修正)
 *
 * 3 コンポーネント (HomeInteractive / ModsPageClient / ModDetailModalShell) で
 * 重複していた currentProfile fallback パターンを共通化した hook のテスト。
 *
 * 主な検証:
 * - fallback (EMPTY_PROFILE) が render 間で同一参照
 * - profiles[0] fallback も同一参照
 * - 実 profile が見つかればそれを返す
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useCurrentProfileWithFallback,
  _EMPTY_PROFILE_FOR_TEST
} from '@/lib/store/useCurrentProfileWithFallback';
import { useProfilesStore } from '@/lib/store/profiles';
import type { Profile } from '@/types';

describe('useCurrentProfileWithFallback (B33 修正)', () => {
  beforeEach(() => {
    useProfilesStore.setState({
      profiles: [],
      currentProfileId: ''
    });
  });

  it('profiles=[] & currentProfileId=空 のとき EMPTY_PROFILE (module-level 定数) を返す', () => {
    const { result } = renderHook(() => useCurrentProfileWithFallback());
    expect(result.current).toBe(_EMPTY_PROFILE_FOR_TEST);
    expect(result.current.id).toBe('empty');
  });

  it('EMPTY_PROFILE は再 render で同一参照 (B33 修正の核心)', () => {
    const { result, rerender } = renderHook(() => useCurrentProfileWithFallback());
    const first = result.current;
    rerender();
    const second = result.current;
    expect(first).toBe(second);
    expect(first).toBe(_EMPTY_PROFILE_FOR_TEST);
  });

  it('currentProfileId が profiles に一致すれば実 profile を返す', () => {
    const profile: Profile = {
      id: 'p1',
      name: 'Real',
      environment: { mcVersion: '1.20.1', loader: 'Fabric' },
      description: '',
      mods: []
    };
    act(() => {
      useProfilesStore.setState({
        profiles: [profile],
        currentProfileId: 'p1'
      });
    });
    const { result } = renderHook(() => useCurrentProfileWithFallback());
    expect(result.current.id).toBe('p1');
    expect(result.current.name).toBe('Real');
  });

  it('currentProfileId が profiles に無ければ profiles[0] にフォールバック', () => {
    const p1: Profile = {
      id: 'p1',
      name: 'First',
      environment: { mcVersion: '1.20.1', loader: 'Fabric' },
      description: '',
      mods: []
    };
    const p2: Profile = {
      id: 'p2',
      name: 'Second',
      environment: { mcVersion: '1.21.1', loader: 'Forge' },
      description: '',
      mods: []
    };
    act(() => {
      useProfilesStore.setState({
        profiles: [p1, p2],
        currentProfileId: 'ghost-id'
      });
    });
    const { result } = renderHook(() => useCurrentProfileWithFallback());
    expect(result.current.id).toBe('p1');
  });

  it('EMPTY_PROFILE は frozen (改変不可)', () => {
    expect(Object.isFrozen(_EMPTY_PROFILE_FOR_TEST)).toBe(true);
  });
});
