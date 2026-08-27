/**
 * useZipImport integration test (Sub-Phase 9-C.3)
 *
 * - JSZip 実物を使って .mrpack / .jar-zip を組み立て、handleImportZipFile に流す
 * - msw で /version_files と /projects を mock
 * - useZipImportStore の pendingImportData 更新を検証
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import JSZip from 'jszip';
import { useZipImport } from '@/hooks/useZipImport';
import { useZipImportStore } from '@/lib/store/zipImport';
import { clearApiCache } from '@/lib/modrinth/client';
import { calculateSha1 } from '@/lib/utils/hash';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import type { Profile } from '@/types';

// ------------------ Fixture helpers ------------------

function makeMrpackZip(dependencies: Record<string, string>, name = 'Test Pack'): Promise<File> {
  const zip = new JSZip();
  zip.file(
    'modrinth.index.json',
    JSON.stringify({
      formatVersion: 1,
      game: 'minecraft',
      versionId: '1.0',
      name,
      files: [
        {
          path: 'mods/example-1.0.jar',
          hashes: { sha1: 'x', sha512: 'y' },
          downloads: ['https://cdn.modrinth.com/data/example.jar']
        }
      ],
      dependencies
    })
  );
  return zip.generateAsync({ type: 'blob' }).then(
    (blob) => new File([blob], 'pack.mrpack', { type: 'application/zip' })
  );
}

async function makeJarZip(jarContents: Record<string, string>): Promise<File> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(jarContents)) {
    zip.file(name, content);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  return new File([blob], 'mods.zip', { type: 'application/zip' });
}

async function makeEmptyZip(): Promise<File> {
  const zip = new JSZip();
  zip.file('readme.txt', 'no jars here');
  const blob = await zip.generateAsync({ type: 'blob' });
  return new File([blob], 'empty.zip', { type: 'application/zip' });
}

// ------------------ Hook harness ------------------

// vitest 4 は vi.fn() を constructor 呼び出し可能な型で返すため、
// 特定シグネチャの引数へ渡す mock は明示的にジェネリクスで型付けする
// (vitest 3 時代の ReturnType<typeof vi.fn> は (x: T) => void 系と非互換)。
// setProfiles は呼び出し側で as unknown as React.Dispatch に cast するため
// 緩い型のまま (mock.calls の中身を any 扱いで検証するテスト本体があるため)。
interface Harness {
  setProfiles: ReturnType<typeof vi.fn>;
  setCurrentProfileId: Mock<(id: string) => void>;
  setIsNewProfileModalOpen: Mock<(open: boolean) => void>;
  showToast: Mock<
    (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  >;
}

function makeHarness(): Harness {
  return {
    setProfiles: vi.fn(),
    setCurrentProfileId: vi.fn<(id: string) => void>(),
    setIsNewProfileModalOpen: vi.fn<(open: boolean) => void>(),
    showToast: vi.fn<
      (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void
    >()
  };
}

describe('useZipImport', () => {
  beforeEach(() => {
    useZipImportStore.getState().clearPendingImportData();
    clearApiCache();
  });

  it('.mrpack ファイルを import すると新しい profile を setProfiles に追加する (Fabric)', async () => {
    const h = makeHarness();
    const { result } = renderHook(() =>
      useZipImport(
        h.setProfiles as unknown as React.Dispatch<React.SetStateAction<Profile[]>>,
        h.setCurrentProfileId,
        h.setIsNewProfileModalOpen,
        h.showToast
      )
    );
    const file = await makeMrpackZip({ minecraft: '1.20.1', 'fabric-loader': '0.15' });

    await act(async () => {
      const fakeEvent = {
        target: { files: [file], value: '' }
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      await result.current.handleImportZipInput(fakeEvent);
      // handleImportZipFile は fire-and-forget: マイクロタスク完了を待つ
      await new Promise((r) => setTimeout(r, 100));
    });

    expect(h.setProfiles).toHaveBeenCalled();
    expect(h.setCurrentProfileId).toHaveBeenCalled();
    // モーダルは開かない (.mrpack はダイレクト作成)
    expect(h.setIsNewProfileModalOpen).not.toHaveBeenCalled();
    // profile 呼び出しの中身を検証
    const call = h.setProfiles.mock.calls[0]?.[0];
    const nextProfiles = typeof call === 'function' ? call([]) : call;
    expect(nextProfiles).toHaveLength(1);
    expect(nextProfiles[0].environment.mcVersion).toBe('1.20.1');
    expect(nextProfiles[0].environment.loader).toBe('Fabric');
    expect(nextProfiles[0].mods).toHaveLength(1);
    expect(nextProfiles[0].mods[0].filename).toBe('example-1.0.jar');
    // SHA-1 照合で Modrinth project id が付く (ランダム id だと詳細/依存チェックが壊れる)
    expect(nextProfiles[0].mods[0].projectId).toBe('proj-x');
  });

  it('.mrpack の dependencies を loader ラベル (NeoForge) に対応付ける', async () => {
    const h = makeHarness();
    const { result } = renderHook(() =>
      useZipImport(
        h.setProfiles as unknown as React.Dispatch<React.SetStateAction<Profile[]>>,
        h.setCurrentProfileId,
        h.setIsNewProfileModalOpen,
        h.showToast
      )
    );
    const file = await makeMrpackZip({ minecraft: '1.21.1', neoforge: '21.1.0' });

    await act(async () => {
      const fakeEvent = {
        target: { files: [file], value: '' }
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      await result.current.handleImportZipInput(fakeEvent);
      await new Promise((r) => setTimeout(r, 100));
    });

    const call = h.setProfiles.mock.calls[0]?.[0];
    const nextProfiles = typeof call === 'function' ? call([]) : call;
    expect(nextProfiles[0].environment.loader).toBe('NeoForge');
  });

  it('.jar が入っていない ZIP は「.jar が見つからない」warning', async () => {
    const h = makeHarness();
    const { result } = renderHook(() =>
      useZipImport(
        h.setProfiles as unknown as React.Dispatch<React.SetStateAction<Profile[]>>,
        h.setCurrentProfileId,
        h.setIsNewProfileModalOpen,
        h.showToast
      )
    );
    const file = await makeEmptyZip();

    await act(async () => {
      const fakeEvent = {
        target: { files: [file], value: '' }
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      await result.current.handleImportZipInput(fakeEvent);
      await new Promise((r) => setTimeout(r, 100));
    });

    const warningCall = h.showToast.mock.calls.find(
      ([, type]) => type === 'warning'
    );
    expect(warningCall?.[0]).toContain('.jar');
    expect(h.setProfiles).not.toHaveBeenCalled();
  });

  it('.jar 詰め合わせ ZIP は pendingImportData をセット + モーダルを開く', async () => {
    const h = makeHarness();
    const { result } = renderHook(() =>
      useZipImport(
        h.setProfiles as unknown as React.Dispatch<React.SetStateAction<Profile[]>>,
        h.setCurrentProfileId,
        h.setIsNewProfileModalOpen,
        h.showToast
      )
    );
    const file = await makeJarZip({
      'sodium-1.0.jar': 'FAKE_JAR_1',
      'lithium-2.0.jar': 'FAKE_JAR_2'
    });

    await act(async () => {
      const fakeEvent = {
        target: { files: [file], value: '' }
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      await result.current.handleImportZipInput(fakeEvent);
      await new Promise((r) => setTimeout(r, 300));
    });

    // pendingImportData がセット済み
    const pending = useZipImportStore.getState().pendingImportData;
    expect(pending).not.toBeNull();
    expect(pending?.mods.length).toBeGreaterThan(0);
    // モーダルオープン
    expect(h.setIsNewProfileModalOpen).toHaveBeenCalledWith(true);
    // 直接 setProfiles はしない (モーダル側で作成)
    expect(h.setProfiles).not.toHaveBeenCalled();
  });

  it('handleDropZip は preventDefault してファイルを処理する', async () => {
    const h = makeHarness();
    const { result } = renderHook(() =>
      useZipImport(
        h.setProfiles as unknown as React.Dispatch<React.SetStateAction<Profile[]>>,
        h.setCurrentProfileId,
        h.setIsNewProfileModalOpen,
        h.showToast
      )
    );
    const file = await makeMrpackZip({ minecraft: '1.20.1', 'fabric-loader': '0.15' });
    const preventDefault = vi.fn();

    await act(async () => {
      const fakeEvent = {
        preventDefault,
        dataTransfer: { files: [file] }
      } as unknown as React.DragEvent;
      result.current.handleDropZip(fakeEvent);
      await new Promise((r) => setTimeout(r, 100));
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(h.setProfiles).toHaveBeenCalled();
  });

  it('modrinth.index.json が壊れていれば SyntaxError toast', async () => {
    const h = makeHarness();
    const { result } = renderHook(() =>
      useZipImport(
        h.setProfiles as unknown as React.Dispatch<React.SetStateAction<Profile[]>>,
        h.setCurrentProfileId,
        h.setIsNewProfileModalOpen,
        h.showToast
      )
    );
    const zip = new JSZip();
    zip.file('modrinth.index.json', '{ this is not valid JSON');
    const blob = await zip.generateAsync({ type: 'blob' });
    const file = new File([blob], 'broken.mrpack', { type: 'application/zip' });

    await act(async () => {
      const fakeEvent = {
        target: { files: [file], value: '' }
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      await result.current.handleImportZipInput(fakeEvent);
      await new Promise((r) => setTimeout(r, 100));
    });

    const warningCall = h.showToast.mock.calls.find(
      ([, type]) => type === 'warning'
    );
    expect(warningCall?.[0]).toContain('破損');
  });

  it('ファイル未選択 (files[0] なし) の場合は何もしない', async () => {
    const h = makeHarness();
    const { result } = renderHook(() =>
      useZipImport(
        h.setProfiles as unknown as React.Dispatch<React.SetStateAction<Profile[]>>,
        h.setCurrentProfileId,
        h.setIsNewProfileModalOpen,
        h.showToast
      )
    );

    await act(async () => {
      const fakeEvent = {
        target: { files: [], value: '' }
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      result.current.handleImportZipInput(fakeEvent);
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(h.setProfiles).not.toHaveBeenCalled();
    expect(h.showToast).not.toHaveBeenCalled();
  });
});
describe('useZipImport: .minecraft フォルダ全体 ZIP (Phase 11-C フォールバック)', () => {
  const SODIUM = 'sodium-zip-content';
  const CUSTOM = 'custom-zip-content';

  beforeEach(async () => {
    clearApiCache();
    const sodiumSha1 = await calculateSha1(new TextEncoder().encode(SODIUM).buffer);
    server.use(
      http.post('/api/modrinth/version_files', async ({ request }) => {
        const body = (await request.json()) as { hashes: string[] };
        const result: Record<string, unknown> = {};
        if (body.hashes.includes(sodiumSha1)) {
          result[sodiumSha1] = {
            id: 'ver-sodium',
            project_id: 'proj-sodium',
            version_number: '0.6.0',
            version_type: 'release',
            files: [
              {
                url: 'https://cdn.modrinth.com/data/proj-sodium/ver.jar',
                filename: 'sodium-0.6.0.jar',
                primary: true,
                size: 10
              }
            ],
            game_versions: ['1.21.1'],
            loaders: ['fabric'],
            dependencies: []
          };
        }
        return HttpResponse.json(result);
      }),
      http.get('/api/modrinth/projects', ({ request }) => {
        const url = new URL(request.url);
        let ids: string[] = [];
        try {
          ids = JSON.parse(url.searchParams.get('ids') ?? '[]') as string[];
        } catch {
          ids = [];
        }
        return HttpResponse.json(
          ids.map((id) => ({
            id,
            slug: `slug-${id}`,
            title: `Title ${id}`,
            description: '',
            icon_url: null,
            display_categories: ['performance'],
            project_type: 'mod'
          }))
        );
      })
    );
  });

  async function makeMinecraftZip(dotMinecraftRoot = false): Promise<File> {
    const zip = new JSZip();
    const root = dotMinecraftRoot ? zip.folder('.minecraft')! : zip;
    root.file(
      'versions/fabric-loader-0.16.0-1.21.1/fabric-loader-0.16.0-1.21.1.json',
      JSON.stringify({
        id: 'fabric-loader-0.16.0-1.21.1',
        inheritsFrom: '1.21.1',
        mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient',
        libraries: [{ name: 'net.fabricmc:fabric-loader:0.16.0' }]
      })
    );
    root.file('mods/sodium.jar', SODIUM);
    root.file('mods/custom-thing.jar', CUSTOM);
    root.file('resourcepacks/fresh.zip', 'fresh-zip-content');
    const blob = await zip.generateAsync({ type: 'blob' });
    return new File([blob], 'my-env.zip', { type: 'application/zip' });
  }

  it('mods/ + versions/ を含む ZIP を環境として解析し pendingImportData + モーダル open', async () => {
    const h = makeHarness();
    const { result } = renderHook(() =>
      useZipImport(
        h.setProfiles as unknown as React.Dispatch<React.SetStateAction<Profile[]>>,
        h.setCurrentProfileId,
        h.setIsNewProfileModalOpen,
        h.showToast
      )
    );
    const file = await makeMinecraftZip();

    await act(async () => {
      const fakeEvent = {
        target: { files: [file], value: '' }
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      await result.current.handleImportZipInput(fakeEvent);
      await new Promise((r) => setTimeout(r, 100));
    });

    const pending = useZipImportStore.getState().pendingImportData;
    expect(pending).not.toBeNull();
    expect(pending?.name).toBe('my-env'); // ZIP 名 (妥協名ではないのでそのまま)
    expect(pending?.mcVersion).toBe('1.21.1');
    expect(pending?.loader).toBe('Fabric');
    expect(pending?.loaderVersion).toBe('0.16.0');
    expect(pending?.rootType).toBe('official');
    expect(pending?.mods).toHaveLength(1);
    expect(pending?.mods[0]).toMatchObject({
      projectId: 'proj-sodium',
      name: 'Title proj-sodium',
      type: 'mod',
      artifact: { path: 'mods/sodium.jar' }
    });
    // custom jar + fresh.zip は照合不可 → unknownFiles (fresh は resourcepacks でなく unknown 行き)
    expect(pending?.unknownFiles).toHaveLength(2);
    expect(pending?.analysisIssues).toBeDefined();
    expect(h.setIsNewProfileModalOpen).toHaveBeenCalledWith(true);
    // setProfiles は呼ばれない (作成はモーダル経由)
    expect(h.setProfiles).not.toHaveBeenCalled();
  });

  it('.minecraft/ サブフォルダを root として扱う', async () => {
    const h = makeHarness();
    const { result } = renderHook(() =>
      useZipImport(
        h.setProfiles as unknown as React.Dispatch<React.SetStateAction<Profile[]>>,
        h.setCurrentProfileId,
        h.setIsNewProfileModalOpen,
        h.showToast
      )
    );
    const file = await makeMinecraftZip(true);

    await act(async () => {
      const fakeEvent = {
        target: { files: [file], value: '' }
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      await result.current.handleImportZipInput(fakeEvent);
      await new Promise((r) => setTimeout(r, 100));
    });

    const pending = useZipImportStore.getState().pendingImportData;
    expect(pending?.mcVersion).toBe('1.21.1'); // .minecraft/versions が root として検出される
    expect(pending?.mods).toHaveLength(1);
  });
});
