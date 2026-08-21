'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Profile } from '@/types';
import { fetchModrinth } from '@/lib/modrinth/client';

// プロファイル変更後、依存チェックを実行するまでの待機時間 (デバウンス)
// Modを連続追加/削除する際に何度も走らないように短い遅延を挟む
const DEP_CHECK_DEBOUNCE_MS = 1200;

export const useDependencyCheck = (currentProfile: Profile) => {
  const [hasDepWarning, setHasDepWarning] = useState<boolean>(false);

  // 最新 profile を常に参照するための Ref (非同期処理内 stale closure 対策)
  // render 中に同期でセットすることで、setState 直後に発火する非同期処理が
  // 1レンダー遅れの古い profile を掴む race を防ぐ。
  const profileRef = useRef<Profile>(currentProfile);
  profileRef.current = currentProfile;

  const runBackgroundDepCheck = useCallback(async () => {
    const profile = profileRef.current;
    if (!profile.mods || profile.mods.length === 0) {
      setHasDepWarning(false);
      return;
    }
    try {
      const versionIds = profile.mods
        .map((m) => m.selectedVersionId)
        .filter((id) => id && id !== 'latest') as string[];
      const versionMap = new Map<string, any>();

      if (versionIds.length > 0) {
        try {
          const batchVersions = await fetchModrinth<any[]>('/versions', {
            ids: JSON.stringify(versionIds)
          });
          batchVersions.forEach((v) => versionMap.set(v.id, v));
        } catch (e) {
          // レートリミット等: 前回の hasDepWarning を保持して無音失敗
        }
      }

      const installedProjectSet = new Set<string>();
      profile.mods.forEach((m) => {
        if (m.id) installedProjectSet.add(m.id);
        if (m.slug) installedProjectSet.add(m.slug);
      });

      let warning = false;
      for (const mod of profile.mods) {
        const vData = versionMap.get(mod.selectedVersionId!);
        if (vData && vData.dependencies) {
          for (const dep of vData.dependencies) {
            if (
              dep.dependency_type === 'required' &&
              dep.project_id &&
              !installedProjectSet.has(dep.project_id)
            ) {
              warning = true;
              break;
            }
            if (
              dep.dependency_type === 'incompatible' &&
              dep.project_id &&
              installedProjectSet.has(dep.project_id)
            ) {
              warning = true;
              break;
            }
          }
        }
        if (warning) break;
      }
      setHasDepWarning(warning);
    } catch (e) {
      // 想定外エラー: 無音失敗 (前回値を維持)
    }
  }, []);

  // ----------------------------------------------------------------------
  // 実行トリガー: 「プロファイルが実質的に変化したときのみ」再チェック
  //   - 旧実装は 5秒ごとの setInterval で Modrinth を叩き続けていた
  //     → Modrinth の 300 req/min レートリミットに容易に抵触
  //   - 現在プロファイルの mcVersion / loader / mods の構成 (id+versionId)
  //     が変化したときだけ発火。連続変更は DEP_CHECK_DEBOUNCE_MS でまとめる。
  // ----------------------------------------------------------------------
  const modsSignature = currentProfile.mods
    .map((m) => `${m.id || m.slug || '?'}@${m.selectedVersionId || 'latest'}`)
    .join(',');

  useEffect(() => {
    const timer = setTimeout(() => {
      runBackgroundDepCheck();
    }, DEP_CHECK_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [currentProfile.mcVersion, currentProfile.loader, modsSignature, runBackgroundDepCheck]);

  return {
    hasDepWarning,
    runBackgroundDepCheck
  };
};