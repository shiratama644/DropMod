/**
 * フォルダ紐付け (Phase 12-B) test — `lib/env/link.ts`
 *
 * **D-7**: 紐付けは `mode: 'read'` (picker は既存実装をそのまま使用)。
 * ハンドルの永続化 (Dexie `dirHandles`) と `Profile.linkedSource` の生成・復元を検証する。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildLinkedSource,
  createFolderLink,
  linkPickedDirectory,
  openLinkedFolder,
  releaseFolderLink
} from '@/features/sync/link';
import type { PickedDirectory } from '@/features/env-import/picker';
import { FileSystemSink } from '@/features/sync/sink/filesystem';
import { FileSystemSource } from '@/lib/env/source';
import type { DetectedEnvironment } from '@/features/env-import/detector';
import { _clearAllForTesting, getDirHandle } from '@/lib/db/dexie';
import type { LinkedSource } from '@/types';
import { asFakeDirectory, createFakeFileSystem } from '@/__tests__/test-utils/fakeFs';

const DETECTED: DetectedEnvironment = {
  rootType: 'official',
  mcVersion: '1.20.1',
  loader: 'Fabric',
  loaderVersion: '0.14.21',
  contentDirs: { mods: 'mods', resourcepacks: 'resourcepacks' }
};

/** OfficialLauncherDetector が Fabric 1.20.1 を検出するフォルダ構成 */
const FABRIC_JSON = JSON.stringify({
  id: 'fabric-loader-0.14.21-1.20.1',
  inheritsFrom: '1.20.1',
  mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient',
  libraries: [{ name: 'net.fabricmc:fabric-loader:0.14.21' }]
});

function pickedDirectory(name = '.minecraft'): PickedDirectory {
  const handle = createFakeFileSystem(
    {
      'mods/a.jar': 'x',
      'resourcepacks/pack.zip': 'zip',
      'versions/fabric-loader-0.14.21-1.20.1/fabric-loader-0.14.21-1.20.1.json': FABRIC_JSON
    },
    name
  );
  return { handle, source: new FileSystemSource(handle, name) };
}

describe('buildLinkedSource (pure)', () => {
  it('検出結果を LinkedSource に写す', () => {
    const result = buildLinkedSource({
      handleId: 'dh-1',
      rootName: '.minecraft',
      detected: DETECTED,
      now: 1_700_000_000_000
    });
    expect(result).toEqual({
      kind: 'filesystem',
      rootName: '.minecraft',
      handleId: 'dh-1',
      environment: { mcVersion: '1.20.1', loader: 'Fabric', loaderVersion: '0.14.21' },
      contentDirs: { mods: 'mods', resourcepacks: 'resourcepacks', shaderpacks: undefined },
      linkedAt: 1_700_000_000_000
    });
  });

  it('Generic フォルダ等、検出できなかった項目は undefined のまま残す (D-1 の unverified 用)', () => {
    const result = buildLinkedSource({
      handleId: 'dh-2',
      rootName: 'mods-folder',
      detected: { rootType: 'generic', contentDirs: { mods: 'mods' } },
      now: 1
    });
    expect(result.environment).toEqual({
      mcVersion: undefined,
      loader: undefined,
      loaderVersion: undefined
    });
  });
});

describe('createFolderLink', () => {
  beforeEach(async () => {
    await _clearAllForTesting();
  });

  it('ユーザーがキャンセルしたら null (エラーにしない)', async () => {
    const result = await createFolderLink('p1', { pick: async () => null }, 1);
    expect(result).toBeNull();
  });

  it('フォルダを解析し、ハンドルを Dexie に保存して LinkedSource を返す', async () => {
    const picked = pickedDirectory('MyInstance');
    const result = await createFolderLink(
      'p1',
      { pick: async () => picked },
      1_700_000_000_000
    );

    expect(result).toMatchObject({
      kind: 'filesystem',
      rootName: 'MyInstance',
      environment: { mcVersion: '1.20.1', loader: 'Fabric' },
      contentDirs: { mods: 'mods', resourcepacks: 'resourcepacks' },
      linkedAt: 1_700_000_000_000
    });

    // handleId が dirHandles を指している
    const row = await getDirHandle(result?.handleId as string);
    expect(row).toMatchObject({ profileId: 'p1', name: 'MyInstance' });
    expect(asFakeDirectory(row?.handle as FileSystemDirectoryHandle).name).toBe('MyInstance');
  });
});

describe('linkPickedDirectory (P12-D1)', () => {
  beforeEach(async () => {
    await _clearAllForTesting();
  });

  it('選択済みフォルダと解析済み環境から LinkedSource を作り、ハンドルを保存する (read mode)', async () => {
    const picked = pickedDirectory('MyInstance');
    // NewProfileModal が解析済みの環境をそのまま渡す (detectEnvironment を再実行しない)
    const detected: DetectedEnvironment = {
      rootType: 'official',
      mcVersion: '1.20.1',
      loader: 'Fabric',
      loaderVersion: '0.14.21',
      contentDirs: { mods: 'mods', resourcepacks: 'resourcepacks', shaderpacks: undefined }
    };
    const result = await linkPickedDirectory('p-new', picked, detected, 1_700_000_000_000);

    expect(result).toEqual({
      kind: 'filesystem',
      rootName: 'MyInstance',
      handleId: result.handleId,
      environment: { mcVersion: '1.20.1', loader: 'Fabric', loaderVersion: '0.14.21' },
      contentDirs: { mods: 'mods', resourcepacks: 'resourcepacks', shaderpacks: undefined },
      linkedAt: 1_700_000_000_000
    });

    const row = await getDirHandle(result.handleId as string);
    expect(row).toMatchObject({ profileId: 'p-new', name: 'MyInstance' });
    // D-7: 紐付け時は read モードのまま (昇格は Sync 実行時)。保存されたハンドルを復元できる
    // (fake-indexeddb は構造化クローンで prototype を落とすため name で検証)
    expect(asFakeDirectory(row?.handle as FileSystemDirectoryHandle).name).toBe('MyInstance');
  });
});

describe('releaseFolderLink', () => {
  beforeEach(async () => {
    await _clearAllForTesting();
  });

  it('保存済みハンドルを削除する', async () => {
    const linked = await createFolderLink('p1', { pick: async () => pickedDirectory() }, 1);
    expect(await getDirHandle(linked?.handleId as string)).not.toBeNull();

    await releaseFolderLink(linked?.handleId);
    expect(await getDirHandle(linked?.handleId as string)).toBeNull();
  });

  it('handleId が無ければ何もしない (冪等)', async () => {
    await expect(releaseFolderLink(undefined)).resolves.toBeUndefined();
    await expect(releaseFolderLink('dh-none')).resolves.toBeUndefined();
  });

  it('Profile 側のファイルには触れない — 消えるのは紐付けの参照だけ', async () => {
    const linked = await createFolderLink('p1', { pick: async () => pickedDirectory() }, 1);
    await releaseFolderLink(linked?.handleId);
    // 解除後も復元はできないが、例外にはならない
    expect(await openLinkedFolder(linked as LinkedSource)).toBeNull();
  });
});

describe('openLinkedFolder', () => {
  beforeEach(async () => {
    await _clearAllForTesting();
  });

  it('復元すると Source と Sink の両方が得られる', async () => {
    const linked = await createFolderLink('p1', { pick: async () => pickedDirectory() }, 1);
    const opened = await openLinkedFolder(linked as LinkedSource);

    expect(opened?.rootName).toBe('.minecraft');
    expect(opened?.source).toBeInstanceOf(FileSystemSource);
    expect(opened?.sink).toBeInstanceOf(FileSystemSink);
    expect(opened?.sink.writable).toBe(false); // 未昇格 (D-7: 昇格は Sync 時)
  });

  it('未紐付け / ZIP 紐付け / handleId 無しはいずれも null', async () => {
    expect(await openLinkedFolder(undefined)).toBeNull();
    expect(
      await openLinkedFolder({
        kind: 'zip',
        rootName: 'pack.zip',
        environment: {},
        contentDirs: {},
        linkedAt: 1
      })
    ).toBeNull();
    expect(
      await openLinkedFolder({
        kind: 'filesystem',
        rootName: 'x',
        environment: {},
        contentDirs: {},
        linkedAt: 1
      })
    ).toBeNull();
  });

  it('dirHandles から消えていたら null (例外を投げない)', async () => {
    expect(
      await openLinkedFolder({
        kind: 'filesystem',
        rootName: 'x',
        handleId: 'dh-gone',
        environment: {},
        contentDirs: {},
        linkedAt: 1
      })
    ).toBeNull();
  });

  it('復元したハンドルはそのまま渡す (妥当性チェックは呼び出し側の責務)', async () => {
    const linked = await createFolderLink('p1', { pick: async () => pickedDirectory() }, 1);
    const opened = await openLinkedFolder(linked as LinkedSource);

    // fake-indexeddb の構造化クローンは prototype を落とすため、
    // メソッドは失われる (実 Chromium では保たれる)。それでも復元自体は成功し、
    // 壊れたデータは最初の API 呼び出しで顕在化する設計。
    expect(opened?.handle).toBeTruthy();
    expect(opened?.rootName).toBe('.minecraft');
    await expect(opened?.source.exists('mods/a.jar')).rejects.toBeInstanceOf(TypeError);
  });
});
