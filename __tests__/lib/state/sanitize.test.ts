import { describe, it, expect } from 'vitest';
import { normalizeLoader, sanitizeLoadedState } from '@/lib/state/sanitize';

describe('sanitizeLoadedState', () => {
  it('returns null for non-object input', () => {
    expect(sanitizeLoadedState(null)).toBeNull();
    expect(sanitizeLoadedState(undefined)).toBeNull();
    expect(sanitizeLoadedState('string')).toBeNull();
    expect(sanitizeLoadedState(42)).toBeNull();
  });

  it('returns SanitizedState for empty object (all fields undefined)', () => {
    const result = sanitizeLoadedState({});
    expect(result).not.toBeNull();
    expect(result?.profiles).toBeUndefined();
    expect(result?.theme).toBeUndefined();
    expect(result?.currentProfileId).toBeUndefined();
  });

  it('normalizes theme: only accepts "dark" or "light"', () => {
    expect(sanitizeLoadedState({ theme: 'dark' })?.theme).toBe('dark');
    expect(sanitizeLoadedState({ theme: 'light' })?.theme).toBe('light');
    expect(sanitizeLoadedState({ theme: 'system' })?.theme).toBeUndefined();
    expect(sanitizeLoadedState({ theme: 42 })?.theme).toBeUndefined();
  });

  it('filters out invalid profiles (missing id)', () => {
    const result = sanitizeLoadedState({
      profiles: [
        { id: 'p1', name: 'Valid' },
        { name: 'no-id' }, // 除外
        null, // 除外
        undefined, // 除外
        { id: 'p2', name: 'Also valid' }
      ]
    });
    expect(result?.profiles).toHaveLength(2);
    expect(result?.profiles?.[0]?.id).toBe('p1');
    expect(result?.profiles?.[1]?.id).toBe('p2');
  });

  it('supplies default values for missing profile fields', () => {
    const result = sanitizeLoadedState({
      profiles: [{ id: 'p1' }]
    });
    const p = result?.profiles?.[0];
    expect(p?.name).toBe('(名称未設定)');
    expect(p?.environment.mcVersion).toBe('1.20.1');
    expect(p?.environment.loader).toBe('Fabric');
    expect(p?.description).toBe('');
    expect(p?.mods).toEqual([]);
  });

  it('empty profiles array is treated as undefined (fallback to default)', () => {
    const result = sanitizeLoadedState({ profiles: [] });
    expect(result?.profiles).toBeUndefined();
  });

  it('filters out invalid mod items (missing id)', () => {
    const result = sanitizeLoadedState({
      profiles: [
        {
          id: 'p1',
          mods: [
            { id: 'm1', title: 'Sodium' },
            { title: 'no-id' }, // 除外
            null // 除外
          ]
        }
      ]
    });
    expect(result?.profiles?.[0]?.mods).toHaveLength(1);
    expect(result?.profiles?.[0]?.mods[0]?.projectId).toBe('m1');
  });

  it('旧 flat 形状 (mcVersion/loader 直 + ModItem) を新形状に変換する (Phase 11-A)', () => {
    const result = sanitizeLoadedState({
      profiles: [
        {
          id: 'p1',
          name: 'Legacy',
          mcVersion: '1.20.1',
          loader: 'Fabric',
          loaderVersion: '0.15.11',
          description: '旧データ',
          mods: [
            {
              id: 'm1',
              title: 'Sodium',
              projectType: 'mod',
              selectedVersionId: 'v1',
              selectedVersionNumber: '0.6.0'
            },
            {
              id: 'm2',
              title: 'Fresh Animations',
              projectType: 'resourcepack'
            }
          ]
        }
      ]
    });
    const p = result?.profiles?.[0];
    expect(p?.environment).toEqual({
      mcVersion: '1.20.1',
      loader: 'Fabric',
      loaderVersion: '0.15.11'
    });
    expect(p?.mods[0]).toMatchObject({
      projectId: 'm1',
      name: 'Sodium',
      type: 'mod',
      versionId: 'v1',
      versionNumber: '0.6.0'
    });
    expect(p?.mods[1]?.type).toBe('resourcepack');
  });

  it('loader の不正値は Fabric に正規化される (Phase 11-A)', () => {
    const result = sanitizeLoadedState({
      profiles: [{ id: 'p1', loader: 'X-Invalid' }]
    });
    expect(result?.profiles?.[0]?.environment.loader).toBe('Fabric');
  });

  it('新形状 (environment / ProjectItem) の入力はそのまま正規化される (Phase 11-A)', () => {
    const result = sanitizeLoadedState({
      profiles: [
        {
          id: 'p1',
          name: 'New Shape',
          environment: { mcVersion: '1.21.1', loader: 'NeoForge', loaderVersion: '21.1.0' },
          mods: [{ projectId: 'm1', name: 'Iris', type: 'shader' }],
          resourcepacks: [{ projectId: 'rp1', name: 'Faithful', type: 'resourcepack' }],
          unknownFiles: [
            {
              id: 'u1',
              location: 'mods',
              filename: 'custom.jar',
              path: 'mods/custom.jar',
              sha1: 'abc',
              size: 100,
              discoveredAt: 123
            }
          ]
        }
      ]
    });
    const p = result?.profiles?.[0];
    expect(p?.environment).toEqual({
      mcVersion: '1.21.1',
      loader: 'NeoForge',
      loaderVersion: '21.1.0'
    });
    expect(p?.mods[0]?.projectId).toBe('m1');
    expect(p?.resourcepacks?.[0]?.name).toBe('Faithful');
    expect(p?.unknownFiles?.[0]?.path).toBe('mods/custom.jar');
  });

  it('currentProfileId falls back to first profile when target does not exist', () => {
    const result = sanitizeLoadedState({
      currentProfileId: 'missing-id',
      profiles: [
        { id: 'p1', name: 'First' },
        { id: 'p2', name: 'Second' }
      ]
    });
    expect(result?.currentProfileId).toBe('p1');
  });

  it('currentProfileId is preserved when target exists', () => {
    const result = sanitizeLoadedState({
      currentProfileId: 'p2',
      profiles: [
        { id: 'p1', name: 'First' },
        { id: 'p2', name: 'Second' }
      ]
    });
    expect(result?.currentProfileId).toBe('p2');
  });

  it('currentProfileId is undefined when no profiles', () => {
    const result = sanitizeLoadedState({
      currentProfileId: 'some-id'
    });
    expect(result?.currentProfileId).toBeUndefined();
  });

  it('ProjectItem の provider / artifact 正規化 (Phase 11-A)', () => {
    const result = sanitizeLoadedState({
      profiles: [
        {
          id: 'p1',
          mods: [
            {
              projectId: 'm1',
              name: 'Imported',
              type: 'mod',
              provider: 'curseforge',
              artifact: { sha1: 'abc', path: 'mods/imported.jar', size: 123 }
            },
            {
              projectId: 'm2',
              name: 'Unknown provider',
              type: 'mod',
              provider: 'weird-provider'
            },
            {
              projectId: 'm3',
              name: 'Broken artifact',
              type: 'shader',
              provider: 'unknown',
              artifact: { sha1: '', path: 'shaderpacks/x.zip', size: Number.NaN }
            }
          ]
        }
      ]
    });
    const mods = result?.profiles?.[0]?.mods ?? [];
    expect(mods[0]?.provider).toBe('curseforge');
    expect(mods[0]?.artifact).toEqual({ sha1: 'abc', path: 'mods/imported.jar', size: 123 });
    // 不正 provider は undefined (modrinth 扱い)
    expect(mods[1]?.provider).toBeUndefined();
    // artifact の必須フィールド欠損 / NaN size は破棄
    expect(mods[2]?.provider).toBe('unknown');
    expect(mods[2]?.artifact).toBeUndefined();
  });

  it('unknownFiles の不正要素は除外され、size/discoveredAt の欠損は 0 補完される', () => {
    const result = sanitizeLoadedState({
      profiles: [
        {
          id: 'p1',
          unknownFiles: [
            {
              id: 'u1',
              location: 'shaderpacks',
              filename: 'custom.zip',
              path: 'shaderpacks/custom.zip',
              sha1: 'deadbeef'
              // size / discoveredAt 欠損 → 0
            },
            { id: 'u2', filename: 'no-path' }, // 除外 (path/sha1 欠損)
            null // 除外
          ]
        }
      ]
    });
    const files = result?.profiles?.[0]?.unknownFiles ?? [];
    expect(files).toHaveLength(1);
    expect(files[0]).toEqual({
      id: 'u1',
      location: 'shaderpacks',
      filename: 'custom.zip',
      path: 'shaderpacks/custom.zip',
      sha1: 'deadbeef',
      size: 0,
      discoveredAt: 0
    });
  });

  it('normalizeLoader: 有効値は保持、無効値は Fabric', () => {
    expect(normalizeLoader('NeoForge')).toBe('NeoForge');
    expect(normalizeLoader('Quilt')).toBe('Quilt');
    expect(normalizeLoader('Vanilla')).toBe('Vanilla');
    expect(normalizeLoader('fabric')).toBe('Fabric'); // 大文字小文字厳密
    expect(normalizeLoader(42)).toBe('Fabric');
    expect(normalizeLoader(undefined)).toBe('Fabric');
  });
});
