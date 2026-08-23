import { describe, it, expect } from 'vitest';
import { contentCategoryFromProject, contentCategoryOf } from '@/lib/utils/contentCategory';

describe('contentCategoryOf', () => {
  it('未指定は mod', () => {
    expect(contentCategoryOf({})).toBe('mod');
  });

  it('resourcepack / shader をそのまま返す', () => {
    expect(contentCategoryOf({ projectType: 'resourcepack' })).toBe('resourcepack');
    expect(contentCategoryOf({ projectType: 'shader' })).toBe('shader');
  });
});

describe('contentCategoryFromProject', () => {
  it('未知の project_type は mod', () => {
    expect(contentCategoryFromProject({ project_type: 'modpack' })).toBe('mod');
    expect(contentCategoryFromProject({ project_type: 'mod' })).toBe('mod');
  });
});
