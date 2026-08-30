/**
 * useFolderLinked (Phase 12-B / D-8) test
 *
 * 「フォルダ紐付け済みプロファイルのときだけ Sync ボタンに置き換える」判定と、
 * **プロファイル切り替えに自動で追従する**ことを検証する。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFolderLinked } from '@/features/sync/hooks/useFolderLinked';
import { useProfilesStore } from '@/features/profiles';
import type { LinkedSource, Profile } from '@/types';

function linked(overrides: Partial<LinkedSource> = {}): LinkedSource {
  return {
    kind: 'filesystem',
    rootName: '.minecraft',
    handleId: 'dh-1',
    environment: { mcVersion: '1.20.1', loader: 'Fabric' },
    contentDirs: { mods: 'mods' },
    linkedAt: 1,
    ...overrides
  };
}

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    name: 'P1',
    environment: { mcVersion: '1.20.1', loader: 'Fabric' },
    mods: [],
    ...overrides
  };
}

describe('useFolderLinked', () => {
  beforeEach(() => {
    useProfilesStore.setState({ profiles: [], currentProfileId: undefined, hasHydrated: true });
  });

  it('プロファイルが無ければ false', () => {
    const { result } = renderHook(() => useFolderLinked());
    expect(result.current).toBe(false);
  });

  it('未紐付けなら false', () => {
    useProfilesStore.setState({ profiles: [profile()], currentProfileId: 'p1' });
    const { result } = renderHook(() => useFolderLinked());
    expect(result.current).toBe(false);
  });

  it('紐付け済みなら true', () => {
    useProfilesStore.setState({
      profiles: [profile({ linkedSource: linked() })],
      currentProfileId: 'p1'
    });
    const { result } = renderHook(() => useFolderLinked());
    expect(result.current).toBe(true);
  });

  it('**プロファイルごとに独立**: 未紐付けに切り替えたら false に戻る', () => {
    useProfilesStore.setState({
      profiles: [profile({ linkedSource: linked() }), profile({ id: 'p2', name: 'P2' })],
      currentProfileId: 'p1'
    });
    const { result } = renderHook(() => useFolderLinked());
    expect(result.current).toBe(true);

    act(() => {
      useProfilesStore.setState({ currentProfileId: 'p2' });
    });
    expect(result.current).toBe(false);

    act(() => {
      useProfilesStore.setState({ currentProfileId: 'p1' });
    });
    expect(result.current).toBe(true);
  });

  it('存在しない currentProfileId なら false', () => {
    useProfilesStore.setState({ profiles: [profile()], currentProfileId: 'missing' });
    const { result } = renderHook(() => useFolderLinked());
    expect(result.current).toBe(false);
  });

  it('紐付けを解除したら false になる', () => {
    useProfilesStore.setState({
      profiles: [profile({ linkedSource: linked() })],
      currentProfileId: 'p1'
    });
    const { result } = renderHook(() => useFolderLinked());
    expect(result.current).toBe(true);

    act(() => {
      useProfilesStore.setState({ profiles: [profile()] });
    });
    expect(result.current).toBe(false);
  });
});
