/**
 * Sync の実行前編成 (Phase 12-B) test — `lib/env/syncPrep.ts`
 *
 * D-1 (環境不一致は Preview にも到達させない) と D-2 (権限拒否でも Read-only で
 * 解析は続ける) の分岐を検証する。依存はすべて注入するので DB / ブラウザ API 不要。
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  estimateFreeBytes,
  prepareSync,
  WRITE_PERMISSION_DENIED_MESSAGE
} from '@/lib/env/syncPrep';
import type { ScanProgress, ScanResult } from '@/lib/env/scan';
import type { EnvironmentSource } from '@/lib/env/source';
import type { ManagedFileRecord, Profile } from '@/types';
import { calculateSha1 } from '@/lib/utils/hash';
import { MemorySink } from '../../test-utils/memoryEnv';

const sha1Of = async (s: string) => calculateSha1(new TextEncoder().encode(s).buffer);

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    name: 'Pack',
    environment: { mcVersion: '1.20.1', loader: 'Fabric', loaderVersion: '0.14.21' },
    mods: [],
    linkedSource: {
      kind: 'filesystem',
      rootName: '.minecraft',
      handleId: 'dh-1',
      environment: { mcVersion: '1.20.1', loader: 'Fabric', loaderVersion: '0.14.21' },
      contentDirs: { mods: 'mods' },
      linkedAt: 1
    },
    ...overrides
  };
}

const STUB_SOURCE: EnvironmentSource = {
  kind: 'filesystem',
  rootName: '.minecraft',
  readFile: async () => new Uint8Array(0),
  listFiles: async () => [],
  listDirectories: async () => [],
  exists: async () => false
};

/** 注入用の一式を作る */
function deps(overrides: {
  opened?: unknown;
  writable?: boolean;
  scanResult?: ScanResult;
  managed?: ManagedFileRecord[];
} = {}) {
  const sink = new MemorySink({ writable: overrides.writable ?? true });
  const scan = vi.fn(async () => overrides.scanResult ?? { entries: [], skipped: [] });
  const getManaged = vi.fn(async () => overrides.managed ?? []);
  const openFolder = vi.fn(async () =>
    overrides.opened === null
      ? null
      : {
          handle: {} as FileSystemDirectoryHandle,
          source: STUB_SOURCE,
          sink,
          rootName: '.minecraft'
        }
  );
  return { sink, scan, getManaged, openFolder };
}

describe('prepareSync', () => {
  it('未紐付けなら not-linked', async () => {
    const profile = makeProfile();
    delete profile.linkedSource;
    const d = deps();
    const result = await prepareSync({ profile, deps: d });
    expect(result).toEqual({ status: 'not-linked' });
    expect(d.openFolder).not.toHaveBeenCalled();
  });

  it('ハンドルを復元できなければ folder-unavailable', async () => {
    const d = deps({ opened: null });
    const result = await prepareSync({ profile: makeProfile(), deps: d });
    expect(result).toEqual({ status: 'folder-unavailable', rootName: '.minecraft' });
    expect(d.scan).not.toHaveBeenCalled();
  });

  it('**D-1**: 環境不一致ならブロックし、スキャンもしない', async () => {
    const profile = makeProfile({
      linkedSource: {
        kind: 'filesystem',
        rootName: '.minecraft',
        handleId: 'dh-1',
        environment: { mcVersion: '1.21.4', loader: 'Fabric', loaderVersion: '0.16.0' },
        contentDirs: { mods: 'mods' },
        linkedAt: 1
      }
    });
    const d = deps();
    const result = await prepareSync({ profile, deps: d });

    expect(result.status).toBe('blocked-environment');
    if (result.status === 'blocked-environment') {
      expect(result.check.ok).toBe(false);
      expect(result.check.mismatches.map((m) => m.field)).toEqual([
        'mcVersion',
        'loaderVersion'
      ]);
    }
    // Preview にも到達させない = スキャンしない・権限も要求しない
    expect(d.scan).not.toHaveBeenCalled();
    expect(d.sink.calls).not.toContain('ensureWritable');
  });

  it('一致していれば ready になり、SyncPlan と sink を返す', async () => {
    const d = deps({
      scanResult: {
        entries: [
          { category: 'mod', path: 'mods/a.jar', sha1: await sha1Of('a'), size: 1 }
        ],
        skipped: []
      }
    });
    const profile = makeProfile({
      mods: [
        {
          projectId: 'proj-1',
          name: 'A',
          type: 'mod',
          artifact: { sha1: await sha1Of('b'), path: 'mods/a.jar', size: 2 }
        }
      ]
    });

    const result = await prepareSync({ profile, deps: d });
    expect(result.status).toBe('ready');
    if (result.status === 'ready') {
      expect(result.writable).toBe(true);
      expect(result.writableReason).toBeNull();
      expect(result.rootName).toBe('.minecraft');
      // artifact の sha1 と実体の sha1 が違う → update
      expect(result.plan.updates.map((u) => u.path)).toEqual(['mods/a.jar']);
    }
    // D-7: 権限は Sync 準備時に確認する
    expect(d.sink.calls).toContain('ensureWritable');
  });

  it('**D-2**: 権限が拒否されても plan は作り、writable=false と理由を返す', async () => {
    const d = deps({ writable: false });
    const result = await prepareSync({ profile: makeProfile(), deps: d });

    expect(result.status).toBe('ready');
    if (result.status === 'ready') {
      expect(result.writable).toBe(false);
      expect(result.writableReason).toBe(WRITE_PERMISSION_DENIED_MESSAGE);
      expect(result.plan).toBeTruthy();
    }
  });

  it('contentDirs をスキャンと diff の両方に渡す', async () => {
    const d = deps();
    const profile = makeProfile({
      mods: [{ projectId: 'p', name: 'A', type: 'mod', filename: 'a.jar' }],
      linkedSource: {
        kind: 'filesystem',
        rootName: '.minecraft',
        handleId: 'dh-1',
        environment: { mcVersion: '1.20.1', loader: 'Fabric', loaderVersion: '0.14.21' },
        contentDirs: { mods: '.minecraft/mods', resourcepacks: 'rp' },
        linkedAt: 1
      }
    });

    const result = await prepareSync({ profile, deps: d });
    expect(d.scan).toHaveBeenCalledWith(
      STUB_SOURCE,
      { mods: '.minecraft/mods', resourcepacks: 'rp' },
      undefined
    );
    if (result.status === 'ready') {
      expect(result.plan.additions.map((a) => a.path)).toEqual(['.minecraft/mods/a.jar']);
    }
  });

  it('スキャン進捗コールバックを透過する', async () => {
    const d = deps();
    const seen: ScanProgress[] = [];
    await prepareSync({
      profile: makeProfile(),
      deps: d,
      onScanProgress: (p) => seen.push(p)
    });
    expect(d.scan).toHaveBeenCalledWith(STUB_SOURCE, { mods: 'mods' }, expect.any(Function));
    expect(seen).toEqual([]); // スタブは進捗を出さない
  });

  it('スキャンで読めなかったパスを scanSkipped で返す', async () => {
    const d = deps({ scanResult: { entries: [], skipped: ['mods/locked.jar'] } });
    const result = await prepareSync({ profile: makeProfile(), deps: d });
    if (result.status === 'ready') {
      expect(result.scanSkipped).toEqual(['mods/locked.jar']);
    } else {
      throw new Error('ready になるはず');
    }
  });

  it('台帳を profileId で取得して diff に渡す', async () => {
    const d = deps({
      managed: [
        {
          id: 'p1::mods/a.jar',
          profileId: 'p1',
          category: 'mod',
          projectId: 'proj-1',
          path: 'mods/a.jar',
          sha1: await sha1Of('a'),
          size: 1,
          source: 'import',
          managedAt: 1
        }
      ],
      scanResult: {
        entries: [{ category: 'mod', path: 'mods/a.jar', sha1: await sha1Of('a'), size: 1 }],
        skipped: []
      }
    });
    // Profile から proj-1 を外す → 削除候補になる
    const result = await prepareSync({ profile: makeProfile({ mods: [] }), deps: d });
    expect(d.getManaged).toHaveBeenCalledWith('p1');
    if (result.status === 'ready') {
      expect(result.plan.deletions.map((x) => x.path)).toEqual(['mods/a.jar']);
    }
  });
});

describe('estimateFreeBytes', () => {
  afterEach(() => {
    // Object.defineProperty で付けた storage を消す (他テストへの漏れ防止)
    delete (navigator as { storage?: unknown }).storage;
    vi.unstubAllGlobals();
  });

  it('navigator.storage.estimate が無ければ undefined', async () => {
    expect(await estimateFreeBytes()).toBeUndefined();
  });

  it('quota - usage を返す', async () => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { estimate: async () => ({ quota: 1_000, usage: 300 }) }
    });
    expect(await estimateFreeBytes()).toBe(700);
  });

  it('usage が quota を超えていても負値を返さない', async () => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { estimate: async () => ({ quota: 100, usage: 500 }) }
    });
    expect(await estimateFreeBytes()).toBe(0);
  });

  it('estimate が失敗したら undefined (Sync を止めない)', async () => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        estimate: async () => {
          throw new Error('denied');
        }
      }
    });
    expect(await estimateFreeBytes()).toBeUndefined();
  });
});
