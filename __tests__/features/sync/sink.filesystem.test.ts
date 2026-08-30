/**
 * FileSystemSink (Phase 12-B / PHASE12_PLAN.md §10.1) test
 *
 * Chromium の Direct Write 実装を Fake ファイルシステムで検証する。
 * 特に **D-2**: `ensureWritable()` は拒否・非対応でも `false` を返すだけで
 * **throw しない** (呼び出し側が Read-only 解析を継続できるようにする)。
 */

import { describe, it, expect } from 'vitest';
import { FileSystemSink } from '@/features/sync/sink/filesystem';
import {
  asFakeDirectory,
  createFakeFileSystem,
  readFakeFile
} from '@/__tests__/test-utils/fakeFs';

const encode = (s: string) => new TextEncoder().encode(s);
const decode = (u: Uint8Array | null) => (u ? new TextDecoder().decode(u) : null);

describe('FileSystemSink — ensureWritable (D-2)', () => {
  it('既に granted なら requestPermission を呼ばない (余計なプロンプトを出さない)', async () => {
    const root = createFakeFileSystem({}, '.minecraft', { permissionState: 'granted' });
    const sink = new FileSystemSink(root, '.minecraft');

    await expect(sink.ensureWritable()).resolves.toBe(true);
    expect(sink.writable).toBe(true);
    expect(asFakeDirectory(root).requestPermissionCalls).toBe(0);
  });

  it('prompt なら昇格を要求し、granted になれば true', async () => {
    // query は prompt だが、要求すれば granted になるシナリオ
    const root = createFakeFileSystem({}, '.minecraft', {
      permissionState: 'prompt',
      requestPermissionResult: 'granted'
    });
    const sink = new FileSystemSink(root, '.minecraft');

    await expect(sink.ensureWritable()).resolves.toBe(true);
    expect(sink.writable).toBe(true);
    expect(asFakeDirectory(root).requestPermissionCalls).toBe(1);
  });

  it('拒否されたら throw せず false (D-2: Read-only フォールバック)', async () => {
    const root = createFakeFileSystem({}, '.minecraft', { permissionState: 'denied' });
    const sink = new FileSystemSink(root, '.minecraft');

    await expect(sink.ensureWritable()).resolves.toBe(false);
    expect(sink.writable).toBe(false);
    expect(asFakeDirectory(root).requestPermissionCalls).toBe(1);
  });

  it('権限 API 自体が無い (古い Chromium) 場合も throw せず false', async () => {
    const root = createFakeFileSystem({});
    // Fake の queryPermission は prototype 上にあるのでインスタンス側で潰す
    Object.defineProperty(root, 'queryPermission', {
      value: undefined,
      configurable: true
    });

    const sink = new FileSystemSink(root, '.minecraft');
    await expect(sink.ensureWritable()).resolves.toBe(false);
  });

  it('未確認のうちは writable は false', () => {
    expect(new FileSystemSink(createFakeFileSystem({}), '.minecraft').writable).toBe(false);
  });
});

describe('FileSystemSink — 読み書き', () => {
  it('存在するファイルを読んで Uint8Array で返す', async () => {
    const sink = new FileSystemSink(
      createFakeFileSystem({ 'mods/a.jar': 'content' }),
      '.minecraft'
    );
    expect(decode(await sink.readFile('mods/a.jar'))).toBe('content');
  });

  it('存在しないファイルは null (throw しない — Backup 取得の正常系)', async () => {
    const sink = new FileSystemSink(createFakeFileSystem({}), '.minecraft');
    await expect(sink.readFile('mods/none.jar')).resolves.toBeNull();
  });

  it('親ディレクトリが無ければ自動生成して書き込む', async () => {
    const root = createFakeFileSystem({});
    const sink = new FileSystemSink(root, '.minecraft');

    await sink.writeFile('mods/nested/deep/new.jar', encode('data'));
    expect(decode(readFakeFile(root, 'mods/nested/deep/new.jar'))).toBe('data');
  });

  it('既存ファイルは上書きする', async () => {
    const root = createFakeFileSystem({ 'mods/a.jar': 'old' });
    const sink = new FileSystemSink(root, '.minecraft');

    await sink.writeFile('mods/a.jar', encode('new'));
    expect(decode(readFakeFile(root, 'mods/a.jar'))).toBe('new');
  });

  it('ファイル名が無いパスは書き込まずに例外を投げる', async () => {
    const sink = new FileSystemSink(createFakeFileSystem({}), '.minecraft');
    await expect(sink.writeFile('', encode('x'))).rejects.toThrow('不正なパス');
    await expect(sink.readFile('')).resolves.toBeNull();
  });

  it('部分 view の Uint8Array も正しく書ける (toArrayBuffer の分岐)', async () => {
    const root = createFakeFileSystem({});
    const sink = new FileSystemSink(root, '.minecraft');
    const full = encode('hello-world');
    // byteOffset > 0 かつ全体を覆わない view
    const view = full.subarray(6);

    await sink.writeFile('mods/part.bin', view);
    expect(decode(readFakeFile(root, 'mods/part.bin'))).toBe('world');
  });

  it('削除する。無ければ何もしない (冪等 — Rollback の再実行に必要)', async () => {
    const root = createFakeFileSystem({ 'mods/a.jar': 'x' });
    const sink = new FileSystemSink(root, '.minecraft');

    await sink.removeFile('mods/a.jar');
    expect(readFakeFile(root, 'mods/a.jar')).toBeNull();

    await expect(sink.removeFile('mods/a.jar')).resolves.toBeUndefined();
    await expect(sink.removeFile('mods/none/deep/a.jar')).resolves.toBeUndefined();
    await expect(sink.removeFile('')).resolves.toBeUndefined();
  });

  it('exists はファイルの有無を返す (ディレクトリは false)', async () => {
    const sink = new FileSystemSink(createFakeFileSystem({ 'mods/a.jar': 'x' }), '.minecraft');
    await expect(sink.exists('mods/a.jar')).resolves.toBe(true);
    await expect(sink.exists('mods/none.jar')).resolves.toBe(false);
    // ディレクトリを指すパスは getFileHandle が TypeMismatchError → false
    await expect(sink.exists('mods')).resolves.toBe(false);
    // ルート自身は true
    await expect(sink.exists('')).resolves.toBe(true);
  });

  it('kind / rootName を公開する', () => {
    const sink = new FileSystemSink(createFakeFileSystem({}, 'instance'), 'instance');
    expect(sink.kind).toBe('filesystem');
    expect(sink.rootName).toBe('instance');
  });
});
