'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { ModrinthHit } from '@/types';
import { fetchModrinth } from '@/lib/modrinth/client';
import { CATEGORIES } from '@/lib/constants/categories';
import { CustomDropdown } from './CustomDropdown';
import { ModCard } from './ModCard';
import { useAppContext } from './AppContext';

// ============================================================================
// HomeInteractive (Phase 5 版)
//
// Home ページの検索 / カテゴリ / ソート / 無限スクロール + Hero Banner の
// プロファイル操作 (編集 / 複製 / 依存チェック起動) を担う。
//
// Phase 3: profile / handleToggleMod は props で受け取っていた
// Phase 5: AppContext から取得 (useProfiles と統合)
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

interface Props {
  /** SSR で取得した初期 24 件 (cookie ベースの実プロファイル、H4-5 で cookie 化済) */
  initialHits: ModrinthHit[];
  /** 初期絞り込みが hasMore かどうか (24 件以上ヒットしていれば true) */
  initialHasMore: boolean;
}
// M5-1 修正: initialMcVersions prop 削除。AppShell 側で fetchLatestMinecraftVersions を
// Client fetch しており実質未使用 (隠しコメントでしか使われていなかった) だったため。

export const HomeInteractive: React.FC<Props> = ({
  initialHits,
  initialHasMore
}) => {
  const {
    currentProfile: profile,
    handleToggleMod,
    handleDuplicateProfile,
    openEditProfileModal,
    openDependencyCheckModal
  } = useAppContext();

  // 表示状態
  const [hits, setHits] = useState<ModrinthHit[]>(initialHits);
  const [hasMore, setHasMore] = useState<boolean>(initialHasMore);
  const [offset, setOffset] = useState<number>(initialHits.length);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // 絞り込み state
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [sortBy, setSortBy] = useState<string>('popular');
  const [searchInput, setSearchInput] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');

  const activeAbortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef<number>(0);
  const isLoadingRef = useRef<boolean>(false);
  const isFirstRunRef = useRef<boolean>(true);

  const SEARCH_LIMIT = 24;

  const executeSearch = useCallback(
    async (append: boolean, targetOffset: number) => {
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

  const executeSearchRef = useRef(executeSearch);
  executeSearchRef.current = executeSearch;

  // debounce
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchInput), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (isFirstRunRef.current) {
      isFirstRunRef.current = false;
      return;
    }
    setOffset(0);
    setHasMore(true);
    executeSearchRef.current(false, 0);
  }, [profile.mcVersion, profile.loader, selectedCategory, sortBy, debouncedQuery]);

  // 無限スクロール
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

  useEffect(() => {
    return () => {
      if (activeAbortRef.current) activeAbortRef.current.abort();
    };
  }, []);

  // C5-1 修正: ModCard に <Link> を直接持たせたため onOpenDetail は不要になった。
  // 以前は Link と router.push の二重遷移が発生していた。

  const safeHits = Array.isArray(hits) ? hits : [];

  // M4-1 修正: Vite 版 HomeTab.tsx にあった「登録 MOD 数」大パネルを復元。
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
              {/* M4-2 修正: profile?.mcVersion || '未設定' 等のフォールバックを Vite 版から復元 */}
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

          {/* M4-1 修正: 登録 MOD 数パネル (Vite 版から復元) */}
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
            {/* モバイル用ショートカット (Vite 版と同挙動) */}
            <Link
              href="/mods"
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
                onToggleMod={handleToggleMod}
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
    </section>
  );
};
