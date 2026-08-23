'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { Profile } from '@/types';
import { useQueryClient } from '@tanstack/react-query';
import { fetchModrinthBatch } from '@/lib/modrinth/client';
import { useDepCheckStore } from '@/lib/store/depCheck';

// プロファイル変更後、依存チェックを実行するまでの待機時間 (デバウンス)
// Modを連続追加/削除する際に何度も走らないように短い遅延を挟む
const DEP_CHECK_DEBOUNCE_MS = 1200;

export const useDependencyCheck = (currentProfile: Profile) => {
  // 9-B.3: hasDepWarning を Zustand store に。
  //   BottomNav / Header の警告バッジが下流コンポーネントから直接 subscribe できるように。
  //   isChecking / lastCheckAt は現時点で UI 未使用だが、Phase 10 の DependencyCheckModal
  //   拡張で活用予定。
  const hasDepWarning = useDepCheckStore((s) => s.hasDepWarning);
  const setHasDepWarning = useDepCheckStore((s) => s.setHasDepWarning);
  const setChecking = useDepCheckStore((s) => s.setChecking);
  const markChecked = useDepCheckStore((s) => s.markChecked);

  // C7-2 修正: 依存チェックのバッチ /versions 取得を TanStack Query キャッシュに載せる。
  // 同一 versionId セットへの再チェック (連続 toggle → 依存チェック再実行) で
  // 5 分以内なら Modrinth API を叩き直さない。
  const queryClient = useQueryClient();

  // 最新 profile を常に参照するための Ref (非同期処理内 stale closure 対策)
  // render 中に同期でセットすることで、setState 直後に発火する非同期処理が
  // 1レンダー遅れの古い profile を掴む race を防ぐ。
  const profileRef = useRef<Profile>(currentProfile);
  profileRef.current = currentProfile;

  const runBackgroundDepCheck = useCallback(async () => {
    const profile = profileRef.current;
    if (!profile.mods || profile.mods.length === 0) {
      setHasDepWarning(false);
      markChecked();
      return;
    }
    setChecking(true);
    try {
      const versionIds = profile.mods
        .map((m) => m.selectedVersionId)
        .filter((id) => id && id !== 'latest') as string[];

      // B23 修正: versionIds が空 = 全 mod が 'latest' を選択している状態。
      //   従来はこのケースで空 versionMap のまま outer loop → warning=false
      //   → 前回警告が消されていた。
      //   → 依存情報が取れない = 判定不能なので、前回値を保持して早期 return。
      if (versionIds.length === 0) {
        // 前回値は setHasDepWarning を呼ばない = 保持
        markChecked();
        return;
      }

      const versionMap = new Map<string, any>();

      // B22 修正: fetch 失敗時は「前回の hasDepWarning を保持」するのが
      //   コメント通りの意図。従来は catch 後に空 versionMap で outer loop
      //   を走らせて warning=false にしていたが、これは前回警告状態を消す。
      //   → catch で早期 return して setHasDepWarning を呼ばず前回値を保持。
      try {
        // C7-2 修正: canonical query key で 5 分キャッシュ。
        //   versionIds はソートして key の安定性を確保 (order によって key が変わらないように)
        const sortedIds = [...versionIds].sort();
        const batchKey = ['versions-batch', sortedIds.join(',')] as const;
        const batchVersions = await queryClient.fetchQuery({
          queryKey: batchKey,
          queryFn: () => fetchModrinthBatch<any>('/versions', versionIds),
          staleTime: 5 * 60 * 1000 // 5 分
        });
        // Phase 10-P5 (suspicious/useIterableCallbackReturn):
        //   Map.set() は Map を返すので arrow の暗黙 return を回避するため
        //   block-body にして void を返す。
        batchVersions.forEach((v: any) => {
          versionMap.set(v.id, v);
        });
      } catch (_e) {
        // B22 修正: レートリミット / 500 等 → 前回の hasDepWarning を保持し早期 return
        // (finally の markChecked は実行される)
        return;
      }

      const installedProjectSet = new Set<string>();
      profile.mods.forEach((m) => {
        if (m.id) installedProjectSet.add(m.id);
        if (m.slug) installedProjectSet.add(m.slug);
      });

      // outer break は明示的にラベルで示す (以前は inner break のみで
      // outer は `if (warning) break;` に依存していて可読性が低かった)
      // mod.selectedVersionId! の non-null assertion → 明示的 undefined チェック
      let warning = false;
      outer: for (const mod of profile.mods) {
        const vData = mod.selectedVersionId ? versionMap.get(mod.selectedVersionId) : undefined;
        if (vData?.dependencies) {
          for (const dep of vData.dependencies) {
            if (
              dep.dependency_type === 'required' &&
              dep.project_id &&
              !installedProjectSet.has(dep.project_id)
            ) {
              warning = true;
              break outer;
            }
            if (
              dep.dependency_type === 'incompatible' &&
              dep.project_id &&
              installedProjectSet.has(dep.project_id)
            ) {
              warning = true;
              break outer;
            }
          }
        }
      }
      setHasDepWarning(warning);
    } catch {
      // 想定外エラー: 無音失敗 (前回値を維持) — catch binding は省略 (ES2019+)
    } finally {
      markChecked();
    }
  }, [queryClient, setHasDepWarning, setChecking, markChecked]);

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