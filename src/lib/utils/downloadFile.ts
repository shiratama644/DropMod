/**
 * リトライ付きファイルダウンロードの共通処理。
 *
 * ZIP 出力 (`hooks/useZipExport.ts`) と Sync の実体取得 (`lib/env/resolve.ts`) で
 * 挙動を揃えるために切り出した。リトライ回数や 403/404 の扱いが食い違うと
 * 「ZIP では取れたのに Sync では失敗する」という分かりにくい差になるため。
 */

/** 既定のリトライ回数 (旧 useZipExport の MAX_RETRIES と同じ) */
export const DEFAULT_DOWNLOAD_MAX_RETRIES = 2;
/** 既定のリトライ間隔 (ms) */
export const DEFAULT_DOWNLOAD_RETRY_DELAY_MS = 1000;

export interface DownloadFileOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  /** テストで fetch を差し替える */
  fetchImpl?: typeof fetch;
}

/**
 * AbortError 判定。
 *
 * `error instanceof Error` を前置かない。**Node 系の `DOMException` は `Error` を
 * 継承していない**ため、`instanceof Error && name === 'AbortError'` だと
 * 中断が検出されずリトライを続けてしまう (2026-08-29 に抽出元で見つけた潜在バグ)。
 */
function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

/**
 * 1 つのファイルをダウンロードする。
 *
 * @returns 取得した `Blob`。**403 / 404 や全リトライ失敗時は `null`**
 *          (リトライしても解決しないため即座に諦める)。
 *          中断 (`signal.aborted` / `AbortError`) は `Error('Aborted')` を throw する。
 */
export async function downloadFileWithRetry(
  fileUrl: string,
  signal: AbortSignal,
  options: DownloadFileOptions = {}
): Promise<Blob | null> {
  const {
    maxRetries = DEFAULT_DOWNLOAD_MAX_RETRIES,
    retryDelayMs = DEFAULT_DOWNLOAD_RETRY_DELAY_MS,
    fetchImpl = fetch
  } = options;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (signal.aborted) throw new Error('Aborted');

    try {
      const res = await fetchImpl(fileUrl, { signal });
      if (res.ok) return await res.blob();
      // 403 / 404 等のクライアントエラーはリトライしても解決しないため即失敗
      if (res.status === 403 || res.status === 404) return null;
    } catch (error) {
      if (signal.aborted || isAbortError(error)) {
        throw new Error('Aborted');
      }
    }

    // リトライ前の遅延 (最後のリトライ時は待たない)
    if (attempt < maxRetries - 1) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  return null;
}
