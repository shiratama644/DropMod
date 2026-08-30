/**
 * NewProfileModal フォルダ解析統合 test (Phase 11-B/C)
 *
 * window.showDirectoryPicker を Fake handle で差し替え、msw で
 * /version_files・/projects を mock して:
 * - フォルダ選択 → 解析 → 名前/環境の自動入力
 * - Analysis View (解析結果 + 検査 + 未識別ファイル)
 * - 作成時に mods + extras (resourcepacks 等) が onCreate に渡る
 * を検証する。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/__tests__/mocks/server';
import { NewProfileModal } from '@/features/profiles/components/NewProfileModal';
import { createFakeFileSystem } from '@/__tests__/test-utils/fakeFs';
import { calculateSha1 } from '@/lib/utils/hash';
import { clearApiCache } from '@/lib/modrinth/client';
import type { ModrinthVersion } from '@/types';

const mcVersions = ['1.21.4', '1.21.1', '1.20.1'];

const MOD_CONTENT = 'sodium-content';
const UNKNOWN_CONTENT = 'my-custom-thing';

function makeVersion(projectId: string, versionId: string): ModrinthVersion {
  return {
    id: versionId,
    project_id: projectId,
    author_id: 'a',
    featured: true,
    name: `${projectId}-${versionId}`,
    version_number: '0.6.0',
    date_published: '2026-01-01T00:00:00Z',
    downloads: 1,
    version_type: 'release',
    files: [
      {
        url: `https://cdn.modrinth.com/data/${projectId}/${versionId}.jar`,
        filename: `${projectId}-${versionId}.jar`,
        primary: true,
        size: 10
      }
    ],
    game_versions: ['1.21.1'],
    loaders: ['fabric'],
    dependencies: []
  };
}

describe('NewProfileModal: フォルダ解析 (Phase 11)', () => {
  let modSha1: string;

  beforeEach(async () => {
    clearApiCache();
    modSha1 = await calculateSha1(new TextEncoder().encode(MOD_CONTENT).buffer);
    const unknownSha1 = await calculateSha1(
      new TextEncoder().encode(UNKNOWN_CONTENT).buffer
    );

    server.use(
      http.post('/api/modrinth/version_files', async ({ request }) => {
        const body = (await request.json()) as { hashes: string[] };
        const result: Record<string, ModrinthVersion> = {};
        if (body.hashes.includes(modSha1)) {
          result[modSha1] = makeVersion('proj-sodium', 'ver-sodium');
        }
        // unknownSha1 は意図的に返さない (照合不可)
        void unknownSha1;
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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFolderPicker() {
    const handle = createFakeFileSystem(
      {
        'versions/fabric-loader-0.16.0-1.21.1/fabric-loader-0.16.0-1.21.1.json':
          JSON.stringify({
            id: 'fabric-loader-0.16.0-1.21.1',
            inheritsFrom: '1.21.1',
            mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient',
            libraries: [{ name: 'net.fabricmc:fabric-loader:0.16.0' }]
          }),
        'mods/sodium.jar': MOD_CONTENT,
        'mods/my-custom-thing.jar': UNKNOWN_CONTENT,
        'resourcepacks/fresh.zip': 'fresh-content'
      },
      'My Fabric Instance'
    );
    const picker = vi.fn().mockResolvedValue(handle);
    vi.stubGlobal('showDirectoryPicker', picker);
    return picker;
  }

  it('フォルダ選択 → 解析 → 名前/環境の自動入力 + Analysis View 表示', async () => {
    stubFolderPicker();
    const user = userEvent.setup();
    render(
      <NewProfileModal
        isOpen
        onClose={() => {}}
        mcVersions={mcVersions}
        onCreate={() => {}}
      />
    );

    await user.click(screen.getByRole('button', { name: /フォルダ/ }));

    // 解析完了を待つ
    await waitFor(() => {
      expect(screen.getByRole('status', { name: '解析結果' })).toBeInTheDocument();
    });

    // §6.1: フォルダ名が妥当なのでプロファイル名はフォルダ名
    const nameInput = screen.getByLabelText(/プロファイル名/) as HTMLInputElement;
    expect(nameInput.value).toBe('My Fabric Instance');

    // 環境の自動検出 (Analysis View に反映)
    expect(screen.getByText(/Minecraft 1\.21\.1 \/ Fabric \/ 0\.16\.0/)).toBeInTheDocument();
    expect(screen.getByText(/公式ランチャー \(\.minecraft\)/)).toBeInTheDocument();
    // 内容: 2 Mods (1 照合 + 1 未識別) / 1 RP (未照合 → 未識別)
    expect(screen.getByText(/未識別 2 個/)).toBeInTheDocument();

    // 検査結果が表示される (未識別ファイル warning)
    expect(screen.getByText(/照合できませんでした/)).toBeInTheDocument();

    // 未識別ファイル一覧
    expect(screen.getByText(/未識別ファイル一覧 \(2\)/)).toBeInTheDocument();
  });

  it('不適切なフォルダ名 (.minecraft) は検出環境からプロファイル名を生成', async () => {
    const handle = createFakeFileSystem(
      {
        'versions/fabric-loader-0.16.0-1.21.1/fabric-loader-0.16.0-1.21.1.json':
          JSON.stringify({
            id: 'fabric-loader-0.16.0-1.21.1',
            inheritsFrom: '1.21.1',
            mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient',
            libraries: [{ name: 'net.fabricmc:fabric-loader:0.16.0' }]
          })
      },
      '.minecraft'
    );
    vi.stubGlobal('showDirectoryPicker', vi.fn().mockResolvedValue(handle));

    const user = userEvent.setup();
    render(
      <NewProfileModal
        isOpen
        onClose={() => {}}
        mcVersions={mcVersions}
        onCreate={() => {}}
      />
    );
    await user.click(screen.getByRole('button', { name: /フォルダ/ }));
    await waitFor(() => {
      expect(screen.getByRole('status', { name: '解析結果' })).toBeInTheDocument();
    });
    const nameInput = screen.getByLabelText(/プロファイル名/) as HTMLInputElement;
    expect(nameInput.value).toBe('Fabric 1.21.1');
  });

  it('作成ボタンで解析結果 (mods + resourcepacks + unknownFiles) を渡す', async () => {
    stubFolderPicker();
    const onCreate = vi.fn();
    const user = userEvent.setup();
    render(
      <NewProfileModal
        isOpen
        onClose={() => {}}
        mcVersions={mcVersions}
        onCreate={onCreate}
      />
    );

    await user.click(screen.getByRole('button', { name: /フォルダ/ }));
    await waitFor(() => {
      expect(screen.getByRole('status', { name: '解析結果' })).toBeInTheDocument();
    });

    await act(async () => {});
    await user.click(screen.getByRole('button', { name: '作成する' }));

    expect(onCreate).toHaveBeenCalledTimes(1);
    const args = onCreate.mock.calls[0]!;
    expect(args[0]).toBe('My Fabric Instance');
    expect(args[1]).toBe('1.21.1'); // mcVersion (検出値)
    expect(args[2]).toBe('Fabric');
    expect(args[4]).toHaveLength(1); // mods: 照合成功した sodium のみ
    expect(args[4][0]).toMatchObject({ projectId: 'proj-sodium', type: 'mod' });
    const extras = args[6];
    expect(extras?.resourcepacks ?? []).toHaveLength(0); // fresh.zip は未照合 → unknownFiles 行き
    expect(extras?.unknownFiles).toHaveLength(2);
    expect(extras?.unknownFiles?.[0]).toMatchObject({
      path: 'mods/my-custom-thing.jar',
      location: 'mods'
    });
    // P12-D1: フォルダ選択に成功しているので自動紐付け情報が渡る
    const link = args[7];
    expect(link?.picked.handle).toBeDefined();
    expect(link?.detected.mcVersion).toBe('1.21.1');
    expect(link?.detected.contentDirs.mods).toBe('mods');
  });

  it('initialImportData の解析結果 (ZIP 環境取り込み) も Analysis View に表示', () => {
    render(
      <NewProfileModal
        isOpen
        onClose={() => {}}
        mcVersions={mcVersions}
        initialImportData={{
          name: 'Imported Env',
          mods: [
            { projectId: 'p1', name: 'Mod1', type: 'mod' }
          ],
          mcVersion: '1.20.1',
          loader: 'Fabric',
          analysisIssues: [
            { id: 'unknown-files', status: 'warning', message: '2 個のファイルを照合できませんでした', details: ['mods/x.jar'] }
          ],
          rootType: 'prism',
          unknownFiles: [
            {
              id: 'u1',
              location: 'mods',
              filename: 'x.jar',
              path: 'mods/x.jar',
              sha1: 'a',
              size: 1,
              discoveredAt: 1
            }
          ]
        }}
        onCreate={() => {}}
      />
    );
    expect(screen.getByRole('status', { name: '解析結果' })).toBeInTheDocument();
    expect(screen.getByText(/Prism \/ MultiMC インスタンス/)).toBeInTheDocument();
    expect(screen.getByText(/2 個のファイルを照合できませんでした/)).toBeInTheDocument();
  });
});
