'use client';

// -----------------------------------------------------------------------------
// HeroBackground (Phase 9.5-C)
//
// app/page.tsx の Hero セクションで使う Three.js 3D シーンの thin wrapper。
// Hero3D 本体は @react-three/fiber を含み SSR 不可 (window is not defined) の
// ため、Next.js dynamic import + { ssr: false } で切り離す。
//
// - IntersectionObserver で「Hero がビューポートに入ったら初めてロード」
//   ↑ 実際は Hero は最初から見えているので常時ロードだが、
//     unmount 時のクリーンアップを保証するため mount 状態を管理
// - Suspense loading UI は静的グラデーション (Hero3D 側の -z なので下に見える)
// -----------------------------------------------------------------------------

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

/** WebGL サポート判定 */
function supportsWebGL(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl');
    return Boolean(gl);
  } catch {
    return false;
  }
}

const Hero3D = dynamic(() => import('./Hero3D'), {
  ssr: false,
  loading: () => null
});

export function HeroBackground() {
  // Client 側で WebGL 対応 & 初回 mount 完了を待って初めて 3D をロード。
  // WebGL 非対応環境 (古いブラウザ / GPU 無効化) では 3D 非表示、
  // 下地の gradient background のみ見える。
  const [canRender, setCanRender] = useState(false);

  useEffect(() => {
    setCanRender(supportsWebGL());
  }, []);

  if (!canRender) return null;
  return <Hero3D />;
}
