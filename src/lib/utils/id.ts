// ------------------------------------------------------------------
// 一意ID 生成ヘルパー
//
// - 対応環境では `crypto.randomUUID()` を使用 (v4 UUID, RFC 4122)
// - fallback は timestamp + random で衝突可能性を最小化
// - 高速連打で同一 Date.now() 内に複数呼び出されても衝突しない
// ------------------------------------------------------------------

export function generateId(prefix: string = ''): string {
  const p = prefix ? `${prefix}-` : '';
  // crypto.randomUUID は Secure Context (HTTPS / localhost) 限定。
  // http://192.168.x.x 等の LAN アクセスでは undefined になるため
  // typeof チェックで fallback する (2026-08-27: コメント追記)。
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function' &&
    crypto.randomUUID.length > 0
  ) {
    try {
      return `${p}${crypto.randomUUID()}`;
    } catch {
      // Secure Context 判定が通っても稀に throw されるケースの防御
    }
  }
  // fallback: timestamp + random (衝突確率は十分低い)
  const rand = Math.random().toString(36).slice(2, 10);
  return `${p}${Date.now()}-${rand}`;
}
