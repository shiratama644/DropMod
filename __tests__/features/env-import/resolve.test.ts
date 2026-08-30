/**
 * Sync の実体取得 (Phase 12-B) test — `lib/env/resolve.ts`
 *
 * `fetchImpl` を差し替えて検証する (msw を経由しないので他テストの handler に影響しない)。
 */

import { describe, it, expect, vi } from 'vitest';
import { createContentResolver, findProfileItem } from '@/lib/env/resolve';
import type { SyncPlanEntry } from '@/features/sync/utils/diff';
import type { Profile, ProjectItem } from '@/types';

const CONTENT = new TextEncoder().encode('jar-bytes');

function makeItem(overrides: Partial<ProjectItem> = {}): ProjectItem {
  return {
    projectId: 'proj-1',
    name: 'Sodium',
    type: 'mod',
    fileUrl: 'https://cdn.example/sodium.jar',
    filename: 'sodium-fabric-0.6.0.jar',
    ...overrides
  };
}

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    name: 'Pack',
    environment: { mcVersion: '1.20.1', loader: 'Fabric' },
    mods: [makeItem()],
    resourcepacks: [makeItem({ projectId: 'proj-rp', name: 'Pack', type: 'resourcepack', filename: 'pack.zip' })],
    ...overrides
  };
}

function entry(overrides: Partial<SyncPlanEntry> = {}): SyncPlanEntry {
  return {
    kind: 'addition',
    category: 'mod',
    path: 'mods/sodium-fabric-0.6.0.jar',
    name: 'Sodium',
    projectId: 'proj-1',
    size: CONTENT.byteLength,
    ...overrides
  };
}

/**
 * jsdom の `Blob` は `arrayBuffer()` を実装していない (`.agent/skills/env-import.md` に記載の
 * 既知の制約。実ブラウザにはある)。そのため `arrayBuffer()` を持つ Blob 互換オブジェクトを返す。
 */
function blobOf(data: Uint8Array): Blob {
  return {
    size: data.byteLength,
    type: '',
    arrayBuffer: async () => data.slice().buffer
  } as unknown as Blob;
}

function okFetch(): typeof fetch {
  return vi.fn(async () =>
    ({ ok: true, status: 200, blob: async () => blobOf(CONTENT) }) as unknown as Response
  );
}

describe('findProfileItem', () => {
  it('カテゴリと projectId で引く', () => {
    const profile = makeProfile();
    expect(findProfileItem(profile, 'mod', 'proj-1')?.name).toBe('Sodium');
    expect(findProfileItem(profile, 'resourcepack', 'proj-rp')?.name).toBe('Pack');
  });

  it('別カテゴリの同じ projectId は引かない', () => {
    expect(findProfileItem(makeProfile(), 'resourcepack', 'proj-1')).toBeUndefined();
  });

  it('projectId が無ければ undefined', () => {
    expect(findProfileItem(makeProfile(), 'mod', undefined)).toBeUndefined();
  });
});

describe('createContentResolver', () => {
  it('ダウンロードして Uint8Array を返す', async () => {
    const fetchImpl = okFetch();
    const resolve = createContentResolver({ profile: makeProfile(), fetchImpl });

    const result = await resolve(entry());
    // TypedArray は realm / prototype 差で toEqual が外れるため要素で比較する
    expect(Array.from(result.data)).toEqual(Array.from(CONTENT));
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://cdn.example/sodium.jar',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('Preview で確定済みの path はそのまま使う', async () => {
    const resolve = createContentResolver({
      profile: makeProfile(),
      contentDirs: { mods: 'other-mods' },
      fetchImpl: okFetch()
    });
    expect((await resolve(entry({ path: 'mods/keep.jar' }))).path).toBe('mods/keep.jar');
  });

  it('path 未確定なら contentDirs + filename で確定する', async () => {
    const resolve = createContentResolver({
      profile: makeProfile(),
      contentDirs: { mods: '.minecraft/mods' },
      fetchImpl: okFetch()
    });
    expect((await resolve(entry({ path: '' }))).path).toBe(
      '.minecraft/mods/sodium-fabric-0.6.0.jar'
    );
  });

  it('filename も contentDirs も無ければ path は空 (Executor が unresolved-path でスキップ)', async () => {
    const resolve = createContentResolver({
      profile: makeProfile({ mods: [makeItem({ filename: undefined })] }),
      fetchImpl: okFetch()
    });
    expect((await resolve(entry({ path: '' }))).path).toBe('');
  });

  it('Profile に無ければ throw (Sync 全体を Rollback させる)', async () => {
    const resolve = createContentResolver({ profile: makeProfile(), fetchImpl: okFetch() });
    await expect(resolve(entry({ projectId: 'proj-unknown' }))).rejects.toThrow(
      'プロファイルに見つかりません'
    );
  });

  it('fileUrl が無ければ throw し、ダウンロードしない', async () => {
    const fetchImpl = okFetch();
    const resolve = createContentResolver({
      profile: makeProfile({ mods: [makeItem({ fileUrl: undefined })] }),
      fetchImpl
    });
    await expect(resolve(entry())).rejects.toThrow('ダウンロード先が不明');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('404 なら throw', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 404 }) as unknown as Response);
    const resolve = createContentResolver({ profile: makeProfile(), fetchImpl });
    await expect(resolve(entry())).rejects.toThrow('ダウンロードに失敗しました');
  });
});
