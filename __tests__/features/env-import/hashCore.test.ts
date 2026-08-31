/**
 * lib/env/hashCore.ts test (Phase 11-B)
 */

import { afterEach, describe, it, expect, vi } from 'vitest';
import { hashFiles } from '@/lib/env/hashCore';
import { computeHashes } from '@/lib/env/computeHashes';
import { calculateSha1 } from '@/lib/utils/hash';

/**
 * computeHashes の Worker 経路テスト用スタブ (COV-2)。
 * 実 Worker は jsdom に無いため、Worker グローバルを差し替えて
 * 成功 / 失敗 (ok:false) / onerror / data 無し の各分岐を作る。
 */
class FakeWorkerStub {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { message: string }) => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
}

function makeFiles(): Array<{ path: string; data: Uint8Array }> {
  return [
    { path: 'mods/a.jar', data: new TextEncoder().encode('content-a') },
    { path: 'mods/b.jar', data: new TextEncoder().encode('content-b') },
    { path: 'mods/c.jar', data: new TextEncoder().encode('content-c') }
  ];
}

describe('hashFiles', () => {
  it('全ファイルの sha1 と size を計算し、入力順を維持して返す', async () => {
    const files = makeFiles();
    const results = await hashFiles(files);
    expect(results).toHaveLength(3);
    expect(results[0]?.path).toBe('mods/a.jar');
    expect(results[0]?.size).toBe('content-a'.length);
    expect(results[0]?.sha1).toBe(await calculateSha1(new TextEncoder().encode('content-a').buffer));
    expect(results.map((r) => r.path)).toEqual(['mods/a.jar', 'mods/b.jar', 'mods/c.jar']);
  });

  it('進捗 callback が呼ばれる (done が単調増加し total に到達)', async () => {
    const onProgress = vi.fn();
    await hashFiles(makeFiles(), onProgress);
    expect(onProgress).toHaveBeenCalled();
    const last = onProgress.mock.calls.at(-1)?.[0];
    expect(last).toEqual({ done: 3, total: 3 });
  });

  it('空配列は空配列', async () => {
    expect(await hashFiles([])).toEqual([]);
  });

  it('配列に穴 (undefined) があってもスキップして残りを計算する', async () => {
    // files[1] が undefined の sparse 配列 → `if (!current) continue` 分岐
    const files = makeFiles();
    const sparse: Array<{ path: string; data: Uint8Array }> = [files[0]!];
    sparse.length = 3;
    sparse[2] = files[2]!;
    const results = await hashFiles(sparse);
    expect(results.map((r) => r.path)).toEqual(['mods/a.jar', 'mods/c.jar']);
  });
});

describe('computeHashes (Worker フォールバック)', () => {
  it('jsdom (Worker 未実装) ではメインスレッド fallback で同じ結果を返す', async () => {
    // jsdom には Worker が無いため hashFiles と同じ経路になる
    const files = makeFiles();
    const [viaEntry, viaCore] = await Promise.all([
      computeHashes(files),
      hashFiles(files)
    ]);
    expect(viaEntry).toEqual(viaCore);
  });

  it('進捗 callback も fallback 経路で機能する', async () => {
    const onProgress = vi.fn();
    await computeHashes(makeFiles(), onProgress);
    const last = onProgress.mock.calls.at(-1)?.[0];
    expect(last).toEqual({ done: 3, total: 3 });
  });
});

describe('computeHashes — Worker 経路 (COV-2)', () => {
  let instances: FakeWorkerStub[];

  function stubWorker(workerClass: typeof FakeWorkerStub) {
    instances = [];
    vi.stubGlobal(
      'Worker',
      class extends workerClass {
        constructor() {
          super();
          instances.push(this);
        }
      }
    );
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('Worker が ok:true で結果を返せばその結果を使う (worker.terminate も呼ばれる)', async () => {
    class OkWorker extends FakeWorkerStub {
      postMessage = vi.fn(() => {
        queueMicrotask(() => {
          this.onmessage?.({
            data: { ok: true, results: [{ path: 'mods/a.jar', size: 9, sha1: 'sha-a' }] }
          });
        });
      });
    }
    stubWorker(OkWorker);
    const results = await computeHashes(makeFiles());
    expect(results).toEqual([{ path: 'mods/a.jar', size: 9, sha1: 'sha-a' }]);
    expect(instances[0]?.terminate).toHaveBeenCalledTimes(1);
  });

  it('Worker が ok:false + error を返せばメインスレッド fallback する', async () => {
    class FailWorker extends FakeWorkerStub {
      postMessage = vi.fn(() => {
        queueMicrotask(() => {
          this.onmessage?.({ data: { ok: false, error: 'boom' } });
        });
      });
    }
    stubWorker(FailWorker);
    const [viaEntry, viaCore] = await Promise.all([
      computeHashes(makeFiles()),
      hashFiles(makeFiles())
    ]);
    expect(viaEntry).toEqual(viaCore);
  });

  it('Worker の onerror 発火時もメインスレッド fallback する', async () => {
    class ErrorWorker extends FakeWorkerStub {
      postMessage = vi.fn(() => {
        queueMicrotask(() => {
          this.onerror?.({ message: 'worker boom' });
        });
      });
    }
    stubWorker(ErrorWorker);
    const [viaEntry, viaCore] = await Promise.all([
      computeHashes(makeFiles()),
      hashFiles(makeFiles())
    ]);
    expect(viaEntry).toEqual(viaCore);
  });

  it('Worker の onerror が message 無しでも定型メッセージで fallback する', async () => {
    class NoMessageErrorWorker extends FakeWorkerStub {
      postMessage = vi.fn(() => {
        queueMicrotask(() => {
          this.onerror?.({ message: '' });
        });
      });
    }
    stubWorker(NoMessageErrorWorker);
    const [viaEntry, viaCore] = await Promise.all([
      computeHashes(makeFiles()),
      hashFiles(makeFiles())
    ]);
    expect(viaEntry).toEqual(viaCore);
  });

  it('Worker が data 無しで返した場合も fallback する', async () => {
    class UndefinedDataWorker extends FakeWorkerStub {
      postMessage = vi.fn(() => {
        queueMicrotask(() => {
          this.onmessage?.({ data: undefined });
        });
      });
    }
    stubWorker(UndefinedDataWorker);
    const [viaEntry, viaCore] = await Promise.all([
      computeHashes(makeFiles()),
      hashFiles(makeFiles())
    ]);
    expect(viaEntry).toEqual(viaCore);
  });
});
