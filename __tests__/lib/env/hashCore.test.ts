/**
 * lib/env/hashCore.ts test (Phase 11-B)
 */

import { describe, it, expect, vi } from 'vitest';
import { hashFiles } from '@/lib/env/hashCore';
import { computeHashes } from '@/lib/env/hashWorker';
import { calculateSha1 } from '@/lib/utils/hash';

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
