// ------------------------------------------------------------------
// クロスオリジンの Blob ダウンロードヘルパー
//
// <a href={cdnUrl} download="foo.jar"> は、cdn.modrinth.com のような
// 別オリジンのURLではブラウザ仕様上 download 属性が無視され、指定した
// ファイル名にならなかったり、新規タブで開かれるだけになるケースがある。
//
// このヘルパーは対象を fetch して Blob 化し、同一オリジンの Blob URL
// にすることで download 属性を確実に有効化する。
// ------------------------------------------------------------------

const URL_REVOKE_DELAY_MS = 10_000;

export interface DownloadResult {
  ok: boolean;
  status?: number;
  error?: string;
}

/**
 * 指定 URL の内容をフェッチし、Blob としてファイル名付きでダウンロードを起こす。
 * @param url        取得対象URL (通常は Modrinth CDN の .jar)
 * @param filename   保存時のファイル名
 * @param signal     オプション: AbortController.signal
 */
export async function downloadAsBlob(
  url: string,
  filename: string,
  signal?: AbortSignal
): Promise<DownloadResult> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // GCで Blob が回収されるようにしばらく遅延して revoke
    setTimeout(() => URL.revokeObjectURL(objectUrl), URL_REVOKE_DELAY_MS);
    return { ok: true };
  } catch (e: unknown) {
    // Phase 10-P5 (noExplicitAny): TS 4.4+ の catch default = unknown。
    //   AbortError と一般 Error message を局所的な cast で narrow して抽出。
    const err = e as { name?: string; message?: string } | null;
    if (err?.name === 'AbortError') {
      return { ok: false, error: 'Aborted' };
    }
    return { ok: false, error: err?.message || 'unknown error' };
  }
}
