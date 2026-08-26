/**
 * SHA-1 一括計算のコア (Phase 11 / 計画書 §4.6.1)。
 *
 * Worker (hash.worker.ts) とメインスレッド fallback (hashWorker.ts) の
 * 両方から使う pure な実装。テストはこのモジュール経由で検証する。
 */

import { calculateSha1 } from '@/lib/utils/hash';

export interface HashTaskInput {
  /** ルート相対パス (例: 'mods/sodium.jar') */
  path: string;
  data: Uint8Array;
}

export interface HashResult {
  path: string;
  sha1: string;
  size: number;
}

export interface HashProgress {
  done: number;
  total: number;
}

/**
 * ファイル群の SHA-1 を並列計算する。
 * crypto.subtle 自体は内部で並列化されるため、無制限に投げず
 * ある程度の concurrency に制限して投げる (メモリ・イベントループ配慮)。
 */
export async function hashFiles(
  files: readonly HashTaskInput[],
  onProgress?: (progress: HashProgress) => void,
  concurrency = 8
): Promise<HashResult[]> {
  const results: HashResult[] = [];
  let index = 0;
  let done = 0;

  const worker = async (): Promise<void> => {
    while (index < files.length) {
      const current = files[index];
      index++;
      if (!current) continue;
      const sha1 = await calculateSha1(current.data.slice().buffer);
      results.push({
        path: current.path,
        sha1,
        size: current.data.byteLength
      });
      done++;
      onProgress?.({ done, total: files.length });
    }
  };

  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, files.length)) },
    () => worker()
  );
  await Promise.all(workers);

  // 元の順序 (path 順) を維持して返す
  const byPath = new Map(results.map((r) => [r.path, r]));
  return files
    .map((f) => byPath.get(f.path))
    .filter((r): r is HashResult => r !== undefined);
}
