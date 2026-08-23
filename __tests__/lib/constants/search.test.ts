import { describe, it, expect } from 'vitest';
import {
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

describe('searchGridClass', () => {
  it('1 / 2 / 3 / max / auto で異なる grid クラスを返す', () => {
    expect(searchGridClass('1')).toContain('grid-cols-1');
    expect(searchGridClass('2')).toContain('sm:grid-cols-2');
    expect(searchGridClass('3')).toContain('lg:grid-cols-3');
    expect(searchGridClass('max')).toContain('lg:grid-cols-2');
    expect(searchGridClass('auto')).toContain('xl:grid-cols-3');
  });
});
