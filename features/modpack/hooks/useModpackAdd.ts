'use client';

/**
 * インポート時 (Discover から既存 Profile へ) の Modpack 追加 (Phase 12-D2 / bug 3)。
 *
 * ## フロー
 *
 * ```
 * 追加ボタン (ModDetail) ──▶ addModpack()
 *   ① 既存 Profile の modpackSource チェック (導入済み / 別パックはブロック)
 *   ② Modrinth からバージョン取得 → .mrpack をダウンロード
 *   ③ modrinth.index.json を解析 (expandMrpackFiles = files[] → ProjectItem[])
 *   ④ buildModpackAddPlan (競合検出)
 *       ├─ 競合あり → ModpackImportModal を開く (既定 = ユーザー版)
 *       └─ 競合なし → 即適用 (setProfiles + overrides 台帳化 + modpackSource)
 * ```
 *
 * 適用は `lib/env/modpackAdd.ts` の pure 関数に委譲し、ここは
 * **download / 状態管理 / トースト / DB (overrides 台帳) だけ**を担う。
 *
 * ## 書き込み制約
 *
 * **ローカルファイル (Minecraft 環境) へは一切書き込まない**。Profile (SSOT) と
 * 台帳の更新のみで、実体の反映は必ず Sync Preview 経由 (§4)。
 */

import { useCallback, useRef, useState } from 'react';
import JSZip from 'jszip';
import { fetchStableModVersion } from '@/lib/modrinth/client';
import { downloadFileWithRetry } from '@/lib/utils/downloadFile';
import { getManagedFiles, syncManagedFiles } from '@/features/sync';
import {
  expandMrpackFiles,
  mrpackOverridesToManaged,
  parseMrpackOverrides,
  type MrpackOverrideFile
} from '../mrpack';
import {
  applyModpackAddPlan,
  buildModpackAddPlan,
  type ModpackAddPlan,
  type ModpackConflictChoice
} from '../modpackAdd';
import { useProfilesStore } from '@/features/profiles';
import { useToastStore } from '@/components/feedback/toastStore';
import type { ModrinthProject, MrpackIndex } from '@/types';

export interface UseModpackAddResult {
  /** 競合のある追加計画。null ならモーダル不要 (適用済み or 未準備) */
  plan: ModpackAddPlan | null;
  preparing: boolean;
  error: string | null;
  /**
   * Modpack を追加する。
   * @returns true = 競合モーダルを開いた (適用は confirm で行う) / false = 適用済み・ブロック・失敗
   */
  addModpack: (project: ModrinthProject) => Promise<boolean>;
  /** 競合選択を確定して適用する */
  confirm: (choices: ReadonlyMap<string, ModpackConflictChoice>) => Promise<void>;
  cancel: () => void;
  dismissError: () => void;
}

/** 競合モーダル確定時に必要なメタ情報 */
interface PendingModpackAdd {
  plan: ModpackAddPlan;
  /** 適用時に Profile へ設定する modpackSource の情報 */
  pack: {
    projectId: string;
    slug?: string;
    name: string;
    versionId?: string;
    versionNumber?: string;
  };
  overrides: MrpackOverrideFile[];
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function useModpackAdd(): UseModpackAddResult {
  const [plan, setPlan] = useState<ModpackAddPlan | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 連打防止 */
  const inFlightRef = useRef(false);
  /** confirm 時に使う情報 (競合モーダルを開いた時点のスナップショット) */
  const pendingRef = useRef<PendingModpackAdd | null>(null);

  const dismissError = useCallback(() => setError(null), []);

  const saveOverrides = useCallback(
    async (profileId: string, overrides: readonly MrpackOverrideFile[]) => {
      if (overrides.length === 0) return;
      // syncManagedFiles は差分同期 (records 以外を削除) のため**全量**を渡す
      const existing = await getManagedFiles(profileId);
      await syncManagedFiles(
        profileId,
        [...existing, ...mrpackOverridesToManaged(profileId, overrides)]
      );
    },
    []
  );

  const addModpack = useCallback(
    async (project: ModrinthProject): Promise<boolean> => {
      if (inFlightRef.current) return false;
      inFlightRef.current = true;
      setPreparing(true);
      setError(null);
      const showToast = useToastStore.getState().showToast;
      try {
        const { profiles, currentProfileId, setProfiles } = useProfilesStore.getState();
        const profile = profiles.find((p) => p.id === currentProfileId);
        if (!profile) {
          showToast('プロファイルが選択されていません。', 'warning');
          return false;
        }

        // Modpack は Profile の Source 1 件 (PHASE12_PLAN.md §10.6)
        if (profile.modpackSource?.projectId === project.id) {
          showToast('この Modpack は既に導入済みです。Modpack ハブから管理できます。', 'info');
          return false;
        }
        if (profile.modpackSource) {
          showToast(
            'このプロファイルには別の Modpack が導入済みです。Modpack ハブで解除してから追加してください。',
            'warning'
          );
          return false;
        }

        // ① バージョン取得 (Profile の環境で絞り込み)
        const versionRes = await fetchStableModVersion(project.id, {
          loader: profile.environment.loader ?? '',
          mcVersion: profile.environment.mcVersion ?? ''
        });
        const targetVersion = versionRes?.targetVersion;
        if (!targetVersion?.files || targetVersion.files.length === 0) {
          showToast('利用可能な Modpack ファイルが見つかりませんでした', 'warning');
          return false;
        }
        const primaryFile =
          targetVersion.files.find((f) => f.primary) || targetVersion.files[0];
        if (!primaryFile) {
          showToast('Modpack ファイルが見つかりませんでした', 'warning');
          return false;
        }

        // ② .mrpack 本体をダウンロードして解析
        showToast(`「${project.title}」を解析中...`, 'info');
        const blob = await downloadFileWithRetry(
          primaryFile.url,
          new AbortController().signal
        );
        if (!blob) {
          showToast('Modpack のダウンロードに失敗しました', 'error');
          return false;
        }
        const zip = await JSZip.loadAsync(blob);
        const indexFile = zip.file('modrinth.index.json');
        if (!indexFile) {
          showToast('Modpack の内容 (modrinth.index.json) が見つかりませんでした', 'error');
          return false;
        }
        let index: MrpackIndex;
        try {
          index = JSON.parse(await indexFile.async('string')) as MrpackIndex;
        } catch {
          showToast('modrinth.index.json が破損しています', 'warning');
          return false;
        }

        // ③ 中身を展開 (files[] → ProjectItem[])
        const items = await expandMrpackFiles(index);
        const { overrides } = await parseMrpackOverrides(zip);
        if (items.length === 0) {
          showToast('Modpack の中にファイルが見つかりませんでした', 'warning');
          return false;
        }

        // ④ 競合検出
        const nextPlan = buildModpackAddPlan(profile, items);
        const pack = {
          projectId: project.id,
          ...(project.slug ? { slug: project.slug } : {}),
          name: project.title,
          versionId: targetVersion.id,
          versionNumber: targetVersion.version_number
        };

        if (nextPlan.conflicts.length > 0) {
          pendingRef.current = { plan: nextPlan, pack, overrides };
          setPlan(nextPlan);
          return true;
        }

        // 競合なし → 即適用
        const next = applyModpackAddPlan(profile, nextPlan, new Map(), pack);
        setProfiles((prev) => prev.map((p) => (p.id === profile.id ? next : p)));
        await saveOverrides(profile.id, overrides);
        showToast(
          `「${project.title}」を追加しました (${nextPlan.additions.length} 件)`,
          'success'
        );
        return false;
      } catch (e) {
        const msg = errorMessage(e);
        setError(msg);
        showToast(`Modpack の追加に失敗しました: ${msg}`, 'error');
        return false;
      } finally {
        inFlightRef.current = false;
        setPreparing(false);
      }
    },
    [saveOverrides]
  );

  const confirm = useCallback(
    async (choices: ReadonlyMap<string, ModpackConflictChoice>) => {
      const pending = pendingRef.current;
      if (!pending) return;
      setError(null);
      const showToast = useToastStore.getState().showToast;
      try {
        const { profiles, currentProfileId, setProfiles } = useProfilesStore.getState();
        const profile = profiles.find((p) => p.id === currentProfileId);
        if (!profile) {
          showToast('プロファイルが選択されていません。', 'warning');
          return;
        }
        const next = applyModpackAddPlan(
          profile,
          pending.plan,
          choices,
          pending.pack
        );
        setProfiles((prev) => prev.map((p) => (p.id === profile.id ? next : p)));
        await saveOverrides(profile.id, pending.overrides);
        const replaced = [...choices.values()].filter((c) => c === 'replace').length;
        showToast(
          `「${pending.pack.name}」を追加しました (追加 ${pending.plan.additions.length} 件 / ` +
            `競合 ${pending.plan.conflicts.length} 件中 ${replaced} 件を Modpack 版に置換)`,
          'success'
        );
      } catch (e) {
        const msg = errorMessage(e);
        setError(msg);
        showToast(`Modpack の追加に失敗しました: ${msg}`, 'error');
        return;
      } finally {
        pendingRef.current = null;
        setPlan(null);
      }
    },
    [saveOverrides]
  );

  const cancel = useCallback(() => {
    pendingRef.current = null;
    setPlan(null);
  }, []);

  return { plan, preparing, error, addModpack, confirm, cancel, dismissError };
}
