/**
 * useModalA11y — モーダル共通アクセシビリティフックのテスト
 *
 * カバーする挙動:
 * - Escape キーで onClose (スタック最上位のみ)
 * - CustomDropdown portal が開いている間は Escape を無視
 * - Tab / Shift+Tab フォーカストラップ (jsdom は offsetParent が null のため stub)
 * - オープン時: input → combobox → コンテナ自身 の優先順で自動フォーカス
 * - クローズ時: 以前のフォーカスに復帰
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { useModalA11y } from '@/hooks/useModalA11y';

// jsdom は offsetParent が常に null のため、Tab トラップの
// 「表示中要素」判定 (offsetParent !== null) が全滅する。
// 全要素を「表示中」扱いにする stub を各テスト前に設定する。
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get() {
      return {};
    }
  });
});

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'offsetParent');
});

function Harness({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useModalA11y(isOpen, onClose, ref);
  if (!isOpen) return null;
  return (
    <div ref={ref} role="dialog" aria-modal="true">
      <input type="text" aria-label="入力" />
      <button type="button">ボタン</button>
    </div>
  );
}

/** フォーカス可能要素が無いモーダル */
function NoFocusableHarness({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useModalA11y(isOpen, onClose, ref);
  if (!isOpen) return null;
  return (
    <div ref={ref} role="dialog" aria-modal="true">
      テキストのみ
    </div>
  );
}

/** input が無く combobox だけのモーダル */
function ComboboxHarness({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useModalA11y(isOpen, onClose, ref);
  if (!isOpen) return null;
  return (
    <div ref={ref} role="dialog" aria-modal="true">
      <div role="combobox" tabIndex={0} aria-expanded="false">
        combobox
      </div>
    </div>
  );
}

/** ref がどの要素にも割り当てられない (コンテナ未マウント) モーダル */
function UnmountedContainerHarness({
  isOpen,
  onClose
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useModalA11y(isOpen, onClose, ref);
  return <div data-testid="unmounted-container-harness">ref は未割り当て</div>;
}

/** フォーカス可能要素が無いが、コンテナに tabindex が既に付いているモーダル */
function PreTabindexHarness({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useModalA11y(isOpen, onClose, ref);
  if (!isOpen) return null;
  return (
    // tabIndex=-1: フォーカス可能要素が無い場合のフォールバック (L163 の
    // 「既に tabindex が付いている」分岐を検証するための事前付与)
    <div ref={ref} role="dialog" aria-modal="true" tabIndex={-1}>
      テキストのみ
    </div>
  );
}

describe('useModalA11y', () => {
  it('isOpen=false の間は Escape を処理しない', () => {
    const onClose = vi.fn();
    render(<Harness isOpen={false} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Escape キーで onClose を呼ぶ', () => {
    const onClose = vi.fn();
    render(<Harness isOpen onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape 以外のキーでは onClose を呼ばない', () => {
    const onClose = vi.fn();
    render(<Harness isOpen onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('custom-dropdown-menu-portal が開いている間は Escape を無視する', () => {
    const onClose = vi.fn();
    render(<Harness isOpen onClose={onClose} />);
    const portal = document.createElement('div');
    portal.className = 'custom-dropdown-menu-portal';
    document.body.appendChild(portal);
    try {
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();
    } finally {
      portal.remove();
    }
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('スタック: 最上位のモーダルだけが Escape を処理する', () => {
    const onCloseA = vi.fn();
    const onCloseB = vi.fn();
    const { rerender } = render(
      <>
        <Harness isOpen onClose={onCloseA} />
        <Harness isOpen onClose={onCloseB} />
      </>
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCloseB).toHaveBeenCalledTimes(1);
    expect(onCloseA).not.toHaveBeenCalled();

    // 上位 (B) を閉じると A が Escape を処理する
    rerender(
      <>
        <Harness isOpen onClose={onCloseA} />
        <Harness isOpen={false} onClose={onCloseB} />
      </>
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCloseA).toHaveBeenCalledTimes(1);
  });

  it('Tab: 末尾要素で Tab すると先頭へフォーカスがループする', () => {
    const onClose = vi.fn();
    render(<Harness isOpen onClose={onClose} />);
    const dialog = screenGetDialog();
    const first = dialog.querySelector<HTMLElement>('input')!;
    const last = dialog.querySelector<HTMLElement>('button')!;
    last.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
  });

  it('Tab: コンテナ外にフォーカスがあるとき Tab すると先頭へフォーカスする', () => {
    const onClose = vi.fn();
    render(<Harness isOpen onClose={onClose} />);
    const dialog = screenGetDialog();
    const first = dialog.querySelector<HTMLElement>('input')!;
    // フォーカスをコンテナ外 (body) に移す
    (document.activeElement as HTMLElement | null)?.blur?.();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
  });

  it('Shift+Tab: 先頭要素で Shift+Tab すると末尾へフォーカスがループする', () => {
    const onClose = vi.fn();
    render(<Harness isOpen onClose={onClose} />);
    const dialog = screenGetDialog();
    const first = dialog.querySelector<HTMLElement>('input')!;
    const last = dialog.querySelector<HTMLElement>('button')!;
    first.focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('Shift+Tab: コンテナ外にフォーカスがあるとき Shift+Tab すると末尾へフォーカスする', () => {
    const onClose = vi.fn();
    render(<Harness isOpen onClose={onClose} />);
    const dialog = screenGetDialog();
    const last = dialog.querySelector<HTMLElement>('button')!;
    (document.activeElement as HTMLElement | null)?.blur?.();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('オープン時: 最初の input へ自動フォーカスする', async () => {
    const onClose = vi.fn();
    render(<Harness isOpen onClose={onClose} />);
    const dialog = screenGetDialog();
    const input = dialog.querySelector<HTMLElement>('input')!;
    await waitFor(() => expect(document.activeElement).toBe(input));
  });

  it('オープン時: input が無ければ combobox へ自動フォーカスする', async () => {
    const onClose = vi.fn();
    render(<ComboboxHarness isOpen onClose={onClose} />);
    const combobox = document.querySelector<HTMLElement>('[role="combobox"]')!;
    await waitFor(() => expect(document.activeElement).toBe(combobox));
  });

  it('オープン時: フォーカス可能要素が無ければコンテナ自身に tabindex=-1 でフォーカスする', async () => {
    const onClose = vi.fn();
    render(<NoFocusableHarness isOpen onClose={onClose} />);
    const dialog = screenGetDialog();
    await waitFor(() => expect(document.activeElement).toBe(dialog));
    expect(dialog.getAttribute('tabindex')).toBe('-1');
  });

  it('クローズ時: 以前のフォーカスに復帰する', async () => {
    const onClose = vi.fn();
    const { rerender } = render(<Harness isOpen={false} onClose={onClose} />);
    // 外のボタンにフォーカスしておく
    const outer = document.createElement('button');
    outer.textContent = '外';
    document.body.appendChild(outer);
    outer.focus();
    try {
      rerender(<Harness isOpen onClose={onClose} />);
      const dialog = screenGetDialog();
      const input = dialog.querySelector<HTMLElement>('input')!;
      await waitFor(() => expect(document.activeElement).toBe(input));
      // 閉じると元の要素へ戻る
      rerender(<Harness isOpen={false} onClose={onClose} />);
      await waitFor(() => expect(document.activeElement).toBe(outer));
    } finally {
      outer.remove();
    }
  });

  it('Tab: フォーカス可能要素が無いモーダルでは何もしない', () => {
    const onClose = vi.fn();
    render(<NoFocusableHarness isOpen onClose={onClose} />);
    // 例外なく Tab が無視される
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Tab: コンテナ ref が未割り当てでも例外なく無視される (ガード)', () => {
    const onClose = vi.fn();
    render(<UnmountedContainerHarness isOpen onClose={onClose} />);
    // containerRef.current が null のまま keydown → ガードが return して例外なし
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(onClose).not.toHaveBeenCalled();
    // Escape は引き続き機能する (スタックには載っている)
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('オープン時: コンテナ ref が未割り当てなら自動フォーカスをスキップする (ガード)', async () => {
    const onClose = vi.fn();
    render(<UnmountedContainerHarness isOpen onClose={onClose} />);
    // rAF が走っても container が null のため何も起きない (クラッシュしない)
    await waitFor(() => expect(onClose).not.toHaveBeenCalled());
  });

  it('Tab: 内部の非末尾要素で Tab するとフォーカスを移動しない', () => {
    const onClose = vi.fn();
    render(<Harness isOpen onClose={onClose} />);
    const dialog = screenGetDialog();
    const first = dialog.querySelector<HTMLElement>('input')!;
    first.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
  });

  it('Shift+Tab: 内部の非先頭要素で Shift+Tab するとフォーカスを移動しない', () => {
    const onClose = vi.fn();
    render(<Harness isOpen onClose={onClose} />);
    const dialog = screenGetDialog();
    const last = dialog.querySelector<HTMLElement>('button')!;
    last.focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('オープン時: コンテナに tabindex が既にあれば付与せずにフォーカスする', async () => {
    const onClose = vi.fn();
    render(<PreTabindexHarness isOpen onClose={onClose} />);
    const dialog = screenGetDialog();
    await waitFor(() => expect(document.activeElement).toBe(dialog));
    expect(dialog.getAttribute('tabindex')).toBe('-1');
  });
});

function screenGetDialog(): HTMLElement {
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
  if (!dialog) throw new Error('dialog not found');
  return dialog;
}
