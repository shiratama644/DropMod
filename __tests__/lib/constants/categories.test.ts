import { describe, it, expect } from 'vitest';
import { CATEGORIES, categoriesForProjectType } from '@/lib/constants/categories';

describe('categoriesForProjectType', () => {
  it('mod は従来 CATEGORIES と同じ', () => {
    expect(categoriesForProjectType('mod')).toBe(CATEGORIES);
  });

  it('resourcepack / shader は専用カテゴリを返す', () => {
    const rp = categoriesForProjectType('resourcepack').map((c) => c.id);
    const sh = categoriesForProjectType('shader').map((c) => c.id);
    expect(rp).toContain('16x');
    expect(rp).not.toContain('optimization');
    expect(sh).toContain('pbr');
    expect(sh).not.toContain('utility');
  });
});
