/**
 * Sync 実行前の環境一致チェック (Phase 12-B / **D-1**) test
 *
 * D-1 (2026-08-27 確定): `Profile.environment` とローカル検出環境が不一致なら
 * **Sync をブロック**する。`loaderVersion` だけの差異でも緩和しない。
 */

import { describe, it, expect } from 'vitest';
import {
  checkEnvironmentMatch,
  ENVIRONMENT_FIELDS,
  ENVIRONMENT_FIELD_LABEL
} from '@/lib/env/environmentCheck';
import type { Profile } from '@/types';

/** `Profile['environment']` と同じ形 */
function env(overrides: Partial<Profile['environment']> = {}): Profile['environment'] {
  return { mcVersion: '1.20.1', loader: 'Fabric', loaderVersion: '0.14.21', ...overrides };
}

describe('checkEnvironmentMatch — D-1', () => {
  it('3 フィールドすべて一致すれば ok', () => {
    const result = checkEnvironmentMatch(env(), {
      mcVersion: '1.20.1',
      loader: 'Fabric',
      loaderVersion: '0.14.21'
    });
    expect(result.ok).toBe(true);
    expect(result.mismatches).toEqual([]);
    expect(result.unverified).toEqual([]);
    expect(result.message).toBeUndefined();
  });

  it('mcVersion 違いはブロックし、理由を message に出す', () => {
    const result = checkEnvironmentMatch(env(), {
      mcVersion: '1.21.4',
      loader: 'Fabric',
      loaderVersion: '0.14.21'
    });
    expect(result.ok).toBe(false);
    expect(result.mismatches).toEqual([
      {
        field: 'mcVersion',
        label: ENVIRONMENT_FIELD_LABEL.mcVersion,
        profile: '1.20.1',
        detected: '1.21.4'
      }
    ]);
    expect(result.message).toContain('1.20.1');
    expect(result.message).toContain('1.21.4');
    expect(result.message).toContain('Sync できません');
  });

  it('loader 違いもブロック', () => {
    const result = checkEnvironmentMatch(env(), {
      mcVersion: '1.20.1',
      loader: 'Forge',
      loaderVersion: '0.14.21'
    });
    expect(result.ok).toBe(false);
    expect(result.mismatches.map((m) => m.field)).toEqual(['loader']);
  });

  it('D-1: loaderVersion だけの違いでも緩和せずブロックする', () => {
    const result = checkEnvironmentMatch(env(), {
      mcVersion: '1.20.1',
      loader: 'Fabric',
      loaderVersion: '0.15.0'
    });
    expect(result.ok).toBe(false);
    expect(result.mismatches.map((m) => m.field)).toEqual(['loaderVersion']);
  });

  it('複数不一致はすべて列挙する', () => {
    const result = checkEnvironmentMatch(env(), {
      mcVersion: '1.21.4',
      loader: 'NeoForge',
      loaderVersion: '21.4.0'
    });
    expect(result.ok).toBe(false);
    expect(result.mismatches.map((m) => m.field)).toEqual(['mcVersion', 'loader', 'loaderVersion']);
  });

  it('検出できなかったフィールドは unverified 扱いでブロックしない', () => {
    const result = checkEnvironmentMatch(env(), { mcVersion: '1.20.1' });
    expect(result.ok).toBe(true);
    expect(result.mismatches).toEqual([]);
    expect(result.unverified.map((u) => u.field)).toEqual(['loader', 'loaderVersion']);
  });

  it('Generic フォルダ (全項目検出不能) でも Sync は許可する', () => {
    const result = checkEnvironmentMatch(env(), {});
    expect(result.ok).toBe(true);
    expect(result.unverified).toHaveLength(3);
  });

  it('Profile 側に loaderVersion が無ければ比較対象外', () => {
    const result = checkEnvironmentMatch(
      env({ loaderVersion: undefined }),
      { mcVersion: '1.20.1', loader: 'Fabric', loaderVersion: '0.99.0' }
    );
    expect(result.ok).toBe(true);
    expect(result.unverified).toEqual([]);
  });

  it('Profile 側の空文字も未設定と同じ扱い', () => {
    const result = checkEnvironmentMatch(
      { mcVersion: '1.20.1', loader: 'Fabric', loaderVersion: '' },
      { mcVersion: '1.20.1', loader: 'Fabric' }
    );
    expect(result.ok).toBe(true);
  });

  it('比較対象は固定 3 フィールド・固定順 (UI 表示順と一致させる)', () => {
    expect(ENVIRONMENT_FIELDS).toEqual(['mcVersion', 'loader', 'loaderVersion']);
    expect(Object.keys(ENVIRONMENT_FIELD_LABEL)).toEqual([...ENVIRONMENT_FIELDS]);
  });
});
