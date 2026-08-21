// -----------------------------------------------------------------------------
// @modal Parallel Slot の default fallback
//
// Next.js の Parallel Routes 仕様上、slot に一致するセグメントが無い場合の
// レンダー内容として default.tsx が必須。ここでは何も描画しないことで、
// `/mod/[slug]` にマッチしていないすべてのルート (Home / /mods / /settings)
// でモーダル領域が空のままとなる。
// -----------------------------------------------------------------------------
export default function ModalDefault() {
  return null;
}
