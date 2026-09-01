'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MuiLink as Link } from '@/components/ui/MuiLink';
import { useRouter, useSearchParams } from 'next/navigation';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { ModrinthHit } from '@/types';
import { fetchModrinth } from '@/lib/modrinth/client';
import { categoriesForProjectType } from '../constants/categories';
import {
  PROJECT_TYPE_TABS,
  SEARCH_LIMIT,
  SEARCH_LAYOUT_OPTIONS,
  SEARCH_LAYOUT_STORAGE_KEY,
  discoverPathForType,
  parseSearchLayout,
  searchGridClass,
  type ProjectType,
  type SearchLayout
} from '@/lib/constants/search';
import { queryKeys, type SearchQueryParams } from '@/lib/query/keys';
import { CustomDropdown } from '@/components/ui/CustomDropdown';
import { ModCard } from './ModCard';
import { CacheStatusBadge } from '@/components/feedback/CacheStatusBadge';
import { useCurrentProfileWithFallback } from '@/features/profiles';
import { useAppAction } from '@/components/layout/appActions';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import SortIcon from '@mui/icons-material/Sort';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import CircularProgress from '@mui/material/CircularProgress';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ReplayIcon from '@mui/icons-material/Replay';
import { useScrollSentinel } from '@/hooks/useScrollSentinel';

// ============================================================================
// HomeInteractive
//
// Home ページの検索 / カテゴリ / ソート / 無限スクロール + Hero Banner の
// プロファイル操作 (編集 / 複製 / 依存チェック起動) を担う。
//
// profile は useCurrentProfileWithFallback (Zustand)、handleToggleMod 等は
// appActionsStore 経由 (useAppAction) で取得。AppContext は Phase 10-B で削除済。
//
// SSR で取得した initialHits はマウント時点の "現在プロファイル" とほぼ
// 一致する想定 (アクティブプロファイルの mcVersion/loader は LocalStorage
// 由来なので、初回 SSR では常に default profile 1.20.1/Fabric)。
// LocalStorage hydration が完了して mcVersion/loader が変わった場合は、
// 通常の絞り込み変更 useEffect が発火して自動で再検索される。
// ============================================================================

const SORT_OPTIONS = [
  { label: '人気順', value: 'popular' },
  { label: '関連度順', value: 'relevance' },
  { label: '最終更新順', value: 'updated' },
  { label: '新着順', value: 'newest' }
];

// スケルトン UI の key 用の module-level 定数配列。
// 「並び順が変わらない/追加削除もない固定 length ループ」なので index を key に
// しても実害はないが、Biome の lint/suspicious/noArrayIndexKey に引っかかる
// (React 一般ルールとしては index key は避けるのが正)。
// 事前に一意な文字列を持つ配列を用意し、それを map するパターンで解消。
const INITIAL_SKELETON_KEYS = [
  'initial-skeleton-a',
  'initial-skeleton-b',
  'initial-skeleton-c',
  'initial-skeleton-d',
  'initial-skeleton-e',
  'initial-skeleton-f'
] as const;
const PAGINATION_SKELETON_KEYS = [
  'pagination-skeleton-a',
  'pagination-skeleton-b',
  'pagination-skeleton-c'
] as const;

interface Props {
  /** SSR で取得した初期 24 件 (cookie ベースの実プロファイル) */
  initialHits: ModrinthHit[];
  /** 初期絞り込みが hasMore かどうか (24 件以上ヒットしていれば true) */
  initialHasMore: boolean;
  /** LP / Browse から渡された検索語 (`?q=`) */
  initialQuery?: string;
  /** LP / Browse から渡された project_type (`?type=`) */
  initialProjectType?: ProjectType;
}

export const HomeInteractive: React.FC<Props> = ({
  initialHits,
  initialHasMore,
  initialQuery = '',
  initialProjectType = 'mod'
}) => {
  const profile = useCurrentProfileWithFallback();
  const handleToggleMod = useAppAction('handleToggleMod');
  const handleDuplicateProfile = useAppAction('handleDuplicateProfile');
  const openEditProfileModal = useAppAction('openEditProfileModal');

  const router = useRouter();
  const urlSearchParams = useSearchParams();

  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [sortBy, setSortBy] = useState<string>('popular');
  const [searchInput, setSearchInput] = useState<string>(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState<string>(initialQuery);
  const [projectType, setProjectType] = useState<ProjectType>(initialProjectType);
  const [layout, setLayout] = useState<SearchLayout>('3');

  useEffect(() => {
    try {
      setLayout(parseSearchLayout(localStorage.getItem(SEARCH_LAYOUT_STORAGE_KEY)));
    } catch {
      /* private mode 等 */
    }
  }, []);

  useEffect(() => {
    setProjectType(initialProjectType);
  }, [initialProjectType]);

  const typeCategories = categoriesForProjectType(projectType);

  useEffect(() => {
    if (!typeCategories.some((c) => c.id === selectedCategory)) {
      setSelectedCategory('All');
    }
  }, [typeCategories, selectedCategory]);

  const handleProjectTypeChange = useCallback(
    (next: ProjectType) => {
      setProjectType(next);
      setSelectedCategory('All');
      const params = new URLSearchParams(urlSearchParams.toString());
      params.delete('type');
      const qs = params.toString();
      const path = discoverPathForType(next);
      router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
    },
    [router, urlSearchParams]
  );

  const handleLayoutChange = useCallback((value: string) => {
    const next = parseSearchLayout(value);
    setLayout(next);
    try {
      localStorage.setItem(SEARCH_LAYOUT_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchInput), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const searchParams: SearchQueryParams = useMemo(
    () => ({
      query: debouncedQuery,
      mcVersion: profile.environment.mcVersion,
      loader: profile.environment.loader,
      category: selectedCategory,
      sort: sortBy as SearchQueryParams['sort'],
      projectType
    }),
    [
      debouncedQuery,
      profile.environment.mcVersion,
      profile.environment.loader,
      selectedCategory,
      sortBy,
      projectType
    ]
  );

  const initialSearchParams: SearchQueryParams = useMemo(
    () => ({
      query: initialQuery,
      mcVersion: profile.environment.mcVersion,
      loader: profile.environment.loader,
      category: 'All',
      sort: 'popular',
      projectType: initialProjectType
    }),
    [profile.environment.mcVersion, profile.environment.loader, initialQuery, initialProjectType]
  );
  const initialMatches =
    searchParams.query === initialSearchParams.query &&
    searchParams.category === initialSearchParams.category &&
    searchParams.sort === initialSearchParams.sort &&
    searchParams.mcVersion === initialSearchParams.mcVersion &&
    searchParams.loader === initialSearchParams.loader &&
    (searchParams.projectType ?? 'mod') === (initialSearchParams.projectType ?? 'mod');

  const [initialDataUpdatedAt, setInitialDataUpdatedAt] = useState<number>(0);
  useEffect(() => {
    if (initialMatches && initialHits.length > 0) {
      setInitialDataUpdatedAt(Date.now());
    }
  }, []);

  const query = useInfiniteQuery({
    queryKey: queryKeys.search.of(searchParams),
    queryFn: async ({ pageParam, signal }) => {
      const type = searchParams.projectType ?? 'mod';
      const facets: string[][] = [[`project_type:${type}`]];
      if (searchParams.mcVersion) facets.push([`versions:${searchParams.mcVersion}`]);
      if (searchParams.loader && (type === 'mod' || type === 'modpack')) {
        facets.push([`categories:${searchParams.loader.toLowerCase()}`]);
      }
      if (searchParams.category && searchParams.category !== 'All') {
        facets.push([`categories:${searchParams.category}`]);
      }
      let indexParam = 'downloads';
      if (searchParams.sort === 'relevance') indexParam = 'relevance';
      if (searchParams.sort === 'updated') indexParam = 'updated';
      if (searchParams.sort === 'newest') indexParam = 'newest';

      const data = await fetchModrinth<{ hits: ModrinthHit[] }>(
        '/search',
        {
          query: searchParams.query.trim(),
          facets: JSON.stringify(facets),
          index: indexParam,
          limit: SEARCH_LIMIT,
          offset: pageParam
        },
        { signal }
      );
      return {
        hits: Array.isArray(data?.hits) ? data.hits : [],
        offset: pageParam
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (!lastPage.hits || lastPage.hits.length < SEARCH_LIMIT) return undefined;
      return lastPage.offset + lastPage.hits.length;
    },
    initialData: initialMatches && initialHits.length > 0
      ? {
          pages: [{ hits: initialHits, offset: 0 }],
          pageParams: [0]
        }
      : undefined,
    initialDataUpdatedAt: initialDataUpdatedAt,
    staleTime: 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false
  });

  const sentinelRef = useScrollSentinel(query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage);

  const isLoading = query.isLoading || query.isFetchingNextPage;
  const safeHits = useMemo(() => {
    const hits: ModrinthHit[] = [];
    if (!query.data?.pages) return hits;
    for (const p of query.data.pages) {
      if (p && Array.isArray(p.hits)) {
        for (const hit of p.hits) hits.push(hit);
      }
    }
    return hits;
  }, [query.data]);
  const hasMore = !!query.hasNextPage;
  const searchError = query.isError ? (query.error as Error).message : null;

  return (
    <Box component="section" sx={{ pb: 8, display: 'flex', flexDirection: 'column', gap: { xs: 2, sm: 4 } }}>
      <Box sx={{ bgcolor: 'background.paper', borderRadius: 4, p: { xs: 3, sm: 4 }, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: 'center', justifyContent: 'space-between', gap: 3, border: '1px solid var(--mui-palette-divider)' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box component="span" sx={{ color: 'primary.main', display: 'flex', alignItems: 'center' }}>
              <SearchIcon />
            </Box>
            絞り込み条件
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'action.hover', px: 2, py: 1, borderRadius: 2 }}>
              <Typography variant="body2" color="text.secondary">対象:</Typography>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{profile.name}</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'action.hover', px: 2, py: 1, borderRadius: 2 }}>
              <Typography variant="body2" color="text.secondary">環境:</Typography>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{profile.environment.mcVersion} / {profile.environment.loader}</Typography>
            </Box>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 2, width: { xs: '100%', md: 'auto' } }}>
          <Button variant="outlined" color="inherit" onClick={openEditProfileModal} sx={{ flex: 1, borderRadius: 3, fontWeight: 'bold' }}>
            環境を変更
          </Button>
          <Button component={Link} href="/profile" variant="contained" sx={{ flex: 1, borderRadius: 3, fontWeight: 'bold', display: { xs: 'flex', sm: 'none' } }}>
            確認
          </Button>
        </Box>
      </Box>

      <Box sx={{ bgcolor: 'background.paper', borderRadius: 4, p: { xs: 2, sm: 3 }, border: '1px solid var(--mui-palette-divider)', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: { xs: 'none', md: 'flex' }, gap: 1 }}>
          {PROJECT_TYPE_TABS.map((tab) => {
            const isActive = projectType === tab.id;
            return (
              <Button
                key={tab.id}
                variant={isActive ? 'contained' : 'text'}
                color={isActive ? 'primary' : 'inherit'}
                onClick={() => handleProjectTypeChange(tab.id)}
                sx={{ borderRadius: 3, fontWeight: 'bold', px: 3, py: 1 }}
              >
                {tab.label}
              </Button>
            );
          })}
        </Box>

        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
          <Box sx={{ position: 'relative', flex: 1 }}>
            <Box sx={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', display: 'flex', color: 'text.secondary' }}>
              {isLoading && safeHits.length === 0 ? <CircularProgress size={20} /> : <SearchIcon fontSize="small" />}
            </Box>
            <Box
              component="input"
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="ModrinthのMod名・説明で検索..."
              sx={{ width: '100%', pl: 5, pr: 5, py: 1.5, borderRadius: 3, border: '1px solid var(--mui-palette-divider)', bgcolor: 'action.hover', color: 'text.primary', '&:focus': { outline: 'none', borderColor: 'primary.main', bgcolor: 'background.paper' } }}
            />
            {searchInput && (
              <Box
                component="button"
                onClick={() => setSearchInput('')}
                sx={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', display: 'flex', color: 'text.secondary', bgcolor: 'transparent', border: 'none', cursor: 'pointer', p: 0.5, borderRadius: '50%', '&:hover': { color: 'text.primary', bgcolor: 'action.selected' } }}
              >
                <CloseIcon fontSize="small" />
              </Box>
            )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: { xs: 'space-between', sm: 'flex-start' } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <SortIcon fontSize="small" color="action" />
              <CustomDropdown options={SORT_OPTIONS} selectedValue={sortBy} onChange={setSortBy} label="並び順" />
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ViewModuleIcon fontSize="small" color="action" />
              <CustomDropdown options={[...SEARCH_LAYOUT_OPTIONS]} selectedValue={layout} onChange={handleLayoutChange} label="表示形式" />
            </Box>
          </Box>
        </Box>

        <Box sx={{ overflowX: 'auto', pb: 1, '&::-webkit-scrollbar': { display: 'none' }, scrollbarWidth: 'none' }}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {typeCategories.map((cat) => {
              const isActive = selectedCategory === cat.id;
              return (
                <Button
                  key={cat.id}
                  variant={isActive ? 'contained' : 'outlined'}
                  color={isActive ? 'primary' : 'inherit'}
                  onClick={() => setSelectedCategory(cat.id)}
                  size="small"
                  sx={{ borderRadius: 3, fontWeight: 'bold', whiteSpace: 'nowrap', minWidth: 'auto', border: isActive ? undefined : '1px solid var(--mui-palette-divider)' }}
                >
                  {cat.label}
                </Button>
              );
            })}
          </Box>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1 }}>
        <Typography variant="caption" color="text.secondary">
          {safeHits.length > 0 && `${safeHits.length} 件${hasMore ? '+' : ''}`}
        </Typography>
        <CacheStatusBadge dataUpdatedAt={query.dataUpdatedAt} isFetching={query.isFetching} />
      </Box>

      <Box className={searchGridClass(layout)} sx={{ minHeight: '50vh' }}>
        {isLoading && safeHits.length === 0 ? (
          INITIAL_SKELETON_KEYS.map((k) => (
            <Box key={k} sx={{ bgcolor: 'background.paper', borderRadius: 4, p: 2, border: '1px solid var(--mui-palette-divider)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <Box sx={{ width: 48, height: 48, borderRadius: 2, bgcolor: 'action.hover' }} className="skeleton-shimmer" />
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box sx={{ height: 16, width: '75%', bgcolor: 'action.hover', borderRadius: 1 }} className="skeleton-shimmer" />
                  <Box sx={{ height: 12, width: '50%', bgcolor: 'action.hover', borderRadius: 1 }} className="skeleton-shimmer" />
                </Box>
              </Box>
              <Box sx={{ height: 32, width: '100%', bgcolor: 'action.hover', borderRadius: 1 }} className="skeleton-shimmer" />
            </Box>
          ))
        ) : safeHits.length === 0 ? (
          searchError ? (
            <Box sx={{ gridColumn: '1 / -1', py: 8, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <WarningAmberIcon color="warning" sx={{ fontSize: 48 }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>Modrinthから取得できませんでした</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 400 }}>{searchError}</Typography>
              <Button variant="contained" onClick={() => void query.refetch()} startIcon={<ReplayIcon />} sx={{ borderRadius: 3, mt: 2 }}>再試行</Button>
            </Box>
          ) : (
            <Box sx={{ gridColumn: '1 / -1', py: 8, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <SearchIcon color="action" sx={{ fontSize: 48 }} />
              <Typography variant="body2" color="text.secondary">Modrinthに条件に一致するModが見つかりませんでした。</Typography>
            </Box>
          )
        ) : (
          <>
            {safeHits.map((hit) => (
              <ModCard key={hit.project_id} hit={hit} profile={profile} onToggleMod={handleToggleMod} layout={layout} />
            ))}
            {isLoading && PAGINATION_SKELETON_KEYS.map((k) => (
              <Box key={k} sx={{ bgcolor: 'background.paper', borderRadius: 4, p: 2, border: '1px solid var(--mui-palette-divider)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                  <Box sx={{ width: 48, height: 48, borderRadius: 2, bgcolor: 'action.hover' }} className="skeleton-shimmer" />
                  <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box sx={{ height: 16, width: '75%', bgcolor: 'action.hover', borderRadius: 1 }} className="skeleton-shimmer" />
                    <Box sx={{ height: 12, width: '50%', bgcolor: 'action.hover', borderRadius: 1 }} className="skeleton-shimmer" />
                  </Box>
                </Box>
                <Box sx={{ height: 32, width: '100%', bgcolor: 'action.hover', borderRadius: 1 }} className="skeleton-shimmer" />
              </Box>
            ))}
          </>
        )}
      </Box>

      <Box ref={sentinelRef} sx={{ py: 4, textAlign: 'center' }}>
        {isLoading && safeHits.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, color: 'text.secondary' }}>
            <CircularProgress size={16} color="inherit" />
            <Typography variant="caption" sx={{ fontWeight: 'bold' }}>追加のModを滑らかにロード中...</Typography>
          </Box>
        )}
        {!hasMore && safeHits.length > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold' }}>これ以上検索結果はありません</Typography>
        )}
      </Box>
    </Box>
  );
};
