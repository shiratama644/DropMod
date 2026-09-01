'use client';

// -----------------------------------------------------------------------------
// RevealSection (Phase 9.5-C)
//
// Server Component (app/page.tsx) の中で「スクロールで fade-up する grid」を
// 実現するための thin Client wrapper。子要素は Server Component として
// 静的 HTML で render される (SEO 保全) が、その grid コンテナ自身は
// Client にしないと useScrollReveal (IntersectionObserver + Anime.js) が
// 動かないため。
//
// 使い方:
//   <RevealSection className="grid ..." selector="[data-reveal-item]">
//     <FeatureCard ... data-reveal-item />
//   </RevealSection>
// -----------------------------------------------------------------------------

import type React from 'react';
import { useScrollReveal } from '../hooks/useScrollReveal';

interface RevealSectionProps {
  children: React.ReactNode;
  className?: string;
  /** 子要素の CSS セレクタ (Anime 対象)。default '[data-reveal-item]' */
  selector?: string;
}

export function RevealSection({
  children,
  className,
  selector = '[data-reveal-item]'
}: RevealSectionProps) {
  const ref = useScrollReveal<HTMLDivElement>(selector);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
