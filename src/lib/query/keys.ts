/**
 * TanStack Query の query key を組み立てる canonical function 群。
 *
 * Sub-Phase 8-B: query key の一貫性を全ての呼び出し元で保証するため、
 * 直接 `['search', {...}]` を書かず必ずこの関数を経由する。
 *
 * 型的にも配列を `as const` で固めているので、
 *   - queryClient.invalidateQueries({ queryKey: keys.search.all })
 *   - queryClient.fetchQuery({ queryKey: keys.project(slug), ... })
 * のように使うと補完が効く。
 */

// ============================================================================
// 型
// ============================================================================

export interface SearchQueryParams {
  query: string;
  mcVersion: string;
  loader: string;
  category: string; // 'All' or Modrinth category name
  sort: 'popular' | 'relevance' | 'updated' | 'newest';
  /** Modrinth project_type。未指定時は mod */
  projectType?: 'mod' | 'modpack' | 'resourcepack' | 'shader';
}

// ============================================================================
// key builders
// ============================================================================

/**
 * 検索用 query key. paginated なので queryKey の一部として offset は含めず、
 * pageParam に持たせるのが useInfiniteQuery の作法。
 */
export const searchKey = (params: SearchQueryParams) =>
  [
    'search',
    {
      query: params.query.trim().toLowerCase(),
      mcVersion: params.mcVersion,
      loader: params.loader,
      category: params.category,
      sort: params.sort,
      projectType: params.projectType ?? 'mod'
    }
  ] as const;

/** Mod プロジェクト詳細 */
export const projectKey = (idOrSlug: string) => ['project', idOrSlug] as const;

/** Mod バージョン一覧 (プロジェクト × mcVersion × loader × 条件) */
export const versionsKey = (idOrSlug: string, mcVersion?: string, loader?: string) =>
  ['versions', idOrSlug, mcVersion ?? null, loader ?? null] as const;

/** 単一 version 詳細 (versionId 指定) */
export const versionKey = (versionId: string) => ['version', versionId] as const;

/** タグ / ゲームバージョン一覧 */
export const gameVersionsKey = ['tag', 'game_version'] as const;

/** バッチ project 取得 (依存チェック等) */
export const projectsBatchKey = (ids: readonly string[]) =>
  ['projects-batch', [...ids].sort().join(',')] as const;

export const queryKeys = {
  search: {
    all: ['search'] as const,
    of: searchKey
  },
  project: projectKey,
  versions: versionsKey,
  version: versionKey,
  gameVersions: gameVersionsKey,
  projectsBatch: projectsBatchKey
} as const;
