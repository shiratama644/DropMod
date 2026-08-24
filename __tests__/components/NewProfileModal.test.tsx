/**
 * NewProfileModal component test (Sub-Phase 9-C.4)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewProfileModal } from '@/components/NewProfileModal';

const mcVersions = ['1.21.4', '1.20.1'];

describe('NewProfileModal', () => {
  it('isOpen=false なら描画しない', () => {
    const { container } = render(
      <NewProfileModal
        isOpen={false}
        onClose={() => {}}
        mcVersions={mcVersions}
        onCreate={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('isOpen=true なら role=dialog + タイトル', () => {
    render(
      <NewProfileModal
        isOpen
        onClose={() => {}}
        mcVersions={mcVersions}
        onCreate={() => {}}
      />
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('新規プロファイル作成')).toBeInTheDocument();
  });

  it('フォルダ選択・MC/ローダー/ローダーバージョンの UI がある', () => {
    render(
      <NewProfileModal
        isOpen
        onClose={() => {}}
        mcVersions={mcVersions}
        onCreate={() => {}}
      />
    );
    expect(screen.getByText(/Minecraft フォルダ/)).toBeInTheDocument();
    expect(screen.getByLabelText('Minecraftバージョン')).toBeInTheDocument();
    expect(screen.getByLabelText('Modローダー')).toBeInTheDocument();
    expect(screen.getByLabelText('ローダーバージョン')).toBeInTheDocument();
  });

  it('initialImportData がある場合は「ZIPから」ヘッダを表示', () => {
    render(
      <NewProfileModal
        isOpen
        onClose={() => {}}
        mcVersions={mcVersions}
        initialImportData={{
          name: 'MyImport',
          mods: [
            { id: 'a', title: 'A', description: '' },
            { id: 'b', title: 'B', description: '' }
          ]
        }}
        onCreate={() => {}}
      />
    );
    expect(screen.getByText('ZIPからプロファイル作成')).toBeInTheDocument();
    expect(screen.getByText(/2 個/)).toBeInTheDocument();
    // 名前フィールドに MyImport が pre-fill されている
    const nameInput = screen.getByPlaceholderText(/最新 1\.21\.4/) as HTMLInputElement;
    expect(nameInput.value).toBe('MyImport');
  });

  it('名前を入力して作成ボタン → onCreate に (trimmedName, mcVer, loader, desc, mods) が渡る', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const onClose = vi.fn();
    render(
      <NewProfileModal
        isOpen
        onClose={onClose}
        mcVersions={mcVersions}
        onCreate={onCreate}
      />
    );
    const nameInput = screen.getByPlaceholderText(/最新 1\.21\.4/);
    await user.type(nameInput, '  MyPack  ');

    const submit = screen.getByRole('button', { name: '作成する' });
    await user.click(submit);

    expect(onCreate).toHaveBeenCalledTimes(1);
    const [name, mcVer, loader, desc, mods] = onCreate.mock.calls[0]!;
    expect(name).toBe('MyPack'); // trim される
    expect(mcVer).toBe('1.21.4');
    expect(loader).toBe('Fabric');
    expect(desc).toBe('');
    expect(mods).toEqual([]);
    // 作成後 close される
    expect(onClose).toHaveBeenCalled();
  });

  it('空 name (空白のみ) の送信は onCreate を呼ばない', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const onClose = vi.fn();
    render(
      <NewProfileModal
        isOpen
        onClose={onClose}
        mcVersions={mcVersions}
        onCreate={onCreate}
      />
    );
    // 半角スペースを input に入れて要素 required を回避
    const nameInput = screen.getByPlaceholderText(/最新 1\.21\.4/);
    await user.type(nameInput, '   ');
    // Enter で submit
    await user.keyboard('{Enter}');

    // trim 空なので onCreate は呼ばれない
    expect(onCreate).not.toHaveBeenCalled();
    // モーダルも閉じない
    expect(onClose).not.toHaveBeenCalled();
  });

  it('キャンセルボタンで onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <NewProfileModal
        isOpen
        onClose={onClose}
        mcVersions={mcVersions}
        onCreate={() => {}}
      />
    );
    await user.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('閉じる (X) ボタンで onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <NewProfileModal
        isOpen
        onClose={onClose}
        mcVersions={mcVersions}
        onCreate={() => {}}
      />
    );
    await user.click(screen.getByRole('button', { name: '閉じる' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape キーで onClose (useModalA11y)', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <NewProfileModal
        isOpen
        onClose={onClose}
        mcVersions={mcVersions}
        onCreate={() => {}}
      />
    );
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('source=duplicate なら複製タイトルと名前 (1) を出す', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <NewProfileModal
        isOpen
        onClose={() => {}}
        mcVersions={mcVersions}
        initialImportData={{
          name: '軽量化 (1)',
          mods: [{ id: 'a', title: 'A', description: '' }],
          source: 'duplicate',
          description: '元の説明'
        }}
        onCreate={onCreate}
      />
    );
    expect(screen.getByText('プロファイルを複製')).toBeInTheDocument();
    expect(screen.queryByText('ZIPからプロファイル作成')).not.toBeInTheDocument();
    const nameInput = screen.getByPlaceholderText(/最新 1\.21\.4/) as HTMLInputElement;
    expect(nameInput.value).toBe('軽量化 (1)');
    await user.click(screen.getByRole('button', { name: '複製する' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0]![0]).toBe('軽量化 (1)');
    expect(onCreate.mock.calls[0]![3]).toBe('元の説明');
  });

  it('initialImportData の mods は onCreate に渡される', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const initialMods = [
      { id: 'a', title: 'A', description: '' },
      { id: 'b', title: 'B', description: '' }
    ];
    render(
      <NewProfileModal
        isOpen
        onClose={() => {}}
        mcVersions={mcVersions}
        initialImportData={{ name: 'Pack', mods: initialMods }}
        onCreate={onCreate}
      />
    );
    // ready-to-submit: 名前は pre-fill、直接 submit
    await user.click(screen.getByRole('button', { name: '作成する' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0]![4]).toBe(initialMods);
  });
});
