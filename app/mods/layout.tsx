// -----------------------------------------------------------------------------
// /mods 配下の Layout (Phase 9-F: Intercepting Routes 用)
//
// この layout の役割:
//   - `/mods` セグメント配下でのみ Parallel Route `@modal` slot を宣言する
//   - つまり /mods (一覧) からのソフトナビで `/mods/[slug]` を開いた際、
//     `@modal/(.)[slug]/page.tsx` が modal slot に描画される
//   - 他ページ (Home /, /profile, /settings) からのクリックはこの layout の
//     外なので Parallel Route が発火せず、通常のフルページ遷移になる
//
// 直接アクセス (共有 URL / 外部リンク) の場合:
//   - `/mods/[slug]` に直接アクセス → children (page.tsx) がフルページ描画
//   - modal slot は `@modal/default.tsx` (null) にマッチ
//
// SEO / OGP:
//   - フルページ側 (app/mods/[slug]/page.tsx) が generateMetadata + canonical URL
//     を持つので、直接アクセス時の SEO はそちらに任せる
// -----------------------------------------------------------------------------

import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  modal: ReactNode;
}

export default function ModsLayout({ children, modal }: Props) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
