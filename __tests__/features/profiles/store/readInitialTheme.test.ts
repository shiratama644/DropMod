/**
 * readInitialTheme (lib/store/profiles.ts) の単体テスト
 *
 * 2026-08-27 追加: store 初期テーマの cookie 復元はテーマ永続化バグ修正の一環。
 * cookie はトグル時に即時書き込まれる「最新のテーマ」であり、Dexie 保存が
 * debounce に間に合わないケースのフォールバックとして機能する。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { readInitialTheme } from '@/features/profiles';

function setCookie(raw: string): void {
  vi.stubGlobal('document', { cookie: raw });
}

describe('readInitialTheme', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('cookie が dropmod_theme=light なら light を返す', () => {
    setCookie('dropmod_theme=light; other=1');
    expect(readInitialTheme()).toBe('light');
  });

  it('cookie が dropmod_theme=dark なら dark を返す', () => {
    setCookie('other=1; dropmod_theme=dark');
    expect(readInitialTheme()).toBe('dark');
  });

  it('dropmod_theme が無ければ既定 dark', () => {
    setCookie('other=1');
    expect(readInitialTheme()).toBe('dark');
  });

  it('cookie が空文字でも既定 dark', () => {
    setCookie('');
    expect(readInitialTheme()).toBe('dark');
  });

  it('不正な値 (admin 等) は dark にフォールバック', () => {
    setCookie('dropmod_theme=admin');
    expect(readInitialTheme()).toBe('dark');
  });

  it('URL エンコードされた値も復元する', () => {
    // %6Cight = "light" (パーセントエンコードされた cookie 値)
    setCookie('dropmod_theme=%6Cight');
    expect(readInitialTheme()).toBe('light');
  });

  it('SSR (document 無し) は dark', () => {
    vi.stubGlobal('document', undefined);
    expect(readInitialTheme()).toBe('dark');
  });

  it('cookie 参照が例外を投げても dark にフォールバック', () => {
    // document.cookie の getter で例外が発生する偽オブジェクト
    vi.stubGlobal('document', {
      get cookie(): string {
        throw new Error('boom');
      }
    });
    expect(readInitialTheme()).toBe('dark');
  });
});
