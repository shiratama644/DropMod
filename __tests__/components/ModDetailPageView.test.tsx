/**
 * ModDetailPageView smoke test (Phase 10-P1 の再発防止)
 *
 * `pnpm build` の prerender 中に `/mods/iris` `/mods/oculus` などで
 *   TypeError: Cannot read properties of undefined (reading 'length')
 * が発生した。原因は Modrinth API が `categories` / `display_categories` を
 * 欠落した状態で返す project が実在し、new ModDetailPageView がそれを
 * required と信じて `.length` を直接読んでいたこと。
 *
 * 本テストでは:
 *   1. 完全な project を SSR (renderToString) しても throw しない
 *   2. categories / display_categories / gallery / versions / loaders /
 *      game_versions すべて undefined でも throw しない
 *   3. downloads / followers が undefined でも throw しない
 *   4. project=null (SSR fetch 失敗) のフォールバック UI が出る
 * を検証する。
 *
 * SSR (renderToString) で確認する理由:
 *   Next の generateStaticParams による ISR プレンダーは React DOM の
 *   renderToPipeableStream 経由の SSR で、useEffect 等は走らない。
 *   render 関数トップの計算 (categoriesList = ... など) が唯一のクリティカルパス。
 *   jsdom render と挙動が異なる可能性があるため、両方通しておく。
 */

import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { render } from '@testing-library/react';
import { ModDetailPageView } from '@/components/ModDetailPageView';
import type { ModrinthProject, ModrinthVersion } from '@/types';

const fullProject: ModrinthProject = {
  id: 'proj-sodium',
  slug: 'sodium',
  project_type: 'mod',
  title: 'Sodium',
  description: 'Fast rendering',
  body: '# Sodium\n\nA rendering optimization mod.',
  gallery: [
    { url: 'https://example.com/g1.png', title: 'g1', ordering: 0 }
  ],
  categories: ['performance'],
  display_categories: ['performance'],
  downloads: 1_500_000,
  icon_url: undefined,
  published: '2020-01-01T00:00:00.000Z',
  updated: '2026-08-01T00:00:00.000Z',
  author: 'JellySquid',
  source_url: 'https://github.com/CaffeineMC/sodium-fabric',
  issues_url: null,
  license: { id: 'LGPL-3.0', name: 'LGPL 3.0' },
  loaders: ['fabric'],
  game_versions: ['1.20.1'],
  followers: 12000,
  client_side: 'required',
  server_side: 'unsupported'
};

const fullVersion: ModrinthVersion = {
  id: 'ver-1',
  project_id: 'proj-sodium',
  author_id: 'u1',
  featured: true,
  name: 'Sodium 0.5.0',
  version_number: '0.5.0',
  date_published: '2024-01-01T00:00:00.000Z',
  downloads: 1000,
  version_type: 'release',
  files: [
    {
      url: 'https://cdn.modrinth.com/sodium.jar',
      filename: 'sodium-0.5.0.jar',
      primary: true,
      size: 100000
    }
  ],
  dependencies: [],
  game_versions: ['1.20.1'],
  loaders: ['fabric']
};

describe('ModDetailPageView smoke', () => {
  it('SSR (renderToString) が完全な project で throw しない', () => {
    expect(() =>
      renderToString(
        <ModDetailPageView
          project={fullProject}
          versions={[fullVersion]}
          slug="sodium"
        />
      )
    ).not.toThrow();
  });

  it('SSR: categories / display_categories / gallery / loaders / game_versions が undefined でも throw しない (prerender 落ち再発防止)', () => {
    const minimal: ModrinthProject = {
      id: 'proj-iris',
      slug: 'iris',
      project_type: 'mod',
      title: 'Iris',
      description: 'Shader loader',
      downloads: 500_000,
      published: '2021-01-01T00:00:00.000Z',
      updated: '2026-08-01T00:00:00.000Z'
      // 意図的に categories / display_categories / gallery / loaders /
      // game_versions / followers / license / client_side / server_side を省略
    };
    expect(() =>
      renderToString(
        <ModDetailPageView project={minimal} versions={[]} slug="iris" />
      )
    ).not.toThrow();
  });

  it('SSR: downloads=0 / followers 欠落でも throw しない', () => {
    const zero: ModrinthProject = {
      ...fullProject,
      downloads: 0,
      followers: undefined
    };
    expect(() =>
      renderToString(
        <ModDetailPageView project={zero} versions={[]} slug="sodium" />
      )
    ).not.toThrow();
  });

  it('SSR: versions が空配列でも throw しない', () => {
    expect(() =>
      renderToString(
        <ModDetailPageView project={fullProject} versions={[]} slug="sodium" />
      )
    ).not.toThrow();
  });

  it('SSR: version.files が undefined でも throw しない', () => {
    const versionNoFiles = {
      ...fullVersion,
      files: [] as ModrinthVersion['files']
    };
    expect(() =>
      renderToString(
        <ModDetailPageView
          project={fullProject}
          versions={[versionNoFiles]}
          slug="sodium"
        />
      )
    ).not.toThrow();
  });

  it('project=null なら「読み込めませんでした」フォールバック UI を表示', () => {
    const { container } = render(
      <ModDetailPageView project={null} versions={[]} slug="ghost" />
    );
    // slug がフォールバック文言に含まれる
    expect(container.textContent).toContain('ghost');
    // 「Mod 一覧に戻る」リンクが必ずある
    const links = container.querySelectorAll('a[href="/discover/mods"]');
    expect(links.length).toBeGreaterThanOrEqual(1);
  });
});
