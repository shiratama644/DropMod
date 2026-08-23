import { describe, it, expect } from 'vitest';
import { generateId } from '@/lib/utils/id';

describe('generateId', () => {
  it('generates a non-empty string', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('generates unique ids on repeated calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });

  it('applies prefix when given', () => {
    const id = generateId('profile');
    expect(id).toMatch(/^profile-/);
  });

  it('supports arbitrary prefix strings', () => {
    expect(generateId('foo')).toMatch(/^foo-/);
    expect(generateId('mrpack')).toMatch(/^mrpack-/);
    expect(generateId('')).not.toMatch(/^-/); // 空 prefix なら hyphen 無し
  });
});
