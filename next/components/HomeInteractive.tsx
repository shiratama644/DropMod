'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ModrinthHit, Profile } from '@/types';
import { fetchModrinth } from '@/lib/modrinth/client';
import { CATEGORIES } from '@/lib/constants/categories';
import { CustomDropdown } from './CustomDropdown';
import { ModCard } from './ModCard';

// ============================================================================
// HomeInteractive (Phase 3 版)
//
// Home ページの検索 / カテゴリ / ソート / 無限スクロールを担う Client
// Component。初期 24 件は Server Component 側で SSR 取得され、props で
// ハイドレートされる (体感 TTFB / LCP の高速化)。
//
// 以降のページング・絞り込み・検索クエリ変更は Client 側で
// /api/modrinth/* プロキシ経由 (キャッシュはブラウザ側 = 未実装 = 都度取得)。
//
// Phase 5 で useProfiles を Client Context 化した際、`profile` prop を
// Context 経由に差し替える予定。現在は Phase 3 用に SSR 側で採用したのと
// 同じ default profile を props で受け取る。
// ============================================================================

const SORT_OPTIONS = [
  { label: '人気順', value: 'popular' },
  { label: '関連度順', value: 'relevance' },
  { label: '最終更新順', value: 'updated' },
  { label: '新着順', value: 'newest' }
];

interface Props {
  /** 初期プロファイル (Phase 5 で Context 差替え予定) */
  profile: Profile;
  /** SSR で取得した初期 24 件 */
  initialHits: ModrinthHit[];
  /** SSR で取得した Minecraft バージョン一覧 */
  initialMcVersions: string[];
  /** 初期絞り込みが hasMore かどうか (24 件以上ヒットしていれば true) */
  initialHasMore: boolean;
}

export const HomeInteractive: React.FC<Props> = ({
  profile,
  initialHits,
  initialMcVersions,
  initialHasMore
}) => {
  const router = useRouter();

  // 表示状態
  const [hits, setHits] = useState<ModrinthHit[]>(initialHits);
  const [hasMore, setHasMore] = useState<boolean>(initialHasMore);
  const [offset, setOffset] = useState<number>(initialHits.length);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // 絞り込み state (初期値 = SSR で採用したデフォルト)
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [sortBy, setSortBy] = useState<string>('popular');
  const [searchInput, setSearchInput] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');

  // 検索の race condition 対策 (Phase 2 で移植済みの Vite 版と同パターン)
  const activeAbortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef<number>(0);
  const isLoadingRef = useRef<boolean>(false);
  const isFirstRunRef = useRef<boolean>(true);

  const SEARCH_LIMIT = 24;

  // 検索実行
  const executeSearch = useCallback(
    async (append: boolean, targetOffset: number) => {
      // append=false (絞り込み変更) は前のリクエストを強制中断
      // append=true (無限スクロール) は既存 fetch 中ならスキップ
      if (append) {
        if (isLoadingRef.current) return;
      } else if (activeAbortRef.current) {
        activeAbortRef.current.abort();
      }

      const mySeq = ++requestSeqRef.current;
      const controller = new AbortController();
      activeAbortRef.current = controller;

      isLoadingRef.current = true;
      setIsLoading(true);
      setSearchError(null);

      let indexParam = 'downloads';
      if (sortBy === 'relevance') indexParam = 'relevance';
      if (sortBy === 'updated') indexParam = 'updated';
      if (sortBy === 'newest') indexParam = 'newest';

      const facets: string[][] = [['project_type:mod']];
      if (profile.mcVersion) facets.push([`versions:${profile.mcVersion}`]);
      if (profile.loader) facets.push([`categories:${profile.loader.toLowerCase()}`]);
      if (selectedCategory && selectedCategory !== 'All') {
        facets.push([`categories:${selectedCategory}`]);
      }

      try {
        const data = await fetchModrinth<{ hits: ModrinthHit[] }>(
          '/search',
          {
            query: debouncedQuery.trim(),
            facets: JSON.stringify(facets),
            index: indexParam,
            limit: SEARCH_LIMIT,
            offset: targetOffset
          },
          { signal: controller.signal }
        );

        if (mySeq !== requestSeqRef.current) return;

        isLoadingRef.current = false;
        setIsLoading(false);

        if (data && Array.isArray(data.hits)) {
          setHasMore(data.hits.length >= SEARCH_LIMIT);
          setOffset(targetOffset + data.hits.length);
          if (append) {
            setHits((prev) => {
              const existingIds = new Set(prev.map((h) => h.project_id));
              const uniqueNew = data.hits.filter(
                (h) => h && h.project_id && !existingIds.has(h.project_id)
              );
              return [...prev, ...uniqueNew];
            });
          } else {
            // 初期取得時も重複除去
            const seen = new Set<string>();
            const uniq = data.hits.filter((h) => {
              if (!h || !h.project_id) return false;
              if (seen.has(h.project_id)) return false;
              seen.add(h.project_id);
              return true;
            });
            setHits(uniq);
          }
        } else {
          if (!append) setHits([]);
          setHasMore(false);
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'AbortError') return;
        if (mySeq !== requestSeqRef.current) return;
        isLoadingRef.current = false;
        setIsLoading(false);
        if (!append) {
          setHits([]);
          setHasMore(false);
        }
        setSearchError(
          e instanceof Error ? e.message : 'Modrinthからのデータ取得に失敗しました'
        );
      }
    },
    [profile.mcVersion, profile.loader, selectedCategory, sortBy, debouncedQuery]
  );

  // 常に最新の executeSearch を Ref に保持 (render 中同期セットで race 防止)
  const executeSearchRef = useRef(executeSearch);
  executeSearchRef.current = executeSearch;

  // 検索文字列 debounce (350ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchInput), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // 絞り込み or 検索文字列変更 → 検索実行
  // (初回マウントは SSR 済みなのでスキップ)
  useEffect(() => {
    if (isFirstRunRef.current) {
      isFirstRunRef.current = false;
      return;
    }
    setOffset(0);
    setHasMore(true);
    executeSearchRef.current(false, 0);
  }, [profile.mcVersion, profile.loader, selectedCategory, sortBy, debouncedQuery]);

  // 無限スクロール (sentinel は callback ref でマウント/アンマウントを確実に検知)
  const [sentinelEl, setSentinelEl] = useState<HTMLDivElement | null>(null);
  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    setSentinelEl(node);
  }, []);

  const fetchNextPageRef = useRef(() => executeSearchRef.current(true, offset));
  fetchNextPageRef.current = () => executeSearchRef.current(true, offset);

  useEffect(() => {
    if (!sentinelEl) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingRef.current) {
          fetchNextPageRef.current();
        }
      },
      { rootMargin: '800px 0px', threshold: 0.01 }
    );
    observer.observe(sentinelEl);
    return () => observer.disconnect();
  }, [sentinelEl, hasMore]);

  // アンマウント時に abort
  useEffect(() => {
    return () => {
      if (activeAbortRef.current) activeAbortRef.current.abort();
    };
  }, []);

  const handleOpenModDetail = useCallback(
    (id: string) => {
      // Phase 4 で Parallel Route の /mod/[slug] へ soft navigation
      router.push(`/mod/${id}`);
    },
    [router]
  );

  const handleToggleModStub = useCallback((_id: string, e: React.MouseEvent) => {
    // Phase 5 で useProfiles と連結。現段階は無操作。
    e.stopPropagation();
  }, []);

  const safeHits = Array.isArray(hits) ? hits : [];
  const safeMcVersions = Array.isArray(initialMcVersions) ? initialMcVersions : [];

  return (
    <section id="tab-home" className="space-y-4 sm:space-y-6">
      {/* Hero Banner (Phase 3 では最小限。Phase 5 で編集ボタン等を追加) */}
      <div
        id="hero-banner"
        className="glass-panel rounded-3xl p-4 sm:p-6 relative overflow-hidden border border-emerald-500/20 shadow-xl"
      >
        <div className="hero-bg-cube absolute -right-10 -bottom-10 opacity-10 theme-text-brand pointer-events-none hidden sm:block">
          <i className="fa-solid fa-cubes text-[180px]" aria-hidden />
        </div>
        <div className="relative z-10 min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 theme-text-brand border border-emerald-500/30">
              Minecraft {profile.mcVersion}
            </span>
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/20 theme-text-blue border border-blue-500/30">
              {profile.loader}
            </span>
          </div>
          <h2 className="text-lg sm:text-2xl md:text-3xl font-extrabold tracking-tight break-all leading-tight">
            {profile.name}
          </h2>
          <p className="text-xs sm:text-sm theme-text-muted break-all leading-relaxed">
            {profile.description ||
              'ModrinthからリアルタイムでModを検索してカスタマイズできます。'}
          </p>
          <p className="text-[11px] theme-text-muted mt-2">
            <i className="fa-solid fa-info-circle mr-1" aria-hidden />
            Phase 3: 初期 {initialHits.length} 件は Server 側で ISR 取得済。以降の検索は Client 側で実行。
            (Phase 5 でプロファイル切替 UI が有効化されます)
          </p>
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
          </div>
        </div>

        {/* Category Filter */}
        <div className="scroll-fade-container">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 hide-scrollbar -mx-1 px-1 touch-pan-x">
            {CATEGORIES.map((cat) => {
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

      {/* Mod Grid */}
      <div id="mod-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {isLoading && safeHits.length === 0 ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div
              key={`initial-skeleton-${i}`}
              className="glass-card rounded-2xl p-4 space-y-3 animate-pulse"
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
                onClick={() => {
                  setOffset(0);
                  setHasMore(true);
                  executeSearchRef.current(false, 0);
                }}
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
                onOpenDetail={handleOpenModDetail}
                onToggleMod={handleToggleModStub}
              />
            ))}
            {isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={`pagination-skeleton-${i}`}
                  className="glass-card rounded-2xl p-4 space-y-3 animate-pulse"
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

      {/* Phase 3 で initialMcVersions は未使用だが Phase 5 で使う想定なので保持 */}
      <div hidden aria-hidden>
        {safeMcVersions.length} MC versions preloaded from SSR
      </div>
    </section>
  );
};
