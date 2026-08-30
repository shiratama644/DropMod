/**
 * lib/env/analysis.ts test (Phase 11-B / PHASE11_PLAN.md §10.4)
 *
 * ImportAnalysis fixture を直接構築して検証エンジン (analyzeImportHealth)
 * の各チェックを検証する (pure function、API 不要)。
 */

import { describe, it, expect } from 'vitest';
import { analyzeImportHealth } from '@/lib/env/analysis';
import type { ImportAnalysis } from '@/features/env-import/analyzer';
import type { ModrinthVersion, ProjectItem } from '@/types';

function makeVersion(overrides: Partial<ModrinthVersion> = {}): ModrinthVersion {
  return {
    id: 'ver-1',
    project_id: 'proj-1',
    author_id: 'a',
    featured: true,
    name: 'v',
    version_number: '1.0.0',
    date_published: '2026-01-01T00:00:00Z',
    downloads: 1,
    version_type: 'release',
    files: [],
    game_versions: ['1.21.1'],
    loaders: ['fabric'],
    dependencies: [],
    ...overrides
  };
}

function makeItem(overrides: Partial<ProjectItem> = {}): ProjectItem {
  return {
    projectId: 'proj-1',
    name: 'Sodium',
    type: 'mod',
    ...overrides
  };
}

function makeAnalysis(overrides: Partial<ImportAnalysis> = {}): ImportAnalysis {
  return {
    environment: {
      rootType: 'official',
      mcVersion: '1.21.1',
      loader: 'Fabric',
      loaderVersion: '0.16.0',
      contentDirs: { mods: 'mods' }
    },
    sourceKind: 'filesystem',
    sourceName: '.minecraft',
    mods: [],
    resourcepacks: [],
    shaderpacks: [],
    unknownFiles: [],
    scannedCounts: { mods: 0, resourcepacks: 0, shaderpacks: 0 },
    versionsByProject: new Map(),
    ...overrides
  };
}

function issueOf(issues: ReturnType<typeof analyzeImportHealth>, id: string) {
  return issues.find((i) => i.id === id);
}

describe('analyzeImportHealth', () => {
  it('全項目 OK の基本ケース', () => {
    const analysis = makeAnalysis({
      mods: [makeItem()],
      versionsByProject: new Map([['proj-1', makeVersion()]])
    });
    const issues = analyzeImportHealth(analysis);
    expect(issues).toHaveLength(6);
    for (const i of issues) {
      expect(i.status).toBe('ok');
    }
    expect(issueOf(issues, 'mc-compatibility')?.message).toContain('1.21.1');
    expect(issueOf(issues, 'loader-compatibility')?.message).toContain('Fabric');
  });

  it('環境未検出時はスキップ扱い (ok)', () => {
    const issues = analyzeImportHealth(
      makeAnalysis({ environment: { rootType: 'generic', contentDirs: {} } })
    );
    expect(issueOf(issues, 'mc-compatibility')?.status).toBe('ok');
    expect(issueOf(issues, 'mc-compatibility')?.message).toContain('スキップ');
    expect(issueOf(issues, 'loader-compatibility')?.status).toBe('ok');
  });

  it('MC バージョン非対応の Mod は warning + 対象名を details に', () => {
    const analysis = makeAnalysis({
      mods: [makeItem({ name: 'Old Mod', projectId: 'proj-old' })],
      versionsByProject: new Map([
        ['proj-old', makeVersion({ id: 'ver-old', project_id: 'proj-old', game_versions: ['1.12.2'] })]
      ])
    });
    const mc = issueOf(analyzeImportHealth(analysis), 'mc-compatibility');
    expect(mc?.status).toBe('warning');
    expect(mc?.details).toContain('Old Mod');
  });

  it('Loader 非対応の Mod は error (計画書 §5: Loader 不一致をエラー提示)', () => {
    const analysis = makeAnalysis({
      mods: [makeItem({ name: 'ForgeOnly', projectId: 'proj-forge' })],
      versionsByProject: new Map([
        ['proj-forge', makeVersion({ id: 'ver-f', project_id: 'proj-forge', loaders: ['forge'] })]
      ])
    });
    const loader = issueOf(analyzeImportHealth(analysis), 'loader-compatibility');
    expect(loader?.status).toBe('error');
    expect(loader?.details).toContain('ForgeOnly');
  });

  it('resourcepacks / shaderpacks は Loader 互換チェックの対象外', () => {
    const analysis = makeAnalysis({
      resourcepacks: [
        makeItem({ projectId: 'proj-rp', name: 'Fresh', type: 'resourcepack' })
      ],
      versionsByProject: new Map([
        ['proj-rp', makeVersion({ id: 'ver-rp', project_id: 'proj-rp', loaders: ['minecraft'] })]
      ])
    });
    expect(issueOf(analyzeImportHealth(analysis), 'loader-compatibility')?.status).toBe('ok');
  });

  it('必須依存の不足は error、incompatible の併存は conflict error', () => {
    const analysis = makeAnalysis({
      mods: [
        makeItem({ projectId: 'proj-a', name: 'A' }),
        makeItem({ projectId: 'proj-b', name: 'B' })
      ],
      versionsByProject: new Map([
        [
          'proj-a',
          makeVersion({
            id: 'ver-a',
            project_id: 'proj-a',
            dependencies: [
              { project_id: 'proj-missing', dependency_type: 'required' },
              { project_id: 'proj-b', dependency_type: 'incompatible' }
            ]
          })
        ],
        ['proj-b', makeVersion({ id: 'ver-b', project_id: 'proj-b' })]
      ])
    });
    const issues = analyzeImportHealth(analysis);
    const missing = issueOf(issues, 'missing-dependency');
    expect(missing?.status).toBe('error');
    expect(missing?.details).toEqual(['A → proj-missing']);
    const conflict = issueOf(issues, 'conflict');
    expect(conflict?.status).toBe('error');
    expect(conflict?.details).toEqual(['A × proj-b']);
  });

  it('依存は slug 一致でも解決済みとみなす', () => {
    const analysis = makeAnalysis({
      mods: [
        makeItem({ projectId: 'proj-a', name: 'A' }),
        makeItem({ projectId: 'proj-c', name: 'C', slug: 'cloth-config' })
      ],
      versionsByProject: new Map([
        [
          'proj-a',
          makeVersion({
            id: 'ver-a',
            project_id: 'proj-a',
            dependencies: [{ project_id: 'cloth-config', dependency_type: 'required' }]
          })
        ]
      ])
    });
    expect(issueOf(analyzeImportHealth(analysis), 'missing-dependency')?.status).toBe('ok');
  });

  it('未識別ファイルは warning (件数 + パス)', () => {
    const analysis = makeAnalysis({
      unknownFiles: [
        {
          id: 'u1',
          location: 'mods',
          filename: 'custom.jar',
          path: 'mods/custom.jar',
          sha1: 'x',
          size: 1,
          discoveredAt: 1
        }
      ]
    });
    const unknown = issueOf(analyzeImportHealth(analysis), 'unknown-files');
    expect(unknown?.status).toBe('warning');
    expect(unknown?.details).toEqual(['mods/custom.jar']);
  });

  it('shaderpacks があるのに Iris / OptiFine が無いと warning', () => {
    const analysis = makeAnalysis({
      shaderpacks: [
        makeItem({ projectId: 'proj-sh', name: 'Complementary', type: 'shader' })
      ]
    });
    const shader = issueOf(analyzeImportHealth(analysis), 'shader-prerequisite');
    expect(shader?.status).toBe('warning');
    expect(shader?.message).toContain('Iris');
  });

  it('Iris が mods にあれば shader 前提は ok', () => {
    const analysis = makeAnalysis({
      mods: [makeItem({ projectId: 'proj-iris', name: 'Iris', slug: 'iris' })],
      shaderpacks: [makeItem({ projectId: 'proj-sh', name: 'Complementary', type: 'shader' })]
    });
    expect(issueOf(analyzeImportHealth(analysis), 'shader-prerequisite')?.status).toBe('ok');
  });
});
