/**
 * next/navigation の mock 基盤 (Phase 10.5-B)
 *
 * usePathname (DesktopSidebar / BottomSheet) と useRouter (LandingSearchForm)
 * を差し替える。テストファイルでは以下の形で使用する:
 *
 *   vi.mock('next/navigation', async () => {
 *     const { nextNavigationModuleMock } = await import('../test-utils/navigation');
 *     return nextNavigationModuleMock();
 *   });
 *
 *   // テスト側からは navigationMock を import して操作:
 *   navigationMock.setPathname('/discover/mods');
 *   expect(navigationMock.push).toHaveBeenCalledWith('/discover/mods?q=x');
 *
 * ※ vi.mock の factory は hoisted されて import より先に走るため、
 *   factory 内は dynamic import で util を取得する (同一 instance が返る)。
 */

import { vi, type Mock } from 'vitest';

export interface NavigationMock {
  /** usePathname として動く mock (setPathname の戻り値を返す) */
  usePathname: Mock<() => string>;
  /** useRouter().push の mock */
  push: Mock<(url: string) => void>;
  /** useRouter().replace の mock */
  replace: Mock<(url: string) => void>;
  /** usePathname の戻り値を切り替える (再 render が必要な場合は rerender を使う) */
  setPathname(pathname: string): void;
  /** mock の状態を初期化 (pathname を '/' に戻す) */
  reset(): void;
}

const state = { pathname: '/' };

export const navigationMock: NavigationMock = {
  usePathname: vi.fn<() => string>(() => state.pathname),
  push: vi.fn<(url: string) => void>(),
  replace: vi.fn<(url: string) => void>(),
  setPathname(pathname: string) {
    state.pathname = pathname;
  },
  reset() {
    state.pathname = '/';
    this.usePathname.mockClear();
    this.push.mockClear();
    this.replace.mockClear();
  }
};

/** vi.mock('next/navigation', ...) の factory 戻り値 (module mock) */
export function nextNavigationModuleMock() {
  return {
    usePathname: navigationMock.usePathname,
    useRouter: () => ({
      push: navigationMock.push,
      replace: navigationMock.replace,
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn()
    })
  };
}
