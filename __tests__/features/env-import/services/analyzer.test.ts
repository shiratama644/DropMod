/**
 * lib/env/analyzer.ts test (Phase 11-B)
 *
 * Fake ファイルツリー (.minecraft 相当) + msw (/version_files, /projects)
 * で Import パイプライン全体 (検出 → 列挙 → ハッシュ → 照合 → 構築) を検証。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/__tests__/mocks/server';
import { analyzeEnvironmentSource } from '@/features/env-import/services/analyzer';
import type { AnalyzeProgress } from '@/features/env-import/services/analyzer';
import { FileSystemSource } from '@/lib/env/source';
import { createFakeFileSystem } from '@/__tests__/test-utils/fakeFs';
import { calculateSha1 } from '@/lib/utils/hash';
import { clearApiCache } from '@/lib/modrinth/client';
import type { ModrinthVersion } from '@/types';

const MOD_A = 'sodium-content';
const MOD_B = 'lithium-content';
const RP = 'fresh-animations-content';
const SHADER = 'complementary-content';
const CUSTOM = 'my-custom-mod-content';

async function sha1Of(content: string): Promise<string> {
  return calculateSha1(new TextEncoder().encode(content).buffer);
}

function makeVersion(
  projectId: string,
  versionId: string,
  overrides: Partial<ModrinthVersion> = {}
): ModrinthVersion {
  return {
    id: versionId,
    project_id: projectId,
    author_id: 'author-1',
    featured: true,
    name: `${projectId} ${versionId}`,
    version_number: `1.0.0+${versionId}`,
    date_published: '2026-01-01T00:00:00Z',
    downloads: 1000,
    version_type: 'release',
    files: [
      {
        url: `https://cdn.modrinth.com/data/${projectId}/versions/${versionId}.jar`,
        filename: `${projectId}-${versionId}.jar`,
        primary: true,
        size: 12345
      }
    ],
    game_versions: ['1.21.1'],
    loaders: ['fabric'],
    dependencies: [],
    ...overrides
  };
}

function sourceOf() {
  return new FileSystemSource(
    createFakeFileSystem({
      'versions/fabric-loader-0.16.0-1.21.1/fabric-loader-0.16.0-1.21.1.json': JSON.stringify({
        id: 'fabric-loader-0.16.0-1.21.1',
        inheritsFrom: '1.21.1',
        mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient',
        libraries: [{ name: 'net.fabricmc:fabric-loader:0.16.0' }]
      }),
      'mods/sodium.jar': MOD_A,
      'mods/lithium.jar': MOD_B,
      'mods/my-custom-mod.jar': CUSTOM,
      'resourcepacks/Fresh Animations.zip': RP,
      'shaderpacks/ComplementaryReimagined.zip': SHADER,
      'options.txt': 'version:1' // 対象外 (.txt)
    }),
    '.minecraft'
  );
}

describe('analyzeEnvironmentSource', () => {
  beforeEach(async () => {
    clearApiCache();
    const modAHash = await sha1Of(MOD_A);
    const modBHash = await sha1Of(MOD_B);
    const rpHash = await sha1Of(RP);
    const shaderHash = await sha1Of(SHADER);

    // POST /version_files: 既知ハッシュのみ version を返す (custom は照合不可)
    server.use(
      http.post('/api/modrinth/version_files', async ({ request }) => {
        const body = (await request.json()) as { hashes: string[] };
        const result: Record<string, ModrinthVersion> = {};
        if (body.hashes.includes(modAHash)) result[modAHash] = makeVersion('proj-sodium', 'ver-a');
        if (body.hashes.includes(modBHash)) result[modBHash] = makeVersion('proj-lithium', 'ver-b');
        if (body.hashes.includes(rpHash)) {
          result[rpHash] = makeVersion('proj-fresh', 'ver-rp', { loaders: ['minecraft'] });
        }
        if (body.hashes.includes(shaderHash)) {
          result[shaderHash] = makeVersion('proj-complementary', 'ver-sh', { loaders: ['minecraft'] });
        }
        return HttpResponse.json(result);
      })
    );

    // GET /projects: unique project ID のメタデータ
    server.use(
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
            description: `desc ${id}`,
            icon_url: `https://cdn.modrinth.com/icons/${id}.png`,
            author: `Author ${id}`,
            display_categories: ['performance'],
            project_type: 'mod'
          }))
        );
      })
    );
  });

  it('検出 → 列挙 → ハッシュ照合 → ProjectItem/UnknownFile 構築の一連が動く', async () => {
    const analysis = await analyzeEnvironmentSource(sourceOf());

    // 環境検出 (Detector chain)
    expect(analysis.environment.rootType).toBe('official');
    expect(analysis.environment.mcVersion).toBe('1.21.1');
    expect(analysis.environment.loader).toBe('Fabric');
    expect(analysis.environment.loaderVersion).toBe('0.16.0');
    expect(analysis.sourceKind).toBe('filesystem');
    expect(analysis.sourceName).toBe('.minecraft');

    // スキャン数 (対象外の options.txt は含まない)
    expect(analysis.scannedCounts).toEqual({ mods: 3, resourcepacks: 1, shaderpacks: 1 });

    // mods: 照合成功 2 + unknown 1
    expect(analysis.mods).toHaveLength(2);
    const sodium = analysis.mods.find((m) => m.projectId === 'proj-sodium')!;
    expect(sodium).toMatchObject({
      name: 'Title proj-sodium',
      slug: 'slug-proj-sodium',
      type: 'mod',
      versionId: 'ver-a',
      versionNumber: '1.0.0+ver-a',
      versionType: 'release',
      author: 'Author proj-sodium',
      category: 'performance',
      fileUrl: 'https://cdn.modrinth.com/data/proj-sodium/versions/ver-a.jar'
    });
    expect(sodium.artifact).toMatchObject({
      path: 'mods/sodium.jar',
      size: MOD_A.length
    });
    expect(sodium.artifact?.sha1).toBe(await sha1Of(MOD_A));

    // resourcepacks / shaderpacks もカテゴリ分類される
    expect(analysis.resourcepacks).toHaveLength(1);
    expect(analysis.resourcepacks[0]?.type).toBe('resourcepack');
    expect(analysis.resourcepacks[0]?.name).toBe('Title proj-fresh');
    expect(analysis.shaderpacks).toHaveLength(1);
    expect(analysis.shaderpacks[0]?.type).toBe('shader');

    // 照合不可 → UnknownFile (location で記録)
    expect(analysis.unknownFiles).toHaveLength(1);
    const unknown = analysis.unknownFiles[0]!;
    expect(unknown.location).toBe('mods');
    expect(unknown.filename).toBe('my-custom-mod.jar');
    expect(unknown.path).toBe('mods/my-custom-mod.jar');
    expect(unknown.sha1).toBe(await sha1Of(CUSTOM));
    expect(unknown.size).toBe(CUSTOM.length);
    expect(unknown.discoveredAt).toBeGreaterThan(0);

    // versionsByProject (health check 用)
    expect(analysis.versionsByProject.get('proj-sodium')?.id).toBe('ver-a');
  });

  it('contentDirs が無いカテゴリは空配列 (エラーにしない)', async () => {
    const source = new FileSystemSource(
      createFakeFileSystem({ 'mods/only.jar': MOD_A }),
      'minimal'
    );
    const analysis = await analyzeEnvironmentSource(source);
    expect(analysis.environment.rootType).toBe('generic');
    expect(analysis.scannedCounts).toEqual({ mods: 1, resourcepacks: 0, shaderpacks: 0 });
    expect(analysis.resourcepacks).toEqual([]);
    expect(analysis.shaderpacks).toEqual([]);
  });

  it('空のフォルダでも解析自体は成功する', async () => {
    const source = new FileSystemSource(createFakeFileSystem({}), 'empty');
    const analysis = await analyzeEnvironmentSource(source);
    expect(analysis.scannedCounts).toEqual({ mods: 0, resourcepacks: 0, shaderpacks: 0 });
    expect(analysis.unknownFiles).toEqual([]);
    expect(analysis.mods).toEqual([]);
  });

  it('進捗 callback が各 phase で呼ばれる', async () => {
    const onProgress = vi.fn<(p: AnalyzeProgress) => void>();
    await analyzeEnvironmentSource(sourceOf(), onProgress);
    const phases = new Set(onProgress.mock.calls.map((call) => call[0].phase));
    expect(phases.has('detect')).toBe(true);
    expect(phases.has('scan')).toBe(true);
    expect(phases.has('read')).toBe(true);
    expect(phases.has('hash')).toBe(true);
    expect(phases.has('resolve')).toBe(true);
    // read の最後は全ファイル数に到達
    const reads = onProgress.mock.calls.filter((c) => c[0].phase === 'read');
    expect(reads.at(-1)?.[0]).toEqual({ phase: 'read', done: 5, total: 5 });
  });

  it('照合成功でも project メタデータが無ければ title の代わりにファイル名を使う', async () => {
    // /projects を空応答にして、メタデータ解決をスキップさせる
    server.use(
      http.get('/api/modrinth/projects', () => HttpResponse.json([]))
    );
    const analysis = await analyzeEnvironmentSource(sourceOf());
    const sodium = analysis.mods.find((m) => m.projectId === 'proj-sodium')!;
    expect(sodium).toBeDefined();
    // project?.title が無い → stripExtension('sodium.jar') = 'sodium'
    expect(sodium.name).toBe('sodium');
    expect(sodium.slug).toBeUndefined();
    expect(sodium.description).toBeUndefined();
    expect(sodium.icon_url).toBeUndefined();
    expect(sodium.author).toBeUndefined();
    // それでもバージョン情報とファイル名は解決できる
    expect(sodium.versionId).toBe('ver-a');
    expect(sodium.filename).toBe('proj-sodium-ver-a.jar');
    // unknown は従来通り
    expect(analysis.unknownFiles).toHaveLength(1);
  });

  it('version.files が空でも照合成功したらファイル名フォールバックで ProjectItem を作る', async () => {
    const modAHash = await sha1Of(MOD_A);
    server.use(
      http.post('/api/modrinth/version_files', async ({ request }) => {
        const body = (await request.json()) as { hashes: string[] };
        const result: Record<string, ModrinthVersion> = {};
        if (body.hashes.includes(modAHash)) {
          result[modAHash] = makeVersion('proj-sodium', 'ver-a', { files: [] });
        }
        return HttpResponse.json(result);
      }),
      http.get('/api/modrinth/projects', () => HttpResponse.json([]))
    );
    const analysis = await analyzeEnvironmentSource(sourceOf());
    const mod = analysis.mods.find((m) => m.projectId === 'proj-sodium')!;
    // files が空 → primaryFile は無い → fileUrl は undefined、filename は元ファイル名
    expect(mod.fileUrl).toBeUndefined();
    expect(mod.filename).toBe('sodium.jar');
    // project 無し → stripExtension('sodium.jar') = 'sodium' (dot > 0 側)
    expect(mod.name).toBe('sodium');
    expect(mod.artifact?.sha1).toBe(modAHash);
    // files 空でも照合自体は成功扱い (unknown にはしない)。このテストでは sodium 以外は
    // version_files が返らないため unknown になる (lithium / rp / shader / custom)
    expect(analysis.unknownFiles.map((u) => u.filename).sort()).toEqual([
      'ComplementaryReimagined.zip',
      'Fresh Animations.zip',
      'lithium.jar',
      'my-custom-mod.jar'
    ]);
  });

  it('primary フラグの無いファイルは先頭ファイルを primaryFile として使う', async () => {
    const modAHash = await sha1Of(MOD_A);
    server.use(
      http.post('/api/modrinth/version_files', async ({ request }) => {
        const body = (await request.json()) as { hashes: string[] };
        const result: Record<string, ModrinthVersion> = {};
        if (body.hashes.includes(modAHash)) {
          result[modAHash] = makeVersion('proj-sodium', 'ver-a', {
            files: [
              {
                url: 'https://cdn.modrinth.com/data/proj-sodium/versions/ver-a-2.jar',
                filename: 'sodium-extra-file.jar',
                primary: false,
                size: 999
              }
            ]
          });
        }
        return HttpResponse.json(result);
      })
    );
    const analysis = await analyzeEnvironmentSource(sourceOf());
    const sodium = analysis.mods.find((m) => m.projectId === 'proj-sodium')!;
    // find(primary) が undefined → files[0] へフォールバック
    expect(sodium.fileUrl).toBe('https://cdn.modrinth.com/data/proj-sodium/versions/ver-a-2.jar');
    expect(sodium.filename).toBe('sodium-extra-file.jar');
  });

  it('対象ディレクトリ内の対象外拡張子はスキャンに含めない', async () => {
    const source = new FileSystemSource(
      createFakeFileSystem({
        'mods/sodium.jar': MOD_A,
        'mods/readme.txt': 'not a mod', // .jar/.zip 以外 → スキップ
        'resourcepacks/note.md': 'not a pack'
      }),
      '.minecraft'
    );
    const analysis = await analyzeEnvironmentSource(source);
    expect(analysis.scannedCounts).toEqual({ mods: 1, resourcepacks: 0, shaderpacks: 0 });
    expect(analysis.mods).toHaveLength(1);
    expect(analysis.mods[0]?.projectId).toBe('proj-sodium');
  });

  it('ドット始まりのファイル名は拡張子を落とさない (stripExtension の fallback 側)', async () => {
    const dotHash = await sha1Of(MOD_A);
    server.use(
      http.post('/api/modrinth/version_files', async ({ request }) => {
        const body = (await request.json()) as { hashes: string[] };
        const result: Record<string, ModrinthVersion> = {};
        if (body.hashes.includes(dotHash)) result[dotHash] = makeVersion('proj-dot', 'ver-dot');
        return HttpResponse.json(result);
      }),
      http.get('/api/modrinth/projects', () => HttpResponse.json([]))
    );
    // '.jar' のようなドット始まりのファイル名は lastIndexOf('.') === 0 なので除去しない
    const source = new FileSystemSource(
      createFakeFileSystem({ 'mods/.jar': MOD_A }),
      '.minecraft'
    );
    const analysis = await analyzeEnvironmentSource(source);
    const mod = analysis.mods.find((m) => m.projectId === 'proj-dot')!;
    expect(mod.name).toBe('.jar');
    expect(mod.filename).toBe('proj-dot-ver-dot.jar');
  });

  it('読み取りに失敗したファイルはスキップして解析を継続する', async () => {
    const source = new FileSystemSource(
      createFakeFileSystem({
        'mods/good.jar': MOD_A,
        'mods/broken.jar': 'x'
      }),
      '.minecraft'
    );
    // good.jar だけ読み取り成功させ、broken.jar は失敗させる
    const originalRead = source.readFile.bind(source);
    vi.spyOn(source, 'readFile').mockImplementation(async (path) => {
      if (path.endsWith('broken.jar')) throw new Error('permission denied');
      return originalRead(path);
    });
    const analysis = await analyzeEnvironmentSource(source);
    expect(analysis.scannedCounts).toEqual({ mods: 1, resourcepacks: 0, shaderpacks: 0 });
    expect(analysis.mods).toHaveLength(1);
    expect(analysis.mods[0]?.projectId).toBe('proj-sodium');
    expect(analysis.unknownFiles).toHaveLength(0);
  });
});
