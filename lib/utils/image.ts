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
