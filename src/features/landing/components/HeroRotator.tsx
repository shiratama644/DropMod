'use client';

// -----------------------------------------------------------------------------
// HeroRotator (Phase 9.5-F)
//
// Hero 見出しの一部単語 (「Mods」「Modpacks」「Resource Packs」「Shaders」など)
// を一定間隔で fade-in/out して切り替える演出。
//
// 実装:
//   - 3.5 秒ごとに次単語へ (計画書のインスパイア元と同等の pace)
//   - Anime.js は使わず CSS transition だけで軽量に (Anime.js は他所で使用中)
//   - Reduced Motion: 常に最初の単語を静的表示 (WCAG 2.1 SC 2.3.3)
//   - SSR HTML には最初の単語を含める (h1 の SEO 保持)
// -----------------------------------------------------------------------------

import { useEffect, useState } from 'react';

interface HeroRotatorProps {
  /** 切替する単語一覧。最低 1 個。SSR HTML には words[0] が入る */
  words: readonly string[];
  /** 切替間隔 (ms、default 3500) */
  intervalMs?: number;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function HeroRotator({ words, intervalMs = 3500 }: HeroRotatorProps) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  // Phase 10-P5: mount 時 1 回 subscribe、options 変更を想定しない
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount 時 1 回のみ実行
  useEffect(() => {
    if (prefersReducedMotion() || words.length <= 1) return;
    let cancelled = false;
    const cycle = () => {
      if (cancelled) return;
      // fade out
      setVisible(false);
      window.setTimeout(() => {
        if (cancelled) return;
        setIndex((prev) => (prev + 1) % words.length);
        // fade in
        setVisible(true);
      }, 300);
    };
    const id = window.setInterval(cycle, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const current = words[index] ?? words[0] ?? '';

  return (
    <span
      className="inline-block bg-gradient-to-br from-emerald-400 via-emerald-500 to-emerald-600 bg-clip-text text-transparent transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {current}
    </span>
  );
}
