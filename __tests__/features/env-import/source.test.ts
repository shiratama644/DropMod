/**
 * lib/env/source.ts test (Phase 11-B)
 *
 * Fake File System Access API ツリー上で FileSystemSource の
 * readFile / listFiles / listDirectories / exists を検証する。
 */

import { describe, it, expect } from 'vitest';
import { FileSystemSource, isNotFoundError } from '@/lib/env/source';
import { createFakeFileSystem } from '@/__tests__/test-utils/fakeFs';

function makeSource() {
  const handle = createFakeFileSystem({
    'mods/sodium.jar': new Uint8Array([1, 2, 3]),
    'mods/lithium.jar': new Uint8Array([4]),
    'resourcepacks/fresh.zip': 'fresh-animations',
    'versions/1.21.1/1.21.1.json': '{"id":"1.21.1"}',
    'versions/fabric-loader-0.16.0-1.21.1/fabric-loader-0.16.0-1.21.1.json':
      '{"id":"fabric"}',
    'options.txt': 'version:1'
  });
  return new FileSystemSource(handle, '.minecraft');
}

describe('FileSystemSource', () => {
  it('kind / rootName', () => {
    const source = makeSource();
    expect(source.kind).toBe('filesystem');
    expect(source.rootName).toBe('.minecraft');
  });

  it('readFile: ルート直下・ネストしたファイルを Uint8Array で読む', async () => {
    const source = makeSource();
    const root = await source.readFile('options.txt');
    expect(new TextDecoder().decode(root)).toBe('version:1');

    const nested = await source.readFile('versions/1.21.1/1.21.1.json');
    expect(JSON.parse(new TextDecoder().decode(nested))).toEqual({ id: '1.21.1' });
  });

  it('readFile: 存在しないパスは NotFoundError', async () => {
    const source = makeSource();
    await expect(source.readFile('mods/missing.jar')).rejects.toSatisfy((e: unknown) =>
      isNotFoundError(e)
    );
  });

  it('listFiles: ファイル名を名前順で返す (ディレクトリは含まない)', async () => {
    const source = makeSource();
    expect(await source.listFiles('mods')).toEqual(['lithium.jar', 'sodium.jar']);
    expect(await source.listFiles('')).toEqual(['options.txt']);
    expect(await source.listFiles('versions/fabric-loader-0.16.0-1.21.1')).toEqual([
      'fabric-loader-0.16.0-1.21.1.json'
    ]);
  });

  it('listFiles: 存在しないディレクトリは空配列 (エラーにしない §4.3)', async () => {
    const source = makeSource();
    expect(await source.listFiles('shaderpacks')).toEqual([]);
    expect(await source.listFiles('a/b/c')).toEqual([]);
  });

  it('listDirectories: ディレクトリ名を名前順で返す', async () => {
    const source = makeSource();
    expect(await source.listDirectories('')).toEqual([
      'mods',
      'resourcepacks',
      'versions'
    ]);
    expect(await source.listDirectories('versions')).toEqual([
      '1.21.1',
      'fabric-loader-0.16.0-1.21.1'
    ]);
    expect(await source.listDirectories('mods')).toEqual([]);
  });

  it('exists: ファイル・ディレクトリ・ルートの判定', async () => {
    const source = makeSource();
    expect(await source.exists('mods/sodium.jar')).toBe(true);
    expect(await source.exists('mods')).toBe(true);
    expect(await source.exists('versions/fabric-loader-0.16.0-1.21.1/fabric-loader-0.16.0-1.21.1.json')).toBe(true);
    expect(await source.exists('mods/nope.jar')).toBe(false);
    expect(await source.exists('nodir')).toBe(false);
    expect(await source.exists('')).toBe(true); // ルート自身
  });

  it('exists: ファイルパスはファイルとして存在すれば true', async () => {
    // exists は file→dir の順で確認するため、ファイルとして存在するパスは true
    const handle = createFakeFileSystem({ 'a.txt': 'x' });
    const src = new FileSystemSource(handle, 'root');
    expect(await src.exists('a.txt')).toBe(true);
  });
});
