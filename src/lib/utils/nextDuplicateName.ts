/**
 * 複製時の表示名。元が "Foo" なら "Foo (1)"。
 * 既に "Foo (1)" があれば "Foo (2)"。末尾の " (N)" は基準名から外す。
 */
export function nextDuplicateName(baseName: string, existingNames: readonly string[]): string {
  const trimmed = baseName.trim() || 'プロファイル';
  const stripped = trimmed.replace(/\s+\((\d+)\)$/, '').trim() || trimmed;
  const taken = new Set(existingNames);
  let n = 1;
  while (taken.has(`${stripped} (${n})`)) {
    n += 1;
  }
  return `${stripped} (${n})`;
}
