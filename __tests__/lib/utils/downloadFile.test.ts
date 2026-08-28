/**
 * リトライ付きダウンロード共通処理 (Phase 12-B) test
 *
 * ZIP 出力と Sync の実体取得で共有する。403/404 はリトライしない、
 * 中断は例外、という契約を検証する。
 */

import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_DOWNLOAD_MAX_RETRIES,
  downloadFileWithRetry
} from '@/lib/utils/downloadFile';

const signal = () => new AbortController().signal;

function response(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    blob: async () => new Blob(['x'])
  } as unknown as Response;
}

describe('downloadFileWithRetry', () => {
  it('既定のリトライ回数は 2 (旧 useZipExport と同じ)', () => {
    expect(DEFAULT_DOWNLOAD_MAX_RETRIES).toBe(2);
  });

  it('成功したら Blob を返す', async () => {
    const fetchImpl = vi.fn(async () => response(200));
    const blob = await downloadFileWithRetry('https://cdn/x.jar', signal(), { fetchImpl });
    expect(blob).toBeInstanceOf(Blob);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('403 / 404 はリトライせず即 null', async () => {
    for (const status of [403, 404]) {
      const fetchImpl = vi.fn(async () => response(status));
      const blob = await downloadFileWithRetry('https://cdn/x.jar', signal(), {
        fetchImpl,
        retryDelayMs: 0
      });
      expect(blob).toBeNull();
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it('500 はリトライし、全滅なら null', async () => {
    const fetchImpl = vi.fn(async () => response(500));
    const blob = await downloadFileWithRetry('https://cdn/x.jar', signal(), {
      maxRetries: 3,
      retryDelayMs: 0,
      fetchImpl
    });
    expect(blob).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('一時的失敗のあと成功する', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      return calls === 1 ? response(503) : response(200);
    });
    const blob = await downloadFileWithRetry('https://cdn/x.jar', signal(), {
      maxRetries: 3,
      retryDelayMs: 0,
      fetchImpl
    });
    expect(blob).toBeInstanceOf(Blob);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('開始前に中断済みなら fetch せず Aborted を throw', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn(async () => response(200));
    await expect(
      downloadFileWithRetry('https://cdn/x.jar', controller.signal, { fetchImpl })
    ).rejects.toThrow('Aborted');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fetch 中の AbortError も Aborted を throw する (リトライしない)', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException('aborted', 'AbortError');
    });
    await expect(
      downloadFileWithRetry('https://cdn/x.jar', signal(), { maxRetries: 3, retryDelayMs: 0, fetchImpl })
    ).rejects.toThrow('Aborted');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
