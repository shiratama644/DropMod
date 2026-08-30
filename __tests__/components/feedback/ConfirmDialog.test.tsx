/**
 * ConfirmDialog component test (Sub-Phase 9-C.4)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';

describe('ConfirmDialog', () => {
  it('isOpen=false なら何も描画しない', () => {
    const { container } = render(
      <ConfirmDialog
        isOpen={false}
        title="Del"
        message="Are you sure?"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('isOpen=true なら role=alertdialog / title / message が表示される', () => {
    render(
      <ConfirmDialog
        isOpen
        title="Delete profile"
        message="This cannot be undone."
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Delete profile')).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
  });

  it('デフォルトの確認ラベル / キャンセルラベル', () => {
    render(
      <ConfirmDialog
        isOpen
        title="T"
        message="M"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'キャンセル' })).toBeInTheDocument();
  });

  it('カスタムラベルを表示', () => {
    render(
      <ConfirmDialog
        isOpen
        title="T"
        message="M"
        confirmLabel="削除する"
        cancelLabel="やめる"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: '削除する' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'やめる' })).toBeInTheDocument();
  });

  it('OK ボタンで onConfirm が呼ばれる', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        isOpen
        title="T"
        message="M"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('キャンセルボタンで onCancel が呼ばれる', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        isOpen
        title="T"
        message="M"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    await user.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('背景クリック (overlay) で onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        isOpen
        title="T"
        message="M"
        onConfirm={() => {}}
        onCancel={onCancel}
      />
    );
    // overlay は dialog の親要素
    const dialog = screen.getByRole('alertdialog');
    const overlay = dialog.parentElement!;
    await user.click(overlay);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('ダイアログ内部クリックは onCancel を発火しない', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        isOpen
        title="T"
        message="Inner"
        onConfirm={() => {}}
        onCancel={onCancel}
      />
    );
    await user.click(screen.getByText('Inner'));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('Escape キーで onCancel (useModalA11y)', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        isOpen
        title="T"
        message="M"
        onConfirm={() => {}}
        onCancel={onCancel}
      />
    );
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('danger=true は「危険な操作」用スタイル & 三角アイコン', () => {
    const { container } = render(
      <ConfirmDialog
        isOpen
        title="Danger!"
        message="M"
        danger
        confirmLabel="削除"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    const confirmBtn = screen.getByRole('button', { name: '削除' });
    // 危険用の red 系 class が入っていること
    expect(confirmBtn.className).toMatch(/bg-red-500/);
    // triangle-exclamation アイコンが使われている
    const triangleIcon = container.querySelector('.fa-triangle-exclamation');
    expect(triangleIcon).not.toBeNull();
  });
});
