/**
 * Sync 用ローカル環境スキャン (Phase 12-B) test — `lib/env/scan.ts`
 *
 * `computeSyncPlan()` の入力 `LocalFileEntry[]` を作る層。
 * パス基準 (`dir/filename`) と拡張子フィルタが台帳と噛み合うことを検証する。
 */

import { describe, it, expect } from 'vitest';
import { categoryDirs, scanLocalEnvironment, type ScanProgress } from '@/lib/env/scan';
import { FileSystemSource, type EnvironmentSource } from '@/lib/env/source';
import { calculateSha1 } from '@/lib/utils/hash';
import { createFakeFileSystem } from '@/__tests__/test-utils/fakeFs';

const sha1Of = async (s: string) => calculateSha1(new TextEncoder().encode(s).buffer);

const DIRS = {
  mods: 'mods',
  resourcepacks: 'resourcepacks',
  shaderpacks: 'shaderpacks'
};

function sourceOf(files: Record<string, string>): EnvironmentSource {
  const handle = createFakeFileSystem(files, '.minecraft');
  return new FileSystemSource(handle, '.minecraft');
}

describe('categoryDirs', () => {
  it('検出できたディレクトリだけをカテゴリ順に並べる', () => {
    expect(categoryDirs({ mods: 'mods', shaderpacks: '.minecraft/shaderpacks' })).toEqual([
      { category: 'mod', dir: 'mods' },
      { category: 'shader', dir: '.minecraft/shaderpacks' }
    ]);
  });

  it('何も検出できなければ空配列', () => {
    expect(categoryDirs({})).toEqual([]);
  });
});

describe('scanLocalEnvironment', () => {
  it('3 カテゴリを走査し、拡張子で対象を絞る', async () => {
    const { entries } = await scanLocalEnvironment(
      sourceOf({
        'mods/a.jar': 'jar-a',
        'mods/ignored.txt': 'nope',
        'resourcepacks/pack.zip': 'zip-p',
        'shaderpacks/bsl.zip': 'zip-s',
        'versions/1.20.1/1.20.1.json': '{}' // 対象ディレクトリ外
      }),
      DIRS
    );

    expect(entries.map((e) => `${e.category}:${e.path}`)).toEqual([
      'mod:mods/a.jar',
      'resourcepack:resourcepacks/pack.zip',
      'shader:shaderpacks/bsl.zip'
    ]);
  });

  it('大文字小文字を区別しない (.JAR も対象)', async () => {
    const { entries } = await scanLocalEnvironment(
      sourceOf({ 'mods/Upper.JAR': 'x' }),
      { mods: 'mods' }
    );
    expect(entries.map((e) => e.path)).toEqual(['mods/Upper.JAR']);
  });

  it('sha1 と size を実体から計算する', async () => {
    const { entries } = await scanLocalEnvironment(sourceOf({ 'mods/a.jar': 'jar-a' }), {
      mods: 'mods'
    });
    expect(entries[0]).toEqual({
      category: 'mod',
      path: 'mods/a.jar',
      sha1: await sha1Of('jar-a'),
      size: 'jar-a'.length
    });
  });

  it('ネストした contentDirs (Prism の .minecraft/mods 等) でも正しい相対パスになる', async () => {
    const { entries } = await scanLocalEnvironment(
      sourceOf({ '.minecraft/mods/a.jar': 'x' }),
      { mods: '.minecraft/mods' }
    );
    expect(entries.map((e) => e.path)).toEqual(['.minecraft/mods/a.jar']);
  });

  it('ディレクトリが存在しなければ空として継続する', async () => {
    const { entries, skipped } = await scanLocalEnvironment(sourceOf({}), DIRS);
    expect(entries).toEqual([]);
    expect(skipped).toEqual([]);
  });

  it('1 ファイルの読み取り失敗で全体を落とさず skipped に記録する', async () => {
    const base = sourceOf({ 'mods/ok.jar': 'ok', 'mods/bad.jar': 'bad' });
    const source: EnvironmentSource = {
      kind: base.kind,
      rootName: base.rootName,
      listFiles: (d) => base.listFiles(d),
      listDirectories: (d) => base.listDirectories(d),
      exists: (p) => base.exists(p),
      readFile: async (path: string) => {
        if (path === 'mods/bad.jar') throw new Error('権限がありません');
        return base.readFile(path);
      }
    };

    const { entries, skipped } = await scanLocalEnvironment(source, { mods: 'mods' });
    expect(entries.map((e) => e.path)).toEqual(['mods/ok.jar']);
    expect(skipped).toEqual(['mods/bad.jar']);
  });

  it('全ファイルが読めない場合は entries 空・skipped のみ', async () => {
    const base = sourceOf({ 'mods/a.jar': 'x' });
    const source: EnvironmentSource = {
      kind: base.kind,
      rootName: base.rootName,
      listFiles: (d) => base.listFiles(d),
      listDirectories: (d) => base.listDirectories(d),
      exists: (p) => base.exists(p),
      readFile: async () => {
        throw new Error('nope');
      }
    };
    const { entries, skipped } = await scanLocalEnvironment(source, { mods: 'mods' });
    expect(entries).toEqual([]);
    expect(skipped).toEqual(['mods/a.jar']);
  });

  it('進捗を scan → read → hash の順で報告する', async () => {
    const seen: ScanProgress[] = [];
    await scanLocalEnvironment(
      sourceOf({ 'mods/a.jar': 'a', 'mods/b.jar': 'b' }),
      { mods: 'mods' },
      (p) => seen.push(p)
    );

    const phases = seen.map((p) => p.phase);
    expect(phases[0]).toBe('scan');
    expect(phases.filter((p) => p === 'read')).toHaveLength(2);
    expect(phases.at(-1)).toBe('hash');
    // read は 1..total まで進む
    const reads = seen.filter((p) => p.phase === 'read');
    expect(reads.map((p) => p.done)).toEqual([1, 2]);
    expect(reads.every((p) => p.total === 2)).toBe(true);
  });

  it('対象が 0 件なら read / hash を報告しない', async () => {
    const seen: ScanProgress[] = [];
    const result = await scanLocalEnvironment(sourceOf({}), DIRS, (p) => seen.push(p));
    expect(result).toEqual({ entries: [], skipped: [] });
    expect(seen.map((p) => p.phase)).toEqual(['scan', 'scan']);
  });

  it('進捗コールバックを渡さなくても動作する', async () => {
    const { entries } = await scanLocalEnvironment(sourceOf({ 'mods/a.jar': 'a' }), {
      mods: 'mods'
    });
    expect(entries).toHaveLength(1);
  });
});
