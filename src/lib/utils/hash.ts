// ------------------------------------------------------------------
// Web Crypto (SubtleCrypto) は Secure Context (HTTPS または localhost)
// でのみ動作する。HTTP でホストされた場合、`crypto.subtle` は undefined
// となり、ZIP 内の .jar を SHA-1 ハッシュ照合する機能が使えなくなる。
// このモジュールは環境をチェックし、専用の InsecureContextError を投げる
// ことで、呼び出し側が明確なエラー UI を出せるようにする。
// ------------------------------------------------------------------

export class InsecureContextError extends Error {
  constructor() {
    super(
      'このブラウザ環境では SHA-1 計算 (Web Crypto API) が利用できません。' +
        'HTTPS で配信されているサイト、または localhost からアクセスしてください。'
    );
    this.name = 'InsecureContextError';
  }
}

/** Web Crypto API が現在の実行環境で利用可能か */
export function isWebCryptoAvailable(): boolean {
  return (
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined' &&
    typeof crypto.subtle.digest === 'function'
  );
}

export async function calculateSha1(buffer: ArrayBuffer): Promise<string> {
  if (!isWebCryptoAvailable()) {
    throw new InsecureContextError();
  }
  const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
