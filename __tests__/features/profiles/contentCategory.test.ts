import { describe, it, expect } from 'vitest';
import {
  contentCategoryFromPath,
  contentCategoryFromProject,
  contentCategoryOf
} from '@/features/profiles';

describe('contentCategoryOf', () => {
  it('未指定は mod', () => {
    expect(contentCategoryOf({})).toBe('mod');
  });

  it('resourcepack / shader をそのまま返す', () => {
    expect(contentCategoryOf({ type: 'resourcepack' })).toBe('resourcepack');
    expect(contentCategoryOf({ type: 'shader' })).toBe('shader');
  });
});

describe('contentCategoryFromPath', () => {
  it('shaderpacks / resourcepacks パスを判定する', () => {
    expect(contentCategoryFromPath('shaderpacks/foo.zip')).toBe('shader');
    expect(contentCategoryFromPath('overrides/resourcepacks/bar.zip')).toBe('resourcepack');
    expect(contentCategoryFromPath('mods/sodium.jar')).toBe('mod');
  });
});

describe('contentCategoryFromProject', () => {
  it('未知の project_type は mod', () => {
    expect(contentCategoryFromProject({ project_type: 'modpack' })).toBe('mod');
    expect(contentCategoryFromProject({ project_type: 'mod' })).toBe('mod');
  });
});
