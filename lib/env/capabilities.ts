/**
 * ブラウザ能力の feature detection (Phase 11-A 基盤)。
 * 書き込み API (createWritable / readwrite) はここでは公開しない。
 */

export function supportsDirectoryPicker(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.showDirectoryPicker === 'function'
  );
}
