/**
 * next/image はアニメ GIF を最適化できない。
 * 対象 URL には `unoptimized` を付けて警告を防ぐ。
 */
export function isAnimatedImageUrl(src: string | null | undefined): boolean {
  if (!src) return false;
  try {
    const pathname = new URL(src, 'https://cdn.modrinth.com').pathname;
    return /\.gif$/i.test(pathname);
  } catch {
    return /\.gif(?:$|[?#])/i.test(src);
  }
}

/**
 * Modrinth CDN (cdn.modrinth.com) 由来の画像か。
 *
 * Modrinth CDN は、API が返す `icon_url` / ギャラリー `url` としては
 * **既に最適化済みの WebP サムネイル** (アイコンは `_96.webp`、ギャラリーは
 * `_350.webp`) を、`raw_icon_url` / `raw_url` としては **オリジナル画像** (PNG 等) を、
 * いずれもグローバルなエッジキャッシュに載せて配信している。
 *
 * これらを next/image の最適化プロキシ (/_next/image) に通すと:
 *   - sharp 未導入環境 (Sandbox / dev) では再エンコードが極めて重い (= 全体の「もっさり」)
 *   - Modrinth 側で最適化済みのため二重処理の無駄が生じる
 * よって Modrinth CDN 画像は `unoptimized` で直接 CDN から取得する方針。
 */
export function isModrinthCdnUrl(src: string | null | undefined): boolean {
  if (!src) return false;
  try {
    return new URL(src).host === 'cdn.modrinth.com';
  } catch {
    return false;
  }
}

/**
 * next/image を最適化プロキシ経由にせず直接配信すべきか (`unoptimized` にするか)。
 *
 * 対象:
 *   - アニメ画像 (GIF): 最適化不可能・再生されなくなる
 *   - Modrinth CDN 画像: 既に最適化済み WebP、かつエッジキャッシュ済み (二重処理回避)
 *
 * これら以外のホスト (GitHub raw 等の静的画像) は、Vercel 本番環境では
 * next/image の AVIF/WebP 変換 + responsive srcset の恩恵を受けられるため
 * 最適化 ON のままにする。
 */
export function shouldUnoptimizeImage(src: string | null | undefined): boolean {
  return isAnimatedImageUrl(src) || isModrinthCdnUrl(src);
}
