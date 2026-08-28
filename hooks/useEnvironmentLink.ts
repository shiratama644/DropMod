'use client';

/**
 * フォルダ紐付けの UI ロジック (Phase 12-B / **D-9**)。
 *
 * 設定ページの「環境との同期」セクションから呼ぶ。
 * 実体は `lib/env/link.ts` で、このフックは **Profile (SSOT) への反映と
 * トースト通知**だけを担う。
 *
 * ## 重要な設計判断
 *
 * - **検出した環境を `Profile.environment` に書き込まない。**
 *   D-1 の環境一致チェックは「Profile の環境」と「実際に検出した環境」を
 *   突き合わせて不一致をブロックする。検出値で上書きするとチェックが
 *   常に一致してしまい、機能しなくなる。
 * - **紐付けし直しは先に旧ハンドルを解除する。** `dirHandles` に
 *   参照されない行が残るのを防ぐ。
 * - **Profile の変更は Zustand store 経由のみ。** Dexie への永続化は
 *   `hooks/useProfiles.ts` の debounce 付き保存 effect が担う。
 */

import { useCallback, useState } from 'react';
import { supportsDirectoryPicker } from '@/lib/env/capabilities';
import { createFolderLink, releaseFolderLink } from '@/lib/env/link';
import { useProfilesStore } from '@/lib/store/profiles';
import { useToastStore } from '@/lib/store/toast';

export interface EnvironmentLinkState {
  /** このブラウザがフォルダ選択 (File System Access API) に対応しているか */
  supported: boolean;
  linking: boolean;
  unlinking: boolean;
  /** 直近の失敗理由。null なら正常 */
  error: string | null;
  /** フォルダを選択して紐付ける。キャンセル時は false (エラーではない) */
  link: () => Promise<boolean>;
  /** 紐付けを解除する。Profile 内のファイルは消さない */
  unlink: () => Promise<boolean>;
  dismissError: () => void;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function useEnvironmentLink(): EnvironmentLinkState {
  // SSR / ハイドレーション中は window が無いことがあるため、
  // 初回は false で初期化し effect なしで再計算しない (レンダー中に読む)。
  const [supported] = useState<boolean>(() => supportsDirectoryPicker());
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dismissError = useCallback(() => setError(null), []);

  const link = useCallback(async (): Promise<boolean> => {
    // stale closure 対策: 実行時点の最新 state を読む
    const { currentProfileId, profiles, setProfiles } = useProfilesStore.getState();
    const profile = profiles.find((p) => p.id === currentProfileId);
    if (!profile) {
      const message = 'プロファイルが選択されていません。';
      setError(message);
      return false;
    }

    setLinking(true);
    setError(null);
    try {
      // 旧ハンドルを先に解放 (dirHandles の取り残し防止)
      await releaseFolderLink(profile.linkedSource?.handleId);
      const linked = await createFolderLink(profile.id);
      if (!linked) {
        // ユーザーがキャンセルした。エラー表示しない
        return false;
      }
      setProfiles((prev) =>
        prev.map((p) => (p.id === profile.id ? { ...p, linkedSource: linked } : p))
      );
      useToastStore
        .getState()
        .showToast(`フォルダ「${linked.rootName}」を紐付けました`, 'success');
      return true;
    } catch (e) {
      const message = errorMessage(e);
      setError(message);
      useToastStore.getState().showToast(`フォルダの紐付けに失敗しました: ${message}`, 'error');
      return false;
    } finally {
      setLinking(false);
    }
  }, []);

  const unlink = useCallback(async (): Promise<boolean> => {
    const { currentProfileId, profiles, setProfiles } = useProfilesStore.getState();
    const profile = profiles.find((p) => p.id === currentProfileId);
    if (!profile?.linkedSource) return false;

    setUnlinking(true);
    setError(null);
    try {
      const rootName = profile.linkedSource.rootName;
      await releaseFolderLink(profile.linkedSource.handleId);
      setProfiles((prev) =>
        prev.map((p) => {
          if (p.id !== profile.id) return p;
          // linkedSource を落とす (undefined ではなくキーごと消す)
          const { linkedSource: _removed, ...rest } = p;
          return rest;
        })
      );
      useToastStore.getState().showToast(`フォルダ「${rootName}」の紐付けを解除しました`, 'success');
      return true;
    } catch (e) {
      const message = errorMessage(e);
      setError(message);
      useToastStore.getState().showToast(`紐付けの解除に失敗しました: ${message}`, 'error');
      return false;
    } finally {
      setUnlinking(false);
    }
  }, []);

  return { supported, linking, unlinking, error, link, unlink, dismissError };
}
