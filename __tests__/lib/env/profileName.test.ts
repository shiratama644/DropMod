/**
 * lib/env/profileName.ts test (Phase 11-C / PHASE11_PLAN.md §10.1)
 */

import { describe, it, expect } from 'vitest';
import { generateProfileName, isUsableFolderName } from '@/lib/env/profileName';

describe('isUsableFolderName', () => {
  it('妥当なフォルダ名は true', () => {
    expect(isUsableFolderName('My Fabric Instance')).toBe(true);
    expect(isUsableFolderName('1.21.1-adventure')).toBe(true);
    expect(isUsableFolderName('  trimmed  ')).toBe(true);
  });

  it('特定名 (.minecraft 等) は false', () => {
    expect(isUsableFolderName('.minecraft')).toBe(false);
    expect(isUsableFolderName('Minecraft')).toBe(false); // 大文字小文字無視
    expect(isUsableFolderName('instance')).toBe(false);
    expect(isUsableFolderName('Prism')).toBe(false);
  });

  it('空・長すぎる (40 文字超) は false', () => {
    expect(isUsableFolderName('')).toBe(false);
    expect(isUsableFolderName('   ')).toBe(false);
    expect(isUsableFolderName(undefined)).toBe(false);
    expect(isUsableFolderName('a'.repeat(41))).toBe(false);
    expect(isUsableFolderName('a'.repeat(40))).toBe(true);
  });
});

describe('generateProfileName', () => {
  it('フォルダ名が妥当なら trim 済みのフォルダ名', () => {
    expect(generateProfileName('My Instance ', { mcVersion: '1.21.1', loader: 'Fabric' })).toBe(
      'My Instance'
    );
  });

  it('不適切なフォルダ名なら検出環境から生成 (loader + mcVersion)', () => {
    expect(generateProfileName('.minecraft', { mcVersion: '1.21.1', loader: 'Fabric' })).toBe(
      'Fabric 1.21.1'
    );
    expect(generateProfileName(null, { mcVersion: '1.20.1', loader: 'NeoForge' })).toBe(
      'NeoForge 1.20.1'
    );
  });

  it('環境の片方だけでも生成 (loader のみ / mcVersion のみ)', () => {
    expect(generateProfileName('instance', { loader: 'Quilt' })).toBe('Quilt');
    expect(generateProfileName('instance', { mcVersion: '1.21.1' })).toBe('1.21.1');
  });

  it('環境検出に失敗したら空欄', () => {
    expect(generateProfileName('.minecraft', {})).toBe('');
    expect(generateProfileName(null, {})).toBe('');
    expect(generateProfileName(undefined, { mcVersion: undefined, loader: undefined })).toBe('');
  });
});
