/**
 * lib/env/zipSource.ts test (Phase 11-C)
 *
 * JSZip インスタンス上で ZipSource の interface 実装と
 * isMinecraftFolderZip の判定を検証する。
 */

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { ZipSource, isMinecraftFolderZip } from '@/lib/env/zipSource';

function buildZip(files: Record<string, string>): JSZip {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content);
  }
  return zip;
}

describe('ZipSource', () => {
  function makeSource() {
    return new ZipSource(
      buildZip({
        'mods/sodium.jar': 'sodium',
        'mods/lithium.jar': 'lithium',
        'resourcepacks/fresh.zip': 'fresh',
        'versions/1.21.1/1.21.1.json': '{"id":"1.21.1"}',
        'options.txt': 'v:1'
      }),
      'minecraft-env.zip'
    );
  }

  it('kind / rootName', () => {
    const source = makeSource();
    expect(source.kind).toBe('zip');
    expect(source.rootName).toBe('minecraft-env.zip');
  });

  it('readFile: パスを指定して Uint8Array を読む', async () => {
    const source = makeSource();
    const data = await source.readFile('mods/sodium.jar');
    expect(new TextDecoder().decode(data)).toBe('sodium');
  });

  it('readFile: 存在しないパスは Error', async () => {
    const source = makeSource();
    await expect(source.readFile('mods/missing.jar')).rejects.toThrow('見つかりません');
  });

  it('listFiles: 直下のファイルのみ (ネスト・ディレクトリ除外) を名前順で', async () => {
    const source = makeSource();
    expect(await source.listFiles('mods')).toEqual(['lithium.jar', 'sodium.jar']);
    expect(await source.listFiles('')).toEqual(['options.txt']);
    expect(await source.listFiles('versions/1.21.1')).toEqual(['1.21.1.json']);
    expect(await source.listFiles('shaderpacks')).toEqual([]);
  });

  it('listDirectories: 明示的・暗黙的ディレクトリを列挙', async () => {
    const source = makeSource();
    expect(await source.listDirectories('')).toEqual(['mods', 'resourcepacks', 'versions']);
    expect(await source.listDirectories('versions')).toEqual(['1.21.1']);
    expect(await source.listDirectories('mods')).toEqual([]);
  });

  it('exists: ファイル・ディレクトリ (接頭辞) の判定', async () => {
    const source = makeSource();
    expect(await source.exists('mods/sodium.jar')).toBe(true);
    expect(await source.exists('mods')).toBe(true);
    expect(await source.exists('mods/nope.jar')).toBe(false);
    expect(await source.exists('nodir')).toBe(false);
    expect(await source.exists('')).toBe(true);
  });

  it('Detecto chain / Analyzer ともZipSource で一貫動作する (readFile→listFiles 経路)', async () => {
    // フルパイプラインは analyzer.test で FileSystemSource を使っているため、
    // ここでは ZipSource が interface 契約を満たすことの代表検証のみ行う
    const source = new ZipSource(
      buildZip({ 'mmc-pack.json': '{"components":[{"uid":"net.minecraft","version":"1.21.1"}]}', 'mods/a.jar': 'x' }),
      'instance.zip'
    );
    expect(await source.exists('mmc-pack.json')).toBe(true);
    const raw = await source.readFile('mmc-pack.json');
    expect(JSON.parse(new TextDecoder().decode(raw))).toEqual({
      components: [{ uid: 'net.minecraft', version: '1.21.1' }]
    });
  });
});

describe('isMinecraftFolderZip', () => {
  it('mods/・versions/ 等のディレクトリを持つ ZIP を検出', () => {
    expect(isMinecraftFolderZip(buildZip({ 'mods/a.jar': 'x' }))).toBe(true);
    expect(isMinecraftFolderZip(buildZip({ 'versions/1.21/1.21.json': '{}' }))).toBe(true);
    expect(isMinecraftFolderZip(buildZip({ 'mmc-pack.json': '{}' }))).toBe(true);
    expect(isMinecraftFolderZip(buildZip({ '.minecraft/mods/a.jar': 'x' }))).toBe(true);
    expect(isMinecraftFolderZip(buildZip({ 'resourcepacks/r.zip': 'x' }))).toBe(true);
  });

  it('ルート直下に .jar だけの ZIP (旧来の個別ファイル ZIP) は検出しない', () => {
    expect(isMinecraftFolderZip(buildZip({ 'sodium.jar': 'x', 'lithium.jar': 'y' }))).toBe(false);
    expect(isMinecraftFolderZip(buildZip({ 'readme.txt': 'x' }))).toBe(false);
  });

  it('.minecraft 以外のサブフォルダ名 (backups 等) は検出しない', () => {
    expect(isMinecraftFolderZip(buildZip({ 'backups/world.zip': 'x' }))).toBe(false);
  });
});
