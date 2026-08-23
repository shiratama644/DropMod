'use client';

// -----------------------------------------------------------------------------
// LandingSearchForm (Phase 9.5-F)
//
// LP の Hero 直下に配置する検索フォーム。
//   - Enter or ボタン押下で `/mods?q=xxx` に遷移
//   - 検索結果は LP 内でインライン表示 (SSR の initialHits) → クリックで /mods/[slug]
//     詳細へ (通常の Mod 一覧と同じ挙動)
//
// SSR 側で人気 6 件を fetch して initialHits に渡す設計 → 初回描画で
// 「検索する前でも人気 Mod が並んで見える」体験。
// -----------------------------------------------------------------------------

import type React from 'react';
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

interface LandingSearchFormProps {
  /** 検索フォームの placeholder */
  placeholder?: string;
}

export function LandingSearchForm({
  placeholder = 'Mod 名で検索...',
}: LandingSearchFormProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const trimmed = query.trim();
      if (trimmed.length === 0) {
        router.push('/discover/mods');
      } else {
        router.push(`/discover/mods?q=${encodeURIComponent(trimmed)}`);
      }
    },
    [query, router]
  );

  return (
    // Phase 9.5-F (a11y): role="search" 相当を HTML5 の <search> element で表現。
    //   Biome useSemanticElements の推奨、SR も同等に landmark 認識する。
    <search className="w-full max-w-2xl mx-auto block">
    <form onSubmit={handleSubmit}>
      <div className="flex items-center gap-2 sm:gap-3 glass-panel rounded-2xl p-2 sm:p-2.5 border shadow-lg focus-within:border-emerald-500/50 focus-within:shadow-emerald-500/10 transition">
        <div className="pl-3 theme-text-muted shrink-0">
          <i className="fa-solid fa-magnifying-glass text-base" aria-hidden />
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          aria-label="Mod を検索"
          className="flex-1 min-w-0 bg-transparent border-0 outline-none text-sm sm:text-base py-1.5 sm:py-2 placeholder:theme-text-muted"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="submit"
          className="btn-hover-effect shrink-0 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-sm font-bold transition focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          検索
        </button>
      </div>
    </form>
    </search>
  );
}
