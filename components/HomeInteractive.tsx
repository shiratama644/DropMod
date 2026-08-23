'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { ModrinthHit } from '@/types';
import { fetchModrinth } from '@/lib/modrinth/client';
import { categoriesForProjectType } from '@/lib/constants/categories';
import {
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
import { CustomDropdown } from './CustomDropdown';
import { ModCard } from './ModCard';
import { CacheStatusBadge } from './CacheStatusBadge';
import { useCurrentProfileWithFallback } from '@/lib/store/useCurrentProfileWithFallback';
import { useAppAction } from '@/lib/store/appActions';

// ============================================================================
// HomeInteractive
//
// Home ページの検索 / カテゴリ / ソート / 無限スクロール + Hero Banner の
// プロファイル操作 (編集 / 複製 / 依存チェック起動) を担う。
//
// profile / handleToggleMod は AppContext から取得 (useProfiles と統合)。
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

const PROJECT_TYPE_TABS: ReadonlyArray<{ id: ProjectType; label: string }> = [
  { id: 'mod', label: 'Mods' },
  { id: 'modpack', label: 'Modpacks' },
  { id: 'resourcepack', label: 'Resource Packs' },
  { id: 'shader', label: 'Shaders' }
];

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
// initialMcVersions prop 削除。AppShell 側で fetchLatestMinecraftVersions を
// Client fetch しており実質未使用 (隠しコメントでしか使われていなかった) だったため。

export const HomeInteractive: React.FC<Props> = ({
  initialHits,
  // Phase 10-P5: initialHasMore は Props 型に残しつつ destructure だけ削除。
  //   将来のページネーション「initial は hasMore かどうか」実装で
  //   復活させやすくするため型シグネチャは維持 (呼び出し側 app/mods/page.tsx も
  //   引き続き渡している)。
  initialQuery = '',
  initialProjectType = 'mod'
}) => {
  // Phase 9-A.3: useAppContext 撤去、Zustand + appActions 直接参照
  // B33 修正: 3 コンポーネントで重複していた fallback パターンを共通 hook に集約
  const profile = useCurrentProfileWithFallback();
  const handleToggleMod = useAppAction('handleToggleMod');
  const handleDuplicateProfile = useAppAction('handleDuplicateProfile');
  const openEditProfileModal = useAppAction('openEditProfileModal');
  const openDependencyCheckModal = useAppAction('openDependencyCheckModal');

  // ---------------------------------------------------------------------
  // Sub-Phase 8-B: useInfiniteQuery で検索を管理
  //
  //   - queryKey にフィルタ条件をすべて含めるため、フィルタ変更 = 別クエリ扱い
  //     → TanStack Query が自動キャッシュ・自動 abort・重複 dedupe
  //   - initialData で SSR 由来の initialHits を最初のページとして提供
  //     (これにより初回描画時は fetch を発火せず、キャッシュヒット動作)
  //   - Dexie persister が apiCache テーブルに 24h キャッシュを永続化
  //     → オフライン再訪でも既読結果が表示される
  // ---------------------------------------------------------------------

  // 絞り込み state
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

  // debounce (350ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchInput), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // 現在のフィルタから canonical query params を組み立て
  const searchParams: SearchQueryParams = useMemo(
    () => ({
      query: debouncedQuery,
      mcVersion: profile.mcVersion,
      loader: profile.loader,
      category: selectedCategory,
      sort: sortBy as SearchQueryParams['sort'],
      projectType
    }),
    [debouncedQuery, profile.mcVersion, profile.loader, selectedCategory, sortBy, projectType]
  );

  // "初期フィルタ" (SSR の initialHits に対応する canonical params)
  // 初期フィルタと一致する場合のみ initialData を使う
  const initialSearchParams: SearchQueryParams = useMemo(
    () => ({
      query: initialQuery,
      mcVersion: profile.mcVersion,
      loader: profile.loader,
      category: 'All',
      sort: 'popular',
      projectType: initialProjectType
    }),
    // profile を意図的に依存に含めず、SSR 時点のスナップショット固定にしたい所だが
    // profile が hydration 完了で変わるとキーが変わるので依存に含める
    [profile.mcVersion, profile.loader, initialQuery, initialProjectType]
  );
  const initialMatches =
    searchParams.query === initialSearchParams.query &&
    searchParams.category === initialSearchParams.category &&
    searchParams.sort === initialSearchParams.sort &&
    searchParams.mcVersion === initialSearchParams.mcVersion &&
    searchParams.loader === initialSearchParams.loader &&
    (searchParams.projectType ?? 'mod') === (initialSearchParams.projectType ?? 'mod');

  // B31 補助: SSR fetch 時刻を client mount 時に固定して initialDataUpdatedAt に使う。
  //   Date.now() は React 19 rule で render/useMemo 中に呼べないため、
  //   useState + useEffect で mount 時に 1 回だけ計算してセット。
  //   初回 render (SSR + client 1st) は 0 → CacheStatusBadge は非表示、
  //   client mount 完了で Date.now() をセット → 「今取得」表示に切り替わる。
  const [initialDataUpdatedAt, setInitialDataUpdatedAt] = useState<number>(0);
  // Phase 10-P5 (useExhaustiveDependencies): 意図的に mount 時 1 回のみ実行。
  //   initialMatches / initialHits.length は「SSR fetch 時点」のスナップショット
  //   なので、client 側で変わっても再評価しない。deps に含めると client mount 後
  //   の状態変化で誤って現在時刻に更新されてしまう。
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount 時 1 回のみ実行 (SSR スナップショット固定)
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
    // B31 修正: initialDataUpdatedAt を SSR fetch 時刻としてセット。
    //   (Date.now() は impure なので useMemo で初回のみ、上で計算)
    initialDataUpdatedAt,
    // SSR で initialHits が空だった (Modrinth 到達不可) 場合は
    // すぐ再取得を試みたい。initialData が無ければ通常フロー。
    staleTime: initialMatches ? 5 * 60 * 1000 : 0
  });

  // Flatten pages → hits[] with dedup (paranoid、Modrinth API は offset ベースなので基本不要)
  const safeHits = useMemo<ModrinthHit[]>(() => {
    const pages = query.data?.pages;
    if (!pages) return [];
    const seen = new Set<string>();
    const out: ModrinthHit[] = [];
    for (const page of pages) {
      for (const h of page.hits) {
        if (!h || typeof h.project_id !== 'string') continue;
        if (seen.has(h.project_id)) continue;
        seen.add(h.project_id);
        out.push(h);
      }
    }
    return out;
  }, [query.data]);

  const hasMore = query.hasNextPage;
  const isLoading = query.isFetching;
  const searchError =
    query.isError && !query.data
      ? (query.error instanceof Error
          ? query.error.message
          : 'Modrinthからのデータ取得に失敗しました')
      : null;

  // 無限スクロール
  const [sentinelEl, setSentinelEl] = useState<HTMLDivElement | null>(null);
  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    setSentinelEl(node);
  }, []);

  // fetchNextPage は Query インスタンスの中で stable なので useEffect deps に入れて OK
  const fetchNextPage = query.fetchNextPage;
  const isFetchingNextPage = query.isFetchingNextPage;

  useEffect(() => {
    if (!sentinelEl) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first?.isIntersecting && hasMore && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: '800px 0px', threshold: 0.01 }
    );
    observer.observe(sentinelEl);
    return () => observer.disconnect();
  }, [sentinelEl, hasMore, isFetchingNextPage, fetchNextPage]);

  // ModCard に <Link> を直接持たせたため onOpenDetail は不要。

  // Vite 版 HomeTab.tsx にあった「登録 MOD 数」大パネルを復元。
  // Home 画面右側に emerald gradient で目立つ Mod カウント表示 + モバイル用
  // 「確認」ボタン (Home → Mods タブへのショートカット)。
  const modCount = profile?.mods?.length || 0;

  return (
    <section id="tab-home" className="space-y-4 sm:space-y-6">
      {/* Hero Banner */}
      <div
        id="hero-banner"
        className="glass-panel rounded-3xl p-4 sm:p-6 relative overflow-hidden border border-emerald-500/20 shadow-xl"
      >
        <div className="hero-bg-cube absolute -right-10 -bottom-10 opacity-10 theme-text-brand pointer-events-none hidden sm:block">
          <i className="fa-solid fa-cubes text-[180px]" aria-hidden />
        </div>

        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {/* profile?.mcVersion || '未設定' 等のフォールバック (Vite 版と同挙動) */}
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 theme-text-brand border border-emerald-500/30 shrink-0">
                Minecraft {profile?.mcVersion || '未設定'}
              </span>
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/20 theme-text-blue border border-blue-500/30 shrink-0">
                {profile?.loader || '未設定'}
              </span>
            </div>
            <h2 className="text-lg sm:text-2xl md:text-3xl font-extrabold tracking-tight break-all leading-tight">
              {profile?.name || '名称未設定プロファイル'}
            </h2>
            <p className="text-xs sm:text-sm theme-text-muted break-all leading-relaxed">
              {profile?.description ||
                'ModrinthからリアルタイムでModを検索してカスタマイズできます。'}
            </p>
            <div className="flex flex-wrap items-center gap-1.5 pt-2">
              <button
                type="button"
                onClick={openEditProfileModal}
                className="btn-hover-effect px-3 py-1.5 text-xs font-bold rounded-xl theme-sub-box border transition flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <i className="fa-solid fa-pen-to-square theme-text-brand" aria-hidden />
                プロファイルを編集
              </button>
              <button
                type="button"
                onClick={handleDuplicateProfile}
                className="btn-hover-effect px-3 py-1.5 text-xs font-bold rounded-xl theme-sub-box border transition flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <i className="fa-solid fa-copy theme-text-blue" aria-hidden />
                複製
              </button>
              <button
                type="button"
                onClick={openDependencyCheckModal}
                className="btn-hover-effect px-3 py-1.5 text-xs font-bold rounded-xl bg-amber-500/10 hover:bg-amber-500/20 theme-text-amber border border-amber-500/30 transition flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <i className="fa-solid fa-shield-halved" aria-hidden />
                依存・競合チェック
              </button>
            </div>
          </div>

          {/* 登録 MOD 数パネル (Vite 版と同構造) */}
          <div className="w-full sm:w-auto shrink-0 flex items-center justify-between sm:justify-start gap-3.5 px-4 py-3 sm:px-5 sm:py-3.5 rounded-2xl bg-gradient-to-br from-emerald-500/20 via-emerald-500/10 to-emerald-500/5 border border-emerald-500/30 shadow-lg shadow-emerald-500/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-slate-950 font-extrabold text-lg sm:text-xl shadow-md ring-1 ring-white/20 shrink-0">
                <i className="fa-solid fa-cubes" aria-hidden />
              </div>
              <div>
                <div className="text-xs font-bold theme-text-secondary uppercase tracking-wider">
                  登録 MOD 数
                </div>
                <div className="text-2xl sm:text-3xl font-black theme-text-brand font-mono tracking-tight leading-none mt-0.5">
                  {modCount}
                </div>
              </div>
            </div>
            {/* モバイル用ショートカット (Phase 9-F: /mods → /profile URL 再設計) */}
            <Link
              href="/profile"
              className="sm:hidden px-3 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-lg transition"
            >
              確認
            </Link>
          </div>
        </div>
      </div>

      {/* Search / Sort / Category */}
      <div id="search-bar-panel" className="glass-panel rounded-2xl p-3 sm:p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <i
              className={`fa-solid ${
                isLoading && safeHits.length === 0
                  ? 'fa-spinner fa-spin theme-text-brand'
                  : 'fa-magnifying-glass theme-text-muted'
              } absolute left-3.5 top-1/2 -translate-y-1/2 text-xs sm:text-sm pointer-events-none`}
              aria-hidden
            />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="ModrinthのMod名・説明で検索..."
              className="w-full pl-9 pr-8 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm dynamic-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 transition"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                aria-label="検索内容をクリア"
                className="absolute right-3 top-1/2 -translate-y-1/2 theme-text-muted hover:text-emerald-500 text-xs p-1"
              >
                <i className="fa-solid fa-xmark" aria-hidden />
              </button>
            )}
          </div>
          <div className="flex items-center justify-between sm:justify-start gap-2">
            <span className="text-xs font-medium theme-text-muted whitespace-nowrap shrink-0 flex items-center gap-1">
              <i className="fa-solid fa-arrow-down-wide-short" aria-hidden />
              <span>並び順:</span>
            </span>
            <div className="w-full sm:w-auto">
              <CustomDropdown
                options={SORT_OPTIONS}
                selectedValue={sortBy}
                onChange={setSortBy}
                label="並び順"
              />
            </div>
            <span className="text-xs font-medium theme-text-muted whitespace-nowrap shrink-0 flex items-center gap-1">
              <i className="fa-solid fa-table-cells-large" aria-hidden />
              <span>表示:</span>
            </span>
            <div className="w-full sm:w-auto min-w-[10rem]">
              <CustomDropdown
                options={[...SEARCH_LAYOUT_OPTIONS]}
                selectedValue={layout}
                onChange={handleLayoutChange}
                label="表示形式"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar -mx-1 px-1 touch-pan-x">
          {PROJECT_TYPE_TABS.map((tab) => {
            const isActive = projectType === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleProjectTypeChange(tab.id)}
                aria-pressed={isActive}
                className={`btn-hover-effect px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition active:scale-95 focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  isActive
                    ? 'bg-emerald-600 text-slate-950 font-bold shadow'
                    : 'theme-sub-box theme-text-secondary hover:text-emerald-500'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Category Filter */}
        <div className="scroll-fade-container">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 hide-scrollbar -mx-1 px-1 touch-pan-x">
            {typeCategories.map((cat) => {
              const isActive = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  aria-pressed={isActive}
                  className={`btn-hover-effect px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition active:scale-95 focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    isActive
                      ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                      : 'theme-sub-box theme-text-secondary hover:text-emerald-500'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Search メタ (件数 + キャッシュ状態バッジ) - Phase 9-E.1 (E-2) */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs theme-text-muted">
          {safeHits.length > 0 && `${safeHits.length} 件${hasMore ? '+' : ''}`}
        </span>
        <CacheStatusBadge
          dataUpdatedAt={query.dataUpdatedAt}
          isFetching={query.isFetching}
        />
      </div>

      {/* Mod Grid */}
      <div id="mod-grid" className={searchGridClass(layout)}>
        {isLoading && safeHits.length === 0 ? (
          INITIAL_SKELETON_KEYS.map((k) => (
            <div
              key={k}
              className="glass-card rounded-2xl p-4 space-y-3 skeleton-shimmer"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-700/50 shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-4 bg-slate-700/50 rounded w-3/4" />
                  <div className="h-3 bg-slate-700/30 rounded w-1/2" />
                </div>
              </div>
              <div className="h-8 bg-slate-700/30 rounded w-full" />
            </div>
          ))
        ) : safeHits.length === 0 ? (
          searchError ? (
            <div className="col-span-full py-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/20 theme-text-amber flex items-center justify-center mx-auto text-2xl mb-3">
                <i className="fa-solid fa-triangle-exclamation" aria-hidden />
              </div>
              <p className="text-sm font-bold mb-1">Modrinthから取得できませんでした</p>
              <p className="text-xs theme-text-muted mb-4 max-w-sm mx-auto break-words">
                {searchError}
              </p>
              <button
                type="button"
                onClick={() => void query.refetch()}
                className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-xl transition shadow focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <i className="fa-solid fa-rotate-right mr-1.5" aria-hidden />
                再試行
              </button>
            </div>
          ) : (
            <div className="col-span-full py-12 text-center theme-text-muted">
              <i
                className="fa-solid fa-magnifying-glass text-2xl mb-2 block"
                aria-hidden
              />
              <p className="text-xs sm:text-sm">
                Modrinthに条件に一致するModが見つかりませんでした。
              </p>
            </div>
          )
        ) : (
          <>
            {safeHits.map((hit) => (
              <ModCard
                key={hit.project_id}
                hit={hit}
                profile={profile}
                onToggleMod={handleToggleMod}
                layout={layout}
              />
            ))}
            {isLoading &&
              PAGINATION_SKELETON_KEYS.map((k) => (
                <div
                  key={k}
                  className="glass-card rounded-2xl p-4 space-y-3 skeleton-shimmer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-700/50 shrink-0" />
                    <div className="space-y-1.5 flex-1">
                      <div className="h-4 bg-slate-700/50 rounded w-3/4" />
                      <div className="h-3 bg-slate-700/30 rounded w-1/2" />
                    </div>
                  </div>
                  <div className="h-8 bg-slate-700/30 rounded w-full" />
                </div>
              ))}
          </>
        )}
      </div>

      {/* Infinite Scroll Sentinel */}
      <div
        ref={sentinelRef}
        id="infinite-scroll-sentinel"
        className="py-6 text-center text-xs theme-text-muted"
      >
        {isLoading && safeHits.length > 0 && (
          <div className="flex items-center justify-center gap-2 py-4 text-xs font-semibold theme-text-muted">
            <i
              className="fa-solid fa-spinner fa-spin theme-text-brand text-sm"
              aria-hidden
            />
            <span>追加のModを滑らかにロード中...</span>
          </div>
        )}
        {!hasMore && safeHits.length > 0 && (
          <div className="py-4 text-xs theme-text-muted font-medium">
            これ以上検索結果はありません
          </div>
        )}
      </div>
    </section>
  );
};
