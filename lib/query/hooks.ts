/**
 * 各 Modrinth API 呼び出しに対応する TanStack Query hooks。
 *
 * Sub-Phase 8-B: fetchModrinth 直呼びを useQuery / useInfiniteQuery ラップに置換して、
 * 自動キャッシュ + 自動 abort + Dexie persister 連携を実現する。
 *
 * 実装ポリシー:
 *   - Hook からは fetchModrinth を **必ず {signal} 付き**で呼ぶ (自動 abort に必須)
 *   - queryKey は lib/query/keys の canonical builder 経由
 *   - staleTime / gcTime は defaultOptions で共通、必要な hook のみ override
 */

'use client';

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { fetchModrinth, fetchModrinthBatch } from '@/lib/modrinth/client';
import type { ModrinthProject, ModrinthVersion } from '@/types';
import { queryKeys } from './keys';

// ============================================================================
// Project (Mod プロジェクト詳細)
// ============================================================================

interface ProjectQueryOptions {
  enabled?: boolean;
}

/**
 * Modrinth /project/{slug or id} を取得。
 * キャッシュヒットしていれば即返却、24h TTL で永続化。
 */
export function useProjectQuery(
  slugOrId: string | null | undefined,
  options: ProjectQueryOptions = {}
) {
  return useQuery({
    queryKey: slugOrId ? queryKeys.project(slugOrId) : ['project', 'null'],
    queryFn: async ({ signal }) => {
      return fetchModrinth<ModrinthProject>(`/project/${slugOrId}`, undefined, { signal });
    },
    enabled: !!slugOrId && options.enabled !== false,
    staleTime: 15 * 60 * 1000 // 15 分 (Mod 情報は頻繁に変わらないので長め)
  });
}

// ============================================================================
// Versions (Mod プロジェクトのバージョン一覧)
// ============================================================================

interface VersionsQueryOptions {
  mcVersion?: string;
  loader?: string;
  enabled?: boolean;
}

export function useVersionsQuery(
  slugOrId: string | null | undefined,
  options: VersionsQueryOptions = {}
) {
  return useQuery({
    queryKey: slugOrId
      ? queryKeys.versions(slugOrId, options.mcVersion, options.loader)
      : ['versions', 'null'],
    queryFn: async ({ signal }) => {
      const params: Record<string, string> = {};
      if (options.mcVersion) params['game_versions'] = JSON.stringify([options.mcVersion]);
      if (options.loader) params['loaders'] = JSON.stringify([options.loader.toLowerCase()]);
      return fetchModrinth<ModrinthVersion[]>(
        `/project/${slugOrId}/version`,
        params,
        { signal }
      );
    },
    enabled: !!slugOrId && options.enabled !== false,
    staleTime: 10 * 60 * 1000 // 10 分
  });
}

// ============================================================================
// Projects Batch (依存チェック等でまとめて取得)
// ============================================================================

/**
 * 複数の project id を一度に取得する。
 * fetchModrinthBatch は内部で 100 件ごとに chunk 分割してくれる。
 * 個別 useProjectQuery を N 回並列で呼ぶより 1 リクエストで済む。
 */
export function useProjectsBatchQuery(
  ids: readonly string[] | null | undefined,
  options: { enabled?: boolean } = {}
) {
  const stableIds = ids ? [...ids].sort() : [];
  return useQuery({
    queryKey: stableIds.length ? queryKeys.projectsBatch(stableIds) : ['projects-batch', 'empty'],
    queryFn: async ({ signal: _signal }) => {
      // fetchModrinthBatch は現状 signal を受け取らない実装だが、
      // chunk ごとに個別 fetch が abort されるとレスポンスが不完全になる可能性があり、
      // signal 対応は Sub-Phase 8-B の範囲外 (別 PR 検討)。
      return fetchModrinthBatch<ModrinthProject>('/projects', stableIds);
    },
    enabled: (stableIds.length ?? 0) > 0 && options.enabled !== false,
    staleTime: 10 * 60 * 1000
  });
}

// ============================================================================
// 型 re-export
// ============================================================================

export type { UseQueryOptions };
