import { describe, it, expect } from 'vitest';
import {
  PROJECT_TYPE_TABS,
  autoBannerHeightClass,
  autoCardSpanClass,
  discoverPathForType,
  discoverPathFromProjectType,
  modrinthProjectUrl,
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

describe('discover paths', () => {
  it('mods は /discover/mods、他は同名セグメント', () => {
    expect(discoverPathForType('mod')).toBe('/discover/mods');
    expect(discoverPathForType('resourcepack')).toBe('/discover/resourcepack');
    expect(discoverPathForType('shader')).toBe('/discover/shader');
    expect(discoverPathForType('modpack')).toBe('/discover/modpack');
  });

  it('segment を project type に戻す', () => {
    expect(parseDiscoverSegment('mods')).toBe('mod');
    expect(parseDiscoverSegment('shader')).toBe('shader');
    expect(parseDiscoverSegment('plugin')).toBeNull();
  });

  it('project_type から正しい検索パスと Modrinth URL を返す', () => {
    expect(discoverPathFromProjectType('shader')).toBe('/discover/shader');
    expect(discoverPathFromProjectType('resourcepack')).toBe('/discover/resourcepack');
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
