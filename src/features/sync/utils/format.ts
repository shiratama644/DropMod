/**
 * 表示用の整形ヘルパ。
 */

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * バイト数を人間が読める文字列にする。
 *
 * Sync Preview の容量表示 (書き込み量 / 削除量 / バックアップ量) で使う。
 * 1024 進・小数 1 桁 (整数値なら小数なし)。
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';

  const exponent = Math.min(
    UNITS.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024))
  );
  const value = bytes / 1024 ** exponent;
  const unit = UNITS[exponent] ?? 'B';
  const rounded = exponent === 0 ? value : Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)} ${unit}`;
}
