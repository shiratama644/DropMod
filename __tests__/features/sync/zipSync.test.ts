/**
 * ZIP への Sync (Phase 12-C / §10.1・DoD) test
 *
 * DoD: 「**Firefox / Safari で ZipSink 経由の Sync が動作**」。
 *
 * ここが検証するのは「ZIP 専用の実行系を書いていない」こと —
 * `applySync()` に sink を ZipSink で渡すだけで Journal / Backup / Rollback /
 * 台帳更新がそのまま動かなければならない。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import JSZip from 'jszip';
import { prepareZipSync, applyZipSync } from '@/features/sync/zipSync';
import { _clearAllForTesting } from '@/lib/db/dexie';
import { getManagedFiles, syncManagedFiles } from '@/features/sync';
import { calculateSha1 } from '@/lib/utils/hash';
import type { ManagedFileRecord, Profile } from '@/types';

const sha1Of = (s: string) => calculateSha1(new TextEncoder().encode(s).buffer);
const bytes = (s: string) => new TextEncoder().encode(s);

/**
 * jsdom の `Blob` は `arrayBuffer()` を実装していない (既知の制約)。
 * `createContentResolver` は `blob.arrayBuffer()` を呼ぶので互換オブジェクトを返す。
 */
function blobOf(data: Uint8Array): Blob {
  return {
    size: data.byteLength,
    type: '',
    arrayBuffer: async () => data.slice().buffer
  } as unknown as Blob;
}

/**
 * `applySync` は `resolveContent` を注入できず常に `createContentResolver` を使う。
 * したがって実体は `deps.fetchImpl` で差し替える。
 *
 * **本物の `Response` を返してはいけない**: `downloadFileWithRetry` は `res.blob()` を
 * 呼ぶが、jsdom の `Response.blob()` が返す Blob には `arrayBuffer()` が無く
 * `blob.arrayBuffer is not a function` になる。`ok` / `status` / `blob()` だけを持つ
 * 互換オブジェクトを返す。
 */
function fetchOf(content: string | ((url: string) => string) = 'new'): typeof fetch {
  return vi.fn(async (url: string | URL | Request) => {
    const text = typeof content === 'function' ? content(String(url)) : content;
    return {
      ok: true,
      status: 200,
      blob: async () => blobOf(bytes(text))
    } as unknown as globalThis.Response;
  }) as unknown as typeof fetch;
}

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    name: 'Test Profile',
    environment: { mcVersion: '1.21.1', loader: 'Fabric', loaderVersion: '0.16.0' },
    mods: [
      {
        projectId: 'proj-1',
        versionId: 'v1',
        name: 'Sodium',
        type: 'mod',
        fileUrl: 'https://cdn.example/sodium.jar',
        filename: 'sodium.jar'
      }
    ],
    ...overrides
  };
}

function managed(overrides: Partial<ManagedFileRecord> = {}): ManagedFileRecord {
  return {
    id: 'p1::mods/a.jar',
    profileId: 'p1',
    category: 'mod',
    projectId: 'proj-9',
    path: 'mods/a.jar',
    sha1: 'a'.repeat(40),
    size: 3,
    source: 'import',
    managedAt: 1_700_000_000_000,
    ...overrides
  };
}

async function seedZip(entries: Record<string, string>): Promise<Blob> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(entries)) zip.file(path, content);
  return zip.generateAsync({ type: 'blob' });
}

async function zipEntries(blob: Blob): Promise<string[]> {
  const zip = await JSZip.loadAsync(blob);
  return Object.keys(zip.files)
    .filter((p) => !zip.files[p]?.dir)
    .sort();
}

/** 台帳の登録を不要にする deps (scan は実物を使う) */
const noLedger = { getManaged: async () => [] as ManagedFileRecord[] };

describe('prepareZipSync: seed なし (Local = 空)', () => {
  beforeEach(async () => {
    await _clearAllForTesting();
  });

  it('**Profile の全 Mod が addition になる**', async () => {
    const outcome = await prepareZipSync({ profile: profile(), deps: noLedger });
    expect(outcome.status).toBe('ready');
    if (outcome.status !== 'ready') return;

    expect(outcome.prepared.plan.totals.counts.addition).toBe(1);
    expect(outcome.prepared.plan.additions[0]?.path).toContain('sodium.jar');
  });

  it('**sink は ZipSink で kind=zip・writable=true**', async () => {
    const outcome = await prepareZipSync({ profile: profile(), deps: noLedger });
    if (outcome.status !== 'ready') throw new Error('not ready');

    expect(outcome.sink.kind).toBe('zip');
    expect(outcome.sink.writable).toBe(true);
    expect(outcome.prepared.writable).toBe(true);
    expect(outcome.prepared.writableReason).toBeNull();
  });

  it('rootName は .zip になる', async () => {
    const outcome = await prepareZipSync({ profile: profile(), rootName: 'mc', deps: noLedger });
    if (outcome.status !== 'ready') throw new Error('not ready');
    expect(outcome.rootName).toBe('mc.zip');
  });

  it('**比較対象が無いので環境チェックは ok** (D-1 を誤発火させない)', async () => {
    const outcome = await prepareZipSync({ profile: profile(), deps: noLedger });
    if (outcome.status !== 'ready') throw new Error('not ready');
    expect(outcome.prepared.check.ok).toBe(true);
    expect(outcome.prepared.check.mismatches).toEqual([]);
  });
});

describe('prepareZipSync: seed あり (既存 .minecraft ZIP)', () => {
  beforeEach(async () => {
    await _clearAllForTesting();
  });

  it('**既存 ZIP の Mod を Local として差分する**', async () => {
    const seed = await seedZip({ 'mods/a.jar': 'aaa' });
    const outcome = await prepareZipSync({
      profile: profile({ mods: [] }),
      seedBlob: seed,
      deps: { getManaged: async () => [managed({ sha1: await sha1Of('aaa') })] }
    });
    if (outcome.status !== 'ready') throw new Error('not ready');

    // 台帳にあり fingerprint も一致、Profile から消えた → deletion
    expect(outcome.prepared.plan.totals.counts.deletion).toBe(1);
    expect(outcome.prepared.plan.deletions[0]?.path).toBe('mods/a.jar');
  });

  it('**環境が食い違うと D-1 でブロックする**', async () => {
    // versions/ に Forge を置く → 検出される loader が Forge になる
    const seed = await seedZip({
      'mods/a.jar': 'aaa',
      'versions/1.21.1/1.21.1.json': JSON.stringify({
        id: '1.21.1',
        mainClass: 'net.minecraft.client.main.Main',
        libraries: [{ name: 'net.minecraftforge:forge:1.21.1-51.0.0' }]
      })
    });

    const outcome = await prepareZipSync({
      profile: profile({
        environment: { mcVersion: '1.21.1', loader: 'Fabric', loaderVersion: '0.16.0' }
      }),
      seedBlob: seed,
      deps: noLedger
    });

    expect(outcome.status).toBe('blocked-environment');
    if (outcome.status !== 'blocked-environment') return;
    expect(outcome.check.ok).toBe(false);
  });

  it('**3 カテゴリ以外のファイルも sink に残る** (config を落とすと環境が壊れる)', async () => {
    const seed = await seedZip({
      'mods/a.jar': 'aaa',
      'config/modmenu.json': '{}',
      'options.txt': 'fov:90'
    });
    const outcome = await prepareZipSync({
      profile: profile({ mods: [] }),
      seedBlob: seed,
      deps: noLedger
    });
    if (outcome.status !== 'ready') throw new Error('not ready');

    expect(outcome.sink.size).toBe(3);
  });
});

describe('applyZipSync: ZipSink 経由で Sync が動作する (DoD)', () => {
  beforeEach(async () => {
    await _clearAllForTesting();
  });

  it('**適用完了時は ZIP が返り、内容が書き込まれている**', async () => {
    const outcome = await prepareZipSync({ profile: profile(), deps: noLedger });
    if (outcome.status !== 'ready') throw new Error('not ready');

    const result = await applyZipSync({
      profile: profile(),
      prepared: outcome.prepared,
      sink: outcome.sink,
      deps: { fetchImpl: fetchOf('new') }
    });

    expect(result.result.outcome).toBe('completed');
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.bytes).toBeGreaterThan(0);

    const entries = await zipEntries(result.blob as Blob);
    expect(entries).toEqual(['mods/sodium.jar']);
  });

  it('**seed の unchanged / config は ZIP に残る**', async () => {
    const seed = await seedZip({ 'config/modmenu.json': '{}', 'options.txt': 'fov:90' });
    const p = profile();
    const outcome = await prepareZipSync({
      profile: p,
      seedBlob: seed,
      deps: noLedger
    });
    if (outcome.status !== 'ready') throw new Error('not ready');

    const result = await applyZipSync({
      profile: p,
      prepared: outcome.prepared,
      sink: outcome.sink,
      deps: { fetchImpl: fetchOf('new') }
    });

    expect(result.result.outcome).toBe('completed');
    expect(await zipEntries(result.blob as Blob)).toEqual([
      'config/modmenu.json',
      'mods/sodium.jar',
      'options.txt'
    ]);
  });

  it('**完了しなかった場合は ZIP を返さない** (中途半端な ZIP を渡さない)', async () => {
    const outcome = await prepareZipSync({ profile: profile(), deps: noLedger });
    if (outcome.status !== 'ready') throw new Error('not ready');

    const result = await applyZipSync({
      profile: profile(),
      prepared: outcome.prepared,
      sink: outcome.sink,
      // 404 にしてダウンロードを失敗させる
      deps: {
        fetchImpl: vi.fn(async () => ({ ok: false, status: 404 })) as unknown as typeof fetch
      }
    });

    expect(result.result.outcome).not.toBe('completed');
    expect(result.blob).toBeNull();
    expect(result.bytes).toBe(0);
  });

  it('**台帳が更新される** (Direct Write と同じ applySync 経路)', async () => {
    const p = profile();
    const outcome = await prepareZipSync({ profile: p, deps: noLedger });
    if (outcome.status !== 'ready') throw new Error('not ready');

    const result = await applyZipSync({
      profile: p,
      prepared: outcome.prepared,
      sink: outcome.sink,
      deps: { fetchImpl: fetchOf('new') }
    });

    expect(result.ledgerUpdated).toBe(true);
    const records = await getManagedFiles('p1');
    expect(records).toHaveLength(1);
    expect(records[0]?.source).toBe('dropmod');
  });

  it('**excludedDeletionPaths で削除を除外できる** (Preview の「保持」)', async () => {
    const seed = await seedZip({ 'mods/a.jar': 'aaa' });
    const p = profile({ mods: [] });
    const outcome = await prepareZipSync({
      profile: p,
      seedBlob: seed,
      deps: { getManaged: async () => [managed({ sha1: await sha1Of('aaa') })] }
    });
    if (outcome.status !== 'ready') throw new Error('not ready');
    expect(outcome.prepared.plan.totals.counts.deletion).toBe(1);

    const result = await applyZipSync({
      profile: p,
      prepared: outcome.prepared,
      sink: outcome.sink,
      excludedDeletionPaths: ['mods/a.jar'],
      deps: { fetchImpl: fetchOf('unused') }
    });

    expect(result.result.outcome).toBe('completed');
    // 除外したので ZIP に残っている
    expect(await zipEntries(result.blob as Blob)).toEqual(['mods/a.jar']);
  });

  it('**書き込みが失敗したら Rollback され ZIP は返らない**', async () => {
    const p = profile({
      mods: [
        {
          projectId: 'proj-1',
          versionId: 'v1',
          name: 'A',
          type: 'mod',
          fileUrl: 'https://cdn.example/a.jar',
          filename: 'a.jar'
        },
        {
          projectId: 'proj-2',
          versionId: 'v2',
          name: 'B',
          type: 'mod',
          fileUrl: 'https://cdn.example/b.jar',
          filename: 'b.jar'
        }
      ]
    });
    const outcome = await prepareZipSync({ profile: p, deps: noLedger });
    if (outcome.status !== 'ready') throw new Error('not ready');

    // 2 件目で失敗させる
    let calls = 0;
    const result = await applyZipSync({
      profile: p,
      prepared: outcome.prepared,
      sink: outcome.sink,
      // 2 件目のダウンロードで失敗させる
      deps: {
        fetchImpl: vi.fn(async () => {
          calls += 1;
          if (calls > 1) return { ok: false, status: 500 };
          return { ok: true, status: 200, blob: async () => blobOf(bytes('ok')) };
        }) as unknown as typeof fetch
      }
    });

    expect(result.result.outcome).toBe('rolled-back');
    expect(result.blob).toBeNull();
    // 1 件目も巻き戻っている
    expect(outcome.sink.size).toBe(0);
    // 台帳も更新されない
    expect(await getManagedFiles('p1')).toHaveLength(0);
  });

  it('**既に台帳にある Profile でも既存レコードを壊さない**', async () => {
    await syncManagedFiles('p1', [managed()]);
    const p = profile();
    const outcome = await prepareZipSync({ profile: p });
    if (outcome.status !== 'ready') throw new Error('not ready');

    await applyZipSync({
      profile: p,
      prepared: outcome.prepared,
      sink: outcome.sink,
      deps: { fetchImpl: fetchOf('new') }
    });

    const records = await getManagedFiles('p1');
    expect(records).toHaveLength(2);
    // 既存の import レコードは source を保つ
    expect(records.find((r) => r.id === 'p1::mods/a.jar')?.source).toBe('import');
  });
});

describe('prepareZipSync: .minecraft サブフォルダ付き ZIP', () => {
  beforeEach(async () => {
    await _clearAllForTesting();
  });

  it('**.minecraft/ 直下の Mod も Local として認識する**', async () => {
    // ユーザーが「.minecraft フォルダを右クリック → 圧縮」で作る ZIP はこの形になる
    const seed = await seedZip({ '.minecraft/mods/a.jar': 'aaa' });
    const outcome = await prepareZipSync({
      profile: profile({ mods: [] }),
      seedBlob: seed,
      deps: { getManaged: async () => [managed({ sha1: await sha1Of('aaa') })] }
    });
    if (outcome.status !== 'ready') throw new Error('not ready');

    // 台帳にあり fingerprint 一致・Profile から消えた → deletion になるはず
    expect(outcome.prepared.plan.totals.counts.deletion).toBe(1);
  });

  it('**出力 ZIP に prefix 付きと無しの両方が混ざらない**', async () => {
    const seed = await seedZip({
      '.minecraft/mods/a.jar': 'aaa',
      '.minecraft/config/modmenu.json': '{}'
    });
    const p = profile();
    const outcome = await prepareZipSync({ profile: p, seedBlob: seed, deps: noLedger });
    if (outcome.status !== 'ready') throw new Error('not ready');

    const result = await applyZipSync({
      profile: p,
      prepared: outcome.prepared,
      sink: outcome.sink,
      deps: { fetchImpl: fetchOf('new') }
    });

    expect(result.result.outcome).toBe('completed');
    const entries = await zipEntries(result.blob as Blob);
    // 同じ Mod が 2 パスに存在してはいけない
    expect(entries.filter((e) => e.endsWith('sodium.jar'))).toHaveLength(1);
    expect(entries.filter((e) => e.endsWith('modmenu.json'))).toHaveLength(1);
  });
});
