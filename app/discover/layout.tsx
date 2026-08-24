// -----------------------------------------------------------------------------
// /discover 配下 Layout
//
// 検索一覧 (`/discover/mods` 等) からのソフトナビで `/mods/[slug]` を
// Intercepting Modal として重ねる。詳細の正規 URL は /mods/[slug] のまま。
// -----------------------------------------------------------------------------

import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  modal: ReactNode;
}

export default function DiscoverLayout({ children, modal }: Props) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
