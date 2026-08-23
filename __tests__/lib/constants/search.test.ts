import { describe, it, expect } from 'vitest';
import { parseProjectType, sanitizeSearchQuery } from '@/lib/constants/search';

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
