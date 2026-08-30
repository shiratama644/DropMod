/**
 * SHA-1 計算のエントリポイント (Phase 11)。
 *
 * 利用可能なら Web Worker (hashWorker.ts) で計算し、Worker が使えない
 * 環境 (古い環境・Worker 生成失敗・テストの jsdom) ではメインスレッド
 * (hashCore.ts) にフォールバックする。結果の型はどちらも同じ。
 */

import { hashFiles, type HashProgress, type HashResult, type HashTaskInput } from './hashCore';

export type { HashProgress, HashResult, HashTaskInput } from './hashCore';

async function hashInWorker(files: HashTaskInput[]): Promise<HashResult[]> {
  return new Promise<HashResult[]>((resolve, reject) => {
    const worker = new Worker(new URL('./hashWorker.ts', import.meta.url));
    let settled = false;
    worker.onmessage = (e: MessageEvent<{ ok: boolean; results?: HashResult[]; error?: string }>) => {
      settled = true;
      worker.terminate();
      if (e.data?.ok && Array.isArray(e.data.results)) {
        resolve(e.data.results);
      } else {
        reject(new Error(e.data?.error ?? 'hash worker failed'));
      }
    };
    worker.onerror = (e) => {
      settled = true;
      worker.terminate();
      reject(new Error(e.message || 'hash worker error'));
    };
    worker.postMessage({ files });
    void settled; // (参照保持: lint 対策の意味はないが可読性のため明示)
  });
}

/**
 * ファイル群の SHA-1 を計算する。
 * Worker 利用可 → Worker、不可/失敗 → メインスレッド。
 */
export async function computeHashes(
  files: readonly HashTaskInput[],
  onProgress?: (progress: HashProgress) => void
): Promise<HashResult[]> {
  const tasks = [...files];
  if (typeof Worker !== 'undefined') {
    try {
      return await hashInWorker(tasks);
    } catch {
      // Worker 失敗はメインスレッドで継続 (Progress はこちらで報告)
    }
  }
  return hashFiles(tasks, onProgress);
}
