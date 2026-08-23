// -----------------------------------------------------------------------------
// @modal Parallel Slot の default fallback (/mods 配下、Phase 9-F)
//
// Next.js の Parallel Routes 仕様上、slot に一致するセグメントが無い場合の
// レンダー内容として default.tsx が必須。ここでは何も描画しないことで、
// `/mods/[slug]` にマッチしていない状態 (=/mods 単独) ではモーダル領域が空に。
// -----------------------------------------------------------------------------

export default function ModsModalDefault() {
  return null;
}
