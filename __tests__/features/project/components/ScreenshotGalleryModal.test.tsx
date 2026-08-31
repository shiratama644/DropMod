/**
 * features/project/components/ScreenshotGalleryModal.tsx tests (COV-3)
 *
 * 縦横比プローブ (new window.Image()) は jsdom では自然発火しないため、
 * MockImage で差し替えて onload / onerror をテストから発火させる。
 * 対象: initialIndex 正規化 / スワイプ / キーボード / 背景クリック /
 * アスペクト比固定 / サムネイル / 空配列 / body スクロールロック。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScreenshotGalleryModal } from '@/features/project/components/ScreenshotGalleryModal';
import type { ModrinthGalleryImage } from '@/types';

const images: ModrinthGalleryImage[] = [
  { url: 'https://example.com/a.png', title: 'Alpha' },
  { url: 'https://example.com/b.gif', title: 'Bravo' }
];

/** 縦横比プローブ用の window.Image モック (onload/onerror はテストから発火) */
class MockImage {
  static instances: MockImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalHeight = 0;
  naturalWidth = 0;
  src = '';
  constructor() {
    MockImage.instances.push(this);
  }
}

function fireLoad(i: number, naturalHeight: number, naturalWidth: number) {
  const img = MockImage.instances[i];
  if (!img) throw new Error(`MockImage[${i}] がありません (instances=${MockImage.instances.length})`);
  img.naturalHeight = naturalHeight;
  img.naturalWidth = naturalWidth;
  act(() => {
    img.onload?.();
  });
}

function fireError(i: number) {
  const img = MockImage.instances[i];
  if (!img) throw new Error(`MockImage[${i}] がありません (instances=${MockImage.instances.length})`);
  act(() => {
    img.onerror?.();
  });
}

/** createPortal で document.body 直下に描画されるため body から探す */
function imageArea() {
  return document.body.querySelector('.touch-pan-y') as HTMLElement;
}

describe('ScreenshotGalleryModal', () => {
  beforeEach(() => {
    MockImage.instances = [];
    vi.stubGlobal('Image', MockImage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('isOpen=false なら何も描画しない', () => {
    render(
      <ScreenshotGalleryModal isOpen={false} images={images} onClose={vi.fn()} />
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('開くと拡大ビューと件数が表示される', () => {
    render(<ScreenshotGalleryModal isOpen images={images} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('ギャラリー・スクリーンショット')).toBeInTheDocument();
    expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument();
    expect(screen.getByAltText('Alpha')).toBeInTheDocument();
  });

  it('次へで 2 枚目に進む', async () => {
    const user = userEvent.setup();
    render(<ScreenshotGalleryModal isOpen images={images} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '次の画像' }));
    expect(screen.getByAltText('Bravo')).toBeInTheDocument();
    expect(screen.getByText(/2 \/ 2/)).toBeInTheDocument();
  });

  it('前の画像ボタンで 1 枚目に戻る', async () => {
    const user = userEvent.setup();
    render(<ScreenshotGalleryModal isOpen images={images} initialIndex={1} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '前の画像' }));
    expect(screen.getByAltText('Alpha')).toBeInTheDocument();
    expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument();
  });

  it('閉じるボタンで onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ScreenshotGalleryModal isOpen images={images} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'ギャラリーを閉じる' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape で onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ScreenshotGalleryModal isOpen images={images} onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('initialIndex で初期表示位置を指定できる', () => {
    render(<ScreenshotGalleryModal isOpen images={images} initialIndex={1} onClose={vi.fn()} />);
    expect(screen.getByAltText('Bravo')).toBeInTheDocument();
    expect(screen.getByText(/2 \/ 2/)).toBeInTheDocument();
  });

  it('initialIndex が非有限 (NaN) なら 0 に正規化する', () => {
    render(<ScreenshotGalleryModal isOpen images={images} initialIndex={Number.NaN} onClose={vi.fn()} />);
    expect(screen.getByAltText('Alpha')).toBeInTheDocument();
    expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument();
  });

  it('initialIndex が範囲外なら clamp する', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <ScreenshotGalleryModal isOpen images={images} initialIndex={99} onClose={onClose} />
    );
    expect(screen.getByText(/2 \/ 2/)).toBeInTheDocument();
    rerender(<ScreenshotGalleryModal isOpen images={images} initialIndex={-3} onClose={onClose} />);
    expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument();
  });

  it('ArrowLeft / ArrowRight で前後に移動する', () => {
    render(<ScreenshotGalleryModal isOpen images={images} initialIndex={1} onClose={vi.fn()} />);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByAltText('Alpha')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByAltText('Bravo')).toBeInTheDocument();
  });

  it('背景クリックで onClose', () => {
    const onClose = vi.fn();
    render(<ScreenshotGalleryModal isOpen images={images} onClose={onClose} />);
    const overlay = document.body.querySelector('.modal-overlay') as HTMLElement;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('モーダル内部のクリックでは閉じない', () => {
    const onClose = vi.fn();
    render(<ScreenshotGalleryModal isOpen images={images} onClose={onClose} />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('右スワイプ (左へドラッグ) で前の画像へ', () => {
    render(<ScreenshotGalleryModal isOpen images={images} initialIndex={1} onClose={vi.fn()} />);
    const area = imageArea();
    fireEvent.pointerDown(area, { clientX: 300 });
    fireEvent.pointerUp(area, { clientX: 100 });
    expect(screen.getByAltText('Alpha')).toBeInTheDocument();
  });

  it('左スワイプ (右へドラッグ) で次の画像へ', () => {
    render(<ScreenshotGalleryModal isOpen images={images} onClose={vi.fn()} />);
    const area = imageArea();
    fireEvent.pointerDown(area, { clientX: 100 });
    fireEvent.pointerUp(area, { clientX: 350 });
    expect(screen.getByAltText('Bravo')).toBeInTheDocument();
  });

  it('閾値未満のタップでは移動しない', () => {
    render(<ScreenshotGalleryModal isOpen images={images} onClose={vi.fn()} />);
    const area = imageArea();
    fireEvent.pointerDown(area, { clientX: 200 });
    fireEvent.pointerUp(area, { clientX: 230 });
    expect(screen.getByAltText('Alpha')).toBeInTheDocument();
    expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument();
  });

  it('pointerUp だけでは何も起きない', () => {
    render(<ScreenshotGalleryModal isOpen images={images} onClose={vi.fn()} />);
    const area = imageArea();
    fireEvent.pointerUp(area, { clientX: 400 });
    expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument();
  });

  it('pointerCancel でスワイプ開始位置がリセットされる', () => {
    render(<ScreenshotGalleryModal isOpen images={images} onClose={vi.fn()} />);
    const area = imageArea();
    fireEvent.pointerDown(area, { clientX: 200 });
    fireEvent.pointerCancel(area);
    fireEvent.pointerUp(area, { clientX: 400 });
    expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument();
  });

  it('最も縦長な画像のアスペクト比で画像領域の高さを固定する', () => {
    render(<ScreenshotGalleryModal isOpen images={images} onClose={vi.fn()} />);
    fireLoad(0, 300, 200); // ratio 1.5
    fireLoad(1, 200, 200); // ratio 1.0 → max 1.5
    const area = imageArea();
    expect(area.style.aspectRatio).toBe('1 / 1.5');
    expect(area.style.height).toBe('');
  });

  it('全画像の読み込みが 0 サイズなら maxRatio は null のまま', () => {
    render(<ScreenshotGalleryModal isOpen images={images} onClose={vi.fn()} />);
    fireLoad(0, 0, 100);
    fireLoad(1, 0, 100);
    const area = imageArea();
    expect(area.style.aspectRatio).toBe('');
    expect(area.style.height).toBe('min(60vh, 42rem)');
  });

  it('一部の読み込み失敗 (onerror) でも他画像の ratio を使う', () => {
    render(<ScreenshotGalleryModal isOpen images={images} onClose={vi.fn()} />);
    fireError(0);
    fireLoad(1, 300, 100); // ratio 3.0
    const area = imageArea();
    expect(area.style.aspectRatio).toBe('1 / 3');
  });

  it('最後の画像が onerror でも先行 onload の ratio を使う', () => {
    render(<ScreenshotGalleryModal isOpen images={images} onClose={vi.fn()} />);
    fireLoad(0, 300, 200); // ratio 1.5
    fireError(1); // pending → 0
    const area = imageArea();
    expect(area.style.aspectRatio).toBe('1 / 1.5');
  });

  it('全画像が onerror なら maxRatio は null のまま', () => {
    render(<ScreenshotGalleryModal isOpen images={images} onClose={vi.fn()} />);
    fireError(0);
    fireError(1);
    const area = imageArea();
    expect(area.style.aspectRatio).toBe('');
    expect(area.style.height).toBe('min(60vh, 42rem)');
  });

  it('unmount 後の onload / onerror は無視される', () => {
    const { unmount } = render(
      <ScreenshotGalleryModal isOpen images={images} onClose={vi.fn()} />
    );
    unmount();
    // cancelled=true のため setMaxRatio は走らない
    act(() => {
      MockImage.instances[0]?.onload?.();
      MockImage.instances[1]?.onerror?.();
    });
    expect(document.body.querySelector('.touch-pan-y')).toBeNull();
  });

  it('空の images ならプレースホルダーを表示する', () => {
    render(<ScreenshotGalleryModal isOpen images={[]} onClose={vi.fn()} />);
    expect(screen.getByText('表示できる画像がありません')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '次の画像' })).toBeNull();
  });

  it('空の images でもキーボード操作は安全', () => {
    render(<ScreenshotGalleryModal isOpen images={[]} onClose={vi.fn()} />);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('表示できる画像がありません')).toBeInTheDocument();
  });

  it('raw_url があればそれを使い、title が無ければ代替テキスト', () => {
    const withMeta: ModrinthGalleryImage[] = [
      {
        url: 'https://example.com/a.png',
        raw_url: 'https://cdn.example.com/raw/a.png',
        title: 'Alpha'
      },
      { url: 'https://example.com/b.gif' }
    ];
    render(<ScreenshotGalleryModal isOpen images={withMeta} onClose={vi.fn()} />);
    expect(screen.getByAltText('Alpha')).toBeInTheDocument();
    // title 無し画像 → 代替テキスト
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByAltText('ギャラリー画像')).toBeInTheDocument();
  });

  it('description があれば表示される', () => {
    const withDesc: ModrinthGalleryImage[] = [
      { url: 'https://example.com/a.png', title: 'Alpha', description: '説明文です' }
    ];
    render(<ScreenshotGalleryModal isOpen images={withDesc} onClose={vi.fn()} />);
    expect(screen.getByText('説明文です')).toBeInTheDocument();
  });

  it('サムネイルクリックでその画像に移動する', async () => {
    const user = userEvent.setup();
    render(<ScreenshotGalleryModal isOpen images={images} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Bravo 2 を表示' }));
    expect(screen.getByAltText('Bravo')).toBeInTheDocument();
    expect(screen.getByText(/2 \/ 2/)).toBeInTheDocument();
  });

  it('title が無い画像のサムネイルは「画像 N を表示」', () => {
    const withMeta: ModrinthGalleryImage[] = [
      { url: 'https://example.com/a.png', title: 'Alpha' },
      { url: 'https://example.com/b.gif' }
    ];
    render(<ScreenshotGalleryModal isOpen images={withMeta} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: '画像 2 を表示' })).toBeInTheDocument();
  });

  it('画像が 1 枚なら前後ボタンとサムネイルを表示しない', () => {
    render(<ScreenshotGalleryModal isOpen images={[images[0]!]} onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: '前の画像' })).toBeNull();
    expect(screen.queryByRole('button', { name: '次の画像' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Alpha 1 を表示' })).toBeNull();
  });

  it('open 中は body スクロールをロックし、close で復元する', () => {
    const { rerender } = render(
      <ScreenshotGalleryModal isOpen images={images} onClose={vi.fn()} />
    );
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.style.touchAction).toBe('none');
    rerender(<ScreenshotGalleryModal isOpen={false} images={images} onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe('');
    expect(document.body.style.touchAction).toBe('');
  });
});
