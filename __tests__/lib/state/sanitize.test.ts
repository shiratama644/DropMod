import { describe, it, expect } from 'vitest';
import { sanitizeLoadedState } from '@/lib/state/sanitize';

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
    expect(p?.mcVersion).toBe('1.20.1');
    expect(p?.loader).toBe('Fabric');
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
    expect(result?.profiles?.[0]?.mods[0]?.id).toBe('m1');
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
});
