import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { Profile, ModrinthHit } from '../types';
import { ModCard } from './ModCard';
import { CustomDropdown } from './CustomDropdown';

interface HomeTabProps {
  profile: Profile;
  onEditProfile: () => void;
  onDuplicateProfile: () => void;
  onRunDependencyCheck: () => void;
  onSwitchTab: (tab: 'home' | 'mods' | 'settings') => void;
  searchInput: string;
  onSearchInputChange: (val: string) => void;
  onClearSearch: () => void;
  sortBy: string;
  onChangeSortBy: (val: string) => void;
  selectedCategory: string;
  onSelectCategory: (cat: string) => void;
  categories: Array<{ id: string; label: string }>;
  hits: ModrinthHit[];
  isLoading: boolean;
  hasMore: boolean;
  onOpenModDetail: (id: string) => void;
  onToggleMod: (id: string, e: React.MouseEvent) => void;
  // React 18.3 の Ref 型と useRef<T | null>() の互換のため React.Ref<T> を使う
  sentinelRef: React.Ref<HTMLDivElement>;
}

const SORT_OPTIONS = [
  { label: '人気順', value: 'popular' },
  { label: '関連度順', value: 'relevance' },
  { label: '最終更新順', value: 'updated' },
  { label: '新着順', value: 'newest' },
];

export const HomeTab: React.FC<HomeTabProps> = ({
  profile,
  onEditProfile,
  onDuplicateProfile,
  onRunDependencyCheck,
  onSwitchTab,
  searchInput,
  onSearchInputChange,
  onClearSearch,
  sortBy,
  onChangeSortBy,
  selectedCategory,
  onSelectCategory,
  categories = [],
  hits = [],
  isLoading,
  hasMore,
  onOpenModDetail,
  onToggleMod,
  sentinelRef,
}) => {
  const gridRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef<number>(0);

  const safeHits = Array.isArray(hits) ? hits : [];
  const safeCategories = Array.isArray(categories) ? categories : [];
  const modCount = profile?.mods?.length || 0;

  // Animate newly added card elements smoothly with GSAP cleanup
  useEffect(() => {
    if (!gridRef.current || safeHits.length === 0) {
      prevCountRef.current = 0;
      return;
    }

    const cards = gridRef.current.querySelectorAll('.mod-card-item');
    if (cards.length > prevCountRef.current) {
      const newCards = Array.from(cards).slice(prevCountRef.current);
      gsap.killTweensOf(newCards);
      gsap.fromTo(
        newCards,
        { opacity: 0, y: 20, scale: 0.97 },
        { opacity: 1, y: 0, scale: 1, duration: 0.3, stagger: 0.03, ease: 'power2.out' }
      );
    }
    prevCountRef.current = safeHits.length;

    return () => {
      if (gridRef.current) {
        const cards = gridRef.current.querySelectorAll('.mod-card-item');
        gsap.killTweensOf(cards);
      }
    };
  }, [safeHits]);

  return (
    <section id="tab-home" className="space-y-4 sm:space-y-6">
      {/* Hero Banner */}
      <div
        id="hero-banner"
        className="glass-panel rounded-3xl p-4 sm:p-6 relative overflow-hidden border border-emerald-500/20 shadow-xl"
      >
        <div className="hero-bg-cube absolute -right-10 -bottom-10 opacity-10 theme-text-brand pointer-events-none hidden sm:block">
          <i className="fa-solid fa-cubes text-[180px]" aria-hidden="true" />
        </div>

        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
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
              {profile?.description || 'ModrinthからリアルタイムでModを検索してカスタマイズできます。'}
            </p>

            <div className="pt-1 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onEditProfile}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg theme-sub-box hover:text-emerald-500 transition flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <i className="fa-solid fa-pen-to-square text-[11px]" aria-hidden="true" />
                <span>編集</span>
              </button>

              <button
                type="button"
                onClick={onDuplicateProfile}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg theme-sub-box hover:text-emerald-500 transition flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <i className="fa-solid fa-copy text-[11px]" aria-hidden="true" />
                <span>複製</span>
              </button>

              <button
                type="button"
                onClick={onRunDependencyCheck}
                className="px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-500/20 hover:bg-amber-500/30 theme-text-amber border border-amber-500/40 transition flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <i className="fa-solid fa-shield-halved text-[11px]" aria-hidden="true" />
                <span>依存・競合チェック</span>
              </button>
            </div>
          </div>

          <div className="w-full sm:w-auto shrink-0 flex items-center justify-between sm:justify-start gap-3.5 px-4 py-3 sm:px-5 sm:py-3.5 rounded-2xl bg-gradient-to-br from-emerald-500/20 via-emerald-500/10 to-emerald-500/5 border border-emerald-500/30 shadow-lg shadow-emerald-500/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-slate-950 font-extrabold text-lg sm:text-xl shadow-md ring-1 ring-white/20 shrink-0">
                <i className="fa-solid fa-cubes" aria-hidden="true" />
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

            <button
              type="button"
              onClick={() => onSwitchTab('mods')}
              className="sm:hidden px-3 py-1.5 text-xs font-bold bg-emerald-600 text-slate-950 rounded-lg"
            >
              確認
            </button>
          </div>
        </div>
      </div>

      {/* Action Bar / Search Panel */}
      <div id="search-bar-panel" className="glass-panel rounded-2xl p-3 sm:p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <i
              className={`fa-solid ${
                isLoading && safeHits.length === 0
                  ? 'fa-spinner fa-spin theme-text-brand'
                  : 'fa-magnifying-glass theme-text-muted'
              } absolute left-3.5 top-1/2 -translate-y-1/2 text-xs sm:text-sm pointer-events-none`}
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => onSearchInputChange(e.target.value)}
              placeholder="ModrinthのMod名・説明で検索..."
              className="w-full pl-9 pr-8 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm dynamic-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 transition"
            />
            {searchInput && (
              <button
                type="button"
                onClick={onClearSearch}
                aria-label="検索内容をクリア"
                className="absolute right-3 top-1/2 -translate-y-1/2 theme-text-muted hover:text-emerald-500 text-xs p-1"
              >
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between sm:justify-start gap-2">
            <span className="text-xs font-medium theme-text-muted whitespace-nowrap shrink-0 flex items-center gap-1">
              <i className="fa-solid fa-arrow-down-wide-short" aria-hidden="true" />
              <span>並び順:</span>
            </span>
            <div className="w-full sm:w-auto">
              <CustomDropdown
                options={SORT_OPTIONS}
                selectedValue={sortBy}
                onChange={onChangeSortBy}
                label="並び順"
              />
            </div>
          </div>
        </div>

        {/* Category Filter Bar */}
        <div className="scroll-fade-container">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 hide-scrollbar -mx-1 px-1 touch-pan-x">
            {safeCategories.map((cat) => {
              const isActive = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => onSelectCategory(cat.id)}
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
      <div ref={gridRef} id="mod-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {isLoading && safeHits.length === 0 ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={`initial-skeleton-${i}`} className="glass-card rounded-2xl p-4 space-y-3 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-700/50 shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-4 bg-slate-700/50 rounded w-3/4" />
                  <div className="h-3 bg-slate-700/30 rounded w-1/2" />
                </div>
              </div>
              <div className="h-8 bg-slate-700/30 rounded w-full" />
              <div className="flex justify-between items-center pt-2">
                <div className="h-4 bg-slate-700/40 rounded w-16" />
                <div className="h-6 bg-slate-700/50 rounded w-20" />
              </div>
            </div>
          ))
        ) : safeHits.length === 0 ? (
          <div className="col-span-full py-12 text-center theme-text-muted">
            <i className="fa-solid fa-magnifying-glass text-2xl mb-2 block" aria-hidden="true" />
            <p className="text-xs sm:text-sm">Modrinthに条件に一致するModが見つかりませんでした。</p>
          </div>
        ) : (
          <>
            {safeHits.map((hit) => (
              <ModCard
                key={hit.project_id}
                hit={hit}
                profile={profile}
                onOpenDetail={onOpenModDetail}
                onToggleMod={onToggleMod}
              />
            ))}

            {/* Pagination Loading Skeletons */}
            {isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <div key={`pagination-skeleton-${i}`} className="glass-card rounded-2xl p-4 space-y-3 animate-pulse">
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
      <div ref={sentinelRef} id="infinite-scroll-sentinel" className="py-6 text-center text-xs theme-text-muted">
        {isLoading && safeHits.length > 0 && (
          <div className="flex items-center justify-center gap-2 py-4 text-xs font-semibold theme-text-muted">
            <i className="fa-solid fa-spinner fa-spin theme-text-brand text-sm" aria-hidden="true" />
            <span>追加のModを滑らかにロード中...</span>
          </div>
        )}
        {!hasMore && safeHits.length > 0 && (
          <div className="py-4 text-xs theme-text-muted font-medium">これ以上検索結果はありません</div>
        )}
      </div>
    </section>
  );
};