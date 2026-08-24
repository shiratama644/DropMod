import { describe, it, expect } from 'vitest';
import { versionChannel, versionDropdownOption } from '@/lib/utils/versionOption';

describe('versionChannel / versionDropdownOption', () => {
  it('release と未知は stable', () => {
    expect(versionChannel('release')).toBe('stable');
    expect(versionChannel(undefined)).toBe('stable');
  });

  it('alpha / beta をそのまま返す', () => {
    expect(versionChannel('alpha')).toBe('alpha');
    expect(versionChannel('beta')).toBe('beta');
  });

  it('ラベルはバージョン番号のみで [stable] 表記は付けない', () => {
    const opt = versionDropdownOption('0.6.13', 'ver-1', 'release');
    expect(opt.label).toBe('0.6.13');
    expect(opt.label).not.toMatch(/\[/);
    expect(opt.tone).toBe('stable');
    expect(opt.icon).toBe('fa-circle-check');
  });

  it('alpha は赤チャネル + vial、beta は青チャネル + flask', () => {
    expect(versionDropdownOption('1.0.0-alpha', 'a', 'alpha')).toMatchObject({
      tone: 'alpha',
      icon: 'fa-vial'
    });
    expect(versionDropdownOption('1.0.0-beta', 'b', 'beta')).toMatchObject({
      tone: 'beta',
      icon: 'fa-flask'
    });
  });
});
