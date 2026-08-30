/**
 * ZipSink (Phase 12-C / §10.1) test
 *
 * EnvironmentSink 契約の検証 + **Executor / Rollback が ZipSink 上でそのまま動く**こと。
 * JSZip は実物。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import JSZip from 'jszip';
import { normalizeZipPath, ZipSink } from '@/features/sync/sink/zip';
import { executeSync } from '@/features/sync/executor';
import { rollbackSync } from '@/features/sync/executor';
import { _clearAllForTesting } from '@/lib/db/dexie';
import type { SyncPlan, SyncPlanEntry } from '@/features/sync/diff';
import { calculateSha1 } from '@/lib/utils/hash';
import { MemoryBackupStore } from '../../test-utils/memoryEnv';

const sha1Of = (s: string) => calculateSha1(new TextEncoder().encode(s).buffer);
const bytes = (s: string) => new TextEncoder().encode(s);

describe('normalizeZipPath', () => {
  it('先頭の / を落とす', () => {
    expect(normalizeZipPath('/mods/a.jar')).toBe('mods/a.jar');
  });

  it('\\ を / に統一する', () => {
    expect(normalizeZipPath('mods\\a.jar')).toBe('mods/a.jar');
  });

  it('空セグメントと . を落とす', () => {
    expect(normalizeZipPath('mods//./a.jar')).toBe('mods/a.jar');
  });

  it('**ルートより上へ逃げるパスは拒否する** (zip slip 対策)', () => {
    expect(() => normalizeZipPath('../evil.jar')).toThrow('ルートより上のパス');
    expect(() => normalizeZipPath('mods/../../evil.jar')).toThrow('ルートより上のパス');
  });

  it('ルート内に収まる .. は許す', () => {
    expect(normalizeZipPath('mods/sub/../a.jar')).toBe('mods/a.jar');
  });
});

describe('ZipSink: EnvironmentSink 契約', () => {
  it('kind は zip、初期 writable は false', () => {
    const sink = new ZipSink('out.zip');
    expect(sink.kind).toBe('zip');
    expect(sink.rootName).toBe('out.zip');
    expect(sink.writable).toBe(false);
  });

  it('**ensureWritable は常に true** (権限モデルが無い)', async () => {
    const sink = new ZipSink();
    expect(await sink.ensureWritable()).toBe(true);
    expect(sink.writable).toBe(true);
  });

  it('write → read の往復', async () => {
    const sink = new ZipSink();
    await sink.writeFile('mods/a.jar', bytes('a'));
    expect(await exists(sink, 'mods/a.jar')).toBe(true);
    expect(await readFileStr(sink, 'mods/a.jar')).toBe('a');
  });

  it('既存ファイルは上書きする', async () => {
    const sink = new ZipSink();
    await sink.writeFile('mods/a.jar', bytes('old'));
    await sink.writeFile('mods/a.jar', bytes('new'));
    expect(await readFileStr(sink, 'mods/a.jar')).toBe('new');
    expect(sink.size).toBe(1);
  });

  it('readFile / exists は**存在しなければ null / false** (throw しない)', async () => {
    const sink = new ZipSink();
    expect(await sink.readFile('mods/none.jar')).toBeNull();
    expect(await exists(sink, 'mods/none.jar')).toBe(false);
  });

  it('removeFile は冪等 (無くても throw しない)', async () => {
    const sink = new ZipSink();
    await expect(sink.removeFile('mods/none.jar')).resolves.toBeUndefined();
    await sink.writeFile('mods/a.jar', bytes('a'));
    await sink.removeFile('mods/a.jar');
    await expect(sink.removeFile('mods/a.jar')).resolves.toBeUndefined();
    expect(sink.size).toBe(0);
  });

  it('親ディレクトリは自動生成される (ZIP なのでパスをそのまま持つ)', async () => {
    const sink = new ZipSink();
    await sink.writeFile('mods/sub/deep/a.jar', bytes('a'));
    expect(await exists(sink, 'mods/sub/deep/a.jar')).toBe(true);
  });

  it('seed を Map / Record / 配列のいずれでも受け付ける', async () => {
    expect(await readFileStr(new ZipSink('z', new Map([['mods/a.jar', bytes('a')]])), 'mods/a.jar')).toBe('a');
    expect(await readFileStr(new ZipSink('z', { 'mods/b.jar': bytes('b') }), 'mods/b.jar')).toBe('b');
    expect(await readFileStr(new ZipSink('z', [{ path: 'mods/c.jar', data: bytes('c') }]), 'mods/c.jar')).toBe('c');
  });

  it('seed のパスも正規化する', async () => {
    const sink = new ZipSink('z', { '/mods/a.jar': bytes('a') });
    expect(await exists(sink, 'mods/a.jar')).toBe(true);
  });

  it('byteLength は合計を返す', async () => {
    const sink = new ZipSink();
    await sink.writeFile('mods/a.jar', bytes('aaa'));
    await sink.writeFile('mods/b.jar', bytes('bb'));
    expect(sink.byteLength()).toBe(5);
  });
});

describe('ZipSink: ZIP 出力', () => {
  it('toBlob はパス順に安定した ZIP を作る', async () => {
    const sink = new ZipSink();
    await sink.writeFile('mods/z.jar', bytes('z'));
    await sink.writeFile('mods/a.jar', bytes('a'));

    const blob = await sink.toBlob();
    const zip = await JSZip.loadAsync(blob);
    // JSZip は親ディレクトリエントリ (mods/) も自動生成するので、ファイルだけを見る
    const filePaths = Object.keys(zip.files)
      .filter((p) => !zip.files[p]?.dir)
      .sort();
    expect(filePaths).toEqual(['mods/a.jar', 'mods/z.jar']);
    expect(await zip.file('mods/a.jar')?.async('string')).toBe('a');
  });

  it('空でも呼べる (空 ZIP)', async () => {
    const blob = await new ZipSink().toBlob();
    const zip = await JSZip.loadAsync(blob);
    expect(Object.keys(zip.files)).toEqual([]);
  });

  it('fromZipBlob は既存 ZIP を seed にする (**3 カテゴリ以外も保持**)', async () => {
    const zip = new JSZip();
    zip.file('mods/a.jar', 'a');
    zip.file('config/modmenu.json', '{}');
    zip.file('options.txt', 'fov:90');
    const blob = await zip.generateAsync({ type: 'blob' });

    const sink = await ZipSink.fromZipBlob(blob, 'minecraft.zip');

    expect(sink.rootName).toBe('minecraft.zip');
    expect(sink.size).toBe(3);
    // config を落とすとユーザーの環境が壊れるので保持する
    expect(await readFileStr(sink, 'config/modmenu.json')).toBe('{}');
  });

  it('fromZipBlob はディレクトリエントリを無視する', async () => {
    const zip = new JSZip();
    zip.folder('mods');
    zip.file('mods/a.jar', 'a');
    const sink = await ZipSink.fromZipBlob(await zip.generateAsync({ type: 'blob' }));
    expect(sink.size).toBe(1);
  });
});

async function exists(sink: ZipSink, path: string) {
  return sink.exists(path);
}

/** Uint8Array 同士の toEqual は vitest で不安定なので文字列で比較する */
async function readFileStr(sink: ZipSink, path: string): Promise<string> {
  const data = await sink.readFile(path);
  return data ? new TextDecoder().decode(data) : '__missing__';
}

// ============================================================================
// Executor / Rollback が ZipSink 上でそのまま動くこと
// ============================================================================

function makePlan(overrides: Partial<SyncPlan> = {}): SyncPlan {
  return {
    profileId: 'p1',
    generatedAt: 1,
    additions: [],
    updates: [],
    deletions: [],
    unchanged: [],
    unmanaged: [],
    conflicts: [],
    totals: {
      counts: { addition: 0, update: 0, deletion: 0, unchanged: 0, unmanaged: 0, conflict: 0 },
      writeBytes: 0,
      removeBytes: 0,
      backupBytes: 0
    },
    ...overrides
  };
}

function entry(overrides: Partial<SyncPlanEntry> = {}): SyncPlanEntry {
  return {
    kind: 'addition',
    category: 'mod',
    path: 'mods/a.jar',
    name: 'A',
    projectId: 'proj-1',
    size: 3,
    ...overrides
  };
}

describe('ZipSink × Executor (§10.1: 非 Chromium でも同じ機構で動く)', () => {
  beforeEach(async () => {
    await _clearAllForTesting();
  });

  it('add を ZipSink に適用し、ZIP に含まれる', async () => {
    const sink = new ZipSink();
    await sink.ensureWritable();

    const result = await executeSync({
      profileId: 'p1',
      plan: makePlan({ additions: [entry()] }),
      sink,
      backup: new MemoryBackupStore(),
      resolveContent: async () => ({ data: bytes('new'), path: 'mods/a.jar' })
    });

    expect(result.outcome).toBe('completed');
    expect(await sink.readFile('mods/a.jar')).toEqual(bytes('new'));

    const zip = await JSZip.loadAsync(await sink.toBlob());
    expect(await zip.file('mods/a.jar')?.async('string')).toBe('new');
  });

  it('**seed がある**と update が適用される (無ければ missing でスキップされる)', async () => {
    const seeded = new ZipSink('z', { 'mods/a.jar': bytes('old') });
    const seededResult = await executeSync({
      profileId: 'p1',
      plan: makePlan({
        updates: [
          entry({
            kind: 'update',
            targetSha1: 'plan-sha',
            localSha1: await sha1Of('old')
          })
        ]
      }),
      sink: seeded,
      backup: new MemoryBackupStore(),
      resolveContent: async () => ({ data: bytes('new'), path: 'mods/a.jar' })
    });
    expect(seededResult.outcome).toBe('completed');
    expect(await readFileStr(seeded, 'mods/a.jar')).toBe('new');

    // seed 無しだと readFile が null → Executor は missing としてスキップする
    const empty = new ZipSink();
    const emptyResult = await executeSync({
      profileId: 'p1',
      plan: makePlan({ updates: [entry({ kind: 'update', targetSha1: 'plan-sha' })] }),
      sink: empty,
      backup: new MemoryBackupStore(),
      resolveContent: async () => ({ data: bytes('new'), path: 'mods/a.jar' })
    });
    expect(emptyResult.skipped).toEqual([{ path: 'mods/a.jar', reason: 'missing' }]);
  });

  it('delete は Backup したうえで消す', async () => {
    const sink = new ZipSink('z', { 'mods/a.jar': bytes('old') });
    const result = await executeSync({
      profileId: 'p1',
      plan: makePlan({
        deletions: [
          entry({ kind: 'deletion', targetSha1: undefined, localSha1: await sha1Of('old') })
        ]
      }),
      sink,
      backup: new MemoryBackupStore(),
      resolveContent: async () => ({ data: bytes('unused'), path: 'mods/a.jar' })
    });

    expect(result.outcome).toBe('completed');
    expect(await sink.readFile('mods/a.jar')).toBeNull();
  });

  it('**書き込みが失敗したら Rollback で元に戻る**', async () => {
    // 2 件目の書き込みで失敗させる
    let calls = 0;
    const sink = new ZipSink('z', { 'mods/keep.jar': bytes('keep') });
    const failingSink: ZipSink = Object.create(sink);
    failingSink.writeFile = async (path: string, data: Uint8Array) => {
      calls += 1;
      if (calls > 1) throw new Error('disk full');
      return sink.writeFile(path, data);
    };

    const result = await executeSync({
      profileId: 'p1',
      plan: makePlan({
        additions: [entry({ path: 'mods/a.jar' }), entry({ path: 'mods/b.jar', name: 'B' })]
      }),
      sink: failingSink,
      backup: new MemoryBackupStore(),
      resolveContent: async (e) => ({ data: bytes(e.name), path: e.path })
    });

    expect(result.outcome).toBe('rolled-back');
    // 最初に書かれた分も巻き戻っている
    expect(await sink.readFile('mods/a.jar')).toBeNull();
    expect(await readFileStr(sink, 'mods/keep.jar')).toBe('keep');
  });

  it('rollbackSync は ZipSink 上で冪等に再実行できる', async () => {
    const sink = new ZipSink('z', { 'mods/a.jar': bytes('old') });
    const backup = new MemoryBackupStore();
    const result = await executeSync({
      profileId: 'p1',
      plan: makePlan({
        updates: [entry({ kind: 'update', targetSha1: 's', localSha1: await sha1Of('old') })]
      }),
      sink,
      backup,
      resolveContent: async () => ({ data: bytes('new'), path: 'mods/a.jar' })
    });

    const txId = result.transactionId as string;
    await rollbackSync(txId, sink, backup);
    expect(await readFileStr(sink, 'mods/a.jar')).toBe('old');
    // 2 回目も例外にならない
    await expect(rollbackSync(txId, sink, backup)).resolves.toBeDefined();
  });
});
