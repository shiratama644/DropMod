// ------------------------------------------------------------------
// 一意ID 生成ヘルパー
//
// - 対応環境では `crypto.randomUUID()` を使用 (v4 UUID, RFC 4122)
// - fallback は timestamp + random で衝突可能性を最小化
// - 高速連打で同一 Date.now() 内に複数呼び出されても衝突しない
// ------------------------------------------------------------------

export function generateId(prefix: string = ''): string {
  const p = prefix ? `${prefix}-` : '';
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${p}${crypto.randomUUID()}`;
  }
  // fallback
  const rand = Math.random().toString(36).slice(2, 10);
  return `${p}${Date.now()}-${rand}`;
}
