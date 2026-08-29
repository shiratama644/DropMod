/** OG 画像に載せる DL 数の短縮表記。 */
export function formatOgDownloads(num: number | undefined | null): string {
  if (!num || !Number.isFinite(num)) return '0 DL';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M DL`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K DL`;
  return `${num} DL`;
}
