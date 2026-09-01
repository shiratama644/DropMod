/**
 * components/ui/BottomSheet.tsx tests (COV-3)
 *
 * animejs は動的 import されるため vi.mock で Promise を返す形に差し替え、
 * usePathname は test-utils/navigation の navigationMock を使う。
 * カバー対象: open/close アニメ / Escape / 背景クリック / フォーカス管理 /
 * URL 変化 close / grabber ドラッグ / reduced-motion。
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { navigationMock } from '@/__tests__/test-utils/navigation';
import {
  stubMatchMedia,
  type MatchMediaStub
} from '@/__tests__/test-utils/browserApi';

vi.mock('next/navigation', async () => {
  const { nextNavigationModuleMock } = await import('@/__tests__/test-utils/navigation');
  return nextNavigationModuleMock();
});

const { animateMock } = vi.hoisted(() => ({
  // close アニメは animate(...).then() を呼ぶため Promise を返す
  animateMock: vi.fn<
    (targets: Element | object, params: Record<string, unknown>) => Promise<void>
  >(() => Promise.resolve())
}));

vi.mock('animejs', () => ({ animate: animateMock }));

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    isOpen: true,
    onClose: vi.fn(),
    onCloseAnimationComplete: vi.fn(),
    children: <div>Sheet content</div>,
    ariaLabel: 'Test sheet',
    ...overrides
  };
}

/** rAF (jsdom は 16ms 周期) / 非同期アニメーションをフラッシュする */
async function flushAsync() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

describe('BottomSheet', () => {
  let mm: MatchMediaStub;

  beforeEach(() => {
    animateMock.mockClear();
    navigationMock.reset();
    mm = stubMatchMedia(false);
  });

  // BottomSheet のアニメ IIFE は await import を挟むため、テスト終了後に
  // continuation が走ることがある。stub を都度削除すると unhandled rejection
  // になるため、ファイル全体で stub を維持する (MenuBottomSheet と同じ方針)。
  afterAll(() => {
    mm.restore();
  });

  it('isOpen=false では何も描画しない', () => {
    const { container } = render(<BottomSheet {...makeProps({ isOpen: false })} />);
    expect(container.firstChild).toBeNull();
  });

  it('isOpen=true で dialog が描画され ariaLabel が見出しに出る', () => {
    render(<BottomSheet {...makeProps()} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Test sheet')).toBeTruthy();
    expect(screen.getByText('Sheet content')).toBeTruthy();
  });

  it('open アニメで sheet と backdrop に animate を実行する', async () => {
    render(<BottomSheet {...makeProps()} />);
    await flushAsync();
    const sheet = screen.getByRole('dialog');
    expect(animateMock).toHaveBeenCalledWith(
      sheet,
      expect.objectContaining({ translateY: ['100%', '0%'] })
    );
    expect(animateMock).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ opacity: [0, 1] })
    );
  });

  it('reduced-motion ではアニメ時間を短縮する', async () => {
    mm = stubMatchMedia(true);
    render(<BottomSheet {...makeProps()} />);
    await flushAsync();
    expect(animateMock).toHaveBeenCalledWith(
      screen.getByRole('dialog'),
      expect.objectContaining({ duration: 150 })
    );
  });

  it('isOpen=false にすると close アニメ後に unmount し onCloseAnimationComplete を呼ぶ', async () => {
    const onCloseAnimationComplete = vi.fn();
    const { rerender } = render(
      <BottomSheet {...makeProps({ onCloseAnimationComplete })} />
    );
    await flushAsync();
    rerender(<BottomSheet {...makeProps({ isOpen: false, onCloseAnimationComplete })} />);
    await flushAsync();
    // close アニメ (translateY 100%) は isOpen=false への切替後に実行される
    expect(
      animateMock.mock.calls.some(
        ([, params]) =>
          Array.isArray(params.translateY) &&
          params.translateY[0] === '0%' &&
          params.translateY[1] === '100%'
      )
    ).toBe(true);
    expect(onCloseAnimationComplete).toHaveBeenCalledTimes(1);
    // close アニメ完了後は DOM から消える
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Escape キーで onClose が呼ばれる', async () => {
    const onClose = vi.fn();
    render(<BottomSheet {...makeProps({ onClose })} />);
    await flushAsync();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('背景クリックで onClose が呼ばれる', async () => {
    const onClose = vi.fn();
    const { container } = render(<BottomSheet {...makeProps({ onClose })} />);
    await flushAsync();
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('シート内クリックは背景に伝播せず onClose を呼ばない', async () => {
    const onClose = vi.fn();
    const { container } = render(<BottomSheet {...makeProps({ onClose })} />);
    await flushAsync();
    const sheet = container.querySelector('[role="dialog"]') as HTMLElement;
    fireEvent.click(sheet);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('URL が変わると onClose が呼ばれる', async () => {
    const onClose = vi.fn();
    const { rerender } = render(<BottomSheet {...makeProps({ onClose })} />);
    await flushAsync();
    navigationMock.setPathname('/other');
    rerender(<BottomSheet {...makeProps({ onClose })} />);
    await flushAsync();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('mount 時に最初の focusable 要素へフォーカスする', async () => {
    render(
      <BottomSheet
        {...makeProps({
          children: <button type="button">Focus me</button>
        })}
      />
    );
    await flushAsync();
    expect(screen.getByText('Focus me')).toHaveFocus();
  });

  it('focusable が無ければ container に tabindex を付与してフォーカスする', async () => {
    render(<BottomSheet {...makeProps({ children: <div>plain</div> })} />);
    await flushAsync();
    const sheet = screen.getByRole('dialog');
    expect(sheet.hasAttribute('tabindex')).toBe(true);
  });

  it('grabber を閾値 (60px) 以上ドラッグすると onClose が呼ばれる', async () => {
    const onClose = vi.fn();
    const { container } = render(<BottomSheet {...makeProps({ onClose })} />);
    await flushAsync();
    const grabber = container.querySelector('.cursor-grab') as HTMLElement;
    fireEvent.pointerDown(grabber, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(grabber, { pointerId: 1, clientY: 200 });
    await flushAsync();
    fireEvent.pointerUp(grabber, { pointerId: 1, clientY: 200 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('grabber ドラッグが閾値未満なら onClose を呼ばず元位置に戻す', async () => {
    const onClose = vi.fn();
    const { container } = render(<BottomSheet {...makeProps({ onClose })} />);
    await flushAsync();
    const grabber = container.querySelector('.cursor-grab') as HTMLElement;
    fireEvent.pointerDown(grabber, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(grabber, { pointerId: 1, clientY: 110 });
    fireEvent.pointerUp(grabber, { pointerId: 1, clientY: 110 });
    expect(onClose).not.toHaveBeenCalled();
    const sheet = container.querySelector('[role="dialog"]') as HTMLElement;
    expect(sheet.style.transform).toContain('translateY(0px)');
  });

  it('pointerCancel で元位置に戻す', async () => {
    const onClose = vi.fn();
    const { container } = render(<BottomSheet {...makeProps({ onClose })} />);
    await flushAsync();
    const grabber = container.querySelector('.cursor-grab') as HTMLElement;
    fireEvent.pointerDown(grabber, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(grabber, { pointerId: 1, clientY: 200 });
    fireEvent.pointerCancel(grabber, { pointerId: 1 });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('bottomOffsetPx / maxHeightClass / zIndexClass を反映する', () => {
    const { container } = render(
      <BottomSheet
        {...makeProps({
          bottomOffsetPx: 80,
          maxHeightClass: 'max-h-[80vh]',
          zIndexClass: 'z-[99]'
        })}
      />
    );
    const backdrop = container.firstChild as HTMLElement;
    expect(backdrop.className).toContain('z-[99]');
    const sheet = container.querySelector('[role="dialog"]') as HTMLElement;
    expect(sheet.className).toContain('max-h-[80vh]');
    expect(sheet.style.bottom).toContain('80px');
  });

  it('close 後に再度 isOpen=true で再オープンできる', async () => {
    const { rerender } = render(<BottomSheet {...makeProps()} />);
    await flushAsync();
    rerender(<BottomSheet {...makeProps({ isOpen: false })} />);
    await flushAsync();
    expect(screen.queryByRole('dialog')).toBeNull();
    // 再オープン
    rerender(<BottomSheet {...makeProps()} />);
    await flushAsync();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('onCloseAnimationComplete が無くても close できる', async () => {
    const { rerender } = render(
      <BottomSheet {...makeProps({ onCloseAnimationComplete: undefined })} />
    );
    await flushAsync();
    rerender(
      <BottomSheet
        {...makeProps({ isOpen: false, onCloseAnimationComplete: undefined })}
      />
    );
    await flushAsync();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('URL が同じなら onClose を呼ばない', async () => {
    const onClose = vi.fn();
    const { rerender } = render(<BottomSheet {...makeProps({ onClose })} />);
    await flushAsync();
    // 新しい onClose を渡して effect (pathname watcher) を再実行させる
    rerender(<BottomSheet {...makeProps()} />);
    await flushAsync();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Escape 以外のキーでは onClose を呼ばない', async () => {
    const onClose = vi.fn();
    render(<BottomSheet {...makeProps({ onClose })} />);
    await flushAsync();
    fireEvent.keyDown(window, { key: 'Enter' });
    fireEvent.keyDown(window, { key: 'a' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('sheet に tabindex が既にあれば付与しない', async () => {
    render(<BottomSheet {...makeProps()} />);
    // mount 直後 (rAF 前) に tabindex を付与しておく → フォーカス管理は既存 tabindex を使う
    const sheet = screen.getByRole('dialog');
    sheet.setAttribute('tabindex', '-1');
    await flushAsync();
    // 上書きでなく既存のまま
    expect(sheet.getAttribute('tabindex')).toBe('-1');
  });

  it('reduced-motion の close は 120ms で実行する', async () => {
    mm = stubMatchMedia(true);
    const { rerender } = render(<BottomSheet {...makeProps()} />);
    await flushAsync();
    rerender(<BottomSheet {...makeProps({ isOpen: false })} />);
    await flushAsync();
    expect(
      animateMock.mock.calls.some(
        ([, params]) =>
          Array.isArray(params.translateY) && params.translateY[1] === '100%' && params.duration === 120
      )
    ).toBe(true);
  });

  it('ドラッグ開始前の pointerMove / pointerUp は無視される', async () => {
    const onClose = vi.fn();
    const { container } = render(<BottomSheet {...makeProps({ onClose })} />);
    await flushAsync();
    const grabber = container.querySelector('.cursor-grab') as HTMLElement;
    // drag 開始前に move / up を発火 → 何も起きない
    fireEvent.pointerMove(grabber, { pointerId: 9, clientY: 300 });
    fireEvent.pointerUp(grabber, { pointerId: 9, clientY: 300 });
    expect(onClose).not.toHaveBeenCalled();
    const sheet = container.querySelector('[role="dialog"]') as HTMLElement;
    // 初期位置 (translateY(100%)) のまま変わらない
    expect(sheet.style.transform).toBe('translateY(100%)');
  });

  it('ドラッグ中は rAF throttle で inline transform を書き換える', async () => {
    const { container } = render(<BottomSheet {...makeProps()} />);
    await flushAsync();
    const grabber = container.querySelector('.cursor-grab') as HTMLElement;
    const sheet = container.querySelector('[role="dialog"]') as HTMLElement;
    fireEvent.pointerDown(grabber, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(grabber, { pointerId: 1, clientY: 130 });
    fireEvent.pointerMove(grabber, { pointerId: 1, clientY: 160 });
    await flushAsync();
    expect(sheet.style.transform).toContain('translateY(60px)');
    // 60px = 閾値ちょうど → close
    fireEvent.pointerUp(grabber, { pointerId: 1, clientY: 160 });
  });

  it('pointerDown だけで pointerUp が無くても次の drag は動く', async () => {
    const { container } = render(<BottomSheet {...makeProps()} />);
    await flushAsync();
    const grabber = container.querySelector('.cursor-grab') as HTMLElement;
    fireEvent.pointerDown(grabber, { pointerId: 1, clientY: 100 });
    fireEvent.pointerDown(grabber, { pointerId: 2, clientY: 50 });
    fireEvent.pointerMove(grabber, { pointerId: 2, clientY: 10 });
    fireEvent.pointerUp(grabber, { pointerId: 2, clientY: 10 });
  });

  it('unmount 時に rAF が残っていても安全に破棄できる', async () => {
    const { unmount, container } = render(<BottomSheet {...makeProps()} />);
    await flushAsync();
    const grabber = container.querySelector('.cursor-grab') as HTMLElement;
    fireEvent.pointerDown(grabber, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(grabber, { pointerId: 1, clientY: 200 });
    unmount();
    await flushAsync();
  });

  it('閾値未満ドラッグの transitionend で inline style を掃除する', async () => {
    const { container } = render(<BottomSheet {...makeProps()} />);
    await flushAsync();
    const grabber = container.querySelector('.cursor-grab') as HTMLElement;
    const sheet = container.querySelector('[role="dialog"]') as HTMLElement;
    fireEvent.pointerDown(grabber, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(grabber, { pointerId: 1, clientY: 120 });
    fireEvent.pointerUp(grabber, { pointerId: 1, clientY: 120 });
    // transitionend 発火 → inline style が消える
    fireEvent.transitionEnd(sheet);
    expect(sheet.style.transform).toBe('');
    expect(sheet.style.transition).toBe('');
  });

  it('open アニメ中に unmount されると cancelled で安全に中断する', async () => {
    // await import('animejs') の解決前に unmount → cleanup で cancelled=true
    const { unmount } = render(<BottomSheet {...makeProps()} />);
    unmount();
    await flushAsync();
    expect(animateMock).not.toHaveBeenCalled();
  });

  it('close 遷移直後に unmount すると import 後の cancelled チェックで中断する', async () => {
    const { rerender, unmount } = render(<BottomSheet {...makeProps()} />);
    await flushAsync();
    // close IIFE が await import で中断している間に unmount → cancelled=true
    rerender(<BottomSheet {...makeProps({ isOpen: false })} />);
    unmount();
    await flushAsync();
    // animate は open 分のみ (close アニメは発火しない)
    expect(animateMock.mock.calls.length).toBe(2);
  });

  it('close アニメ完了前に unmount すると cancelled で完了処理をスキップする', async () => {
    // close アニメの Promise を手動制御して、完了前に unmount させる
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    animateMock.mockImplementation(() => pending);

    const { rerender, unmount } = render(<BottomSheet {...makeProps()} />);
    await flushAsync();
    rerender(<BottomSheet {...makeProps({ isOpen: false })} />);
    // close アニメが Promise.all (pending) で停止するまで進める
    await flushAsync();
    unmount(); // cleanup → cancelled = true
    release?.();
    await flushAsync();
    // cancelled のため setShouldMount(false) / onCloseAnimationComplete は走らない
    expect(animateMock).toHaveBeenCalled();
    // 後続テスト用にデフォルト実装へ戻す
    animateMock.mockImplementation(() => Promise.resolve());
  });
});
