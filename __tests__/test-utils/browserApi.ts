/**
 * jsdom 未実装 Browser API の stub 群 (Phase 10.5-A)
 *
 * 背景 (2026-08-26 実測、vitest 4.1.11 + jsdom 25):
 *   - `window.matchMedia`    → undefined (呼ぶと TypeError)。reduced-motion
 *     判定をする hook (useCountUp / useScrollReveal) は stub が必須。
 *   - `IntersectionObserver` → undefined。observe 系 hook は stub が必須。
 *   - `requestAnimationFrame` → 実装あり (vitest の jsdom は pretendToBeVisual)。
 *     同期実行に差し替えると rAF throttle を含む hook のテストが決定的になる。
 *   - `window === globalThis` が true のため window への定義で足りるが、
 *     環境差に備えて両方に定義して両方を復元する。
 *
 * 使い方: テストの beforeEach で生成し、afterEach で restore() する。
 *   const mm = stubMatchMedia(false);
 *   const io = stubIntersectionObserver();
 *   afterEach(() => { mm.restore(); io.restore(); });
 */

import { vi, type Mock } from 'vitest';

// ---------------------------------------------------------------------------
// 内部 helper: global (window / globalThis) への上書きと復元
// ---------------------------------------------------------------------------

interface GlobalOverride {
  restore(): void;
}

function overrideGlobal(key: string, value: unknown): GlobalOverride {
  const targets = window === globalThis ? [window] : [window, globalThis];
  const snapshots = targets.map((target) => ({
    target,
    descriptor: Object.getOwnPropertyDescriptor(target, key)
  }));
  for (const target of targets) {
    Object.defineProperty(target, key, {
      value,
      writable: true,
      configurable: true
    });
  }
  return {
    restore() {
      for (const { target, descriptor } of snapshots) {
        if (descriptor) {
          Object.defineProperty(target, key, descriptor);
        } else {
          Reflect.deleteProperty(target, key);
        }
      }
    }
  };
}

// ---------------------------------------------------------------------------
// matchMedia
// ---------------------------------------------------------------------------

export interface MatchMediaStub {
  /** `(prefers-reduced-motion: reduce)` の matches を切替える */
  setReducedMotion(matches: boolean): void;
  restore(): void;
}

export function stubMatchMedia(reducedMotion = false): MatchMediaStub {
  let reduced = reducedMotion;
  const fn = vi.fn((query: string): MediaQueryList => ({
    matches: query.includes('prefers-reduced-motion') ? reduced : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn((): boolean => false)
  }));
  const override = overrideGlobal('matchMedia', fn);
  return {
    setReducedMotion(matches: boolean) {
      reduced = matches;
    },
    restore() {
      override.restore();
    }
  };
}

// ---------------------------------------------------------------------------
// IntersectionObserver
// ---------------------------------------------------------------------------

export interface IntersectionObserverStubInstance {
  /** コンストラクタ第 2 引数 (threshold 等) の検証用 */
  options: IntersectionObserverInit | undefined;
  observe: Mock;
  unobserve: Mock;
  disconnect: Mock;
  /** この observer の callback を entries 付きで発火する */
  trigger(isIntersecting: boolean, target?: Element | null): void;
}

export interface IntersectionObserverStub {
  /** `new IntersectionObserver(...)` で生成された instance (生成順) */
  instances: IntersectionObserverStubInstance[];
  /** 最新 instance の callback を発火する */
  trigger(isIntersecting: boolean, target?: Element | null): void;
  restore(): void;
}

export function stubIntersectionObserver(): IntersectionObserverStub {
  const instances: IntersectionObserverStubInstance[] = [];

  // ※ function 宣言として定義すること (arrow function 不可)。
  //   vitest 4 は `new` で呼ばれた mock を construct するため、
  //   arrow 実装だと「not a constructor」で落ちる。
  function observerConstructor(
    callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit
  ): IntersectionObserver {
    const instance: IntersectionObserverStubInstance = {
      options,
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
      trigger(isIntersecting: boolean, target: Element | null = null) {
        callback(
          [{ isIntersecting, target } as unknown as IntersectionObserverEntry],
          instance as unknown as IntersectionObserver
        );
      }
    };
    instances.push(instance);
    return instance as unknown as IntersectionObserver;
  }

  const constructorMock = vi.fn(observerConstructor);
  const override = overrideGlobal('IntersectionObserver', constructorMock);
  return {
    instances,
    trigger(isIntersecting: boolean, target?: Element | null) {
      const last = instances[instances.length - 1];
      if (last) {
        last.trigger(isIntersecting, target);
      }
    },
    restore() {
      override.restore();
    }
  };
}

// ---------------------------------------------------------------------------
// requestAnimationFrame
// ---------------------------------------------------------------------------

export interface RafStub {
  /** rAF 呼び出し回数の検証用 (throttle テスト等) */
  mock: Mock;
  /** queued モードで溜まった callback をすべて実行する */
  flush(): void;
  restore(): void;
}

/**
 * @param mode 'sync'   = rAF callback を即座に (同期的に) 実行する (既定)
 *             'queued' = flush() まで callback を保留する (throttle 検証用)
 */
export function stubRequestAnimationFrame(mode: 'sync' | 'queued' = 'sync'): RafStub {
  const queue: FrameRequestCallback[] = [];
  const mock = vi.fn((callback: FrameRequestCallback): number => {
    if (mode === 'sync') {
      callback(0);
      return 0;
    }
    queue.push(callback);
    return queue.length;
  });
  const override = overrideGlobal('requestAnimationFrame', mock);
  return {
    mock,
    flush() {
      const callbacks = queue.splice(0, queue.length);
      for (const callback of callbacks) {
        callback(0);
      }
    },
    restore() {
      override.restore();
    }
  };
}

// ---------------------------------------------------------------------------
// window.scrollY
// ---------------------------------------------------------------------------

export interface ScrollYStub {
  /** 現在のスクロール位置を差し替える (scroll event は別途 dispatch する) */
  set(y: number): void;
  restore(): void;
}

export function stubScrollY(initial = 0): ScrollYStub {
  const original = Object.getOwnPropertyDescriptor(window, 'scrollY');
  let y = initial;
  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    get: () => y
  });
  return {
    set(next: number) {
      y = next;
    },
    restore() {
      if (original) {
        Object.defineProperty(window, 'scrollY', original);
      } else {
        Reflect.deleteProperty(window, 'scrollY');
      }
    }
  };
}
