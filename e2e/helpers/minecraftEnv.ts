/**
 * E2E ヘルパー: .minecraft 構造の ZIP 生成 + Modrinth API モック (Phase 11)
 *
 * Phase 11-C の E2E (zipEnvImport / folderImport) で使う共通 fixture。
 *
 * - buildMinecraftEnvZip(): mods/ + versions/ + resourcepacks/ を含む
 *   「.minecraft を ZIP 化した」ファイルを Buffer で生成。
 *   既知 Mod (API 照合成功) と未知ファイル (照合不可) を混ぜる。
 * - installModrinthApiMock(): page.route で /version_files と /projects を
 *   差し替え、解析結果を決定論的にする (実 API・レート制限に依存しない)。
 *
 * ※ sha1 は Node 側 (crypto) で計算。内容は ASCII 文字列のためブラウザの
 *   TextEncoder + crypto.subtle と同一のハッシュになる。
 */

import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import type { Page, Route } from '@playwright/test';

/** fixture の定数 (spec の assertion にも使う) */
export const ENV_FIXTURE = {
  mcVersion: '1.21.1',
  loader: 'Fabric',
  loaderVersion: '0.16.0',
  /** API 照合が成功する Mod の jar 内容 */
  knownModContent: 'e2e-known-sodium-jar-content',
  knownProject: {
    id: 'e2e-proj-sodium',
    slug: 'e2e-sodium',
    title: 'E2E Sodium',
    versionId: 'e2e-ver-sodium',
    versionNumber: '0.6.0'
  },
  /** 照合不可のファイル (unknownFiles 行き) */
  unknownModContent: 'e2e-unknown-custom-jar-content',
  resourcepackContent: 'e2e-resourcepack-zip-content'
} as const;

function sha1(content: string): string {
  return createHash('sha1').update(content, 'utf8').digest('hex');
}

/** 公式ランチャー形式の versions/<id>/<id>.json の中身 */
export const FABRIC_VERSION_JSON = JSON.stringify({
  id: 'fabric-loader-0.16.0-1.21.1',
  inheritsFrom: '1.21.1',
  mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient',
  libraries: [{ name: 'net.fabricmc:fabric-loader:0.16.0' }]
});

/** .minecraft 構造のファイル群 (path → 内容)。ZIP とフォルダピッカーで共用 */
export const ENV_FILES: Record<string, string> = {
  'versions/fabric-loader-0.16.0-1.21.1/fabric-loader-0.16.0-1.21.1.json':
    FABRIC_VERSION_JSON,
  'mods/e2e-sodium.jar': ENV_FIXTURE.knownModContent,
  'mods/custom-unknown.jar': ENV_FIXTURE.unknownModContent,
  'resourcepacks/fresh-animations.zip': ENV_FIXTURE.resourcepackContent
};

export interface MinecraftEnvZip {
  buffer: Buffer;
  /** 既知 Mod の sha1 (API モックで使用) */
  knownSha1: string;
}

/**
 * .minecraft 構造の ZIP を生成。
 * @param dotMinecraftRoot true の場合、ZIP 直下に .minecraft/ フォルダを置く
 *   (ユーザーが「.minecraft フォルダ自身」を ZIP 化したケース)
 */
export async function buildMinecraftEnvZip(
  dotMinecraftRoot = false
): Promise<MinecraftEnvZip> {
  const zip = new JSZip();
  const root = dotMinecraftRoot ? zip.folder('.minecraft') : zip;
  for (const [path, content] of Object.entries(ENV_FILES)) {
    (root ?? zip).file(path, content);
  }
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  return {
    buffer,
    knownSha1: sha1(ENV_FIXTURE.knownModContent)
  };
}

/** /version_files が返す version JSON (analyzer が消費する形) */
function versionJson() {
  return {
    id: ENV_FIXTURE.knownProject.versionId,
    project_id: ENV_FIXTURE.knownProject.id,
    author_id: 'e2e-author',
    featured: true,
    name: `${ENV_FIXTURE.knownProject.title} ${ENV_FIXTURE.knownProject.versionNumber}`,
    version_number: ENV_FIXTURE.knownProject.versionNumber,
    date_published: '2026-01-01T00:00:00Z',
    downloads: 12345,
    version_type: 'release',
    files: [
      {
        url: 'https://cdn.modrinth.com/data/e2e/versions/sodium.jar',
        filename: 'e2e-sodium-0.6.0.jar',
        primary: true,
        size: 1024
      }
    ],
    game_versions: [ENV_FIXTURE.mcVersion],
    loaders: ['fabric'],
    dependencies: []
  };
}

/**
 * Modrinth API のブラウザ側リクエストを page.route で差し替える。
 * client.ts は /api/modrinth/* プロキシを最初に試むため、proxy と
 * direct (api.modrinth.com) の両方をモックする。
 */
export async function installModrinthApiMock(page: Page): Promise<void> {
  const knownSha1 = sha1(ENV_FIXTURE.knownModContent);

  const versionFilesHandler = async (route: Route) => {
    let hashes: string[] = [];
    try {
      const body = route.request().postDataJSON() as { hashes?: string[] };
      hashes = body?.hashes ?? [];
    } catch {
      hashes = [];
    }
    const result: Record<string, unknown> = {};
    if (hashes.includes(knownSha1)) {
      result[knownSha1] = versionJson();
    }
    await route.fulfill({ json: result });
  };

  const projectsHandler = async (route: Route) => {
    await route.fulfill({
      json: [
        {
          id: ENV_FIXTURE.knownProject.id,
          slug: ENV_FIXTURE.knownProject.slug,
          title: ENV_FIXTURE.knownProject.title,
          description: 'E2E fixture project',
          icon_url: null,
          display_categories: ['performance'],
          project_type: 'mod'
        }
      ]
    });
  };

  // **P12-E2E 修正 (2026-08-29)**: /tag/game_version も決定論化する。
  // モーダルは `mcVersions.includes(initialImportData.mcVersion)` で
  // 取り込み環境の MC バージョンを採用するため、ここが未解決 (空配列) だと
  // 初期値 1.21.4 にフォールバックし、Profile 環境が 1.21.1 にならず
  // Sync が D-1 blocked-environment になる。CI のネットワーク遮断では
  // フォールバック固定リスト頼み (タイミング依存) なので、モックで確定させる。
  const gameVersionsHandler = async (route: Route) => {
    await route.fulfill({
      json: [
        { version: '1.21.4', version_type: 'release' },
        { version: '1.21.3', version_type: 'release' },
        { version: '1.21.1', version_type: 'release' }
      ]
    });
  };

  await page.route('**/api/modrinth/version_files', versionFilesHandler);
  await page.route('**/api.modrinth.com/v2/version_files', versionFilesHandler);
  await page.route('**/api/modrinth/projects*', projectsHandler);
  await page.route('**/api.modrinth.com/v2/projects*', projectsHandler);
  await page.route('**/api/modrinth/tag/game_version*', gameVersionsHandler);
  await page.route('**/api.modrinth.com/v2/tag/game_version*', gameVersionsHandler);
}
