/**
 * appActions store test (Sub-Phase 9-C.5 追加)
 *
 * registerAppActions / unregisterAppActions と、useAppAction / useAppActionValue
 * の hook 挙動 (未登録 no-op fallback) を検証。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  useAppActionsStore,
  useAppAction,
  useAppActionValue,
  type AppActions
} from '@/lib/store/appActions';

function makeActions(overrides: Partial<AppActions> = {}): AppActions {
  return {
    handleSwitchProfile: vi.fn(),
    handleCreateProfile: vi.fn(),
    handleDuplicateProfile: vi.fn(),
    handleSaveEditedProfile: vi.fn(),
    handleDeleteProfile: vi.fn(),
    handleToggleMod: vi.fn(),
    handleUpdateModVersion: vi.fn(),
    handleRemoveAllMods: vi.fn(),
    handleRemoveMods: vi.fn(),
    runBackgroundDepCheck: vi.fn(),
    handleDownloadZip: vi.fn(),
    handleCancelZip: vi.fn(),
    handleImportZipInput: vi.fn(),
    handleDropZip: vi.fn(),
    openNewProfileModal: vi.fn(),
    openEditProfileModal: vi.fn(),
    openDependencyCheckModal: vi.fn(),
    handleResetData: vi.fn(),
    mcVersions: ['1.20.1'],
    currentProfile: undefined,
    ...overrides
  };
}

describe('lib/store/appActions', () => {
  beforeEach(() => {
    useAppActionsStore.getState().unregisterAppActions();
  });

  it('初期状態は actions=null', () => {
    expect(useAppActionsStore.getState().actions).toBeNull();
  });

  it('registerAppActions で登録できる', () => {
    const actions = makeActions();
    useAppActionsStore.getState().registerAppActions(actions);
    expect(useAppActionsStore.getState().actions).toBe(actions);
  });

  it('unregisterAppActions で null に戻る', () => {
    const actions = makeActions();
    useAppActionsStore.getState().registerAppActions(actions);
    useAppActionsStore.getState().unregisterAppActions();
    expect(useAppActionsStore.getState().actions).toBeNull();
  });

  it('useAppAction: 登録済みなら実 fn を返す', () => {
    const spy = vi.fn();
    useAppActionsStore
      .getState()
      .registerAppActions(makeActions({ handleDuplicateProfile: spy }));
    const { result } = renderHook(() => useAppAction('handleDuplicateProfile'));
    result.current();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('useAppAction: 未登録なら no-op fn を返す (console.warn は出さない)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useAppAction('handleDuplicateProfile'));
    // 呼んでも throw しない
    expect(() => (result.current as () => void)()).not.toThrow();
    // SSR / 初回 hydration では warning を出さない (仕様)
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('B1 修正: 未登録時の no-op fn は再 render で同一参照 (module-level 定数)', () => {
    const { result, rerender } = renderHook(() =>
      useAppAction('handleDuplicateProfile')
    );
    const first = result.current;
    rerender();
    const second = result.current;
    // ✅ B1 修正後は参照安定
    expect(first).toBe(second);
  });

  it('useAppActionValue: 登録済みなら実値、未登録なら fallback', () => {
    // 未登録
    const { result: r1 } = renderHook(() =>
      useAppActionValue('mcVersions', ['fallback'])
    );
    expect(r1.current).toEqual(['fallback']);

    // 登録済
    useAppActionsStore.getState().registerAppActions(makeActions({ mcVersions: ['1.21.4'] }));
    const { result: r2 } = renderHook(() =>
      useAppActionValue('mcVersions', ['fallback'])
    );
    expect(r2.current).toEqual(['1.21.4']);
  });

  it('複数の renderHook が同じ actions を subscribe する', () => {
    const spy = vi.fn();
    useAppActionsStore
      .getState()
      .registerAppActions(makeActions({ handleToggleMod: spy }));
    const h1 = renderHook(() => useAppAction('handleToggleMod'));
    const h2 = renderHook(() => useAppAction('handleToggleMod'));
    expect(h1.result.current).toBe(h2.result.current);
  });
});
