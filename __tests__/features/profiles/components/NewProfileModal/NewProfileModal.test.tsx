/**
 * NewProfileModal component test (Sub-Phase 9-C.4 / COV-3)
 *
 * フォルダ解析フローは FolderImport.test.tsx が実物 (fakeFs + msw) で
 * 検証しているため、ここでは env-import / capabilities /
 * useLoaderVersionOptions をモックしてエッジケース (非対応ブラウザ・
 * キャンセル・解析失敗・環境欠落・analyzing 中の submit 等) を叩く。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { StrictMode } from 'react';
import userEvent from '@testing-library/user-event';
import { NewProfileModal } from '@/features/profiles/components/NewProfileModal';
import type { ImportAnalysis, PickedDirectory } from '@/features/env-import';
import type { ProjectItem } from '@/types';

const {
  pickDirectoryMock,
  analyzeSourceMock,
  generateProfileNameMock,
  supportsPickerMock,
  useLoaderVersionOptionsMock
} = vi.hoisted(() => ({
  pickDirectoryMock: vi.fn(),
  analyzeSourceMock: vi.fn(),
  generateProfileNameMock: vi.fn(),
  supportsPickerMock: vi.fn(() => false),
  useLoaderVersionOptionsMock: vi.fn()
}));

vi.mock('@/lib/env/capabilities', () => ({
  supportsDirectoryPicker: supportsPickerMock
}));

vi.mock('@/features/env-import', async () => {
  const actual =
    await vi.importActual<typeof import('@/features/env-import')>('@/features/env-import');
  return {
    ...actual,
    pickMinecraftDirectory: pickDirectoryMock,
    analyzeEnvironmentSource: analyzeSourceMock,
    generateProfileName: generateProfileNameMock
  };
});

vi.mock('@/features/profiles/hooks/useLoaderVersionOptions', () => ({
  useLoaderVersionOptions: useLoaderVersionOptionsMock
}));

const mcVersions = ['1.21.4', '1.20.1'];

function makeAnalysis(overrides: Partial<ImportAnalysis> = {}): ImportAnalysis {
  return {
    environment: {
      rootType: 'minecraft',
      mcVersion: '1.20.1',
      loader: 'Fabric',
      loaderVersion: '0.16.0',
      contentDirs: { mods: 'mods' }
    },
    sourceKind: 'filesystem',
    sourceName: 'MyFolder',
    mods: [],
    resourcepacks: [],
    shaderpacks: [],
    unknownFiles: [],
    scannedCounts: { mods: 0, resourcepacks: 0, shaderpacks: 0 },
    versionsByProject: new Map(),
    ...overrides
  };
}

function makePicked(): PickedDirectory {
  return {
    handle: {} as FileSystemDirectoryHandle,
    source: { rootName: 'MyFolder', kind: 'filesystem' } as unknown as PickedDirectory['source']
  };
}

describe('NewProfileModal', () => {
  beforeEach(() => {
    supportsPickerMock.mockReturnValue(false);
    pickDirectoryMock.mockReset();
    analyzeSourceMock.mockReset();
    generateProfileNameMock.mockReset();
    useLoaderVersionOptionsMock.mockReturnValue({
      versions: ['1.0.0'],
      options: [{ label: '1.0.0 (最新)', value: '1.0.0' }],
      isLoading: false
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
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
            { projectId: 'a', name: 'A', type: 'mod', description: '' },
            { projectId: 'b', name: 'B', type: 'mod', description: '' }
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
          mods: [{ projectId: 'a', name: 'A', type: 'mod', description: '' }],
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
    const initialMods: ProjectItem[] = [
      { projectId: 'a', name: 'A', type: 'mod', description: '' },
      { projectId: 'b', name: 'B', type: 'mod', description: '' }
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

  // ------------------------------------------------------------------
  // COV-3: エッジケース (フォルダ解析・環境欠落・analyzing 等)
  // ------------------------------------------------------------------

  it('StrictMode の effect 二重実行でも安全 (wasOpenRef ガード)', () => {
    // StrictMode では mount 時に effect が 2 回実行される → 2 回目は
    // wasOpenRef.current が true なので snapshot を再ロードしない
    render(
      <StrictMode>
        <NewProfileModal
          isOpen
          onClose={() => {}}
          mcVersions={mcVersions}
          initialImportData={{ name: 'X', mods: [] }}
          onCreate={() => {}}
        />
      </StrictMode>
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // クラッシュせず名前が pre-fill される
    const nameInput = screen.getByPlaceholderText(/最新 1\.21\.4/) as HTMLInputElement;
    expect(nameInput.value).toBe('X');
  });

  it('initialImportData.loaderVersion 一致で submit 後も状態が安定', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <NewProfileModal
        isOpen
        onClose={() => {}}
        mcVersions={mcVersions}
        initialImportData={{ name: 'X', mods: [], loaderVersion: '1.0.0' }}
        onCreate={onCreate}
      />
    );
    await user.type(screen.getByPlaceholderText(/最新 1\.21\.4/), 'X');
    await user.click(screen.getByRole('button', { name: '作成する' }));
    await act(async () => {});
    expect(onCreate.mock.calls[0]![5]).toBe('1.0.0');
  });

  it('mcVersions が空でも version は 1.21.4 フォールバック', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <NewProfileModal isOpen onClose={() => {}} mcVersions={[]} onCreate={onCreate} />
    );
    await user.type(screen.getByPlaceholderText(/最新 1\.21\.4/), 'Pack');
    await user.click(screen.getByRole('button', { name: '作成する' }));
    expect(onCreate.mock.calls[0]![1]).toBe('1.21.4');
  });

  it('mcVersions 空 + initialImportData.mcVersion でも安全 (version は既定のまま)', () => {
    render(
      <NewProfileModal
        isOpen
        onClose={() => {}}
        mcVersions={[]}
        initialImportData={{ name: 'X', mods: [], mcVersion: '1.20.1' }}
        onCreate={() => {}}
      />
    );
    // クラッシュせず表示される
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('initialImportData.loaderVersion が loader 一覧に一致すれば pre-fill される', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <NewProfileModal
        isOpen
        onClose={() => {}}
        mcVersions={mcVersions}
        initialImportData={{
          name: 'X',
          mods: [],
          loaderVersion: '1.0.0' // useLoaderVersionOptions の versions と一致
        }}
        onCreate={onCreate}
      />
    );
    // snapshot 反映 (setLoaderVersion) を act 内で flush してから submit
    await act(async () => {});
    await user.type(screen.getByPlaceholderText(/最新 1\.21\.4/), 'X');
    await user.click(screen.getByRole('button', { name: '作成する' }));
    expect(onCreate.mock.calls[0]![5]).toBe('1.0.0');
  });

  it('ローダー版一覧が空なら loaderVersion は未指定のまま submit される', async () => {
    useLoaderVersionOptionsMock.mockReturnValue({
      versions: [],
      options: [{ label: '未指定', value: '' }],
      isLoading: false
    });
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <NewProfileModal isOpen onClose={() => {}} mcVersions={mcVersions} onCreate={onCreate} />
    );
    await user.type(screen.getByPlaceholderText(/最新 1\.21\.4/), 'Pack');
    await user.click(screen.getByRole('button', { name: '作成する' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0]![5]).toBeUndefined(); // loaderVersion || undefined
  });

  it('フォルダ選択非対応ブラウザではエラーを表示する', async () => {
    // useState 初期化 (1) + open 時 effect (2) は true (ボタン有効)
    // → handlePickFolder 内 (3) で false (非対応)
    supportsPickerMock
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    const user = userEvent.setup();
    render(
      <NewProfileModal isOpen onClose={() => {}} mcVersions={mcVersions} onCreate={() => {}} />
    );
    await user.click(screen.getByRole('button', { name: /フォルダを選択/ }));
    expect(
      screen.getByText(/このブラウザではフォルダ選択できません/)
    ).toBeInTheDocument();
  });

  it('フォルダ選択をキャンセル (null) すると何も起きない', async () => {
    supportsPickerMock.mockReturnValue(true);
    pickDirectoryMock.mockResolvedValue(null as unknown as PickedDirectory);
    const user = userEvent.setup();
    render(
      <NewProfileModal isOpen onClose={() => {}} mcVersions={mcVersions} onCreate={() => {}} />
    );
    await user.click(screen.getByRole('button', { name: /フォルダを選択/ }));
    await waitFor(() => expect(pickDirectoryMock).toHaveBeenCalled());
    // フォルダ名表示は変わらない (未選択のまま)
    expect(screen.getByRole('button', { name: /フォルダを選択/ })).toBeInTheDocument();
  });

  it('フォルダ選択が Error を throw したら message を表示', async () => {
    supportsPickerMock.mockReturnValue(true);
    pickDirectoryMock.mockRejectedValue(new Error('denied by user'));
    const user = userEvent.setup();
    render(
      <NewProfileModal isOpen onClose={() => {}} mcVersions={mcVersions} onCreate={() => {}} />
    );
    await user.click(screen.getByRole('button', { name: /フォルダを選択/ }));
    expect(await screen.findByText('denied by user')).toBeInTheDocument();
  });

  it('フォルダ選択が非 Error を throw したら汎用エラーを表示', async () => {
    supportsPickerMock.mockReturnValue(true);
    pickDirectoryMock.mockRejectedValue('boom');
    const user = userEvent.setup();
    render(
      <NewProfileModal isOpen onClose={() => {}} mcVersions={mcVersions} onCreate={() => {}} />
    );
    await user.click(screen.getByRole('button', { name: /フォルダを選択/ }));
    expect(await screen.findByText('フォルダを開けませんでした。')).toBeInTheDocument();
  });

  it('フォルダ解析に失敗したらエラーを表示してフォームは維持される', async () => {
    supportsPickerMock.mockReturnValue(true);
    pickDirectoryMock.mockResolvedValue(makePicked());
    analyzeSourceMock.mockRejectedValue(new Error('parse error'));
    const user = userEvent.setup();
    render(
      <NewProfileModal isOpen onClose={() => {}} mcVersions={mcVersions} onCreate={() => {}} />
    );
    await user.click(screen.getByRole('button', { name: /フォルダを選択/ }));
    expect(
      await screen.findByText('解析に失敗しました: parse error')
    ).toBeInTheDocument();
  });

  it('フォルダ解析が非 Error を throw したら汎用エラーを表示', async () => {
    supportsPickerMock.mockReturnValue(true);
    pickDirectoryMock.mockResolvedValue(makePicked());
    analyzeSourceMock.mockRejectedValue('boom');
    const user = userEvent.setup();
    render(
      <NewProfileModal isOpen onClose={() => {}} mcVersions={mcVersions} onCreate={() => {}} />
    );
    await user.click(screen.getByRole('button', { name: /フォルダを選択/ }));
    expect(
      await screen.findByText('解析に失敗しました。')
    ).toBeInTheDocument();
  });

  it('フォルダ解析成功で名前・環境が自動入力され、作成で link が渡る', async () => {
    supportsPickerMock.mockReturnValue(true);
    pickDirectoryMock.mockResolvedValue(makePicked());
    analyzeSourceMock.mockResolvedValue(makeAnalysis());
    generateProfileNameMock.mockReturnValue('Generated Name');
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <NewProfileModal isOpen onClose={() => {}} mcVersions={mcVersions} onCreate={onCreate} />
    );
    await user.click(screen.getByRole('button', { name: /フォルダを選択/ }));
    await waitFor(() =>
      expect(screen.getByRole('status', { name: '解析結果' })).toBeInTheDocument()
    );
    const nameInput = screen.getByPlaceholderText(/最新 1\.21\.4/) as HTMLInputElement;
    expect(nameInput.value).toBe('Generated Name');
    expect(screen.getByText(/Minecraft 1\.20\.1 \/ Fabric \/ 0\.16\.0/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '作成する' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0]![1]).toBe('1.20.1');
    const link = onCreate.mock.calls[0]![7];
    expect(link?.detected.mcVersion).toBe('1.20.1');
  });

  it('解析結果の環境が欠落・不一致なら自動入力しない', async () => {
    supportsPickerMock.mockReturnValue(true);
    pickDirectoryMock.mockResolvedValue(makePicked());
    // mcVersion は mcVersions に無い・loader/loaderVersion は無し
    analyzeSourceMock.mockResolvedValue(
      makeAnalysis({
        environment: {
          rootType: 'minecraft',
          mcVersion: '9.9.9',
          contentDirs: { mods: 'mods' }
        }
      })
    );
    generateProfileNameMock.mockReturnValue('Gen');
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <NewProfileModal isOpen onClose={() => {}} mcVersions={mcVersions} onCreate={onCreate} />
    );
    await user.click(screen.getByRole('button', { name: /フォルダを選択/ }));
    await waitFor(() =>
      expect(screen.getByRole('status', { name: '解析結果' })).toBeInTheDocument()
    );
    await user.click(screen.getByRole('button', { name: '作成する' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0]![1]).toBe('1.21.4'); // mcVersion 不一致 → 既定
  });

  it('解析中は submit がブロックされ「解析中...」表示になる', async () => {
    supportsPickerMock.mockReturnValue(true);
    pickDirectoryMock.mockResolvedValue(makePicked());
    analyzeSourceMock.mockImplementation(async (_source, onProgress) => {
      onProgress?.({ phase: 'scan', done: 1, total: 3 });
      return new Promise<ImportAnalysis>(() => {}); // never resolve
    });
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <NewProfileModal isOpen onClose={() => {}} mcVersions={mcVersions} onCreate={onCreate} />
    );
    await user.click(screen.getByRole('button', { name: /フォルダを選択/ }));
    // 進捗表示 (走査 1/3)
    expect(await screen.findByText(/走査 \(1\/3\)/)).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: '解析中...' });
    expect(submit).toBeDisabled();
    await user.type(screen.getByPlaceholderText(/最新 1\.21\.4/), 'Pack');
    await user.keyboard('{Enter}');
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('解析中の進捗が未報告なら「準備中」と表示する', async () => {
    supportsPickerMock.mockReturnValue(true);
    pickDirectoryMock.mockResolvedValue(makePicked());
    analyzeSourceMock.mockReturnValue(new Promise<ImportAnalysis>(() => {})); // progress 未報告
    const user = userEvent.setup();
    render(
      <NewProfileModal isOpen onClose={() => {}} mcVersions={mcVersions} onCreate={() => {}} />
    );
    await user.click(screen.getByRole('button', { name: /フォルダを選択/ }));
    expect(await screen.findByText(/解析中\.\.\. 準備中/)).toBeInTheDocument();
  });

  it('進捗 total=1 なら件数サフィックスを付けない', async () => {
    supportsPickerMock.mockReturnValue(true);
    pickDirectoryMock.mockResolvedValue(makePicked());
    analyzeSourceMock.mockImplementation(async (_source, onProgress) => {
      onProgress?.({ phase: 'detect', done: 1, total: 1 });
      return new Promise<ImportAnalysis>(() => {});
    });
    const user = userEvent.setup();
    render(
      <NewProfileModal isOpen onClose={() => {}} mcVersions={mcVersions} onCreate={() => {}} />
    );
    await user.click(screen.getByRole('button', { name: /フォルダを選択/ }));
    // 「環境検出」ラベルが出るが (1/1) サフィックスは無い
    expect(await screen.findByText(/解析中\.\.\. 環境検出$/)).toBeInTheDocument();
  });

  it('onCreate が失敗したらモーダルは閉じず入力値を保持する', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    const onCreate = vi.fn().mockRejectedValue(new Error('db error'));
    const onClose = vi.fn();
    render(
      <NewProfileModal isOpen onClose={onClose} mcVersions={mcVersions} onCreate={onCreate} />
    );
    await user.type(screen.getByPlaceholderText(/最新 1\.21\.4/), 'Keep');
    await user.click(screen.getByRole('button', { name: '作成する' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    // モーダルは開いたまま
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('背景クリックで onClose / dialog 内クリックでは閉じない', () => {
    const onClose = vi.fn();
    render(
      <NewProfileModal isOpen onClose={onClose} mcVersions={mcVersions} onCreate={() => {}} />
    );
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(document.body.querySelector('.modal-overlay') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('モーダル背景の touchMove が安全に処理される', () => {
    render(
      <NewProfileModal isOpen onClose={() => {}} mcVersions={mcVersions} onCreate={() => {}} />
    );
    const overlayEl = document.body.querySelector('.modal-overlay') as HTMLElement;
    expect(overlayEl).not.toBeNull();
    // ハンドラ (onTouchMove) が発火してクラッシュしないことだけ検証する
    // (jsdom の fireEvent は preventDefault の反映を返さない)
    fireEvent.touchMove(overlayEl);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('duplicate で description が無ければ desc は空のまま', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <NewProfileModal
        isOpen
        onClose={() => {}}
        mcVersions={mcVersions}
        initialImportData={{
          name: 'Clone',
          mods: [{ projectId: 'a', name: 'A', type: 'mod', description: '' }],
          source: 'duplicate'
        }}
        onCreate={onCreate}
      />
    );
    await user.click(screen.getByRole('button', { name: '複製する' }));
    expect(onCreate.mock.calls[0]![3]).toBe('');
  });

  it('説明を入力すると onCreate に渡る', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <NewProfileModal isOpen onClose={() => {}} mcVersions={mcVersions} onCreate={onCreate} />
    );
    await user.type(screen.getByPlaceholderText(/最新 1\.21\.4/), 'Pack');
    await user.type(screen.getByPlaceholderText(/プロファイルの目的など/), '説明です');
    await user.click(screen.getByRole('button', { name: '作成する' }));
    expect(onCreate.mock.calls[0]![3]).toBe('説明です');
  });

  it('analysisIssues (warning/error + 詳細) と環境未検出を表示する', () => {
    render(
      <NewProfileModal
        isOpen
        onClose={() => {}}
        mcVersions={mcVersions}
        initialImportData={{
          name: 'X',
          mods: [],
          analysisIssues: [
            { id: 'unknown-files', status: 'warning', message: '警告です', details: ['detail-1'] },
            { id: 'conflict', status: 'error', message: 'エラーです', details: [] }
          ]
        }}
        onCreate={() => {}}
      />
    );
    // 環境情報なし → 未検出メッセージ
    expect(screen.getByText(/未検出/)).toBeInTheDocument();
    expect(screen.getByText('警告です')).toBeInTheDocument();
    expect(screen.getByText('エラーです')).toBeInTheDocument();
    // 詳細を開く
    fireEvent.click(screen.getByText(/詳細 \(1\)/));
    expect(screen.getByText('detail-1')).toBeInTheDocument();
    // unknownFiles なし → 未識別サフィックスは表示されない
    expect(screen.getByText(/0 個のMod \/ 0 個のリソースパック \/ 0 個のシェーダー/)).toBeInTheDocument();
  });
});
