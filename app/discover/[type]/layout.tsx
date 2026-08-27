// -----------------------------------------------------------------------------
// /discover/[type] 配下の Layout
//
// ルーティング再設計: プレビューモーダルを /discover/<複数>/<slug> に配置。
// この layout が @modal Parallel slot を宣言し、一覧 (children) を破棄せずに
// モーダルを重ねる（戻るで一覧の状態が保持される）。
//
//  - 一覧 (/discover/<複数>) でカードクリック → soft nav で /discover/<複数>/<slug>
//    → @modal/(.)[slug] が Intercept 発動 → {modal} にモーダル描画、{children}=一覧は生存
//  - 直接 URL /discover/<複数>/<slug> → [slug]/page.tsx がモーダルを単体描画
// -----------------------------------------------------------------------------

import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  modal: ReactNode;
}

export default function DiscoverTypeLayout({ children, modal }: Props) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
