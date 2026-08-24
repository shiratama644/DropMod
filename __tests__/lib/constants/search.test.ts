import { describe, it, expect } from 'vitest';
import {
  PROJECT_TYPE_TABS,
  autoBannerHeightClass,
  autoCardSpanClass,
  detailPathForType,
  detailPathFromProject,
  discoverPathForType,
  discoverPathFromProjectType,
  modalPathForType,
  modalPathFromProject,
  modrinthProjectUrl,
  parseDetailType,
  parseDiscoverSegment,
  parseProjectType,
  parseSearchLayout,
  sanitizeSearchQuery,
  searchGridClass
} from '@/lib/constants/search';

describe('parseProjectType', () => {
  it('既知の type をそのまま返す', () => {
    expect(parseProjectType('modpack')).toBe('modpack');
    expect(parseProjectType('shader')).toBe('shader');
  });

  it('未知・空は mod にフォールバック', () => {
    expect(parseProjectType(undefined)).toBe('mod');
    expect(parseProjectType('plugin')).toBe('mod');
    expect(parseProjectType(['resourcepack'])).toBe('resourcepack');
  });
});

describe('sanitizeSearchQuery', () => {
  it('trim して 200 文字に切る', () => {
    expect(sanitizeSearchQuery('  sodium  ')).toBe('sodium');
    expect(sanitizeSearchQuery('x'.repeat(250)).length).toBe(200);
  });

  it('配列・未定義は空文字', () => {
    expect(sanitizeSearchQuery(undefined)).toBe('');
    expect(sanitizeSearchQuery(['iris'])).toBe('iris');
  });
});

describe('parseSearchLayout', () => {
  it('既知の layout を返す', () => {
    expect(parseSearchLayout('max')).toBe('max');
    expect(parseSearchLayout('auto')).toBe('auto');
    expect(parseSearchLayout('2')).toBe('2');
  });

  it('未知は 3 カラムにフォールバック', () => {
    expect(parseSearchLayout(undefined)).toBe('3');
    expect(parseSearchLayout('wide')).toBe('3');
  });
});

describe('discover / detail / modal paths', () => {
  it('検索一覧は複数形セグメント', () => {
    expect(discoverPathForType('mod')).toBe('/discover/mods');
    expect(discoverPathForType('resourcepack')).toBe('/discover/resourcepacks');
    expect(discoverPathForType('shader')).toBe('/discover/shaders');
    expect(discoverPathForType('modpack')).toBe('/discover/modpacks');
  });

  it('詳細ページは単数形 /<型>/<slug>', () => {
    expect(detailPathForType('mod', 'sodium')).toBe('/mod/sodium');
    expect(detailPathForType('shader', 'complementary')).toBe('/shader/complementary');
    expect(detailPathForType('resourcepack', 'x')).toBe('/resourcepack/x');
    expect(detailPathForType('modpack', 'y')).toBe('/modpack/y');
  });

  it('モーダルは /discover/<複数>/<slug>', () => {
    expect(modalPathForType('mod', 'sodium')).toBe('/discover/mods/sodium');
    expect(modalPathForType('shader', 'c')).toBe('/discover/shaders/c');
  });

  it('project_type 文字列から各 URL を生成（未知型は mod）', () => {
    expect(detailPathFromProject('shader', 's')).toBe('/shader/s');
    expect(detailPathFromProject(undefined, 's')).toBe('/mod/s');
    expect(modalPathFromProject('modpack', 's')).toBe('/discover/modpacks/s');
    expect(discoverPathFromProjectType('shader')).toBe('/discover/shaders');
  });

  it('segment を project type に戻す（複数形 discover / 単数形 detail）', () => {
    expect(parseDiscoverSegment('mods')).toBe('mod');
    expect(parseDiscoverSegment('shaders')).toBe('shader');
    expect(parseDiscoverSegment('resourcepacks')).toBe('resourcepack');
    expect(parseDiscoverSegment('plugin')).toBeNull();
    expect(parseDetailType('mod')).toBe('mod');
    expect(parseDetailType('shader')).toBe('shader');
    expect(parseDetailType('mods')).toBeNull();
    expect(parseDetailType('plugin')).toBeNull();
  });

  it('Modrinth 公式 URL（単数形）', () => {
    expect(modrinthProjectUrl('complementary-reimagined', 'shader')).toBe(
      'https://modrinth.com/shader/complementary-reimagined'
    );
    expect(modrinthProjectUrl('sodium', 'mod')).toBe('https://modrinth.com/mod/sodium');
  });
});

describe('searchGridClass', () => {
  it('1 / 2 / 3 / max / auto で異なる grid クラスを返す', () => {
    expect(searchGridClass('1')).toContain('grid-cols-1');
    expect(searchGridClass('2')).toContain('sm:grid-cols-2');
    expect(searchGridClass('3')).toContain('lg:grid-cols-3');
    expect(searchGridClass('max')).toContain('lg:grid-cols-2');
    expect(searchGridClass('auto')).toBe('search-grid-auto');
  });
});

describe('PROJECT_TYPE_TABS', () => {
  it('4 種別とアイコンを持つ', () => {
    expect(PROJECT_TYPE_TABS.map((t) => t.id)).toEqual([
      'mod',
      'modpack',
      'resourcepack',
      'shader'
    ]);
    expect(PROJECT_TYPE_TABS.every((t) => t.icon.startsWith('fa-solid '))).toBe(true);
  });
});

describe('autoCardSpanClass', () => {
  it('横長画像は 2 カラム、縦長は 1 カラム', () => {
    expect(
      autoCardSpanClass({ descriptionLength: 10, hasBanner: true, aspectRatio: 1.8 })
    ).toBe('sm:col-span-2');
    expect(
      autoCardSpanClass({ descriptionLength: 10, hasBanner: true, aspectRatio: 0.75 })
    ).toBe('');
  });

  it('画像未ロード時はバナー+長文だけ仮で横長扱い', () => {
    expect(
      autoCardSpanClass({ descriptionLength: 200, hasBanner: true, aspectRatio: null })
    ).toBe('sm:col-span-2');
    expect(
      autoCardSpanClass({ descriptionLength: 20, hasBanner: true, aspectRatio: null })
    ).toBe('');
  });
});

describe('autoBannerHeightClass', () => {
  it('縦長ほど高く、超横長は低くする', () => {
    expect(autoBannerHeightClass(2.4)).toContain('h-20');
    expect(autoBannerHeightClass(1.6)).toContain('h-24');
    expect(autoBannerHeightClass(1.0)).toContain('h-36');
    expect(autoBannerHeightClass(0.6)).toContain('h-44');
    expect(autoBannerHeightClass(null)).toContain('h-24');
  });
});
