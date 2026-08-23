import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScreenshotGalleryModal } from '@/components/ScreenshotGalleryModal';
import type { ModrinthGalleryImage } from '@/types';

const images: ModrinthGalleryImage[] = [
  { url: 'https://example.com/a.png', title: 'Alpha' },
  { url: 'https://example.com/b.gif', title: 'Bravo' }
];

describe('ScreenshotGalleryModal', () => {
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
});
