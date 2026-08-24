import { describe, it, expect } from 'vitest';
import {
  CATEGORIES,
  categoriesForProjectType,
  categoryLabel,
  primaryCategoryId
} from '@/lib/constants/categories';

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

describe('primaryCategoryId / categoryLabel', () => {
  it('ローダーと project_type を飛ばしてジャンルを返す', () => {
    expect(primaryCategoryId(['fabric', 'mod'], ['fabric', 'utility', 'optimization'])).toBe(
      'utility'
    );
  });

  it('display_categories を優先する', () => {
    expect(primaryCategoryId(['magic'], ['utility'])).toBe('magic');
  });

  it('該当がなければ undefined', () => {
    expect(primaryCategoryId(['fabric'], ['neoforge', 'mod'])).toBeUndefined();
  });

  it('既知 id は日本語ラベル、未知は id のまま、空は未分類', () => {
    expect(categoryLabel('utility')).toBe('ユーティリティ');
    expect(categoryLabel('performance')).toBe('軽量化');
    expect(categoryLabel('pbr')).toBe('PBR');
    expect(categoryLabel('custom-tag')).toBe('custom-tag');
    expect(categoryLabel(undefined)).toBe('未分類');
  });
});
