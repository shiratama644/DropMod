/**
 * Phase 9-D: 再レンダー計測テスト
 *
 * React DevTools Profiler の代替として、コンポーネント render 関数の呼び出し回数を
 * 直接カウントする「軽量 Profiler」で、各シナリオでの再レンダー総数を計測する。
 *
 * 目的:
 *   Phase 9-A/9-B で AppContext → Zustand 細粒度 subscription に置換した効果を
 *   自動テストで数値化し、リグレッションを防ぐ。
 *
 * 比較モデル:
 *   - "Context 版" (before): 単一 React.Context の value を頻繁に書き換える構造をシミュレート
 *     → context value 参照が変わると全 consumer が再レンダー
 *   - "Zustand 版" (after):  実装 (lib/store/*) 直接参照
 *     → 個別 selector が返す値の Object.is 比較で変化なしなら再レンダーなし
 *
 * DoD 判定基準 (計画書 §8.3):
 *   いずれかのシナリオで Context 版の 70% 以下 (30% 以上削減) を達成すれば OK。
 */

import type React from 'react';
import { useState, useMemo, useCallback, createContext, useContext } from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useProfilesStore } from '@/lib/store/profiles';
import { useToastStore } from '@/lib/store/toast';
import { useZipExportStore } from '@/lib/store/zipExport';
import { useDepCheckStore } from '@/lib/store/depCheck';

// ============================================================================
// ヘルパー: render count 集計
// ============================================================================

interface RenderCounter {
  counts: Record<string, number>;
  reset: () => void;
  /**
   * (id, hook-driven render function) を登録し、Counted<id> component を返す。
   *
   * ⚠️ renderFn は必ず「hook を呼ぶ」形にする。単に `<ChildComponent />` を
   *    return するだけの wrapper では、React の subtree 最適化により
   *    子の再レンダーは親の Counted 関数を再実行させないため count が増えない。
   *    → hook 呼び出しは Counted の render 関数本体で行う。
   *
   * ⚠️ Component は Harness の外で 1 度だけ register する必要がある。
   *   毎 render で register すると Counted が別コンポーネント扱いになり、
   *   リマウントされて count が期待通りにならない。
   */
  register: (id: string, renderFn: () => React.ReactNode) => React.FC;
}

function createRenderCounter(): RenderCounter {
  const counts: Record<string, number> = {};
  return {
    counts,
    reset() {
      for (const k of Object.keys(counts)) counts[k] = 0;
    },
    register(id, renderFn) {
      /* eslint-disable react-hooks/immutability --
       * B36 修正: ファイル全体 disable から個別 disable (register 関数内のみ)
       *   に縮小した状態。この関数内の以下 2 箇所で immutability が発火するが、
       *   いずれも意図的:
       *   1. counts[id] += 1 → render count 計測 (テスト専用の意図した副作用)
       *   2. Counted.displayName = ... → React 公式で許可される慣用パターン
       */
      const Counted: React.FC = () => {
        counts[id] = (counts[id] ?? 0) + 1;
        return <>{renderFn()}</>;
      };
      Counted.displayName = `Counted(${id})`;
      /* eslint-enable react-hooks/immutability */
      return Counted;
    }
  };
}

// ============================================================================
// Context 版 (Phase 9-A 以前の構造をシミュレート)
// ============================================================================

interface LegacyContextValue {
  theme: 'dark' | 'light';
  profiles: Array<{ id: string; name: string }>;
  currentProfileId: string;
  hasDepWarning: boolean;
  zipProgress: number;
  toasts: Array<{ id: string; message: string }>;
  toggleTheme: () => void;
  addToast: (message: string) => void;
  tickZipProgress: () => void;
  setDepWarning: (v: boolean) => void;
}

const LegacyCtx = createContext<LegacyContextValue | null>(null);

function useLegacyCtx(): LegacyContextValue {
  const v = useContext(LegacyCtx);
  if (!v) throw new Error('LegacyProvider missing');
  return v;
}

// LegacyProvider: 1 つの useMemo で contextValue を作り、
// 内部の state 変更で **必ず** 新しい object 参照になる (悪化パターン)。
// Phase 9-A 以前の AppShell.tsx の contextValue useMemo と同型。
function LegacyProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [profiles] = useState([{ id: 'p1', name: 'Default' }]);
  const [currentProfileId] = useState('p1');
  const [hasDepWarning, setDepWarning] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);
  const [toasts, setToasts] = useState<Array<{ id: string; message: string }>>(
    []
  );

  const toggleTheme = useCallback(
    () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    []
  );
  const addToast = useCallback(
    (message: string) =>
      setToasts((t) => [
        ...t,
        { id: `${Date.now()}-${Math.random()}`, message }
      ]),
    []
  );
  const tickZipProgress = useCallback(
    () => setZipProgress((p) => p + 10),
    []
  );

  // 単一 value: どれか 1 つの state 変更で全 field 新参照 → 全 consumer 再レンダー
  const value = useMemo<LegacyContextValue>(
    () => ({
      theme,
      profiles,
      currentProfileId,
      hasDepWarning,
      zipProgress,
      toasts,
      toggleTheme,
      addToast,
      tickZipProgress,
      setDepWarning
    }),
    [
      theme,
      profiles,
      currentProfileId,
      hasDepWarning,
      zipProgress,
      toasts,
      toggleTheme,
      addToast,
      tickZipProgress
    ]
  );

  return <LegacyCtx.Provider value={value}>{children}</LegacyCtx.Provider>;
}

// consumer コンポーネント (Context 版): hook 呼び出しを render 関数として export。
// register() の中で「Counted の本体」に埋め込まれる。
//
// B36 修正: 関数名を `use` prefix にすることで react-hooks/rules-of-hooks の
//   命名規則を満たし、ファイル冒頭の broad な eslint-disable を削除。
//   これらは実際 Counted の render body 内で呼ばれる = React の hook rules 遵守。
const useCtxThemeBadgeRender = () => {
  const { theme } = useLegacyCtx();
  return <span data-testid="ctx-theme">{theme}</span>;
};
const useCtxProfileHeaderRender = () => {
  const { profiles, currentProfileId } = useLegacyCtx();
  const current = profiles.find((p) => p.id === currentProfileId);
  return <span data-testid="ctx-profile">{current?.name}</span>;
};
const useCtxDepWarningBadgeRender = () => {
  const { hasDepWarning } = useLegacyCtx();
  return <span data-testid="ctx-dep">{hasDepWarning ? 'warn' : 'ok'}</span>;
};
const useCtxZipProgressRender = () => {
  const { zipProgress } = useLegacyCtx();
  return <span data-testid="ctx-zip">{zipProgress}</span>;
};
const useCtxToastCountRender = () => {
  const { toasts } = useLegacyCtx();
  return <span data-testid="ctx-toasts">{toasts.length}</span>;
};

// トリガー UI (Context 版内で使う)
function ThemeToggler() {
  const { toggleTheme } = useLegacyCtx();
  return (
    <button type="button" data-testid="ctx-toggle" onClick={toggleTheme}>
      toggle
    </button>
  );
}
function ToastAdder() {
  const { addToast } = useLegacyCtx();
  return (
    <button type="button" data-testid="ctx-toast-btn" onClick={() => addToast('hi')}>
      addToast
    </button>
  );
}
function ZipProgressAdvancer() {
  const { tickZipProgress } = useLegacyCtx();
  return (
    <button type="button" data-testid="ctx-zip-tick" onClick={tickZipProgress}>
      tick
    </button>
  );
}

// ============================================================================
// Zustand 版 (実装コード直接使用、Phase 9-A/9-B の状態を再現)
// ============================================================================

const useStoreThemeBadgeRender = () => {
  const theme = useProfilesStore((s) => s.theme);
  return <span data-testid="store-theme">{theme}</span>;
};
const useStoreProfileHeaderRender = () => {
  const profiles = useProfilesStore((s) => s.profiles);
  const currentProfileId = useProfilesStore((s) => s.currentProfileId);
  const current = profiles.find((p) => p.id === currentProfileId);
  return <span data-testid="store-profile">{current?.name ?? '?'}</span>;
};
const useStoreDepWarningBadgeRender = () => {
  const hasDepWarning = useDepCheckStore((s) => s.hasDepWarning);
  return <span data-testid="store-dep">{hasDepWarning ? 'warn' : 'ok'}</span>;
};
const useStoreZipProgressRender = () => {
  const zipProgress = useZipExportStore((s) => s.zipState.progress);
  return <span data-testid="store-zip">{zipProgress}</span>;
};
const useStoreToastCountRender = () => {
  const toasts = useToastStore((s) => s.toasts);
  return <span data-testid="store-toasts">{toasts.length}</span>;
};

// ============================================================================
// Scenarios
// ============================================================================

describe('Phase 9-D: 再レンダー計測 (Context vs Zustand)', () => {
  beforeEach(() => {
    // Zustand stores を各テストで確実に初期化
    useToastStore.setState({ toasts: [] });
    useZipExportStore.getState().resetZipState();
    useDepCheckStore.getState().reset();
    useProfilesStore.setState({ theme: 'dark' });
  });

  // ----------------------------------------------------------------
  // Scenario A: 「テーマ切替」時、theme 非購読コンポーネントの render 数
  // ----------------------------------------------------------------
  it('Scenario A: theme 変更で、theme 非購読コンポーネントの再レンダー数を大幅削減', () => {
    // ---- Context 版 ----
    const ctxCounter = createRenderCounter();
    const CtxTheme = ctxCounter.register('ctx-theme', useCtxThemeBadgeRender);
    const CtxProfile = ctxCounter.register('ctx-profile', useCtxProfileHeaderRender);
    const CtxDep = ctxCounter.register('ctx-dep', useCtxDepWarningBadgeRender);
    const CtxZip = ctxCounter.register('ctx-zip', useCtxZipProgressRender);
    const CtxToasts = ctxCounter.register('ctx-toasts', useCtxToastCountRender);
    const CtxHarness = () => (
      <LegacyProvider>
        <ThemeToggler />
        <CtxTheme />
        <CtxProfile />
        <CtxDep />
        <CtxZip />
        <CtxToasts />
      </LegacyProvider>
    );
    const { getByTestId: getCtx } = render(<CtxHarness />);
    ctxCounter.reset();
    for (let i = 0; i < 5; i++) {
      act(() => {
        getCtx('ctx-toggle').click();
      });
    }

    // ---- Zustand 版 ----
    const storeCounter = createRenderCounter();
    const StoreTheme = storeCounter.register('store-theme', useStoreThemeBadgeRender);
    const StoreProfile = storeCounter.register('store-profile', useStoreProfileHeaderRender);
    const StoreDep = storeCounter.register('store-dep', useStoreDepWarningBadgeRender);
    const StoreZip = storeCounter.register('store-zip', useStoreZipProgressRender);
    const StoreToasts = storeCounter.register('store-toasts', useStoreToastCountRender);
    const StoreHarness = () => (
      <>
        <StoreTheme />
        <StoreProfile />
        <StoreDep />
        <StoreZip />
        <StoreToasts />
      </>
    );
    render(<StoreHarness />);
    storeCounter.reset();
    for (let i = 0; i < 5; i++) {
      act(() => {
        useProfilesStore
          .getState()
          .setTheme(
            useProfilesStore.getState().theme === 'dark' ? 'light' : 'dark'
          );
      });
    }

    // ---- Context 版: theme 以外の 4 コンポーネントも各 5 回巻き添え再レンダー ----
    const ctxTotal = Object.values(ctxCounter.counts).reduce((a, b) => a + b, 0);
    expect(ctxCounter.counts['ctx-theme']).toBe(5);
    expect(ctxCounter.counts['ctx-profile']).toBe(5); // 巻き添え
    expect(ctxCounter.counts['ctx-dep']).toBe(5);
    expect(ctxCounter.counts['ctx-zip']).toBe(5);
    expect(ctxCounter.counts['ctx-toasts']).toBe(5);
    expect(ctxTotal).toBe(25);

    // ---- Zustand 版: theme subscriber のみ 5 回、他 0 回 ----
    const storeTotal = Object.values(storeCounter.counts).reduce((a, b) => a + b, 0);
    expect(storeCounter.counts['store-theme']).toBe(5);
    expect(storeCounter.counts['store-profile']).toBe(0);
    expect(storeCounter.counts['store-dep']).toBe(0);
    expect(storeCounter.counts['store-zip']).toBe(0);
    expect(storeCounter.counts['store-toasts']).toBe(0);
    expect(storeTotal).toBe(5);

    // 削減率: 25 → 5 = 80% ↓ (目標 70% 以下 = 30%以上削減 を超過達成)
    const reductionRate = (ctxTotal - storeTotal) / ctxTotal;
    expect(reductionRate).toBeGreaterThanOrEqual(0.7);
  });

  // ----------------------------------------------------------------
  // Scenario B: Toast 追加時、toast 非購読コンポーネントは 0 回
  // ----------------------------------------------------------------
  it('Scenario B: Toast 追加で、非購読コンポーネントの再レンダーが 0 回', () => {
    // ---- Context 版 ----
    const ctxCounter = createRenderCounter();
    const CtxTheme = ctxCounter.register('ctx-theme', useCtxThemeBadgeRender);
    const CtxProfile = ctxCounter.register('ctx-profile', useCtxProfileHeaderRender);
    const CtxDep = ctxCounter.register('ctx-dep', useCtxDepWarningBadgeRender);
    const CtxZip = ctxCounter.register('ctx-zip', useCtxZipProgressRender);
    const CtxToasts = ctxCounter.register('ctx-toasts', useCtxToastCountRender);
    const CtxHarness = () => (
      <LegacyProvider>
        <ToastAdder />
        <CtxTheme />
        <CtxProfile />
        <CtxDep />
        <CtxZip />
        <CtxToasts />
      </LegacyProvider>
    );
    const { getByTestId: getCtx } = render(<CtxHarness />);
    ctxCounter.reset();
    for (let i = 0; i < 3; i++) {
      act(() => {
        getCtx('ctx-toast-btn').click();
      });
    }

    // ---- Zustand 版 ----
    const storeCounter = createRenderCounter();
    const StoreTheme = storeCounter.register('store-theme', useStoreThemeBadgeRender);
    const StoreProfile = storeCounter.register('store-profile', useStoreProfileHeaderRender);
    const StoreDep = storeCounter.register('store-dep', useStoreDepWarningBadgeRender);
    const StoreZip = storeCounter.register('store-zip', useStoreZipProgressRender);
    const StoreToasts = storeCounter.register('store-toasts', useStoreToastCountRender);
    const StoreHarness = () => (
      <>
        <StoreTheme />
        <StoreProfile />
        <StoreDep />
        <StoreZip />
        <StoreToasts />
      </>
    );
    render(<StoreHarness />);
    storeCounter.reset();
    for (let i = 0; i < 3; i++) {
      act(() => {
        useToastStore.getState().showToast(`msg ${i}`);
      });
    }

    const ctxTotal = Object.values(ctxCounter.counts).reduce((a, b) => a + b, 0);
    expect(ctxTotal).toBe(15); // 3 × 5

    expect(storeCounter.counts['store-toasts']).toBe(3);
    expect(storeCounter.counts['store-theme']).toBe(0);
    expect(storeCounter.counts['store-profile']).toBe(0);
    expect(storeCounter.counts['store-dep']).toBe(0);
    expect(storeCounter.counts['store-zip']).toBe(0);
    const storeTotal = Object.values(storeCounter.counts).reduce((a, b) => a + b, 0);
    expect(storeTotal).toBe(3);

    const reductionRate = (ctxTotal - storeTotal) / ctxTotal;
    expect(reductionRate).toBeGreaterThanOrEqual(0.7); // 80% ↓
  });

  // ----------------------------------------------------------------
  // Scenario C: ZIP 進捗更新 (高頻度) で、zip 非購読コンポーネントは 0 回
  // ----------------------------------------------------------------
  it('Scenario C: 高頻度な zipProgress 更新で、非購読コンポーネントの再レンダーが 0', () => {
    // ---- Context 版 ----
    const ctxCounter = createRenderCounter();
    const CtxTheme = ctxCounter.register('ctx-theme', useCtxThemeBadgeRender);
    const CtxProfile = ctxCounter.register('ctx-profile', useCtxProfileHeaderRender);
    const CtxDep = ctxCounter.register('ctx-dep', useCtxDepWarningBadgeRender);
    const CtxZip = ctxCounter.register('ctx-zip', useCtxZipProgressRender);
    const CtxToasts = ctxCounter.register('ctx-toasts', useCtxToastCountRender);
    const CtxHarness = () => (
      <LegacyProvider>
        <ZipProgressAdvancer />
        <CtxTheme />
        <CtxProfile />
        <CtxDep />
        <CtxZip />
        <CtxToasts />
      </LegacyProvider>
    );
    const { getByTestId: getCtx } = render(<CtxHarness />);
    ctxCounter.reset();
    for (let i = 1; i <= 10; i++) {
      act(() => {
        getCtx('ctx-zip-tick').click();
      });
    }

    // ---- Zustand 版 ----
    const storeCounter = createRenderCounter();
    const StoreTheme = storeCounter.register('store-theme', useStoreThemeBadgeRender);
    const StoreProfile = storeCounter.register('store-profile', useStoreProfileHeaderRender);
    const StoreDep = storeCounter.register('store-dep', useStoreDepWarningBadgeRender);
    const StoreZip = storeCounter.register('store-zip', useStoreZipProgressRender);
    const StoreToasts = storeCounter.register('store-toasts', useStoreToastCountRender);
    const StoreHarness = () => (
      <>
        <StoreTheme />
        <StoreProfile />
        <StoreDep />
        <StoreZip />
        <StoreToasts />
      </>
    );
    render(<StoreHarness />);
    storeCounter.reset();
    for (let i = 1; i <= 10; i++) {
      act(() => {
        useZipExportStore.getState().updateZipState({ progress: i * 10 });
      });
    }

    const ctxTotal = Object.values(ctxCounter.counts).reduce((a, b) => a + b, 0);
    expect(ctxTotal).toBe(50); // 10 × 5

    expect(storeCounter.counts['store-zip']).toBe(10);
    expect(storeCounter.counts['store-theme']).toBe(0);
    expect(storeCounter.counts['store-profile']).toBe(0);
    expect(storeCounter.counts['store-dep']).toBe(0);
    expect(storeCounter.counts['store-toasts']).toBe(0);
    const storeTotal = Object.values(storeCounter.counts).reduce((a, b) => a + b, 0);
    expect(storeTotal).toBe(10);

    const reductionRate = (ctxTotal - storeTotal) / ctxTotal;
    expect(reductionRate).toBeGreaterThanOrEqual(0.7); // 80% ↓
  });

  // ----------------------------------------------------------------
  // 回帰防止用の低レベルテスト
  // ----------------------------------------------------------------
  it('Zustand: 同じ selector 結果 (Object.is 等価) では再レンダーしない', () => {
    const counter = createRenderCounter();
    const Counted = counter.register('c', useStoreThemeBadgeRender);
    render(<Counted />);
    counter.reset();

    // 同じ値で setTheme を 3 回呼ぶ (dark → dark)
    act(() => {
      useProfilesStore.getState().setTheme('dark');
      useProfilesStore.getState().setTheme('dark');
      useProfilesStore.getState().setTheme('dark');
    });
    expect(counter.counts.c).toBe(0);
  });

  it('Zustand: selector が異なる field でも独立して subscribe できる', () => {
    const counter = createRenderCounter();
    const CountedTheme = counter.register('theme', useStoreThemeBadgeRender);
    const CountedDep = counter.register('dep', useStoreDepWarningBadgeRender);

    render(
      <>
        <CountedTheme />
        <CountedDep />
      </>
    );
    counter.reset();

    // theme 変更 → theme のみ再レンダー
    act(() => {
      useProfilesStore.getState().setTheme('light');
    });
    expect(counter.counts.theme).toBe(1);
    expect(counter.counts.dep).toBe(0);

    // dep 変更 → dep のみ再レンダー
    act(() => {
      useDepCheckStore.getState().setHasDepWarning(true);
    });
    expect(counter.counts.theme).toBe(1); // 変わらず
    expect(counter.counts.dep).toBe(1);
  });
});
