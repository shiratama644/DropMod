/**
 * .mrpack パーサ (Phase 12-C / §10.6) test — `lib/env/mrpack.ts`
 *
 * JSZip は**実物**を使って .mrpack を組み立てる。
 */

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import {
  environmentFromMrpack,
  MANAGED_OVERRIDE_DIRS,
  mrpackOverridesToManaged,
  OVERRIDES_DIRS,
  parseMrpackOverrides,
  promoteModpackRecords
} from '@/lib/env/mrpack';
import type { ManagedFileRecord, MrpackIndex } from '@/types';
import { calculateSha1 } from '@/lib/utils/hash';

const NOW = 1_700_000_000_000;
const sha1Of = (s: string) => calculateSha1(new TextEncoder().encode(s).buffer);

/** .mrpack を組み立てる */
function buildMrpack(files: Record<string, string>): JSZip {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content);
  }
  return zip;
}

describe('parseMrpackOverrides', () => {
  it('overrides/mods を拾い、fingerprint とサイズを付ける', async () => {
    const zip = buildMrpack({
      'modrinth.index.json': '{"formatVersion":1,"game":"minecraft"}',
      'overrides/mods/sodium.jar': 'sodium-bytes',
      'overrides/resourcepacks/pack.zip': 'pack-bytes'
    });

    const { overrides, skipped } = await parseMrpackOverrides(zip);

    expect(overrides).toEqual([
      { path: 'mods/sodium.jar', category: 'mod', sha1: await sha1Of('sodium-bytes'), size: 12 },
      { path: 'resourcepacks/pack.zip', category: 'resourcepack', sha1: await sha1Of('pack-bytes'), size: 10 }
    ]);
    expect(skipped).toEqual([]);
  });

  it('shaderpacks も拾う', async () => {
    const zip = buildMrpack({ 'overrides/shaderpacks/bsl.zip': 'shader' });
    const { overrides } = await parseMrpackOverrides(zip);
    expect(overrides.map((o) => [o.path, o.category])).toEqual([
      ['shaderpacks/bsl.zip', 'shader']
    ]);
  });

  it('client-overrides も対象 (DropMod はクライアントアプリ)', async () => {
    const zip = buildMrpack({ 'client-overrides/mods/client-mod.jar': 'client' });
    const { overrides } = await parseMrpackOverrides(zip);
    expect(overrides.map((o) => o.path)).toEqual(['mods/client-mod.jar']);
  });

  it('**server-overrides は列挙しない**', async () => {
    const zip = buildMrpack({
      'server-overrides/mods/server-mod.jar': 'server',
      'overrides/mods/client-mod.jar': 'client'
    });
    const { overrides, skipped } = await parseMrpackOverrides(zip);
    expect(overrides.map((o) => o.path)).toEqual(['mods/client-mod.jar']);
    expect(skipped).toEqual([]);
  });

  it('**3 カテゴリ以外は対象外として skipped に入れる (台帳には入れない)**', async () => {
    const zip = buildMrpack({
      'overrides/config/modmenu.json': '{}',
      'overrides/options.txt': 'fov:90',
      'overrides/mods/a.jar': 'a'
    });

    const { overrides, skipped } = await parseMrpackOverrides(zip);

    expect(overrides.map((o) => o.path)).toEqual(['mods/a.jar']);
    expect(skipped).toEqual([
      { path: 'config/modmenu.json', reason: 'out-of-scope' },
      { path: 'options.txt', reason: 'out-of-scope' }
    ]);
  });

  it('overrides 配下でないファイル (modrinth.index.json) は対象外', async () => {
    const zip = buildMrpack({
      'modrinth.index.json': '{"formatVersion":1,"game":"minecraft"}',
      'overrides/mods/a.jar': 'a'
    });
    const { overrides, skipped } = await parseMrpackOverrides(zip);
    expect(overrides).toHaveLength(1);
    // index.json は overrides 配下ですらないので skipped にも出さない
    expect(skipped).toEqual([]);
  });

  it('空ファイルは skipped (fingerprint が無意味になるため)', async () => {
    const zip = buildMrpack({ 'overrides/mods/empty.jar': '' });
    const { overrides, skipped } = await parseMrpackOverrides(zip);
    expect(overrides).toEqual([]);
    expect(skipped).toEqual([{ path: 'mods/empty.jar', reason: 'empty' }]);
  });

  it('ディレクトリエントリは無視する', async () => {
    const zip = new JSZip();
    zip.folder('overrides/mods');
    zip.file('overrides/mods/a.jar', 'a');
    const { overrides, skipped } = await parseMrpackOverrides(zip);
    expect(overrides.map((o) => o.path)).toEqual(['mods/a.jar']);
    expect(skipped).toEqual([]);
  });

  it('overrides が無ければ空', async () => {
    const zip = buildMrpack({ 'modrinth.index.json': '{}' });
    expect(await parseMrpackOverrides(zip)).toEqual({ overrides: [], skipped: [] });
  });

  it('パスは辞書順で安定して返る', async () => {
    const zip = buildMrpack({
      'overrides/mods/z.jar': 'z',
      'overrides/mods/a.jar': 'a',
      'overrides/mods/m.jar': 'm'
    });
    const { overrides } = await parseMrpackOverrides(zip);
    expect(overrides.map((o) => o.path)).toEqual([
      'mods/a.jar',
      'mods/m.jar',
      'mods/z.jar'
    ]);
  });
});

describe('mrpackOverridesToManaged', () => {
  it('**source は必ず modpack** (§10.5)', () => {
    const records = mrpackOverridesToManaged(
      'p1',
      [
        { path: 'mods/a.jar', category: 'mod', sha1: 'sha-a', size: 1 },
        { path: 'resourcepacks/p.zip', category: 'resourcepack', sha1: 'sha-p', size: 2 }
      ],
      NOW
    );

    expect(records).toEqual([
      {
        id: 'p1::mods/a.jar',
        profileId: 'p1',
        category: 'mod',
        projectId: '',
        path: 'mods/a.jar',
        sha1: 'sha-a',
        size: 1,
        source: 'modpack',
        managedAt: NOW
      },
      {
        id: 'p1::resourcepacks/p.zip',
        profileId: 'p1',
        category: 'resourcepack',
        projectId: '',
        path: 'resourcepacks/p.zip',
        sha1: 'sha-p',
        size: 2,
        source: 'modpack',
        managedAt: NOW
      }
    ]);
  });

  it('空配列なら空', () => {
    expect(mrpackOverridesToManaged('p1', [], NOW)).toEqual([]);
  });
});

describe('promoteModpackRecords (**D-6**)', () => {
  const records: ManagedFileRecord[] = [
    {
      id: 'p1::mods/mp.jar',
      profileId: 'p1',
      category: 'mod',
      projectId: '',
      path: 'mods/mp.jar',
      sha1: 's1',
      size: 1,
      source: 'modpack',
      managedAt: 1
    },
    {
      id: 'p1::mods/user.jar',
      profileId: 'p1',
      category: 'mod',
      projectId: 'proj-1',
      path: 'mods/user.jar',
      sha1: 's2',
      size: 2,
      source: 'dropmod',
      managedAt: 2
    },
    {
      id: 'p1::mods/imp.jar',
      profileId: 'p1',
      category: 'mod',
      projectId: 'proj-2',
      path: 'mods/imp.jar',
      sha1: 's3',
      size: 3,
      source: 'import',
      managedAt: 3
    }
  ];

  it('modpack だけ import に昇格させ、他はそのまま', () => {
    const promoted = promoteModpackRecords(records);
    expect(promoted.map((r) => r.source)).toEqual(['import', 'dropmod', 'import']);
  });

  it('**レコード自体は消さない** (削除には別途ユーザー確認が必要)', () => {
    expect(promoteModpackRecords(records)).toHaveLength(records.length);
    expect(promoteModpackRecords(records).map((r) => r.path)).toEqual([
      'mods/mp.jar',
      'mods/user.jar',
      'mods/imp.jar'
    ]);
  });

  it('元配列を変更しない', () => {
    promoteModpackRecords(records);
    expect(records[0]?.source).toBe('modpack');
  });

  it('modpack が無ければ同一内容を返す', () => {
    const onlyUser = records.slice(1);
    expect(promoteModpackRecords(onlyUser).map((r) => r.source)).toEqual(['dropmod', 'import']);
  });
});

describe('environmentFromMrpack', () => {
  function index(dependencies: MrpackIndex['dependencies']): MrpackIndex {
    return { formatVersion: 1, game: 'minecraft', ...(dependencies ? { dependencies } : {}) };
  }

  it('Fabric を読み取る', () => {
    expect(
      environmentFromMrpack(index({ minecraft: '1.20.1', 'fabric-loader': '0.14.21' }))
    ).toEqual({ mcVersion: '1.20.1', loader: 'Fabric', loaderVersion: '0.14.21' });
  });

  it('Forge / NeoForge / Quilt を読み取る', () => {
    expect(environmentFromMrpack(index({ forge: '47.2.0' }))).toEqual({
      loader: 'Forge',
      loaderVersion: '47.2.0'
    });
    expect(environmentFromMrpack(index({ neoforge: '20.4.1' }))).toEqual({
      loader: 'NeoForge',
      loaderVersion: '20.4.1'
    });
    expect(environmentFromMrpack(index({ 'quilt-loader': '0.19.0' }))).toEqual({
      loader: 'Quilt',
      loaderVersion: '0.19.0'
    });
  });

  it('バニラ (loader 無し) は loader を返さない', () => {
    expect(environmentFromMrpack(index({ minecraft: '1.21.1' }))).toEqual({
      mcVersion: '1.21.1'
    });
  });

  it('dependencies が無ければ空オブジェクト', () => {
    expect(environmentFromMrpack(index(undefined))).toEqual({});
  });

  it('Fabric と Forge が両方あっても Fabric を優先する (Modrinth 実務上の慣習)', () => {
    expect(
      environmentFromMrpack(index({ 'fabric-loader': '0.14.21', forge: '47.2.0' }))
    ).toEqual({ loader: 'Fabric', loaderVersion: '0.14.21' });
  });
});

describe('定数の整合性', () => {
  it('MANAGED_OVERRIDE_DIRS は 3 カテゴリぶんある', () => {
    expect(Object.keys(MANAGED_OVERRIDE_DIRS).sort()).toEqual(['mod', 'resourcepack', 'shader']);
  });

  it('client-overrides を対象に含める', () => {
    expect([...OVERRIDES_DIRS]).toContain('client-overrides');
  });
});
